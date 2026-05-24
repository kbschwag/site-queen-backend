// ─────────────────────────────────────────────────────────────────────────
// Restaurant template (storage folder: local-favorite) — fully isolated
// generator. Touches NOTHING outside its own template files.
//
// Templates bucket layout for this template:
//   templates/local-favorite/index.html      → uploaded as index.html
//   templates/local-favorite/services.html   → uploaded as menu.html  (renamed at upload)
//   templates/local-favorite/about.html      → uploaded as about.html
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "./hostinger-ftp.ts";
import { logUnfilledPlaceholders } from "./diagnostics.ts";
import { autoFillPlaceholders } from "./autofill.ts";
import { applyBrandColorsToHTML } from "./color-system.ts";

export const RESTAURANT_TEMPLATE_ID = "local-favorite";
export const RESTAURANT_PAGES = ["index", "menu", "about"] as const;
export const RESTAURANT_STORAGE_FILES: Record<string, string> = {
  index: "index.html",
  menu: "services.html", // template file is named services.html
  about: "about.html",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";
const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-3-flash-preview";
const TIMEOUT_MS = 600_000;

const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html";

// ── Public entrypoint ────────────────────────────────────────────────────
export async function generateRestaurantSite(opts: {
  supabase: ReturnType<typeof createClient>;
  clientId: string;
  intake: any;
  callNotes: any;
  clientData: any;
  siteData: any;
  supabaseUrl: string;
  serviceKey: string;
}): Promise<{ status: string; stagingUrl: string }> {
  const { supabase, clientId, intake, callNotes, clientData, supabaseUrl, serviceKey } = opts;

  // ── Resolve business basics ────────────────────────────────────────────
  const businessName: string =
    (clientData as any)?.business_name || intake.business_name || "Restaurant";
  const businessType: string =
    (clientData as any)?.business_type || intake.business_type || "Restaurant";
  const city: string = intake.business_city || intake.city || "";
  const state: string = intake.business_state || intake.state || "";
  const phone: string = intake.business_phone || intake.primary_phone || intake.phone || "";
  const phoneRaw: string = phone.replace(/\D/g, "");
  const email: string = intake.business_email || intake.email || "";
  const address: string = intake.business_address || intake.address || "";
  const zip: string = intake.business_zip || intake.zip || "";
  const yearsInBusiness: string = intake.years_in_business || "";
  const ownerName: string = intake.owner_name || "";
  const ownerTitle: string = intake.owner_title || "Owner";
  const noTestimonials: boolean = !!intake.no_testimonials;
  const tagline: string = intake.tagline || "";
  const services: any[] = Array.isArray(intake.services) ? intake.services : [];
  const serviceNames: string[] = services
    .map((s: any) => (typeof s === "string" ? s : s?.name || s?.title || ""))
    .filter(Boolean);
  const portfolioPhotos: string[] = (Array.isArray(intake.portfolio_photos) ? intake.portfolio_photos : []).filter(Boolean);
  const teamPhotos: string[] = (Array.isArray(intake.team_photos) ? intake.team_photos : []).filter(Boolean);
  const teamMembers: any[] = Array.isArray(intake.team_members) ? intake.team_members : [];
  const testimonials: any[] = Array.isArray(intake.testimonials) ? intake.testimonials : [];
  const hours: any = intake.business_hours || {};

  const orderUrl: string = intake.order_url || intake.online_ordering_url || "#";
  const reservationUrl: string = intake.reservation_url || intake.opentable_url || "#";

  const socialInstagram: string = intake.social_instagram || intake.instagram_url || "#";
  const socialFacebook: string = intake.social_facebook || intake.facebook_url || "#";
  const socialTiktok: string = intake.social_tiktok || intake.tiktok_url || "#";

  const allowStock: boolean =
    intake.use_stock_photos !== false &&
    (opts.siteData as any)?.using_stock_photos !== false;

  // ── Stock terms tuned to restaurant cuisine ────────────────────────────
  const stockTerms = buildRestaurantStockTerms(businessType, serviceNames[0] || "", tagline);

  // ── Resolve hero / about / gallery / featured / team images ────────────
  await supabase.from("sites").update({ generation_progress: "resolving_photos" } as any).eq("client_id", clientId);

  let heroImageUrl = intake.hero_photo_url || portfolioPhotos[0] || "";
  let aboutImageUrl = intake.owner_photo_url || teamPhotos[0] || portfolioPhotos[1] || portfolioPhotos[0] || "";
  let builderImageUrl = portfolioPhotos[2] || portfolioPhotos[0] || "";
  let sourcingImageUrl = portfolioPhotos[3] || portfolioPhotos[1] || "";
  let menuHeroImageUrl = portfolioPhotos[4] || portfolioPhotos[0] || "";
  let aboutHeroImageUrl = portfolioPhotos[5] || portfolioPhotos[0] || "";

  // Gallery: 5 photos
  const galleryUploads: string[] = portfolioPhotos.slice(0, 5);
  const galleryUrls: string[] = [...galleryUploads];

  // Featured items: 3 images
  const featuredUploads = portfolioPhotos.slice(5, 8);
  const featuredImageUrls: string[] = [...featuredUploads];

  if (allowStock) {
    const ensure = async (url: string, biases: string[]) =>
      url || (await fetchUnsplashPhotoUrl(combineTerms(stockTerms, biases))) || "";

    if (!heroImageUrl) heroImageUrl = await ensure("", ["restaurant interior warm lighting"]);
    if (!aboutImageUrl) aboutImageUrl = await ensure("", ["chef portrait"]);
    if (!builderImageUrl) builderImageUrl = await ensure("", ["food close up"]);
    if (!sourcingImageUrl) sourcingImageUrl = await ensure("", ["fresh ingredients"]);
    if (!menuHeroImageUrl) menuHeroImageUrl = await ensure("", ["plated dish"]);
    if (!aboutHeroImageUrl) aboutHeroImageUrl = await ensure("", ["restaurant dining"]);

    // Fill gallery up to 5
    while (galleryUrls.length < 5) {
      const u = await fetchUnsplashPhotoUrl(combineTerms(stockTerms, ["food photography", "restaurant atmosphere", "plating"]));
      galleryUrls.push(u || "");
    }

    // Featured 3
    while (featuredImageUrls.length < 3) {
      const u = await fetchUnsplashPhotoUrl(combineTerms(stockTerms, ["signature dish close up"]));
      featuredImageUrls.push(u || "");
    }
  } else {
    while (galleryUrls.length < 5) galleryUrls.push("");
    while (featuredImageUrls.length < 3) featuredImageUrls.push("");
  }

  // Team photo resolution
  const teamPhotoUrls: string[] = [];
  for (let i = 0; i < 3; i++) {
    const fromMember = teamMembers[i]?.photo_url;
    teamPhotoUrls.push(fromMember || teamPhotos[i] || (allowStock
      ? (await fetchUnsplashPhotoUrl(["restaurant staff portrait", "chef portrait", "barista portrait"])) || ""
      : ""));
  }

  // ── Build logo + map HTML ──────────────────────────────────────────────
  const logoUrlResolved = intake.logo_url || "";
  const logoHTML = logoUrlResolved
    ? `<img src="${logoUrlResolved}" alt="${escapeAttr(businessName)}" class="logo-img" />`
    : `<span class="logo-text">${escapeHTML(businessName)}</span>`;

  const { html: mapHTML, url: directionsUrlBuilt } = buildMapHTML({
    locationType: intake.location_type,
    streetAddress: address,
    city, state, zip,
    serviceArea: intake.service_area,
  });
  const directionsUrl = intake.directions_url || directionsUrlBuilt || "#";

  // ── Call Claude for restaurant-specific copy ───────────────────────────
  await supabase.from("sites").update({ generation_progress: "generating_copy" } as any).eq("client_id", clientId);

  const copyPrompt = getRestaurantCopyPrompt({
    businessName, businessType, city, state, phone, email, address,
    yearsInBusiness, ownerName, ownerTitle, tagline, serviceNames,
    noTestimonials, intakeTestimonials: testimonials, callNotes,
    hours, intake,
  });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!ANTHROPIC_API_KEY && !Deno.env.get("LOVABLE_API_KEY")) {
    throw new Error("No AI provider configured");
  }

  console.log("[restaurant] Calling AI for restaurant copy…");
  const copyResult = await callAI(ANTHROPIC_API_KEY, copyPrompt, "restaurant_copy");
  const copy = parseJsonLoose(copyResult.text);
  if (!copy || typeof copy !== "object") {
    throw new Error("AI returned invalid JSON for restaurant copy");
  }

  // ── Build the full fill map ────────────────────────────────────────────
  const resolved = {
    businessName, city, state, phone, phoneRaw, email, address, zip,
    logoHTML, logoUrl: logoUrlResolved, mapHTML, directionsUrl,
    portfolioPhotos, teamPhotos, teamPhotoUrls,
    heroImageUrl, aboutImageUrl, builderImageUrl, sourcingImageUrl,
    menuHeroImageUrl, aboutHeroImageUrl, galleryUrls, featuredImageUrls,
    orderUrl, reservationUrl,
    socialInstagram, socialFacebook, socialTiktok,
    favIconUrl: intake.favicon_url || "",
    copyrightYear: String(new Date().getFullYear()),
    yearsInBusiness,
  };

  const fill = buildRestaurantFillMap(intake, copy, resolved);

  // ── Process each page ──────────────────────────────────────────────────
  const safetyNet = `\n<script>(function(){function r(){document.querySelectorAll('.animate-on-scroll').forEach(function(e){e.classList.add('visible');e.style.opacity='1';e.style.transform='none';});}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',r);}else{r();}})();</script>\n`;
  const analyticsScript = buildAnalyticsScript(clientId, supabaseUrl);
  const projectRefForBanner = (Deno.env.get("SUPABASE_URL") || "").replace("https://", "").split(".")[0];
  const prospectBannerTag = `<script async src="https://${projectRefForBanner}.functions.supabase.co/prospect-banner-js?cid=${clientId}"></script>`;
  const faviconTag = buildFaviconHTML({
    faviconUrl: intake.favicon_url || "",
    logoUrl: logoUrlResolved,
    businessName,
    primaryColor: resolveBrandColor(intake.primary_color, "#cb2020"),
  });

  await supabase.from("sites").update({ generation_progress: "uploading" } as any).eq("client_id", clientId);

  const primaryColor = resolveBrandColor(intake.primary_color, "#cb2020");
  const accentColor = resolveBrandColor(intake.accent_color, "#f6a823");

  for (const slug of RESTAURANT_PAGES) {
    const storageFile = RESTAURANT_STORAGE_FILES[slug];
    const outputFile = `${slug}.html`; // index.html, menu.html, about.html
    const { data: file, error: dlErr } = await supabase.storage
      .from("templates")
      .download(`${RESTAURANT_TEMPLATE_ID}/${storageFile}`);
    if (dlErr || !file) {
      throw new Error(`Restaurant template missing: ${RESTAURANT_TEMPLATE_ID}/${storageFile}`);
    }
    let pageHtml = await file.text();

    // Inject brand tokens into :root (works on --red / --gold for restaurant)
    pageHtml = injectBrandTokensIntoRoot(pageHtml, { primaryColor, accentColor });

    // Apply fill map
    for (const [key, value] of Object.entries(fill)) {
      pageHtml = pageHtml.split(key).join(value);
    }

    // Fix nav links so menu link points to menu.html (template may reference services.html)
    pageHtml = pageHtml
      .replace(/href=("|')services\.html(["'#?])/g, 'href=$1menu.html$2')
      .replace(/href=("|')\.\/services\.html(["'#?])/g, 'href=$1./menu.html$2');

    // Auto-fill any leftovers + log diagnostics + strip
    const af = await autoFillPlaceholders(
      pageHtml,
      { businessName, businessType, city, services: serviceNames.join(", "), notes: tagline, tone: "warm, local restaurant" },
      stockTerms,
    );
    pageHtml = af.html;
    await logUnfilledPlaceholders(supabase, clientId, RESTAURANT_TEMPLATE_ID, slug, pageHtml);
    pageHtml = pageHtml.replace(/\{\{[^}]+\}\}/g, "");

    // Safety net + analytics + contact form wiring + favicon
    pageHtml = pageHtml.replace("</body>", safetyNet + "\n</body>");
    pageHtml = pageHtml.replace("</body>", analyticsScript + "\n</body>");
    pageHtml = wireContactForms(pageHtml, clientId, supabaseUrl);
    pageHtml = injectFavicon(pageHtml, faviconTag);

    // Staging: add prospect banner + noindex
    const htmlWithBanner = pageHtml.includes("</body>")
      ? pageHtml.replace("</body>", `${prospectBannerTag}\n</body>`)
      : pageHtml + prospectBannerTag;
    const stagingHTML = injectNoindex(htmlWithBanner);

    await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/${outputFile}`, stagingHTML);
    console.log(`[restaurant] ✓ ${outputFile} → Hostinger staging`);

    // Backup clean version for deploy-to-live
    const { error: backupErr } = await supabase.storage
      .from("generated-sites")
      .upload(
        `${clientId}/deploy/${outputFile}`,
        new Blob([pageHtml], { type: "text/html" }),
        { upsert: true, contentType: "text/html; charset=utf-8" },
      );
    if (backupErr) console.warn(`[restaurant] deploy backup failed for ${outputFile}: ${backupErr.message}`);
  }

  // ── Persist copy-data.json for generate-extra-pages ────────────────────
  const copyDataPayload = {
    businessName, businessType, city, state, phone, phoneRaw, email, address,
    yearsInBusiness, tagline, ownerName, ownerTitle,
    logoUrl: logoUrlResolved, faviconUrl: intake.favicon_url || "",
    serviceNames, noTestimonials,
    portfolioPhotos, teamPhotos,
    heroImageUrl, aboutImageUrl,
    stockTerms, allowStock,
    primaryColor, accentColor,
    template: RESTAURANT_TEMPLATE_ID,
    copy,
  };
  await supabase.storage.from("generated-sites").upload(
    `${clientId}/copy-data.json`,
    new Blob([JSON.stringify(copyDataPayload)], { type: "application/json" }),
    { upsert: true, contentType: "application/json" },
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
    template_id: RESTAURANT_TEMPLATE_ID,
    status: "homepage_complete",
    tokens_used: copyResult.outputTokens,
    generation_notes: `Restaurant pipeline complete. 3 template pages built (index, menu, about).`,
  } as any);

  // ── Trigger generate-extra-pages for contact page ──────────────────────
  fetch(`${supabaseUrl}/functions/v1/generate-extra-pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ client_id: clientId }),
  }).catch((e) => console.error("[restaurant] failed to dispatch extra-pages:", e));

  return { status: "homepage_complete", stagingUrl: stagingURL };
}

// ────────────────────────────────────────────────────────────────────────
// Fill map — every placeholder the 3 template files reference.
// ────────────────────────────────────────────────────────────────────────
export function buildRestaurantFillMap(
  intake: any,
  copy: any,
  r: {
    businessName: string; city: string; state: string; phone: string; phoneRaw: string;
    email: string; address: string; zip: string;
    logoHTML: string; logoUrl: string; mapHTML: string; directionsUrl: string;
    portfolioPhotos: string[]; teamPhotos: string[]; teamPhotoUrls: string[];
    heroImageUrl: string; aboutImageUrl: string; builderImageUrl: string; sourcingImageUrl: string;
    menuHeroImageUrl: string; aboutHeroImageUrl: string;
    galleryUrls: string[]; featuredImageUrls: string[];
    orderUrl: string; reservationUrl: string;
    socialInstagram: string; socialFacebook: string; socialTiktok: string;
    favIconUrl: string; copyrightYear: string; yearsInBusiness: string;
  },
): Record<string, string> {
  const c = (k: string, fallback = "") =>
    typeof copy?.[k] === "string" && copy[k].trim() ? copy[k] : fallback;

  // Split business name on first space for LINE1 / LINE2
  const nameParts = r.businessName.trim().split(/\s+/);
  const businessNameLine1 = nameParts[0] || r.businessName;
  const businessNameLine2 = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const hours = intake.business_hours || {};
  const hoursMonThu = formatHours(hours, ["mon", "tue", "wed", "thu"]);
  const hoursFriSat = formatHours(hours, ["fri", "sat"]);
  const hoursSun = formatHours(hours, ["sun"]);

  const map: Record<string, string> = {
    // ── Business basics ─────────────────────────────────────────────────
    "{{BUSINESS_NAME}}": r.businessName,
    "{{BUSINESS_NAME_LINE1}}": businessNameLine1,
    "{{BUSINESS_NAME_LINE2}}": businessNameLine2,
    "{{BUSINESS_PHONE}}": r.phone,
    "{{BUSINESS_EMAIL}}": r.email,
    "{{BUSINESS_ADDRESS}}": r.address,
    "{{BUSINESS_CITY}}": r.city,
    "{{BUSINESS_STATE}}": r.state,
    "{{BUSINESS_ZIP}}": r.zip,
    "{{COPYRIGHT_YEAR}}": r.copyrightYear,
    "{{META_DESCRIPTION}}": c("META_DESCRIPTION", `${r.businessName} — ${r.city}${r.state ? ", " + r.state : ""}`),
    "{{LOGO_HTML}}": r.logoHTML,
    "{{FAVICON_URL}}": r.favIconUrl,
    "{{ANALYTICS_SCRIPT}}": "",
    "{{MAP_HTML}}": r.mapHTML,
    "{{DIRECTIONS_URL}}": r.directionsUrl,
    "{{ORDER_URL}}": r.orderUrl,
    "{{RESERVATION_URL}}": r.reservationUrl,
    "{{NAV_CTA}}": c("NAV_CTA", "ORDER NOW"),
    "{{FOOTER_TAGLINE}}": c("FOOTER_TAGLINE", intake.tagline || ""),
    "{{YEARS_IN_BUSINESS}}": r.yearsInBusiness || c("YEARS_IN_BUSINESS", ""),

    // ── Social ──────────────────────────────────────────────────────────
    "{{SOCIAL_INSTAGRAM_URL}}": r.socialInstagram,
    "{{SOCIAL_FACEBOOK_URL}}": r.socialFacebook,
    "{{SOCIAL_TIKTOK_URL}}": r.socialTiktok,

    // ── Promo bar ───────────────────────────────────────────────────────
    "{{PROMO_TEXT}}": c("PROMO_TEXT", ""),
    "{{PROMO_CTA}}": c("PROMO_CTA", "Order Now"),

    // ── Hero (index) ────────────────────────────────────────────────────
    "{{HERO_EYEBROW}}": c("HERO_EYEBROW", ""),
    "{{HERO_HEADLINE_LINE1}}": c("HERO_HEADLINE_LINE1", ""),
    "{{HERO_HEADLINE_HIGHLIGHT}}": c("HERO_HEADLINE_HIGHLIGHT", ""),
    "{{HERO_HEADLINE_LINE2}}": c("HERO_HEADLINE_LINE2", ""),
    "{{HERO_SUBHEADING}}": c("HERO_SUBHEADING", ""),
    "{{HERO_CTA_PRIMARY}}": c("HERO_CTA_PRIMARY", "ORDER NOW"),
    "{{HERO_CTA_SECONDARY}}": c("HERO_CTA_SECONDARY", "VIEW MENU"),
    "{{HERO_IMAGE_URL}}": r.heroImageUrl,

    // ── Hero stats ──────────────────────────────────────────────────────
    "{{STAT_1_NUMBER}}": c("STAT_1_NUMBER", ""),
    "{{STAT_1_LABEL}}": c("STAT_1_LABEL", ""),
    "{{STAT_2_NUMBER}}": c("STAT_2_NUMBER", ""),
    "{{STAT_2_LABEL}}": c("STAT_2_LABEL", ""),
    "{{STAT_3_NUMBER}}": c("STAT_3_NUMBER", ""),
    "{{STAT_3_LABEL}}": c("STAT_3_LABEL", ""),
    "{{STAT_4_NUMBER}}": c("STAT_4_NUMBER", ""),
    "{{STAT_4_LABEL}}": c("STAT_4_LABEL", ""),

    // ── Trust strip ─────────────────────────────────────────────────────
    "{{TRUST_1}}": c("TRUST_1", ""),
    "{{TRUST_2}}": c("TRUST_2", ""),
    "{{TRUST_3}}": c("TRUST_3", ""),
    "{{TRUST_4}}": c("TRUST_4", ""),
    "{{TRUST_5}}": c("TRUST_5", ""),

    // ── Featured (3) ────────────────────────────────────────────────────
    "{{FEATURED_EYEBROW}}": c("FEATURED_EYEBROW", "Featured"),
    "{{FEATURED_HEADLINE}}": c("FEATURED_HEADLINE", ""),
    "{{FEATURED_SUBTEXT}}": c("FEATURED_SUBTEXT", ""),
    "{{FEATURED_CTA}}": c("FEATURED_CTA", "VIEW FULL MENU"),

    // ── Builder ─────────────────────────────────────────────────────────
    "{{BUILDER_EYEBROW}}": c("BUILDER_EYEBROW", "Build Your Own"),
    "{{BUILDER_HEADLINE_LINE1}}": c("BUILDER_HEADLINE_LINE1", ""),
    "{{BUILDER_HEADLINE_LINE2}}": c("BUILDER_HEADLINE_LINE2", ""),
    "{{BUILDER_SUBTEXT}}": c("BUILDER_SUBTEXT", ""),
    "{{BUILDER_IMAGE_URL}}": r.builderImageUrl,
    "{{BUILDER_CTA}}": c("BUILDER_CTA", "ORDER NOW"),
    "{{BUILDER_PRICE_LABEL}}": c("BUILDER_PRICE_LABEL", "Starting at"),
    "{{BUILDER_START_PRICE}}": c("BUILDER_START_PRICE", ""),
    "{{BUILDER_STEP_1_LABEL}}": c("BUILDER_STEP_1_LABEL", ""),
    "{{BUILDER_STEP_2_LABEL}}": c("BUILDER_STEP_2_LABEL", ""),
    "{{BUILDER_STEP_3_LABEL}}": c("BUILDER_STEP_3_LABEL", ""),

    // ── About strip (index) ─────────────────────────────────────────────
    "{{ABOUT_HEADLINE_LINE1}}": c("ABOUT_HEADLINE_LINE1", ""),
    "{{ABOUT_HEADLINE_LINE2}}": c("ABOUT_HEADLINE_LINE2", ""),
    "{{ABOUT_STORY_P1}}": c("ABOUT_STORY_P1", intake.about_story || ""),
    "{{ABOUT_STORY_P2}}": c("ABOUT_STORY_P2", ""),
    "{{ABOUT_CTA}}": c("ABOUT_CTA", "OUR STORY"),
    "{{ABOUT_IMAGE_URL}}": r.aboutImageUrl,

    // ── Menu preview (index, 6 items) ───────────────────────────────────
    "{{MENU_PREVIEW_EYEBROW}}": c("MENU_PREVIEW_EYEBROW", "From the Menu"),
    "{{MENU_PREVIEW_HEADLINE}}": c("MENU_PREVIEW_HEADLINE", ""),
    "{{MENU_PREVIEW_CTA}}": c("MENU_PREVIEW_CTA", "VIEW FULL MENU"),

    // ── Deals (3) ───────────────────────────────────────────────────────
    "{{DEALS_EYEBROW}}": c("DEALS_EYEBROW", "Deals"),
    "{{DEALS_HEADLINE_LINE1}}": c("DEALS_HEADLINE_LINE1", ""),
    "{{DEALS_HEADLINE_LINE2}}": c("DEALS_HEADLINE_LINE2", ""),
    "{{DEALS_SUBTEXT}}": c("DEALS_SUBTEXT", ""),

    // ── Testimonials ────────────────────────────────────────────────────
    "{{TESTIMONIALS_EYEBROW}}": c("TESTIMONIALS_EYEBROW", "Reviews"),
    "{{TESTIMONIALS_HEADLINE}}": c("TESTIMONIALS_HEADLINE", ""),

    // ── Why us ──────────────────────────────────────────────────────────
    "{{WHY_EYEBROW}}": c("WHY_EYEBROW", "Why Us"),
    "{{WHY_HEADLINE_LINE1}}": c("WHY_HEADLINE_LINE1", ""),
    "{{WHY_HEADLINE_LINE2}}": c("WHY_HEADLINE_LINE2", ""),

    // ── Visit ───────────────────────────────────────────────────────────
    "{{VISIT_EYEBROW}}": c("VISIT_EYEBROW", "Visit Us"),
    "{{VISIT_HEADLINE_LINE1}}": c("VISIT_HEADLINE_LINE1", ""),
    "{{VISIT_HEADLINE_LINE2}}": c("VISIT_HEADLINE_LINE2", ""),
    "{{HOURS_MON_THU}}": hoursMonThu,
    "{{HOURS_FRI_SAT}}": hoursFriSat,
    "{{HOURS_SUN}}": hoursSun,

    // ── About page ──────────────────────────────────────────────────────
    "{{ABOUT_HERO_EYEBROW}}": c("ABOUT_HERO_EYEBROW", "Our Story"),
    "{{ABOUT_HERO_HEADLINE}}": c("ABOUT_HERO_HEADLINE", ""),
    "{{ABOUT_HERO_HEADLINE_2}}": c("ABOUT_HERO_HEADLINE_2", ""),
    "{{ABOUT_HERO_SUBTEXT}}": c("ABOUT_HERO_SUBTEXT", ""),
    "{{ABOUT_HERO_IMAGE_URL}}": r.aboutHeroImageUrl,
    "{{ORIGIN_EYEBROW}}": c("ORIGIN_EYEBROW", "How It Started"),
    "{{ORIGIN_HEADLINE}}": c("ORIGIN_HEADLINE", ""),
    "{{ORIGIN_IMAGE_CAPTION}}": c("ORIGIN_IMAGE_CAPTION", ""),
    "{{ORIGIN_CTA}}": c("ORIGIN_CTA", "VISIT US"),
    "{{SOURCING_1_EYEBROW}}": c("SOURCING_1_EYEBROW", "Sourcing"),
    "{{SOURCING_1_HEADLINE}}": c("SOURCING_1_HEADLINE", ""),
    "{{SOURCING_1_BODY}}": c("SOURCING_1_BODY", ""),
    "{{SOURCING_2_EYEBROW}}": c("SOURCING_2_EYEBROW", "Craft"),
    "{{SOURCING_2_HEADLINE}}": c("SOURCING_2_HEADLINE", ""),
    "{{SOURCING_2_BODY}}": c("SOURCING_2_BODY", ""),
    "{{SOURCING_IMAGE_URL}}": r.sourcingImageUrl,
    "{{OWNER_NAME}}": intake.owner_name || c("OWNER_NAME", ""),
    "{{OWNER_TITLE}}": intake.owner_title || c("OWNER_TITLE", "Owner"),
    "{{TEAM_EYEBROW}}": c("TEAM_EYEBROW", "Our Team"),
    "{{TEAM_HEADLINE}}": c("TEAM_HEADLINE", ""),
    "{{TEAM_SUBTEXT}}": c("TEAM_SUBTEXT", ""),
    "{{GALLERY_EYEBROW}}": c("GALLERY_EYEBROW", "Gallery"),
    "{{GALLERY_HEADLINE}}": c("GALLERY_HEADLINE", ""),
    "{{GALLERY_1_URL}}": r.galleryUrls[0] || "",
    "{{GALLERY_2_URL}}": r.galleryUrls[1] || "",
    "{{GALLERY_3_URL}}": r.galleryUrls[2] || "",
    "{{GALLERY_4_URL}}": r.galleryUrls[3] || "",
    "{{GALLERY_5_URL}}": r.galleryUrls[4] || "",

    // ── Menu page ───────────────────────────────────────────────────────
    "{{MENU_HERO_EYEBROW}}": c("MENU_HERO_EYEBROW", "Menu"),
    "{{MENU_HERO_HEADLINE}}": c("MENU_HERO_HEADLINE", ""),
    "{{MENU_HERO_HEADLINE_2}}": c("MENU_HERO_HEADLINE_2", ""),
    "{{MENU_HERO_SUBTEXT}}": c("MENU_HERO_SUBTEXT", ""),
    "{{MENU_HERO_IMAGE_URL}}": r.menuHeroImageUrl,
    "{{TRENDING_EYEBROW}}": c("TRENDING_EYEBROW", "Trending"),
    "{{TRENDING_HEADLINE_LINE1}}": c("TRENDING_HEADLINE_LINE1", ""),
    "{{TRENDING_HEADLINE_LINE2}}": c("TRENDING_HEADLINE_LINE2", ""),
    "{{TRENDING_SUBTEXT}}": c("TRENDING_SUBTEXT", ""),
    "{{FULL_MENU_EYEBROW}}": c("FULL_MENU_EYEBROW", "Full Menu"),
    "{{FULL_MENU_HEADLINE_LINE1}}": c("FULL_MENU_HEADLINE_LINE1", ""),
    "{{FULL_MENU_HEADLINE_LINE2}}": c("FULL_MENU_HEADLINE_LINE2", ""),
    "{{MENU_ITEM_COUNT}}": c("MENU_ITEM_COUNT", "9 items"),
    "{{FILTER_1}}": c("FILTER_1", "All"),
    "{{FILTER_2}}": c("FILTER_2", ""),
    "{{FILTER_3}}": c("FILTER_3", ""),
    "{{FILTER_4}}": c("FILTER_4", ""),
  };

  // Featured items 1..3 (with images)
  for (let i = 1; i <= 3; i++) {
    map[`{{FEATURED_${i}_NAME}}`] = c(`FEATURED_${i}_NAME`, "");
    map[`{{FEATURED_${i}_DESC}}`] = c(`FEATURED_${i}_DESC`, "");
    map[`{{FEATURED_${i}_PRICE}}`] = c(`FEATURED_${i}_PRICE`, "");
    map[`{{FEATURED_${i}_BADGE}}`] = c(`FEATURED_${i}_BADGE`, "");
    map[`{{FEATURED_${i}_IMAGE_URL}}`] = r.featuredImageUrls[i - 1] || "";
  }

  // Builder options 3 steps × 4 options
  for (let step = 1; step <= 3; step++) {
    for (let opt = 1; opt <= 4; opt++) {
      map[`{{BUILDER_OPTION_${step}_${opt}}}`] = c(`BUILDER_OPTION_${step}_${opt}`, "");
    }
  }

  // Menu items 1..9 (menu page) — 1..6 are also used by index preview
  for (let i = 1; i <= 9; i++) {
    map[`{{MENU_${i}_NAME}}`] = c(`MENU_${i}_NAME`, "");
    map[`{{MENU_${i}_DESC}}`] = c(`MENU_${i}_DESC`, "");
    map[`{{MENU_${i}_PRICE}}`] = c(`MENU_${i}_PRICE`, "");
    map[`{{MENU_${i}_TAG}}`] = c(`MENU_${i}_TAG`, "");
    map[`{{MENU_${i}_CATEGORY}}`] = c(`MENU_${i}_CATEGORY`, "");
  }

  // Deals 1..3
  for (let i = 1; i <= 3; i++) {
    map[`{{DEAL_${i}_NAME}}`] = c(`DEAL_${i}_NAME`, "");
    map[`{{DEAL_${i}_BADGE}}`] = c(`DEAL_${i}_BADGE`, "");
    map[`{{DEAL_${i}_PRICE}}`] = c(`DEAL_${i}_PRICE`, "");
    map[`{{DEAL_${i}_ORIGINAL_PRICE}}`] = c(`DEAL_${i}_ORIGINAL_PRICE`, "");
    map[`{{DEAL_${i}_INCLUDE_1}}`] = c(`DEAL_${i}_INCLUDE_1`, "");
    map[`{{DEAL_${i}_INCLUDE_2}}`] = c(`DEAL_${i}_INCLUDE_2`, "");
    map[`{{DEAL_${i}_INCLUDE_3}}`] = c(`DEAL_${i}_INCLUDE_3`, "");
  }
  // Deal 2 has a 4th include
  map[`{{DEAL_2_INCLUDE_4}}`] = c("DEAL_2_INCLUDE_4", "");

  // Testimonials 1..3 (empty if opted out)
  for (let i = 1; i <= 3; i++) {
    if (intake.no_testimonials) {
      map[`{{TESTIMONIAL_${i}_TEXT}}`] = "";
      map[`{{TESTIMONIAL_${i}_NAME}}`] = "";
      map[`{{TESTIMONIAL_${i}_LOCATION}}`] = "";
    } else {
      const t = Array.isArray(intake.testimonials) ? intake.testimonials[i - 1] : null;
      map[`{{TESTIMONIAL_${i}_TEXT}}`] = (t?.text || t?.quote) || c(`TESTIMONIAL_${i}_TEXT`, "");
      map[`{{TESTIMONIAL_${i}_NAME}}`] = (t?.name || t?.author) || c(`TESTIMONIAL_${i}_NAME`, "");
      map[`{{TESTIMONIAL_${i}_LOCATION}}`] = (t?.location || t?.city) || c(`TESTIMONIAL_${i}_LOCATION`, r.city);
    }
  }

  // Why us 1..4
  for (let i = 1; i <= 4; i++) {
    map[`{{WHY_US_${i}_TITLE}}`] = c(`WHY_US_${i}_TITLE`, "");
    map[`{{WHY_US_${i}_DESC}}`] = c(`WHY_US_${i}_DESC`, "");
  }

  // Team 1..3
  for (let i = 1; i <= 3; i++) {
    const member = Array.isArray(intake.team_members) ? intake.team_members[i - 1] : null;
    map[`{{TEAM_${i}_NAME}}`] = member?.name || c(`TEAM_${i}_NAME`, "");
    map[`{{TEAM_${i}_ROLE}}`] = member?.role || member?.title || c(`TEAM_${i}_ROLE`, "");
    map[`{{TEAM_${i}_BIO}}`] = member?.bio || c(`TEAM_${i}_BIO`, "");
    map[`{{TEAM_${i}_PHOTO_URL}}`] = r.teamPhotoUrls[i - 1] || "";
  }

  return map;
}

// ────────────────────────────────────────────────────────────────────────
// AI prompt — restaurant-specific copy
// ────────────────────────────────────────────────────────────────────────
export function getRestaurantCopyPrompt(args: {
  businessName: string; businessType: string; city: string; state: string;
  phone: string; email: string; address: string;
  yearsInBusiness: string; ownerName: string; ownerTitle: string;
  tagline: string; serviceNames: string[]; noTestimonials: boolean;
  intakeTestimonials: any[]; callNotes: any; hours: any; intake: any;
}): string {
  const {
    businessName, businessType, city, state, yearsInBusiness, ownerName,
    tagline, serviceNames, noTestimonials, callNotes, intake,
  } = args;

  const callNotesSnippet = callNotes
    ? JSON.stringify({
        their_story: (callNotes as any).their_story,
        tone_of_voice: (callNotes as any).tone_of_voice,
        tone_custom: (callNotes as any).tone_custom,
        vibe_notes: (callNotes as any).vibe_notes,
        exact_phrases: (callNotes as any).exact_phrases,
        expert_additions: (callNotes as any).expert_additions,
        expert_avoid: (callNotes as any).expert_avoid,
      }, null, 2)
    : "No call notes.";

  return `You are a copywriter for a real local FOOD & BEVERAGE business — a ${businessType} in ${city}${state ? ", " + state : ""}. Return ONLY valid JSON — no markdown, no code fences, no commentary. Start with { and end with }.

BUSINESS:
- Name: ${businessName}
- Type: ${businessType}
- City: ${city}${state ? ", " + state : ""}
- Years in business: ${yearsInBusiness || "not provided"}
- Owner name: ${ownerName || "not provided"}
- Tagline: ${tagline || "not provided"}
- Owner story: ${intake.about_story || intake.owner_bio_raw || intake.story_started || "not provided"}
- Menu items / signature products provided by client: ${serviceNames.join(", ") || "none — invent plausible items appropriate to the ${businessType}"}

CALL NOTES:
${callNotesSnippet}

ABSOLUTE RULES:
- This is a restaurant / cafe / bakery / food business. NEVER use coaching, consulting, services-business, or trades vocabulary.
- BANNED phrases: "BOOK A CALL", "WORK WITH ME", "SCHEDULE A CONSULTATION", "Sessions", "Coaching", "Strategy", "Discovery Call", "committed to excellence", "world-class", "seamless", "cutting-edge", "your satisfaction is our priority".
- Use restaurant CTAs only: "ORDER NOW", "VIEW MENU", "RESERVE A TABLE", "VISIT US", "GET DIRECTIONS", "SEE THE MENU".
- All copy must feel specific to a food/beverage business — taste, ingredients, atmosphere, hospitality.
- Tags/badges are short single words ("Bestseller", "Spicy", "Vegan", "New", "Classic", "Local", "Chef's Pick", "Crowd Favorite").
- HERO_HEADLINE_HIGHLIGHT is ONE NOUN that renders in accent color (e.g. "Scoops", "Burgers", "Pizza", "Coffee", "Pastries").
- For menu items: if client provided service names, use them VERBATIM in MENU_1..N_NAME (and use FEATURED_*_NAME). Generate descriptions, tags, prices to match. Generate additional plausible items only to fill remaining slots.
- For builder options: generate options appropriate to the business type (ice cream → bases/flavors/toppings; burger → buns/patties/toppings; coffee → milk/syrup/extras).
- Never invent specific Google review counts. Never claim certifications, awards, or years of operation that weren't provided.
- ${noTestimonials ? "TESTIMONIAL_1/2/3_* MUST be empty strings — client opted out." : "Generate 3 realistic local testimonials referencing actual items/atmosphere of this place."}
- Stats (STAT_1_NUMBER..STAT_4_LABEL) should be restaurant-shaped: e.g. "12 / SIGNATURE DISHES", "100% / FRESH DAILY", "7 / DAYS A WEEK", "${yearsInBusiness ? yearsInBusiness + "+" : "10+"} / YEARS LOCAL". Never fabricate Google review counts.
- TRUST_1..5 are short ALL CAPS trust phrases (e.g. "LOCAL INGREDIENTS", "FRESH DAILY", "FAMILY OWNED", "MADE IN ${city.toUpperCase() || "HOUSE"}", "COMMUNITY LOVED").

Return EXACTLY this JSON shape. Every key required. Use "" only when the client opted out (testimonials).

{
  "META_DESCRIPTION": "<155 char SEO description with ${businessName}, ${businessType}, ${city}>",
  "NAV_CTA": "ORDER NOW | RESERVE",
  "PROMO_TEXT": "<short promo headline e.g. 'New seasonal flavors are here'>",
  "PROMO_CTA": "<short CTA e.g. 'See What's New' (NOT 'Book a call')>",
  "FOOTER_TAGLINE": "<5-9 word tagline specific to this business>",

  "HERO_EYEBROW": "<short tag e.g. 'WELCOME TO ${businessName.toUpperCase()}' or 'LOCAL · ${city.toUpperCase()}'>",
  "HERO_HEADLINE_LINE1": "<2-4 words all caps>",
  "HERO_HEADLINE_HIGHLIGHT": "<ONE noun, the signature thing they make — all caps>",
  "HERO_HEADLINE_LINE2": "<2-4 words all caps>",
  "HERO_SUBHEADING": "<1 sentence about taste, vibe, location>",
  "HERO_CTA_PRIMARY": "ORDER NOW",
  "HERO_CTA_SECONDARY": "VIEW MENU",

  "STAT_1_NUMBER": "<restaurant-shaped stat number>",
  "STAT_1_LABEL": "<short ALL CAPS label>",
  "STAT_2_NUMBER": "...", "STAT_2_LABEL": "...",
  "STAT_3_NUMBER": "...", "STAT_3_LABEL": "...",
  "STAT_4_NUMBER": "...", "STAT_4_LABEL": "...",

  "TRUST_1": "<short ALL CAPS phrase>",
  "TRUST_2": "...", "TRUST_3": "...", "TRUST_4": "...", "TRUST_5": "...",

  "FEATURED_EYEBROW": "FEATURED",
  "FEATURED_HEADLINE": "<3-6 words e.g. 'Crowd Favorites This Week'>",
  "FEATURED_SUBTEXT": "<1 sentence>",
  "FEATURED_CTA": "VIEW FULL MENU",
  "FEATURED_1_NAME": "<dish/item name>",
  "FEATURED_1_DESC": "<short tasty description, 1 sentence>",
  "FEATURED_1_PRICE": "<e.g. '$6.50' or '$12'>",
  "FEATURED_1_BADGE": "<1 word: Bestseller | Spicy | New | Vegan | Classic | Chef's Pick>",
  "FEATURED_2_NAME": "...", "FEATURED_2_DESC": "...", "FEATURED_2_PRICE": "...", "FEATURED_2_BADGE": "...",
  "FEATURED_3_NAME": "...", "FEATURED_3_DESC": "...", "FEATURED_3_PRICE": "...", "FEATURED_3_BADGE": "...",

  "BUILDER_EYEBROW": "BUILD YOUR OWN",
  "BUILDER_HEADLINE_LINE1": "<2-4 words>",
  "BUILDER_HEADLINE_LINE2": "<2-4 words>",
  "BUILDER_SUBTEXT": "<1 sentence>",
  "BUILDER_CTA": "ORDER NOW",
  "BUILDER_PRICE_LABEL": "Starting at",
  "BUILDER_START_PRICE": "<e.g. '$6'>",
  "BUILDER_STEP_1_LABEL": "<step name e.g. 'Pick a Base'>",
  "BUILDER_STEP_2_LABEL": "<step name e.g. 'Choose Flavor'>",
  "BUILDER_STEP_3_LABEL": "<step name e.g. 'Add Toppings'>",
  "BUILDER_OPTION_1_1": "<short option name>", "BUILDER_OPTION_1_2": "...", "BUILDER_OPTION_1_3": "...", "BUILDER_OPTION_1_4": "...",
  "BUILDER_OPTION_2_1": "...", "BUILDER_OPTION_2_2": "...", "BUILDER_OPTION_2_3": "...", "BUILDER_OPTION_2_4": "...",
  "BUILDER_OPTION_3_1": "...", "BUILDER_OPTION_3_2": "...", "BUILDER_OPTION_3_3": "...", "BUILDER_OPTION_3_4": "...",

  "ABOUT_HEADLINE_LINE1": "<3-5 words>",
  "ABOUT_HEADLINE_LINE2": "<3-5 words>",
  "ABOUT_STORY_P1": "<2-3 sentence paragraph about the business origin/heart>",
  "ABOUT_STORY_P2": "<2-3 sentence paragraph about craft/ingredients/vibe>",
  "ABOUT_CTA": "OUR STORY",

  "MENU_PREVIEW_EYEBROW": "FROM THE MENU",
  "MENU_PREVIEW_HEADLINE": "<3-6 words>",
  "MENU_PREVIEW_CTA": "VIEW FULL MENU",

  "MENU_1_NAME": "${serviceNames[0] || "<signature item 1>"}",
  "MENU_1_DESC": "<short tasty description>",
  "MENU_1_PRICE": "<e.g. '$5.50'>",
  "MENU_1_TAG": "<single word tag>",
  "MENU_1_CATEGORY": "<matches one of FILTER_2..4>",
  "MENU_2_NAME": "${serviceNames[1] || "<item 2>"}", "MENU_2_DESC": "...", "MENU_2_PRICE": "...", "MENU_2_TAG": "...", "MENU_2_CATEGORY": "...",
  "MENU_3_NAME": "${serviceNames[2] || "<item 3>"}", "MENU_3_DESC": "...", "MENU_3_PRICE": "...", "MENU_3_TAG": "...", "MENU_3_CATEGORY": "...",
  "MENU_4_NAME": "${serviceNames[3] || "<item 4>"}", "MENU_4_DESC": "...", "MENU_4_PRICE": "...", "MENU_4_TAG": "...", "MENU_4_CATEGORY": "...",
  "MENU_5_NAME": "${serviceNames[4] || "<item 5>"}", "MENU_5_DESC": "...", "MENU_5_PRICE": "...", "MENU_5_TAG": "...", "MENU_5_CATEGORY": "...",
  "MENU_6_NAME": "${serviceNames[5] || "<item 6>"}", "MENU_6_DESC": "...", "MENU_6_PRICE": "...", "MENU_6_TAG": "...", "MENU_6_CATEGORY": "...",
  "MENU_7_NAME": "${serviceNames[6] || "<item 7>"}", "MENU_7_DESC": "...", "MENU_7_PRICE": "...", "MENU_7_TAG": "...", "MENU_7_CATEGORY": "...",
  "MENU_8_NAME": "${serviceNames[7] || "<item 8>"}", "MENU_8_DESC": "...", "MENU_8_PRICE": "...", "MENU_8_TAG": "...", "MENU_8_CATEGORY": "...",
  "MENU_9_NAME": "${serviceNames[8] || "<item 9>"}", "MENU_9_DESC": "...", "MENU_9_PRICE": "...", "MENU_9_CATEGORY": "...",

  "DEALS_EYEBROW": "DEALS",
  "DEALS_HEADLINE_LINE1": "<2-4 words>",
  "DEALS_HEADLINE_LINE2": "<2-4 words>",
  "DEALS_SUBTEXT": "<1 sentence>",
  "DEAL_1_NAME": "<deal/combo name>", "DEAL_1_BADGE": "<1 word badge>", "DEAL_1_PRICE": "<e.g. '$10'>", "DEAL_1_ORIGINAL_PRICE": "<e.g. '$14'>",
  "DEAL_1_INCLUDE_1": "<item or perk>", "DEAL_1_INCLUDE_2": "...", "DEAL_1_INCLUDE_3": "...",
  "DEAL_2_NAME": "...", "DEAL_2_BADGE": "...", "DEAL_2_PRICE": "...", "DEAL_2_ORIGINAL_PRICE": "...",
  "DEAL_2_INCLUDE_1": "...", "DEAL_2_INCLUDE_2": "...", "DEAL_2_INCLUDE_3": "...", "DEAL_2_INCLUDE_4": "...",
  "DEAL_3_NAME": "...", "DEAL_3_BADGE": "...", "DEAL_3_PRICE": "...", "DEAL_3_ORIGINAL_PRICE": "...",
  "DEAL_3_INCLUDE_1": "...", "DEAL_3_INCLUDE_2": "...", "DEAL_3_INCLUDE_3": "...",

  "TESTIMONIALS_EYEBROW": "REVIEWS",
  "TESTIMONIALS_HEADLINE": "<3-6 words>",
  "TESTIMONIAL_1_TEXT": "${noTestimonials ? "" : "<2 sentence review referencing a specific item or vibe>"}",
  "TESTIMONIAL_1_NAME": "${noTestimonials ? "" : "<local sounding full name>"}",
  "TESTIMONIAL_1_LOCATION": "${noTestimonials ? "" : (city || "")}",
  "TESTIMONIAL_2_TEXT": "${noTestimonials ? "" : "..."}", "TESTIMONIAL_2_NAME": "${noTestimonials ? "" : "..."}", "TESTIMONIAL_2_LOCATION": "${noTestimonials ? "" : (city || "")}",
  "TESTIMONIAL_3_TEXT": "${noTestimonials ? "" : "..."}", "TESTIMONIAL_3_NAME": "${noTestimonials ? "" : "..."}", "TESTIMONIAL_3_LOCATION": "${noTestimonials ? "" : (city || "")}",

  "WHY_EYEBROW": "WHY US",
  "WHY_HEADLINE_LINE1": "<2-4 words>",
  "WHY_HEADLINE_LINE2": "<2-4 words>",
  "WHY_US_1_TITLE": "<3-5 word reason>", "WHY_US_1_DESC": "<1-2 sentences>",
  "WHY_US_2_TITLE": "...", "WHY_US_2_DESC": "...",
  "WHY_US_3_TITLE": "...", "WHY_US_3_DESC": "...",
  "WHY_US_4_TITLE": "...", "WHY_US_4_DESC": "...",

  "VISIT_EYEBROW": "VISIT US",
  "VISIT_HEADLINE_LINE1": "<2-4 words>",
  "VISIT_HEADLINE_LINE2": "<2-4 words>",

  "ABOUT_HERO_EYEBROW": "OUR STORY",
  "ABOUT_HERO_HEADLINE": "<2-4 words>",
  "ABOUT_HERO_HEADLINE_2": "<2-4 words>",
  "ABOUT_HERO_SUBTEXT": "<1 sentence>",
  "ORIGIN_EYEBROW": "HOW IT STARTED",
  "ORIGIN_HEADLINE": "<3-6 word headline about the origin>",
  "ORIGIN_IMAGE_CAPTION": "<short caption>",
  "ORIGIN_CTA": "VISIT US",
  "SOURCING_1_EYEBROW": "SOURCING",
  "SOURCING_1_HEADLINE": "<2-4 words>",
  "SOURCING_1_BODY": "<2-3 sentences about ingredients/suppliers>",
  "SOURCING_2_EYEBROW": "CRAFT",
  "SOURCING_2_HEADLINE": "<2-4 words>",
  "SOURCING_2_BODY": "<2-3 sentences about technique/process>",
  "OWNER_NAME": "${ownerName || "<owner first + last name>"}",
  "OWNER_TITLE": "Owner",
  "TEAM_EYEBROW": "OUR TEAM",
  "TEAM_HEADLINE": "<3-5 words>",
  "TEAM_SUBTEXT": "<1 sentence>",
  "TEAM_1_NAME": "<name>", "TEAM_1_ROLE": "<role>", "TEAM_1_BIO": "<1-2 sentences>",
  "TEAM_2_NAME": "...", "TEAM_2_ROLE": "...", "TEAM_2_BIO": "...",
  "TEAM_3_NAME": "...", "TEAM_3_ROLE": "...", "TEAM_3_BIO": "...",
  "GALLERY_EYEBROW": "GALLERY",
  "GALLERY_HEADLINE": "<3-5 words>",

  "MENU_HERO_EYEBROW": "MENU",
  "MENU_HERO_HEADLINE": "<2-4 words>",
  "MENU_HERO_HEADLINE_2": "<2-4 words>",
  "MENU_HERO_SUBTEXT": "<1 sentence>",
  "TRENDING_EYEBROW": "TRENDING",
  "TRENDING_HEADLINE_LINE1": "<2-4 words>",
  "TRENDING_HEADLINE_LINE2": "<2-4 words>",
  "TRENDING_SUBTEXT": "<1 sentence>",
  "FULL_MENU_EYEBROW": "FULL MENU",
  "FULL_MENU_HEADLINE_LINE1": "<2-4 words>",
  "FULL_MENU_HEADLINE_LINE2": "<2-4 words>",
  "MENU_ITEM_COUNT": "9 items",
  "FILTER_1": "All",
  "FILTER_2": "<category 1 e.g. Burgers | Flavors | Drinks>",
  "FILTER_3": "<category 2>",
  "FILTER_4": "<category 3>"
}

CRITICAL: Return ONLY the JSON object. No markdown, no fences, no explanation.`;
}

// ────────────────────────────────────────────────────────────────────────
// Stock search terms — restaurant-aware
// ────────────────────────────────────────────────────────────────────────
export function buildRestaurantStockTerms(
  businessType: string,
  firstService: string,
  tagline: string,
): string[] {
  const ctx = `${businessType || ""} ${firstService || ""} ${tagline || ""}`.toLowerCase();

  if (/ice ?cream|creamery|gelato|frozen yog/.test(ctx)) {
    return ["ice cream shop interior", "artisan ice cream scoop", "ice cream cone close up", "creamery atmosphere"];
  }
  if (/burger/.test(ctx)) {
    return ["burger restaurant interior", "gourmet burger close up", "burger and fries", "burger joint atmosphere"];
  }
  if (/coffee|cafe|espresso|barista/.test(ctx)) {
    return ["modern cafe interior", "coffee shop atmosphere", "barista pouring latte", "espresso close up"];
  }
  if (/bakery|pastry|bake|patisserie/.test(ctx)) {
    return ["artisan bakery interior", "fresh baked pastries", "bakery display case", "croissant close up"];
  }
  if (/pizza|pizzeria/.test(ctx)) {
    return ["pizzeria interior", "wood fired pizza", "pizza close up", "pizza chef"];
  }
  if (/taco|mexican|burrito/.test(ctx)) {
    return ["taqueria interior", "street tacos close up", "mexican restaurant atmosphere"];
  }
  if (/sushi|japanese|ramen/.test(ctx)) {
    return ["sushi restaurant interior", "sushi platter close up", "ramen bowl close up"];
  }
  if (/bbq|barbecue|smokehouse/.test(ctx)) {
    return ["bbq smokehouse interior", "brisket close up", "barbecue plate"];
  }
  if (/bistro|fine dining/.test(ctx)) {
    return ["bistro interior warm lighting", "chef plating dish", "fine dining table setting"];
  }
  // Generic restaurant fallback
  return ["restaurant interior warm lighting", "chef plating dish", "dining atmosphere", "food close up"];
}

// ────────────────────────────────────────────────────────────────────────
// Local helpers — kept inline so this file is self-contained.
// ────────────────────────────────────────────────────────────────────────
function combineTerms(base: string[], biases: string[]): string[] {
  const out: string[] = [];
  for (const bias of biases) {
    for (const b of base) out.push(`${b} ${bias}`);
    out.push(bias);
  }
  return out;
}

function formatHours(hours: any, days: string[]): string {
  if (!hours || typeof hours !== "object") return "";
  // Pick first non-empty matching day
  for (const d of days) {
    const v = hours[d] || hours[d.charAt(0).toUpperCase() + d.slice(1)];
    if (v && typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && (v.open || v.from)) {
      const open = v.open || v.from;
      const close = v.close || v.to;
      return close ? `${open} – ${close}` : `${open}`;
    }
  }
  return "";
}

function escapeHTML(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string { return escapeHTML(s); }

function resolveBrandColor(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (!raw) return fallback;
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return raw;
  if (/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return `#${raw}`;
  if (/^(hsl|rgb)a?\s*\(/i.test(raw)) return raw;
  return fallback;
}

const PRIMARY_VAR_NAMES = ["--red", "--burgundy", "--primary", "--color-primary"];
const ACCENT_VAR_NAMES = ["--gold", "--accent", "--color-accent"];

function injectBrandTokensIntoRoot(html: string, tokens: { primaryColor?: string; accentColor?: string }): string {
  return html.replace(/:root\s*\{([\s\S]*?)\}/, (_m, body: string) => {
    let out = body;
    if (tokens.primaryColor) out = replaceCssVar(out, PRIMARY_VAR_NAMES, tokens.primaryColor);
    if (tokens.accentColor) out = replaceCssVar(out, ACCENT_VAR_NAMES, tokens.accentColor);
    return `:root {${out}}`;
  });
}

function replaceCssVar(body: string, names: string[], value: string): string {
  let out = body;
  let replaced = false;
  for (const n of names) {
    const re = new RegExp(`(${n.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`, "i");
    if (re.test(out)) {
      out = out.replace(re, `$1${value}$3`);
      replaced = true;
    }
  }
  if (!replaced) out = `${out.replace(/\s*$/, "")}\n  ${names[0]}: ${value};\n`;
  return out;
}

function buildMapHTML(input: {
  locationType?: string; streetAddress?: string; city?: string; state?: string; zip?: string; serviceArea?: string;
}): { html: string; url: string } {
  const type = (input.locationType || "").toLowerCase().trim();
  if (type === "online" || type === "remote" || type === "virtual" || type === "none") return { html: "", url: "" };
  const isFixed = type === "storefront" || type === "physical" || type === "hybrid" || !type;
  let url = "";
  if (isFixed && ((input.streetAddress || "").trim() || (input.city || "").trim())) {
    const q = [input.streetAddress, input.city, input.state, input.zip].filter(Boolean).join(", ");
    url = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  } else if (input.city || input.state) {
    url = `https://maps.google.com/maps?q=${encodeURIComponent([input.city, input.state].filter(Boolean).join(", "))}&z=9&output=embed`;
  }
  if (!url) return { html: `<div class="map-placeholder"><p>📍 ${escapeHTML((input.city || input.serviceArea || "VISIT US").toUpperCase())}</p></div>`, url: "" };
  return {
    html: `<iframe class="map-iframe" src="${url}" width="100%" height="100%" style="border:0;min-height:400px;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`,
    url,
  };
}

async function fetchUnsplashPhotoUrl(searchTerms: string[]): Promise<string> {
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return "";
  for (const term of searchTerms) {
    if (!term) continue;
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
      console.error(`[restaurant/unsplash] error for "${term}":`, e);
    }
  }
  return "";
}

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=["']?[^>"']+["']?\s*\/?>/i.test(html)) {
    return html.replace(/(<meta\s+charset=["']?[^>"']+["']?\s*\/?>)/i, `$1${tag}`);
  }
  return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

function buildFaviconHTML(opts: { faviconUrl?: string; logoUrl?: string; businessName?: string; primaryColor?: string }): string {
  const fav = (opts.faviconUrl || "").trim();
  if (fav) return `<link rel="icon" href="${fav}" />`;
  const logo = (opts.logoUrl || "").trim();
  if (logo) return `<link rel="icon" href="${logo}" />`;
  const initial = ((opts.businessName || "").trim().charAt(0) || "S").toUpperCase();
  const color = opts.primaryColor || "#534AB7";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='${color}'/><text y='.9em' font-size='75' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle' x='50' dominant-baseline='middle' dy='5'>${escapeHTML(initial)}</text></svg>`;
  const href = `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/"/g, "%22")}`;
  return `<link rel="icon" type="image/svg+xml" href="${href}" />`;
}

function injectFavicon(html: string, faviconTag: string): string {
  if (!faviconTag) return html;
  const cleaned = html.replace(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*\/?>/gi, "");
  const tag = `\n  ${faviconTag}`;
  if (/<meta\s+charset=["']?[^>"']+["']?\s*\/?>/i.test(cleaned)) {
    return cleaned.replace(/(<meta\s+charset=["']?[^>"']+["']?\s*\/?>)/i, `$1${tag}`);
  }
  return cleaned.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

function buildAnalyticsScript(clientId: string, supabaseUrl: string): string {
  return `\n<script>\n(function() {\n  var CLIENT_ID = '${clientId}';\n  var ENDPOINT = '${supabaseUrl}/functions/v1/track-event';\n  function getDevice() { return /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'; }\n  function getSid() { var s = sessionStorage.getItem('sq_sid'); if (!s) { s = Math.random().toString(36).substr(2,9); sessionStorage.setItem('sq_sid',s); } return s; }\n  function track(type, meta) { fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ client_id:CLIENT_ID, event_type:type, page_path:window.location.pathname, page_title:document.title, referrer:document.referrer, device_type:getDevice(), session_id:getSid(), metadata:meta||{} }) }).catch(function(){}); }\n  track('page_view');\n  document.addEventListener('click', function(e) { var a = e.target.closest('a'); if (!a) return; if (a.href && a.href.indexOf('tel:') === 0) track('phone_click'); if (a.href && a.href.indexOf('mailto:') === 0) track('email_click'); });\n  document.addEventListener('submit', function() { track('form_submission'); });\n})();\n</script>`;
}

function wireContactForms(html: string, clientId: string, supabaseUrl: string): string {
  const endpoint = `${supabaseUrl}/functions/v1/handle-contact-form`;
  const out = html.replace(/<form\b([^>]*)>/gi, (_m, attrs: string) => {
    let a = attrs;
    a = a.replace(/\s+action\s*=\s*("[^"]*"|'[^']*')/gi, "");
    a = a.replace(/\s+method\s*=\s*("[^"]*"|'[^']*')/gi, "");
    if (!/data-sq-contact-form/i.test(a)) a += ` data-sq-contact-form="1"`;
    const hidden = `\n      <input type="hidden" name="client_id" value="${clientId}" />\n      <input type="text" name="website" tabindex="-1" autocomplete="off" style="display:none !important;position:absolute;left:-10000px;" aria-hidden="true" />`;
    return `<form action="${endpoint}" method="post"${a}>${hidden}`;
  });
  const handler = `\n<script>(function(){var E=${JSON.stringify(endpoint)};function h(f){if(f.__sqWired)return;f.__sqWired=true;f.addEventListener('submit',function(e){e.preventDefault();var b=f.querySelector('button[type=\"submit\"],input[type=\"submit\"]');var o=b?(b.tagName==='INPUT'?b.value:b.innerHTML):'';if(b){b.disabled=true;if(b.tagName==='INPUT'){b.value='Sending...';}else{b.innerHTML='Sending...';}}var fd=new FormData(f),p={};fd.forEach(function(v,k){p[k]=v;});fetch(E,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}).then(function(r){return r.ok;}).catch(function(){return false;}).then(function(ok){var m=document.createElement('div');m.style.cssText='padding:16px;margin-top:12px;border-radius:6px;text-align:center;font-weight:600;';if(ok){m.style.background='#e6f9ed';m.style.color='#0d6b2f';m.textContent=\"Message sent! We'll be in touch soon.\";f.reset();}else{m.style.background='#fdecec';m.style.color='#a01010';m.textContent=\"Something went wrong. Please call us directly.\";}var x=f.querySelector('.sq-form-status');if(x)x.remove();m.className='sq-form-status';f.appendChild(m);if(b){b.disabled=false;if(b.tagName==='INPUT'){b.value=o;}else{b.innerHTML=o;}}});});}function i(){document.querySelectorAll('form[data-sq-contact-form=\"1\"]').forEach(h);}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',i);}else{i();}})();</script>`;
  return out.replace("</body>", handler + "\n</body>");
}

// ── AI calls ────────────────────────────────────────────────────────────
async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    return callLovableAI(LOVABLE_API_KEY, content, label);
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(AI_ENDPOINT, {
        method: "POST", signal: controller.signal,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, messages: [{ role: "user", content }] }),
      });
      clearTimeout(t);
      if (!r.ok) {
        const errText = await r.text();
        if ((r.status === 429 || r.status === 529) && attempt < 2) { await new Promise((res) => setTimeout(res, 3000)); continue; }
        if (LOVABLE_API_KEY && /credit balance|purchase credits|plans & billing/i.test(errText)) {
          console.warn(`[${label}] Anthropic credits exhausted — falling back to Lovable AI`);
          return callLovableAI(LOVABLE_API_KEY, content, label);
        }
        throw new Error(`Claude ${label}: ${r.status} — ${errText.substring(0, 300)}`);
      }
      const data = await r.json();
      const text = Array.isArray(data.content)
        ? data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        : "";
      return { text, outputTokens: data.usage?.output_tokens || 0 };
    } catch (e: any) {
      clearTimeout(t);
      if (attempt >= 2) throw e.name === "AbortError" ? new Error(`Claude ${label} timed out`) : e;
    }
  }
  throw new Error(`Claude ${label} failed`);
}

async function callLovableAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(LOVABLE_AI_ENDPOINT, {
      method: "POST", signal: controller.signal,
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: LOVABLE_AI_MODEL, messages: [{ role: "user", content }] }),
    });
    clearTimeout(t);
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Lovable AI ${label}: ${r.status} — ${errText.substring(0, 300)}`);
    }
    const data = await r.json();
    return { text: data.choices?.[0]?.message?.content || "", outputTokens: data.usage?.completion_tokens || 0 };
  } catch (e: any) {
    clearTimeout(t);
    throw e.name === "AbortError" ? new Error(`Lovable AI ${label} timed out`) : e;
  }
}

function parseJsonLoose(text: string): any {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to find the first {...} block
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}
