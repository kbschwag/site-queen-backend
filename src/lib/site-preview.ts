import { supabase } from "@/integrations/supabase/client";

// Staging is hosted on Hostinger at staging.sitequeen.ai → /public_html/staging
const STAGING_BASE_URL = "https://staging.sitequeen.ai";

/**
 * Returns the public Hostinger staging URL for a generated site page.
 * Files are pushed to Hostinger at `/public_html/staging/{clientId}/{slug}.html`
 * by the generate-website pipeline. Internal navigation uses normal relative
 * links so multi-page nav works without any router.
 */
export function buildSitePreviewUrl(clientId: string, page = "index.html") {
  const slug = page.replace(/\.html$/i, "") || "index";
  return `${STAGING_BASE_URL}/${clientId}/${slug}.html`;
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

// Re-export for legacy imports.
export { supabase };
