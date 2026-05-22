import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";
import { logUnfilledPlaceholders } from "../_shared/diagnostics.ts";
import { autoFillPlaceholders } from "../_shared/autofill.ts";

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
    const faviconUrl = savedCopy.faviconUrl || intake.favicon_url || "";
    const primaryColor = savedCopy.primaryColor || intake.primary_color || "#cb2020";
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
      trades: "trades-hero", feminine: "feminine-bold",
      warm: "warm-welcome", local: "local-favorite", modern: "modern-business",
      professional: "business-professional",
    };
    const selectedTemplate = (callNotes as any)?.template_selected || intake?.template_selected || intake?.template_id;
    const templateId = selectedTemplate ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate) : "trades-hero";

    // ── Resolve photo slots (mirror part1 logic — uploads ALWAYS win) ────
    const allowStock = savedCopy.allowStock !== undefined
      ? !!savedCopy.allowStock
      : (intake.use_stock_photos !== false);
    const services: any[] = Array.isArray(intake.services) ? intake.services : [];
    const firstServiceName = services[0]
      ? (typeof services[0] === "string" ? services[0] : services[0]?.name || services[0]?.title || "")
      : "";
    const stockTerms: string[] = Array.isArray(savedCopy.stockTerms) && savedCopy.stockTerms.length
      ? savedCopy.stockTerms
      : buildStockSearchTerms(businessType, firstServiceName);

    const heroCandidates = [intake.hero_photo_url, portfolioPhotos[0]].filter(Boolean) as string[];
    const aboutCandidates = [teamPhotos[0], intake.owner_photo_url, portfolioPhotos[1], portfolioPhotos[0]].filter(Boolean) as string[];
    const whyUsCandidates = [portfolioPhotos[2], portfolioPhotos[1], portfolioPhotos[0]].filter(Boolean) as string[];

    let heroImageUrl = savedCopy.heroImageUrl || heroCandidates[0] || "";
    let aboutImageUrl = savedCopy.aboutImageUrl || aboutCandidates[0] || "";
    let whyUsImageUrl = savedCopy.whyUsImageUrl || whyUsCandidates[0] || "";

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
    console.log(`[extra-pages] Photos — hero:${heroImageUrl ? "✓" : "✗"} about:${aboutImageUrl ? "✓" : "✗"} whyus:${whyUsImageUrl ? "✓" : "✗"} (portfolio=${portfolioPhotos.length}, team=${teamPhotos.length}, allowStock=${allowStock})`);

    // ── Logo HTML ────────────────────────────────────────────────────────
    const logoHTML = logoUrl
      ? `<img src="${logoUrl}" alt="${businessName} logo" class="logo-img" />`
      : `<div class="logo-icon"><svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>`;

    // ── Favicon (uploaded → logo → generated SVG initial) ────────────────
    const faviconTag = buildFaviconHTML({
      faviconUrl,
      logoUrl,
      businessName,
      primaryColor,
    });


    // ── Map HTML ─────────────────────────────────────────────────────────
    const mapBuild = buildMapHTML({
      locationType: intake.location_type || intake.business_location_type || "",
      streetAddress: intake.street_address || intake.business_address || intake.address || "",
      city,
      state,
      zip: intake.business_zip || intake.zip || intake.postal_code || intake.zip_code || "",
      serviceArea: intake.service_area || "",
    });
    const mapHTML = mapBuild.html;

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
      // Images — uploads first, stock fills only empty slots
      "{{HERO_IMAGE_URL}}": heroImageUrl,
      "{{ABOUT_IMAGE_URL}}": aboutImageUrl,
      "{{WHY_US_IMAGE_URL}}": whyUsImageUrl,
      "{{LOGO_URL}}": logoUrl || "",
      "{{SERVICE_1_IMAGE_URL}}": pickServiceImage(0, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_2_IMAGE_URL}}": pickServiceImage(1, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_3_IMAGE_URL}}": pickServiceImage(2, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_4_IMAGE_URL}}": pickServiceImage(3, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_5_IMAGE_URL}}": pickServiceImage(4, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{TRANSFORMATION_IMAGE_URL}}": portfolioPhotos[3] || portfolioPhotos[0] || aboutImageUrl,
      "{{LEAD_MAGNET_IMAGE_URL}}": portfolioPhotos[4] || portfolioPhotos[0] || heroImageUrl,
    };

    // ── Analytics script (hosted tracker-v3) ─────────────────────────────
    // Same loader as generate-website-part1 so home + extra pages emit the
    // same v3 event set (click coords, scroll milestones, element_visible,
    // engagement pings, page_exit, custom_event).
    const clientTier = ((clientData as any)?.plan || "growth").toString();
    const projectRefForBanner = (Deno.env.get("SUPABASE_URL") || "").replace("https://", "").split(".")[0];
    const analyticsScript = `
<script async
  src="${supabaseUrl}/functions/v1/tracker-v3"
  data-client-id="${clientId}"
  data-endpoint="${supabaseUrl}/functions/v1/track-event"
  data-form-endpoint="${supabaseUrl}/functions/v1/track-form-submission"
  data-tier="${clientTier}"></script>
<script async src="https://${projectRefForBanner}.functions.supabase.co/prospect-banner-js?cid=${clientId}"></script>`;


    const generated: string[] = [];
    const failed: string[] = [];

    // ════════════════════════════════════════════════════════════════════
    // ABOUT PAGE
    // ════════════════════════════════════════════════════════════════════
    try {
      const { data: aboutFile } = await supabase.storage.from("templates").download(`${templateId}/about.html`);
      if (!aboutFile) throw new Error(`Template not found: ${templateId}/about.html`);
      let aboutHTML = await aboutFile.text();
      if (templateId === "business-professional") {
        aboutHTML = applyBusinessProfessionalTokens(aboutHTML, intake);
      }

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
      aboutHTML = injectCSSVars(aboutHTML, primaryColor, accentColor, fonts, templateId);

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
      const autoFilledAbout = await autoFillPlaceholders(
        aboutHTML,
        { businessName, businessType, city, services: services.map((s: any) => typeof s === "string" ? s : s?.name || s?.title).filter(Boolean).join(", ") },
        stockTerms,
      );
      aboutHTML = autoFilledAbout.html;
      await logUnfilledPlaceholders(supabase, clientId, templateId, "about", aboutHTML);
      aboutHTML = aboutHTML.replace(/\{\{[^}]+\}\}/g, "");
      aboutHTML = addAnalyticsTags(aboutHTML, "about");
      aboutHTML = aboutHTML.replace("</body>", analyticsScript + "\n</body>");
      aboutHTML = wireContactForms(aboutHTML, clientId, supabaseUrl);
      aboutHTML = injectFavicon(aboutHTML, faviconTag);

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
      const { data: servicesFile } = await supabase.storage.from("templates").download(`${templateId}/services.html`);
      if (!servicesFile) throw new Error(`Template not found: ${templateId}/services.html`);
      let servicesHTML = await servicesFile.text();
      if (templateId === "business-professional") {
        servicesHTML = applyBusinessProfessionalTokens(servicesHTML, intake);
      }

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
      servicesHTML = injectCSSVars(servicesHTML, primaryColor, accentColor, fonts, templateId);

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
      const autoFilledServices = await autoFillPlaceholders(
        servicesHTML,
        { businessName, businessType, city, services: services.map((s: any) => typeof s === "string" ? s : s?.name || s?.title).filter(Boolean).join(", ") },
        stockTerms,
      );
      servicesHTML = autoFilledServices.html;
      await logUnfilledPlaceholders(supabase, clientId, templateId, "services", servicesHTML);
      servicesHTML = servicesHTML.replace(/\{\{[^}]+\}\}/g, "");
      servicesHTML = addAnalyticsTags(servicesHTML, "services");
      servicesHTML = servicesHTML.replace("</body>", analyticsScript + "\n</body>");
      servicesHTML = wireContactForms(servicesHTML, clientId, supabaseUrl);
      servicesHTML = injectFavicon(servicesHTML, faviconTag);

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
    // UNIVERSAL CUSTOM PAGE GENERATOR
    // CSS comes from the ABOUT page (correct simple page-hero style).
    // Header + footer come from the HOMEPAGE (always correct).
    // Asks Claude only for the content section, then reassembles.
    // Always builds: contact. Plus any client-requested or operator-agreed pages.
    // ════════════════════════════════════════════════════════════════════
    try {
      // 1) Header + footer come from the homepage (these are always correct)
      const { data: homeFile } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/index.html`);
      if (!homeFile) throw new Error("Homepage not found in storage — cannot build custom pages");
      const homeHTML = await homeFile.text();
      const homeShell = extractShell(homeHTML);

      // 2) CSS comes from the ABOUT page (correct simple page-hero style — NOT homepage's full hero).
      //    Fall back to the raw template's about.html if the client's about hasn't been generated yet.
      let aboutStyleBlock = "";
      let aboutFontsLink = "";
      try {
        const { data: clientAboutFile } = await supabase.storage
          .from("generated-sites")
          .download(`${clientId}/deploy/about.html`);
        if (clientAboutFile) {
          const aboutHTMLForCSS = await clientAboutFile.text();
          const ex = extractShell(aboutHTMLForCSS);
          aboutStyleBlock = ex.styleBlock;
          aboutFontsLink = ex.fontsLinkHTML;
          console.log(`[extra-pages] Pulled CSS from client about.html (${aboutStyleBlock.length} chars, fonts:${aboutFontsLink ? "yes" : "no"})`);
        }
      } catch (e) {
        console.warn("[extra-pages] Could not load client about.html, will fall back to template:", (e as any)?.message);
      }
      if (!aboutStyleBlock) {
        const { data: templateAboutFile } = await supabase.storage
          .from("templates")
          .download(`${templateId}/about.html`);
        if (templateAboutFile) {
          const tplHTML = await templateAboutFile.text();
          const ex = extractShell(tplHTML);
          aboutStyleBlock = ex.styleBlock;
          aboutFontsLink = ex.fontsLinkHTML;
          console.log(`[extra-pages] Pulled CSS from template about.html (${aboutStyleBlock.length} chars, fonts:${aboutFontsLink ? "yes" : "no"})`);
        }
      }

      const shell = {
        styleBlock: aboutStyleBlock,
        headerHTML: homeShell.headerHTML,
        footerHTML: homeShell.footerHTML,
        fontsLinkHTML: aboutFontsLink,
      };
      if (!shell.styleBlock || !shell.headerHTML || !shell.footerHTML) {
        throw new Error(`Failed to extract shell — style:${!!shell.styleBlock} header:${!!shell.headerHTML} footer:${!!shell.footerHTML}`);
      }

      // Build the list of custom pages to generate
      type CustomPageSpec = { name: string; description: string; slug: string; source: string };
      const pageMap = new Map<string, CustomPageSpec>();

      // Always include Contact
      const isRestaurant = templateId === "local-favorite" || /restaurant|cafe|food|bakery|burger|pizza|ice ?cream|creamery|coffee|bistro/i.test(`${businessType} ${(intake as any).business_type || ""}`);
      pageMap.set("contact", {
        name: "Contact",
        slug: "contact",
        source: "always",
        description: isRestaurant
          ? `Contact page for a restaurant / food business. Do NOT use a dark full-bleed hero. Start with a simple PAGE HEADER — breadcrumb "HOME › CONTACT", a clean title "Visit ${businessName}", and a one-sentence subtitle inviting guests to stop by or get in touch. Use existing CSS classes only (.page-header, .breadcrumb, .container, .section-title) — never .hero/.hero-section. Below the header use a two-column layout. LEFT column: visit info — address (${intake.business_address || intake.address || "n/a"}), phone (${phone}) as tel:, email (${email || "n/a"}) as mailto:, hours (${intake.business_hours ? JSON.stringify(intake.business_hours) : "see homepage"}), plus prominent CTAs "RESERVE A TABLE" and "ORDER NOW" / "GET DIRECTIONS" (never "BOOK A CALL" / "SCHEDULE A CONSULTATION"). RIGHT column: a contact <form> with inputs (the platform wires them): name="name" (full name, required), name="phone" (required), name="email" (type=email, required), name="service" (a <select> with options like "General Inquiry", "Private Event", "Catering", "Reservation Question"), name="message" (textarea, required), and a <button type="submit"> labelled "SEND MESSAGE". Tone is warm and local — "Stop by", "Come see us", "We can't wait to feed you" — never coaching/services-business vocabulary. Do NOT add action, onsubmit, or hidden inputs.`
          : `Contact page. IMPORTANT: Do NOT use the dark full-bleed hero section with a giant headline that the homepage uses. Instead start with a simple, understated PAGE HEADER (same visual weight as the about page header) — a small breadcrumb "HOME › CONTACT", a clean page title "Contact ${businessName}", and a short one-sentence subtitle. Use existing CSS classes only (e.g. .page-header, .breadcrumb, .container, .section-title) — never the .hero or .hero-section classes. Below the header use a two-column layout. LEFT column: contact info — phone (${phone}) as a tel: link, email (${email || "n/a"}) as a mailto: link, service area (${intake.service_area || city}), business hours (${intake.business_hours ? JSON.stringify(intake.business_hours) : "by appointment"}). RIGHT column: a contact <form> element. The form MUST contain inputs with EXACTLY these name attributes (the platform wires them to the backend): name="name" (full name, required), name="phone" (required), name="email" (type=email, required), name="service" (a <select> populated with options for these services [${serviceNames.join(", ") || "General Inquiry"}]), name="message" (a <textarea>, required). Include a submit <button type="submit"> labelled SUBMIT REQUEST or SEND MESSAGE. Do NOT add any action attribute, do NOT add any onsubmit handler, do NOT add any hidden inputs — the platform injects those automatically. Use only existing CSS classes for styling.`,
      });

      // Intake custom pages
      const intakeCustomPages: any[] = Array.isArray(intake.custom_pages) ? intake.custom_pages : [];
      for (const p of intakeCustomPages) {
        const name = (typeof p === "string" ? p : p?.name || p?.title || "").trim();
        if (!name) continue;
        const description = (typeof p === "object" ? (p?.description || p?.notes || "") : "") || `${name} page for ${businessName}`;
        const slug = slugify(name);
        if (!slug || pageMap.has(slug)) continue;
        pageMap.set(slug, { name, slug, description, source: "intake" });
      }

      // Operator pages_agreed (override intake on overlap)
      const pagesAgreed: any[] = Array.isArray((callNotes as any)?.pages_agreed) ? (callNotes as any).pages_agreed : [];
      for (const p of pagesAgreed) {
        const name = (typeof p === "string" ? p : p?.name || p?.title || "").trim();
        if (!name) continue;
        const description = (typeof p === "object" ? (p?.description || p?.notes || "") : "") || `${name} page for ${businessName}`;
        const slug = slugify(name);
        if (!slug) continue;
        // Skip pages already produced by dedicated generators above
        if (["about", "services", "index", "home"].includes(slug)) continue;
        pageMap.set(slug, { name, slug, description, source: "operator" }); // override intake
      }

      console.log(`[extra-pages] Custom pages to build: ${[...pageMap.keys()].join(", ")}`);

      // Pre-compute the available class list once — Claude must reuse these exactly.
      const availableClasses = listClassNames(shell.styleBlock).slice(0, 250);
      const classListStr = availableClasses.join(", ");
      // Only include real business hours — otherwise omit entirely (no "by appointment" lies)
      const hoursStr = formatBusinessHours(intake.business_hours);
      const resolvedServiceArea = (intake.service_area && String(intake.service_area).trim())
        || (city ? `${city}, ${state} & Surrounding Areas` : "");
      const phoneTel = phoneRaw ? `tel:${phoneRaw}` : "";
      const emailMailto = email ? `mailto:${email}` : "";

      for (const spec of pageMap.values()) {
        try {
          const customPrompt = `You are building the inner CONTENT SECTION for a ${spec.name.toUpperCase()} page on the website of ${businessName}, a ${businessType} in ${city}, ${state}.

You may use ONLY the existing CSS classes from the provided stylesheet — do not write any new CSS, do not add <style> tags, do not use inline style="" attributes, do not invent class names. The stylesheet, header, and footer are already on the page; you must NOT include any of them in your output.

═══════════════════════════════════════════════════════════
AVAILABLE CSS CLASSES (the ONLY classes you may use):
${classListStr}
═══════════════════════════════════════════════════════════

Before generating, mentally identify which of those classes you will use for: page hero, container, sections, columns/grid, cards, buttons, form fields, headings, links, lists. Only use classes that appear in the list above.

PAGE BRIEF:
${spec.description}

BUSINESS DATA (use real values, never invent):
- Business name: ${businessName}
- Business type: ${businessType}
- City / state: ${city}, ${state}
- Phone: ${phone}${phoneTel ? `  (link: ${phoneTel})` : ""}
- Email: ${email || "(none provided — omit any email reference)"}${emailMailto ? `  (link: ${emailMailto})` : ""}
- Address: ${address || "(no fixed address — service-area business)"}
- Service area: ${resolvedServiceArea}
- Services: ${serviceNames.join(", ") || "(none provided)"}
${hoursStr ? `- Business hours:\n${hoursStr}` : "- Business hours: NOT provided — do not invent hours, do not write \"by appointment\" unless explicitly stated. Omit any hours block entirely."}
${logoUrl ? `- Logo URL (already shown in header — do NOT re-use in content): ${logoUrl}` : ""}
- Brand primary color: ${primaryColor} (already applied via existing CSS)
- Brand accent color: ${accentColor} (already applied via existing CSS)

CALL NOTES TONE: ${callNotes ? JSON.stringify({ tone_of_voice: (callNotes as any).tone_of_voice, tone_custom: (callNotes as any).tone_custom, exact_phrases: (callNotes as any).exact_phrases }, null, 2) : "None"}

═══════════════════════════════════════════════════════════
HARD RULES — VIOLATING ANY OF THESE MEANS THE PAGE WILL BE REJECTED:
═══════════════════════════════════════════════════════════
1. PAGE HERO STYLE — Start the page with a small, understated PAGE HEADER (the same lightweight style as the about page header). It must use the .page-hero class (or .page-header if .page-hero is unavailable in the class list above) on a simple dark background with NO background image, NO full-screen takeover, and NO contact form inside it. Structure inside the hero, in this order:
     • Breadcrumb: <nav class="breadcrumb">…</nav> containing "HOME" linking to index.html, a separator (›), then the current page name (${spec.name.toUpperCase()}).
     • Page title: a single <h1> with just the page name or "${spec.name} — ${businessName}".
     • Optional one-sentence subtitle below the title.
   NEVER use .hero or .hero-section classes. NEVER copy the homepage's giant headline + form hero. NEVER add background-image inline styles to the hero.

2. NO PLACEHOLDER TEXT. Never write text like "form fields here", "[insert content]", "[your text]", "Lorem ipsum", "TODO", or anything similar. Generate complete, real, working HTML for everything.

3. FORMS & UI ELEMENTS — Never represent form fields, buttons, dropdowns, or other UI as bullet lists or plain text. Always use real HTML elements: <form>, <input>, <select>, <option>, <textarea>, <button>, <label>. If the page needs a contact form, the inputs MUST have these exact name attributes (the platform wires them to the backend): name="name" (text, required), name="phone" (tel, required), name="email" (email, required), name="service" (a <select> populated with real options from the services list above), name="message" (textarea, required), and a <button type="submit">. Do NOT add an action attribute, onsubmit handler, or hidden inputs — the platform injects those automatically.

3a. FORM ELEMENT STYLING — ALL form elements — <input>, <select>, AND <textarea> — must use the same CSS class: class="form-input". Never apply inline styles to form elements. Never use a different class for textarea vs input. The .form-input class is already defined in the extracted stylesheet and handles all styling consistently. Just use <textarea class="form-input" ...> the same way you use <input class="form-input" ...>.

4. NO INLINE STYLES. Zero style="" attributes. Zero <style> blocks. Reuse only the classes listed above.

5. PHONE & EMAIL — Render phone numbers as <a href="${phoneTel || "tel:"}">${phone}</a>${emailMailto ? ` and emails as <a href="${emailMailto}">${email}</a>` : ""}. No bare text.

6. INTERNAL LINKS — Link to other pages with relative URLs: index.html, about.html, services.html, contact.html.

7. NO HEADER / FOOTER / DOCTYPE in your output. Return ONLY the inner content (typically a <main> wrapper or a sequence of <section> blocks). Mobile-responsive via existing classes only.

8. SPECIFICITY — Every line must be specific to ${businessName} in ${city}. No generic filler.

OUTPUT: raw HTML only — no markdown, no code fences, no explanation.`;

          console.log(`[extra-pages] Generating ${spec.slug} page (${spec.source})...`);
          const result = await callAI(ANTHROPIC_API_KEY, customPrompt, `page-${spec.slug}`);
          let contentHTML = stripMarkdown(result.text);
          if (!contentHTML || contentHTML.length < 100) {
            throw new Error(`Claude returned insufficient content (${contentHTML.length} chars)`);
          }

          // Assemble: doctype + head with extracted style + header + content + footer + analytics
          let fullHTML = assemblePage({
            title: `${spec.name} | ${businessName}`,
            description: `${spec.name} — ${businessName}, ${businessType} in ${city}, ${state}.`,
            googleFontsUrl: fonts.googleUrl,
            fontsLinkHTML: shell.fontsLinkHTML,
            styleBlock: shell.styleBlock,
            headerHTML: shell.headerHTML,
            contentHTML,
            footerHTML: shell.footerHTML,
            analyticsScript,
          });

          // Wire any <form> on the page to handle-contact-form
          const slugLower = (spec.slug || "").toLowerCase();
          const pageName = ["contact","gallery","about","services","home"].includes(slugLower) ? slugLower : "other";
          fullHTML = addAnalyticsTags(fullHTML, pageName);
          fullHTML = wireContactForms(fullHTML, clientId, supabaseUrl);
          fullHTML = injectFavicon(fullHTML, faviconTag);

          await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/${spec.slug}.html`, injectNoindex(fullHTML));
          await supabase.storage.from("generated-sites").upload(
            `${clientId}/deploy/${spec.slug}.html`,
            new Blob([fullHTML], { type: "text/html" }),
            { upsert: true, contentType: "text/html; charset=utf-8" }
          );

          generated.push(spec.slug);
          console.log(`[extra-pages] ✓ ${spec.slug}.html (${result.outputTokens} tokens, source=${spec.source})`);
        } catch (e: any) {
          console.error(`[extra-pages] ✗ ${spec.slug} failed:`, e.message);
          failed.push(`${spec.slug}: ${e.message}`);
        }
      }
    } catch (e: any) {
      console.error("[extra-pages] ✗ universal page generator failed:", e.message);
      failed.push(`custom-pages: ${e.message}`);
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

function injectCSSVars(
  html: string,
  primaryColor: string,
  accentColor: string,
  fonts: any,
  templateId: string,
): string {
  if (templateId === "trades-hero") {
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

  const varMap: Record<string, { primary: string[]; accent: string[] }> = {
    "feminine-bold": { primary: ["--burgundy"], accent: ["--gold"] },
    "business-professional": { primary: ["--navy", "--navy-mid"], accent: ["--gold", "--gold-dark"] },
    "warm-welcome": { primary: ["--dark"], accent: ["--muted"] },
    "restaurant": { primary: ["--red"], accent: ["--gold"] },
  };

  const mapping = varMap[templateId];
  if (!mapping) return html;

  return html.replace(/:root\s*\{([\s\S]*?)\}/, (_match, body) => {
    let out = body;
    if (primaryColor) {
      for (const name of mapping.primary) {
        const re = new RegExp(`(${name.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`, "i");
        if (re.test(out)) out = out.replace(re, `$1${primaryColor}$3`);
      }
    }
    if (accentColor) {
      for (const name of mapping.accent) {
        const re = new RegExp(`(${name.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`, "i");
        if (re.test(out)) out = out.replace(re, `$1${accentColor}$3`);
      }
    }
    return `:root {${out}}`;
  });
}

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=/i.test(html)) return html.replace(/(<meta\s+charset=[^>]+>)/i, `$1${tag}`);
  return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

// ── Favicon helpers ──────────────────────────────────────────────────
// Priority: 1) intake.favicon_url, 2) intake.logo_url, 3) generated SVG initial.
function buildFaviconHTML(opts: {
  faviconUrl?: string;
  logoUrl?: string;
  businessName?: string;
  primaryColor?: string;
}): string {
  const fav = (opts.faviconUrl || "").trim();
  if (fav) return `<link rel="icon" href="${fav}" />`;
  const logo = (opts.logoUrl || "").trim();
  if (logo) return `<link rel="icon" href="${logo}" />`;
  const initial = ((opts.businessName || "").trim().charAt(0) || "S").toUpperCase();
  const rawColor = (opts.primaryColor || "").trim() || "#534AB7";
  const color = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(rawColor)
    ? (rawColor.startsWith("#") ? rawColor : `#${rawColor}`)
    : "#534AB7";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='${color}'/><text y='.9em' font-size='75' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle' x='50' dominant-baseline='middle' dy='5'>${escapeHTML(initial)}</text></svg>`;
  const href = `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/"/g, "%22")}`;
  return `<link rel="icon" type="image/svg+xml" href="${href}" />`;
}

function injectFavicon(html: string, faviconTag: string): string {
  if (!faviconTag) return html;
  let out = html.replace(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*\/?>/gi, "");
  const tag = `\n  ${faviconTag}`;
  if (/<meta\s+charset=/i.test(out)) return out.replace(/(<meta\s+charset=[^>]+>)/i, `$1${tag}`);
  return out.replace(/(<head[^>]*>)/i, `$1${tag}`);
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

// ── Photo helpers (mirror part1) ─────────────────────────────────────
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

async function fetchUnsplashPhoto(searchTerms: string[]): Promise<string> {
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

function pickServiceImage(index: number, portfolioPhotos: string[], fallbacks: string[]): string {
  if (portfolioPhotos[index]) return portfolioPhotos[index];
  if (portfolioPhotos.length > 0) return portfolioPhotos[index % portfolioPhotos.length];
  return fallbacks.find((u) => !!u) || "";
}

// ── Universal custom-page helpers ────────────────────────────────────

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 60);
}

// Returns formatted hours lines ONLY when real values exist; returns "" otherwise.
// Accepts either a string ("Mon-Fri 9-5"), an array, or a per-day object map.
function formatBusinessHours(input: any): string {
  if (!input) return "";
  if (typeof input === "string") {
    const t = input.trim();
    return t ? `  ${t}` : "";
  }
  if (Array.isArray(input)) {
    const lines = input.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
    return lines.length ? lines.map((l) => `  ${l}`).join("\n") : "";
  }
  if (typeof input === "object") {
    const dayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const lines: string[] = [];
    for (const day of dayOrder) {
      const v = (input as any)[day] ?? (input as any)[day.charAt(0).toUpperCase() + day.slice(1)];
      if (!v) continue;
      if (typeof v === "string") {
        const t = v.trim();
        if (t) lines.push(`  ${day.charAt(0).toUpperCase() + day.slice(1)}: ${t}`);
      } else if (typeof v === "object") {
        if (v.closed === true) {
          lines.push(`  ${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`);
        } else if (v.open && v.close) {
          lines.push(`  ${day.charAt(0).toUpperCase() + day.slice(1)}: ${v.open} – ${v.close}`);
        }
      }
    }
    return lines.length ? lines.join("\n") : "";
  }
  return "";
}

function extractShell(html: string): { styleBlock: string; headerHTML: string; footerHTML: string; fontsLinkHTML: string } {
  // Capture the FIRST <style>...</style> block (and any topbar styles too — usually only one)
  const styleMatch = html.match(/<style[^>]*>[\s\S]*?<\/style>/i);
  const styleBlock = styleMatch ? styleMatch[0] : "";

  // Capture every Google Fonts <link> from <head> so we can reuse the EXACT
  // typography the about page loads (otherwise contact/services fall back to
  // Helvetica when the template's default fonts differ from the brand fonts).
  const headMatch = html.match(/<head[\s\S]*?<\/head>/i);
  const headHTML = headMatch ? headMatch[0] : html;
  const fontLinks = [...headHTML.matchAll(/<link[^>]+href=["'][^"']*fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*\/?>/gi)].map((m) => m[0]);
  // Always include preconnects (cheap, harmless) so the fonts load fast.
  const preconnects = `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`;
  const fontsLinkHTML = fontLinks.length ? `${preconnects}${fontLinks.join("")}` : "";

  // Header: prefer the first <header>...</header>; fall back to any
  // top-of-page navigation element since some templates (e.g. feminine-bold)
  // use <nav class="nav"> or <div class="navbar"> instead of <header>.
  let headerHTML = "";
  let headerStartIndex = -1;
  const headerMatch = html.match(/<header[\s\S]*?<\/header>/i);
  if (headerMatch) {
    headerHTML = headerMatch[0];
    headerStartIndex = html.indexOf(headerMatch[0]);
  } else {
    // Try common header-substitute patterns, in order of preference.
    const fallbackPatterns: RegExp[] = [
      /<nav[^>]*\b(?:class|id)=["'][^"']*\b(?:nav|navbar|site-nav|main-nav|header)\b[^"']*["'][\s\S]*?<\/nav>/i,
      /<nav\b[\s\S]*?<\/nav>/i,
      /<div[^>]*\bclass=["'][^"']*\b(?:navbar|site-header|page-header|header)\b[^"']*["'][\s\S]*?<\/div>\s*(?=<(?:section|main|div\b[^>]*\b(?:hero|main|container)))/i,
    ];
    for (const re of fallbackPatterns) {
      const m = html.match(re);
      if (m) {
        headerHTML = m[0];
        headerStartIndex = html.indexOf(m[0]);
        break;
      }
    }
  }

  // Try to also grab a topbar / announcement bar that immediately precedes the header
  if (headerStartIndex > 0) {
    const before = html.substring(0, headerStartIndex);
    const topbarMatch = before.match(/<div[^>]*class=["'][^"']*(?:topbar|top-bar|announcement-bar|announce|announcement)[^"']*["'][^>]*>[\s\S]*?<\/div>\s*$/i);
    if (topbarMatch) headerHTML = topbarMatch[0] + "\n" + headerHTML;
  }

  // Footer: last <footer>...</footer>; fall back to a footer-like <div>.
  let footerHTML = "";
  const footerMatches = [...html.matchAll(/<footer[\s\S]*?<\/footer>/gi)];
  if (footerMatches.length) {
    footerHTML = footerMatches[footerMatches.length - 1][0];
  } else {
    const divFooter = html.match(/<div[^>]*\bclass=["'][^"']*\b(?:footer|site-footer|page-footer)\b[^"']*["'][\s\S]*?<\/div>\s*(?=<\/body>|<script|$)/i);
    if (divFooter) footerHTML = divFooter[0];
  }

  return { styleBlock, headerHTML, footerHTML, fontsLinkHTML };
}

function listClassNames(styleBlock: string): string[] {
  const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = classRegex.exec(styleBlock)) !== null) {
    set.add("." + m[1]);
  }
  return [...set];
}

// Universal form styling — applied to every generated page so contact
// forms render legibly regardless of template. Uses CSS variables with
// safe fallbacks so each template's palette flows through. Scoped to
// <form> so it never bleeds into other UI.
const FORM_STYLES = `<style id="sq-form-styles">
  form { display: block; }
  form label {
    display: block;
    font-family: var(--font-body, inherit);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0 0 0.4rem;
    color: inherit;
    opacity: 0.85;
  }
  form .form-group,
  form .form-field,
  form p { margin: 0 0 1.1rem; }
  form input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]),
  form select,
  form textarea,
  form .form-input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 0.85rem 1rem;
    font-family: var(--font-body, inherit);
    font-size: 1rem;
    line-height: 1.4;
    color: var(--text, var(--dark, #1a1a1a));
    background: var(--white, #ffffff);
    border: 1px solid var(--border, rgba(0,0,0,0.18));
    border-radius: 4px;
    outline: none;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
    -webkit-appearance: none;
    appearance: none;
  }
  form textarea,
  form textarea.form-input {
    min-height: 140px;
    resize: vertical;
    font-family: var(--font-body, inherit);
  }
  form select,
  form select.form-input {
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%;
    background-size: 5px 5px, 5px 5px;
    background-repeat: no-repeat;
    padding-right: 2.5rem;
  }
  form input::placeholder,
  form textarea::placeholder { color: var(--text-muted, rgba(0,0,0,0.45)); opacity: 1; }
  form input:focus,
  form select:focus,
  form textarea:focus,
  form .form-input:focus {
    border-color: var(--primary, var(--accent, var(--burgundy, var(--red, var(--navy, #333)))));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary, var(--accent, var(--burgundy, var(--red, var(--navy, #333))))) 18%, transparent);
  }
  form button[type="submit"],
  form input[type="submit"] {
    font-family: var(--font-heading, var(--font-body, inherit));
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  form .sq-form-status {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 4px;
    font-family: var(--font-body, inherit);
    font-size: 0.95rem;
  }
  @media (max-width: 640px) {
    form input:not([type="hidden"]):not([type="submit"]):not([type="button"]),
    form select,
    form textarea,
    form .form-input { font-size: 16px; }
  }
</style>`;

function assemblePage(opts: {
  title: string;
  description: string;
  googleFontsUrl: string;
  fontsLinkHTML?: string;
  styleBlock: string;
  headerHTML: string;
  contentHTML: string;
  footerHTML: string;
  analyticsScript: string;
}): string {
  // Prefer the actual font links extracted from the about page (they match
  // the --font-heading / --font-body declared in the inlined :root). Fall
  // back to the template's default googleFontsUrl only when extraction failed.
  const fontsTag = opts.fontsLinkHTML
    ? opts.fontsLinkHTML
    : (opts.googleFontsUrl
      ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link href="${opts.googleFontsUrl}" rel="stylesheet" />`
      : "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHTML(opts.title)}</title>
  <meta name="description" content="${escapeHTML(opts.description)}" />
  ${fontsTag}
  ${opts.styleBlock}
  ${FORM_STYLES}
</head>
<body>
${opts.headerHTML}
${opts.contentHTML}
${opts.footerHTML}
${opts.analyticsScript}
</body>
</html>`;
}

// ── Map helper — free Google Maps iframe embed (no API key required) ──
type MapInput = {
  locationType?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  serviceArea?: string;
};
function buildMapHTML(input: MapInput): { html: string; url: string } {
  const type = (input.locationType || "").toLowerCase().trim();
  const city = (input.city || "").trim();
  const state = (input.state || "").trim();
  const street = (input.streetAddress || "").trim();
  const zip = (input.zip || "").trim();

  if (type === "online" || type === "remote" || type === "virtual" || type === "none") {
    return { html: "", url: "" };
  }

  let url = "";
  if (type === "physical" && (street || city)) {
    const q = [street, city, state, zip].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  } else if (type === "hybrid" && (street || city)) {
    const q = [street, city, state].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  } else if (type === "mobile" && (city || state)) {
    const q = [city, state].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=9&output=embed`;
  } else if (city || state) {
    const q = [city, state].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=9&output=embed`;
  }

  if (!url) {
    return {
      html: `<div class="map-placeholder"><p>📍 SERVING ${(input.serviceArea || city || "OUR AREA").toUpperCase()} &amp; SURROUNDING AREAS</p></div>`,
      url: "",
    };
  }

  const html = `<iframe class="map-iframe" src="${url}" width="100%" height="100%" style="border:0;min-height:400px;" allowfullscreen="" loading="lazy"></iframe>`;
  return { html, url };
}


function escapeHTML(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Contact form wiring ────────────────────────────────────────────────
// Post-processes a generated page so every <form> element posts to the
// handle-contact-form edge function with a hidden client_id and honeypot,
// plus a JS handler that AJAX-submits and shows success / error inline.
function wireContactForms(html: string, clientId: string, supabaseUrl: string): string {
  const endpoint = `${supabaseUrl}/functions/v1/handle-contact-form`;
  const out = html.replace(/<form\b([^>]*)>/gi, (_match, attrs: string) => {
    let a = attrs;
    a = a.replace(/\s+action\s*=\s*("[^"]*"|'[^']*')/gi, "");
    a = a.replace(/\s+method\s*=\s*("[^"]*"|'[^']*')/gi, "");
    if (!/data-sq-contact-form/i.test(a)) {
      a += ` data-sq-contact-form="1"`;
    }
    const hidden = `
      <input type="hidden" name="client_id" value="${clientId}" />
      <input type="text" name="website" tabindex="-1" autocomplete="off" style="display:none !important;position:absolute;left:-10000px;" aria-hidden="true" />`;
    return `<form action="${endpoint}" method="post"${a}>${hidden}`;
  });
  const handlerScript = `
<script>
(function(){
  var ENDPOINT = ${JSON.stringify(endpoint)};
  function handle(form){
    if (form.__sqWired) return; form.__sqWired = true;
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"], input[type="submit"]');
      var origLabel = btn ? (btn.tagName === 'INPUT' ? btn.value : btn.innerHTML) : '';
      if (btn) { btn.disabled = true; if (btn.tagName === 'INPUT') { btn.value = 'Sending...'; } else { btn.innerHTML = 'Sending...'; } }
      var fd = new FormData(form);
      var payload = {};
      fd.forEach(function(v,k){ payload[k] = v; });
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function(r){ return r.ok; }).catch(function(){ return false; })
        .then(function(ok){
          var msg = document.createElement('div');
          msg.style.padding = '16px';
          msg.style.marginTop = '12px';
          msg.style.borderRadius = '6px';
          msg.style.textAlign = 'center';
          msg.style.fontWeight = '600';
          if (ok) {
            msg.style.background = '#e6f9ed';
            msg.style.color = '#0d6b2f';
            msg.textContent = "Message sent! We'll be in touch soon.";
            form.reset();
          } else {
            msg.style.background = '#fdecec';
            msg.style.color = '#a01010';
            msg.textContent = "Something went wrong. Please call us directly.";
          }
          var existing = form.querySelector('.sq-form-status');
          if (existing) existing.remove();
          msg.className = 'sq-form-status';
          form.appendChild(msg);
          if (btn) { btn.disabled = false; if (btn.tagName === 'INPUT') { btn.value = origLabel; } else { btn.innerHTML = origLabel; } }
        });
    });
  }
  function init(){
    document.querySelectorAll('form[data-sq-contact-form="1"]').forEach(handle);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
</script>`;
  return out.replace("</body>", handlerScript + "\n</body>");
}

// ── business-professional template: direct CSS variable injection ──────
function applyBusinessProfessionalTokens(html: string, intake: any): string {
  let out = html;
  if (intake?.primary_color && typeof intake.primary_color === "string") {
    const c = intake.primary_color.trim();
    if (/^#[0-9a-fA-F]{3,6}$/.test(c)) {
      out = out.replace(/--navy:\s*#[0-9a-fA-F]{3,6}/g, `--navy: ${c}`);
      out = out.replace(/--navy-mid:\s*#[0-9a-fA-F]{3,6}/g, `--navy-mid: ${c}`);
    }
  }
  if (intake?.accent_color && typeof intake.accent_color === "string") {
    const c = intake.accent_color.trim();
    if (/^#[0-9a-fA-F]{3,6}$/.test(c)) {
      out = out.replace(/--gold:\s*#[0-9a-fA-F]{3,6}/g, `--gold: ${c}`);
      out = out.replace(/--gold-dark:\s*#[0-9a-fA-F]{3,6}/g, `--gold-dark: ${c}`);
    }
  }
  if (intake?.font_preference) {
    const fontMap: Record<string, { serif: string; url: string }> = {
      modern: { serif: '"Playfair Display", Georgia, serif', url: "Playfair+Display:ital,wght@0,400;0,700;1,400" },
      classic: { serif: '"Cormorant Garamond", Georgia, serif', url: "Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400" },
      minimal: { serif: '"DM Serif Display", Georgia, serif', url: "DM+Serif+Display:ital@0;1" },
    };
    const font = fontMap[String(intake.font_preference).toLowerCase()];
    if (font) {
      out = out.replace(/--font-serif:\s*[^;]+;/, `--font-serif: ${font.serif};`);
      out = out.replace(/Cormorant\+Garamond[^"']+/g, font.url);
    }
  }
  return out;
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
