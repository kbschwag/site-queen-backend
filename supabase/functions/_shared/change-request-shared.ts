// Shared utilities for the change-request preview/apply pipeline.
// Edits operate on deployed HTML files (no full-page regeneration).

import { uploadFileToHostingerFtp } from "./hostinger-ftp.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const PAGE_MAP: Record<string, string> = {
  index: "index.html",
  homepage: "index.html",
  home: "index.html",
  about: "about.html",
  services: "services.html",
  contact: "contact.html",
};
export const ALL_PAGE_FILES = ["index.html", "about.html", "services.html", "contact.html"];

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function runInBackground(task: Promise<unknown>) {
  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(task);
    return;
  }
  task.catch((e) => console.error("[change-request] background task failed:", e));
}

export function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=["'][^"']+["']\s*\/?>/i.test(html)) {
    return html.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i, `$1${tag}`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  }
  return html;
}

export async function loadDeployedHtml(supabase: any, clientId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    ALL_PAGE_FILES.map(async (fname) => {
      const { data } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${fname}`);
      if (data) out[fname] = await data.text();
    }),
  );
  return out;
}

export async function uploadAndPushFile(
  supabase: any,
  clientId: string,
  filename: string,
  html: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from("generated-sites")
    .upload(`${clientId}/deploy/${filename}`, new Blob([html], { type: "text/html" }), {
      upsert: true,
      contentType: "text/html",
    });
  if (error) throw new Error(`Storage upload failed for ${filename}: ${error.message}`);

  runInBackground((async () => {
    try {
      const stagingHtml = injectNoindex(html);
      await uploadFileToHostingerFtp(`/public_html/staging/${clientId}/${filename}`, stagingHtml);
    } catch (e: any) {
      console.error(`[change-request] FTP push error for ${filename}:`, e);
    }
  })());
}

export async function snapshotDeploy(
  supabase: any,
  clientId: string,
  versionTimestamp: string,
): Promise<string[]> {
  const filesSaved: string[] = [];
  await Promise.all(
    ALL_PAGE_FILES.map(async (fname) => {
      const { data: existing } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${fname}`);
      if (!existing) return;
      const bytes = new Uint8Array(await existing.arrayBuffer());
      const { error: snapErr } = await supabase.storage
        .from("generated-sites")
        .upload(
          `${clientId}/versions/${versionTimestamp}/${fname}`,
          new Blob([bytes], { type: "text/html" }),
          { upsert: true, contentType: "text/html" },
        );
      if (!snapErr) filesSaved.push(fname);
    }),
  );
  return filesSaved;
}

// ─── Field maps (data fields → possible intake keys) ─────────────────────────
export const FIELD_INTAKE_KEYS: Record<string, string[]> = {
  business_name: ["business_name"],
  business_phone: ["business_phone", "primary_phone", "phone", "phone_number"],
  business_email: ["business_email", "email"],
  business_address: ["business_address", "address", "street_address"],
  business_city: ["business_city", "city"],
  business_state: ["business_state", "state"],
  business_zip: ["business_zip", "zip", "postal_code"],
  business_hours: ["business_hours", "hours", "hours_of_operation"],
  service_area: ["service_area", "service_areas"],
  owner_name: ["owner_name", "founder_name"],
  owner_title: ["owner_title"],
  years_in_business: ["years_in_business"],
  google_rating: ["google_rating"],
  google_review_count: ["google_review_count"],
  license_number: ["license_number"],
  instagram_url: ["instagram_url", "instagram"],
  facebook_url: ["facebook_url", "facebook"],
  linkedin_url: ["linkedin_url", "linkedin"],
  pinterest_url: ["pinterest_url", "pinterest"],
  tiktok_url: ["tiktok_url", "tiktok"],
  youtube_url: ["youtube_url", "youtube"],
  twitter_url: ["twitter_url", "twitter"],
  google_business_url: ["google_business_url", "google_url"],
  yelp_url: ["yelp_url"],
  booking_url: ["booking_url"],
  ordering_url: ["ordering_url"],
  menu_url: ["menu_url"],
  tagline: ["tagline"],
};

export function getCurrentFieldValue(intake: any, field: string): string {
  const keys = FIELD_INTAKE_KEYS[field] || [field];
  for (const key of keys) {
    if (intake?.[key]) return String(intake[key]);
  }
  return "";
}

// ─── CSS variable aliases ───────────────────────────────────────────────────
export const VISUAL_TOKEN_ALIASES: Record<string, string[]> = {
  "primary-color": ["--primary", "--brand", "--brand-color", "--burgundy", "--navy", "--red", "--accent-primary"],
  "accent-color": ["--accent", "--accent-color", "--gold"],
  "background-color": ["--background", "--bg", "--bg-color"],
  "text-color": ["--text", "--text-color", "--foreground"],
  "heading-font": ["--font-heading", "--font-serif", "--font-display"],
  "body-font": ["--font-body", "--font-sans"],
  "border-radius": ["--radius", "--border-radius"],
};

// ─── Section keyword finder ─────────────────────────────────────────────────
export function findSectionBlock(html: string, identifier: string): string | null {
  const id = identifier.toLowerCase().trim();
  const tagRe = /<(section|header|footer|nav|aside|div)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    if (tag === "div" && !/(class|id)=["'][^"']*\b/.test(m[0])) continue;
    const closeRe = new RegExp(`</${tag}>`, "i");
    const rest = html.slice(m.index + m[0].length);
    const closeMatch = rest.match(closeRe);
    if (!closeMatch || closeMatch.index === undefined) continue;
    const end = m.index + m[0].length + closeMatch.index + closeMatch[0].length;
    const block = html.slice(m.index, end);
    // Match if open tag has identifier in class/id OR first ~200 chars of inner text mentions it
    const opener = m[0].toLowerCase();
    const head = block.slice(0, 600).toLowerCase();
    if (opener.includes(id) || head.includes(id)) return block;
  }
  return null;
}

// ─── Image slot → searchable substrings in deployed HTML ────────────────────
export const IMAGE_SLOT_KEYS: Record<string, string[]> = {
  hero_image: ["hero", "hero-image", "hero_image"],
  about_image: ["about", "about-image"],
  why_us_image: ["why-us", "why_us", "whyus"],
  service_1_image: ["service-1", "service_1"],
  service_2_image: ["service-2", "service_2"],
  service_3_image: ["service-3", "service_3"],
  service_4_image: ["service-4", "service_4"],
  service_5_image: ["service-5", "service_5"],
  logo: ["logo"],
  favicon: ["favicon", "icon"],
  transformation_image: ["transformation"],
  lead_magnet_image: ["lead-magnet", "lead_magnet"],
};
