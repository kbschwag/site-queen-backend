import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let clientId: string | null = null;

  try {
    const body = await req.json();
    clientId = body.client_id;
    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to generating
    await supabase
      .from("sites")
      .update({ generation_status: "generating" })
      .eq("client_id", clientId);

    // Fetch client + site data
    const { data: siteData, error: siteError } = await supabase
      .from("sites")
      .select("*")
      .eq("client_id", clientId)
      .single();

    if (siteError || !siteData) throw new Error("Site record not found");

    const { data: clientData } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    const intakeData = siteData.intake_data;
    if (!intakeData) throw new Error("No intake data found");

    // Try to fetch template if template_id exists
    let templateHTML = "";
    let templateCSS = "";
    const templateId = (intakeData as any).template_id;

    if (templateId) {
      try {
        const { data: htmlFile } = await supabase.storage
          .from("templates")
          .download(`${templateId}.html`);
        if (htmlFile) templateHTML = await htmlFile.text();

        const { data: cssFile } = await supabase.storage
          .from("templates")
          .download(`${templateId}.css`);
        if (cssFile) templateCSS = await cssFile.text();
      } catch {
        console.log("No template files found, generating from scratch");
      }
    }

    // Build the AI prompt
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let prompt: string;

    if (templateHTML) {
      prompt = `You are a professional web developer building a website for a small business client.

Here is the HTML template with placeholders in double curly braces:
${templateHTML}

Here is the CSS template with color variables as placeholders:
${templateCSS}

Here is the client's complete business data from their intake form:
${JSON.stringify(intakeData, null, 2)}

Your instructions:
1. Replace every {{PLACEHOLDER}} with the corresponding client data
2. For repeatable sections marked {{#SECTION}} and {{/SECTION}} generate one block per item in the data array
3. If any placeholder has no data use a professional sensible default appropriate for their business type
4. Generate compelling professional copy for headlines and descriptions based on their business answers
5. Make all phone numbers click-to-call links
6. Make all email addresses mailto links
7. Make all social media links open in a new tab
8. Make sure the site is fully responsive and mobile perfect
9. Do not change any layout structure or design elements — only replace content and colors
10. Return ONLY a valid JSON object with exactly two fields:
    - "html": the complete finished HTML as a single string
    - "css": the complete finished CSS as a single string
Do not include any explanation, markdown formatting, or code blocks. Return raw JSON only.`;
    } else {
      prompt = `You are a professional web developer. Build a complete, beautiful, modern single-page website for a small business.

Here is the client's complete business data from their intake form:
${JSON.stringify(intakeData, null, 2)}

Business name: ${clientData?.business_name || "Business"}
Business type: ${clientData?.business_type || "Service Business"}

Your instructions:
1. Create a complete, production-ready single-page website with HTML and CSS
2. Include sections: Hero with CTA, About/Story, Services, Testimonials (if provided), Contact, Footer
3. Use their brand colors, fonts, and style preferences from the intake data
4. Generate compelling professional copy for all sections based on their business answers
5. Make all phone numbers click-to-call links
6. Make all email addresses mailto links
7. Make all social media links open in a new tab
8. The site MUST be fully responsive and mobile-first
9. Use modern CSS (flexbox, grid, custom properties)
10. Include smooth scroll behavior and clean typography
11. Return ONLY a valid JSON object with exactly two fields:
    - "html": the complete finished HTML as a single string (include CSS in a <style> tag in the head, or link to styles.css)
    - "css": the complete finished CSS as a single string
Do not include any explanation, markdown formatting, or code blocks. Return raw JSON only.`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response (handle possible markdown wrapping)
    let generatedSite: { html: string; css: string };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      generatedSite = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", rawText.substring(0, 500));
      throw new Error("Failed to parse generated website code");
    }

    if (!generatedSite.html) throw new Error("AI response missing html field");

    // Inline CSS into the HTML so the staging page is fully self-contained
    let finalHTML = generatedSite.html;
    if (generatedSite.css) {
      if (finalHTML.includes("</head>")) {
        finalHTML = finalHTML.replace("</head>", `<style>${generatedSite.css}</style>\n</head>`);
      } else if (finalHTML.includes("<body")) {
        finalHTML = finalHTML.replace("<body", `<style>${generatedSite.css}</style>\n<body`);
      } else {
        finalHTML = `<style>${generatedSite.css}</style>\n${finalHTML}`;
      }
      // Remove any external stylesheet link to styles.css
      finalHTML = finalHTML.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/gi, "");
    }

    // Store generated HTML in Supabase storage
    const htmlBlob = new Blob([finalHTML], { type: "text/html" });
    await supabase.storage
      .from("generated-sites")
      .upload(`${clientId}/index.html`, htmlBlob, { upsert: true });

    // Get public staging URL
    const { data: stagingURLData } = supabase.storage
      .from("generated-sites")
      .getPublicUrl(`${clientId}/index.html`);

    const stagingURL = stagingURLData.publicUrl;

    // Update sites table
    await supabase
      .from("sites")
      .update({
        generation_status: "complete",
        generated_at: new Date().toISOString(),
        staging_url: stagingURL,
      })
      .eq("client_id", clientId);

    // Create operator notification
    await supabase.from("notifications").insert({
      type: "site_ready_for_review",
      client_id: clientId,
      message: `${clientData?.business_name || "Client"} website is ready for your review`,
      staging_url: stagingURL,
      target_role: "operator",
    });

    // Log generation
    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: templateId || "scratch",
      status: "complete",
      tokens_used: aiData.usage?.total_tokens || null,
    });

    return new Response(JSON.stringify({ success: true, staging_url: stagingURL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-website error:", error);

    if (clientId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        await supabase
          .from("sites")
          .update({
            generation_status: "failed",
            generation_error: error.message,
          })
          .eq("client_id", clientId);

        await supabase.from("notifications").insert({
          type: "site_generation_failed",
          client_id: clientId,
          message: `Site generation failed — manual review needed`,
          target_role: "operator",
        });

        await supabase.from("generation_logs").insert({
          client_id: clientId,
          status: "failed",
          error_message: error.message,
        });
      } catch (e) {
        console.error("Failed to update failure status:", e);
      }
    }

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
