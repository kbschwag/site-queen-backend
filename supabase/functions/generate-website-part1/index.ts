import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-opus-4-8";
const TIMEOUT_MS = 600_000; // 10 minutes

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
    // Each template lives in its own folder inside the `templates` bucket:
    //   {templateId}/index.html, {templateId}/style.css, etc.
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero",
      feminine: "feminine-bold",
      warm: "warm-welcome",
      local: "local-favorite",
      modern: "modern-business",
      professional: "business-professional",
    };

    const selectedTemplate =
      intake?.template_selected ||
      (callNotes as any)?.template_selected ||
      intake?.template_id;

    const templateId = selectedTemplate
      ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate)
      : "trades-hero";

    const { data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`);
    if (!htmlFile) throw new Error(`Template not found: ${templateId}/index.html`);
    const templateHTML = await htmlFile.text();

    // ── Business data shortcuts ──────────────────────────────────────────
    const businessName = (clientData as any)?.business_name || intake.business_name || "Business";
    const businessType = (clientData as any)?.business_type || "Service Business";
    const city = intake.business_city || intake.city || "";
    const state = intake.business_state || intake.state || "";
    const phone = intake.business_phone || intake.primary_phone || intake.phone || "";
    const phoneRaw = phone.replace(/\D/g, "");
    const email = intake.business_email || intake.email || "";
    const address = intake.business_address || intake.address || "";
    const yearsInBusiness = intake.years_in_business || "";
    const googleRating = intake.google_rating || "";
    const googleReviewCount = intake.google_review_count || "";
    const aboutStory = intake.about_story || intake.owner_bio_raw || intake.story_started || "";
    const ownerName = intake.owner_name || "";
    const ownerTitle = intake.owner_title || "Owner";
    const noTestimonials = !!intake.no_testimonials;
    const tagline = intake.tagline || "";
    const domain = intake.domain || "";

    const portfolioPhotos: string[] = (Array.isArray(intake.portfolio_photos) ? intake.portfolio_photos : []).filter(Boolean);
    const teamPhotos: string[] = (Array.isArray(intake.team_photos) ? intake.team_photos : []).filter(Boolean);
    const services: any[] = Array.isArray(intake.services) ? intake.services : [];
    const awards: any[] = Array.isArray(intake.awards) ? intake.awards : [];
    const coupons: any[] = Array.isArray(intake.coupons) ? intake.coupons : [];
    const serviceAreas: any[] = Array.isArray(intake.service_areas) ? intake.service_areas : [];
    const testimonials: any[] = Array.isArray(intake.testimonials) ? intake.testimonials : [];
    const faqItems: any[] = Array.isArray(intake.faq_items) ? intake.faq_items : [];

    const showFinancing = !!(callNotes as any)?.show_financing || !!intake.show_financing;

    // ── Resolve photo slots ──────────────────────────────────────────────
    // Priority: client uploads ALWAYS win. Stock only fills empty slots when allowed.
    const allowStock = intake.use_stock_photos !== false; // default true
    const firstServiceName = (services[0] && (typeof services[0] === "string" ? services[0] : services[0]?.name || services[0]?.title)) || "";
    const stockTerms = buildStockSearchTerms(businessType, firstServiceName);

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
          return fetchUnsplashPhoto(stockTerms.map((t) => `${t} ${variant}`));
        }));
        needed.forEach((slot, i) => {
          const url = stockResults[i] || "";
          if (slot === "hero") heroImageUrl = url;
          else if (slot === "about") aboutImageUrl = url;
          else if (slot === "whyus") whyUsImageUrl = url;
        });
      }
    }

    const logoUrlResolved = intake.logo_url || "";
    console.log(`[part1] Photos — hero:${heroImageUrl ? "✓" : "✗"} about:${aboutImageUrl ? "✓" : "✗"} whyus:${whyUsImageUrl ? "✓" : "✗"} logo:${logoUrlResolved ? "✓" : "✗"} (hero_upload=${!!intake.hero_photo_url}, portfolio=${portfolioPhotos.length}, team=${teamPhotos.length}, allowStock=${allowStock})`);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");


    await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

    // ── CALL 1: Generate all copy as JSON ────────────────────────────────
    const serviceNames = services.slice(0, 6).map((s: any) =>
      typeof s === "string" ? s : s?.name || s?.title || ""
    ).filter(Boolean);

    const copyPrompt = `You are a professional copywriter for SiteQueen. Generate website copy for a ${businessType} business. Return ONLY valid JSON — no markdown, no explanation, no code blocks. Start with { and end with }.

CRITICAL: Every field in this JSON must be filled. Empty strings are never acceptable unless the client has explicitly opted out of that section (like no_testimonials). If the client didn't provide information for a field, generate something specific and relevant based on everything you know about this business — their type, services, location, story, and tone. A trades contractor in Utah gets different content than a spa in Miami. Never use generic placeholder text. Every word should feel like it was written specifically for this business.

FIELD-FILLING RULES:
1. Client provided data → use it exactly, incorporating their exact words and phrases verbatim where possible.
2. Client didn't provide data → generate something specific and credible based on the business type (${businessType}), services (${serviceNames.join(", ") || "n/a"}), city (${city}, ${state}), owner story, and tone. Never generic filler.
3. Client explicitly opted out → return empty string ONLY for those specific fields. Currently opted out: ${[noTestimonials ? "TESTIMONIAL_1/2/3_*" : null].filter(Boolean).join(", ") || "none"}.

BUSINESS INFO:
- Name: ${businessName}
- Type: ${businessType}
- City: ${city}, ${state}
- Phone: ${phone}
- Years in business: ${yearsInBusiness || "not provided"}
- Owner name: ${ownerName || "not provided"}
- Owner title: ${ownerTitle}
- Owner story: ${aboutStory || "not provided"}
- What makes them different: ${intake.story_different || "not provided"}
- How they started: ${intake.story_started || "not provided"}
- Ideal customer: ${intake.story_ideal_customer || "not provided"}
- Google rating: ${googleRating || "not provided"}
- Google review count: ${googleReviewCount || "not provided"}
- Services: ${serviceNames.join(", ") || "not provided"}
- Tagline: ${tagline || "not provided"}

CALL NOTES (highest priority — follow exactly):
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
}, null, 2) : "No call notes."}

TONE: Match call notes tone. If not specified: trades = confident and direct, no corporate filler.
BANNED PHRASES: "committed to excellence", "your satisfaction is our priority", "world-class", "seamless", "cutting-edge"
NEVER INVENT: phone numbers, addresses, ratings, certifications, years in business if not provided. Never invent specific Google review counts if google_review_count was not provided — use a soft phrase like "hundreds of" instead of a fake number.
${noTestimonials ? "IMPORTANT: Client has no testimonials. Set TESTIMONIAL_1/2/3_TEXT/NAME/LOCATION to empty string." : "Generate 3 realistic local testimonials referencing actual services in this city."}

Return this exact JSON structure (every field required, no empty strings unless opted out):
{
  "HERO_HEADLINE_LINE1": "2-4 words all caps",
  "HERO_HEADLINE_HIGHLIGHT": "core service 1-3 words all caps",
  "HERO_HEADLINE_LINE2": "2-4 words all caps",
  "HERO_HEADLINE_LINE3": "2-4 words all caps",
  "HERO_SUBHEADING": "1-2 sentences specific to this business, mention city and core service",
  "TRUST_ITEM_3": "one trust badge e.g. FAMILY OWNED — pick one true to this business",
  "ABOUT_HEADLINE": "5-8 word headline that feels personal to this owner",
  "ABOUT_STORY": "3-4 paragraph about story. Use the owner's actual story from intake verbatim where possible. If minimal, expand it warmly and specifically based on what they did provide — owner name, years, city, services, what makes them different. Never generic.",
  "ABOUT_POINT_1": "key differentiator specific to this business",
  "ABOUT_POINT_2": "key differentiator specific to this business",
  "ABOUT_POINT_3": "key differentiator specific to this business",
  "ABOUT_POINT_4": "key differentiator specific to this business",
  "STAT_1_NUMBER": "realistic stat for a ${businessType} business with ${yearsInBusiness || "several"} years experience. Never invent a specific Google review count if google_review_count was not provided.",
  "STAT_1_LABEL": "e.g. JOBS COMPLETED — match the number",
  "STAT_2_NUMBER": "realistic stat — use ${googleRating || "soft phrasing"} for rating if provided",
  "STAT_2_LABEL": "e.g. GOOGLE RATING",
  "STAT_3_NUMBER": "realistic stat for this business type",
  "STAT_3_LABEL": "matching label",
  "STAT_4_NUMBER": "realistic stat",
  "STAT_4_LABEL": "matching label",
  "SERVICES_HEADLINE": "3-5 words all caps",
  "SERVICES_SUBTEXT": "1 sentence specific to this business",
  "SERVICE_1_NAME": "${serviceNames[0] || `plausible primary service a typical ${businessType} business in ${city} would offer`}",
  "SERVICE_1_DESC": "2 sentences specific to this service for a ${businessType} business in ${city}, ${state}",
  "SERVICE_2_NAME": "${serviceNames[1] || `plausible additional service a typical ${businessType} business would offer`}",
  "SERVICE_2_DESC": "2 sentences specific to this service for this business in this location",
  "SERVICE_3_NAME": "${serviceNames[2] || `plausible additional service a typical ${businessType} business would offer`}",
  "SERVICE_3_DESC": "2 sentences specific to this service for this business in this location",
  "SERVICE_4_NAME": "${serviceNames[3] || `plausible additional service a typical ${businessType} business would offer`}",
  "SERVICE_4_DESC": "2 sentences specific to this service for this business in this location",
  "SERVICE_5_NAME": "${serviceNames[4] || `plausible additional service a typical ${businessType} business would offer`}",
  "SERVICE_5_DESC": "2 sentences specific to this service for this business in this location",
  "SERVICE_6_NAME": "${serviceNames[5] || `plausible additional service a typical ${businessType} business would offer`}",
  "SERVICE_6_DESC": "2 sentences specific to this service for this business in this location",
  "EMERGENCY_HEADLINE": "4-6 words all caps e.g. EMERGENCY? WE ARE ON THE WAY.",
  "EMERGENCY_SUBTEXT": "1-2 sentences about availability — only claim 24/7 if it fits this business type",
  "WHY_US_HEADLINE": "4-7 words",
  "WHY_US_1_TITLE": "3-5 word reason customers choose THIS specific business, based on their story and services",
  "WHY_US_1_DESC": "2 sentences specific to this business — reference their actual services or story",
  "WHY_US_2_TITLE": "3-5 word reason customers choose THIS specific business, distinct from #1",
  "WHY_US_2_DESC": "2 sentences specific to this business",
  "WHY_US_3_TITLE": "3-5 word reason customers choose THIS specific business, distinct from #1 and #2",
  "WHY_US_3_DESC": "2 sentences specific to this business",
  "WHY_US_4_TITLE": "3-5 word reason customers choose THIS specific business, distinct from the others",
  "WHY_US_4_DESC": "2 sentences specific to this business",
  "HAPPY_CUSTOMERS": "realistic round number e.g. 500 — do not invent a specific number if google_review_count was not provided, use a soft round figure",
  "REVIEW_PLATFORMS": "e.g. Google and Facebook",
  "TESTIMONIAL_1_TEXT": "realistic 2-3 sentence testimonial referencing an actual service of this business",
  "TESTIMONIAL_1_NAME": "local sounding full name",
  "TESTIMONIAL_1_LOCATION": "${city}, ${state}",
  "TESTIMONIAL_2_TEXT": "different testimonial referencing a different service",
  "TESTIMONIAL_2_NAME": "different local name",
  "TESTIMONIAL_2_LOCATION": "nearby area near ${city}, ${state}",
  "TESTIMONIAL_3_TEXT": "third distinct testimonial",
  "TESTIMONIAL_3_NAME": "different local name",
  "TESTIMONIAL_3_LOCATION": "${city} area",
  "FINANCING_HEADLINE": "financing headline appropriate to this business type",
  "FINANCING_SUBTEXT": "financing offer details appropriate to this business type",
  "SERVICE_AREAS_HEADLINE": "4-6 words all caps",
  "AREA_1": "${city}",
  "AREA_2": "real nearby city or town around ${city}, ${state}",
  "AREA_3": "real nearby city or town around ${city}, ${state} (distinct)",
  "AREA_4": "real nearby city or town around ${city}, ${state} (distinct)",
  "AREA_5": "real nearby city or town around ${city}, ${state} (distinct)",
  "AREA_6": "real nearby city or town around ${city}, ${state} (distinct)",
  "AREA_7": "real nearby city or town around ${city}, ${state} (distinct)",
  "AREA_8": "real nearby city or town around ${city}, ${state} (distinct)",
  "AWARD_1": "relevant industry certification, license, or recognition typical for a ${businessType} business",
  "AWARD_2": "different relevant industry certification or recognition for a ${businessType} business",
  "AWARD_3": "different relevant industry certification or recognition for a ${businessType} business",
  "AWARD_4": "different relevant industry certification or recognition for a ${businessType} business",
  "AWARD_5": "different relevant industry certification or recognition for a ${businessType} business",
  "FAQ_1_Q": "real question a customer of THIS specific ${businessType} business in ${city} would actually ask",
  "FAQ_1_A": "2-4 sentence answer specific to this business, referencing their actual services and location",
  "FAQ_2_Q": "different real question a customer of this business would ask",
  "FAQ_2_A": "2-4 sentence answer specific to this business",
  "FAQ_3_Q": "different real question a customer of this business would ask",
  "FAQ_3_A": "2-4 sentence answer specific to this business",
  "FAQ_4_Q": "different real question a customer of this business would ask",
  "FAQ_4_A": "2-4 sentence answer specific to this business",
  "FAQ_5_Q": "different real question a customer of this business would ask",
  "FAQ_5_A": "2-4 sentence answer specific to this business",
  "FAQ_6_Q": "different real question a customer of this business would ask",
  "FAQ_6_A": "2-4 sentence answer specific to this business",
  "FINAL_CTA_HEADLINE": "5-8 words all caps",
  "FINAL_CTA_SUBTEXT": "1-2 sentences urgency and reassurance specific to this business",
  "FOOTER_TAGLINE": "short memorable tagline specific to this business — use their exact words if they provided a tagline (${tagline || "none provided"}), otherwise write a 5-8 word tagline that captures this business's character"
}`;

    console.log("[part1] Calling Claude for copy...");
    const copyResult = await callAI(ANTHROPIC_API_KEY, copyPrompt, "copy");

    let copy: any = {};
    try {
      copy = JSON.parse(stripMarkdown(copyResult.text));
    } catch (e) {
      console.error("[part1] JSON parse failed:", e);
      console.error("[part1] Raw:", copyResult.text.substring(0, 500));
      throw new Error("Claude returned invalid JSON for copy");
    }

    await supabase.from("sites").update({ generation_progress: "filling_template" } as any).eq("client_id", clientId);

    // ── Fill all placeholders ────────────────────────────────────────────
    let html = templateHTML;

    const fill: Record<string, string> = {
      "{{BUSINESS_NAME}}": businessName,
      "{{BUSINESS_PHONE}}": phone,
      "{{BUSINESS_EMAIL}}": email,
      "{{BUSINESS_ADDRESS}}": address,
      "{{BUSINESS_CITY}}": city,
      "{{BUSINESS_STATE}}": state,
      "{{GOOGLE_RATING}}": String(googleRating || "4.9"),
      "{{GOOGLE_REVIEW_COUNT}}": String(googleReviewCount || "100"),
      "{{SERVICE_AREA}}": intake.service_area || (city ? `${city} & Surrounding Areas` : ""),
      "{{YEARS_IN_BUSINESS}}": String(yearsInBusiness || "10"),
      "{{COPYRIGHT_YEAR}}": String(new Date().getFullYear()),
      "{{CITY}}": city,
      "{{CLIENT_TYPE}}": "CUSTOMERS",
      "{{HAPPY_CUSTOMERS}}": copy.HAPPY_CUSTOMERS || "500",
      "{{REVIEW_PLATFORMS}}": copy.REVIEW_PLATFORMS || "Google",
      // Hero
      "{{HERO_HEADLINE_LINE1}}": copy.HERO_HEADLINE_LINE1 || "",
      "{{HERO_HEADLINE_HIGHLIGHT}}": copy.HERO_HEADLINE_HIGHLIGHT || "",
      "{{HERO_HEADLINE_LINE2}}": copy.HERO_HEADLINE_LINE2 || "",
      "{{HERO_HEADLINE_LINE3}}": copy.HERO_HEADLINE_LINE3 || "",
      "{{HERO_SUBHEADING}}": copy.HERO_SUBHEADING || "",
      "{{TRUST_ITEM_3}}": copy.TRUST_ITEM_3 || "FAMILY OWNED",
      // About
      "{{ABOUT_HEADLINE}}": copy.ABOUT_HEADLINE || "",
      "{{ABOUT_STORY}}": copy.ABOUT_STORY || "",
      "{{ABOUT_POINT_1}}": copy.ABOUT_POINT_1 || "",
      "{{ABOUT_POINT_2}}": copy.ABOUT_POINT_2 || "",
      "{{ABOUT_POINT_3}}": copy.ABOUT_POINT_3 || "",
      "{{ABOUT_POINT_4}}": copy.ABOUT_POINT_4 || "",
      // Stats
      "{{STAT_1_NUMBER}}": copy.STAT_1_NUMBER || "500+",
      "{{STAT_1_LABEL}}": copy.STAT_1_LABEL || "JOBS COMPLETED",
      "{{STAT_2_NUMBER}}": copy.STAT_2_NUMBER || (googleRating ? `${googleRating}★` : "4.9★"),
      "{{STAT_2_LABEL}}": copy.STAT_2_LABEL || "GOOGLE RATING",
      "{{STAT_3_NUMBER}}": copy.STAT_3_NUMBER || "24/7",
      "{{STAT_3_LABEL}}": copy.STAT_3_LABEL || "EMERGENCY SERVICE",
      "{{STAT_4_NUMBER}}": copy.STAT_4_NUMBER || "100%",
      "{{STAT_4_LABEL}}": copy.STAT_4_LABEL || "SATISFACTION GUARANTEED",
      // Services
      "{{SERVICES_HEADLINE}}": copy.SERVICES_HEADLINE || "OUR SERVICES",
      "{{SERVICES_SUBTEXT}}": copy.SERVICES_SUBTEXT || "",
      "{{SERVICE_1_NAME}}": copy.SERVICE_1_NAME || serviceNames[0] || "",
      "{{SERVICE_1_DESC}}": copy.SERVICE_1_DESC || "",
      "{{SERVICE_2_NAME}}": copy.SERVICE_2_NAME || serviceNames[1] || "",
      "{{SERVICE_2_DESC}}": copy.SERVICE_2_DESC || "",
      "{{SERVICE_3_NAME}}": copy.SERVICE_3_NAME || serviceNames[2] || "",
      "{{SERVICE_3_DESC}}": copy.SERVICE_3_DESC || "",
      "{{SERVICE_4_NAME}}": copy.SERVICE_4_NAME || serviceNames[3] || "",
      "{{SERVICE_4_DESC}}": copy.SERVICE_4_DESC || "",
      "{{SERVICE_5_NAME}}": copy.SERVICE_5_NAME || serviceNames[4] || "",
      "{{SERVICE_5_DESC}}": copy.SERVICE_5_DESC || "",
      "{{SERVICE_6_NAME}}": copy.SERVICE_6_NAME || serviceNames[5] || "",
      "{{SERVICE_6_DESC}}": copy.SERVICE_6_DESC || "",
      // Emergency
      "{{EMERGENCY_HEADLINE}}": copy.EMERGENCY_HEADLINE || "EMERGENCY? WE'RE ON THE WAY.",
      "{{EMERGENCY_SUBTEXT}}": copy.EMERGENCY_SUBTEXT || "",
      // Why us
      "{{WHY_US_HEADLINE}}": copy.WHY_US_HEADLINE || "",
      "{{WHY_US_1_TITLE}}": copy.WHY_US_1_TITLE || "",
      "{{WHY_US_1_DESC}}": copy.WHY_US_1_DESC || "",
      "{{WHY_US_2_TITLE}}": copy.WHY_US_2_TITLE || "",
      "{{WHY_US_2_DESC}}": copy.WHY_US_2_DESC || "",
      "{{WHY_US_3_TITLE}}": copy.WHY_US_3_TITLE || "",
      "{{WHY_US_3_DESC}}": copy.WHY_US_3_DESC || "",
      "{{WHY_US_4_TITLE}}": copy.WHY_US_4_TITLE || "",
      "{{WHY_US_4_DESC}}": copy.WHY_US_4_DESC || "",
      // Testimonials
      "{{TESTIMONIAL_1_TEXT}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_TEXT || ""),
      "{{TESTIMONIAL_1_NAME}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_NAME || ""),
      "{{TESTIMONIAL_1_LOCATION}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_LOCATION || city),
      "{{TESTIMONIAL_2_TEXT}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_TEXT || ""),
      "{{TESTIMONIAL_2_NAME}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_NAME || ""),
      "{{TESTIMONIAL_2_LOCATION}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_LOCATION || city),
      "{{TESTIMONIAL_3_TEXT}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_TEXT || ""),
      "{{TESTIMONIAL_3_NAME}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_NAME || ""),
      "{{TESTIMONIAL_3_LOCATION}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_LOCATION || city),
      // Financing
      "{{FINANCING_HEADLINE}}": showFinancing ? (copy.FINANCING_HEADLINE || "FLEXIBLE FINANCING AVAILABLE") : "",
      "{{FINANCING_SUBTEXT}}": showFinancing ? (copy.FINANCING_SUBTEXT || "") : "",
      // Service areas
      "{{SERVICE_AREAS_HEADLINE}}": copy.SERVICE_AREAS_HEADLINE || `SERVING ${city.toUpperCase()} & BEYOND`,
      "{{AREA_1}}": serviceAreas[0] ? (typeof serviceAreas[0] === "string" ? serviceAreas[0] : serviceAreas[0].name) : (copy.AREA_1 || city),
      "{{AREA_2}}": serviceAreas[1] ? (typeof serviceAreas[1] === "string" ? serviceAreas[1] : serviceAreas[1].name) : (copy.AREA_2 || ""),
      "{{AREA_3}}": serviceAreas[2] ? (typeof serviceAreas[2] === "string" ? serviceAreas[2] : serviceAreas[2].name) : (copy.AREA_3 || ""),
      "{{AREA_4}}": serviceAreas[3] ? (typeof serviceAreas[3] === "string" ? serviceAreas[3] : serviceAreas[3].name) : (copy.AREA_4 || ""),
      "{{AREA_5}}": serviceAreas[4] ? (typeof serviceAreas[4] === "string" ? serviceAreas[4] : serviceAreas[4].name) : (copy.AREA_5 || ""),
      "{{AREA_6}}": serviceAreas[5] ? (typeof serviceAreas[5] === "string" ? serviceAreas[5] : serviceAreas[5].name) : (copy.AREA_6 || ""),
      "{{AREA_7}}": serviceAreas[6] ? (typeof serviceAreas[6] === "string" ? serviceAreas[6] : serviceAreas[6].name) : (copy.AREA_7 || ""),
      "{{AREA_8}}": serviceAreas[7] ? (typeof serviceAreas[7] === "string" ? serviceAreas[7] : serviceAreas[7].name) : (copy.AREA_8 || ""),
      // Awards
      "{{AWARD_1}}": awards[0] ? (typeof awards[0] === "string" ? awards[0] : awards[0].name) : (copy.AWARD_1 || ""),
      "{{AWARD_2}}": awards[1] ? (typeof awards[1] === "string" ? awards[1] : awards[1].name) : (copy.AWARD_2 || ""),
      "{{AWARD_3}}": awards[2] ? (typeof awards[2] === "string" ? awards[2] : awards[2].name) : (copy.AWARD_3 || ""),
      "{{AWARD_4}}": awards[3] ? (typeof awards[3] === "string" ? awards[3] : awards[3].name) : (copy.AWARD_4 || ""),
      "{{AWARD_5}}": awards[4] ? (typeof awards[4] === "string" ? awards[4] : awards[4].name) : (copy.AWARD_5 || ""),
      // FAQ
      "{{FAQ_1_Q}}": faqItems[0]?.question || copy.FAQ_1_Q || "",
      "{{FAQ_1_A}}": faqItems[0]?.answer || copy.FAQ_1_A || "",
      "{{FAQ_2_Q}}": faqItems[1]?.question || copy.FAQ_2_Q || "",
      "{{FAQ_2_A}}": faqItems[1]?.answer || copy.FAQ_2_A || "",
      "{{FAQ_3_Q}}": faqItems[2]?.question || copy.FAQ_3_Q || "",
      "{{FAQ_3_A}}": faqItems[2]?.answer || copy.FAQ_3_A || "",
      "{{FAQ_4_Q}}": faqItems[3]?.question || copy.FAQ_4_Q || "",
      "{{FAQ_4_A}}": faqItems[3]?.answer || copy.FAQ_4_A || "",
      "{{FAQ_5_Q}}": faqItems[4]?.question || copy.FAQ_5_Q || "",
      "{{FAQ_5_A}}": faqItems[4]?.answer || copy.FAQ_5_A || "",
      "{{FAQ_6_Q}}": faqItems[5]?.question || copy.FAQ_6_Q || "",
      "{{FAQ_6_A}}": faqItems[5]?.answer || copy.FAQ_6_A || "",
      // Final CTA
      "{{FINAL_CTA_HEADLINE}}": copy.FINAL_CTA_HEADLINE || "READY TO GET STARTED?",
      "{{FINAL_CTA_SUBTEXT}}": copy.FINAL_CTA_SUBTEXT || "",
      // Footer
      "{{FOOTER_TAGLINE}}": copy.FOOTER_TAGLINE || tagline || "",
      "{{BUSINESS_NAME_PART1}}": businessName,
      "{{BUSINESS_NAME_PART2}}": "",
      // Images — client uploads first, stock fills only empty slots
      "{{HERO_IMAGE_URL}}": heroImageUrl,
      "{{ABOUT_IMAGE_URL}}": aboutImageUrl,
      "{{WHY_US_IMAGE_URL}}": whyUsImageUrl,
      "{{LOGO_URL}}": logoUrlResolved,
      "{{LOGO_HTML}}": logoUrlResolved
        ? `<img src="${logoUrlResolved}" alt="${businessName} logo" class="logo-img" />`
        : `<div class="logo-icon"><svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>`,
      // Service images — cycle through any remaining portfolio photos for additional slots
      "{{SERVICE_1_IMAGE_URL}}": pickServiceImage(0, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_2_IMAGE_URL}}": pickServiceImage(1, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_3_IMAGE_URL}}": pickServiceImage(2, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{TRANSFORMATION_IMAGE_URL}}": portfolioPhotos[3] || portfolioPhotos[0] || aboutImageUrl,
      "{{LEAD_MAGNET_IMAGE_URL}}": portfolioPhotos[4] || portfolioPhotos[0] || heroImageUrl,
    };


    for (const [key, value] of Object.entries(fill)) {
      html = html.split(key).join(value);
    }

    // Clean up any remaining unfilled placeholders
    html = html.replace(/\{\{[^}]+\}\}/g, "");

    // Tag interactive elements + section milestones for v3 analytics
    html = addAnalyticsTags(html, "home");

    // Inject hosted-tracker loader snippet before </body> (tracker-v4)
    // Tracker JS lives at the tracker-v4 edge function (immutable per version).
    // To roll out a new version, deploy tracker-v4 and bump the URL below.
    // Maps clients.plan -> tracker tier vocabulary. Only 'pro' enables Premium events.
    const planToTrackerTier = (plan: string | null | undefined): string =>
      plan === "pro" ? "premium" : "growth";
    const clientTier = planToTrackerTier((clientData as any)?.plan);
    const analyticsScript = `
<script async
  src="${supabaseUrl}/functions/v1/tracker-v5"
  data-client-id="${clientId}"
  data-endpoint="${supabaseUrl}/functions/v1/track-event"
  data-form-endpoint="${supabaseUrl}/functions/v1/track-form-submission"
  data-tier="${clientTier}"></script>`;
    html = html.replace("</body>", analyticsScript + "\n</body>");


    // ── Upload to Hostinger staging ──────────────────────────────────────
    await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

    const stagingHTML = injectNoindex(html);

    try {
      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/index.html`, stagingHTML);
      console.log("[part1] ✓ index.html → Hostinger");
    } catch (e: any) {
      throw new Error(`Hostinger upload failed: ${e.message}`);
    }

    const { error: backupErr } = await supabase.storage
      .from("generated-sites")
      .upload(`${clientId}/deploy/index.html`, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });
    if (backupErr) throw new Error(`Failed to save deploy backup: ${backupErr.message}`);

    // Persist resolved data for extra-pages to reuse (esp. photo decisions)
    const copyDataPayload = {
      businessName, businessType, city, state, phone, phoneRaw, email, address,
      yearsInBusiness, googleRating, googleReviewCount, tagline, ownerName, ownerTitle,
      logoUrl: logoUrlResolved, serviceNames, noTestimonials,
      portfolioPhotos, teamPhotos,
      heroImageUrl, aboutImageUrl, whyUsImageUrl,
      stockTerms, allowStock,
      copy,
    };
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/copy-data.json`,
      new Blob([JSON.stringify(copyDataPayload)], { type: "application/json" }),
      { upsert: true, contentType: "application/json" }
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
      tokens_used: copyResult.outputTokens,
      generation_notes: `Template-fill. Template: ${templateId}. Tokens: ${copyResult.outputTokens}.`,
    } as any);

    console.log(`[part1] ✓ Complete → ${stagingURL}`);

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
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

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
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, messages: [{ role: "user", content }] }),
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
      lastErr = err.name === "AbortError" ? new Error(`Claude ${label} timed out after ${TIMEOUT_MS / 1000}s`) : err as Error;
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
    await supabase.from("sites").update({ generation_status: "failed", generation_error: message }).eq("client_id", clientId);
    await supabase.from("generation_logs").insert({ client_id: clientId, status: "failed", error_message: message });
  } catch (e) {
    console.error("[part1] failed to mark failure:", e);
  }
}

// ── Photo helpers ─────────────────────────────────────────────────────
// Build specific Unsplash search terms based on the client's business type and first service.
// e.g. excavation → "excavator digging site", plumbing → "plumber pipe repair"
export function buildStockSearchTerms(businessType: string, firstService: string): string[] {
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
  // Fallback uses the actual context — still client-specific
  const safe = ctx.trim().replace(/\s+/g, " ").substring(0, 60);
  return safe ? [safe, `${safe} professional service`, `professional ${businessType || "small business"}`] : ["professional small business service", "local business team"];
}

export async function fetchUnsplashPhoto(searchTerms: string[]): Promise<string> {
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
export function pickServiceImage(index: number, portfolioPhotos: string[], fallbacks: string[]): string {
  if (portfolioPhotos[index]) return portfolioPhotos[index];
  // cycle through portfolio
  if (portfolioPhotos.length > 0) return portfolioPhotos[index % portfolioPhotos.length];
  // fall back to any non-empty resolved image (hero/about/whyus)
  return fallbacks.find((u) => !!u) || "";
}


// ── Analytics tagging helpers (v3) ─────────────────────────────────────
// Adds data-sq-track to CTAs and data-sq-milestone to key sections so the
// tracker fires click/element_visible events with friendly names.
// Idempotent: skipped if data-sq-track already present.
function addAnalyticsTags(html: string, pageName: string): string {
  if (/\bdata-sq-track=/.test(html)) return html;

  let firstQuoteTagged = false;
  // 1. Quote buttons/anchors → quote_click (+ milestone on first home-page match)
  html = html.replace(
    /(<(a|button)\b[^>]*?)(>[\s\S]{0,200}?(?:get\s+a\s+|request\s+a\s+|free\s+)?quote[\s\S]{0,200}?<\/\2>)/gi,
    (_m, open, _tag, rest) => {
      let extras = ` data-sq-track="quote_click"`;
      if (!firstQuoteTagged && pageName === "home") {
        extras += ` data-sq-milestone="get_a_quote_cta"`;
        firstQuoteTagged = true;
      }
      return open + extras + rest;
    },
  );

  // 2. Hero CTA fallback: if no quote button on this page, tag the first .btn-primary / .cta
  if (!firstQuoteTagged) {
    html = html.replace(
      /(<a\b[^>]*class=["'][^"']*(?:btn-primary|cta-primary|hero-cta)[^"']*["'][^>]*?)(>)/i,
      (_m, open, close) => `${open} data-sq-track="cta_${pageName}_hero"${close}`,
    );
  }

  // 3. Learn More links
  html = html.replace(
    /(<(a|button)\b[^>]*?)(>[\s\S]{0,100}?learn\s+more[\s\S]{0,100}?<\/\2>)/gi,
    (_m, open, _tag, rest) => `${open} data-sq-track="learn_more_${pageName}"${rest}`,
  );

  // 4. PDF download anchors
  html = html.replace(
    /(<a\b[^>]*?\bhref=["'][^"']*\.pdf[^"'#?]*[^"']*["'][^>]*?)(>)/gi,
    (_m, open, close) => `${open} data-sq-track="pdf_download"${close}`,
  );

  // 5. Footer milestone (every page)
  html = html.replace(
    /(<footer\b)([^>]*?)(>)/i,
    (_m, tag, attrs, close) =>
      attrs.includes("data-sq-milestone") ? _m : `${tag}${attrs} data-sq-milestone="footer"${close}`,
  );

  // 6. Page-specific milestones
  if (pageName === "contact") {
    html = html.replace(
      /(<form\b)([^>]*?)(>)/i,
      (_m, t, a, c) => (a.includes("data-sq-milestone") ? _m : `${t}${a} data-sq-milestone="contact_form"${c}`),
    );
  }
  if (pageName === "services") {
    html = html.replace(
      /(<(?:section|ul|div)\b[^>]*class=["'][^"']*service[^"']*["'][^>]*)(>)/i,
      (_m, o, c) => (o.includes("data-sq-milestone") ? _m : `${o} data-sq-milestone="service_list"${c}`),
    );
    html = html.replace(
      /(<form\b)([^>]*?)(>)/i,
      (_m, t, a, c) => (a.includes("data-sq-milestone") ? _m : `${t}${a} data-sq-milestone="contact_form"${c}`),
    );
  }
  if (pageName === "about") {
    html = html.replace(
      /(<section\b[^>]*class=["'][^"']*(?:team|our-team)[^"']*["'][^>]*)(>)/i,
      (_m, o, c) => (o.includes("data-sq-milestone") ? _m : `${o} data-sq-milestone="our_team"${c}`),
    );
    html = html.replace(
      /(<section\b[^>]*class=["'][^"']*(?:story|about)[^"']*["'][^>]*)(>)/i,
      (_m, o, c) => (o.includes("data-sq-milestone") ? _m : `${o} data-sq-milestone="our_story"${c}`),
    );
  }
  if (pageName === "gallery") {
    html = html.replace(
      /(<(?:div|section|ul)\b[^>]*class=["'][^"']*(?:gallery|portfolio|grid)[^"']*["'][^>]*)(>)/i,
      (_m, o, c) => (o.includes("data-sq-milestone") ? _m : `${o} data-sq-milestone="gallery_grid"${c}`),
    );
  }

  return html;
}
