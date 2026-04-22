import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check — require valid JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authCheck = createClient(supabaseUrl, supabaseKey);
  const { data: { user: caller }, error: authErr } = await authCheck.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

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

    // Photo handling — decide if we're using client photos or stock
    const usingStockPhotos = !!(siteData as any).using_stock_photos;

    // Industry → Unsplash search keywords
    const INDUSTRY_PHOTO_TERMS: Record<string, string[]> = {
      trades_contractors: ["plumber", "electrician", "contractor", "tools", "construction"],
      wellness_beauty: ["salon", "spa", "beauty", "hair", "wellness"],
      professional_services: ["office", "business", "professional", "consulting", "meeting"],
      food_hospitality: ["restaurant", "food", "cafe", "cooking", "dining"],
      retail_products: ["retail", "products", "shopping", "store", "merchandise"],
      creative_photography: ["photography", "creative", "studio", "camera", "art"],
      health_fitness: ["fitness", "gym", "workout", "health", "exercise"],
      education_coaching: ["coaching", "education", "teaching", "learning", "mentoring"],
      other: ["business", "professional", "office", "work", "service"],
    };

    // Collect uploaded client photo URLs (if any)
    const clientPhotoUrls: string[] = [];
    const id = intakeData || {};
    if (id.hero_photo_url) clientPhotoUrls.push(id.hero_photo_url);
    if (id.owner_photo_url) clientPhotoUrls.push(id.owner_photo_url);
    for (const arr of [id.portfolio_photos, id.team_photos, id.location_photos, id.extra_photos, id.award_logos]) {
      if (Array.isArray(arr)) for (const u of arr) if (u) clientPhotoUrls.push(u);
    }
    for (const s of id.services || []) if (s.photo_url) clientPhotoUrls.push(s.photo_url);
    for (const m of id.team_members || []) if (m.photo_url) clientPhotoUrls.push(m.photo_url);
    for (const t of id.testimonials || []) if (t.photo_url) clientPhotoUrls.push(t.photo_url);
    for (const p of id.custom_pages || []) if (Array.isArray(p.photos)) for (const u of p.photos) if (u) clientPhotoUrls.push(u);

    const businessTypeKey = (clientData?.business_type || "other").toLowerCase().replace(/[\s-]/g, "_");
    const photoKeywords = INDUSTRY_PHOTO_TERMS[businessTypeKey] || INDUSTRY_PHOTO_TERMS.other;

    // Optional Unsplash API enrichment — pre-fetch a handful of relevant images so Claude can use real URLs
    const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY");
    const unsplashPhotos: { keyword: string; url: string; alt: string; credit: string }[] = [];
    if (usingStockPhotos && UNSPLASH_ACCESS_KEY) {
      for (const kw of photoKeywords) {
        try {
          const r = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(kw)}&per_page=4&orientation=landscape`,
            { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
          );
          if (r.ok) {
            const j = await r.json();
            for (const p of (j.results || []).slice(0, 4)) {
              unsplashPhotos.push({
                keyword: kw,
                url: p.urls?.regular || p.urls?.full,
                alt: p.alt_description || kw,
                credit: `Photo by ${p.user?.name || "Unsplash"} on Unsplash`,
              });
            }
          }
        } catch (e) {
          console.warn(`Unsplash fetch failed for "${kw}":`, e);
        }
      }
    }

    const photoSection = usingStockPhotos
      ? `

PHOTO HANDLING — STOCK PHOTOGRAPHY:
No client photos were provided. Source all images from Unsplash.
Use these industry-specific keywords for this client's business type (${clientData?.business_type || "general"}): ${photoKeywords.join(", ")}.

${unsplashPhotos.length > 0 ? `
Pre-curated Unsplash photos you may use directly (preferred — these are real, working URLs):
${unsplashPhotos.map((p) => `- "${p.keyword}": ${p.url} (alt: ${p.alt}; ${p.credit})`).join("\n")}
` : `
Use the Unsplash source URL format as a fallback: https://source.unsplash.com/800x600/?[keyword]
Examples:
- Hero image: https://source.unsplash.com/1200x800/?${photoKeywords[0]}
- Service image: https://source.unsplash.com/800x600/?${photoKeywords[1] || photoKeywords[0]}
- Team placeholder: https://source.unsplash.com/400x400/?professional
`}
Every image in the site must have a relevant photo. The site must look completely professional. Choose keywords carefully to match the business type, tone, and vibe described in the intake form and call notes.`
      : `

PHOTO HANDLING — CLIENT-PROVIDED PHOTOS:
The client uploaded ${clientPhotoUrls.length} photo${clientPhotoUrls.length === 1 ? "" : "s"} stored in our system. Use these real client photos throughout the site:
${clientPhotoUrls.map((u, i) => `- ${i + 1}. ${u}`).join("\n")}

${id.hero_photo_url ? `Hero image (use as the main hero): ${id.hero_photo_url}` : ""}
Place portfolio photos in galleries/services, team photos in about/team sections, location photos in contact sections.
Only use Unsplash stock photos for sections where no client photo was provided. If you need stock fallback use keywords: ${photoKeywords.join(", ")}.`;

    // Fetch call notes via application_id from the client record
    const applicationId = clientData?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase
          .from("call_notes")
          .select("*")
          .eq("application_id", applicationId)
          .maybeSingle()
      : { data: null };

    if (!intakeData && !callNotes) throw new Error("No intake data or call notes found");

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

    // Build call notes section for prompt
    const callNotesSection = callNotes ? `

SOURCE 2 — DISCOVERY CALL NOTES (expert observations from our designer who spoke with the client on a call — THIS IS MORE VALUABLE THAN THE INTAKE FORM):
${JSON.stringify({
  their_story: callNotes.their_story,
  ideal_customer: callNotes.ideal_customer,
  inspiration_sites: callNotes.inspiration_sites,
  instagram_handle: callNotes.instagram_handle,
  google_search_terms: callNotes.google_search_terms,
  website_goal: callNotes.website_goal,
  contact_preferences: callNotes.contact_preferences,
  booking_url: callNotes.booking_url,
  pages_agreed: callNotes.pages_agreed,
  template_selected: callNotes.template_selected,
  color_direction: callNotes.color_direction,
  vibe_notes: callNotes.vibe_notes,
  tone_of_voice: callNotes.tone_of_voice,
  tone_custom: callNotes.tone_custom,
  expert_additions: callNotes.expert_additions,
  expert_avoid: callNotes.expert_avoid,
  exact_phrases: callNotes.exact_phrases,
  final_notes: callNotes.final_notes,
}, null, 2)}

CRITICAL INSTRUCTIONS FOR CALL NOTES:
- The call notes from our designer carry MORE WEIGHT than the client's self-reported intake form
- Pay special attention to expert_additions — include ALL elements the designer requested
- Pay special attention to expert_avoid — these are things you must NOT do
- Use exact_phrases — weave these exact words naturally into headlines and copy
- website_goal determines the entire hierarchy and structure — build around this goal
- pages_agreed overrides the client's page selection — build exactly these pages
- Match tone_of_voice exactly — this is how they actually communicate` : `

No discovery call notes available — use intake form data only.`;

    const brandingInstructions = `
BRANDING INSTRUCTIONS:
- PRIMARY_COLOR: Use the client's brand color from their intake form or call notes. If none provided, choose a color appropriate for their industry — trades: deep red or navy, wellness: sage green or blush, professional: navy or charcoal, food: warm orange or terracotta
- ACCENT_COLOR: Choose a complementary accent. If primary is dark use a warm gold or bright contrasting color. If primary is light use a deep complementary tone.
- DARK_COLOR: Default to #0d1d3b unless client has a specific dark brand color
- FONT_HEADING: Choose from these Google Fonts based on their brand personality — bold/trades: Oswald or Bebas Neue, professional: Montserrat or Raleway, warm/friendly: Nunito or Poppins, luxury: Cormorant or Playfair Display
- FONT_BODY: Always pair with Open Sans, Inter, or Lato for readability
`;

    const missingDataInstructions = `
MISSING DATA INSTRUCTIONS — handle gracefully, never leave a placeholder visible:

If HERO_BADGE is missing: use "TRUSTED LOCAL EXPERTS" or "SERVING [CITY] SINCE [YEAR]"
If HERO_HEADLINE_LINE2 or LINE3 is missing: restructure the headline to work on 1-2 lines without gaps
If ABOUT_IMAGE_URL is missing: use a relevant Unsplash image for their industry
If WHY_US_IMAGE_URL is missing: use a relevant Unsplash image
If EMERGENCY_BG_URL is missing: use a dark overlay without background image — it still looks great
If GOOGLE_RATING is missing: remove the rating display entirely rather than showing empty stars
If GOOGLE_REVIEW_COUNT is missing: remove the review count
If MAP_EMBED_URL is missing: replace the map section with a styled text list of service areas only
If SHOW_COUPONS is false or missing: remove the entire coupons section
If SHOW_FINANCING is false or missing: remove the financing banner
If SHOW_AWARDS is false or missing: remove the awards section
If FAQ_ITEMS has fewer than 3 items: generate 3 relevant FAQs based on their industry and services
If TESTIMONIALS has fewer than 3: generate 2-3 realistic sounding testimonials based on their services and location — use realistic first names and neighborhood names from their city
If SERVICE_AREA_LOCATIONS is empty: use the client's city and 6-8 nearby suburbs based on their location
If FOOTER_NEWSLETTER_TEXT is missing: use "Monthly tips and exclusive deals for [city] homeowners"
If COPYRIGHT_YEAR is missing: use the current year
If INSTAGRAM_URL or FACEBOOK_URL are missing: remove those social links rather than showing broken links

For any placeholder that has no data and no sensible default — remove that element entirely. Never show a visible placeholder, empty bracket, or broken section to the end user. The site must look complete and intentional even with minimal data.
`;

    if (templateHTML) {
      prompt = `You are a professional web developer building a website for a small business client.

You have two sources of information:

SOURCE 1 — CLIENT INTAKE FORM (what the client told us directly):
${JSON.stringify(intakeData, null, 2)}
${callNotesSection}
${photoSection}

Here is the HTML template with placeholders in double curly braces:
${templateHTML}

Here is the CSS template with color variables as placeholders:
${templateCSS}
${brandingInstructions}
${missingDataInstructions}

Your instructions:
1. Replace every {{PLACEHOLDER}} with the corresponding client data
2. For repeatable sections marked {{#SECTION}} and {{/SECTION}} generate one block per item in the data array
3. If any placeholder has no data use a professional sensible default appropriate for their business type — follow the MISSING DATA INSTRUCTIONS above precisely
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
      prompt = `You are a professional web designer building a website for a small business client.

You have two sources of information:

SOURCE 1 — CLIENT INTAKE FORM (what the client told us directly):
${JSON.stringify(intakeData, null, 2)}

Business name: ${clientData?.business_name || "Business"}
Business type: ${clientData?.business_type || "Service Business"}
${callNotesSection}
${photoSection}
${brandingInstructions}
${missingDataInstructions}

Your instructions:
1. Create a complete, production-ready single-page website with HTML and CSS
2. Include sections: Hero with CTA, About/Story, Services, Testimonials (if provided), Contact, Footer
3. Use their brand colors, fonts, and style preferences from the intake data — apply the BRANDING INSTRUCTIONS above for any missing color or font choices
4. Generate compelling professional copy for all sections based on their business answers
5. Make all phone numbers click-to-call links
6. Make all email addresses mailto links
7. Make all social media links open in a new tab
8. The site MUST be fully responsive and mobile-first
9. Use modern CSS (flexbox, grid, custom properties)
10. Include smooth scroll behavior and clean typography
11. Follow the MISSING DATA INSTRUCTIONS above — never show empty placeholders or broken sections
12. Return ONLY a valid JSON object with exactly two fields:
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

    // Inject analytics tracking script before </body>
    const trackingScript = `
<!-- SiteQueen Analytics -->
<script>
(function(){
  var CID='${clientId}';
  var EP='${supabaseUrl}/functions/v1/track-event';
  function dt(){return /Mobile|Android|iPhone/i.test(navigator.userAgent)?'mobile':'desktop'}
  function sid(){var s=sessionStorage.getItem('sq_sid');if(!s){s=Math.random().toString(36).substr(2,9);sessionStorage.setItem('sq_sid',s)}return s}
  function t(e,m){fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CID,event_type:e,page_path:location.pathname,page_title:document.title,referrer:document.referrer,device_type:dt(),session_id:sid(),metadata:m||{}})}).catch(function(){})}
  t('page_view');
  document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;if(a.href&&a.href.indexOf('tel:')===0)t('phone_click',{phone:a.href});if(a.href&&a.href.indexOf('mailto:')===0)t('email_click',{email:a.href});if(a.classList.contains('cta-button')||a.classList.contains('btn-primary'))t('cta_click',{text:a.textContent.trim()})});
  document.addEventListener('submit',function(e){t('form_submission',{form_id:e.target.id||'contact-form'})});
})();
</script>`;
    if (finalHTML.includes("</body>")) {
      finalHTML = finalHTML.replace("</body>", `${trackingScript}\n</body>`);
    } else {
      finalHTML += trackingScript;
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
