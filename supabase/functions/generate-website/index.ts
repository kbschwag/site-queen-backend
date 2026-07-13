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
import { generateSite } from "../_shared/website-generator.ts";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-5";
const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-3-flash-preview";
// Keep AI calls below the platform's 150s idle timeout so failures can be
// caught and written back to the site row instead of leaving it "generating".
const TIMEOUT_MS = 110_000;

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

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE A — FAST SETUP (must finish quickly, before we return the 202)
  // ═════════════════════════════════════════════════════════════════════════

  let phaseAContext: {
    siteData: any; clientData: any; intake: any; callNotes: any;
    templateId: string; templateHTML: string; templateCSS: string;
    businessName: string; businessType: string; city: string; state: string;
    phone: string; phoneRaw: string; email: string; address: string;
    yearsInBusiness: string; googleRating: string; googleReviewCount: string;
    aboutStory: string; ownerName: string; ownerTitle: string; tagline: string;
    noTestimonials: boolean;
    portfolioPhotos: string[]; teamPhotos: string[];
    services: any[]; awards: any[]; coupons: any[]; serviceAreas: any[]; faqItems: any[];
    showFinancing: boolean; showCoupons: boolean; showAwards: boolean;
    serviceNames: string[]; clientServiceAreaNames: string[];
    allowStock: boolean;
    heroImageUrl: string; aboutImageUrl: string; whyUsImageUrl: string;
    logoUrlResolved: string;
    primaryColorResolved: string; accentColorResolved: string;
    headingFontResolved: string; bodyFontResolved: string;
    business: Record<string, unknown>;
    ANTHROPIC_API_KEY: string;
  };

  try {
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

    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    if (callNotes) {
      await supabase.from("sites").update({ call_notes_snapshot: callNotes } as any).eq("client_id", clientId);
    }

    // Template load
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

    let templateHTML = await htmlFile.text();
    const templateCSS = cssFile ? await cssFile.text() : "";

    // Business context
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

    const clientServiceAreaNames: string[] = serviceAreas
      .map((a: any) => (typeof a === "string" ? a : (a?.name || a?.city || a?.title || "")).toString().trim())
      .filter(Boolean);

    console.log(`[generate] Mode: ${mode} | Template: ${templateId} | Client: ${clientId}`);
    console.log(`[generate] Business: "${businessName}" (${businessType}) in ${city}, ${state}`);

    // Photo resolution
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

    // Brand colors + fonts
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
    if (!ANTHROPIC_API_KEY && !Deno.env.get("LOVABLE_API_KEY")) {
      throw new Error("No AI provider configured");
    }

    const business: Record<string, unknown> = {
      business_name: businessName,
      category: businessType,
      city, state, phone, email,
      address: address || undefined,
      services: serviceNames.length
        ? serviceNames.join(", ")
        : (typeof (intake as any).services === "string" ? (intake as any).services : undefined),
      rating: googleRating || undefined,
      review_count: googleReviewCount || undefined,
      brand_color: primaryColorResolved || undefined,
      about_story: aboutStory || undefined,
      owner_name: ownerName || undefined,
      owner_title: ownerTitle || undefined,
      tagline: tagline || undefined,
      hours: typeof (intake as any).business_hours === "string" ? (intake as any).business_hours : undefined,
      service_areas: clientServiceAreaNames.length ? clientServiceAreaNames.join(", ") : undefined,
      years_in_business: yearsInBusiness || undefined,
      hero_photo_url: heroImageUrl || undefined,
      about_photo_url: aboutImageUrl || undefined,
      whyus_photo_url: whyUsImageUrl || undefined,
      logo_url: logoUrlResolved || undefined,
      portfolio_photos: portfolioPhotos.length ? portfolioPhotos.join(", ") : undefined,
      team_photos: teamPhotos.length ? teamPhotos.join(", ") : undefined,
    };

    phaseAContext = {
      siteData, clientData, intake, callNotes,
      templateId, templateHTML, templateCSS,
      businessName, businessType, city, state, phone, phoneRaw, email, address,
      yearsInBusiness, googleRating, googleReviewCount, aboutStory, ownerName, ownerTitle, tagline,
      noTestimonials,
      portfolioPhotos, teamPhotos, services, awards, coupons, serviceAreas, faqItems,
      showFinancing, showCoupons, showAwards,
      serviceNames, clientServiceAreaNames,
      allowStock, heroImageUrl, aboutImageUrl, whyUsImageUrl, logoUrlResolved,
      primaryColorResolved, accentColorResolved, headingFontResolved, bodyFontResolved,
      business, ANTHROPIC_API_KEY,
    };

    // Mark authoring in progress right before returning the 202
    await supabase.from("sites").update({
      generation_status: "generating",
      generation_progress: "authoring",
      generation_error: null,
    } as any).eq("client_id", clientId);
  } catch (error: any) {
    console.error("[generate] phase A error:", error);
    await markFailed(supabase, clientId, error.message || String(error));
    return new Response(
      JSON.stringify({ success: false, error: error.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE B — BACKGROUND TASK (slow work, survives past the 202 response)
  // ═════════════════════════════════════════════════════════════════════════

  const backgroundTask = async () => {
    const {
      siteData, clientData, intake, callNotes,
      templateId, templateHTML, templateCSS,
      businessName, businessType, city, state, phone, phoneRaw, email, address,
      yearsInBusiness, googleRating, googleReviewCount, tagline, ownerName, ownerTitle,
      noTestimonials, portfolioPhotos, teamPhotos, serviceNames,
      heroImageUrl, aboutImageUrl, whyUsImageUrl, logoUrlResolved,
      primaryColorResolved, accentColorResolved, headingFontResolved, bodyFontResolved,
      allowStock, business, ANTHROPIC_API_KEY,
    } = phaseAContext;

    try {
      await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

      // ── Restaurant template: fully isolated pipeline ─────────────────────
      if (templateId === RESTAURANT_TEMPLATE_ID) {
        try {
          const result = await generateRestaurantSite({
            supabase: supabase as any, clientId, intake, callNotes,
            clientData, siteData,
            supabaseUrl, serviceKey,
          });
          console.log(`[generate/restaurant] ✓ ${result.status} → ${result.stagingUrl}`);
        } catch (e: any) {
          console.error("[generate/restaurant] error:", e);
          await markFailed(supabase, clientId, e.message || String(e));
        }
        return;
      }

      // ── AI authoring (no inner timeout — background task has an overall guard) ──
      console.log("[generate] Authoring page via new engine (Claude authors, doesn't fill)...");
      const genResult = await generateSite({
        business,
        designReference: templateHTML,
        mode: "client",
        callAI: (p: string) => callAI(ANTHROPIC_API_KEY, p, "site").then((r) => r.text),
        maxAttempts: 1,
      });

      if (genResult.status === "needs_review") {
        const errMsg = `Gate failures: ${genResult.failures.join("; ")}`;
        console.warn("[generate] Gate rejected output — not uploading. " + errMsg);
        await supabase.from("sites").update({
          generation_status: "needs_review",
          generation_progress: "failed_gate",
          generation_error: errMsg,
        } as any).eq("client_id", clientId);
        await supabase.from("generation_logs").insert({
          client_id: clientId,
          status: "needs_review",
          error_message: `[gate] ${errMsg}`,
        });
        return;
      }

      if (genResult.warnings.length) {
        console.warn("[generate] Gate warnings (non-blocking):", genResult.warnings.join(" | "));
      }

      let html = genResult.html;

      // Footer/address cleanup
      const hasAddress = !!(intake.street_address || intake.business_address || intake.address);
      if (!hasAddress) {
        html = html.replace(/,\s*\d{5}(?:-\d{4})?/g, "");
        html = html.replace(/<(?:span|p|div)[^>]*>\s*,?\s*<\/(?:span|p|div)>/g, "");
        if (!city) {
          html = html.replace(/<(?:span|p|div|a)[^>]*>\s*,\s*<\/(?:span|p|div|a)>/g, "");
        }
      }
      html = html.replace(/https?:\/\/[a-z]+\.com\/(https?:\/\/)/gi, "$1");

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
          generation_notes: `Fidelity: ${validationReport.fidelityScore}/100. Issues: ${validationReport.issues.length}.`,
        } as any);
      } catch (e: any) { console.warn("[generate] Log failed:", e.message); }

      // ── UPLOAD ──
      await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

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

      const { error: backupErr } = await supabase.storage
        .from("generated-sites")
        .upload(`${clientId}/deploy/index.html`, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });
      if (backupErr) throw new Error(`Failed to save deploy backup: ${backupErr.message}`);

      // copy-data.json (used by generate-extra-pages)
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
      };
      await supabase.storage.from("generated-sites").upload(
        `${clientId}/copy-data.json`,
        new Blob([JSON.stringify(copyDataPayload)], { type: "application/json" }),
        { upsert: true, contentType: "application/json" }
      );

      // site-meta.json
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
        generation_status: "complete",
        generation_progress: "complete",
        generated_at: new Date().toISOString(),
        staging_url: stagingURL,
        template_used: templateId,
      } as any).eq("client_id", clientId);

      await supabase.from("generation_logs").insert({
        client_id: clientId,
        template_id: templateId,
        status: "homepage_complete",
        generation_notes: `Homepage generated. Template: ${templateId}. Fidelity: ${validationReport.fidelityScore}/100.`,
      } as any);

      console.log(`[generate] ✓ Homepage complete → ${stagingURL}`);

      // Dispatch extra pages
      fetch(`${supabaseUrl}/functions/v1/generate-extra-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ client_id: clientId }),
      }).catch((e) => console.error("[generate] Failed to dispatch extra-pages:", e));
    } catch (error: any) {
      console.error("[generate] background error:", error);
      try {
        await supabase.from("sites").update({
          generation_status: "failed",
          generation_progress: "generation_failed",
          generation_error: error?.message || String(error),
        } as any).eq("client_id", clientId);
        await supabase.from("generation_logs").insert({
          client_id: clientId,
          status: "failed",
          error_message: error?.message || String(error),
        });
      } catch (e) {
        console.error("[generate] failed to mark background failure:", e);
      }
    }
  };

  // @ts-ignore — EdgeRuntime is globally available in Supabase edge functions
  EdgeRuntime.waitUntil(backgroundTask());

  return new Response(
    JSON.stringify({ success: true, status: "generating", client_id: clientId }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});


// ═══════════════════════════════════════════════════════════════════════════
// (Old prompt builder, fill map, and section-removal helpers were removed —
// authoring now lives in ../_shared/website-generator.ts)
// ═══════════════════════════════════════════════════════════════════════════


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

  const MAX_ATTEMPTS = 1;
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
          max_tokens: 12000,
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
