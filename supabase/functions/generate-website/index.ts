import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";
import { logUnfilledPlaceholders } from "../_shared/diagnostics.ts";
import { autoFillPlaceholders } from "../_shared/autofill.ts";
import { generateRestaurantSite, RESTAURANT_TEMPLATE_ID } from "../_shared/restaurant-generator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";
const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-3-flash-preview";
const TIMEOUT_MS = 600_000; // 10 minutes per Claude call

const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Auth check — require valid JWT (preserved from previous version) ──
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
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

    // ── Fetch data (auto-create sites row if missing) ───────────────────
    let { data: siteData, error: siteError } = await supabase
      .from("sites").select("*").eq("client_id", clientId).maybeSingle();
    if (!siteData) {
      console.warn(`[generate] No sites row for client ${clientId} — creating one.`);
      const { data: inserted, error: insertErr } = await supabase
        .from("sites")
        .insert({ client_id: clientId, intake_data: {} } as any)
        .select("*")
        .single();
      if (insertErr || !inserted) {
        throw new Error(`Failed to create site record: ${insertErr?.message || "unknown error"}`);
      }
      siteData = inserted;
    } else if (siteError) {
      throw new Error("Site record not found");
    }

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

    const requestedTemplateId = selectedTemplate
      ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate)
      : "trades-hero";
    const FALLBACK_TEMPLATE = "trades-hero";

    let templateId = requestedTemplateId;
    let { data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`);
    let { data: cssFile } = await supabase.storage.from("templates").download(`${templateId}/style.css`);

    if (!htmlFile && templateId !== FALLBACK_TEMPLATE) {
      console.warn(`[generate] Template "${templateId}/index.html" not found — falling back to "${FALLBACK_TEMPLATE}".`);
      templateId = FALLBACK_TEMPLATE;
      ({ data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`));
      ({ data: cssFile } = await supabase.storage.from("templates").download(`${templateId}/style.css`));
    }

    if (!htmlFile) throw new Error(`Template not found: ${templateId}/index.html`);

    // ── Restaurant template (local-favorite): fully isolated pipeline ────
    if (templateId === RESTAURANT_TEMPLATE_ID) {
      try {
        const result = await generateRestaurantSite({
          supabase, clientId, intake, callNotes,
          clientData, siteData,
          supabaseUrl, serviceKey,
        });
        return new Response(
          JSON.stringify({ success: true, status: result.status, staging_url: result.stagingUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (e: any) {
        console.error("[generate/restaurant] error:", e);
        await markFailed(supabase, clientId, e.message || String(e));
        return new Response(
          JSON.stringify({ success: false, error: e.message || String(e) }),
          { status: 500, headers: corsHeaders },
        );
      }
    }

    let templateHTML = await htmlFile.text();
    const templateCSS = cssFile ? await cssFile.text() : "";

    // ── business-professional: inject CSS variables for --navy/--gold/--font-serif ─
    if (templateId === "business-professional") {
      templateHTML = applyBusinessProfessionalTokens(templateHTML, intake);
    }

    // ── Resolve client brand tokens (colors + fonts) and inject into :root ─
    // Mirrors the logic used by generate-extra-pages so every page matches.
    // Falls back to the template's existing values when the client did not
    // provide overrides. Works across templates regardless of whether they
    // use --red/--gold (trades-hero) or --burgundy/--gold (feminine-bold).
    const templateRedMatch = templateHTML.match(/--(?:red|burgundy|primary|color-primary)\s*:\s*([^;]+);/i);
    const templateGoldMatch = templateHTML.match(/--(?:gold|accent|color-accent)\s*:\s*([^;]+);/i);
    const templateRed = templateRedMatch ? templateRedMatch[1].trim() : "#cb2020";
    const templateGold = templateGoldMatch ? templateGoldMatch[1].trim() : "#f6a823";
    const primaryColorResolved = resolveBrandColor(intake.primary_color, templateRed);
    const accentColorResolved = resolveBrandColor(intake.accent_color, templateGold);

    const headingFontResolved = resolveFontName(
      (intake as any).heading_font || (intake as any).preferred_font || (intake as any).font_preference
    );
    const bodyFontResolved = resolveFontName(
      (intake as any).body_font || (intake as any).preferred_font || (intake as any).font_preference
    );

    templateHTML = injectBrandTokensIntoRoot(templateHTML, {
      primaryColor: primaryColorResolved,
      accentColor: accentColorResolved,
      headingFont: headingFontResolved || undefined,
      bodyFont: bodyFontResolved || undefined,
    });
    if (headingFontResolved || bodyFontResolved) {
      templateHTML = injectGoogleFontsLink(templateHTML, headingFontResolved, bodyFontResolved);
    }
    console.log(`[generate] Brand tokens — primary=${primaryColorResolved}, accent=${accentColorResolved}, heading="${headingFontResolved}", body="${bodyFontResolved}"`);



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

    const portfolioPhotos: string[] = (Array.isArray(intake.portfolio_photos) ? intake.portfolio_photos : []).filter(Boolean);
    const teamPhotos: string[] = (Array.isArray(intake.team_photos) ? intake.team_photos : []).filter(Boolean);
    const services: any[] = Array.isArray(intake.services) ? intake.services : [];
    const awards: any[] = Array.isArray(intake.awards) ? intake.awards : [];
    const coupons: any[] = Array.isArray(intake.coupons) ? intake.coupons : [];
    const serviceAreas: any[] = Array.isArray(intake.service_areas) ? intake.service_areas : [];
    const faqItems: any[] = Array.isArray(intake.faq_items) ? intake.faq_items : [];

    const showFinancing = !!(callNotes as any)?.show_financing || !!intake.show_financing;
    const showCoupons = !!(callNotes as any)?.show_coupons || !!intake.show_coupons || coupons.length > 0;
    const showAwards = !!(callNotes as any)?.show_awards || awards.length > 0;

    // ── Resolve photo slots ──────────────────────────────────────────────
    // Priority: client uploads ALWAYS win. Stock only fills empty slots when allowed.
    // Logo is never replaced with stock.
    // `use_stock_photos` only controls whether stock fills EMPTY slots — never overrides uploads.
    const allowStock =
      intake.use_stock_photos !== false &&
      (siteData as any).using_stock_photos !== false;

    const firstServiceName = (services[0] && (typeof services[0] === "string" ? services[0] : services[0]?.name || services[0]?.title)) || "";
    const stockTerms = buildStockSearchTerms(businessType, firstServiceName, tagline, businessName);

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!ANTHROPIC_API_KEY && !Deno.env.get("LOVABLE_API_KEY")) {
      throw new Error("No AI provider configured");
    }

    await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

    // ── CALL 1: Generate all copy as JSON ────────────────────────────────
    const serviceNames = services.slice(0, 6).map((s: any) =>
      typeof s === "string" ? s : s?.name || s?.title || ""
    ).filter(Boolean);

    // Client-provided service-area names (intake.service_areas[]) — these are
    // injected into the prompt so Claude uses them verbatim before generating
    // any additional nearby cities.
    const clientServiceAreaNames: string[] = serviceAreas
      .map((a: any) => (typeof a === "string" ? a : (a?.name || a?.city || a?.title || "")).toString().trim())
      .filter(Boolean);
    const clientServiceAreaList = clientServiceAreaNames.length
      ? clientServiceAreaNames.map((n, i) => `  ${i + 1}. ${n}`).join("\n")
      : "(none provided — generate 8 real nearby cities/towns)";

    const copyPrompt = `You are a professional copywriter for SiteQueen. Generate website copy for a ${businessType} business. Return ONLY valid JSON — no markdown, no explanation, no code blocks. Start with { and end with }.

${templateId === "business-professional" ? `═══════════════════════════════════════════════════════════
CRITICAL CONTENT RULES — FOLLOW THESE EXACTLY (business-professional template)
═══════════════════════════════════════════════════════════

1) MULTI-SLOT HEADLINES MUST READ AS A COMPLETE SENTENCE.
   The hero has three slots: HERO_HEADLINE_LINE1, HERO_HEADLINE_HIGHLIGHT, HERO_HEADLINE_LINE2.
   They render stacked as one continuous headline. Read left-to-right top-to-bottom they MUST form a complete, grammatical phrase. NO hanging prepositions. NO fragments. NO incomplete thoughts.

   GOOD:
     LINE1="PHOENIX'S PREMIER" / HIGHLIGHT="TAX & ACCOUNTING" / LINE2="PARTNERS"
     → "Phoenix's Premier Tax & Accounting Partners" ✓
     LINE1="TRUSTED LEGAL" / HIGHLIGHT="COUNSEL" / LINE2="FOR ARIZONA BUSINESSES"
     → "Trusted Legal Counsel for Arizona Businesses" ✓

   BAD (never do this):
     LINE1="PHOENIX'S PREMIER" / HIGHLIGHT="TAX & ACCOUNTING" / LINE2="SOLUTIONS FOR"
     → "...Solutions For" ✗ (hanging "for")
     LINE1="EXPERT GUIDANCE" / HIGHLIGHT="FOR EVERY" / LINE2="BUSINESS THAT"
     → "...business that" ✗ (incomplete clause)

   The same rule applies to ABOUT_HEADLINE_LINE1 + ABOUT_HEADLINE_LINE2 on about.html and SERVICES_HEADLINE + SERVICES_SUBHEADING on services.html.

2) HEADLINE SLOTS ARE FOR SHORT PHRASES. BODY SLOTS ARE FOR SENTENCES.
   Per-slot length limits:
     - HERO_HEADLINE_LINE1, _HIGHLIGHT, _LINE2: 2-5 words each, max 30 characters
     - ABOUT_HEADLINE_LINE1, ABOUT_HEADLINE_LINE2: 2-5 words each, max 30 characters
     - SERVICES_HEADLINE, SERVICES_SUBHEADING: max 6 words each, MUST be noun phrases
     - SERVE_HEADLINE, SERVE_SUBHEADING: max 6 words each
     - Any other *_HEADLINE / SECTION_HEADING field: max 8 words

   Body slots (HERO_SUBHEADING, SERVE_BODY, SERVICES_INTRO, ABOUT_STORY, *_DESC, etc.) take 1-3 full sentences (15-50 words).

   If unsure whether content fits a headline or body slot, put it in the body slot. NEVER put a 15+ word sentence in a headline slot — it will render at 56-88px and break the page.

3) FOOTER_LEGAL_NOTE IS A SHORT PROFESSIONAL DISCLAIMER, NOT A COPYRIGHT.
   The footer already includes the copyright line ("© YYYY {Business Name} — All Rights Reserved") automatically. FOOTER_LEGAL_NOTE is a SEPARATE small-print disclaimer.

   Good examples:
     - "Not a law firm. Information provided is general and not legal advice."
     - "Tax services provided by licensed professionals. Past performance does not guarantee results."
     - "Information on this site is for general guidance only and does not constitute professional advice."

   NEVER include "© YYYY", "All Rights Reserved", or repeat the business name in FOOTER_LEGAL_NOTE — that creates a duplicate copyright. If a meaningful disclaimer isn't appropriate for this business, return "".

4) WHEN IN DOUBT, BE CONCISE.
   Premium professional brands use restraint. A 4-word headline is more powerful than an 8-word one. Trust the design — short copy looks better in this template.
═══════════════════════════════════════════════════════════

` : ""}CRITICAL: Every field in this JSON must be filled. Empty strings are never acceptable unless the client has explicitly opted out of that section (like no_testimonials). If the client didn't provide information for a field, generate something specific and relevant based on everything you know about this business — their type, services, location, story, and tone. A trades contractor in Utah gets different content than a spa in Miami. Never use generic placeholder text. Every word should feel like it was written specifically for this business.

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
- Client-provided service areas (use these exact names FIRST for AREA_1..N before generating more):
${clientServiceAreaList}

═══════════════════════════════════════════════════════════
SERVICE AREAS — GEOGRAPHIC GROUNDING (read carefully)
═══════════════════════════════════════════════════════════
The business is located in ${city || "(city not provided)"}, ${state || "(state not provided)"}.
All service areas must be REAL cities and towns within reasonable driving distance of ${city}, ${state} specifically — NOT the state in general, NOT a different metro area in the same state, NOT a famous city elsewhere in the state if it isn't actually nearby.

HARD RULES:
1. Do NOT guess or assume the region. Use ONLY the provided city "${city}" and state "${state}" to determine nearby locations. If you are unsure which cities are actually near ${city}, ${state}, pick fewer real ones rather than inventing or guessing.
2. If the client provided service areas above, use those EXACT names verbatim FIRST (in the order given) to fill AREA_1, AREA_2, … and only generate additional names to fill the remaining slots. Any generated additions must also be real towns geographically near ${city}, ${state}.
3. Every AREA_* value must be a real, recognizable place name — never a generic descriptor like "Local Communities", "Surrounding Areas", "Rural Properties", "Nearby Towns", "The Greater Region", or "Outlying Districts".
4. AREA_1 should normally be "${city || "the home city"}" itself unless the client list above starts with a different city.
═══════════════════════════════════════════════════════════

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
  "META_DESCRIPTION": "155 char SEO meta description mentioning business name, main service, and city",
  "HERO_BADGE": "3-5 word trust statement e.g. TRUSTED LOCAL EXPERTS or SERVING ${city.toUpperCase() || "OUR AREA"} SINCE ${yearsInBusiness || "2010"}",
  "HERO_HEADLINE_LINE1": "2-4 words all caps. Start of a SHORT 3-part headline that combines as: LINE1 + HIGHLIGHT + LINE2 = one coherent grammatically complete phrase. Example: LINE1='PHOENIX'S PREMIER' HIGHLIGHT='TAX EXPERTS' LINE2='SINCE 2010'. NEVER end a line with a hanging preposition like 'FOR', 'WITH', 'AND'.",
  "HERO_HEADLINE_HIGHLIGHT": "1-3 words all caps — the core noun rendered in italic accent color. Must fit naturally between LINE1 and LINE2.",
  "HERO_HEADLINE_LINE2": "0-4 words all caps that grammatically COMPLETE the headline. Leave EMPTY STRING if LINE1+HIGHLIGHT already forms a complete phrase. NEVER a hanging preposition.",
  "HERO_HEADLINE_LINE3": "Usually empty. Only fill if a 4-line headline reads naturally. 0-4 words all caps.",
  "HERO_SUBHEADING": "1-2 sentences specific to this business, mention city and core service",
  "ABOUT_HEADLINE_LINE1": "3-5 words for the About page hero (regular weight, white)",
  "ABOUT_HEADLINE_LINE2": "3-5 words for the About page hero (italic, accent color) that completes the phrase from LINE1",
  "SERVICES_SUBHEADING": "2-5 word italic accent phrase for the Services hero. NEVER a sentence. Example: 'Built To Last' or 'Trusted Locally'. Body copy goes in SERVICES_INTRO.",
  "SERVICES_INTRO": "1-2 sentences introducing the services page, specific to this business",
  "SERVE_HEADLINE": "3-5 words all caps for the Who We Serve section",
  "SERVE_SUBHEADING": "2-4 words italic accent that completes SERVE_HEADLINE",
  "SERVE_BODY": "1-2 sentences describing who this business serves",
  "SERVE_1": "1-3 words — audience segment name (e.g. 'INDIVIDUALS', 'SMALL BUSINESSES', 'FAMILIES'). Title case or all caps, no sentences.",
  "SERVE_2": "1-3 words — distinct audience segment",
  "SERVE_3": "1-3 words — distinct audience segment",
  "SERVE_4": "1-3 words — distinct audience segment",
  "FOOTER_LEGAL_NOTE": "Short legal/regulatory disclaimer for THIS business type — NOT a copyright (copyright is rendered separately). Examples: 'Licensed CPA firm. Information on this site is general and not tax advice.' or 'Licensed and insured. Free estimates available.' Keep under 20 words.",
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
  "AREA_1": "REAL city or town name — must be an actual place near ${city}, ${state}. NEVER generic phrases like 'Local Communities', 'Surrounding Areas', 'Rural Properties', 'Nearby Towns'. If the client provided service areas above, use those names verbatim FIRST in order; only generate additional ones once the client list is exhausted.",
  "AREA_2": "REAL city or town name geographically near ${city}, ${state} (distinct). Research actual nearby cities — for example, in northern Utah real options include Salt Lake City, Provo, Ogden, West Valley City, Sandy, Layton, Orem, Draper. NEVER generic descriptions.",
  "AREA_3": "REAL nearby city or town (distinct) — actual place name only, never a category.",
  "AREA_4": "REAL nearby city or town (distinct) — actual place name only.",
  "AREA_5": "REAL nearby city or town (distinct) — actual place name only.",
  "AREA_6": "REAL nearby city or town (distinct) — actual place name only.",
  "AREA_7": "REAL nearby city or town (distinct) — actual place name only.",
  "AREA_8": "REAL nearby city or town (distinct) — actual place name only.",
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
  "FOOTER_TAGLINE": "short memorable tagline specific to this business — use their exact words if they provided a tagline (${tagline || "none provided"}), otherwise write a 5-8 word tagline that captures this business's character",
  "FOOTER_NEWSLETTER_TEXT": "1 sentence inviting email signup for deals and tips, specific to this business"${templateId === "feminine-bold" ? `,
  "_FEMININE_BOLD_FRAMING_RULES": "This template is used for personal brands, coaches, attorneys, consultants, designers, therapists, photographers, and other professional service providers. Do NOT assume the business is a coaching practice. Use the business_type (${businessType}), services, owner_title (${ownerTitle || "not provided"}), and owner story to determine the correct framing. Never default to coaching language ('coach', 'cohort', 'method', '12 weeks', 'session') unless the intake clearly indicates a coaching practice. Translate every field below into language native to THIS business (e.g. an attorney: 'Consultation' not 'Session'; a designer: 'Project' not 'Cohort'; a therapist: 'Practice' not 'Method').",
  "OWNER_TITLE": "Full professional title for the owner — e.g. 'Attorney at Law', 'Brand Strategist', 'Family Therapist', 'Business Coach'. Match the actual profession. Use the provided owner_title if any; otherwise infer from business_type and services. 2-4 words.",
  "ANNOUNCE_TEXT": "short announcement bar text appropriate to this business e.g. 'Now booking new clients — ${city || "local area"}'",
  "ABOUT_STRIP_DROPCAP": "first letter of ABOUT_STRIP_LINE1 (single capital letter only)",
  "ABOUT_STRIP_LINE1": "rest of first word in caps after the dropcap letter (e.g. if dropcap is H, this is ELPING)",
  "ABOUT_STRIP_LINE2": "second line of the about strip — caps, specific to this business and its actual clients",
  "ABOUT_STRIP_LINE3": "third line — caps",
  "ABOUT_STRIP_LINE4": "fourth line — caps, ends with a period",
  "ABOUT_STRIP_BODY": "1-2 sentences expanding on the about strip, specific to this business",
  "ABOUT_INTRO_HEADLINE": "personal intro headline using the owner's real name and real title (NOT 'coach' unless they are a coach) e.g. 'Hi, I'm ${ownerName || "[name]"}'",
  "ABOUT_INTRO_BODY": "2-3 sentences personal intro body specific to this business",
  "TRANSFORMATION_HEADLINE": "Full 4-8 word headline for the transformation/before-after section, written in the voice of THIS business (attorneys: 'From Uncertainty to Confident Decisions.' / designers: 'From Concept to Considered Brand.'). One complete phrase. First letter will be styled as a decorative dropcap automatically — do NOT split or capitalize specially.",
  "TRANSFORMATION_BODY": "1-2 sentences about the transformation/outcome journey, native to this business type",
  "BA_1_BEFORE": "before state 1 — what the client struggles with now (use language native to this business)",
  "BA_1_AFTER": "after state 1 — what they achieve after working together",
  "BA_2_BEFORE": "before state 2",
  "BA_2_AFTER": "after state 2",
  "BA_3_BEFORE": "before state 3",
  "BA_3_AFTER": "after state 3",
  "PHILOSOPHY_HEADLINE": "Full 4-8 word headline for the philosophy/approach section, specific to this business (attorney: 'A Practice Built on Trust.' / therapist: 'Care Rooted in Presence.'). First letter is auto-styled as a decorative dropcap.",
  "PILLAR_1_TITLE": "first philosophy pillar title (1-2 words, native to this business)",
  "PILLAR_1_BODY": "2-3 sentences describing pillar 1",
  "PILLAR_2_TITLE": "second philosophy pillar title",
  "PILLAR_2_BODY": "2-3 sentences describing pillar 2",
  "PILLAR_3_TITLE": "third philosophy pillar title",
  "PILLAR_3_BODY": "2-3 sentences describing pillar 3",
  "SERVICES_HEADLINE_FB": "Full 4-7 word headline for the services section (attorney: 'How We Can Help.' / designer: 'Ways We Work Together.'). First letter is auto-styled as a decorative dropcap.",
  "METHODOLOGY_HEADLINE": "Full 3-7 word headline for the methodology/process section (attorney: 'A Considered Process.' / coach: 'A Four-Part Journey.'). First letter is auto-styled as a decorative dropcap.",
  "METHODOLOGY_BODY": "1 sentence describing the process approach, native to this business",
  "STEP_1_TITLE": "step 1 name — language native to this business (attorney: 'The Consultation' / designer: 'Discovery')",
  "STEP_1_BODY": "2-3 sentences describing step 1",
  "STEP_2_TITLE": "step 2 name",
  "STEP_2_BODY": "2-3 sentences describing step 2",
  "STEP_3_TITLE": "step 3 name",
  "STEP_3_BODY": "2-3 sentences describing step 3",
  "STEP_4_TITLE": "step 4 name",
  "STEP_4_BODY": "2-3 sentences describing step 4",
  "TESTIMONIALS_HEADLINE_FB": "Full 3-6 word headline for the testimonials section (e.g. 'Words From Our Clients.' / 'Quiet Wins, Loudly Earned.'). First letter is auto-styled as a decorative dropcap.",
  "LEAD_MAGNET_TITLE": "Full 3-7 word title for a free guide/resource offer specific to this business (attorney: 'The ${businessName} Estate Planning Primer.' / designer: 'The Brand Clarity Workbook.'). First letter is auto-styled as a decorative dropcap.",
  "LEAD_MAGNET_BODY": "1-2 sentences describing the free resource offer",
  "FINAL_CTA_HEADLINE_FB": "Full 4-8 word warm closing headline (attorney: 'It Starts With a Conversation.' / designer: 'Let's Make Something Considered.'). First letter is auto-styled as a decorative dropcap.",
  "SERVICE_1_DURATION_FB": "short duration/format label native to this business in CAPS (attorney: 'FLAT FEE' or 'HOURLY' / designer: '6 WEEKS' / therapist: '50 MIN' / coach: '12 WEEKS'). Leave empty string if no natural duration applies.",
  "SERVICE_2_DURATION_FB": "short duration/format label native to this business in CAPS, or empty string",
  "SERVICE_3_DURATION_FB": "short duration/format label native to this business in CAPS, or empty string",
  "SERVICE_1_INCLUDE_1_FB": "what's included in service 1 — language native to this business (NOT '1:1 sessions' unless they are a coach/therapist)",
  "SERVICE_1_INCLUDE_2_FB": "what's included in service 1 (distinct)",
  "SERVICE_1_INCLUDE_3_FB": "what's included in service 1 (distinct)",
  "SERVICE_2_INCLUDE_1_FB": "what's included in service 2 (native language)",
  "SERVICE_2_INCLUDE_2_FB": "what's included in service 2",
  "SERVICE_2_INCLUDE_3_FB": "what's included in service 2",
  "SERVICE_3_INCLUDE_1_FB": "what's included in service 3 (native language)",
  "SERVICE_3_INCLUDE_2_FB": "what's included in service 3",
  "SERVICE_3_INCLUDE_3_FB": "what's included in service 3"` : ""}
}`;

    console.log("[generate] Calling Claude for copy...");
    const copyResult = await callAI(ANTHROPIC_API_KEY, copyPrompt, "copy");

    let copy: any = {};
    try {
      copy = JSON.parse(stripMarkdown(copyResult.text));
    } catch (e) {
      console.error("[generate] JSON parse failed:", e);
      console.error("[generate] Raw:", copyResult.text.substring(0, 500));
      throw new Error("Claude returned invalid JSON for copy");
    }

    await supabase.from("sites").update({ generation_progress: "filling_template" } as any).eq("client_id", clientId);

    // ── Render conditional sections + repeating COUPONS block ────────────
    let html = templateHTML;
    html = applyConditional(html, "SHOW_FINANCING", showFinancing);
    html = applyConditional(html, "SHOW_AWARDS", showAwards);
    html = applyConditional(html, "SHOW_COUPONS", showCoupons);

    // Render the {{#COUPONS}}...{{/COUPONS}} repeating block
    if (showCoupons && coupons.length > 0) {
      html = renderMustacheSection(html, "COUPONS", coupons.map((c: any) => ({
        COUPON_AMOUNT: c.amount || c.COUPON_AMOUNT || "",
        COUPON_DESCRIPTION: c.description || c.COUPON_DESCRIPTION || "",
        COUPON_EXPIRY: c.expiry || c.COUPON_EXPIRY || "",
        COUPON_CODE: c.code || c.COUPON_CODE || "",
      })));
    } else {
      html = renderMustacheSection(html, "COUPONS", []);
    }

    // ── Build LOGO_HTML and MAP_HTML ─────────────────────────────────────
    // If logo exists, show ONLY the logo image (no business name text).
    // If no logo, show business name text only (LOGO_HTML empty).
    const hasLogo = !!logoUrlResolved;
    const logoHTML = hasLogo
      ? `<img src="${logoUrlResolved}" alt="${businessName} logo" class="logo-img" />`
      : "";
    const businessNameInHeader = hasLogo ? "" : businessName;

    const mapBuild = buildMapHTML({
      locationType: intake.location_type || intake.business_location_type || "",
      streetAddress: intake.street_address || intake.business_address || intake.address || "",
      city,
      state,
      zip: intake.business_zip || intake.zip || intake.postal_code || intake.zip_code || "",
      serviceArea: intake.service_area || "",
    });
    const mapHTML = mapBuild.html;
    const mapEmbedUrl = mapBuild.url;

    // ── Build SERVICE_OPTIONS for any contact-form selects ───────────────
    const serviceOptionsHTML = serviceNames.length
      ? serviceNames.map((s: string) => `<option value="${escapeAttr(s)}">${escapeHTML(s)}</option>`).join("\n")
      : `<option value="general">General Inquiry</option>`;

    // ── Fill all flat placeholders ───────────────────────────────────────
    const fill: Record<string, string> = {
      "{{BUSINESS_NAME}}": businessName,
      "{{BUSINESS_PHONE}}": phone,
      "{{BUSINESS_PHONE_RAW}}": phoneRaw,
      "{{BUSINESS_EMAIL}}": email,
      "{{BUSINESS_ADDRESS}}": address,
      "{{BUSINESS_CITY}}": city,
      "{{BUSINESS_STATE}}": state,
      "{{GOOGLE_RATING}}": String(googleRating || "4.9"),
      "{{GOOGLE_REVIEW_COUNT}}": String(googleReviewCount || "100"),
      "{{SERVICE_AREA}}": intake.service_area || (city ? `${city} & Surrounding Areas` : ""),
      "{{YEARS_IN_BUSINESS}}": String(yearsInBusiness || "10"),
      "{{COPYRIGHT_YEAR}}": String(new Date().getFullYear()),
      "{{CITY}}": city || "LOCAL",
      "{{CLIENT_TYPE}}": businessType.toLowerCase().includes("plumb") ? "HOMEOWNERS" : "CUSTOMERS",
      "{{HAPPY_CUSTOMERS}}": copy.HAPPY_CUSTOMERS || "500",
      "{{REVIEW_PLATFORMS}}": copy.REVIEW_PLATFORMS || "Google",
      "{{META_DESCRIPTION}}": copy.META_DESCRIPTION || `${businessName} — ${businessType} in ${city}, ${state}.`,
      // Hero
      "{{HERO_BADGE}}": copy.HERO_BADGE || "",
      "{{HERO_HEADLINE_LINE1}}": copy.HERO_HEADLINE_LINE1 || "",
      "{{HERO_HEADLINE_HIGHLIGHT}}": copy.HERO_HEADLINE_HIGHLIGHT || "",
      "{{HERO_HEADLINE_LINE2}}": copy.HERO_HEADLINE_LINE2 || "",
      "{{HERO_HEADLINE_LINE3}}": copy.HERO_HEADLINE_LINE3 || "",
      "{{HERO_HEADLINE_COMMA}}": (copy.HERO_HEADLINE_LINE2 || copy.HERO_HEADLINE_LINE3) ? "," : "",
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
      "{{SERVICES_SUBHEADING}}": copy.SERVICES_SUBHEADING || "",
      "{{SERVICES_INTRO}}": copy.SERVICES_INTRO || copy.SERVICES_SUBTEXT || "",
      "{{SERVICES_SUBTEXT}}": copy.SERVICES_SUBTEXT || copy.SERVICES_INTRO || "",
      // About page hero (business-professional about.html)
      "{{ABOUT_HEADLINE_LINE1}}": copy.ABOUT_HEADLINE_LINE1 || copy.ABOUT_HEADLINE || "",
      "{{ABOUT_HEADLINE_LINE2}}": copy.ABOUT_HEADLINE_LINE2 || "",
      "{{ABOUT_STORY_SHORT}}": (copy.ABOUT_STORY || "").split(/\n\n/)[0] || copy.ABOUT_STORY || "",
      // Who We Serve (business-professional index)
      "{{SERVE_HEADLINE}}": copy.SERVE_HEADLINE || "WHO WE SERVE",
      "{{SERVE_SUBHEADING}}": copy.SERVE_SUBHEADING || "",
      "{{SERVE_BODY}}": copy.SERVE_BODY || "",
      "{{SERVE_1}}": copy.SERVE_1 || "",
      "{{SERVE_2}}": copy.SERVE_2 || "",
      "{{SERVE_3}}": copy.SERVE_3 || "",
      "{{SERVE_4}}": copy.SERVE_4 || "",
      // Footer legal disclaimer (NOT a copyright)
      "{{FOOTER_LEGAL_NOTE}}": copy.FOOTER_LEGAL_NOTE || "",
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
      "{{SERVICE_OPTIONS}}": serviceOptionsHTML,
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
      "{{SERVICE_AREAS_HEADLINE}}": copy.SERVICE_AREAS_HEADLINE || `SERVING ${(city || "OUR AREA").toUpperCase()} & BEYOND`,
      "{{AREA_1}}": serviceAreas[0] ? (typeof serviceAreas[0] === "string" ? serviceAreas[0] : serviceAreas[0].name) : (copy.AREA_1 || city),
      "{{AREA_2}}": serviceAreas[1] ? (typeof serviceAreas[1] === "string" ? serviceAreas[1] : serviceAreas[1].name) : (copy.AREA_2 || ""),
      "{{AREA_3}}": serviceAreas[2] ? (typeof serviceAreas[2] === "string" ? serviceAreas[2] : serviceAreas[2].name) : (copy.AREA_3 || ""),
      "{{AREA_4}}": serviceAreas[3] ? (typeof serviceAreas[3] === "string" ? serviceAreas[3] : serviceAreas[3].name) : (copy.AREA_4 || ""),
      "{{AREA_5}}": serviceAreas[4] ? (typeof serviceAreas[4] === "string" ? serviceAreas[4] : serviceAreas[4].name) : (copy.AREA_5 || ""),
      "{{AREA_6}}": serviceAreas[5] ? (typeof serviceAreas[5] === "string" ? serviceAreas[5] : serviceAreas[5].name) : (copy.AREA_6 || ""),
      "{{AREA_7}}": serviceAreas[6] ? (typeof serviceAreas[6] === "string" ? serviceAreas[6] : serviceAreas[6].name) : (copy.AREA_7 || ""),
      "{{AREA_8}}": serviceAreas[7] ? (typeof serviceAreas[7] === "string" ? serviceAreas[7] : serviceAreas[7].name) : (copy.AREA_8 || ""),
      // Awards
      "{{AWARD_1}}": showAwards ? (awards[0] ? (typeof awards[0] === "string" ? awards[0] : awards[0].name) : (copy.AWARD_1 || "")) : "",
      "{{AWARD_2}}": showAwards ? (awards[1] ? (typeof awards[1] === "string" ? awards[1] : awards[1].name) : (copy.AWARD_2 || "")) : "",
      "{{AWARD_3}}": showAwards ? (awards[2] ? (typeof awards[2] === "string" ? awards[2] : awards[2].name) : (copy.AWARD_3 || "")) : "",
      "{{AWARD_4}}": showAwards ? (awards[3] ? (typeof awards[3] === "string" ? awards[3] : awards[3].name) : (copy.AWARD_4 || "")) : "",
      "{{AWARD_5}}": showAwards ? (awards[4] ? (typeof awards[4] === "string" ? awards[4] : awards[4].name) : (copy.AWARD_5 || "")) : "",
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
      "{{FOOTER_NEWSLETTER_TEXT}}": copy.FOOTER_NEWSLETTER_TEXT || "Sign up for exclusive deals and expert tips.",
      "{{BUSINESS_NAME_PART1}}": businessName,
      "{{BUSINESS_NAME_PART2}}": "",
      // Coupons fallback (when not in COUPONS block context)
      "{{COUPONS_NOTE}}": intake.coupons_note || "Print or show on phone. Cannot be combined with other offers.",
      // Map
      "{{MAP_HTML}}": mapHTML,
      "{{MAP_EMBED_URL}}": mapEmbedUrl,
      // Logos and images
      "{{LOGO_HTML}}": logoHTML,
      "{{LOGO_URL}}": logoUrlResolved,
      "{{HERO_IMAGE_URL}}": heroImageUrl,
      "{{ABOUT_IMAGE_URL}}": aboutImageUrl,
      "{{WHY_US_IMAGE_URL}}": whyUsImageUrl,
      "{{SERVICE_1_IMAGE_URL}}": pickServiceImage(0, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_2_IMAGE_URL}}": pickServiceImage(1, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_3_IMAGE_URL}}": pickServiceImage(2, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_4_IMAGE_URL}}": pickServiceImage(3, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_5_IMAGE_URL}}": pickServiceImage(4, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{SERVICE_6_IMAGE_URL}}": pickServiceImage(5, portfolioPhotos, [heroImageUrl, aboutImageUrl, whyUsImageUrl]),
      "{{TRANSFORMATION_IMAGE_URL}}": portfolioPhotos[3] || portfolioPhotos[0] || aboutImageUrl,
      "{{LEAD_MAGNET_IMAGE_URL}}": portfolioPhotos[4] || portfolioPhotos[0] || heroImageUrl,
      // Misc
      "{{DOMAIN}}": intake.domain || `staging.sitequeen.ai/${clientId}`,
      "{{CLIENT_ID}}": clientId,
      "{{SUPABASE_URL}}": supabaseUrl,

      // ── feminine-bold template extras ───────────────────────────────────
      // Helper: split a single source string into {drop, rest} so the
      // template's two-span dropcap pattern can never duplicate or mismatch
      // the first letter. Both halves ALWAYS come from the same source.
      ...(() => {
        const splitDrop = (raw: string): { drop: string; rest: string } => {
          const s = (raw || "").trim();
          if (!s) return { drop: "", rest: "" };
          return { drop: s.charAt(0).toUpperCase(), rest: s.slice(1) };
        };

        // Resolve every dropcap headline from one full-headline source.
        // Preference order: explicit full headline from Claude → legacy
        // dropcap+rest combined → safe generic default (NEVER coaching-specific).
        const owner = splitDrop(copy.OWNER_TITLE || intake.owner_title || ownerTitle || "");
        const transformation = splitDrop(copy.TRANSFORMATION_HEADLINE || (copy.TRANSFORMATION_HEADLINE_REST ? `F${copy.TRANSFORMATION_HEADLINE_REST}` : ""));
        const philosophy = splitDrop(copy.PHILOSOPHY_HEADLINE || (copy.PHILOSOPHY_HEADLINE_REST ? `M${copy.PHILOSOPHY_HEADLINE_REST}` : "Our Approach."));
        const servicesH = splitDrop(copy.SERVICES_HEADLINE_FB || copy.SERVICES_HEADLINE || (copy.SERVICES_HEADLINE_REST ? `C${copy.SERVICES_HEADLINE_REST}` : "How We Help."));
        const testimonialsH = splitDrop(copy.TESTIMONIALS_HEADLINE_FB || copy.TESTIMONIALS_HEADLINE || (copy.TESTIMONIALS_HEADLINE_REST ? `Q${copy.TESTIMONIALS_HEADLINE_REST}` : "Words From Clients."));
        const methodology = splitDrop(copy.METHODOLOGY_HEADLINE || (copy.METHODOLOGY_HEADLINE_REST ? `F${copy.METHODOLOGY_HEADLINE_REST}` : "Our Process."));
        const leadMagnet = splitDrop(copy.LEAD_MAGNET_TITLE || (copy.LEAD_MAGNET_TITLE_REST ? `T${copy.LEAD_MAGNET_TITLE_REST}` : `The ${businessName} Guide.`));
        const faq = splitDrop("Frequently Asked Questions");
        const finalCta = splitDrop(copy.FINAL_CTA_HEADLINE_FB || copy.FINAL_CTA_HEADLINE || (copy.FINAL_CTA_HEADLINE_REST ? `S${copy.FINAL_CTA_HEADLINE_REST}` : "Start a Conversation."));
        const heroName = splitDrop(ownerName || businessName || "");
        return {
          "{{HERO_NAME_FIRST_LETTER}}": heroName.drop,
          "{{HERO_NAME_REST}}": heroName.rest,
          "{{OWNER_TITLE_DROPCAP}}": owner.drop,
          "{{OWNER_TITLE_REST}}": owner.rest,
          "{{TRANSFORMATION_DROPCAP}}": transformation.drop,
          "{{TRANSFORMATION_HEADLINE_REST}}": transformation.rest,
          "{{PHILOSOPHY_DROPCAP}}": philosophy.drop,
          "{{PHILOSOPHY_HEADLINE_REST}}": philosophy.rest,
          "{{SERVICES_DROPCAP}}": servicesH.drop,
          "{{SERVICES_HEADLINE_REST}}": servicesH.rest,
          "{{TESTIMONIALS_DROPCAP}}": testimonialsH.drop,
          "{{TESTIMONIALS_HEADLINE_REST}}": testimonialsH.rest,
          "{{METHODOLOGY_DROPCAP}}": methodology.drop,
          "{{METHODOLOGY_HEADLINE_REST}}": methodology.rest,
          "{{LEAD_MAGNET_DROPCAP}}": leadMagnet.drop,
          "{{LEAD_MAGNET_TITLE_REST}}": leadMagnet.rest,
          "{{FAQ_DROPCAP}}": faq.drop,
          "{{FAQ_HEADLINE_REST}}": faq.rest,
          "{{FINAL_CTA_DROPCAP}}": finalCta.drop,
          "{{FINAL_CTA_HEADLINE_REST}}": finalCta.rest,
        };
      })(),

      // Business basics
      "{{BUSINESS_NAME_SHORT}}": businessName.split(" ")[0],
      "{{ANNOUNCE_TEXT}}": copy.ANNOUNCE_TEXT || `Now booking new clients — ${city || "local area"}`,
      "{{NAV_CTA}}": "BOOK A CALL",

      // Hero CTAs (hero name dropcap handled above)
      "{{HERO_CTA_PRIMARY}}": copy.HERO_CTA_PRIMARY || "BOOK A CALL",
      "{{HERO_CTA_SECONDARY}}": copy.HERO_CTA_SECONDARY || "EXPLORE SERVICES",

      // About strip
      "{{ABOUT_STRIP_DROPCAP}}": (copy.ABOUT_STRIP_DROPCAP || copy.ABOUT_STRIP_LINE1 || "").charAt(0).toUpperCase() || "H",
      "{{ABOUT_STRIP_LINE1}}": copy.ABOUT_STRIP_LINE1 || "ELPING",
      "{{ABOUT_STRIP_LINE2}}": copy.ABOUT_STRIP_LINE2 || (businessType || "").toUpperCase(),
      "{{ABOUT_STRIP_LINE3}}": copy.ABOUT_STRIP_LINE3 || "",
      "{{ABOUT_STRIP_LINE4}}": copy.ABOUT_STRIP_LINE4 || "",
      "{{ABOUT_STRIP_BODY}}": copy.ABOUT_STRIP_BODY || copy.ABOUT_STORY || "",
      "{{ABOUT_EYEBROW}}": copy.ABOUT_EYEBROW || "ABOUT",
      "{{ABOUT_INTRO_HEADLINE}}": copy.ABOUT_INTRO_HEADLINE || (ownerName ? `Hi, I'm ${ownerName}` : `About ${businessName}`),
      "{{ABOUT_INTRO_BODY}}": copy.ABOUT_INTRO_BODY || copy.ABOUT_STORY || "",
      "{{ABOUT_CTA}}": "WORK WITH ME",

      // Transformation (before/after) — headline handled above
      "{{TRANSFORMATION_EYEBROW}}": copy.TRANSFORMATION_EYEBROW || "✦ THE TRANSFORMATION",
      "{{TRANSFORMATION_BODY}}": copy.TRANSFORMATION_BODY || "",
      "{{BA_1_BEFORE}}": copy.BA_1_BEFORE || "",
      "{{BA_1_AFTER}}": copy.BA_1_AFTER || "",
      "{{BA_2_BEFORE}}": copy.BA_2_BEFORE || "",
      "{{BA_2_AFTER}}": copy.BA_2_AFTER || "",
      "{{BA_3_BEFORE}}": copy.BA_3_BEFORE || "",
      "{{BA_3_AFTER}}": copy.BA_3_AFTER || "",

      // Philosophy pillars — headline handled above
      "{{PHILOSOPHY_EYEBROW}}": copy.PHILOSOPHY_EYEBROW || "✦ THE APPROACH",
      "{{PILLAR_1_TITLE}}": copy.PILLAR_1_TITLE || copy.WHY_US_1_TITLE || "",
      "{{PILLAR_1_BODY}}": copy.PILLAR_1_BODY || copy.WHY_US_1_DESC || "",
      "{{PILLAR_2_TITLE}}": copy.PILLAR_2_TITLE || copy.WHY_US_2_TITLE || "",
      "{{PILLAR_2_BODY}}": copy.PILLAR_2_BODY || copy.WHY_US_2_DESC || "",
      "{{PILLAR_3_TITLE}}": copy.PILLAR_3_TITLE || copy.WHY_US_3_TITLE || "",
      "{{PILLAR_3_BODY}}": copy.PILLAR_3_BODY || copy.WHY_US_3_DESC || "",

      // Services — feminine-bold tags/prices/duration/includes
      // NOTE: no coaching-specific defaults. Empty string when unknown so the
      // template degrades gracefully instead of showing "12 WEEKS" / "Weekly 1:1 sessions"
      // on attorneys, designers, therapists, etc.
      "{{SERVICES_EYEBROW}}": copy.SERVICES_EYEBROW || "✦ WAYS TO WORK TOGETHER",
      "{{SERVICES_INTRO}}": copy.SERVICES_SUBTEXT || copy.SERVICES_INTRO || "",
      "{{SERVICE_1_TAG}}": copy.SERVICE_1_TAG || "SIGNATURE",
      "{{SERVICE_1_PRICE}}": services[0]?.price_value || services[0]?.price || copy.SERVICE_1_PRICE || "Contact for pricing",
      "{{SERVICE_1_DURATION}}": copy.SERVICE_1_DURATION_FB || copy.SERVICE_1_DURATION || "",
      "{{SERVICE_1_INCLUDE_1}}": copy.SERVICE_1_INCLUDE_1_FB || copy.SERVICE_1_INCLUDE_1 || "",
      "{{SERVICE_1_INCLUDE_2}}": copy.SERVICE_1_INCLUDE_2_FB || copy.SERVICE_1_INCLUDE_2 || "",
      "{{SERVICE_1_INCLUDE_3}}": copy.SERVICE_1_INCLUDE_3_FB || copy.SERVICE_1_INCLUDE_3 || "",
      "{{SERVICE_2_TAG}}": copy.SERVICE_2_TAG || "",
      "{{SERVICE_2_PRICE}}": services[1]?.price_value || services[1]?.price || copy.SERVICE_2_PRICE || "Contact for pricing",
      "{{SERVICE_2_DURATION}}": copy.SERVICE_2_DURATION_FB || copy.SERVICE_2_DURATION || "",
      "{{SERVICE_2_INCLUDE_1}}": copy.SERVICE_2_INCLUDE_1_FB || copy.SERVICE_2_INCLUDE_1 || "",
      "{{SERVICE_2_INCLUDE_2}}": copy.SERVICE_2_INCLUDE_2_FB || copy.SERVICE_2_INCLUDE_2 || "",
      "{{SERVICE_2_INCLUDE_3}}": copy.SERVICE_2_INCLUDE_3_FB || copy.SERVICE_2_INCLUDE_3 || "",
      "{{SERVICE_3_TAG}}": copy.SERVICE_3_TAG || "",
      "{{SERVICE_3_PRICE}}": services[2]?.price_value || services[2]?.price || copy.SERVICE_3_PRICE || "Contact for pricing",
      "{{SERVICE_3_DURATION}}": copy.SERVICE_3_DURATION_FB || copy.SERVICE_3_DURATION || "",
      "{{SERVICE_3_INCLUDE_1}}": copy.SERVICE_3_INCLUDE_1_FB || copy.SERVICE_3_INCLUDE_1 || "",
      "{{SERVICE_3_INCLUDE_2}}": copy.SERVICE_3_INCLUDE_2_FB || copy.SERVICE_3_INCLUDE_2 || "",
      "{{SERVICE_3_INCLUDE_3}}": copy.SERVICE_3_INCLUDE_3_FB || copy.SERVICE_3_INCLUDE_3 || "",

      // Testimonials — feminine-bold uses TITLE instead of LOCATION
      "{{TESTIMONIAL_1_TITLE}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_LOCATION || copy.TESTIMONIAL_1_TITLE || ""),
      "{{TESTIMONIAL_2_TITLE}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_LOCATION || copy.TESTIMONIAL_2_TITLE || ""),
      "{{TESTIMONIAL_3_TITLE}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_LOCATION || copy.TESTIMONIAL_3_TITLE || ""),
      "{{TESTIMONIAL_1_AVATAR_URL}}": teamPhotos[0] || intake.owner_photo_url || "",
      "{{TESTIMONIAL_2_AVATAR_URL}}": portfolioPhotos[0] || "",
      "{{TESTIMONIAL_3_AVATAR_URL}}": portfolioPhotos[1] || "",
      "{{TESTIMONIALS_EYEBROW}}": copy.TESTIMONIALS_EYEBROW || "✦ WORDS FROM CLIENTS",

      // Methodology — headline handled above
      "{{METHODOLOGY_EYEBROW}}": copy.METHODOLOGY_EYEBROW || "✦ THE PROCESS",
      "{{METHODOLOGY_BODY}}": copy.METHODOLOGY_BODY || "",
      "{{STEP_1_TITLE}}": copy.STEP_1_TITLE || "",
      "{{STEP_1_BODY}}": copy.STEP_1_BODY || "",
      "{{STEP_2_TITLE}}": copy.STEP_2_TITLE || "",
      "{{STEP_2_BODY}}": copy.STEP_2_BODY || "",
      "{{STEP_3_TITLE}}": copy.STEP_3_TITLE || "",
      "{{STEP_3_BODY}}": copy.STEP_3_BODY || "",
      "{{STEP_4_TITLE}}": copy.STEP_4_TITLE || "",
      "{{STEP_4_BODY}}": copy.STEP_4_BODY || "",

      // Marquee
      "{{MARQUEE_1}}": copy.MARQUEE_1 || copy.PILLAR_1_TITLE || "",
      "{{MARQUEE_2}}": copy.MARQUEE_2 || copy.PILLAR_2_TITLE || "",
      "{{MARQUEE_3}}": copy.MARQUEE_3 || copy.PILLAR_3_TITLE || "",
      "{{MARQUEE_4}}": copy.MARQUEE_4 || "",

      // Lead magnet — title handled above
      "{{LEAD_MAGNET_EYEBROW}}": copy.LEAD_MAGNET_EYEBROW || "✦ A FREE GUIDE",
      "{{LEAD_MAGNET_BODY}}": copy.LEAD_MAGNET_BODY || copy.FOOTER_NEWSLETTER_TEXT || "",
      "{{LEAD_MAGNET_BTN}}": "SEND IT",
      "{{LEAD_MAGNET_NOTE}}": "No spam, ever. Unsubscribe anytime.",

      // FAQ + Final CTA eyebrows (headlines handled above)
      "{{FAQ_EYEBROW}}": "✦ COMMON QUESTIONS",
      "{{FINAL_CTA_EYEBROW}}": copy.FINAL_CTA_EYEBROW || "✦ YOUR NEXT STEP",
      "{{FINAL_CTA_BODY}}": copy.FINAL_CTA_SUBTEXT || "",
      "{{FINAL_CTA_BTN}}": copy.FINAL_CTA_BTN || "BOOK YOUR DISCOVERY CALL",

      // Social links
      "{{SOCIAL_INSTAGRAM_URL}}": (intake.social_links as any)?.instagram
        ? `https://instagram.com/${String((intake.social_links as any).instagram).replace("@", "")}`
        : "#",
      "{{SOCIAL_SUBSTACK_URL}}": (intake.social_links as any)?.substack || "#",
      "{{SOCIAL_PODCAST_URL}}": (intake.social_links as any)?.podcast || "#",
      "{{SOCIAL_BLOG_URL}}": (intake.social_links as any)?.blog || "#",
    };

    // Pre-fill header logo block: logo XOR business name (never both).
    // Matches the template pattern: {{LOGO_HTML}}<span class="logo-text">{{BUSINESS_NAME}}</span>
    const headerLogoBlockRe = /\{\{LOGO_HTML\}\}\s*<span class="logo-text">\s*\{\{BUSINESS_NAME\}\}\s*<\/span>/g;
    html = html.replace(headerLogoBlockRe, hasLogo
      ? logoHTML
      : `<span class="logo-text">${escapeHTML(businessName)}</span>`);

    for (const [key, value] of Object.entries(fill)) {
      html = html.split(key).join(value);
    }

    // Inline the template CSS in place of the external stylesheet link
    if (templateCSS) {
      html = html.replace(
        /<link\s+rel=["']stylesheet["']\s+href=["']styles?\.css["']\s*\/?>/i,
        `<style>\n${templateCSS}\n</style>`,
      );
    }

    // Auto-fill any remaining placeholders with AI text + Unsplash images
    const autoFilled = await autoFillPlaceholders(
      html,
      { businessName, businessType, city: intake.business_city || intake.city || "", services: services.map((s: any) => typeof s === "string" ? s : s?.name || s?.title).filter(Boolean).join(", "), notes: tagline },
      stockTerms,
    );
    html = autoFilled.html;
    await logUnfilledPlaceholders(supabase, clientId, templateId, "index", html);
    html = html.replace(/\{\{[^}]+\}\}/g, "");

    // ── CALL 2: Apply call notes special instructions (only if needed) ───
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

    // ── Tag interactive elements + milestones for v3 analytics ───────────
    html = addAnalyticsTags(html, "home");

    // ── Inject hosted-tracker loader snippet before </body> (tracker-v3) ─
    // Tracker JS lives at the tracker-v3 edge function (full cache-header
    // control, immutable per version). DO NOT inline tracker logic here.
    // To roll out a new tracker version: deploy tracker-v4 edge function,
    // bump the URL below. Existing sites keep loading tracker-v3 safely.
    // Maps clients.plan -> tracker tier vocabulary. Only 'pro' enables Premium events.
    const planToTrackerTier = (plan: string | null | undefined): string =>
      plan === "pro" ? "premium" : "growth";
    const clientTier = planToTrackerTier((clientData as any)?.plan);
    const analyticsScript = `
<script async
  src="${supabaseUrl}/functions/v1/tracker-v3"
  data-client-id="${clientId}"
  data-endpoint="${supabaseUrl}/functions/v1/track-event"
  data-form-endpoint="${supabaseUrl}/functions/v1/track-form-submission"
  data-tier="${clientTier}"></script>`;
    html = html.replace("</body>", analyticsScript + "\n</body>");


    // ── Wire any <form> on the page to handle-contact-form ───────────────
    html = wireContactForms(html, clientId, supabaseUrl);

    // ── Inject favicon (uploaded → logo → generated SVG initial) ─────────
    const faviconTag = buildFaviconHTML({
      faviconUrl: intake.favicon_url || "",
      logoUrl: logoUrlResolved,
      businessName,
      primaryColor: primaryColorResolved,
    });
    html = injectFavicon(html, faviconTag);

    // ── Upload to Hostinger staging ──────────────────────────────────────
    await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

    // Inject prospect-banner script (no-op for non-prospects; renders banner dynamically when active)
    const projectRefForBanner = (Deno.env.get("SUPABASE_URL") || "").replace("https://", "").split(".")[0];
    const prospectBannerTag = `<script async src="https://${projectRefForBanner}.functions.supabase.co/prospect-banner-js?cid=${clientId}"></script>`;
    const htmlWithBanner = html.includes("</body>")
      ? html.replace("</body>", `${prospectBannerTag}\n</body>`)
      : html + prospectBannerTag;
    const stagingHTML = injectNoindex(htmlWithBanner);

    try {
      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/index.html`, stagingHTML);
      console.log("[generate] ✓ index.html → Hostinger staging");
    } catch (e: any) {
      throw new Error(`Hostinger staging upload failed: ${e.message}`);
    }

    // Backup the un-noindexed version to storage
    const { error: backupErr } = await supabase.storage
      .from("generated-sites")
      .upload(`${clientId}/deploy/index.html`, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });
    if (backupErr) throw new Error(`Failed to save deploy backup: ${backupErr.message}`);

    // ── Persist copy-data.json so generate-extra-pages can reuse decisions ─
    const copyDataPayload = {
      businessName, businessType, city, state, phone, phoneRaw, email, address,
      yearsInBusiness, googleRating, googleReviewCount, tagline, ownerName, ownerTitle,
      logoUrl: logoUrlResolved, faviconUrl: intake.favicon_url || "", serviceNames, noTestimonials,
      portfolioPhotos, teamPhotos,
      heroImageUrl, aboutImageUrl, whyUsImageUrl,
      stockTerms, allowStock,
      primaryColor: primaryColorResolved,
      accentColor: accentColorResolved,
      copy,
    };
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/copy-data.json`,
      new Blob([JSON.stringify(copyDataPayload)], { type: "application/json" }),
      { upsert: true, contentType: "application/json" }
    );

    // ── Persist site-meta.json (brand tokens + class list for extra-pages) ─
    const classNames = [...new Set(
      [...templateCSS.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[{,]/g)].map(m => m[1])
    )].filter(c => c.length > 1).slice(0, 200);
    const primaryColorMatch = templateCSS.match(/--color-primary\s*:\s*([^;]+)/);
    const accentColorMatch = templateCSS.match(/--color-accent\s*:\s*([^;]+)/);
    const fontHeadingMatch = templateCSS.match(/--font-heading\s*:\s*'([^']+)'/) || templateCSS.match(/--font-heading\s*:\s*"([^"]+)"/);
    const fontBodyMatch = templateCSS.match(/--font-body\s*:\s*'([^']+)'/) || templateCSS.match(/--font-body\s*:\s*"([^"]+)"/);
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
      tokens_used: copyResult.outputTokens,
      generation_notes: `Homepage generated. Template: ${templateId}. Copy tokens: ${copyResult.outputTokens}.`,
    } as any);

    console.log(`[generate] ✓ Homepage complete for ${clientId} → ${stagingURL}`);

    // ── feminine-bold: also build about.html + services.html from templates ─
    // These templates already have inline CSS and use the same fill map as
    // the homepage, so no Claude calls are needed — just load, replace, push.
    if (templateId === "feminine-bold") {
      const extraPages: Array<{ slug: string; storagePath: string }> = [
        { slug: "about", storagePath: `${templateId}/about.html` },
        { slug: "services", storagePath: `${templateId}/services.html` },
      ];

      for (const page of extraPages) {
        try {
          const { data: pageFile, error: pageErr } = await supabase.storage
            .from("templates")
            .download(page.storagePath);
          if (pageErr || !pageFile) {
            console.warn(`[generate] feminine-bold: ${page.storagePath} not found — skipping`);
            continue;
          }
          let pageHtml = await pageFile.text();

          // Inject brand colors + fonts into :root (same as homepage)
          pageHtml = injectBrandTokensIntoRoot(pageHtml, {
            primaryColor: primaryColorResolved,
            accentColor: accentColorResolved,
            headingFont: headingFontResolved || undefined,
            bodyFont: bodyFontResolved || undefined,
          });
          if (headingFontResolved || bodyFontResolved) {
            pageHtml = injectGoogleFontsLink(pageHtml, headingFontResolved, bodyFontResolved);
          }

          // Same header logo block pre-fill as homepage
          pageHtml = pageHtml.replace(headerLogoBlockRe, hasLogo
            ? logoHTML
            : `<span class="logo-text">${escapeHTML(businessName)}</span>`);

          // Apply the full fill map
          for (const [key, value] of Object.entries(fill)) {
            pageHtml = pageHtml.split(key).join(value);
          }

          // CSS is inline in these templates, so no stylesheet swap needed.
          // Auto-fill leftover placeholders, then strip anything still missing.
          const autoFilledPage = await autoFillPlaceholders(
            pageHtml,
            { businessName, businessType, city: intake.business_city || intake.city || "", services: services.map((s: any) => typeof s === "string" ? s : s?.name || s?.title).filter(Boolean).join(", "), notes: tagline },
            stockTerms,
          );
          pageHtml = autoFilledPage.html;
          await logUnfilledPlaceholders(supabase, clientId, templateId, page.slug, pageHtml);
          pageHtml = pageHtml.replace(/\{\{[^}]+\}\}/g, "");

          // Same safety net + analytics + form wiring + favicon as homepage
          pageHtml = pageHtml.replace("</body>", safetyNet + "\n</body>");
          pageHtml = pageHtml.replace("</body>", analyticsScript + "\n</body>");
          pageHtml = wireContactForms(pageHtml, clientId, supabaseUrl);
          pageHtml = injectFavicon(pageHtml, faviconTag);

          // Upload to Hostinger staging (with noindex)
          const stagingPageHTML = injectNoindex(pageHtml);
          await uploadFileToHostingerFtp(
            `${STAGING_FOLDER_ROOT}/${clientId}/${page.slug}.html`,
            stagingPageHTML,
          );
          console.log(`[generate] ✓ ${page.slug}.html → Hostinger staging`);

          // Backup clean (no noindex) version to deploy/
          const { error: pageBackupErr } = await supabase.storage
            .from("generated-sites")
            .upload(
              `${clientId}/deploy/${page.slug}.html`,
              new Blob([pageHtml], { type: "text/html" }),
              { upsert: true, contentType: "text/html; charset=utf-8" },
            );
          if (pageBackupErr) {
            console.warn(`[generate] feminine-bold: deploy backup failed for ${page.slug}.html: ${pageBackupErr.message}`);
          }
        } catch (e: any) {
          console.error(`[generate] feminine-bold: failed to build ${page.slug}.html:`, e?.message || e);
        }
      }
    }

    // ── Fire generate-extra-pages ────────────────────────────────────────
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
// placeholders inside it replaced by the item's named values, then joined.
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

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=["']?[^>"']+["']?\s*\/?>/i.test(html)) {
    return html.replace(/(<meta\s+charset=["']?[^>"']+["']?\s*\/?>)/i, `$1${tag}`);
  }
  return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

// ── business-professional template: direct CSS variable injection ──────
// This template defines --navy, --navy-mid, --gold, --gold-dark, and a
// --font-serif token, plus a Google Fonts <link> for Cormorant Garamond.
// We override these from intake.primary_color, intake.accent_color, and
// intake.font_preference ('modern' | 'classic' | 'minimal').
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
// Resolves a client-provided color to a clean #rrggbb / #rgb string,
// or returns the provided fallback (template default) when missing/invalid.
function resolveBrandColor(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (!raw) return fallback;
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return raw;
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return `#${raw}`;
  // Allow hsl()/rgb() functional notation as-is (browsers accept it in CSS vars)
  if (/^(hsl|rgb)a?\s*\(/i.test(raw)) return raw;
  return fallback;
}

// Replaces brand-color and font CSS variables inside the FIRST :root { ... }
// block of any template. Handles multiple naming conventions so it works
// across templates:
//   primary  → --red, --burgundy, --primary, --color-primary
//   accent   → --gold,             --accent,  --color-accent
//   fonts    → --font-heading, --font-body
// Other tokens (--navy, --white, --gray, etc.) are preserved exactly as the
// template defines them.
const PRIMARY_VAR_NAMES = ["--burgundy", "--red", "--primary", "--color-primary"];
const ACCENT_VAR_NAMES = ["--gold", "--accent", "--color-accent"];

function replaceCssVarInRoot(rootBody: string, names: string[], value: string): string {
  let out = rootBody;
  let replaced = false;
  for (const n of names) {
    const re = new RegExp(`(${n.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`, "i");
    if (re.test(out)) {
      out = out.replace(re, `$1${value}$3`);
      replaced = true;
    }
  }
  if (!replaced) {
    out = `${out.replace(/\s*$/, "")}\n  ${names[0]}: ${value};\n`;
  }
  return out;
}

interface BrandTokens {
  primaryColor?: string;
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
}

function injectBrandTokensIntoRoot(html: string, tokens: BrandTokens): string {
  return html.replace(/:root\s*\{([\s\S]*?)\}/, (_match, body: string) => {
    let out = body;
    if (tokens.primaryColor) out = replaceCssVarInRoot(out, PRIMARY_VAR_NAMES, tokens.primaryColor);
    if (tokens.accentColor) out = replaceCssVarInRoot(out, ACCENT_VAR_NAMES, tokens.accentColor);
    if (tokens.headingFont) {
      out = replaceCssVarInRoot(out, ["--font-heading"], `'${tokens.headingFont}', serif`);
    }
    if (tokens.bodyFont) {
      out = replaceCssVarInRoot(out, ["--font-body"], `'${tokens.bodyFont}', sans-serif`);
    }
    return `:root {${out}}`;
  });
}

// Backwards-compatible wrapper kept for callers using the old name.
function injectBrandColorsIntoRoot(html: string, primaryColor: string, accentColor: string): string {
  return injectBrandTokensIntoRoot(html, { primaryColor, accentColor });
}

// Inject a Google Fonts <link> for the chosen heading/body fonts.
function injectGoogleFontsLink(html: string, headingFont: string, bodyFont: string): string {
  const fonts = [headingFont, bodyFont].filter(Boolean);
  if (fonts.length === 0) return html;
  const families = [...new Set(fonts)]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`)
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  if (html.includes(href)) return html;
  const tag = `\n  <link rel="preconnect" href="https://fonts.googleapis.com" />\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n  <link href="${href}" rel="stylesheet" />`;
  if (/<meta\s+charset=["']?[^>"']+["']?\s*\/?>/i.test(html)) {
    return html.replace(/(<meta\s+charset=["']?[^>"']+["']?\s*\/?>)/i, `$1${tag}`);
  }
  return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

// Map a free-text font preference / heading_font / body_font to a real
// Google Fonts family name. Falls back to the input itself when the input
// already looks like a font name.
function resolveFontName(input: unknown): string {
  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  const map: Record<string, string> = {
    elegant: "Playfair Display",
    classic: "Merriweather",
    modern: "Inter",
    minimal: "Inter",
    bold: "Montserrat",
    feminine: "Cormorant Garamond",
    luxury: "Playfair Display",
    serif: "Playfair Display",
    "sans-serif": "Inter",
    sans: "Inter",
    handwritten: "Caveat",
    script: "Great Vibes",
    rounded: "Nunito",
  };
  return map[key] || raw;
}

// Priority: 1) intake.favicon_url, 2) intake.logo_url, 3) generated SVG initial.
export function buildFaviconHTML(opts: {
  faviconUrl?: string;
  logoUrl?: string;
  businessName?: string;
  primaryColor?: string;
}): string {
  const fav = (opts.faviconUrl || "").trim();
  if (fav) {
    return `<link rel="icon" href="${fav}" />`;
  }
  const logo = (opts.logoUrl || "").trim();
  if (logo) {
    return `<link rel="icon" href="${logo}" />`;
  }
  const initial = ((opts.businessName || "").trim().charAt(0) || "S").toUpperCase();
  const rawColor = (opts.primaryColor || "").trim() || "#534AB7";
  const color = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(rawColor)
    ? (rawColor.startsWith("#") ? rawColor : `#${rawColor}`)
    : "#534AB7";
  // Build the SVG; URL-encode # and a few other chars so it works inside an href.
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='${color}'/><text y='.9em' font-size='75' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle' x='50' dominant-baseline='middle' dy='5'>${escapeHTML(initial)}</text></svg>`;
  const href = `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/"/g, "%22")}`;
  return `<link rel="icon" type="image/svg+xml" href="${href}" />`;
}

export function injectFavicon(html: string, faviconTag: string): string {
  if (!faviconTag) return html;
  // Remove any existing favicon link tags so ours wins.
  let out = html.replace(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*\/?>/gi, "");
  const tag = `\n  ${faviconTag}`;
  if (/<meta\s+charset=["']?[^>"']+["']?\s*\/?>/i.test(out)) {
    return out.replace(/(<meta\s+charset=["']?[^>"']+["']?\s*\/?>)/i, `$1${tag}`);
  }
  return out.replace(/(<head[^>]*>)/i, `$1${tag}`);
}


async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    console.warn(`[${label}] Anthropic key unavailable — using Lovable AI fallback.`);
    return callLovableAI(LOVABLE_API_KEY, content, label);
  }

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
        const message = `Claude ${label} failed: ${r.status} — ${errText.substring(0, 300)}`;
        if (LOVABLE_API_KEY && isAnthropicCreditError(r.status, errText)) {
          console.warn(`[${label}] Anthropic credits unavailable — using Lovable AI fallback.`);
          return callLovableAI(LOVABLE_API_KEY, content, label);
        }
        throw new Error(message);
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

function isAnthropicCreditError(status: number, errText: string): boolean {
  const lower = errText.toLowerCase();
  return status === 400 && (
    lower.includes("credit balance is too low") ||
    lower.includes("purchase credits") ||
    lower.includes("plans & billing")
  );
}

async function callLovableAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(LOVABLE_AI_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LOVABLE_AI_MODEL,
        messages: [{ role: "user", content }],
      }),
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const errText = await r.text();
      if (r.status === 429) throw new Error(`Lovable AI rate limit reached while generating ${label}. Please try again in a minute.`);
      if (r.status === 402) throw new Error(`Lovable AI credits are exhausted while generating ${label}. Please add AI balance in Lovable.`);
      throw new Error(`Lovable AI ${label} failed: ${r.status} — ${errText.substring(0, 300)}`);
    }

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "";
    return { text, outputTokens: data.usage?.completion_tokens || data.usage?.output_tokens || 0 };
  } catch (err: any) {
    clearTimeout(timeout);
    throw err.name === "AbortError"
      ? new Error(`Lovable AI ${label} timed out after ${TIMEOUT_MS / 1000}s`)
      : err;
  }
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

function escapeHTML(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHTML(s);
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

  // Online (or other "no map" types) → hide map entirely
  if (type === "online" || type === "remote" || type === "virtual" || type === "none") {
    return { html: "", url: "" };
  }

  // A fixed-location business: storefront / physical / hybrid → pin the address
  const isFixedLocation =
    type === "storefront" || type === "physical" || type === "hybrid";

  let url = "";
  if (isFixedLocation && (street || city)) {
    const q = [street, city, state, zip].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  } else if ((type === "mobile" || !type) && (city || state)) {
    // Mobile / service-area / unknown → city+state with a wider zoom
    const q = [city, state].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=9&output=embed`;
  } else if (city || state) {
    // Final safety fallback for any other type — still render a map
    const q = [city, state].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=9&output=embed`;
  }

  if (!url) {
    return {
      html: `<div class="map-placeholder"><p>📍 SERVING ${(input.serviceArea || city || "OUR AREA").toUpperCase()} &amp; SURROUNDING AREAS</p></div>`,
      url: "",
    };
  }

  const html = `<iframe class="map-iframe" src="${url}" width="100%" height="100%" style="border:0;min-height:400px;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  return { html, url };
}

// ── Photo helpers ─────────────────────────────────────────────────────
// Build specific Unsplash search terms based on the client's business type,
// first service, tagline, and business name — so stock photos are always
// relevant to what the business actually does (e.g. a business coach gets
// "coaching women business" instead of a random landscape).
function buildStockSearchTerms(
  businessType: string,
  firstService: string,
  tagline = "",
  businessName = "",
): string[] {
  // Always lead with a client-specific query: service[0].name + tagline +
  // businessType, capped at 50 chars. Strips the business name itself so
  // we don't search Unsplash for the company brand.
  const stripWords = (businessName || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const cleanTagline = (tagline || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stripWords.includes(w))
    .slice(0, 4)
    .join(" ");
  const clientQuery = [firstService, cleanTagline, businessType]
    .map((s) => (s || "").toString().trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 50)
    .trim();

  const ctx = `${businessType || ""} ${firstService || ""} ${tagline || ""}`.toLowerCase();
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
    { match: /restaurant|cafe|food|bakery|dining/, terms: ["restaurant interior", "chef cooking kitchen", "cafe atmosphere"] },
    { match: /fitness|gym|train(?!ing services)/, terms: ["fitness training session", "gym workout", "personal trainer client"] },
    { match: /photo/, terms: ["photographer working", "photography studio", "camera lens close up"] },
    { match: /law|attorney|legal/, terms: ["modern law office", "attorney consultation", "legal documents desk"] },
    { match: /dental|dentist/, terms: ["modern dental office", "dentist patient", "dental clinic"] },
    { match: /vet|pet|animal/, terms: ["veterinarian with pet", "pet grooming", "happy dog at vet"] },
    { match: /auto|mechanic|car repair/, terms: ["auto mechanic working", "car repair shop", "mechanic engine bay"] },
    { match: /pest|exterminat/, terms: ["pest control technician", "exterminator working", "pest control service"] },
    { match: /pool/, terms: ["pool maintenance", "pool cleaner working", "swimming pool service"] },
    { match: /window/, terms: ["window installation", "window cleaner working", "professional window service"] },
    { match: /coach|coaching|mentor|consult/, terms: ["business coaching session", "professional consultant meeting", "mentor and client conversation"] },
    { match: /therapy|therapist|counsel|wellness|holistic|healer/, terms: ["calm therapy session", "wellness retreat lifestyle", "candid mindfulness moment"] },
    { match: /yoga|pilates|meditation/, terms: ["yoga studio practice", "calm meditation session", "pilates class"] },
    { match: /real estate|realtor|property/, terms: ["modern home interior", "real estate agent showing house", "luxury property listing"] },
    { match: /event|wedding|planner/, terms: ["elegant event styling", "wedding ceremony decor", "event planner at work"] },
    { match: /design|interior|architect/, terms: ["modern interior design", "designer studio workspace", "architect plans on desk"] },
  ];
  for (const { match, terms } of map) {
    if (match.test(ctx)) {
      // Prefer the client-specific query when it adds real signal beyond
      // the business type alone, otherwise stick with the curated terms.
      return clientQuery && clientQuery.length > (businessType?.length || 0) + 2
        ? [clientQuery, ...terms]
        : terms;
    }
  }
  // No category match — rely on the client-specific query first, then
  // safe generic fallbacks so we never end up with totally random images.
  const safe = clientQuery || `professional ${businessType || "small business"}`;
  return [safe, `${safe} professional`, `professional ${businessType || "small business"} service`];
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
        if (p?.urls?.raw) return `${p.urls.raw}&w=1200&h=1200&fit=crop&crop=entropy&auto=format&q=80`;
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

// ── Contact form wiring ────────────────────────────────────────────────
// Post-processes generated HTML so every <form> element on the page submits
// to the handle-contact-form edge function with a hidden client_id and a
// honeypot field, plus a small JS handler that AJAX-submits and shows a
// success / error message in place of the form.
export function wireContactForms(html: string, clientId: string, supabaseUrl: string): string {
  const endpoint = `${supabaseUrl}/functions/v1/handle-contact-form`;

  // For every <form ...> opening tag: set action, set method="post", inject hidden inputs.
  const out = html.replace(/<form\b([^>]*)>/gi, (_match, attrs: string) => {
    let a = attrs;
    // Strip existing action and method to avoid duplicates
    a = a.replace(/\s+action\s*=\s*("[^"]*"|'[^']*')/gi, "");
    a = a.replace(/\s+method\s*=\s*("[^"]*"|'[^']*')/gi, "");
    // Tag the form so our JS can find it
    if (!/data-sq-contact-form/i.test(a)) {
      a += ` data-sq-contact-form="1"`;
    }
    const hidden = `
      <input type="hidden" name="client_id" value="${clientId}" />
      <input type="text" name="website" tabindex="-1" autocomplete="off" style="display:none !important;position:absolute;left:-10000px;" aria-hidden="true" />`;
    return `<form action="${endpoint}" method="post"${a}>${hidden}`;
  });

  // Inject the submit handler script just before </body>.
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
