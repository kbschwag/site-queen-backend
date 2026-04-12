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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Score this business lead for a done-for-you website service. Return ONLY a JSON object with "score" (0-100) and "temperature" (HOT, WARM, or COLD).

Business: ${app.business_name}
Type: ${app.business_type}
Location: ${app.city_state}
Years in business: ${app.years_in_business}
Monthly clients: ${app.monthly_clients}
Monthly revenue: ${app.monthly_revenue}
Decision maker: ${app.is_decision_maker}
Has website: ${app.has_website}
Website goal: ${app.website_goal || "N/A"}
Brand vibe: ${app.brand_vibe || "N/A"}
Has logo: ${app.has_logo || "N/A"}
Plan interest: ${app.plan_interest || "N/A"}
Commitment: ${app.accepts_commitment || "N/A"}

Scoring criteria:
- Higher revenue & clients = higher score
- Decision maker = +15 points
- More years in business = more stable
- Having a clear website goal = +10
- Accepting commitment = +10
- HOT = score >= 70, WARM = 40-69, COLD = < 40`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a lead scoring assistant. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "score_lead",
            description: "Score a business lead",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: "Score 0-100" },
                temperature: { type: "string", enum: ["HOT", "WARM", "COLD"] },
              },
              required: ["score", "temperature"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_lead" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      // Fallback scoring
      let score = 50;
      if (app.is_decision_maker) score += 15;
      if (app.monthly_revenue === "$10k+") score += 15;
      if (app.accepts_commitment === "yes") score += 10;
      const temperature = score >= 70 ? "HOT" : score >= 40 ? "WARM" : "COLD";

      await supabase.from("applications").update({ ai_score: score, lead_temperature: temperature }).eq("id", applicationId);
      return new Response(JSON.stringify({ score, temperature, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let score = 50;
    let temperature = "WARM";

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      score = parsed.score;
      temperature = parsed.temperature;
    }

    await supabase.from("applications").update({
      ai_score: score,
      lead_temperature: temperature,
    }).eq("id", applicationId);

    return new Response(JSON.stringify({ score, temperature }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-lead error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
