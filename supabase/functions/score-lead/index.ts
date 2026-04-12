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

    // If already declined, skip scoring
    if (app.status === "declined") {
      return new Response(JSON.stringify({ score: 0, temperature: "COLD", skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Use AI to analyze the additional_notes field for sentiment and flag detection
    const prompt = `Analyze this business application for a done-for-you website service. Return ONLY a JSON object.

Application data:
- Business: ${app.business_name} (${app.business_type})
- Industry: ${app.industry || "N/A"}
- Location: ${[app.city, app.state_province, app.country].filter(Boolean).join(", ") || app.city_state || "N/A"}
- Years in business: ${app.years_in_business}
- Monthly clients: ${app.monthly_clients}
- Decision maker: ${app.decision_maker_status || (app.is_decision_maker ? "yes" : "no")}
- Has website: ${app.has_website}
- Website goal: ${app.website_goal || "N/A"}
- Brand vibe: ${app.brand_vibe || "N/A"}
- Has logo: ${app.has_logo || "N/A"}
- Plan interest: ${app.plan_interest || "N/A"}
- Commitment: ${app.accepts_commitment || "N/A"}
- Update frequency: ${app.update_frequency || "N/A"}
- Restricted niches: ${app.restricted_niches || "None"}
- Additional notes: ${app.additional_notes || "None"}

The client-side score is ${app.ai_score}/24. Temperature is ${app.lead_temperature}.

Tasks:
1. Analyze the "additional notes" for sentiment: is the tone aggressive, rude, demanding, or disrespectful? If so, flag for instant decline.
2. Check if the applicant mentions being a web designer, agency, or wanting to use the service for their own clients (white label concern).
3. Check if the tone seems suspicious, unclear, or unusual.
4. Provide a refined score (0-24) and temperature (HOT, WARM, COLD).

Return JSON with: score (number 0-24), temperature (HOT/WARM/COLD), sentiment (positive/neutral/negative/aggressive), flags (array of strings like "aggressive_tone", "potential_white_label", "suspicious_tone"), should_decline (boolean), needs_review (boolean)`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a lead qualification assistant. Return only valid JSON." },
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
                score: { type: "number", description: "Score 0-24" },
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
        } else if (parsed.needs_review || parsed.flags?.length > 0) {
          if (finalStatus !== "declined") finalStatus = "needs_review";
          notes = [notes, `AI FLAGS: ${parsed.flags.join(", ")}`].filter(Boolean).join("; ");
        }
      }
    } else {
      console.error("AI error:", aiResponse.status, await aiResponse.text());
      // Keep client-side score as fallback
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
  } catch (e) {
    console.error("score-lead error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
