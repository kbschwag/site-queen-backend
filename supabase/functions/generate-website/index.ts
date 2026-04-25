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

  // Auth check — require valid JWT (orchestrator was previously the entry point)
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    // Allow service-role calls (internal chains) or any valid user token
    if (token !== serviceKey) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  } else {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
    // ── Bump attempt counter ─────────────────────────────────────────────
    const { data: existingSite } = await supabase
      .from("sites").select("generation_attempts").eq("client_id", clientId).maybeSingle();

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
    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    await supabase.from("sites").update({
      intake_snapshot: intake,
      intake_snapshot_saved_at: new Date().toISOString(),
      ...(callNotes ? { call_notes_snapshot: callNotes } : {}),
    } as any).eq("client_id", clientId);

    // ── Load template ────────────────────────────────────────────────────
    // Each template lives in its own folder inside the `templates` bucket:
    //   {templateId}/index.html   {templateId}/style.css
    //   {templateId}/about.html   {templateId}/services.html
    //   {templateId}/preview.png
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero",
      feminine: "feminine-bold",
      warm: "warm-welcome",
      local: "local-favorite",
      modern: "modern-business",
    };
    const selectedTemplate = intake?.template_selected || (callNotes as any)?.template_selected || intake?.template_id;
    const requestedTemplateId = selectedTemplate ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate) : "trades-hero";
    const FALLBACK_TEMPLATE = "trades-hero";

    let templateId = requestedTemplateId;
    let { data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`);
    let { data: cssFile } = await supabase.storage.from("templates").download(`${templateId}/style.css`);

    if (!htmlFile && templateId !== FALLBACK_TEMPLATE) {
      console.warn(`[generate] Template "${templateId}/index.html" not found in storage — falling back to "${FALLBACK_TEMPLATE}".`);
      templateId = FALLBACK_TEMPLATE;
      ({ data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`));
      ({ data: cssFile } = await supabase.storage.from("templates").download(`${templateId}/style.css`));
    }

    if (!htmlFile) throw new Error(`Template not found: ${templateId}/index.html`);

    const templateHTML = await htmlFile.text();
    const templateCSS = cssFile ? await cssFile.text() : "";

    // ── Photos ───────────────────────────────────────────────────────────
    // Priority: client uploads ALWAYS win. Stock only fills empty slots when allowed.
    // Logo is never replaced with stock.
    const portfolioPhotos: string[] = (Array.isArray(intake.portfolio_photos) ? intake.portfolio_photos : []).filter(Boolean);
    const teamPhotos: string[] = (Array.isArray(intake.team_photos) ? intake.team_photos : []).filter(Boolean);

    // `use_stock_photos` only controls whether stock fills EMPTY slots — it never overrides client uploads.
    // Default true unless explicitly set to false.
    const allowStock = intake.use_stock_photos !== false && (siteData as any).using_stock_photos !== false;

    const firstServiceForStock = (Array.isArray(intake.services) && intake.services[0])
      ? (typeof intake.services[0] === "string" ? intake.services[0] : (intake.services[0]?.name || intake.services[0]?.title || ""))
      : "";
    const businessTypeForStock = (clientData as any)?.business_type || "";
    const stockTerms = buildStockSearchTerms(businessTypeForStock, firstServiceForStock);

    const heroCandidates = [intake.hero_photo_url, portfolioPhotos[0]].filter(Boolean) as string[];
    const aboutCandidates = [teamPhotos[0], intake.owner_photo_url, portfolioPhotos[1], portfolioPhotos[0]].filter(Boolean) as string[];
    const whyUsCandidates = [portfolioPhotos[2], portfolioPhotos[1], portfolioPhotos[0]].filter(Boolean) as string[];

    let heroImageUrl = heroCandidates[0] || "";
    let aboutImageUrl = aboutCandidates[0] || "";
    let whyUsImageUrl = whyUsCandidates[0] || "";

    if (allowStock) {
      const needed: Array<"hero" | "about" | "whyus"> = [];
      if (!heroImageUrl) needed.push("hero");
      if (!aboutImageUrl) needed.push("about");
      if (!whyUsImageUrl) needed.push("whyus");

      if (needed.length > 0) {
        const stockResults = await Promise.all(needed.map((slot) => {
          const variant = slot === "hero" ? "wide hero" : slot === "about" ? "team working" : "professional";
          return fetchUnsplashPhotoUrl(stockTerms.map((t) => `${t} ${variant}`));
        }));
        needed.forEach((slot, i) => {
          const url = stockResults[i] || "";
          if (slot === "hero") heroImageUrl = url;
          else if (slot === "about") aboutImageUrl = url;
          else if (slot === "whyus") whyUsImageUrl = url;
        });
      }
    }

    const logoUrlResolved = intake.logo_url || ""; // never replaced with stock
    console.log(`[generate] Photos — hero:${heroImageUrl ? "✓" : "✗"} about:${aboutImageUrl ? "✓" : "✗"} whyus:${whyUsImageUrl ? "✓" : "✗"} logo:${logoUrlResolved ? "✓" : "✗"} (hero_upload=${!!intake.hero_photo_url}, portfolio=${portfolioPhotos.length}, team=${teamPhotos.length}, allowStock=${allowStock})`);

    await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

    // ── CALL 1: Generate all copy fields ─────────────────────────────────
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const services = Array.isArray(intake.services) ? intake.services : [];
    const businessName = (clientData as any)?.business_name || intake.business_name || "Business";
    const businessType = (clientData as any)?.business_type || "Service Business";
    const city = intake.business_city || "";
    const state = intake.business_state || "";
    const yearsInBusiness = intake.years_in_business || "";
    const aboutStory = intake.about_story || "";
    const testimonials = Array.isArray(intake.testimonials) ? intake.testimonials : [];
    const faqItems = Array.isArray(intake.faq_items) ? intake.faq_items : [];
    const noTestimonialsCopy = !!intake.no_testimonials;

    const serviceNames = services.slice(0, 8)
      .map((s: any) => typeof s === "string" ? s : s?.name || s?.title || "")
      .filter(Boolean);

    const servicesJsonSeed = serviceNames.length > 0
      ? serviceNames.map((name: string) =>
          `{"SERVICE_NAME": ${JSON.stringify(name)}, "SERVICE_DESCRIPTION": "2 sentences describing this specific service. Be specific.", "SERVICE_ICON_SVG": ""}`
        ).join(",\n    ")
      : `{"SERVICE_NAME": "Primary Service", "SERVICE_DESCRIPTION": "2 sentences describing the main service offered. Be specific.", "SERVICE_ICON_SVG": ""}`;

    const testimonialsSeed = testimonials.length > 0
      ? testimonials.slice(0, 3).map((t: any) =>
          `{"TESTIMONIAL_TEXT": ${JSON.stringify(t.text || t.testimonial || "")}, "TESTIMONIAL_NAME": ${JSON.stringify(t.name || t.author || "")}, "TESTIMONIAL_LOCATION": ${JSON.stringify(t.location || city)}}`
        ).join(",\n    ")
      : [
          `{"TESTIMONIAL_TEXT": "write a realistic 2-3 sentence testimonial from a happy customer. Reference a specific service.", "TESTIMONIAL_NAME": "local sounding first and last name", "TESTIMONIAL_LOCATION": ${JSON.stringify(`${city}, ${state}`)}}`,
          `{"TESTIMONIAL_TEXT": "write a different realistic testimonial", "TESTIMONIAL_NAME": "different local name", "TESTIMONIAL_LOCATION": ${JSON.stringify(`nearby suburb of ${city}`)}}`,
          `{"TESTIMONIAL_TEXT": "write a third realistic testimonial", "TESTIMONIAL_NAME": "different local name", "TESTIMONIAL_LOCATION": ${JSON.stringify(`${city} area`)}}`,
        ].join(",\n    ");

    const faqSeed = faqItems.length > 0
      ? faqItems.slice(0, 6).map((f: any) =>
          `{"FAQ_QUESTION": ${JSON.stringify(f.question || f.q || "")}, "FAQ_ANSWER": ${JSON.stringify(f.answer || f.a || "")}}`
        ).join(",\n    ")
      : [
          `{"FAQ_QUESTION": "relevant question 1 a real customer asks", "FAQ_ANSWER": "helpful specific answer"}`,
          `{"FAQ_QUESTION": "relevant question 2", "FAQ_ANSWER": "helpful specific answer"}`,
          `{"FAQ_QUESTION": "relevant question 3", "FAQ_ANSWER": "helpful specific answer"}`,
          `{"FAQ_QUESTION": "relevant question 4", "FAQ_ANSWER": "helpful specific answer"}`,
          `{"FAQ_QUESTION": "relevant question 5", "FAQ_ANSWER": "helpful specific answer"}`,
        ].join(",\n    ");

    const copyPrompt = `You are a professional copywriter for SiteQueen, a done-for-you website service for small businesses. Generate copy for a ${businessType} website. Your copy will be injected directly into a professional template — write for real business owners, not for AI demos.

BUSINESS INFORMATION:
Business name: ${businessName}
Business type: ${businessType}
City: ${city}, ${state}
Years in business: ${yearsInBusiness || "not provided"}
About story from owner: ${aboutStory || "not provided"}
Services offered: ${serviceNames.join(", ") || "not provided"}

CALL NOTES FROM OPERATOR (highest priority — follow these exactly):
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
  final_notes: (callNotes as any).final_notes,
}, null, 2) : "No call notes available — use intake data only."}

TONE RULES:
- Match the tone from call notes exactly. If not specified, use industry default.
- Trades and contractors: confident, direct, no-nonsense. Short punchy sentences.
- Wellness and beauty: warm, nurturing, reassuring.
- Professional services: polished, trustworthy, credible.
- Write like a real local business owner, not a marketing agency.
- Never use: "we are committed to excellence", "your satisfaction is our priority", "we pride ourselves on", "world-class", "cutting-edge", "seamless". These are banned phrases.
- Use the exact phrases from call notes exact_phrases field if provided.

COPY RULES:
- Every field must sound specific to THIS business, not generic.
- Reference the city, the specific services, the years in business where relevant.
- NEVER return an empty string for any field. Every field below MUST be filled with realistic, specific copy. The only exceptions: phone numbers, email addresses, street addresses, license numbers or specific credentials that were not provided — for those, return an empty string rather than inventing data. Headlines, subheadings, badges, stats, services, why-us reasons, FAQs, CTAs, taglines, etc. must always be written even when intake data is sparse — infer reasonable defaults from business type, city, and services.
${noTestimonialsCopy ? "- TESTIMONIALS: client explicitly opted out — return an empty TESTIMONIALS array []." : "- For testimonials: write realistic ones with names that sound local to " + city + ". Reference specific services this business offers. Make them feel genuine, not corporate."}
- For FAQs: write questions a real customer of THIS specific business would actually ask. Make answers helpful and specific.

Return ONLY a valid JSON object with exactly these fields. No markdown, no code blocks, no explanation. Start with { and end with }:

{
  "META_DESCRIPTION": "155 char SEO meta description mentioning business name, main service, and city",
  "HERO_BADGE": "3-5 word trust statement e.g. TRUSTED LOCAL EXPERTS or SERVING ${city.toUpperCase()} SINCE ${yearsInBusiness || "2010"}",
  "HERO_HEADLINE_LINE1": "first line of hero headline (2-4 words, all caps)",
  "HERO_HEADLINE_HIGHLIGHT": "highlighted word or phrase in red (1-3 words, all caps, the core service)",
  "HERO_HEADLINE_LINE2": "second line after highlight (2-4 words, all caps)",
  "HERO_HEADLINE_LINE3": "third line of headline (2-4 words, all caps)",
  "HERO_SUBHEADING": "1-2 sentences. Specific to this business. What they do, where, why choose them.",
  "TRUST_ITEM_3": "one trust badge item (e.g. FAMILY OWNED, BBB ACCREDITED, 5-STAR RATED)",
  "ABOUT_HEADLINE": "compelling about section headline (5-8 words)",
  "ABOUT_STORY": "3-4 paragraph about story. Use the owner's story if provided. Make it personal, specific, and compelling. Reference years in business, the city, what drives them.",
  "ABOUT_POINTS": [
    {"ABOUT_POINT": "key differentiator 1"},
    {"ABOUT_POINT": "key differentiator 2"},
    {"ABOUT_POINT": "key differentiator 3"},
    {"ABOUT_POINT": "key differentiator 4"}
  ],
  "STAT_1_NUMBER": "e.g. 500+ or 22",
  "STAT_1_LABEL": "e.g. JOBS COMPLETED or YEARS EXPERIENCE",
  "STAT_2_NUMBER": "e.g. 4.9★",
  "STAT_2_LABEL": "e.g. GOOGLE RATING",
  "STAT_3_NUMBER": "e.g. 24/7",
  "STAT_3_LABEL": "e.g. EMERGENCY SERVICE",
  "STAT_4_NUMBER": "e.g. 100%",
  "STAT_4_LABEL": "e.g. SATISFACTION GUARANTEED",
  "SERVICES_HEADLINE": "services section headline (3-5 words, all caps)",
  "SERVICES_SUBTEXT": "1 sentence describing their range of services",
  "SERVICES": [
    ${servicesJsonSeed}
  ],
  "EMERGENCY_HEADLINE": "emergency section headline (4-6 words, all caps, e.g. PIPE BURST AT 2AM?)",
  "EMERGENCY_SUBTEXT": "1-2 sentences about 24/7 availability. Reassuring, direct.",
  "WHY_US_HEADLINE": "why choose us section headline (4-7 words)",
  "WHY_US_POINTS": [
    {"POINT_NUMBER": "01", "POINT_TITLE": "reason 1 title (3-5 words)", "POINT_DESCRIPTION": "2 sentences explaining this reason. Be specific to this business."},
    {"POINT_NUMBER": "02", "POINT_TITLE": "reason 2 title", "POINT_DESCRIPTION": "2 sentences"},
    {"POINT_NUMBER": "03", "POINT_TITLE": "reason 3 title", "POINT_DESCRIPTION": "2 sentences"},
    {"POINT_NUMBER": "04", "POINT_TITLE": "reason 4 title", "POINT_DESCRIPTION": "2 sentences"}
  ],
  "HAPPY_CUSTOMERS": "number e.g. 500",
  "REVIEW_PLATFORMS": "e.g. Google · Facebook · Yelp",
  "TESTIMONIALS": [
    ${testimonialsSeed}
  ],
  "SERVICE_AREAS_HEADLINE": "service areas section headline (4-6 words, all caps)",
  "SERVICE_AREA_LOCATIONS": [
    {"LOCATION_NAME": ${JSON.stringify(city || "Main City")}},
    {"LOCATION_NAME": "nearby area 2"},
    {"LOCATION_NAME": "nearby area 3"},
    {"LOCATION_NAME": "nearby area 4"},
    {"LOCATION_NAME": "nearby area 5"},
    {"LOCATION_NAME": "nearby area 6"}
  ],
  "FAQ_ITEMS": [
    ${faqSeed}
  ],
  "FINAL_CTA_HEADLINE": "final CTA headline (5-8 words, all caps, compelling)",
  "FINAL_CTA_SUBTEXT": "1-2 sentences. Urgency + reassurance. Drive them to call.",
  "FOOTER_TAGLINE": "short brand tagline for footer (5-8 words)",
  "FOOTER_NEWSLETTER_TEXT": "1 sentence inviting email signup for deals and tips"
}`;

    console.log("[generate] Calling Claude for copy generation...");
    const copyResult = await callAI(ANTHROPIC_API_KEY, copyPrompt, "copy-generation");

    let copyData: any = {};
    try {
      const cleaned = stripMarkdown(copyResult.text);
      copyData = JSON.parse(cleaned);
    } catch (e) {
      console.error("[generate] Failed to parse copy JSON:", e);
      console.error("[generate] Raw output (first 500):", copyResult.text.substring(0, 500));
      throw new Error("Claude returned invalid JSON for copy generation");
    }

    await supabase.from("sites").update({ generation_progress: "filling_template" } as any).eq("client_id", clientId);

    // ── Conditional sections (resolve before any rendering) ──────────────
    const showFinancing = !!(callNotes as any)?.show_financing || !!intake.show_financing;
    const showCoupons = !!(callNotes as any)?.show_coupons || !!intake.show_coupons || (Array.isArray(intake.coupons) && intake.coupons.length > 0);
    const showAwards = !!(callNotes as any)?.show_awards || (Array.isArray(intake.awards) && intake.awards.length > 0);

    let html = templateHTML;

    // Strip or unwrap conditional Mustache blocks first
    html = applyConditional(html, "SHOW_FINANCING", showFinancing);
    html = applyConditional(html, "SHOW_COUPONS", showCoupons);
    html = applyConditional(html, "SHOW_AWARDS", showAwards);

    // ── Repeating sections — render each {{#KEY}}...{{/KEY}} block by
    //    substituting the named fields from each item into the template's
    //    own inner markup, then joining. This preserves the template's
    //    HTML structure exactly as the designer wrote it.
    const servicesData: any[] = Array.isArray(copyData.SERVICES) ? copyData.SERVICES : [];
    html = renderMustacheSection(html, "SERVICES", servicesData.map((s: any) => ({
      SERVICE_NAME: s.SERVICE_NAME || "",
      SERVICE_DESCRIPTION: s.SERVICE_DESCRIPTION || "",
      SERVICE_ICON_SVG: s.SERVICE_ICON_SVG || defaultServiceIcon(),
    })));

    const aboutPoints: any[] = Array.isArray(copyData.ABOUT_POINTS) ? copyData.ABOUT_POINTS : [];
    html = renderMustacheSection(html, "ABOUT_POINTS", aboutPoints.map((p: any) => ({
      ABOUT_POINT: p.ABOUT_POINT || "",
    })));

    const whyUsPoints: any[] = Array.isArray(copyData.WHY_US_POINTS) ? copyData.WHY_US_POINTS : [];
    html = renderMustacheSection(html, "WHY_US_POINTS", whyUsPoints.map((p: any) => ({
      POINT_NUMBER: p.POINT_NUMBER || "",
      POINT_TITLE: p.POINT_TITLE || "",
      POINT_DESCRIPTION: p.POINT_DESCRIPTION || "",
    })));

    const testimonialsData: any[] = Array.isArray(copyData.TESTIMONIALS) ? copyData.TESTIMONIALS : [];
    html = renderMustacheSection(html, "TESTIMONIALS", testimonialsData.map((t: any) => ({
      TESTIMONIAL_TEXT: t.TESTIMONIAL_TEXT || "",
      TESTIMONIAL_NAME: t.TESTIMONIAL_NAME || "",
      TESTIMONIAL_LOCATION: t.TESTIMONIAL_LOCATION || "",
    })));

    const faqData: any[] = Array.isArray(copyData.FAQ_ITEMS) ? copyData.FAQ_ITEMS : [];
    html = renderMustacheSection(html, "FAQ_ITEMS", faqData.map((f: any) => ({
      FAQ_QUESTION: f.FAQ_QUESTION || "",
      FAQ_ANSWER: f.FAQ_ANSWER || "",
    })));

    const areaLocations: any[] = Array.isArray(copyData.SERVICE_AREA_LOCATIONS) ? copyData.SERVICE_AREA_LOCATIONS : [];
    html = renderMustacheSection(html, "SERVICE_AREA_LOCATIONS", areaLocations.map((l: any) => ({
      LOCATION_NAME: l.LOCATION_NAME || "",
    })));

    if (showAwards) {
      const awardsData: any[] = Array.isArray(intake.awards) ? intake.awards : [];
      html = renderMustacheSection(html, "AWARDS", awardsData.map((a: any) => ({
        AWARD_NAME: typeof a === "string" ? a : (a.AWARD_NAME || a.name || ""),
      })));
    } else {
      // already removed by applyConditional, but be safe
      html = renderMustacheSection(html, "AWARDS", []);
    }

    if (showCoupons) {
      const couponsData: any[] = Array.isArray(intake.coupons) ? intake.coupons : [];
      html = renderMustacheSection(html, "COUPONS", couponsData.map((c: any) => ({
        COUPON_AMOUNT: c.amount || c.COUPON_AMOUNT || "",
        COUPON_DESCRIPTION: c.description || c.COUPON_DESCRIPTION || "",
        COUPON_EXPIRY: c.expiry || c.COUPON_EXPIRY || "",
        COUPON_CODE: c.code || c.COUPON_CODE || "",
      })));
    } else {
      html = renderMustacheSection(html, "COUPONS", []);
    }

    // ── Simple {{PLACEHOLDER}} replacements ──────────────────────────────
    const ratingValue = intake.google_rating ? String(intake.google_rating) : "";
    const reviewCount = intake.google_review_count ? String(intake.google_review_count) : "";

    const simpleReplacements: Record<string, string> = {
      "{{BUSINESS_NAME}}": businessName,
      "{{BUSINESS_TAGLINE}}": intake.tagline || copyData.FOOTER_TAGLINE || "",
      "{{META_DESCRIPTION}}": copyData.META_DESCRIPTION || "",
      "{{DOMAIN}}": intake.domain || `staging.sitequeen.ai/${clientId}`,
      "{{BUSINESS_PHONE_RAW}}": (intake.business_phone || "").replace(/\D/g, ""),
      "{{BUSINESS_PHONE}}": intake.business_phone || "",
      "{{BUSINESS_EMAIL}}": intake.business_email || "",
      "{{BUSINESS_ADDRESS}}": intake.business_address || "",
      "{{BUSINESS_CITY}}": city,
      "{{BUSINESS_STATE}}": state,
      "{{GOOGLE_RATING}}": ratingValue || "4.9",
      "{{GOOGLE_REVIEW_COUNT}}": reviewCount || "127",
      "{{SERVICE_AREA}}": intake.service_area || (city ? `${city} & Surrounding Areas` : "Local Service Area"),
      "{{HERO_BADGE}}": copyData.HERO_BADGE || "",
      "{{HERO_HEADLINE_LINE1}}": copyData.HERO_HEADLINE_LINE1 || "",
      "{{HERO_HEADLINE_HIGHLIGHT}}": copyData.HERO_HEADLINE_HIGHLIGHT || "",
      "{{HERO_HEADLINE_LINE2}}": copyData.HERO_HEADLINE_LINE2 || "",
      "{{HERO_HEADLINE_LINE3}}": copyData.HERO_HEADLINE_LINE3 || "",
      "{{HERO_SUBHEADING}}": copyData.HERO_SUBHEADING || "",
      "{{TRUST_ITEM_3}}": copyData.TRUST_ITEM_3 || "FAMILY OWNED",
      "{{YEARS_IN_BUSINESS}}": String(yearsInBusiness || "10"),
      "{{HERO_IMAGE_URL}}": heroImageUrl,
      "{{LOGO_URL}}": logoUrlResolved,
      "{{ABOUT_IMAGE_URL}}": aboutImageUrl,
      "{{SERVICE_1_IMAGE_URL}}": pickServiceImage(0, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_2_IMAGE_URL}}": pickServiceImage(1, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_3_IMAGE_URL}}": pickServiceImage(2, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_4_IMAGE_URL}}": pickServiceImage(3, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_5_IMAGE_URL}}": pickServiceImage(4, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_6_IMAGE_URL}}": pickServiceImage(5, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{ABOUT_HEADLINE}}": copyData.ABOUT_HEADLINE || "",
      "{{ABOUT_STORY}}": copyData.ABOUT_STORY || "",
      "{{STAT_1_NUMBER}}": copyData.STAT_1_NUMBER || "500+",
      "{{STAT_1_LABEL}}": copyData.STAT_1_LABEL || "JOBS COMPLETED",
      "{{STAT_2_NUMBER}}": copyData.STAT_2_NUMBER || (ratingValue ? `${ratingValue}★` : "4.9★"),
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
      "{{CITY}}": city || "LOCAL",
      "{{CLIENT_TYPE}}": businessType.toLowerCase().includes("plumb") ? "HOMEOWNERS" : "CUSTOMERS",
      "{{REVIEW_PLATFORMS}}": copyData.REVIEW_PLATFORMS || "Google · Facebook",
      "{{SERVICE_AREAS_HEADLINE}}": copyData.SERVICE_AREAS_HEADLINE || `PROUDLY SERVING ${(city || "OUR AREA").toUpperCase()} & BEYOND`,
      "{{MAP_EMBED_URL}}": intake.map_embed_url || "",
      "{{FINAL_CTA_HEADLINE}}": copyData.FINAL_CTA_HEADLINE || "READY TO GET STARTED?",
      "{{FINAL_CTA_SUBTEXT}}": copyData.FINAL_CTA_SUBTEXT || "",
      "{{FOOTER_TAGLINE}}": copyData.FOOTER_TAGLINE || "",
      "{{FOOTER_NEWSLETTER_TEXT}}": copyData.FOOTER_NEWSLETTER_TEXT || "Sign up for exclusive deals and expert tips.",
      "{{COPYRIGHT_YEAR}}": String(new Date().getFullYear()),
      "{{CLIENT_ID}}": clientId,
      "{{SUPABASE_URL}}": supabaseUrl,
      "{{FINANCING_HEADLINE}}": (callNotes as any)?.financing_headline || "FLEXIBLE FINANCING AVAILABLE",
      "{{FINANCING_SUBTEXT}}": (callNotes as any)?.financing_subtext || "0% interest financing available — get approved on the spot.",
      "{{COUPONS_NOTE}}": intake.coupons_note || "Print or show on phone. Cannot be combined with other offers.",
    };

    for (const [placeholder, value] of Object.entries(simpleReplacements)) {
      html = html.split(placeholder).join(value);
    }

    // Inline the template CSS in place of the external stylesheet link
    if (templateCSS) {
      html = html.replace(
        /<link\s+rel=["']stylesheet["']\s+href=["']styles?\.css["']\s*\/?>/i,
        `<style>\n${templateCSS}\n</style>`,
      );
    }

    // Remove map iframe block if no URL provided (template has placeholder div nearby)
    if (!intake.map_embed_url) {
      html = html.replace(/<div class="map-wrap[\s\S]*?<\/div>/i,
        `<div class="map-wrap"><div style="background:#0d1d3b;color:#fff;padding:48px;text-align:center;border-radius:8px;">Service area map</div></div>`);
    }

    // Clean up any remaining unreplaced placeholders
    html = html.replace(/\{\{[^}]+\}\}/g, "");

    // ── CALL 2: Apply call notes instructions (only if needed) ───────────
    const hasSpecialInstructions = callNotes && (
      (callNotes as any).expert_additions ||
      (callNotes as any).expert_avoid ||
      (callNotes as any).color_direction ||
      (callNotes as any).vibe_notes
    );

    if (hasSpecialInstructions) {
      await supabase.from("sites").update({ generation_progress: "applying_customizations" } as any).eq("client_id", clientId);

      const customizePrompt = `You are a web developer applying specific operator instructions to a completed website. The HTML is already built and looks great. Your job is to apply ONLY the specific instructions listed below — nothing else.

OPERATOR INSTRUCTIONS (apply all of these):
${JSON.stringify({
  expert_additions: (callNotes as any).expert_additions,
  expert_avoid: (callNotes as any).expert_avoid,
  color_direction: (callNotes as any).color_direction,
  vibe_notes: (callNotes as any).vibe_notes,
  exact_phrases: (callNotes as any).exact_phrases,
  final_notes: (callNotes as any).final_notes,
}, null, 2)}

RULES:
- Apply only what is explicitly listed in the operator instructions above.
- Do not redesign anything. Do not rewrite sections that are already good.
- If instructed to remove a section → delete it entirely, no empty divs.
- If instructed to add a section → add it matching the existing design system exactly (same fonts, colors, spacing).
- If instructed to change colors → update the CSS custom properties in :root only.
- If instructed to use exact phrases → find the relevant sections and apply them.
- Do not change any class names.
- Do not add external libraries.
- Return the complete HTML with your changes applied.

CURRENT HTML:
${html}

CRITICAL: Return ONLY the complete raw HTML. No markdown, no explanation, no code blocks. Start with <!DOCTYPE html> and end with </html>.`;

      try {
        console.log("[generate] Calling Claude for customizations...");
        const customizeResult = await callAI(ANTHROPIC_API_KEY, customizePrompt, "customizations");
        const customized = stripMarkdown(customizeResult.text);
        if (customized.includes("</html>") && customized.includes("<!DOCTYPE")) {
          html = customized;
        } else {
          console.warn("[generate] Customization call returned unexpected output — using pre-customization HTML");
        }
      } catch (e: any) {
        console.warn("[generate] Customization call failed (non-fatal):", e.message);
      }
    }

    // ── Safety net: force animate-on-scroll visible ──────────────────────
    const safetyNet = `
<script>
(function(){
  function reveal(){
    document.querySelectorAll('.animate-on-scroll').forEach(function(el){
      el.classList.add('visible');
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal);
  } else {
    reveal();
  }
})();
</script>
`;
    html = html.replace("</body>", safetyNet + "\n</body>");

    // ── Upload to Hostinger staging ──────────────────────────────────────
    await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

    try {
      await uploadFileToHostingerFtp(
        `${STAGING_FOLDER_ROOT}/${clientId}/index.html`,
        injectNoindex(html),
      );
      console.log("[generate] ✓ index.html pushed to Hostinger staging");
    } catch (e: any) {
      throw new Error(`Hostinger staging upload failed: ${e.message}`);
    }

    // Backup to Supabase storage
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/deploy/index.html`,
      new Blob([html], { type: "text/html" }),
      { upsert: true, contentType: "text/html; charset=utf-8" },
    );

    // Persist a tiny site-meta.json so generate-extra-pages can reuse brand tokens / class list
    const classNames = [...new Set(
      [...templateCSS.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[{,]/g)].map(m => m[1])
    )].filter(c => c.length > 1).slice(0, 200);
    const primaryColorMatch = templateCSS.match(/--color-primary\s*:\s*([^;]+)/);
    const accentColorMatch = templateCSS.match(/--color-accent\s*:\s*([^;]+)/);
    const fontHeadingMatch = templateCSS.match(/--font-heading\s*:\s*'([^']+)'/);
    const fontBodyMatch = templateCSS.match(/--font-body\s*:\s*'([^']+)'/);
    const siteMeta = {
      primaryColor: primaryColorMatch ? primaryColorMatch[1].trim() : "",
      accentColor: accentColorMatch ? accentColorMatch[1].trim() : "",
      fontHeading: fontHeadingMatch ? fontHeadingMatch[1] : "",
      fontBody: fontBodyMatch ? fontBodyMatch[1] : "",
      classes: classNames,
      generatedAt: new Date().toISOString(),
    };
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/deploy/site-meta.json`,
      new Blob([JSON.stringify(siteMeta, null, 2)], { type: "application/json" }),
      { upsert: true, contentType: "application/json; charset=utf-8" },
    );

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
      generation_notes: `Homepage generated. Template: ${templateId}. Copy tokens: ${copyResult.outputTokens}.`,
    } as any);

    console.log(`[generate] ✓ Homepage complete for ${clientId} → ${stagingURL}`);

    // ── Fire extra-pages ─────────────────────────────────────────────────
    fetch(`${supabaseUrl}/functions/v1/generate-extra-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ client_id: clientId }),
    }).catch((e) => console.error("[generate] Failed to dispatch extra-pages:", e));

    return new Response(
      JSON.stringify({ success: true, status: "homepage_complete", staging_url: stagingURL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error: any) {
    console.error("[generate] error:", error);
    await markFailed(supabase, clientId, error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders },
    );
  }
});

// ── Helper functions ───────────────────────────────────────────────────

function applyConditional(html: string, key: string, show: boolean): string {
  const re = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, "gi");
  return show
    ? html.replace(re, (_m, inner) => inner)
    : html.replace(re, "");
}

// Mustache-style {{#KEY}}inner{{/KEY}} renderer.
// For each item in `items`, the inner block is duplicated with {{FIELD}}
// placeholders inside it replaced by the item's named values. Then all
// duplicates are concatenated and substituted in place of the original block.
function renderMustacheSection(html: string, key: string, items: any[]): string {
  const re = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, "gi");
  return html.replace(re, (_m, inner: string) => {
    if (!items || items.length === 0) return "";
    return items.map((item) => {
      let block = inner;
      for (const [field, value] of Object.entries(item)) {
        const v = value == null ? "" : String(value);
        block = block.split(`{{${field}}}`).join(v);
      }
      return block;
    }).join("\n");
  });
}

function defaultServiceIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
}

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=["'][^"']+["']\s*\/?>/i.test(html)) {
    return html.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i, `$1${tag}`);
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
        : err;
      console.error(`[${label}] attempt ${attempt} failed:`, lastErr!.message);
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
      client_id: clientId, status: "failed", error_message: message,
    });
  } catch (e) {
    console.error("[generate] failed to mark failure:", e);
  }
}

// Build specific Unsplash search terms based on the client's business type and first service.
// Mirrors the logic used by generate-website-part1 so stock photos are always context-specific.
function buildStockSearchTerms(businessType: string, firstService: string): string[] {
  const ctx = `${businessType || ""} ${firstService || ""}`.toLowerCase();
  const map: Array<{ match: RegExp; terms: string[] }> = [
    { match: /excavat|earthwork|grading/, terms: ["excavator digging site", "excavation construction site", "earthwork heavy equipment"] },
    { match: /plumb/, terms: ["plumber pipe repair", "plumber working under sink", "bathroom plumbing service"] },
    { match: /electric/, terms: ["electrician working", "electrical panel installation", "wiring residential"] },
    { match: /hvac|heating|cooling|air condition/, terms: ["HVAC technician air conditioning", "HVAC repair service", "air conditioning unit installation"] },
    { match: /roof/, terms: ["roofer working on roof", "roof repair contractor", "shingle roof installation"] },
    { match: /landscap|lawn|yard|garden/, terms: ["landscaping lawn care", "professional landscaper working", "garden maintenance crew"] },
    { match: /clean/, terms: ["professional cleaning service", "house cleaner working", "commercial cleaning crew"] },
    { match: /paint/, terms: ["house painter working", "interior painting service", "exterior house painting"] },
    { match: /floor/, terms: ["flooring installation", "hardwood floor installer", "tile flooring contractor"] },
    { match: /construct|contract|build|remodel|renovat/, terms: ["construction contractor working", "home renovation crew", "general contractor jobsite"] },
    { match: /salon|hair|beauty|spa/, terms: ["modern hair salon", "beauty salon interior", "spa treatment room"] },
    { match: /restaurant|cafe|food|bakery/, terms: ["restaurant interior", "chef cooking kitchen", "cafe atmosphere"] },
    { match: /fitness|gym|train/, terms: ["fitness training session", "gym workout", "personal trainer client"] },
    { match: /photo/, terms: ["photographer working", "photography studio", "camera lens close up"] },
    { match: /law|attorney|legal/, terms: ["modern law office", "attorney consultation", "legal documents desk"] },
    { match: /dental|dentist/, terms: ["modern dental office", "dentist patient", "dental clinic"] },
    { match: /vet|pet|animal/, terms: ["veterinarian with pet", "pet grooming", "happy dog at vet"] },
    { match: /auto|mechanic|car repair/, terms: ["auto mechanic working", "car repair shop", "mechanic engine bay"] },
    { match: /pest|exterminat/, terms: ["pest control technician", "exterminator working", "pest control service"] },
    { match: /pool/, terms: ["pool maintenance", "pool cleaner working", "swimming pool service"] },
    { match: /window/, terms: ["window installation", "window cleaner working", "professional window service"] },
  ];
  for (const { match, terms } of map) {
    if (match.test(ctx)) return terms;
  }
  const safe = ctx.trim().replace(/\s+/g, " ").substring(0, 60);
  return safe ? [safe, `${safe} professional service`, `professional ${businessType || "small business"}`] : ["professional small business service", "local business team"];
}

async function fetchUnsplashPhotoUrl(searchTerms: string[]): Promise<string> {
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return "";
  for (const term of searchTerms) {
    try {
      const r = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(term)}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } },
      );
      if (r.ok) {
        const p = await r.json();
        if (p?.urls?.raw) return `${p.urls.raw}&w=1600&h=900&fit=crop&auto=format&q=80`;
      }
    } catch (e) {
      console.error(`[unsplash] error for "${term}":`, e);
    }
  }
  return "";
}

// Service image picker — cycles through portfolio photos for slot N. Falls back to other resolved images so slots aren't empty.
function pickServiceImage(index: number, portfolioPhotos: string[], fallbacks: string[]): string {
  if (portfolioPhotos[index]) return portfolioPhotos[index];
  if (portfolioPhotos.length > 0) return portfolioPhotos[index % portfolioPhotos.length];
  return fallbacks.find((u) => !!u) || "";
}
