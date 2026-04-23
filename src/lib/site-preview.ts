const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export function buildSitePreviewUrl(clientId: string, page = "index.html") {
  const normalizedPage = page.endsWith(".html") ? page : `${page}.html`;
  const url = new URL(`${supabaseUrl}/functions/v1/serve-generated-site`);
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("page", normalizedPage);
  return url.toString();
}

export function buildSitePreviewUrlWithCacheBust(clientId: string, page = "index.html", cacheBust?: string | number) {
  const url = new URL(buildSitePreviewUrl(clientId, page));
  if (cacheBust) {
    url.searchParams.set("v", String(cacheBust));
  }
  return url.toString();
}