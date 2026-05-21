// Owner-only one-shot helper to upload tracker JS to the `tracker` bucket
// with the correct Content-Type and Cache-Control headers.
//
// POST body: { filename: "tracker-v2.js", content: "<js source>" }
// Returns:   { ok: true, public_url, cache_control, content_type }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_SECONDS = "14400"; // 4 hours
const CONTENT_TYPE = "application/javascript; charset=utf-8";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sharedSecret = Deno.env.get("STAGING_UPLOAD_SECRET") || "";

  // Auth: accept EITHER an Owner-role JWT OR the shared STAGING_UPLOAD_SECRET header.
  const headerSecret = req.headers.get("x-admin-secret") || "";
  const authHeader = req.headers.get("Authorization") || "";
  let authorized = false;
  if (sharedSecret && headerSecret && headerSecret === sharedSecret) {
    authorized = true;
  } else if (authHeader.startsWith("Bearer ")) {
    const authClient = createClient(supabaseUrl, serviceKey);
    const { data: { user } } =
      await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (user) {
      const { data: isOwner } = await authClient.rpc("has_role", {
        _user_id: user.id, _role: "owner",
      });
      if (isOwner) authorized = true;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const filename = String(body.filename || "").trim();
    const content = String(body.content || "");
    if (!/^tracker-v\d+\.js$/.test(filename)) {
      return new Response(JSON.stringify({ error: "filename must match tracker-vN.js" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!content || content.length < 50) {
      return new Response(JSON.stringify({ error: "content missing or too small" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const blob = new Blob([content], { type: CONTENT_TYPE });
    const { error: upErr } = await supabase.storage
      .from("tracker")
      .upload(filename, blob, {
        upsert: true,
        contentType: CONTENT_TYPE,
        cacheControl: CACHE_SECONDS,
      });
    if (upErr) throw upErr;

    const publicUrl =
      `${supabaseUrl}/storage/v1/object/public/tracker/${filename}`;

    return new Response(JSON.stringify({
      ok: true,
      public_url: publicUrl,
      cache_control: `max-age=${CACHE_SECONDS}`,
      content_type: CONTENT_TYPE,
      bytes: content.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("admin-upload-tracker error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
