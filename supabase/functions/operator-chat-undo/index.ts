// operator-chat-undo: restore all snapshots taken during a specific assistant
// message in an operator chat. Per-message scoped — only restores files that
// were changed in that specific message.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  return html;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const token = auth.replace("Bearer ", "");
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  const user = { id: claimsData.claims.sub as string };

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isOp } = await supabase.rpc("is_operator", { _user_id: user.id });
  if (!isOp) return new Response(JSON.stringify({ error: "Operator only" }), { status: 403, headers: corsHeaders });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }
  const { chat_id, message_id } = body || {};
  if (!chat_id || !message_id) {
    return new Response(JSON.stringify({ error: "chat_id and message_id required" }), { status: 400, headers: corsHeaders });
  }

  const { data: snapshots } = await supabase
    .from("site_versions")
    .select("*")
    .eq("chat_message_id", message_id);

  if (!snapshots || snapshots.length === 0) {
    return new Response(JSON.stringify({ error: "No snapshots found for this message" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const clientId = snapshots[0].client_id;
  const results: any[] = [];

  for (const snap of snapshots) {
    for (const filename of snap.files_saved || []) {
      try {
        const snapPath = `${clientId}/versions/chat_${message_id}/${filename}`;
        const { data: snapBlob } = await supabase.storage.from("generated-sites").download(snapPath);
        if (!snapBlob) {
          results.push({ filename, status: "failed", error: "snapshot file not found" });
          continue;
        }
        const bytes = new Uint8Array(await snapBlob.arrayBuffer());
        const { error: upErr } = await supabase.storage
          .from("generated-sites")
          .upload(`${clientId}/deploy/${filename}`,
            new Blob([bytes], { type: "text/html" }),
            { upsert: true, contentType: "text/html" });
        if (upErr) {
          results.push({ filename, status: "failed", error: `storage restore failed: ${upErr.message}` });
          continue;
        }
        // Push restored to staging
        try {
          const html = injectNoindex(new TextDecoder().decode(bytes));
          await uploadFileToHostingerFtp(`/public_html/${clientId}/${filename}`, html);
          results.push({ filename, status: "restored" });
        } catch (e: any) {
          results.push({ filename, status: "restored_storage_only", error: `staging push failed: ${e.message}` });
        }
      } catch (e: any) {
        results.push({ filename, status: "failed", error: e.message || String(e) });
      }
    }
    await supabase.from("site_versions").update({ restored: true }).eq("id", snap.id);
  }

  await supabase.from("operator_chat_messages").insert({
    chat_id,
    role: "system_note",
    content: { type: "undo", undone_message_id: message_id, results, timestamp: new Date().toISOString() },
  });

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
