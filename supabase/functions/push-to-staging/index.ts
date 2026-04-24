import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGING_FOLDER_ROOT = "/public_html";

// Inject a noindex meta tag if not already present so search engines never
// index the staging copy.
function injectNoindex(html: string): string {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: caller must be an operator (admin or partner)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    supabase.from("profiles").select("role").eq("user_id", caller.id).maybeSingle(),
  ]);
  const isOperator = !!roleRow || profileRow?.role === "partner" || profileRow?.role === "admin";
  if (!isOperator) {
    return new Response(JSON.stringify({ error: "Operator access required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let clientId = "";
  let file = "";
  let content = "";
  try {
    const body = await req.json();
    clientId = String(body.client_id || "").trim();
    file = String(body.file || "").trim();
    content = String(body.content || "");
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!clientId || !file || !content) {
    return new Response(JSON.stringify({ error: "client_id, file, and content are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sanitize filename — no path traversal, must end in .html
  if (!/^[a-zA-Z0-9_-]+\.html$/.test(file)) {
    return new Response(JSON.stringify({ error: "Invalid filename — expected something like index.html" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sanitize client_id — must be a UUID
  if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) {
    return new Response(JSON.stringify({ error: "Invalid client_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // FTP credentials are checked lazily inside uploadFileToHostingerFtp.
  const stagingHtml = injectNoindex(content);
  const path = `${STAGING_FOLDER_ROOT}/${clientId}/${file}`;

  try {
    await uploadFileToHostingerFtp(path, stagingHtml);
    return new Response(JSON.stringify({ success: true, path }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[push-to-staging] error:", e);
    return new Response(JSON.stringify({ success: false, error: e.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
