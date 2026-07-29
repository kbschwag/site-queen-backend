// sync-files-to-staging: push every file in a client's storage deploy folder
// to the Hostinger staging server, so what operators upload in the Files tab
// is what the staging preview serves.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  return html;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user: caller } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!caller) return json({ error: "Invalid token" }, 401);

  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    supabase.from("profiles").select("role").eq("user_id", caller.id).maybeSingle(),
  ]);
  if (!roleRow && profileRow?.role !== "partner" && profileRow?.role !== "admin") {
    return json({ error: "Operator access required" }, 403);
  }

  let clientId = "";
  let folder = "deploy";
  try {
    const body = await req.json();
    clientId = String(body.client_id || "").trim();
    if (body.folder) folder = String(body.folder).replace(/^\/+|\/+$/g, "");
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) return json({ error: "Invalid client_id" }, 400);

  const prefix = folder ? `${clientId}/${folder}` : clientId;
  const { data: entries, error: listErr } = await supabase.storage
    .from("generated-sites")
    .list(prefix, { limit: 500 });
  if (listErr) return json({ error: listErr.message }, 500);

  const files = (entries || []).filter(
    (e: any) => e.id !== null && e.name !== ".emptyFolderPlaceholder",
  );
  if (files.length === 0) return json({ error: `No files found in ${prefix}` }, 404);

  const pushed: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const f of files) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("generated-sites")
        .download(`${prefix}/${f.name}`);
      if (dlErr || !blob) throw new Error(dlErr?.message || "download failed");

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const isHtml = /\.html?$/i.test(f.name);
      const content: string | Uint8Array = isHtml
        ? injectNoindex(new TextDecoder().decode(bytes))
        : bytes;

      await uploadFileToHostingerFtp(`/public_html/${clientId}/${f.name}`, content);
      pushed.push(f.name);
    } catch (e: any) {
      failed.push({ file: f.name, error: e?.message || String(e) });
    }
  }

  return json({ success: failed.length === 0, pushed, failed }, failed.length && !pushed.length ? 500 : 200);
});
