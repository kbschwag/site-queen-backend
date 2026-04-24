import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * Returns the direct Supabase storage URL for a generated site page.
 * The `generated-sites` bucket is public so the browser can load the
 * HTML directly. Internal navigation links are rewritten at generation
 * time to point at sibling storage URLs, so multi-page nav works.
 */
export function buildSitePreviewUrl(clientId: string, page = "index.html") {
  const slug = page.replace(/\.html$/i, "") || "index";
  return `${SUPABASE_URL}/storage/v1/object/public/generated-sites/${clientId}/${slug}.html`;
}

export function buildSitePreviewUrlWithCacheBust(
  clientId: string,
  page = "index.html",
  cacheBust?: string | number,
) {
  const base = buildSitePreviewUrl(clientId, page);
  if (!cacheBust) return base;
  const url = new URL(base);
  url.searchParams.set("v", String(cacheBust));
  return url.toString();
}

// Re-export for legacy imports — `supabase` no longer needed here but kept
// to avoid breaking any consumer that imports from this module.
export { supabase };
