import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { applicationId } = await req.json();
    if (!applicationId) {
      return new Response(JSON.stringify({ error: "applicationId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: app, error: fetchErr } = await supabase
      .from("applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (fetchErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already declined — skip
    if (app.status === "declined") {
      return new Response(JSON.stringify({ score: 0, temperature: "COLD", skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Analyze this business application for a done-for-you website service. Return ONLY a JSON object via the tool call.

Application:
- Business: ${app.business_name} (type: ${app.business_type})
- Industry: ${app.industry || "N/A"}
- Location: ${[app.city, app.state_province, app.country].filter(Boolean).join(", ") || "N/A"}
- Instagram: ${app.business_instagram || "N/A"}
- Facebook: ${app.business_facebook || "N/A"}
- Ideal customer: ${app.ideal_customer || "N/A"}
- Google search terms they expect: ${app.google_search_terms || "N/A"}
- Website goal: ${app.website_goal || "N/A"}
- Has logo: ${app.has_logo || "N/A"}
- Support level: ${app.support_level || "N/A"}
- Readiness: ${app.readiness || "N/A"}
- Restricted niches: ${app.restricted_niches || "None"}
- Anything else: ${app.anything_else || "None"}
- Referral source: ${app.referral_source || "N/A"}

The client-side score is ${app.ai_score}/15. Temperature is ${app.lead_temperature}.

Tasks:
1. Analyze the free-text fields (ideal_customer, google_search_terms, anything_else) for sentiment. If aggressive, rude, demanding, abusive, or contains profanity, flag for instant decline.
2. Check if they appear to be a web designer / agency / reseller (white label concern) — phrases like "for my clients", "white label", "agency", etc.
3. Check if the tone seems suspicious or low-quality.
4. Provide a refined score (0-15) and temperature thresholds: HOT >= 10, WARM 6-9, COLD < 6.

Return via the tool call.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a lead qualification assistant. Always respond by calling the analyze_application tool." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_application",
            description: "Analyze a business application",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: "Score 0-15" },
                temperature: { type: "string", enum: ["HOT", "WARM", "COLD"] },
                sentiment: { type: "string", enum: ["positive", "neutral", "negative", "aggressive"] },
                flags: { type: "array", items: { type: "string" } },
                should_decline: { type: "boolean" },
                needs_review: { type: "boolean" },
              },
              required: ["score", "temperature", "sentiment", "flags", "should_decline", "needs_review"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_application" } },
      }),
    });

    let finalScore = app.ai_score || 0;
    let finalTemperature = app.lead_temperature || "WARM";
    let finalStatus = app.status || "pending";
    let notes = app.notes || "";

    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        finalScore = parsed.score;
        finalTemperature = parsed.temperature;

        if (parsed.should_decline && parsed.sentiment === "aggressive") {
          finalStatus = "declined";
          notes = [notes, "AI: Declined due to aggressive/rude tone"].filter(Boolean).join("; ");
        } else if (parsed.needs_review || (parsed.flags && parsed.flags.length > 0)) {
          if (finalStatus !== "declined") finalStatus = "needs_review";
          notes = [notes, `AI FLAGS: ${parsed.flags.join(", ")}`].filter(Boolean).join("; ");
        }
      }
    } else {
      console.error("AI error:", aiResponse.status, await aiResponse.text());
    }

    await supabase.from("applications").update({
      ai_score: finalScore,
      lead_temperature: finalTemperature,
      status: finalStatus,
      notes,
    }).eq("id", applicationId);

    return new Response(JSON.stringify({ score: finalScore, temperature: finalTemperature, status: finalStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("score-lead error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
