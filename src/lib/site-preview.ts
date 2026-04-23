import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the direct Supabase Storage public URL for a generated site page.
 * Bucket `generated-sites` is public, so files are served with their stored
 * MIME type (text/html) — no edge function needed.
 */
export function buildSitePreviewUrl(clientId: string, page = "index.html") {
  const normalizedPage = page.endsWith(".html") ? page : `${page}.html`;
  const { data } = supabase.storage
    .from("generated-sites")
    .getPublicUrl(`${clientId}/${normalizedPage}`);
  return data.publicUrl;
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
