import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId")?.trim();
    const pageParam = url.searchParams.get("page")?.trim() || "index.html";
    const page = pageParam.endsWith(".html") ? pageParam : `${pageParam}.html`;

    if (!clientId || !/^[a-z0-9-]+$/i.test(clientId)) {
      return json({ error: "Valid clientId required" }, 400);
    }

    if (!/^[a-z0-9-]+\.html$/i.test(page)) {
      return json({ error: "Valid page required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: file, error } = await supabase.storage
      .from("generated-sites")
      .download(`${clientId}/${page}`);

    if (error || !file) {
      return json({ error: "Page not found" }, 404);
    }

    const html = await file.text();

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("[serve-generated-site]", error);
    return json({ error: error.message || "Unexpected error" }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}