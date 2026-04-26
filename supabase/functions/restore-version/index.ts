import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAGE_FILES = ["index.html", "about.html", "services.html", "contact.html"];

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

  // Operator-only
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

  try {
    const body = await req.json();
    const clientId: string = body.client_id;
    const timestamp: string = body.timestamp;

    if (!clientId || !timestamp) {
      return new Response(JSON.stringify({ error: "client_id and timestamp required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const restoredFiles: string[] = [];
    const missingFiles: string[] = [];

    for (const fname of PAGE_FILES) {
      const { data: file, error: dlErr } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/versions/${timestamp}/${fname}`);
      if (dlErr || !file) {
        missingFiles.push(fname);
        continue;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());

      // 1) Restore to deploy folder
      const { error: upErr } = await supabase.storage
        .from("generated-sites")
        .upload(
          `${clientId}/deploy/${fname}`,
          new Blob([bytes], { type: "text/html" }),
          { upsert: true, contentType: "text/html" }
        );
      if (upErr) throw new Error(`Failed to restore ${fname} to deploy: ${upErr.message}`);

      // 2) Push to Hostinger staging (with noindex)
      try {
        const html = new TextDecoder().decode(bytes);
        const stagingHtml = injectNoindex(html);
        await uploadFileToHostingerFtp(
          `/public_html/${clientId}/${fname}`,
          stagingHtml,
        );
      } catch (e: any) {
        console.error(`[restore-version] Hostinger push error for ${fname}:`, e);
      }

      restoredFiles.push(fname);
    }

    if (restoredFiles.length === 0) {
      return new Response(JSON.stringify({ error: `No files found in version ${timestamp}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log restore as a new site_versions row (so the history shows it)
    await supabase.from("site_versions").insert({
      client_id: clientId,
      timestamp,
      instruction: `Restored version ${timestamp}`,
      files_saved: restoredFiles,
      restored: true,
      created_by: caller.id,
    });

    // Update sites metadata
    await supabase
      .from("sites")
      .update({ last_updated: new Date().toISOString() } as any)
      .eq("client_id", clientId);

    return new Response(JSON.stringify({
      success: true,
      restored_files: restoredFiles,
      missing_files: missingFiles,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("restore-version error:", e);
    return new Response(JSON.stringify({ error: e.message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
