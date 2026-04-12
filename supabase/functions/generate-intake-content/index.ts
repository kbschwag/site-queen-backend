import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, inputs } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    switch (type) {
      case "about":
        systemPrompt = "You are a professional website copywriter. Write a polished, warm, professional About Us section for a small business website. Write in second person about the business. Keep it 2-3 paragraphs, engaging and authentic. Do not use generic filler.";
        userPrompt = `Business: ${inputs.business_name}\nHow they started: ${inputs.started}\nWhat makes them different: ${inputs.different}\nIdeal customer: ${inputs.ideal_customer}\nProblem they solve: ${inputs.problem}`;
        break;
      case "bio":
        systemPrompt = "You are a professional website copywriter. Write a polished, warm professional bio for a business owner. Keep it 1-2 paragraphs. Make it personable and trustworthy.";
        userPrompt = `Name: ${inputs.name}\nTitle: ${inputs.title}\nAbout them: ${inputs.bio_raw}\nBusiness: ${inputs.business_name}`;
        break;
      case "service":
        systemPrompt = "You are a professional website copywriter. Write a compelling service description for a small business website. Keep it 2-3 sentences. Focus on benefits to the customer.";
        userPrompt = `Business: ${inputs.business_name}\nService: ${inputs.name}\nBasic description: ${inputs.description}`;
        break;
      case "services_intro":
        systemPrompt = "You are a professional website copywriter. Write a short intro paragraph (2-3 sentences) that goes above a services section on a website. Make it welcoming and professional.";
        userPrompt = `Business: ${inputs.business_name}\nServices offered: ${inputs.services}`;
        break;
      case "page":
        systemPrompt = "You are a professional website copywriter. Generate suggested content for a custom website page. Keep it professional, concise, and relevant. Use appropriate headings and sections.";
        userPrompt = `Business: ${inputs.business_name}\nPage: ${inputs.page_name}\nDescription of what they want: ${inputs.description}`;
        break;
      default:
        throw new Error("Unknown content type");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment and try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI generation failed");
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-intake-content error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
