import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";
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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // ── Fetch all data ───────────────────────────────────────────────────
    const { data: siteData } = await supabase.from("sites").select("*").eq("client_id", clientId).single();
    const { data: clientData } = await supabase.from("clients").select("*").eq("id", clientId).single();
    const intake: any = (siteData as any)?.intake_data || {};
    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    // ── Load copy-data saved by part1 ────────────────────────────────────
    // Part1 saves a copy-data.json with the generated copy and resolved brand info
    const { data: copyFile } = await supabase.storage
      .from("generated-sites")
      .download(`${clientId}/copy-data.json`);

    let savedCopy: any = {};
    if (copyFile) {
      try { savedCopy = JSON.parse(await copyFile.text()); } catch { /* use empty */ }
    }

    // ── Business data ────────────────────────────────────────────────────
    const businessName = savedCopy.businessName || (clientData as any)?.business_name || intake.business_name || "Business";
    const businessType = savedCopy.businessType || (clientData as any)?.business_type || "Service Business";
    const city = savedCopy.city || intake.business_city || intake.city || "";
    const state = savedCopy.state || intake.business_state || intake.state || "";
    const phone = savedCopy.phone || intake.business_phone || intake.primary_phone || "";
    const phoneRaw = savedCopy.phoneRaw || phone.replace(/\D/g, "");
    const email = savedCopy.email || intake.business_email || "";
    const address = savedCopy.address || intake.business_address || "";
    const yearsInBusiness = savedCopy.yearsInBusiness || intake.years_in_business || "";
    const googleRating = savedCopy.googleRating || intake.google_rating || "4.9";
    const googleReviewCount = savedCopy.googleReviewCount || intake.google_review_count || "127";
    const tagline = savedCopy.tagline || intake.tagline || "";
    const ownerName = savedCopy.ownerName || intake.owner_name || "";
    const ownerTitle = savedCopy.ownerTitle || intake.owner_title || "Owner";
    const logoUrl = savedCopy.logoUrl || intake.logo_url || "";
    const primaryColor = savedCopy.primaryColor || "#cb2020";
    const accentColor = savedCopy.accentColor || "#f6a823";
    const fonts = savedCopy.fonts || { heading: "Oswald", body: "Open Sans", googleUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Open+Sans:wght@400;600&display=swap" };
    const serviceNames: string[] = savedCopy.serviceNames || [];
    const noTestimonials = savedCopy.noTestimonials || !!intake.no_testimonials;
    const mapEmbedUrl = intake.map_embed_url || "";
    const portfolioPhotos: string[] = (
      Array.isArray(savedCopy.portfolioPhotos) ? savedCopy.portfolioPhotos
      : Array.isArray(intake.portfolio_photos) ? intake.portfolio_photos
      : []
    ).filter(Boolean);
    const teamPhotos: string[] = (
      Array.isArray(savedCopy.teamPhotos) ? savedCopy.teamPhotos
      : Array.isArray(intake.team_photos) ? intake.team_photos
      : []
    ).filter(Boolean);

    // Previously generated homepage copy
    const homeCopy = savedCopy.copy || {};
    const serviceAreas: any[] = Array.isArray(intake.service_areas) ? intake.service_areas : [];
    const coupons: any[] = Array.isArray(intake.coupons) ? intake.coupons : [];
    const aboutStory = intake.about_section_generated || intake.owner_bio_generated || intake.about_story || intake.owner_bio_raw || "";

    // ── Template ID ──────────────────────────────────────────────────────
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero", professional: "professional",
      warm: "warm-welcome", local: "local-favorite", modern: "modern-business",
    };
    const selectedTemplate = (callNotes as any)?.template_selected || intake?.template_selected || intake?.template_id;
    const templateId = selectedTemplate ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate) : "trades-hero";

    // ── Logo HTML ────────────────────────────────────────────────────────
    const logoHTML = logoUrl
      ? `<img src="${logoUrl}" alt="${businessName} logo" class="logo-img" />`
      : `<div class="logo-icon"><svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>`;

    // ── Map HTML ─────────────────────────────────────────────────────────
    const mapHTML = mapEmbedUrl
      ? `<iframe class="map-iframe" src="${mapEmbedUrl}" allowfullscreen loading="lazy"></iframe>`
      : `<div class="map-placeholder"><p>📍 SERVING ${(intake.service_area || city).toUpperCase()} &amp; SURROUNDING AREAS</p></div>`;

    // ── Coupon data ──────────────────────────────────────────────────────
    const couponOffer = coupons[0] ? `$${coupons[0].amount} OFF` : "$50 OFF";
    const couponDesc = coupons[0]?.description || "ANY JOB OVER $250";
    const couponNote = coupons[0] ? `Expires ${coupons[0].expiry || "12/31"}. Code: ${coupons[0].code || "SAVE50"}` : "Mention this coupon when you book. Cannot combine with other offers.";

    // ── Shared fills used by all pages ───────────────────────────────────
    const sharedFill: Record<string, string> = {
      "{{BUSINESS_NAME}}": businessName,
      "{{BUSINESS_PHONE}}": phone,
      "{{BUSINESS_PHONE_RAW}}": phoneRaw,
      "{{BUSINESS_EMAIL}}": email,
      "{{BUSINESS_ADDRESS}}": address,
      "{{BUSINESS_CITY}}": city,
      "{{BUSINESS_STATE}}": state,
      "{{GOOGLE_RATING}}": String(googleRating),
      "{{GOOGLE_REVIEW_COUNT}}": String(googleReviewCount),
      "{{SERVICE_AREA}}": intake.service_area || (city ? `${city} & Surrounding Areas` : ""),
      "{{COPYRIGHT_YEAR}}": String(new Date().getFullYear()),
      "{{FOOTER_TAGLINE}}": homeCopy.FOOTER_TAGLINE || tagline || "",
      "{{FOOTER_NEWSLETTER_TEXT}}": homeCopy.FOOTER_NEWSLETTER_TEXT || "Sign up for exclusive deals and expert tips.",
      "{{LOGO_HTML}}": logoHTML,
      "{{MAP_HTML}}": mapHTML,
      "{{GOOGLE_FONTS_URL}}": fonts.googleUrl,
      "{{SERVICE_1_NAME}}": homeCopy.SERVICE_1_NAME || serviceNames[0] || "",
      "{{SERVICE_2_NAME}}": homeCopy.SERVICE_2_NAME || serviceNames[1] || "",
      "{{SERVICE_3_NAME}}": homeCopy.SERVICE_3_NAME || serviceNames[2] || "",
      "{{SERVICE_4_NAME}}": homeCopy.SERVICE_4_NAME || serviceNames[3] || "",
      "{{SERVICE_5_NAME}}": homeCopy.SERVICE_5_NAME || serviceNames[4] || "",
      "{{SERVICE_6_NAME}}": homeCopy.SERVICE_6_NAME || serviceNames[5] || "",
      "{{EMERGENCY_HEADLINE}}": homeCopy.EMERGENCY_HEADLINE || "EMERGENCY? WE'RE ON THE WAY.",
      "{{COUPON_OFFER}}": couponOffer,
      "{{COUPON_DESC}}": couponDesc,
      "{{COUPON_NOTE}}": couponNote,
      "{{AREA_1}}": serviceAreas[0] ? (typeof serviceAreas[0] === "string" ? serviceAreas[0] : serviceAreas[0].name) : (homeCopy.AREA_1 || city),
      "{{AREA_2}}": serviceAreas[1] ? (typeof serviceAreas[1] === "string" ? serviceAreas[1] : serviceAreas[1].name) : (homeCopy.AREA_2 || ""),
      "{{AREA_3}}": serviceAreas[2] ? (typeof serviceAreas[2] === "string" ? serviceAreas[2] : serviceAreas[2].name) : (homeCopy.AREA_3 || ""),
    };

    // ── Analytics script ─────────────────────────────────────────────────
    const analyticsScript = `
<script>
(function() {
  var CLIENT_ID = '${clientId}';
  var ENDPOINT = '${supabaseUrl}/functions/v1/track-event';
  function getDevice() { return /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'; }
  function getSid() { var s = sessionStorage.getItem('sq_sid'); if (!s) { s = Math.random().toString(36).substr(2,9); sessionStorage.setItem('sq_sid',s); } return s; }
  function track(type, meta) { fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ client_id:CLIENT_ID, event_type:type, page_path:window.location.pathname, page_title:document.title, referrer:document.referrer, device_type:getDevice(), session_id:getSid(), metadata:meta||{} }) }).catch(function(){}); }
  track('page_view');
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a) return;
    if (a.href && a.href.indexOf('tel:') === 0) track('phone_click');
    if (a.href && a.href.indexOf('mailto:') === 0) track('email_click');
    if (a.classList.contains('btn')) track('cta_click', {text: a.textContent.trim().substring(0,50)});
  });
  document.addEventListener('submit', function(e) { track('form_submission', {form_id: e.target.id || 'unknown'}); });
})();
</script>`;

    const generated: string[] = [];
    const failed: string[] = [];

    // ════════════════════════════════════════════════════════════════════
    // ABOUT PAGE
    // ════════════════════════════════════════════════════════════════════
    try {
      const { data: aboutFile } = await supabase.storage.from("templates").download(`${templateId}-about.html`);
      if (!aboutFile) throw new Error(`Template not found: ${templateId}-about.html`);
      let aboutHTML = await aboutFile.text();

      // Generate about-specific copy
      const aboutPrompt = `You are a professional copywriter for SiteQueen. Generate copy for the ABOUT page of ${businessName}, a ${businessType} in ${city}, ${state}.

OWNER INFO:
- Name: ${ownerName || "not provided"}
- Title: ${ownerTitle}
- Years in business: ${yearsInBusiness || "not provided"}
- About story: ${aboutStory || "not provided"}
- What makes them different: ${intake.story_different || "not provided"}
- How they started: ${intake.story_started || "not provided"}
- Problem they solve: ${intake.story_problem || "not provided"}

CALL NOTES (highest priority):
${callNotes ? JSON.stringify({
  their_story: (callNotes as any).their_story,
  tone_of_voice: (callNotes as any).tone_of_voice,
  tone_custom: (callNotes as any).tone_custom,
  expert_additions: (callNotes as any).expert_additions,
  expert_avoid: (callNotes as any).expert_avoid,
  exact_phrases: (callNotes as any).exact_phrases,
  vibe_notes: (callNotes as any).vibe_notes,
  final_notes: (callNotes as any).final_notes,
}, null, 2) : "No call notes."}

TONE: Match call notes tone. If not specified: trades = confident and direct. Never use corporate filler phrases.

Return ONLY valid JSON. No markdown. No explanation:
{
  "ABOUT_PAGE_SUBHEADING": "1 sentence about this business — location, years, specialty",
  "ABOUT_STORY_P1": "first paragraph — how they started, their background. Personal and specific. 3-4 sentences.",
  "ABOUT_STORY_P2": "second paragraph — their approach, what drives them, their values. 3-4 sentences.",
  "ABOUT_STORY_P3": "third paragraph — their commitment, what sets them apart. 2-3 sentences.",
  "EXPECT_1": "thing clients can always expect from them — specific to this business",
  "EXPECT_2": "thing clients can always expect",
  "EXPECT_3": "thing clients can always expect",
  "EXPECT_4": "thing clients can always expect",
  "EXPECT_5": "thing clients can always expect",
  "EXPECT_6": "thing clients can always expect",
  "WHY_US_BADGE": "short badge text e.g. #1 CONTRACTOR",
  "WHY_US_TAGLINE": "e.g. FAMILY-OWNED · LICENSED · SINCE ${yearsInBusiness ? String(new Date().getFullYear() - parseInt(String(yearsInBusiness))) : "2010"}",
  "WHY_US_STORY": "2-3 sentences about why clients trust this business. Reference real details.",
  "AREA_GROUP_1_NAME": "${city.toUpperCase()} AREA",
  "AREA_GROUP_1_CITIES": "list of 6-8 nearby cities/areas separated by · ",
  "AREA_GROUP_2_NAME": "second region name e.g. COUNTY NAME or nearby city cluster",
  "AREA_GROUP_2_CITIES": "cities in that region separated by · ",
  "AREA_GROUP_3_NAME": "third region or leave empty string if only 2 regions",
  "AREA_GROUP_3_CITIES": "cities or empty string"
}`;

      console.log(`[extra-pages] Generating about copy...`);
      const aboutCopyResult = await callAI(ANTHROPIC_API_KEY, aboutPrompt, "about-copy");
      let aboutCopy: any = {};
      try {
        aboutCopy = JSON.parse(stripMarkdown(aboutCopyResult.text));
      } catch (e) {
        console.error("[extra-pages] About copy JSON parse failed:", e);
      }

      // Inject CSS variables
      aboutHTML = injectCSSVars(aboutHTML, primaryColor, accentColor, fonts);

      // Fill all placeholders
      const aboutFill: Record<string, string> = {
        ...sharedFill,
        "{{ABOUT_PAGE_SUBHEADING}}": aboutCopy.ABOUT_PAGE_SUBHEADING || `Serving ${city} & Surrounding Areas for ${yearsInBusiness || "Over 10"} Years.`,
        "{{ABOUT_STORY_P1}}": aboutCopy.ABOUT_STORY_P1 || "",
        "{{ABOUT_STORY_P2}}": aboutCopy.ABOUT_STORY_P2 || "",
        "{{ABOUT_STORY_P3}}": aboutCopy.ABOUT_STORY_P3 || "",
        "{{EXPECT_1}}": aboutCopy.EXPECT_1 || "Providing free, written estimates before any work begins",
        "{{EXPECT_2}}": aboutCopy.EXPECT_2 || "Informing you about every available option and price point",
        "{{EXPECT_3}}": aboutCopy.EXPECT_3 || "Leaving every job site as clean as we found it",
        "{{EXPECT_4}}": aboutCopy.EXPECT_4 || "Backing every job with our satisfaction guarantee — in writing",
        "{{EXPECT_5}}": aboutCopy.EXPECT_5 || "Available 24/7 for true emergencies",
        "{{EXPECT_6}}": aboutCopy.EXPECT_6 || "Treating every customer like a neighbor",
        "{{WHY_US_BADGE}}": aboutCopy.WHY_US_BADGE || "#1 CONTRACTOR",
        "{{WHY_US_TAGLINE}}": aboutCopy.WHY_US_TAGLINE || "FAMILY-OWNED · LICENSED & INSURED",
        "{{WHY_US_STORY}}": aboutCopy.WHY_US_STORY || "",
        "{{AREA_GROUP_1_NAME}}": aboutCopy.AREA_GROUP_1_NAME || `${city.toUpperCase()} AREA`,
        "{{AREA_GROUP_1_CITIES}}": aboutCopy.AREA_GROUP_1_CITIES || city,
        "{{AREA_GROUP_2_NAME}}": aboutCopy.AREA_GROUP_2_NAME || "",
        "{{AREA_GROUP_2_CITIES}}": aboutCopy.AREA_GROUP_2_CITIES || "",
        "{{AREA_GROUP_3_NAME}}": aboutCopy.AREA_GROUP_3_NAME || "",
        "{{AREA_GROUP_3_CITIES}}": aboutCopy.AREA_GROUP_3_CITIES || "",
      };

      for (const [key, value] of Object.entries(aboutFill)) {
        aboutHTML = aboutHTML.split(key).join(value);
      }
      aboutHTML = aboutHTML.replace(/\{\{[^}]+\}\}/g, "");
      aboutHTML = aboutHTML.replace("</body>", analyticsScript + "\n</body>");

      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/about.html`, injectNoindex(aboutHTML));
      await supabase.storage.from("generated-sites").upload(
        `${clientId}/deploy/about.html`,
        new Blob([aboutHTML], { type: "text/html" }),
        { upsert: true, contentType: "text/html; charset=utf-8" }
      );

      generated.push("about");
      console.log(`[extra-pages] ✓ about.html (${aboutCopyResult.outputTokens} tokens)`);
    } catch (e: any) {
      console.error("[extra-pages] ✗ about failed:", e.message);
      failed.push(`about: ${e.message}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // SERVICES PAGE
    // ════════════════════════════════════════════════════════════════════
    try {
      const { data: servicesFile } = await supabase.storage.from("templates").download(`${templateId}-services.html`);
      if (!servicesFile) throw new Error(`Template not found: ${templateId}-services.html`);
      let servicesHTML = await servicesFile.text();

      // Generate services-specific copy
      const servicesPrompt = `You are a professional copywriter for SiteQueen. Generate copy for the SERVICES page of ${businessName}, a ${businessType} in ${city}, ${state}.

SERVICES OFFERED: ${serviceNames.join(", ") || "not provided"}
YEARS IN BUSINESS: ${yearsInBusiness || "not provided"}
ABOUT: ${aboutStory ? aboutStory.substring(0, 300) : "not provided"}

CALL NOTES (highest priority):
${callNotes ? JSON.stringify({
  tone_of_voice: (callNotes as any).tone_of_voice,
  expert_additions: (callNotes as any).expert_additions,
  expert_avoid: (callNotes as any).expert_avoid,
  exact_phrases: (callNotes as any).exact_phrases,
  google_search_terms: (callNotes as any).google_search_terms,
}, null, 2) : "No call notes."}

TONE: Match call notes. Never use corporate filler.

Return ONLY valid JSON. No markdown:
{
  "SERVICES_META_DESC": "155 char meta description for services page",
  "SERVICES_PAGE_HEADLINE": "3-5 words all caps e.g. OUR SERVICES",
  "SERVICES_PAGE_SUBTEXT": "1-2 sentences about their range of services and experience",
  "SERVICES_MAIN_HEADLINE": "5-8 words about their expertise all caps",
  "SERVICES_MAIN_BODY": "2-3 sentences about their quality, approach, and what clients get",
  "CONTACT_CTA_SUBTEXT": "4-8 words all caps e.g. READY TO GET STARTED?",
  "CONTACT_CTA_BODY": "1-2 sentences encouraging them to call or fill out the form",
  "WHY_US_BADGE": "short badge e.g. #1 CONTRACTOR",
  "WHY_US_TAGLINE": "tagline e.g. FAMILY-OWNED · LICENSED & INSURED",
  "WHY_US_STORY": "2-3 sentences about expertise and reputation. Reference real details.",
  "AREA_GROUP_1_NAME": "${city.toUpperCase()} AREA",
  "AREA_GROUP_1_CITIES": "6-8 nearby cities separated by · ",
  "AREA_GROUP_2_NAME": "second region name",
  "AREA_GROUP_2_CITIES": "cities separated by · ",
  "AREA_GROUP_3_NAME": "third region or empty string",
  "AREA_GROUP_3_CITIES": "cities or empty string",
  "SERVICE_CAT_1_NAME": "${serviceNames[0] || "SERVICE 1"}",
  "SERVICE_CAT_1_ITEM_1": "specific sub-service or task",
  "SERVICE_CAT_1_ITEM_2": "specific sub-service",
  "SERVICE_CAT_1_ITEM_3": "specific sub-service",
  "SERVICE_CAT_1_ITEM_4": "specific sub-service",
  "SERVICE_CAT_1_ITEM_5": "specific sub-service",
  "SERVICE_CAT_1_ITEM_6": "specific sub-service",
  "SERVICE_CAT_1_ITEM_7": "specific sub-service",
  "SERVICE_CAT_1_ITEM_8": "specific sub-service",
  "SERVICE_CAT_1_ITEM_9": "specific sub-service",
  "SERVICE_CAT_1_ITEM_10": "specific sub-service",
  "SERVICE_CAT_2_NAME": "${serviceNames[1] || "SERVICE 2"}",
  "SERVICE_CAT_2_ITEM_1": "specific sub-service",
  "SERVICE_CAT_2_ITEM_2": "specific sub-service",
  "SERVICE_CAT_2_ITEM_3": "specific sub-service",
  "SERVICE_CAT_2_ITEM_4": "specific sub-service",
  "SERVICE_CAT_2_ITEM_5": "specific sub-service",
  "SERVICE_CAT_2_ITEM_6": "specific sub-service",
  "SERVICE_CAT_2_ITEM_7": "specific sub-service",
  "SERVICE_CAT_3_NAME": "${serviceNames[2] || "SERVICE 3"}",
  "SERVICE_CAT_3_ITEM_1": "specific sub-service",
  "SERVICE_CAT_3_ITEM_2": "specific sub-service",
  "SERVICE_CAT_3_ITEM_3": "specific sub-service",
  "SERVICE_CAT_3_ITEM_4": "specific sub-service",
  "SERVICE_CAT_3_ITEM_5": "specific sub-service",
  "SERVICE_CAT_3_ITEM_6": "specific sub-service",
  "SERVICE_CAT_3_ITEM_7": "specific sub-service",
  "SERVICE_CAT_4_NAME": "${serviceNames[3] || "SERVICE 4"}",
  "SERVICE_CAT_4_ITEM_1": "specific sub-service",
  "SERVICE_CAT_4_ITEM_2": "specific sub-service",
  "SERVICE_CAT_4_ITEM_3": "specific sub-service",
  "SERVICE_CAT_4_ITEM_4": "specific sub-service",
  "SERVICE_CAT_4_ITEM_5": "specific sub-service",
  "SERVICE_CAT_5_NAME": "${serviceNames[4] || "SERVICE 5"}",
  "SERVICE_CAT_5_ITEM_1": "specific sub-service",
  "SERVICE_CAT_5_ITEM_2": "specific sub-service",
  "SERVICE_CAT_5_ITEM_3": "specific sub-service",
  "SERVICE_CAT_5_ITEM_4": "specific sub-service",
  "SERVICE_CAT_5_ITEM_5": "specific sub-service",
  "CASE_1_TITLE": "job title all caps e.g. RETAINING WALL INSTALLATION",
  "CASE_1_DATE": "recent month year e.g. MARCH 2026",
  "CASE_1_LOCATION": "${city}, ${state}",
  "CASE_1_QUOTE": "1-2 sentence description of what was done and result",
  "CASE_2_TITLE": "different job title",
  "CASE_2_DATE": "different recent date",
  "CASE_2_LOCATION": "nearby city, ${state}",
  "CASE_2_QUOTE": "1-2 sentence description",
  "CASE_3_TITLE": "different job title",
  "CASE_3_DATE": "different recent date",
  "CASE_3_LOCATION": "nearby city, ${state}",
  "CASE_3_QUOTE": "1-2 sentence description",
  "CASE_4_TITLE": "different job title",
  "CASE_4_DATE": "different recent date",
  "CASE_4_LOCATION": "nearby city, ${state}",
  "CASE_4_QUOTE": "1-2 sentence description"
}`;

      console.log(`[extra-pages] Generating services copy...`);
      const servicesCopyResult = await callAI(ANTHROPIC_API_KEY, servicesPrompt, "services-copy");
      let servicesCopy: any = {};
      try {
        servicesCopy = JSON.parse(stripMarkdown(servicesCopyResult.text));
      } catch (e) {
        console.error("[extra-pages] Services copy JSON parse failed:", e);
      }

      // Inject CSS variables
      servicesHTML = injectCSSVars(servicesHTML, primaryColor, accentColor, fonts);

      // Fill all placeholders
      const servicesFill: Record<string, string> = {
        ...sharedFill,
        "{{SERVICES_META_DESC}}": servicesCopy.SERVICES_META_DESC || `${businessName} services in ${city}, ${state}. ${serviceNames.slice(0,3).join(", ")}.`,
        "{{SERVICES_PAGE_HEADLINE}}": servicesCopy.SERVICES_PAGE_HEADLINE || "OUR SERVICES",
        "{{SERVICES_PAGE_SUBTEXT}}": servicesCopy.SERVICES_PAGE_SUBTEXT || "",
        "{{SERVICES_MAIN_HEADLINE}}": servicesCopy.SERVICES_MAIN_HEADLINE || "",
        "{{SERVICES_MAIN_BODY}}": servicesCopy.SERVICES_MAIN_BODY || "",
        "{{CONTACT_CTA_SUBTEXT}}": servicesCopy.CONTACT_CTA_SUBTEXT || "CONTACT US TODAY",
        "{{CONTACT_CTA_BODY}}": servicesCopy.CONTACT_CTA_BODY || "Schedule service online or call now. We'll have someone at your door — often the same day.",
        "{{WHY_US_BADGE}}": servicesCopy.WHY_US_BADGE || "#1 CONTRACTOR",
        "{{WHY_US_TAGLINE}}": servicesCopy.WHY_US_TAGLINE || "FAMILY-OWNED · LICENSED & INSURED",
        "{{WHY_US_STORY}}": servicesCopy.WHY_US_STORY || "",
        "{{AREA_GROUP_1_NAME}}": servicesCopy.AREA_GROUP_1_NAME || `${city.toUpperCase()} AREA`,
        "{{AREA_GROUP_1_CITIES}}": servicesCopy.AREA_GROUP_1_CITIES || city,
        "{{AREA_GROUP_2_NAME}}": servicesCopy.AREA_GROUP_2_NAME || "",
        "{{AREA_GROUP_2_CITIES}}": servicesCopy.AREA_GROUP_2_CITIES || "",
        "{{AREA_GROUP_3_NAME}}": servicesCopy.AREA_GROUP_3_NAME || "",
        "{{AREA_GROUP_3_CITIES}}": servicesCopy.AREA_GROUP_3_CITIES || "",
        "{{SERVICE_CAT_1_NAME}}": servicesCopy.SERVICE_CAT_1_NAME || serviceNames[0] || "",
        "{{SERVICE_CAT_1_ITEM_1}}": servicesCopy.SERVICE_CAT_1_ITEM_1 || "",
        "{{SERVICE_CAT_1_ITEM_2}}": servicesCopy.SERVICE_CAT_1_ITEM_2 || "",
        "{{SERVICE_CAT_1_ITEM_3}}": servicesCopy.SERVICE_CAT_1_ITEM_3 || "",
        "{{SERVICE_CAT_1_ITEM_4}}": servicesCopy.SERVICE_CAT_1_ITEM_4 || "",
        "{{SERVICE_CAT_1_ITEM_5}}": servicesCopy.SERVICE_CAT_1_ITEM_5 || "",
        "{{SERVICE_CAT_1_ITEM_6}}": servicesCopy.SERVICE_CAT_1_ITEM_6 || "",
        "{{SERVICE_CAT_1_ITEM_7}}": servicesCopy.SERVICE_CAT_1_ITEM_7 || "",
        "{{SERVICE_CAT_1_ITEM_8}}": servicesCopy.SERVICE_CAT_1_ITEM_8 || "",
        "{{SERVICE_CAT_1_ITEM_9}}": servicesCopy.SERVICE_CAT_1_ITEM_9 || "",
        "{{SERVICE_CAT_1_ITEM_10}}": servicesCopy.SERVICE_CAT_1_ITEM_10 || "",
        "{{SERVICE_CAT_2_NAME}}": servicesCopy.SERVICE_CAT_2_NAME || serviceNames[1] || "",
        "{{SERVICE_CAT_2_ITEM_1}}": servicesCopy.SERVICE_CAT_2_ITEM_1 || "",
        "{{SERVICE_CAT_2_ITEM_2}}": servicesCopy.SERVICE_CAT_2_ITEM_2 || "",
        "{{SERVICE_CAT_2_ITEM_3}}": servicesCopy.SERVICE_CAT_2_ITEM_3 || "",
        "{{SERVICE_CAT_2_ITEM_4}}": servicesCopy.SERVICE_CAT_2_ITEM_4 || "",
        "{{SERVICE_CAT_2_ITEM_5}}": servicesCopy.SERVICE_CAT_2_ITEM_5 || "",
        "{{SERVICE_CAT_2_ITEM_6}}": servicesCopy.SERVICE_CAT_2_ITEM_6 || "",
        "{{SERVICE_CAT_2_ITEM_7}}": servicesCopy.SERVICE_CAT_2_ITEM_7 || "",
        "{{SERVICE_CAT_3_NAME}}": servicesCopy.SERVICE_CAT_3_NAME || serviceNames[2] || "",
        "{{SERVICE_CAT_3_ITEM_1}}": servicesCopy.SERVICE_CAT_3_ITEM_1 || "",
        "{{SERVICE_CAT_3_ITEM_2}}": servicesCopy.SERVICE_CAT_3_ITEM_2 || "",
        "{{SERVICE_CAT_3_ITEM_3}}": servicesCopy.SERVICE_CAT_3_ITEM_3 || "",
        "{{SERVICE_CAT_3_ITEM_4}}": servicesCopy.SERVICE_CAT_3_ITEM_4 || "",
        "{{SERVICE_CAT_3_ITEM_5}}": servicesCopy.SERVICE_CAT_3_ITEM_5 || "",
        "{{SERVICE_CAT_3_ITEM_6}}": servicesCopy.SERVICE_CAT_3_ITEM_6 || "",
        "{{SERVICE_CAT_3_ITEM_7}}": servicesCopy.SERVICE_CAT_3_ITEM_7 || "",
        "{{SERVICE_CAT_4_NAME}}": servicesCopy.SERVICE_CAT_4_NAME || serviceNames[3] || "",
        "{{SERVICE_CAT_4_ITEM_1}}": servicesCopy.SERVICE_CAT_4_ITEM_1 || "",
        "{{SERVICE_CAT_4_ITEM_2}}": servicesCopy.SERVICE_CAT_4_ITEM_2 || "",
        "{{SERVICE_CAT_4_ITEM_3}}": servicesCopy.SERVICE_CAT_4_ITEM_3 || "",
        "{{SERVICE_CAT_4_ITEM_4}}": servicesCopy.SERVICE_CAT_4_ITEM_4 || "",
        "{{SERVICE_CAT_4_ITEM_5}}": servicesCopy.SERVICE_CAT_4_ITEM_5 || "",
        "{{SERVICE_CAT_5_NAME}}": servicesCopy.SERVICE_CAT_5_NAME || serviceNames[4] || "",
        "{{SERVICE_CAT_5_ITEM_1}}": servicesCopy.SERVICE_CAT_5_ITEM_1 || "",
        "{{SERVICE_CAT_5_ITEM_2}}": servicesCopy.SERVICE_CAT_5_ITEM_2 || "",
        "{{SERVICE_CAT_5_ITEM_3}}": servicesCopy.SERVICE_CAT_5_ITEM_3 || "",
        "{{SERVICE_CAT_5_ITEM_4}}": servicesCopy.SERVICE_CAT_5_ITEM_4 || "",
        "{{SERVICE_CAT_5_ITEM_5}}": servicesCopy.SERVICE_CAT_5_ITEM_5 || "",
        "{{CASE_1_TITLE}}": servicesCopy.CASE_1_TITLE || "",
        "{{CASE_1_DATE}}": servicesCopy.CASE_1_DATE || "",
        "{{CASE_1_LOCATION}}": servicesCopy.CASE_1_LOCATION || city,
        "{{CASE_1_QUOTE}}": servicesCopy.CASE_1_QUOTE || "",
        "{{CASE_2_TITLE}}": servicesCopy.CASE_2_TITLE || "",
        "{{CASE_2_DATE}}": servicesCopy.CASE_2_DATE || "",
        "{{CASE_2_LOCATION}}": servicesCopy.CASE_2_LOCATION || city,
        "{{CASE_2_QUOTE}}": servicesCopy.CASE_2_QUOTE || "",
        "{{CASE_3_TITLE}}": servicesCopy.CASE_3_TITLE || "",
        "{{CASE_3_DATE}}": servicesCopy.CASE_3_DATE || "",
        "{{CASE_3_LOCATION}}": servicesCopy.CASE_3_LOCATION || city,
        "{{CASE_3_QUOTE}}": servicesCopy.CASE_3_QUOTE || "",
        "{{CASE_4_TITLE}}": servicesCopy.CASE_4_TITLE || "",
        "{{CASE_4_DATE}}": servicesCopy.CASE_4_DATE || "",
        "{{CASE_4_LOCATION}}": servicesCopy.CASE_4_LOCATION || city,
        "{{CASE_4_QUOTE}}": servicesCopy.CASE_4_QUOTE || "",
      };

      for (const [key, value] of Object.entries(servicesFill)) {
        servicesHTML = servicesHTML.split(key).join(value);
      }
      servicesHTML = servicesHTML.replace(/\{\{[^}]+\}\}/g, "");
      servicesHTML = servicesHTML.replace("</body>", analyticsScript + "\n</body>");

      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/services.html`, injectNoindex(servicesHTML));
      await supabase.storage.from("generated-sites").upload(
        `${clientId}/deploy/services.html`,
        new Blob([servicesHTML], { type: "text/html" }),
        { upsert: true, contentType: "text/html; charset=utf-8" }
      );

      generated.push("services");
      console.log(`[extra-pages] ✓ services.html (${servicesCopyResult.outputTokens} tokens)`);
    } catch (e: any) {
      console.error("[extra-pages] ✗ services failed:", e.message);
      failed.push(`services: ${e.message}`);
    }

    // ════════════════════════════════════════════════════════════════════
    // CONTACT PAGE (Claude generates — no template)
    // ════════════════════════════════════════════════════════════════════
    try {
      const contactPrompt = `You are building the CONTACT page for ${businessName}, a ${businessType} in ${city}, ${state}. Build a complete, professional, mobile-responsive HTML page.

BUSINESS INFO:
- Phone: ${phone}
- Email: ${email}
- Address: ${address || "mobile/service-area based — no fixed address"}
- Service area: ${intake.service_area || city}
- Hours: ${intake.business_hours ? JSON.stringify(intake.business_hours) : "not provided"}
- Services: ${serviceNames.join(", ")}

DESIGN REQUIREMENTS:
- Match this exact color scheme: primary/red = ${primaryColor}, accent/gold = ${accentColor}, dark = #0d1d3b
- Use these fonts: heading = ${fonts.heading}, body = ${fonts.body}
- Load from Google Fonts: ${fonts.googleUrl}
- Same topbar, header, footer structure as the homepage
- Navigation: Home → ./index.html, Services → ./services.html, About → ./about.html, Contact → ./contact.html (active)
- Logo: ${logoHTML}

CALL NOTES: ${callNotes ? JSON.stringify({ tone_of_voice: (callNotes as any).tone_of_voice, contact_preferences: (callNotes as any).contact_preferences, booking_url: (callNotes as any).booking_url }, null, 2) : "None"}

SECTIONS TO INCLUDE:
1. Topbar with rating and phone
2. Sticky header with logo, nav, and REQUEST SERVICE button
3. Mobile menu (hamburger)
4. Page hero — dark background, breadcrumb (HOME › CONTACT), page title "CONTACT {{BUSINESS_NAME}}"
5. Main content — two column layout:
   Left: contact info (phone as tel: link, email as mailto: link, service area, hours if available, service area tags)
   Right: contact form (first name, last name, email, phone, service type dropdown with real services, message textarea, SUBMIT REQUEST button)
6. Footer with logo, tagline, phone, address, service links, company links, newsletter signup
7. Analytics script before </body>: ${analyticsScript}

RULES:
- All CSS inlined in <style> tag in <head>
- All JS inlined in <script> before </body>
- Mobile responsive — works perfectly on all screen sizes
- Phone numbers as tel: links
- Emails as mailto: links
- No external CSS or JS files
- Return complete HTML from <!DOCTYPE html> to </html>
- No markdown, no code blocks, raw HTML only`;

      console.log(`[extra-pages] Generating contact page...`);
      const contactResult = await callAI(ANTHROPIC_API_KEY, contactPrompt, "contact");
      let contactHTML = stripMarkdown(contactResult.text);
      if (!contactHTML.includes("<!DOCTYPE html>")) throw new Error("Contact page returned invalid HTML");

      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/contact.html`, injectNoindex(contactHTML));
      await supabase.storage.from("generated-sites").upload(
        `${clientId}/deploy/contact.html`,
        new Blob([contactHTML], { type: "text/html" }),
        { upsert: true, contentType: "text/html; charset=utf-8" }
      );

      generated.push("contact");
      console.log(`[extra-pages] ✓ contact.html (${contactResult.outputTokens} tokens)`);
    } catch (e: any) {
      console.error("[extra-pages] ✗ contact failed:", e.message);
      failed.push(`contact: ${e.message}`);
    }

    // ── Mark complete ────────────────────────────────────────────────────
    const stagingURL = `${STAGING_BASE_URL}/${clientId}/index.html`;

    await supabase.from("sites").update({
      generation_status: "complete",
      generation_progress: "complete",
      generated_at: new Date().toISOString(),
      staging_url: stagingURL,
    } as any).eq("client_id", clientId);

    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: "extra-pages",
      status: failed.length === 0 ? "complete" : "partial",
      generation_notes: `Extra pages — built: ${generated.join(", ") || "none"}. Failed: ${failed.join("; ") || "none"}.`,
    } as any);

    const { data: clientRow } = await supabase.from("clients").select("business_name").eq("id", clientId).maybeSingle();
    await supabase.from("notifications").insert({
      type: "site_ready_for_review",
      client_id: clientId,
      message: `${(clientRow as any)?.business_name || "Website"} ready for review ♛`,
      staging_url: stagingURL,
      target_role: "operator",
      read: false,
    });

    console.log(`[extra-pages] ✓ All done. Built: ${generated.join(", ")}`);

    return new Response(
      JSON.stringify({ success: true, generated, failed, staging_url: stagingURL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[extra-pages] fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

function injectCSSVars(html: string, primaryColor: string, accentColor: string, fonts: any): string {
  const rootCSS = `:root {
      --navy: #0d1d3b;
      --red: ${primaryColor};
      --gold: ${accentColor};
      --white: #ffffff;
      --gray: #f3f5f7;
      --text-muted: #47546b;
      --font-heading: "${fonts.heading}", Helvetica, sans-serif;
      --font-body: "${fonts.body}", Helvetica, sans-serif;
      --max-width: 1400px;
      --section-pad: 80px 24px;
    }`;
  return html.replace(/:root\s*\{[^}]+\}/s, rootCSS);
}

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=/i.test(html)) return html.replace(/(<meta\s+charset=[^>]+>)/i, `$1${tag}`);
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
        ? data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") : "";
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
