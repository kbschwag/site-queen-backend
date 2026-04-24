import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";
const TIMEOUT_MS = 600_000; // 10 minutes per Claude call

const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let clientId = "";
  try {
    const body = await req.json();
    clientId = body.client_id;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
  }
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
  }

  try {
    // ── Bump attempt counter + status ────────────────────────────────────
    const { data: existingSite } = await supabase
      .from("sites")
      .select("generation_attempts")
      .eq("client_id", clientId)
      .maybeSingle();

    await supabase.from("sites").update({
      generation_status: "generating",
      generation_progress: "fetching_data",
      generation_attempts: ((existingSite as any)?.generation_attempts || 0) + 1,
      last_generation_attempt_at: new Date().toISOString(),
      generation_error: null,
    } as any).eq("client_id", clientId);

    // ── Fetch data ───────────────────────────────────────────────────────
    const { data: siteData, error: siteError } = await supabase
      .from("sites").select("*").eq("client_id", clientId).single();
    if (siteError || !siteData) throw new Error("Site record not found");

    const { data: clientData } = await supabase
      .from("clients").select("*").eq("id", clientId).single();

    const intake: any = (siteData as any).intake_data || {};

    await supabase.from("sites").update({
      intake_snapshot: intake,
      intake_snapshot_saved_at: new Date().toISOString(),
    } as any).eq("client_id", clientId);

    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    if (callNotes) {
      await supabase.from("sites").update({ call_notes_snapshot: callNotes } as any).eq("client_id", clientId);
    }

    // ── Load template ────────────────────────────────────────────────────
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero",
      professional: "professional",
      warm: "warm-welcome",
      local: "local-favorite",
      modern: "modern-business",
    };

    const selectedTemplate =
      intake?.template_selected ||
      (callNotes as any)?.template_selected ||
      intake?.template_id;

    const templateId = selectedTemplate
      ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate)
      : "trades-hero";

    const { data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}.html`);
    const { data: cssFile } = await supabase.storage.from("templates").download(`${templateId}.css`);
    if (!htmlFile) throw new Error(`Template not found: ${templateId}.html`);

    const templateHTML = await htmlFile.text();
    const templateCSS = cssFile ? await cssFile.text() : "";

    // ── Photos ───────────────────────────────────────────────────────────
    const usingStockPhotos = !!(siteData as any).using_stock_photos;
    const photoTerms = getPhotoSearchTerms(clientData, intake);

    let heroPhoto: any = null;
    let aboutPhoto: any = null;
    let whyUsPhoto: any = null;

    if (usingStockPhotos) {
      [heroPhoto, aboutPhoto, whyUsPhoto] = await Promise.all([
        fetchUnsplashPhoto(photoTerms.map((t: string) => `${t} wide`), 1920, 900),
        fetchUnsplashPhoto(photoTerms.map((t: string) => `${t} team`), 800, 600),
        fetchUnsplashPhoto(photoTerms.map((t: string) => `${t} professional`), 600, 700),
      ]);
    }

    const aboutImageUrl = intake.owner_photo_url || aboutPhoto?.url || "";
    const whyUsImageUrl = intake.hero_photo_url || whyUsPhoto?.url || "";
    const heroImageUrl = intake.hero_photo_url || heroPhoto?.url || "";

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

    // ── Business data shortcuts ──────────────────────────────────────────
    const businessName = (clientData as any)?.business_name || intake.business_name || "Business";
    const businessType = (clientData as any)?.business_type || "Service Business";
    const city = intake.business_city || "";
    const state = intake.business_state || "";
    const phone = intake.business_phone || "";
    const phoneRaw = phone.replace(/\D/g, "");
    const email = intake.business_email || "";
    const address = intake.business_address || "";
    const yearsInBusiness = intake.years_in_business || "";
    const googleRating = intake.google_rating || "";
    const googleReviewCount = intake.google_review_count || "";
    const aboutStory = intake.about_story || "";
    const tagline = intake.tagline || "";
    const mapEmbedUrl = intake.map_embed_url || "";
    const domain = intake.domain || "";

    const services: any[] = Array.isArray(intake.services) ? intake.services : [];
    const testimonials: any[] = Array.isArray(intake.testimonials) ? intake.testimonials : [];
    const faqItems: any[] = Array.isArray(intake.faq_items) ? intake.faq_items : [];
    const awards: any[] = Array.isArray(intake.awards) ? intake.awards : [];
    const coupons: any[] = Array.isArray(intake.coupons) ? intake.coupons : [];
    const serviceAreas: any[] = Array.isArray(intake.service_areas) ? intake.service_areas : [];

    const showFinancing = !!(callNotes as any)?.show_financing || !!intake.show_financing;
    const showCoupons = !!(callNotes as any)?.show_coupons || !!intake.show_coupons || coupons.length > 0;
    const showAwards = !!(callNotes as any)?.show_awards || awards.length > 0;

    // ── CALL 1: Generate copy as JSON ────────────────────────────────────
    const copyPrompt = `You are a professional copywriter for SiteQueen, a done-for-you website service. Generate copy for a ${businessType} website. This copy will be injected directly into a real client's website. Write for real business owners — specific, local, authentic.

BUSINESS INFORMATION:
- Business name: ${businessName}
- Business type: ${businessType}
- City: ${city}, ${state}
- Years in business: ${yearsInBusiness || "not provided"}
- Owner story: ${aboutStory || "not provided"}
- Services: ${services.map((s: any) => typeof s === "string" ? s : s?.name || "").filter(Boolean).join(", ") || "not provided"}
- Google rating: ${googleRating || "not provided"}
- Google review count: ${googleReviewCount || "not provided"}

CALL NOTES FROM OPERATOR — HIGHEST PRIORITY, follow these exactly:
${callNotes ? JSON.stringify({
  their_story: (callNotes as any).their_story,
  ideal_customer: (callNotes as any).ideal_customer,
  google_search_terms: (callNotes as any).google_search_terms,
  website_goal: (callNotes as any).website_goal,
  tone_of_voice: (callNotes as any).tone_of_voice,
  tone_custom: (callNotes as any).tone_custom,
  expert_additions: (callNotes as any).expert_additions,
  expert_avoid: (callNotes as any).expert_avoid,
  exact_phrases: (callNotes as any).exact_phrases,
  vibe_notes: (callNotes as any).vibe_notes,
  color_direction: (callNotes as any).color_direction,
  final_notes: (callNotes as any).final_notes,
}, null, 2) : "No call notes — use intake data only."}

TONE RULES:
- Follow call notes tone exactly. If not specified: trades = confident and direct, wellness = warm and nurturing, professional = polished and credible.
- Write like a real local business owner talking to a neighbor. Not a marketing agency.
- Use exact_phrases from call notes if provided.
- BANNED phrases: "we are committed to excellence", "your satisfaction is our priority", "we pride ourselves on", "world-class", "cutting-edge", "seamless experience".
- Every field must feel specific to THIS business and THIS city. Not generic.

COPY RULES:
- If data is missing, write a great professional default based on the business type and city.
- For testimonials: write realistic ones with names that sound local to ${city}. Reference the actual services this business offers.
- For FAQs: write questions a real customer of this specific business would actually ask.
- NEVER invent: phone numbers, addresses, license numbers, star ratings, review counts, years in business. If missing, leave as empty string "".

Return ONLY a valid JSON object. No markdown. No explanation. No code blocks. Start with { and end with }:

{
  "META_DESCRIPTION": "155 character SEO description mentioning business name, main service, and city",
  "HERO_BADGE": "3-5 word trust badge e.g. TRUSTED LOCAL EXPERTS",
  "HERO_HEADLINE_LINE1": "first line of headline 2-4 words all caps",
  "HERO_HEADLINE_HIGHLIGHT": "the core service 1-3 words all caps shown in accent color",
  "HERO_HEADLINE_LINE2": "second line 2-4 words all caps",
  "HERO_HEADLINE_LINE3": "third line 2-4 words all caps",
  "HERO_SUBHEADING": "1-2 sentences. What they do, where, why choose them. Specific.",
  "TRUST_ITEM_3": "one trust badge e.g. FAMILY OWNED or BBB ACCREDITED",
  "ABOUT_HEADLINE": "5-8 word about section headline",
  "ABOUT_STORY": "3-4 paragraphs. Personal, specific, compelling. Use owner story if provided. Reference years, city, what drives them.",
  "ABOUT_POINTS": [
    {"ABOUT_POINT": "key differentiator 1"},
    {"ABOUT_POINT": "key differentiator 2"},
    {"ABOUT_POINT": "key differentiator 3"},
    {"ABOUT_POINT": "key differentiator 4"}
  ],
  "STAT_1_NUMBER": "e.g. 500+",
  "STAT_1_LABEL": "e.g. JOBS COMPLETED",
  "STAT_2_NUMBER": "e.g. 4.9★",
  "STAT_2_LABEL": "e.g. GOOGLE RATING",
  "STAT_3_NUMBER": "e.g. 24/7",
  "STAT_3_LABEL": "e.g. EMERGENCY SERVICE",
  "STAT_4_NUMBER": "e.g. 100%",
  "STAT_4_LABEL": "e.g. SATISFACTION GUARANTEED",
  "SERVICES_HEADLINE": "3-5 word services headline all caps",
  "SERVICES_SUBTEXT": "1 sentence describing their range of services",
  "SERVICE_COPY": ${JSON.stringify(services.slice(0, 8).map((s: any) => {
    const name = typeof s === "string" ? s : s?.name || s?.title || "";
    return { name, description: "" };
  }))},
  "EMERGENCY_HEADLINE": "emergency section headline 4-6 words all caps e.g. PIPE BURST AT 2AM?",
  "EMERGENCY_SUBTEXT": "1-2 sentences about 24/7 availability. Reassuring and direct.",
  "WHY_US_HEADLINE": "4-7 word why choose us headline",
  "WHY_US_POINTS": [
    {"POINT_NUMBER": "01", "POINT_TITLE": "3-5 word reason title", "POINT_DESCRIPTION": "2 sentences specific to this business"},
    {"POINT_NUMBER": "02", "POINT_TITLE": "3-5 word reason title", "POINT_DESCRIPTION": "2 sentences specific to this business"},
    {"POINT_NUMBER": "03", "POINT_TITLE": "3-5 word reason title", "POINT_DESCRIPTION": "2 sentences specific to this business"},
    {"POINT_NUMBER": "04", "POINT_TITLE": "3-5 word reason title", "POINT_DESCRIPTION": "2 sentences specific to this business"}
  ],
  "HAPPY_CUSTOMERS": "number e.g. 500",
  "REVIEW_PLATFORMS": "e.g. Google and Facebook",
  "TESTIMONIALS": [
    {"TESTIMONIAL_TEXT": "2-3 sentence realistic testimonial referencing a specific service", "TESTIMONIAL_NAME": "local sounding full name", "TESTIMONIAL_LOCATION": "${city}, ${state}"},
    {"TESTIMONIAL_TEXT": "different realistic testimonial", "TESTIMONIAL_NAME": "different local name", "TESTIMONIAL_LOCATION": "nearby area"},
    {"TESTIMONIAL_TEXT": "third realistic testimonial", "TESTIMONIAL_NAME": "different local name", "TESTIMONIAL_LOCATION": "${city} area"}
  ],
  "SERVICE_AREAS_HEADLINE": "4-6 word service areas headline all caps",
  "SERVICE_AREA_LOCATIONS": [
    {"LOCATION_NAME": "${city}"},
    {"LOCATION_NAME": "nearby city 2"},
    {"LOCATION_NAME": "nearby city 3"},
    {"LOCATION_NAME": "nearby city 4"},
    {"LOCATION_NAME": "nearby city 5"},
    {"LOCATION_NAME": "nearby city 6"}
  ],
  "FAQ_ITEMS": [
    {"FAQ_QUESTION": "real customer question 1", "FAQ_ANSWER": "helpful specific answer"},
    {"FAQ_QUESTION": "real customer question 2", "FAQ_ANSWER": "helpful specific answer"},
    {"FAQ_QUESTION": "real customer question 3", "FAQ_ANSWER": "helpful specific answer"},
    {"FAQ_QUESTION": "real customer question 4", "FAQ_ANSWER": "helpful specific answer"},
    {"FAQ_QUESTION": "real customer question 5", "FAQ_ANSWER": "helpful specific answer"}
  ],
  "FINAL_CTA_HEADLINE": "5-8 word final CTA headline all caps compelling",
  "FINAL_CTA_SUBTEXT": "1-2 sentences urgency and reassurance drive them to call",
  "FOOTER_TAGLINE": "5-8 word brand tagline for footer",
  "FOOTER_NEWSLETTER_TEXT": "1 sentence inviting email signup",
  "FINANCING_HEADLINE": "financing section headline",
  "FINANCING_SUBTEXT": "financing offer details",
  "COUPONS_NOTE": "note about coupon terms",
  "SERVICE_AREAS_HEADLINE": "service areas section headline"
}`;

    console.log("[part1] Calling Claude for copy generation...");
    const copyResult = await callAI(ANTHROPIC_API_KEY, copyPrompt, "copy-generation");

    let copyData: any = {};
    try {
      copyData = JSON.parse(stripMarkdown(copyResult.text));
    } catch (e) {
      console.error("[part1] Failed to parse copy JSON:", e);
      console.error("[part1] Raw response:", copyResult.text.substring(0, 500));
      throw new Error("Claude returned invalid JSON for copy generation");
    }

    await supabase.from("sites").update({ generation_progress: "filling_template" } as any).eq("client_id", clientId);

    // ── Fill template with real data ─────────────────────────────────────
    let html = templateHTML;

    // Simple placeholder replacements
    const replacements: Record<string, string> = {
      "{{BUSINESS_NAME}}": businessName,
      "{{BUSINESS_TAGLINE}}": tagline || copyData.FOOTER_TAGLINE || "",
      "{{META_DESCRIPTION}}": copyData.META_DESCRIPTION || "",
      "{{DOMAIN}}": domain,
      "{{BUSINESS_PHONE_RAW}}": phoneRaw,
      "{{BUSINESS_PHONE}}": phone,
      "{{BUSINESS_EMAIL}}": email,
      "{{BUSINESS_ADDRESS}}": address,
      "{{BUSINESS_CITY}}": city,
      "{{BUSINESS_STATE}}": state,
      "{{GOOGLE_RATING}}": String(googleRating),
      "{{GOOGLE_REVIEW_COUNT}}": String(googleReviewCount),
      "{{SERVICE_AREA}}": intake.service_area || (city ? `${city} & Surrounding Areas` : ""),
      "{{HERO_BADGE}}": copyData.HERO_BADGE || "TRUSTED LOCAL EXPERTS",
      "{{HERO_HEADLINE_LINE1}}": copyData.HERO_HEADLINE_LINE1 || "",
      "{{HERO_HEADLINE_HIGHLIGHT}}": copyData.HERO_HEADLINE_HIGHLIGHT || "",
      "{{HERO_HEADLINE_LINE2}}": copyData.HERO_HEADLINE_LINE2 || "",
      "{{HERO_HEADLINE_LINE3}}": copyData.HERO_HEADLINE_LINE3 || "",
      "{{HERO_SUBHEADING}}": copyData.HERO_SUBHEADING || "",
      "{{TRUST_ITEM_3}}": copyData.TRUST_ITEM_3 || "FAMILY OWNED",
      "{{YEARS_IN_BUSINESS}}": String(yearsInBusiness || "10"),
      "{{ABOUT_IMAGE_URL}}": aboutImageUrl,
      "{{ABOUT_HEADLINE}}": copyData.ABOUT_HEADLINE || "",
      "{{ABOUT_STORY}}": copyData.ABOUT_STORY || "",
      "{{STAT_1_NUMBER}}": copyData.STAT_1_NUMBER || "500+",
      "{{STAT_1_LABEL}}": copyData.STAT_1_LABEL || "JOBS COMPLETED",
      "{{STAT_2_NUMBER}}": copyData.STAT_2_NUMBER || (googleRating ? `${googleRating}★` : "4.9★"),
      "{{STAT_2_LABEL}}": copyData.STAT_2_LABEL || "GOOGLE RATING",
      "{{STAT_3_NUMBER}}": copyData.STAT_3_NUMBER || "24/7",
      "{{STAT_3_LABEL}}": copyData.STAT_3_LABEL || "EMERGENCY SERVICE",
      "{{STAT_4_NUMBER}}": copyData.STAT_4_NUMBER || "100%",
      "{{STAT_4_LABEL}}": copyData.STAT_4_LABEL || "SATISFACTION GUARANTEED",
      "{{SERVICES_HEADLINE}}": copyData.SERVICES_HEADLINE || "OUR SERVICES",
      "{{SERVICES_SUBTEXT}}": copyData.SERVICES_SUBTEXT || "",
      "{{WHY_US_IMAGE_URL}}": whyUsImageUrl,
      "{{WHY_US_HEADLINE}}": copyData.WHY_US_HEADLINE || "",
      "{{EMERGENCY_HEADLINE}}": copyData.EMERGENCY_HEADLINE || "EMERGENCY? WE'RE ON THE WAY.",
      "{{EMERGENCY_SUBTEXT}}": copyData.EMERGENCY_SUBTEXT || "",
      "{{HAPPY_CUSTOMERS}}": copyData.HAPPY_CUSTOMERS || "500",
      "{{CITY}}": city,
      "{{CLIENT_TYPE}}": "CUSTOMERS",
      "{{REVIEW_PLATFORMS}}": copyData.REVIEW_PLATFORMS || "Google",
      "{{SERVICE_AREAS_HEADLINE}}": copyData.SERVICE_AREAS_HEADLINE || `SERVING ${city.toUpperCase()} & BEYOND`,
      "{{MAP_EMBED_URL}}": mapEmbedUrl,
      "{{FINAL_CTA_HEADLINE}}": copyData.FINAL_CTA_HEADLINE || "READY TO GET STARTED?",
      "{{FINAL_CTA_SUBTEXT}}": copyData.FINAL_CTA_SUBTEXT || "",
      "{{FOOTER_TAGLINE}}": copyData.FOOTER_TAGLINE || "",
      "{{FOOTER_NEWSLETTER_TEXT}}": copyData.FOOTER_NEWSLETTER_TEXT || "Sign up for exclusive deals and tips.",
      "{{COPYRIGHT_YEAR}}": String(new Date().getFullYear()),
      "{{CLIENT_ID}}": clientId,
      "{{SUPABASE_URL}}": supabaseUrl,
      "{{FINANCING_HEADLINE}}": copyData.FINANCING_HEADLINE || "FLEXIBLE FINANCING AVAILABLE",
      "{{FINANCING_SUBTEXT}}": copyData.FINANCING_SUBTEXT || "0% interest financing — get approved on the spot.",
      "{{COUPONS_NOTE}}": copyData.COUPONS_NOTE || "Cannot be combined with other offers.",
    };

    for (const [key, value] of Object.entries(replacements)) {
      html = html.split(key).join(value);
    }

    // ── Conditional sections ─────────────────────────────────────────────
    if (!showFinancing) {
      html = removeSection(html, "SHOW_FINANCING");
    } else {
      html = html.replace(/\{\{#SHOW_FINANCING\}\}/g, "").replace(/\{\{\/SHOW_FINANCING\}\}/g, "");
    }

    if (!showCoupons) {
      html = removeSection(html, "SHOW_COUPONS");
    } else {
      html = html.replace(/\{\{#SHOW_COUPONS\}\}/g, "").replace(/\{\{\/SHOW_COUPONS\}\}/g, "");
    }

    if (!showAwards) {
      html = removeSection(html, "SHOW_AWARDS");
    } else {
      html = html.replace(/\{\{#SHOW_AWARDS\}\}/g, "").replace(/\{\{\/SHOW_AWARDS\}\}/g, "");
    }

    // ── Repeating sections ───────────────────────────────────────────────
    // SERVICES
    const serviceCopy: any[] = Array.isArray(copyData.SERVICE_COPY) ? copyData.SERVICE_COPY : [];
    const servicesData = services.slice(0, 8).map((s: any, i: number) => {
      const name = typeof s === "string" ? s : s?.name || s?.title || "";
      const desc = serviceCopy[i]?.description || copyData.SERVICES_SUBTEXT || "";
      const icon = typeof s === "object" && s?.icon_svg ? s.icon_svg : defaultServiceIcon();
      return { SERVICE_NAME: name, SERVICE_DESCRIPTION: desc, SERVICE_ICON_SVG: icon };
    });
    html = renderLoop(html, "SERVICES", servicesData);

    // ABOUT_POINTS
    html = renderLoop(html, "ABOUT_POINTS", Array.isArray(copyData.ABOUT_POINTS) ? copyData.ABOUT_POINTS : []);

    // WHY_US_POINTS
    html = renderLoop(html, "WHY_US_POINTS", Array.isArray(copyData.WHY_US_POINTS) ? copyData.WHY_US_POINTS : []);

    // TESTIMONIALS — use provided ones or Claude-generated
    const testimonialsData = testimonials.length >= 3
      ? testimonials.slice(0, 3).map((t: any) => ({
          TESTIMONIAL_TEXT: t.text || t.testimonial || "",
          TESTIMONIAL_NAME: t.name || t.author || "",
          TESTIMONIAL_LOCATION: t.location || city,
        }))
      : Array.isArray(copyData.TESTIMONIALS) ? copyData.TESTIMONIALS : [];
    html = renderLoop(html, "TESTIMONIALS", testimonialsData);

    // FAQ_ITEMS — use provided ones or Claude-generated
    const faqData = faqItems.length >= 3
      ? faqItems.slice(0, 6).map((f: any) => ({
          FAQ_QUESTION: f.question || f.q || "",
          FAQ_ANSWER: f.answer || f.a || "",
        }))
      : Array.isArray(copyData.FAQ_ITEMS) ? copyData.FAQ_ITEMS : [];
    html = renderLoop(html, "FAQ_ITEMS", faqData);

    // SERVICE_AREA_LOCATIONS — use provided or Claude-generated
    const areaData = serviceAreas.length > 0
      ? serviceAreas.map((a: any) => ({ LOCATION_NAME: typeof a === "string" ? a : a?.name || a }))
      : Array.isArray(copyData.SERVICE_AREA_LOCATIONS) ? copyData.SERVICE_AREA_LOCATIONS : [];
    html = renderLoop(html, "SERVICE_AREA_LOCATIONS", areaData);

    // AWARDS
    html = renderLoop(html, "AWARDS", awards.map((a: any) => ({ AWARD_NAME: typeof a === "string" ? a : a?.name || a })));

    // COUPONS
    html = renderLoop(html, "COUPONS", coupons.map((c: any) => ({
      COUPON_AMOUNT: c.amount || "",
      COUPON_DESCRIPTION: c.description || "",
      COUPON_EXPIRY: c.expiry || "",
      COUPON_CODE: c.code || "",
    })));

    // ── Inline CSS ───────────────────────────────────────────────────────
    html = html.replace(
      /<link\s+rel=["']stylesheet["']\s+href=["']styles\.css["']\s*\/?>/gi,
      `<style>\n${templateCSS}\n</style>`
    );

    // Set hero background image if available
    if (heroImageUrl) {
      html = html.replace(
        /class="hero"/,
        `class="hero" style="background-image: url('${heroImageUrl}');"`
      );
    }

    // ── Clean up any remaining unfilled placeholders ─────────────────────
    html = html.replace(/\{\{[^}]+\}\}/g, "");

    // ── Animate-on-scroll safety net ─────────────────────────────────────
    const safetyNet = `
<style>.animate-on-scroll { opacity: 1 !important; transform: none !important; }</style>
<script>
(function(){
  function reveal(){ document.querySelectorAll('.animate-on-scroll').forEach(function(el){ el.classList.add('visible'); }); }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',reveal); } else { reveal(); }
})();
</script>`;
    html = html.replace("</body>", safetyNet + "\n</body>");

    // ── Optional CALL 2: Apply special call notes instructions ───────────
    const hasSpecialInstructions = callNotes && (
      (callNotes as any).expert_additions ||
      (callNotes as any).expert_avoid ||
      (callNotes as any).color_direction
    );

    if (hasSpecialInstructions) {
      await supabase.from("sites").update({ generation_progress: "applying_customizations" } as any).eq("client_id", clientId);

      const customizePrompt = `You are a web developer applying specific operator instructions to a completed website. The HTML is fully built and looks great. Your ONLY job is to apply the specific instructions below. Do not redesign anything. Do not rewrite sections that are not mentioned.

OPERATOR INSTRUCTIONS TO APPLY:
${JSON.stringify({
  expert_additions: (callNotes as any).expert_additions,
  expert_avoid: (callNotes as any).expert_avoid,
  color_direction: (callNotes as any).color_direction,
  exact_phrases: (callNotes as any).exact_phrases,
  final_notes: (callNotes as any).final_notes,
}, null, 2)}

RULES:
- Apply ONLY what is listed above. Nothing else.
- Removing a section: delete it entirely, no empty divs, no gaps.
- Adding a section: match the existing design system exactly, same fonts colors spacing.
- Changing colors: update CSS custom properties in :root only.
- Using exact phrases: find the relevant text and replace it.
- Do not change any class names.
- Do not add external libraries.
- Return the complete HTML with changes applied.

CURRENT HTML:
${html}

CRITICAL: Return ONLY the complete raw HTML. No markdown, no explanation, no code blocks.`;

      console.log("[part1] Calling Claude for customizations...");
      const customizeResult = await callAI(ANTHROPIC_API_KEY, customizePrompt, "customizations");
      const customized = stripMarkdown(customizeResult.text);
      if (customized.includes("<!DOCTYPE html>")) {
        html = customized;
        console.log("[part1] Customizations applied successfully");
      } else {
        console.warn("[part1] Customization returned unexpected output — using pre-customization HTML");
      }
    }

    // ── Upload to Hostinger staging ──────────────────────────────────────
    await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

    const stagingHTML = injectNoindex(html);

    try {
      await uploadFileToHostingerFtp(
        `${STAGING_FOLDER_ROOT}/${clientId}/index.html`,
        stagingHTML,
      );
      console.log("[part1] ✓ index.html pushed to Hostinger staging");
    } catch (e: any) {
      throw new Error(`Hostinger staging upload failed: ${e.message}`);
    }

    // Backup to Supabase storage
    const { error: backupErr } = await supabase.storage
      .from("generated-sites")
      .upload(
        `${clientId}/deploy/index.html`,
        new Blob([html], { type: "text/html" }),
        { upsert: true, contentType: "text/html; charset=utf-8" },
      );
    if (backupErr) throw new Error(`Failed to save deploy/index.html: ${backupErr.message}`);
    console.log("[part1] ✓ Deploy backup saved to storage");

    const stagingURL = `${STAGING_BASE_URL}/${clientId}/index.html`;

    await supabase.from("sites").update({
      generation_status: "generating",
      generation_progress: "building_extra_pages",
      generated_at: new Date().toISOString(),
      staging_url: stagingURL,
    } as any).eq("client_id", clientId);

    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: templateId,
      status: "homepage_complete",
      tokens_used: copyResult.outputTokens,
      generation_notes: `Homepage generated via template-fill. Template: ${templateId}. Copy tokens: ${copyResult.outputTokens}.`,
    } as any);

    console.log(`[part1] ✓ Homepage complete for ${clientId} → ${stagingURL}`);

    // ── Fire generate-extra-pages ────────────────────────────────────────
    fetch(`${supabaseUrl}/functions/v1/generate-extra-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ client_id: clientId }),
    }).catch((e) => console.error("[part1] Failed to dispatch extra-pages:", e));

    return new Response(
      JSON.stringify({ success: true, status: "homepage_complete", staging_url: stagingURL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[part1] error:", error);
    await markFailed(supabase, clientId, error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ── Helper functions ───────────────────────────────────────────────────

function removeSection(html: string, key: string): string {
  const re = new RegExp(`\\{\\{#${key}\\}\\}[\\s\\S]*?\\{\\{\\/${key}\\}\\}`, "gi");
  return html.replace(re, "");
}

function renderLoop(html: string, key: string, items: any[]): string {
  const re = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, "gi");
  if (!items || items.length === 0) {
    return html.replace(re, "");
  }
  return html.replace(re, (_match: string, inner: string) => {
    return items.map((item: any) => {
      let block = inner;
      for (const [k, v] of Object.entries(item)) {
        block = block.split(`{{${k}}}`).join(String(v ?? ""));
      }
      return block;
    }).join("");
  });
}

function defaultServiceIcon(): string {
  return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`;
}

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=/i.test(html)) {
    return html.replace(/(<meta\s+charset=[^>]+>)/i, `$1${tag}`);
  }
  return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const MAX_ATTEMPTS = 2;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(AI_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 8000,
          messages: [{ role: "user", content }],
        }),
      });
      clearTimeout(timeout);
      if (!r.ok) {
        const errText = await r.text();
        if ((r.status === 429 || r.status === 529) && attempt < MAX_ATTEMPTS) {
          await new Promise((res) => setTimeout(res, 3000 * attempt));
          continue;
        }
        throw new Error(`Claude ${label} failed: ${r.status} — ${errText.substring(0, 300)}`);
      }
      const data = await r.json();
      const text = Array.isArray(data.content)
        ? data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        : "";
      return { text, outputTokens: data.usage?.output_tokens || 0 };
    } catch (err: any) {
      clearTimeout(timeout);
      lastErr = err.name === "AbortError"
        ? new Error(`Claude ${label} timed out after ${TIMEOUT_MS / 1000}s`)
        : err as Error;
      console.error(`[${label}] attempt ${attempt} failed:`, lastErr.message);
      if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 2000));
    }
  }
  throw lastErr || new Error(`Claude failed: ${label}`);
}

function stripMarkdown(s: string): string {
  return s.replace(/^```(?:html|json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

async function markFailed(supabase: any, clientId: string, message: string) {
  if (!clientId) return;
  try {
    await supabase.from("sites").update({
      generation_status: "failed",
      generation_error: message,
    }).eq("client_id", clientId);
    await supabase.from("generation_logs").insert({
      client_id: clientId,
      status: "failed",
      error_message: message,
    });
  } catch (e) {
    console.error("[part1] failed to mark failure:", e);
  }
}

function getPhotoSearchTerms(client: any, intake: any): string[] {
  const industry = (client?.business_type || client?.industry || "").toLowerCase();
  const services = Array.isArray(intake?.services)
    ? intake.services.map((s: any) => (typeof s === "string" ? s : s?.name || s?.title || "")).join(" ")
    : "";
  const context = `${industry} ${services}`.toLowerCase();

  const photoTerms: Record<string, string[]> = {
    excavat: ["excavator working", "excavation site", "earthwork construction", "heavy equipment excavation"],
    plumb: ["plumber working", "pipe repair", "bathroom plumbing", "plumbing service"],
    electr: ["electrician working", "electrical panel", "wiring installation", "electrical contractor"],
    hvac: ["hvac technician", "air conditioning unit", "heating system repair"],
    roof: ["roofer working", "roof repair", "roofing contractor", "roof installation"],
    landscape: ["landscaping garden", "lawn care", "garden maintenance", "landscaper working"],
    construct: ["construction worker", "building construction", "contractor working", "renovation"],
    paint: ["house painter", "interior painting", "exterior painting", "painting contractor"],
    floor: ["flooring installation", "hardwood floors", "tile flooring", "floor contractor"],
    clean: ["house cleaning", "professional cleaning", "cleaning service"],
    barber: ["barber shop", "barber cutting hair", "barbershop interior"],
    salon: ["hair salon", "hair styling", "hairdresser working"],
    spa: ["spa treatment", "massage therapy", "relaxing spa"],
    fitness: ["gym workout", "personal trainer", "fitness training"],
    lawyer: ["law office", "attorney office", "legal consultation"],
    accountant: ["accounting office", "financial planning", "business meeting"],
    restaurant: ["restaurant interior", "food dining", "restaurant kitchen"],
    dental: ["dental office", "dentist working", "dental care"],
    medical: ["medical office", "doctor consultation", "healthcare professional"],
  };

  for (const [keyword, terms] of Object.entries(photoTerms)) {
    if (context.includes(keyword)) return terms;
  }

  return ["professional service", "contractor working", "small business professional"];
}

async function fetchUnsplashPhoto(searchTerms: string[], width = 800, height = 600) {
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return null;
  for (const term of searchTerms) {
    try {
      const r = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(term)}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } }
      );
      if (r.ok) {
        const p = await r.json();
        return {
          url: `${p.urls.raw}&w=${width}&h=${height}&fit=crop&auto=format&q=80`,
          photographer: p.user?.name || "Unsplash",
          unsplash_url: p.links?.html || "https://unsplash.com",
        };
      }
    } catch (e) {
      console.error(`[unsplash] error for "${term}":`, e);
    }
  }
  return null;
}
