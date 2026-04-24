import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allow letters, numbers, hyphens for page slugs. No path traversal.
const SLUG_RE = /^[a-zA-Z0-9-]+$/;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const clientId = url.searchParams.get("client") || "";
  const page = url.searchParams.get("page") || "index";

  if (!UUID_RE.test(clientId)) {
    return new Response("Missing or invalid client ID", { status: 400, headers: corsHeaders });
  }
  if (!SLUG_RE.test(page)) {
    return new Response("Page not found", { status: 404, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: file, error } = await supabase.storage
      .from("generated-sites")
      .download(`${clientId}/${page}.html`);

    if (error || !file) {
      return new Response(`Page not found: ${page}`, { status: 404, headers: corsHeaders });
    }

    const html = await file.text();

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
      },
    });
  } catch (e) {
    console.error("[serve-site] error:", e);
    return new Response("Internal server error", { status: 500, headers: corsHeaders });
  }
});
