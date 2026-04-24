import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * Returns the staging preview URL for a generated site page.
 * The URL routes through the `serve-site` edge function so multi-page
 * navigation (about, services, contact …) works inside the iframe and
 * external link previews. The router serves the rewritten staging copy
 * with a noindex meta tag and frame-allow headers.
 */
export function buildSitePreviewUrl(clientId: string, page = "index.html") {
  const slug = page.replace(/\.html$/i, "") || "index";
  return `${SUPABASE_URL}/functions/v1/serve-site?client=${clientId}&page=${slug}`;
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
