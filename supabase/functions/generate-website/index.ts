/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GENERATE-WEBSITE — SiteQueen Homepage Generator (v2 Rewrite)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   1. FETCH — Pull all client data from Supabase
 *   2. RESOLVE — Determine business context, photos, sections, mode
 *   3. AI CALL — One smart call returns all copy + image terms + section decisions
 *   4. EXECUTE — Deterministic template fill (AI never touches HTML)
 *   5. POST-PROCESS — Colors, fonts, forms, analytics, favicon, validation
 *   6. UPLOAD — FTP to Hostinger staging + Supabase backups
 *   7. DISPATCH — Fire generate-extra-pages
 *
 * Principles:
 *   - Figma templates are sacred — AI writes copy, never HTML
 *   - One AI call, deterministic execution
 *   - Empty sections are removed, never shown with placeholder text
 *   - Images match the business (AI describes scenes, not categories)
 *   - Character limits are enforced before injection
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";
import { logUnfilledPlaceholders } from "../_shared/diagnostics.ts";
import { generateRestaurantSite, RESTAURANT_TEMPLATE_ID } from "../_shared/restaurant-generator.ts";
import { applyBrandColorsToHTML, logColorApplication, type ColorPlacement, type SkippedBrandColor } from "../_shared/color-system.ts";
// SmartTextReplacer not used directly — truncation is inline for simplicity
import { HTMLValidator } from "../_shared/html-validator.ts";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";
const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-3-flash-preview";
const TIMEOUT_MS = 300_000; // 5 minutes — sonnet is faster than opus

const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html";

// Per-template CTA defaults — used when AI doesn't supply one
const TEMPLATE_DEFAULT_CTAS: Record<string, string> = {
  "trades-hero": "GET A FREE QUOTE",
  "business-professional": "SCHEDULE CONSULTATION",
  "feminine-bold": "LET'S WORK TOGETHER",
  "warm-welcome": "BOOK APPOINTMENT",
  "local-favorite": "RESERVE A TABLE",
};

// Template file mapping (short names → bucket folder names)
const TEMPLATE_FILE_MAP: Record<string, string> = {
  trades: "trades-hero",
  feminine: "feminine-bold",
  warm: "warm-welcome",
  local: "local-favorite",
  modern: "modern-business",
  professional: "business-professional",
};

const FALLBACK_TEMPLATE = "trades-hero";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Auth check ──────────────────────────────────────────────────────────
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

  // ── Parse request ───────────────────────────────────────────────────────
  let clientId = "";
  let mode: "full" | "lite" = "full";
  try {
    const body = await req.json();
    clientId = body.client_id;
    if (body.mode === "lite") mode = "lite";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
  }
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
  }

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1: FETCH ALL DATA
    // ═════════════════════════════════════════════════════════════════════════

    // Bump attempt counter
    const { data: existingSite } = await supabase
      .from("sites").select("generation_attempts").eq("client_id", clientId).maybeSingle();

    await supabase.from("sites").update({
      generation_status: "generating",
      generation_progress: "fetching_data",
      generation_attempts: ((existingSite as any)?.generation_attempts || 0) + 1,
      last_generation_attempt_at: new Date().toISOString(),
      generation_error: null,
    } as any).eq("client_id", clientId);

    // Fetch or create site record
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

    // Snapshot intake for audit trail
    await supabase.from("sites").update({
      intake_snapshot: intake,
      intake_snapshot_saved_at: new Date().toISOString(),
    } as any).eq("client_id", clientId);

    // Fetch call notes (expert instructions from onboarding call)
    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    if (callNotes) {
      await supabase.from("sites").update({ call_notes_snapshot: callNotes } as any).eq("client_id", clientId);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2: LOAD TEMPLATE
    // ═════════════════════════════════════════════════════════════════════════

    const selectedTemplate =
      intake?.template_selected ||
      (callNotes as any)?.template_selected ||
      intake?.template_id;

    const requestedTemplateId = selectedTemplate
      ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate)
      : FALLBACK_TEMPLATE;

    let templateId = requestedTemplateId;
    let { data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`);
    let { data: cssFile } = await supabase.storage.from("templates").download(`${templateId}/style.css`);

    if (!htmlFile && templateId !== FALLBACK_TEMPLATE) {
      console.warn(`[generate] Template "${templateId}" not found — falling back to "${FALLBACK_TEMPLATE}".`);
      templateId = FALLBACK_TEMPLATE;
      ({ data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}/index.html`));
      ({ data: cssFile } = await supabase.storage.from("templates").download(`${templateId}/style.css`));
    }

    if (!htmlFile) throw new Error(`Template not found: ${templateId}/index.html`);

    // ── Restaurant template: fully isolated pipeline ─────────────────────
    if (templateId === RESTAURANT_TEMPLATE_ID) {
      try {
        const result = await generateRestaurantSite({
          supabase: supabase as any, clientId, intake, callNotes,
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

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 3: RESOLVE BUSINESS CONTEXT
    // ═════════════════════════════════════════════════════════════════════════

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
    const tagline = intake.tagline || "";
    const noTestimonials = !!intake.no_testimonials || (mode === "lite" && !googleReviewCount);

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

    const serviceNames = services.slice(0, 6).map((s: any) =>
      typeof s === "string" ? s : s?.name || s?.title || ""
    ).filter(Boolean);

    // Client-provided service areas
    const clientServiceAreaNames: string[] = serviceAreas
      .map((a: any) => (typeof a === "string" ? a : (a?.name || a?.city || a?.title || "")).toString().trim())
      .filter(Boolean);

    console.log(`[generate] Mode: ${mode} | Template: ${templateId} | Client: ${clientId}`);
    console.log(`[generate] Business: "${businessName}" (${businessType}) in ${city}, ${state}`);

    // ── Photo resolution ─────────────────────────────────────────────────
    const allowStock =
      intake.use_stock_photos !== false &&
      (siteData as any).using_stock_photos !== false;

    const heroCandidates = [intake.hero_photo_url, portfolioPhotos[0]].filter(Boolean) as string[];
    const aboutCandidates = [teamPhotos[0], intake.owner_photo_url, portfolioPhotos[1], portfolioPhotos[0]].filter(Boolean) as string[];
    const whyUsCandidates = [portfolioPhotos[2], portfolioPhotos[1], portfolioPhotos[0]].filter(Boolean) as string[];

    let heroImageUrl = heroCandidates[0] || "";
    let aboutImageUrl = aboutCandidates[0] || "";
    let whyUsImageUrl = whyUsCandidates[0] || "";

    const logoUrlResolved = intake.logo_url || "";
    console.log(`[generate] Photos — hero:${heroImageUrl ? "✓" : "✗"} about:${aboutImageUrl ? "✓" : "✗"} whyus:${whyUsImageUrl ? "✓" : "✗"} logo:${logoUrlResolved ? "✓" : "✗"} allowStock=${allowStock}`);

    // ── Apply brand colors + fonts to template ───────────────────────────
    if (templateId === "business-professional") {
      templateHTML = applyBusinessProfessionalFonts(templateHTML, intake);
    }

    const __brand = { primary: intake.primary_color ?? null, accent: intake.accent_color ?? null };
    const __colorRes = applyBrandColorsToHTML(templateHTML, __brand, templateId);
    templateHTML = __colorRes.html;
    const primaryColorResolved = (intake.primary_color || "").trim() || "";
    const accentColorResolved = (intake.accent_color || "").trim() || "";

    const headingFontResolved = resolveFontName(
      (intake as any).heading_font || (intake as any).preferred_font || (intake as any).font_preference
    );
    const bodyFontResolved = resolveFontName(
      (intake as any).body_font || (intake as any).preferred_font || (intake as any).font_preference
    );
    if (headingFontResolved || bodyFontResolved) {
      templateHTML = injectFontTokensIntoRoot(templateHTML, {
        headingFont: headingFontResolved || undefined,
        bodyFont: bodyFontResolved || undefined,
      });
      templateHTML = injectGoogleFontsLink(templateHTML, headingFontResolved, bodyFontResolved);
    }
    console.log(`[generate] Brand — primary=${primaryColorResolved || "(none)"}, heading="${headingFontResolved}", body="${bodyFontResolved}"`);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 4: ONE SMART AI CALL
    // ═════════════════════════════════════════════════════════════════════════

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!ANTHROPIC_API_KEY && !Deno.env.get("LOVABLE_API_KEY")) {
      throw new Error("No AI provider configured");
    }

    await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

    const copyPrompt = buildCopyPrompt({
      templateId, mode, businessName, businessType, city, state, phone, email,
      address, yearsInBusiness, googleRating, googleReviewCount, aboutStory,
      ownerName, ownerTitle, tagline, serviceNames, clientServiceAreaNames,
      noTestimonials, showFinancing, showAwards, showCoupons,
      intake, callNotes,
    });

    console.log("[generate] Calling AI for site blueprint...");
    const copyResult = await callAI(ANTHROPIC_API_KEY, copyPrompt, "site-blueprint");

    // Parse AI response
    let copy: any = {};
    try {
      let rawCopy = stripMarkdown(copyResult.text);
      // JSON repair: trailing commas, BOM, extract JSON object
      rawCopy = rawCopy.replace(/,\s*([}\]])/g, "$1");
      rawCopy = rawCopy.replace(/(["'])\s*\n\s*/g, "$1 ");
      rawCopy = rawCopy.replace(/[\u200B-\u200D\uFEFF]/g, "");
      const jsonStart = rawCopy.indexOf("{");
      const jsonEnd = rawCopy.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        rawCopy = rawCopy.slice(jsonStart, jsonEnd + 1);
      }
      copy = JSON.parse(rawCopy);
    } catch (e) {
      console.error("[generate] JSON parse failed:", e);
      // Regex fallback: extract key-value pairs
      try {
        const fallbackCopy: any = {};
        const kvMatches = copyResult.text.matchAll(/"([A-Z_0-9]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
        for (const m of kvMatches) {
          fallbackCopy[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
        if (Object.keys(fallbackCopy).length > 10) {
          console.warn(`[generate] Regex fallback extracted ${Object.keys(fallbackCopy).length} fields`);
          copy = fallbackCopy;
        } else {
          throw new Error("AI returned invalid JSON (all repair attempts failed)");
        }
      } catch (e2) {
        throw new Error("AI returned invalid JSON (all repair attempts failed)");
      }
    }

    console.log(`[generate] AI returned ${Object.keys(copy).length} fields (${copyResult.outputTokens} tokens)`);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 5: VALIDATE & TRUNCATE COPY
    // ═════════════════════════════════════════════════════════════════════════

    await supabase.from("sites").update({ generation_progress: "filling_template" } as any).eq("client_id", clientId);

    // Truncate copy fields that exceed character limits
    const charLimits: Record<string, number> = {
      HERO_HEADLINE_LINE1: 30,
      HERO_HEADLINE_HIGHLIGHT: 25,
      HERO_HEADLINE_LINE2: 30,
      HERO_SUBHEADING: 200,
      ABOUT_HEADLINE: 45,
      SERVICE_1_NAME: 30, SERVICE_2_NAME: 30, SERVICE_3_NAME: 30,
      SERVICE_4_NAME: 30, SERVICE_5_NAME: 30, SERVICE_6_NAME: 30,
      SERVICE_1_DESC: 200, SERVICE_2_DESC: 200, SERVICE_3_DESC: 200,
      SERVICE_4_DESC: 200, SERVICE_5_DESC: 200, SERVICE_6_DESC: 200,
      TESTIMONIAL_1_TEXT: 250, TESTIMONIAL_2_TEXT: 250, TESTIMONIAL_3_TEXT: 250,
      WHY_US_1_TITLE: 30, WHY_US_2_TITLE: 30, WHY_US_3_TITLE: 30, WHY_US_4_TITLE: 30,
      WHY_US_1_DESC: 200, WHY_US_2_DESC: 200, WHY_US_3_DESC: 200, WHY_US_4_DESC: 200,
      STAT_1_NUMBER: 8, STAT_2_NUMBER: 8, STAT_3_NUMBER: 8, STAT_4_NUMBER: 8,
      STAT_1_LABEL: 20, STAT_2_LABEL: 20, STAT_3_LABEL: 20, STAT_4_LABEL: 20,
      FOOTER_TAGLINE: 50,
      ABOUT_STORY: 600,
    };
    for (const [key, maxLen] of Object.entries(charLimits)) {
      if (copy[key] && copy[key].length > maxLen) {
        console.warn(`[generate] Truncated ${key}: ${copy[key].length} → ${maxLen}`);
        copy[key] = copy[key].substring(0, maxLen - 3) + "...";
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 6: FETCH STOCK IMAGES (using AI's scene descriptions)
    // ═════════════════════════════════════════════════════════════════════════

    if (allowStock) {
      const needed: Array<"hero" | "about" | "whyus"> = [];
      if (!heroImageUrl) needed.push("hero");
      if (!aboutImageUrl) needed.push("about");
      if (!whyUsImageUrl) needed.push("whyus");

      if (needed.length > 0) {
        const stockResults = await Promise.all(needed.map((slot) => {
          let searchQuery: string;
          if (slot === "hero" && copy.IMAGE_SEARCH_HERO) {
            searchQuery = copy.IMAGE_SEARCH_HERO;
          } else if (slot === "about" && copy.IMAGE_SEARCH_ABOUT) {
            searchQuery = copy.IMAGE_SEARCH_ABOUT;
          } else if (slot === "whyus" && copy.IMAGE_SEARCH_WHYUS) {
            searchQuery = copy.IMAGE_SEARCH_WHYUS;
          } else {
            // Fallback: use business type + slot context
            const variant = slot === "hero" ? "professional workspace" : slot === "about" ? "team working" : "quality results";
            searchQuery = `${businessType} ${variant}`;
          }
          console.log(`[generate] Stock search for ${slot}: "${searchQuery}"`);
          return fetchUnsplashPhotoUrl([searchQuery, `${businessType} professional`]);
        }));
        needed.forEach((slot, i) => {
          const url = stockResults[i] || "";
          if (slot === "hero") heroImageUrl = url;
          else if (slot === "about") aboutImageUrl = url;
          else if (slot === "whyus") whyUsImageUrl = url;
        });
      }
    }
    console.log(`[generate] Final photos — hero:${heroImageUrl ? "✓" : "✗"} about:${aboutImageUrl ? "✓" : "✗"} whyus:${whyUsImageUrl ? "✓" : "✗"}`);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 7: DETERMINISTIC TEMPLATE EXECUTION
    // ═════════════════════════════════════════════════════════════════════════
    // AI never touches HTML. This phase is pure string replacement.

    let html = templateHTML;

    // ── 7a: Section removal ──────────────────────────────────────────────
    const sectionsToRemove = parseSectionsToRemove(copy.SECTIONS_TO_REMOVE, {
      noTestimonials,
      noAddress: !address && !city,
      noServiceAreas: serviceAreas.length === 0 && !city,
    });
    console.log(`[generate] Removing sections: ${sectionsToRemove.length > 0 ? sectionsToRemove.join(", ") : "none"}`);

    for (const section of sectionsToRemove) {
      html = removeSection(html, section);
    }

    // ── 7b: Conditional sections (Mustache-style) ────────────────────────
    html = applyConditional(html, "SHOW_FINANCING", showFinancing);
    html = applyConditional(html, "SHOW_AWARDS", showAwards);
    html = applyConditional(html, "SHOW_COUPONS", showCoupons);

    // Render repeating COUPONS block
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

    // ── 7c: Build fill map ───────────────────────────────────────────────
    const hasLogo = !!logoUrlResolved;
    const logoHTML = hasLogo
      ? `<img src="${logoUrlResolved}" alt="${escapeAttr(businessName)} logo" class="logo-img" />`
      : "";

    const mapBuild = buildMapHTML({
      locationType: intake.location_type || intake.business_location_type || "",
      streetAddress: intake.street_address || intake.business_address || intake.address || "",
      city, state,
      zip: intake.business_zip || intake.zip || intake.postal_code || intake.zip_code || "",
      serviceArea: intake.service_area || "",
    });

    const serviceOptionsHTML = serviceNames.length
      ? serviceNames.map((s: string) => `<option value="${escapeAttr(s)}">${escapeHTML(s)}</option>`).join("\n")
      : `<option value="general">General Inquiry</option>`;

    // Social links — clean, no doubled URLs
    const socialLinks = intake.social_links || {};
    const instagramUrl = socialLinks.instagram
      ? (socialLinks.instagram.startsWith("http") ? socialLinks.instagram : `https://instagram.com/${String(socialLinks.instagram).replace("@", "")}`)
      : "";

    const fill: Record<string, string> = {
      // ── Business basics ──
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

      // ── Hero ──
      "{{HERO_BADGE}}": copy.HERO_BADGE || "",
      "{{HERO_HEADLINE_LINE1}}": copy.HERO_HEADLINE_LINE1 || "",
      "{{HERO_HEADLINE_HIGHLIGHT}}": copy.HERO_HEADLINE_HIGHLIGHT || "",
      "{{HERO_HEADLINE_LINE2}}": copy.HERO_HEADLINE_LINE2 || "",
      "{{HERO_HEADLINE_LINE3}}": copy.HERO_HEADLINE_LINE3 || "",
      "{{HERO_HEADLINE_COMMA}}": (copy.HERO_HEADLINE_LINE2 || copy.HERO_HEADLINE_LINE3) ? "," : "",
      "{{HERO_SUBHEADING}}": copy.HERO_SUBHEADING || "",
      "{{TRUST_ITEM_3}}": copy.TRUST_ITEM_3 || "FAMILY OWNED",

      // ── About ──
      "{{ABOUT_HEADLINE}}": copy.ABOUT_HEADLINE || "",
      "{{ABOUT_STORY}}": copy.ABOUT_STORY || "",
      "{{ABOUT_POINT_1}}": copy.ABOUT_POINT_1 || "",
      "{{ABOUT_POINT_2}}": copy.ABOUT_POINT_2 || "",
      "{{ABOUT_POINT_3}}": copy.ABOUT_POINT_3 || "",
      "{{ABOUT_POINT_4}}": copy.ABOUT_POINT_4 || "",

      // ── Stats ──
      "{{STAT_1_NUMBER}}": copy.STAT_1_NUMBER || "500+",
      "{{STAT_1_LABEL}}": copy.STAT_1_LABEL || "JOBS COMPLETED",
      "{{STAT_2_NUMBER}}": copy.STAT_2_NUMBER || (googleRating ? `${googleRating}★` : "4.9★"),
      "{{STAT_2_LABEL}}": copy.STAT_2_LABEL || "GOOGLE RATING",
      "{{STAT_3_NUMBER}}": copy.STAT_3_NUMBER || "24/7",
      "{{STAT_3_LABEL}}": copy.STAT_3_LABEL || "EMERGENCY SERVICE",
      "{{STAT_4_NUMBER}}": copy.STAT_4_NUMBER || "100%",
      "{{STAT_4_LABEL}}": copy.STAT_4_LABEL || "SATISFACTION GUARANTEED",

      // ── Services ──
      "{{SERVICES_HEADLINE}}": copy.SERVICES_HEADLINE || "OUR SERVICES",
      "{{SERVICES_SUBHEADING}}": copy.SERVICES_SUBHEADING || "",
      "{{SERVICES_INTRO}}": copy.SERVICES_INTRO || copy.SERVICES_SUBTEXT || "",
      "{{SERVICES_SUBTEXT}}": copy.SERVICES_SUBTEXT || copy.SERVICES_INTRO || "",
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

      // ── About page hero (business-professional) ──
      "{{ABOUT_HEADLINE_LINE1}}": copy.ABOUT_HEADLINE_LINE1 || copy.ABOUT_HEADLINE || "",
      "{{ABOUT_HEADLINE_LINE2}}": copy.ABOUT_HEADLINE_LINE2 || "",
      "{{ABOUT_STORY_SHORT}}": (copy.ABOUT_STORY || "").split(/\n\n/)[0] || copy.ABOUT_STORY || "",

      // ── Who We Serve (business-professional) ──
      "{{SERVE_HEADLINE}}": copy.SERVE_HEADLINE || "WHO WE SERVE",
      "{{SERVE_SUBHEADING}}": copy.SERVE_SUBHEADING || "",
      "{{SERVE_BODY}}": copy.SERVE_BODY || "",
      "{{SERVE_1}}": copy.SERVE_1 || "",
      "{{SERVE_2}}": copy.SERVE_2 || "",
      "{{SERVE_3}}": copy.SERVE_3 || "",
      "{{SERVE_4}}": copy.SERVE_4 || "",

      // ── Footer ──
      "{{FOOTER_LEGAL_NOTE}}": copy.FOOTER_LEGAL_NOTE || "",
      "{{FOOTER_TAGLINE}}": copy.FOOTER_TAGLINE || tagline || "",
      "{{FOOTER_NEWSLETTER_TEXT}}": copy.FOOTER_NEWSLETTER_TEXT || "Sign up for exclusive deals and expert tips.",
      "{{BUSINESS_NAME_PART1}}": businessName,
      "{{BUSINESS_NAME_PART2}}": "",

      // ── Emergency ──
      "{{EMERGENCY_HEADLINE}}": copy.EMERGENCY_HEADLINE || "EMERGENCY? WE'RE ON THE WAY.",
      "{{EMERGENCY_SUBTEXT}}": copy.EMERGENCY_SUBTEXT || "",

      // ── Why Us ──
      "{{WHY_US_HEADLINE}}": copy.WHY_US_HEADLINE || "",
      "{{WHY_US_1_TITLE}}": copy.WHY_US_1_TITLE || "",
      "{{WHY_US_1_DESC}}": copy.WHY_US_1_DESC || "",
      "{{WHY_US_2_TITLE}}": copy.WHY_US_2_TITLE || "",
      "{{WHY_US_2_DESC}}": copy.WHY_US_2_DESC || "",
      "{{WHY_US_3_TITLE}}": copy.WHY_US_3_TITLE || "",
      "{{WHY_US_3_DESC}}": copy.WHY_US_3_DESC || "",
      "{{WHY_US_4_TITLE}}": copy.WHY_US_4_TITLE || "",
      "{{WHY_US_4_DESC}}": copy.WHY_US_4_DESC || "",

      // ── Testimonials ──
      "{{TESTIMONIAL_1_TEXT}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_TEXT || ""),
      "{{TESTIMONIAL_1_NAME}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_NAME || ""),
      "{{TESTIMONIAL_1_LOCATION}}": noTestimonials ? "" : (copy.TESTIMONIAL_1_LOCATION || city),
      "{{TESTIMONIAL_2_TEXT}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_TEXT || ""),
      "{{TESTIMONIAL_2_NAME}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_NAME || ""),
      "{{TESTIMONIAL_2_LOCATION}}": noTestimonials ? "" : (copy.TESTIMONIAL_2_LOCATION || city),
      "{{TESTIMONIAL_3_TEXT}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_TEXT || ""),
      "{{TESTIMONIAL_3_NAME}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_NAME || ""),
      "{{TESTIMONIAL_3_LOCATION}}": noTestimonials ? "" : (copy.TESTIMONIAL_3_LOCATION || city),

      // ── Financing ──
      "{{FINANCING_HEADLINE}}": showFinancing ? (copy.FINANCING_HEADLINE || "FLEXIBLE FINANCING AVAILABLE") : "",
      "{{FINANCING_SUBTEXT}}": showFinancing ? (copy.FINANCING_SUBTEXT || "") : "",

      // ── Service Areas ──
      "{{SERVICE_AREAS_HEADLINE}}": copy.SERVICE_AREAS_HEADLINE || `SERVING ${(city || "OUR AREA").toUpperCase()} & BEYOND`,
      "{{AREA_1}}": clientServiceAreaNames[0] || copy.AREA_1 || city || "",
      "{{AREA_2}}": clientServiceAreaNames[1] || copy.AREA_2 || "",
      "{{AREA_3}}": clientServiceAreaNames[2] || copy.AREA_3 || "",
      "{{AREA_4}}": clientServiceAreaNames[3] || copy.AREA_4 || "",
      "{{AREA_5}}": clientServiceAreaNames[4] || copy.AREA_5 || "",
      "{{AREA_6}}": clientServiceAreaNames[5] || copy.AREA_6 || "",
      "{{AREA_7}}": clientServiceAreaNames[6] || copy.AREA_7 || "",
      "{{AREA_8}}": clientServiceAreaNames[7] || copy.AREA_8 || "",

      // ── Awards ──
      "{{AWARD_1}}": showAwards ? (awards[0] ? (typeof awards[0] === "string" ? awards[0] : awards[0].name) : (copy.AWARD_1 || "")) : "",
      "{{AWARD_2}}": showAwards ? (awards[1] ? (typeof awards[1] === "string" ? awards[1] : awards[1].name) : (copy.AWARD_2 || "")) : "",
      "{{AWARD_3}}": showAwards ? (awards[2] ? (typeof awards[2] === "string" ? awards[2] : awards[2].name) : (copy.AWARD_3 || "")) : "",
      "{{AWARD_4}}": showAwards ? (awards[3] ? (typeof awards[3] === "string" ? awards[3] : awards[3].name) : (copy.AWARD_4 || "")) : "",
      "{{AWARD_5}}": showAwards ? (awards[4] ? (typeof awards[4] === "string" ? awards[4] : awards[4].name) : (copy.AWARD_5 || "")) : "",

      // ── FAQ ──
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

      // ── Final CTA ──
      "{{FINAL_CTA_HEADLINE}}": copy.FINAL_CTA_HEADLINE || "READY TO GET STARTED?",
      "{{FINAL_CTA_SUBTEXT}}": copy.FINAL_CTA_SUBTEXT || "",
      "{{FINAL_CTA_EYEBROW}}": copy.FINAL_CTA_EYEBROW || "✦ YOUR NEXT STEP",
      "{{FINAL_CTA_BODY}}": copy.FINAL_CTA_SUBTEXT || "",
      "{{FINAL_CTA_BTN}}": copy.FINAL_CTA_BTN || TEMPLATE_DEFAULT_CTAS[templateId] || "GET STARTED",

      // ── Coupons ──
      "{{COUPONS_NOTE}}": intake.coupons_note || "Print or show on phone. Cannot be combined with other offers.",

      // ── Map ──
      "{{MAP_HTML}}": mapBuild.html,
      "{{MAP_EMBED_URL}}": mapBuild.url,

      // ── Logos and images ──
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

      // ── Social links ──
      "{{SOCIAL_INSTAGRAM_URL}}": instagramUrl,
      "{{SOCIAL_FACEBOOK_URL}}": socialLinks.facebook || "",
      "{{SOCIAL_LINKEDIN_URL}}": socialLinks.linkedin || "",
      "{{SOCIAL_TIKTOK_URL}}": socialLinks.tiktok || "",
      "{{SOCIAL_PINTEREST_URL}}": socialLinks.pinterest || "",
      "{{SOCIAL_GOOGLE_URL}}": socialLinks.google_business || socialLinks.google || "",
      "{{SOCIAL_SUBSTACK_URL}}": socialLinks.substack || "",
      "{{SOCIAL_PODCAST_URL}}": socialLinks.podcast || "",
      "{{SOCIAL_BLOG_URL}}": socialLinks.blog || "",

      // ── Misc ──
      "{{DOMAIN}}": intake.domain || `staging.sitequeen.ai/${clientId}`,
      "{{CLIENT_ID}}": clientId,
      "{{SUPABASE_URL}}": supabaseUrl,

      // ── Nav/Hero CTAs ──
      "{{NAV_CTA}}": copy.NAV_CTA || TEMPLATE_DEFAULT_CTAS[templateId] || "GET STARTED",
      "{{HERO_CTA_PRIMARY}}": copy.HERO_CTA_PRIMARY || TEMPLATE_DEFAULT_CTAS[templateId] || "GET STARTED",
      "{{HERO_CTA_SECONDARY}}": copy.HERO_CTA_SECONDARY || "EXPLORE SERVICES",

      // ── Marquee ──
      "{{MARQUEE_1}}": copy.MARQUEE_1 || copy.PILLAR_1_TITLE || "",
      "{{MARQUEE_2}}": copy.MARQUEE_2 || copy.PILLAR_2_TITLE || "",
      "{{MARQUEE_3}}": copy.MARQUEE_3 || copy.PILLAR_3_TITLE || "",
      "{{MARQUEE_4}}": copy.MARQUEE_4 || "",

      // ── Lead Magnet ──
      "{{LEAD_MAGNET_EYEBROW}}": copy.LEAD_MAGNET_EYEBROW || "✦ A FREE GUIDE",
      "{{LEAD_MAGNET_BODY}}": copy.LEAD_MAGNET_BODY || copy.FOOTER_NEWSLETTER_TEXT || "",
      "{{LEAD_MAGNET_BTN}}": copy.LEAD_MAGNET_BTN || "GET ACCESS",
      "{{LEAD_MAGNET_NOTE}}": "No spam, ever. Unsubscribe anytime.",

      // ── FAQ eyebrow ──
      "{{FAQ_EYEBROW}}": "✦ COMMON QUESTIONS",

      // ── feminine-bold template extras ──
      ...buildFeminineBoldFill(templateId, copy, intake, ownerName, ownerTitle, businessName, businessType, services, portfolioPhotos, teamPhotos, city, noTestimonials, aboutImageUrl, heroImageUrl),
    };

    // ── 7d: Logo block pre-fill ──────────────────────────────────────────
    const headerLogoBlockRe = /\{\{LOGO_HTML\}\}\s*<span class="logo-text">\s*\{\{BUSINESS_NAME\}\}\s*<\/span>/g;
    html = html.replace(headerLogoBlockRe, hasLogo
      ? logoHTML
      : `<span class="logo-text">${escapeHTML(businessName)}</span>`);

    // ── 7e: Apply fill map ───────────────────────────────────────────────
    for (const [key, value] of Object.entries(fill)) {
      html = html.split(key).join(value);
    }

    // ── 7f: Inline CSS ───────────────────────────────────────────────────
    if (templateCSS) {
      html = html.replace(
        /<link\s+rel=["']stylesheet["']\s+href=["']styles?\.css["']\s*\/?>/i,
        `<style>\n${templateCSS}\n</style>`,
      );
    }

    // ── 7g: Strip remaining placeholders ─────────────────────────────────
    await logUnfilledPlaceholders(supabase as any, clientId, templateId, "index", html);
    const remainingPlaceholders = html.match(/\{\{[^}]+\}\}/g) || [];
    if (remainingPlaceholders.length > 0) {
      console.warn(`[generate] ${remainingPlaceholders.length} unfilled placeholders stripped:`, remainingPlaceholders.slice(0, 10).join(", "));
    }
    html = html.replace(/\{\{[^}]+\}\}/g, "");

    // ── 7h: Footer/address cleanup ───────────────────────────────────────
    const hasAddress = !!(intake.street_address || intake.business_address || intake.address);
    if (!hasAddress) {
      html = html.replace(/,\s*\d{5}(?:-\d{4})?/g, "");
      html = html.replace(/<(?:span|p|div)[^>]*>\s*,?\s*<\/(?:span|p|div)>/g, "");
      if (!city) {
        html = html.replace(/<(?:span|p|div|a)[^>]*>\s*,\s*<\/(?:span|p|div|a)>/g, "");
      }
    }
    // Remove doubled URLs in social links
    html = html.replace(/https?:\/\/[a-z]+\.com\/(https?:\/\/)/gi, "$1");

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 8: POST-PROCESSING (forms, analytics, favicon, validation)
    // ═════════════════════════════════════════════════════════════════════════

    // Safety net: force animate-on-scroll visible
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

    // Analytics tags
    html = addAnalyticsTags(html, "home");

    // Tracker script
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

    // Wire contact forms
    html = wireContactForms(html, clientId, supabaseUrl);

    // Favicon
    const faviconTag = buildFaviconHTML({
      faviconUrl: intake.favicon_url || "",
      logoUrl: logoUrlResolved,
      businessName,
      primaryColor: primaryColorResolved,
    });
    html = injectFavicon(html, faviconTag);

    // Pre-upload validation
    const finalValidator = new HTMLValidator(html);
    const validationReport = finalValidator.validate();
    console.log(`[generate] Fidelity score: ${validationReport.fidelityScore}/100`);
    if (validationReport.issues.length > 0) {
      const critical = validationReport.issues.filter(i => i.severity === "critical");
      const high = validationReport.issues.filter(i => i.severity === "high");
      if (critical.length > 0) console.warn(`[generate] ${critical.length} CRITICAL:`, critical.map(i => i.message).join("; "));
      if (high.length > 0) console.warn(`[generate] ${high.length} HIGH:`, high.map(i => i.message).join("; "));
    }
    try {
      await supabase.from("generation_logs").insert({
        client_id: clientId,
        template_id: templateId,
        status: "validation_complete",
        generation_notes: `Fidelity: ${validationReport.fidelityScore}/100. Issues: ${validationReport.issues.length}. Unfilled stripped: ${remainingPlaceholders.length}.`,
      } as any);
    } catch (e: any) { console.warn("[generate] Log failed:", e.message); }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 9: UPLOAD TO HOSTINGER + SUPABASE BACKUPS
    // ═════════════════════════════════════════════════════════════════════════

    await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

    // Prospect banner injection
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

    // Backup clean version (no noindex) to Supabase storage
    const { error: backupErr } = await supabase.storage
      .from("generated-sites")
      .upload(`${clientId}/deploy/index.html`, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });
    if (backupErr) throw new Error(`Failed to save deploy backup: ${backupErr.message}`);

    // ── Persist copy-data.json (used by generate-extra-pages) ────────────
    const copyDataPayload = {
      businessName, businessType, city, state, phone, phoneRaw, email, address,
      yearsInBusiness, googleRating, googleReviewCount, tagline, ownerName, ownerTitle,
      logoUrl: logoUrlResolved, faviconUrl: intake.favicon_url || "", serviceNames, noTestimonials,
      portfolioPhotos, teamPhotos,
      heroImageUrl, aboutImageUrl, whyUsImageUrl,
      stockTerms: buildStockSearchTerms(businessType, serviceNames[0] || "", tagline, businessName),
      allowStock,
      primaryColor: primaryColorResolved,
      accentColor: accentColorResolved,
      copy,
    };
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/copy-data.json`,
      new Blob([JSON.stringify(copyDataPayload)], { type: "application/json" }),
      { upsert: true, contentType: "application/json" }
    );

    // ── Persist site-meta.json ───────────────────────────────────────────
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
      generation_notes: `Homepage generated. Template: ${templateId}. Tokens: ${copyResult.outputTokens}. Fidelity: ${validationReport.fidelityScore}/100.`,
    } as any);

    console.log(`[generate] ✓ Homepage complete → ${stagingURL}`);

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 10: FEMININE-BOLD SUBPAGES (about.html + services.html)
    // ═════════════════════════════════════════════════════════════════════════

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

          // Apply brand colors + fonts
          pageHtml = applyBrandColorsToHTML(pageHtml, { primary: intake.primary_color ?? null, accent: intake.accent_color ?? null }, templateId).html;
          if (headingFontResolved || bodyFontResolved) {
            pageHtml = injectFontTokensIntoRoot(pageHtml, {
              headingFont: headingFontResolved || undefined,
              bodyFont: bodyFontResolved || undefined,
            });
            pageHtml = injectGoogleFontsLink(pageHtml, headingFontResolved, bodyFontResolved);
          }

          // Logo block
          pageHtml = pageHtml.replace(headerLogoBlockRe, hasLogo
            ? logoHTML
            : `<span class="logo-text">${escapeHTML(businessName)}</span>`);

          // Apply fill map
          for (const [key, value] of Object.entries(fill)) {
            pageHtml = pageHtml.split(key).join(value);
          }

          // Strip leftover placeholders
          await logUnfilledPlaceholders(supabase as any, clientId, templateId, page.slug, pageHtml);
          pageHtml = pageHtml.replace(/\{\{[^}]+\}\}/g, "");

          // Post-processing
          pageHtml = pageHtml.replace("</body>", safetyNet + "\n</body>");
          pageHtml = pageHtml.replace("</body>", analyticsScript + "\n</body>");
          pageHtml = wireContactForms(pageHtml, clientId, supabaseUrl);
          pageHtml = injectFavicon(pageHtml, faviconTag);

          // Upload
          const stagingPageHTML = injectNoindex(pageHtml);
          await uploadFileToHostingerFtp(
            `${STAGING_FOLDER_ROOT}/${clientId}/${page.slug}.html`,
            stagingPageHTML,
          );
          console.log(`[generate] ✓ ${page.slug}.html → Hostinger staging`);

          // Backup
          await supabase.storage
            .from("generated-sites")
            .upload(
              `${clientId}/deploy/${page.slug}.html`,
              new Blob([pageHtml], { type: "text/html" }),
              { upsert: true, contentType: "text/html; charset=utf-8" },
            );
        } catch (e: any) {
          console.error(`[generate] feminine-bold: failed ${page.slug}.html:`, e?.message || e);
        }
      }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 11: DISPATCH EXTRA PAGES
    // ═════════════════════════════════════════════════════════════════════════

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


// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER — Constructs the single AI call prompt
// ═══════════════════════════════════════════════════════════════════════════

interface PromptContext {
  templateId: string;
  mode: "full" | "lite";
  businessName: string;
  businessType: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  address: string;
  yearsInBusiness: string;
  googleRating: string;
  googleReviewCount: string;
  aboutStory: string;
  ownerName: string;
  ownerTitle: string;
  tagline: string;
  serviceNames: string[];
  clientServiceAreaNames: string[];
  noTestimonials: boolean;
  showFinancing: boolean;
  showAwards: boolean;
  showCoupons: boolean;
  intake: any;
  callNotes: any;
}

function buildCopyPrompt(ctx: PromptContext): string {
  const {
    templateId, mode, businessName, businessType, city, state, phone, email,
    address, yearsInBusiness, googleRating, googleReviewCount, aboutStory,
    ownerName, ownerTitle, tagline, serviceNames, clientServiceAreaNames,
    noTestimonials, showFinancing, showAwards, showCoupons,
    intake, callNotes,
  } = ctx;

  const clientServiceAreaList = clientServiceAreaNames.length
    ? clientServiceAreaNames.map((n, i) => `  ${i + 1}. ${n}`).join("\n")
    : "(none provided — generate 8 real nearby cities/towns)";

  // ── Build the prompt ───────────────────────────────────────────────────
  let prompt = `You are a premium website copywriter. Generate all text content for a ${businessType} business website.

RETURN ONLY VALID JSON — no markdown, no explanation, no code blocks. Start with { and end with }.

═══════════════════════════════════════════════════════════
CHARACTER LIMITS — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════
The website uses fixed-width Figma containers. Exceeding these limits BREAKS the layout.

| Field Pattern              | Max Chars |
|----------------------------|-----------|
| *_HEADLINE_LINE1/2/3       | 30        |
| *_HEADLINE_HIGHLIGHT       | 25        |
| *_HEADLINE (single)        | 45        |
| *_BADGE / *_EYEBROW        | 25        |
| HERO_SUBHEADING            | 150       |
| SERVICE_*_NAME             | 30        |
| SERVICE_*_DESC             | 200       |
| WHY_US_*_TITLE             | 30        |
| WHY_US_*_DESC              | 200       |
| STAT_*_NUMBER              | 8         |
| STAT_*_LABEL               | 20        |
| TESTIMONIAL_*_TEXT         | 250       |
| TESTIMONIAL_*_NAME         | 25        |
| FAQ_*_Q                    | 80        |
| FAQ_*_A                    | 300       |
| AREA_*                     | 25        |
| AWARD_*                    | 35        |
| FOOTER_TAGLINE             | 50        |
| ABOUT_STORY                | 600       |
| *_SUBTEXT / *_INTRO        | 200       |

When in doubt, write SHORTER. Premium brands use restraint.
═══════════════════════════════════════════════════════════

`;

  // Template-specific rules
  if (templateId === "business-professional") {
    prompt += `═══════════════════════════════════════════════════════════
TEMPLATE RULES (business-professional)
═══════════════════════════════════════════════════════════

MULTI-SLOT HEADLINES: The hero has LINE1 + HIGHLIGHT + LINE2 that render as ONE continuous headline.
They MUST form a complete, grammatical phrase when read together.
- GOOD: LINE1="PHOENIX'S PREMIER" / HIGHLIGHT="TAX & ACCOUNTING" / LINE2="PARTNERS"
- BAD: LINE1="EXPERT" / HIGHLIGHT="SOLUTIONS FOR" / LINE2="" (hanging preposition)

Each line: 2-5 words, max 30 chars. Never end with a preposition.

FOOTER_LEGAL_NOTE: A short disclaimer (NOT a copyright — copyright is added automatically).
Example: "Information provided is general and not legal advice."
═══════════════════════════════════════════════════════════

`;
  }

  if (templateId === "feminine-bold") {
    prompt += `═══════════════════════════════════════════════════════════
TEMPLATE RULES (feminine-bold — personal brand)
═══════════════════════════════════════════════════════════

This template is for personal brands: coaches, attorneys, consultants, designers, therapists, photographers.
Do NOT assume coaching. Use the business_type (${businessType}) and owner_title (${ownerTitle}) to determine framing.
- Attorney → "Consultation" not "Session", "Practice" not "Method"
- Designer → "Project" not "Cohort", "Studio" not "Space"
- Therapist → "Practice" not "Program", "Session" not "Module"

DROPCAP HEADLINES: Several sections use a decorative first-letter. Provide the FULL headline text —
the system splits the first letter automatically. Never split it yourself.

ABOUT_STRIP: 4 lines of text that form a poetic/punchy statement about the business.
Line 1 starts after a large dropcap letter. All lines should be ALL CAPS, 2-4 words each.
═══════════════════════════════════════════════════════════

`;
  }

  // Mode-specific instructions
  if (mode === "lite") {
    prompt += `═══════════════════════════════════════════════════════════
LITE MODE — GBP Prospect (minimal data)
═══════════════════════════════════════════════════════════
This site is generated from Google Business Profile data only.
Infer realistic content based on business type and location:
- Infer 4-6 realistic services
- Write a credible about story
- Use soft stats ("500+" not exact counts)
- Do NOT invent certifications or specific credentials
- Write testimonials that reference inferred services naturally
═══════════════════════════════════════════════════════════

`;
  }

  // Business data
  prompt += `═══════════════════════════════════════════════════════════
BUSINESS DATA
═══════════════════════════════════════════════════════════
Name: ${businessName}
Type: ${businessType}
City: ${city}, ${state}
Phone: ${phone || "not provided"}
Years in business: ${yearsInBusiness || "not provided"}
Owner: ${ownerName || "not provided"} (${ownerTitle})
Story: ${aboutStory || "not provided"}
What makes them different: ${intake.story_different || "not provided"}
How they started: ${intake.story_started || "not provided"}
Ideal customer: ${intake.story_ideal_customer || "not provided"}
Google rating: ${googleRating || "not provided"}
Google reviews: ${googleReviewCount || "not provided"}
Services: ${serviceNames.join(", ") || "not provided — infer from business type"}
Tagline: ${tagline || "not provided"}

Service areas (use these FIRST, then generate nearby real cities):
${clientServiceAreaList}
═══════════════════════════════════════════════════════════

`;

  // Call notes (expert instructions)
  if (callNotes) {
    prompt += `═══════════════════════════════════════════════════════════
EXPERT CALL NOTES (highest priority — follow exactly)
═══════════════════════════════════════════════════════════
${JSON.stringify({
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
}, null, 2)}
═══════════════════════════════════════════════════════════

`;
  }

  // Rules
  prompt += `═══════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════
1. Every field MUST be filled (no empty strings) unless the section is opted out.
2. Use client's exact words/phrases verbatim where provided.
3. When data is missing, generate specific content for THIS business type in THIS city.
4. BANNED: "committed to excellence", "your satisfaction is our priority", "world-class", "seamless", "cutting-edge", "one-size-fits-all"
5. NEVER invent: phone numbers, addresses, ratings, certifications not provided.
6. All AREA_* values must be REAL cities/towns near ${city}, ${state}. Never generic phrases.
7. AREA_1 should be "${city || "the home city"}" itself.
${noTestimonials ? "8. NO TESTIMONIALS — set all TESTIMONIAL_* fields to empty string." : "8. Generate 3 realistic local testimonials referencing actual services."}
9. SECTIONS_TO_REMOVE: List sections to hide because data is missing/irrelevant.
   Valid: testimonials, service_areas, awards, financing, faq, emergency
   ${noTestimonials ? "MUST include 'testimonials'." : ""}
   ${!showFinancing ? "MUST include 'financing'." : ""}
10. IMAGE_SEARCH_*: Describe the SCENE, not the business type.
    GOOD: "woman journaling warm light cozy room" / "modern kitchen white marble renovation"
    BAD: "coaching" / "plumber" / "business"
═══════════════════════════════════════════════════════════

`;

  // JSON schema
  prompt += `Return this exact JSON structure:
{
  "META_DESCRIPTION": "155 char SEO meta description",
  "HERO_BADGE": "3-5 word trust badge e.g. TRUSTED SINCE ${yearsInBusiness || "2010"}",
  "HERO_HEADLINE_LINE1": "2-4 words ALL CAPS — start of 3-part headline",
  "HERO_HEADLINE_HIGHLIGHT": "1-3 words ALL CAPS — core noun (italic accent)",
  "HERO_HEADLINE_LINE2": "0-4 words ALL CAPS — completes the headline grammatically",
  "HERO_HEADLINE_LINE3": "Usually empty. Only if 4-line headline reads naturally.",
  "HERO_SUBHEADING": "1-2 sentences, mention city and core service",
  "ABOUT_HEADLINE_LINE1": "3-5 words (business-professional about hero)",
  "ABOUT_HEADLINE_LINE2": "3-5 words (italic accent, completes LINE1)",
  "SERVICES_SUBHEADING": "2-5 word italic phrase. NOT a sentence.",
  "SERVICES_INTRO": "1-2 sentences introducing services",
  "SERVE_HEADLINE": "3-5 words ALL CAPS",
  "SERVE_SUBHEADING": "2-4 words italic",
  "SERVE_BODY": "1-2 sentences",
  "SERVE_1": "1-3 words audience segment",
  "SERVE_2": "1-3 words audience segment",
  "SERVE_3": "1-3 words audience segment",
  "SERVE_4": "1-3 words audience segment",
  "FOOTER_LEGAL_NOTE": "Short disclaimer (NOT copyright). Under 20 words.",
  "TRUST_ITEM_3": "one trust badge e.g. FAMILY OWNED",
  "ABOUT_HEADLINE": "5-8 word headline",
  "ABOUT_STORY": "3-4 paragraphs. Use owner's actual story verbatim where possible.",
  "ABOUT_POINT_1": "key differentiator",
  "ABOUT_POINT_2": "key differentiator",
  "ABOUT_POINT_3": "key differentiator",
  "ABOUT_POINT_4": "key differentiator",
  "STAT_1_NUMBER": "e.g. 500+",
  "STAT_1_LABEL": "e.g. JOBS COMPLETED",
  "STAT_2_NUMBER": "${googleRating || "4.9"}★",
  "STAT_2_LABEL": "GOOGLE RATING",
  "STAT_3_NUMBER": "e.g. 24/7",
  "STAT_3_LABEL": "matching label",
  "STAT_4_NUMBER": "e.g. 100%",
  "STAT_4_LABEL": "matching label",
  "SERVICES_HEADLINE": "3-5 words ALL CAPS",
  "SERVICES_SUBTEXT": "1 sentence",
  "SERVICE_1_NAME": "${serviceNames[0] || "primary service for this business type"}",
  "SERVICE_1_DESC": "2 sentences specific to this service in ${city}",
  "SERVICE_2_NAME": "${serviceNames[1] || "second service"}",
  "SERVICE_2_DESC": "2 sentences",
  "SERVICE_3_NAME": "${serviceNames[2] || "third service"}",
  "SERVICE_3_DESC": "2 sentences",
  "SERVICE_4_NAME": "${serviceNames[3] || "fourth service"}",
  "SERVICE_4_DESC": "2 sentences",
  "SERVICE_5_NAME": "${serviceNames[4] || "fifth service"}",
  "SERVICE_5_DESC": "2 sentences",
  "SERVICE_6_NAME": "${serviceNames[5] || "sixth service"}",
  "SERVICE_6_DESC": "2 sentences",
  "EMERGENCY_HEADLINE": "4-6 words ALL CAPS",
  "EMERGENCY_SUBTEXT": "1-2 sentences about availability",
  "WHY_US_HEADLINE": "4-7 words",
  "WHY_US_1_TITLE": "3-5 words specific to THIS business",
  "WHY_US_1_DESC": "2 sentences",
  "WHY_US_2_TITLE": "3-5 words distinct",
  "WHY_US_2_DESC": "2 sentences",
  "WHY_US_3_TITLE": "3-5 words distinct",
  "WHY_US_3_DESC": "2 sentences",
  "WHY_US_4_TITLE": "3-5 words distinct",
  "WHY_US_4_DESC": "2 sentences",
  "HAPPY_CUSTOMERS": "round number e.g. 500",
  "REVIEW_PLATFORMS": "e.g. Google and Facebook",
  "TESTIMONIAL_1_TEXT": "${noTestimonials ? "" : "2-3 sentence testimonial referencing a service"}",
  "TESTIMONIAL_1_NAME": "${noTestimonials ? "" : "local name"}",
  "TESTIMONIAL_1_LOCATION": "${noTestimonials ? "" : city}",
  "TESTIMONIAL_2_TEXT": "${noTestimonials ? "" : "different testimonial"}",
  "TESTIMONIAL_2_NAME": "${noTestimonials ? "" : "different name"}",
  "TESTIMONIAL_2_LOCATION": "${noTestimonials ? "" : "nearby area"}",
  "TESTIMONIAL_3_TEXT": "${noTestimonials ? "" : "third testimonial"}",
  "TESTIMONIAL_3_NAME": "${noTestimonials ? "" : "different name"}",
  "TESTIMONIAL_3_LOCATION": "${noTestimonials ? "" : city + " area"}",
  "FINANCING_HEADLINE": "${showFinancing ? "financing headline" : ""}",
  "FINANCING_SUBTEXT": "${showFinancing ? "financing details" : ""}",
  "SERVICE_AREAS_HEADLINE": "4-6 words ALL CAPS",
  "AREA_1": "REAL city near ${city}, ${state}",
  "AREA_2": "REAL nearby city",
  "AREA_3": "REAL nearby city",
  "AREA_4": "REAL nearby city",
  "AREA_5": "REAL nearby city",
  "AREA_6": "REAL nearby city",
  "AREA_7": "REAL nearby city",
  "AREA_8": "REAL nearby city",
  "AWARD_1": "industry certification for ${businessType}",
  "AWARD_2": "different certification",
  "AWARD_3": "different certification",
  "AWARD_4": "different certification",
  "AWARD_5": "different certification",
  "FAQ_1_Q": "real question a ${businessType} customer would ask",
  "FAQ_1_A": "2-4 sentence answer",
  "FAQ_2_Q": "different question",
  "FAQ_2_A": "2-4 sentence answer",
  "FAQ_3_Q": "different question",
  "FAQ_3_A": "2-4 sentence answer",
  "FAQ_4_Q": "different question",
  "FAQ_4_A": "2-4 sentence answer",
  "FAQ_5_Q": "different question",
  "FAQ_5_A": "2-4 sentence answer",
  "FAQ_6_Q": "different question",
  "FAQ_6_A": "2-4 sentence answer",
  "FINAL_CTA_HEADLINE": "5-8 words ALL CAPS",
  "FINAL_CTA_SUBTEXT": "1-2 sentences",
  "FOOTER_TAGLINE": "${tagline || "5-8 word tagline for this business"}",
  "FOOTER_NEWSLETTER_TEXT": "1 sentence inviting email signup",
  "IMAGE_SEARCH_HERO": "3-6 descriptive words for Unsplash hero image SCENE",
  "IMAGE_SEARCH_ABOUT": "3-6 descriptive words for about/team image SCENE",
  "IMAGE_SEARCH_WHYUS": "3-6 descriptive words for portfolio/results image SCENE",
  "SECTIONS_TO_REMOVE": "comma-separated list or empty string"`;

  // Add feminine-bold specific fields
  if (templateId === "feminine-bold") {
    prompt += `,
  "OWNER_TITLE": "Professional title for ${ownerName || "the owner"} (2-4 words)",
  "ANNOUNCE_TEXT": "short announcement bar text",
  "ABOUT_STRIP_LINE1": "first word (after dropcap) in ALL CAPS",
  "ABOUT_STRIP_LINE2": "second line ALL CAPS 2-4 words",
  "ABOUT_STRIP_LINE3": "third line ALL CAPS 2-4 words",
  "ABOUT_STRIP_LINE4": "fourth line ALL CAPS 2-4 words, ends with period",
  "ABOUT_STRIP_BODY": "1-2 sentences expanding on the strip",
  "ABOUT_INTRO_HEADLINE": "personal intro e.g. Hi, I'm ${ownerName || "[name]"}",
  "ABOUT_INTRO_BODY": "2-3 sentences personal intro",
  "TRANSFORMATION_HEADLINE": "4-8 word headline for before/after section",
  "TRANSFORMATION_BODY": "1-2 sentences about the transformation journey",
  "BA_1_BEFORE": "before state 1",
  "BA_1_AFTER": "after state 1",
  "BA_2_BEFORE": "before state 2",
  "BA_2_AFTER": "after state 2",
  "BA_3_BEFORE": "before state 3",
  "BA_3_AFTER": "after state 3",
  "PHILOSOPHY_HEADLINE": "4-8 word headline for approach section",
  "PILLAR_1_TITLE": "1-2 word pillar title",
  "PILLAR_1_BODY": "2-3 sentences",
  "PILLAR_2_TITLE": "1-2 word pillar title",
  "PILLAR_2_BODY": "2-3 sentences",
  "PILLAR_3_TITLE": "1-2 word pillar title",
  "PILLAR_3_BODY": "2-3 sentences",
  "SERVICES_HEADLINE_FB": "4-7 word services headline",
  "METHODOLOGY_HEADLINE": "3-7 word process headline",
  "METHODOLOGY_BODY": "1 sentence about the process",
  "STEP_1_TITLE": "step 1 name",
  "STEP_1_BODY": "2-3 sentences",
  "STEP_2_TITLE": "step 2 name",
  "STEP_2_BODY": "2-3 sentences",
  "STEP_3_TITLE": "step 3 name",
  "STEP_3_BODY": "2-3 sentences",
  "STEP_4_TITLE": "step 4 name",
  "STEP_4_BODY": "2-3 sentences",
  "TESTIMONIALS_HEADLINE_FB": "3-6 word testimonials headline",
  "LEAD_MAGNET_TITLE": "3-7 word free resource title",
  "LEAD_MAGNET_BODY": "1-2 sentences describing the resource",
  "FINAL_CTA_HEADLINE_FB": "4-8 word warm closing headline",
  "SERVICE_1_DURATION_FB": "short duration in CAPS or empty",
  "SERVICE_2_DURATION_FB": "short duration in CAPS or empty",
  "SERVICE_3_DURATION_FB": "short duration in CAPS or empty",
  "SERVICE_1_INCLUDE_1_FB": "what's included",
  "SERVICE_1_INCLUDE_2_FB": "what's included",
  "SERVICE_1_INCLUDE_3_FB": "what's included",
  "SERVICE_2_INCLUDE_1_FB": "what's included",
  "SERVICE_2_INCLUDE_2_FB": "what's included",
  "SERVICE_2_INCLUDE_3_FB": "what's included",
  "SERVICE_3_INCLUDE_1_FB": "what's included",
  "SERVICE_3_INCLUDE_2_FB": "what's included",
  "SERVICE_3_INCLUDE_3_FB": "what's included"`;
  }

  prompt += `
}`;

  return prompt;
}


// ═══════════════════════════════════════════════════════════════════════════
// FEMININE-BOLD FILL MAP BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildFeminineBoldFill(
  templateId: string,
  copy: any,
  intake: any,
  ownerName: string,
  ownerTitle: string,
  businessName: string,
  businessType: string,
  services: any[],
  portfolioPhotos: string[],
  teamPhotos: string[],
  city: string,
  noTestimonials: boolean,
  aboutImageUrl: string,
  heroImageUrl: string,
): Record<string, string> {
  if (templateId !== "feminine-bold") return {};

  // Helper: split a headline into dropcap + rest
  const splitDrop = (raw: string): { drop: string; rest: string } => {
    const s = (raw || "").trim();
    if (!s) return { drop: "", rest: "" };
    return { drop: s.charAt(0).toUpperCase(), rest: s.slice(1) };
  };

  const owner = splitDrop(copy.OWNER_TITLE || intake.owner_title || ownerTitle || "");
  const transformation = splitDrop(copy.TRANSFORMATION_HEADLINE || "");
  const philosophy = splitDrop(copy.PHILOSOPHY_HEADLINE || "");
  const servicesH = splitDrop(copy.SERVICES_HEADLINE_FB || copy.SERVICES_HEADLINE || "");
  const testimonialsH = splitDrop(copy.TESTIMONIALS_HEADLINE_FB || copy.TESTIMONIALS_HEADLINE || "");
  const methodology = splitDrop(copy.METHODOLOGY_HEADLINE || "");
  const leadMagnet = splitDrop(copy.LEAD_MAGNET_TITLE || "");
  const faq = splitDrop("Frequently Asked Questions");
  const finalCta = splitDrop(copy.FINAL_CTA_HEADLINE_FB || copy.FINAL_CTA_HEADLINE || "");
  const heroName = splitDrop(ownerName || businessName || "");

  return {
    // Dropcap splits
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

    // Business basics
    "{{BUSINESS_NAME_SHORT}}": businessName.split(" ")[0],
    "{{ANNOUNCE_TEXT}}": copy.ANNOUNCE_TEXT || `Now booking new clients — ${city || "local area"}`,

    // About strip
    "{{ABOUT_STRIP_DROPCAP}}": (copy.ABOUT_STRIP_LINE1 || "").charAt(0).toUpperCase() || "",
    "{{ABOUT_STRIP_LINE1}}": copy.ABOUT_STRIP_LINE1 || "",
    "{{ABOUT_STRIP_LINE2}}": copy.ABOUT_STRIP_LINE2 || (businessType || "").toUpperCase(),
    "{{ABOUT_STRIP_LINE3}}": copy.ABOUT_STRIP_LINE3 || "",
    "{{ABOUT_STRIP_LINE4}}": copy.ABOUT_STRIP_LINE4 || "",
    "{{ABOUT_STRIP_BODY}}": copy.ABOUT_STRIP_BODY || copy.ABOUT_STORY || "",
    "{{ABOUT_EYEBROW}}": copy.ABOUT_EYEBROW || "ABOUT",
    "{{ABOUT_INTRO_HEADLINE}}": copy.ABOUT_INTRO_HEADLINE || (ownerName ? `Hi, I'm ${ownerName}` : `About ${businessName}`),
    "{{ABOUT_INTRO_BODY}}": copy.ABOUT_INTRO_BODY || copy.ABOUT_STORY || "",
    "{{ABOUT_CTA}}": copy.ABOUT_CTA || "LEARN MORE",

    // Transformation
    "{{TRANSFORMATION_EYEBROW}}": copy.TRANSFORMATION_EYEBROW || "✦ THE TRANSFORMATION",
    "{{TRANSFORMATION_BODY}}": copy.TRANSFORMATION_BODY || "",
    "{{BA_1_BEFORE}}": copy.BA_1_BEFORE || "",
    "{{BA_1_AFTER}}": copy.BA_1_AFTER || "",
    "{{BA_2_BEFORE}}": copy.BA_2_BEFORE || "",
    "{{BA_2_AFTER}}": copy.BA_2_AFTER || "",
    "{{BA_3_BEFORE}}": copy.BA_3_BEFORE || "",
    "{{BA_3_AFTER}}": copy.BA_3_AFTER || "",

    // Philosophy pillars
    "{{PHILOSOPHY_EYEBROW}}": copy.PHILOSOPHY_EYEBROW || "✦ THE APPROACH",
    "{{PILLAR_1_TITLE}}": copy.PILLAR_1_TITLE || copy.WHY_US_1_TITLE || "",
    "{{PILLAR_1_BODY}}": copy.PILLAR_1_BODY || copy.WHY_US_1_DESC || "",
    "{{PILLAR_2_TITLE}}": copy.PILLAR_2_TITLE || copy.WHY_US_2_TITLE || "",
    "{{PILLAR_2_BODY}}": copy.PILLAR_2_BODY || copy.WHY_US_2_DESC || "",
    "{{PILLAR_3_TITLE}}": copy.PILLAR_3_TITLE || copy.WHY_US_3_TITLE || "",
    "{{PILLAR_3_BODY}}": copy.PILLAR_3_BODY || copy.WHY_US_3_DESC || "",

    // Services — feminine-bold specific
    "{{SERVICES_EYEBROW}}": copy.SERVICES_EYEBROW || "✦ WAYS TO WORK TOGETHER",
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

    // Methodology
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
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION REMOVAL
// ═══════════════════════════════════════════════════════════════════════════

function parseSectionsToRemove(
  aiResponse: string | undefined,
  flags: { noTestimonials: boolean; noAddress: boolean; noServiceAreas: boolean },
): string[] {
  const sections = (aiResponse || "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);

  // Force-add sections that must be removed based on data flags
  if (flags.noTestimonials && !sections.includes("testimonials")) {
    sections.push("testimonials");
  }
  if (flags.noAddress && !sections.includes("service_areas") && flags.noServiceAreas) {
    sections.push("service_areas");
  }

  return [...new Set(sections)];
}

function removeSection(html: string, sectionName: string): string {
  // Multiple pattern strategies for robust section removal
  const patterns = [
    // <section class="...testimonial...">...</section>
    new RegExp(`<section[^>]*class="[^"]*${sectionName}[^"]*"[^>]*>[\\s\\S]*?<\\/section>`, "gi"),
    // <section id="testimonials">...</section>
    new RegExp(`<section[^>]*id="[^"]*${sectionName}[^"]*"[^>]*>[\\s\\S]*?<\\/section>`, "gi"),
    // data-section="testimonials"
    new RegExp(`<[^>]*data-section="[^"]*${sectionName}[^"]*"[^>]*>[\\s\\S]*?<\\/(?:section|div)>`, "gi"),
    // <div class="...testimonial-section...">...</div> (greedy but bounded)
    new RegExp(`<div[^>]*class="[^"]*${sectionName}[^"]*-section[^"]*"[^>]*>[\\s\\S]*?<\\/div>\\s*(?=<(?:section|div[^>]*class="[^"]*section|footer))`, "gi"),
  ];

  for (const pattern of patterns) {
    const before = html.length;
    html = html.replace(pattern, "");
    if (html.length < before) {
      console.log(`[generate] Removed section: ${sectionName} (${before - html.length} chars)`);
      return html;
    }
  }

  // Fallback: try singular/plural variants
  const variants = sectionName.endsWith("s") ? [sectionName.slice(0, -1)] : [sectionName + "s"];
  for (const variant of variants) {
    const pattern = new RegExp(`<section[^>]*class="[^"]*${variant}[^"]*"[^>]*>[\\s\\S]*?<\\/section>`, "gi");
    const before = html.length;
    html = html.replace(pattern, "");
    if (html.length < before) {
      console.log(`[generate] Removed section (variant): ${variant} (${before - html.length} chars)`);
      return html;
    }
  }

  return html;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function applyConditional(html: string, key: string, show: boolean): string {
  const re = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{\\/${key}\\}\\}`, "gi");
  return show
    ? html.replace(re, (_m, inner) => inner)
    : html.replace(re, "");
}

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

// ═══════════════════════════════════════════════════════════════════════════
// FONT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function applyBusinessProfessionalFonts(html: string, intake: any): string {
  if (!intake?.font_preference) return html;
  const fontMap: Record<string, { serif: string; url: string }> = {
    modern: { serif: '"Playfair Display", Georgia, serif', url: "Playfair+Display:ital,wght@0,400;0,700;1,400" },
    classic: { serif: '"Cormorant Garamond", Georgia, serif', url: "Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400" },
    minimal: { serif: '"DM Serif Display", Georgia, serif', url: "DM+Serif+Display:ital@0;1" },
  };
  const font = fontMap[String(intake.font_preference).toLowerCase()];
  if (!font) return html;
  let out = html;
  out = out.replace(/--font-serif:\s*[^;]+;/, `--font-serif: ${font.serif};`);
  out = out.replace(/Cormorant\+Garamond[^"']+/g, font.url);
  return out;
}

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

function injectFontTokensIntoRoot(html: string, tokens: { headingFont?: string; bodyFont?: string }): string {
  return html.replace(/:root\s*\{([\s\S]*?)\}/, (_m, body: string) => {
    let out = body;
    const replace = (name: string, value: string) => {
      const re = new RegExp(`(${name.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`, "i");
      if (re.test(out)) out = out.replace(re, `$1${value}$3`);
    };
    if (tokens.headingFont) replace("--font-heading", `'${tokens.headingFont}', serif`);
    if (tokens.bodyFont) replace("--font-body", `'${tokens.bodyFont}', sans-serif`);
    return `:root {${out}}`;
  });
}

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

// ═══════════════════════════════════════════════════════════════════════════
// FAVICON
// ═══════════════════════════════════════════════════════════════════════════

export function buildFaviconHTML(opts: {
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

export function injectFavicon(html: string, faviconTag: string): string {
  if (!faviconTag) return html;
  let out = html.replace(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*\/?>/gi, "");
  const tag = `\n  ${faviconTag}`;
  if (/<meta\s+charset=["']?[^>"']+["']?\s*\/?>/i.test(out)) {
    return out.replace(/(<meta\s+charset=["']?[^>"']+["']?\s*\/?>)/i, `$1${tag}`);
  }
  return out.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CALL WRAPPERS
// ═══════════════════════════════════════════════════════════════════════════

async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    console.warn(`[${label}] No Anthropic key — using Lovable AI fallback.`);
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
        if (LOVABLE_API_KEY && (isAnthropicCreditError(r.status, errText) || isAnthropicModelUnavailable(r.status, errText))) {
          console.warn(`[${label}] Anthropic unavailable — using Lovable AI fallback.`);
          return callLovableAI(LOVABLE_API_KEY, content, label);
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

function isAnthropicCreditError(status: number, errText: string): boolean {
  const lower = errText.toLowerCase();
  return status === 400 && (
    lower.includes("credit balance is too low") ||
    lower.includes("purchase credits") ||
    lower.includes("plans & billing")
  );
}

function isAnthropicModelUnavailable(status: number, errText: string): boolean {
  const lower = errText.toLowerCase();
  return status === 404 && (
    lower.includes("not_found_error") ||
    lower.includes("model:") ||
    lower.includes("model_not_found")
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
        "Lovable-API-Key": apiKey,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "sitequeen-edge-function",
      },
      body: JSON.stringify({
        model: LOVABLE_AI_MODEL,
        messages: [{ role: "user", content }],
      }),
    });
    clearTimeout(timeout);
    if (!r.ok) {
      const errText = await r.text();
      if (r.status === 429) throw new Error(`Lovable AI rate limit for ${label}. Try again in a minute.`);
      if (r.status === 402) throw new Error(`Lovable AI credits exhausted for ${label}.`);
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

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// MAP HELPER
// ═══════════════════════════════════════════════════════════════════════════

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

  const isFixedLocation = type === "storefront" || type === "physical" || type === "hybrid";

  let url = "";
  if (isFixedLocation && (street || city)) {
    const q = [street, city, state, zip].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
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

  const html = `<iframe class="map-iframe" src="${url}" width="100%" height="100%" style="border:0;min-height:400px;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
  return { html, url };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function buildStockSearchTerms(
  businessType: string,
  firstService: string,
  tagline = "",
  businessName = "",
): string[] {
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
      return clientQuery && clientQuery.length > (businessType?.length || 0) + 2
        ? [clientQuery, ...terms]
        : terms;
    }
  }
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

function pickServiceImage(index: number, portfolioPhotos: string[], fallbacks: string[]): string {
  if (portfolioPhotos[index]) return portfolioPhotos[index];
  if (portfolioPhotos.length > 0) return portfolioPhotos[index % portfolioPhotos.length];
  return fallbacks.find((u) => !!u) || "";
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT FORM WIRING
// ═══════════════════════════════════════════════════════════════════════════

export function wireContactForms(html: string, clientId: string, supabaseUrl: string): string {
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

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS TAGGING (v3)
// ═══════════════════════════════════════════════════════════════════════════

function addAnalyticsTags(html: string, pageName: string): string {
  if (/\bdata-sq-track=/.test(html)) return html;

  let firstQuoteTagged = false;
  // Quote buttons
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

  // Hero CTA fallback
  if (!firstQuoteTagged) {
    html = html.replace(
      /(<a\b[^>]*class=["'][^"']*(?:btn-primary|cta-primary|hero-cta)[^"']*["'][^>]*?)(>)/i,
      (_m, open, close) => `${open} data-sq-track="cta_${pageName}_hero"${close}`,
    );
  }

  // Learn More links
  html = html.replace(
    /(<(a|button)\b[^>]*?)(>[\s\S]{0,100}?learn\s+more[\s\S]{0,100}?<\/\2>)/gi,
    (_m, open, _tag, rest) => `${open} data-sq-track="learn_more_${pageName}"${rest}`,
  );

  // PDF download
  html = html.replace(
    /(<a\b[^>]*?\bhref=["'][^"']*\.pdf[^"'#?]*[^"']*["'][^>]*?)(>)/gi,
    (_m, open, close) => `${open} data-sq-track="pdf_download"${close}`,
  );

  // Footer milestone
  html = html.replace(
    /(<footer\b)([^>]*?)(>)/i,
    (_m, tag, attrs, close) =>
      attrs.includes("data-sq-milestone") ? _m : `${tag}${attrs} data-sq-milestone="footer"${close}`,
  );

  // Page-specific milestones
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
