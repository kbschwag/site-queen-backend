import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadToClientFtp } from "../_shared/client-ftp.ts";
import { uploadToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Strip the staging-only `<meta name="robots" content="noindex,...">` tag. */
function stripNoindex(html: string): string {
  return html.replace(
    /\s*<meta\s+name=["']robots["'][^>]*>\s*/gi,
    "\n  ",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let clientId: string | null = null;
  try {
    const body = await req.json();
    clientId = body.client_id;
    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients").select("*").eq("id", clientId).single();
    if (clientErr || !client) throw new Error("Client not found");

    if (!client.deployment_path_confirmed) {
      throw new Error("Deployment path not confirmed — aborting");
    }
    if (client.domain_status !== "ready_to_deploy") {
      throw new Error("Domain status is not ready to deploy — aborting");
    }

    // Load deploy/ folder from storage
    const { data: deployList, error: listErr } = await supabase.storage
      .from("generated-sites")
      .list(`${clientId}/deploy`, { limit: 100 });
    if (listErr) throw new Error(`Cannot list deploy files: ${listErr.message}`);

    const htmlFiles = (deployList || []).filter((f: any) => f.name.toLowerCase().endsWith(".html"));
    if (!htmlFiles.find((f: any) => f.name.toLowerCase() === "index.html")) {
      throw new Error("deploy/index.html not found — re-generate the site first");
    }

    // Pull each file, strip noindex
    const files: { filename: string; content: string }[] = [];
    for (const f of htmlFiles) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${f.name}`);
      if (dlErr || !blob) throw new Error(`Could not download deploy/${f.name}: ${dlErr?.message}`);
      const html = await blob.text();
      files.push({ filename: f.name, content: stripNoindex(html) });
    }

    // Decide deployment target: client's own FTP if configured, otherwise
    // SiteQueen shared Hostinger (uploaded to /public_html/<clientId>/).
    const { data: ftp } = await supabase
      .from("client_ftp_credentials")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    let target: "client_ftp" | "shared" = "shared";
    if (ftp && ftp.ftp_host && ftp.ftp_user && ftp.ftp_password) {
      target = "client_ftp";
      await uploadToClientFtp(ftp, files);
    } else {
      // Fallback — push to SiteQueen shared Hostinger receiver under
      // /public_html/<clientId>/<file>.
      const uploads = files.map((f) => ({
        remotePath: `/public_html/${clientId}/${f.filename}`,
        content: f.content,
      }));
      await uploadToHostingerFtp(uploads);
    }

    const deployedAt = new Date().toISOString();
    const newDeployCount = (client.deploy_count || 0) + 1;

    await supabase.from("clients").update({
      site_status: "live",
      deploy_count: newDeployCount,
    }).eq("id", clientId);

    await supabase.from("sites").update({
      generation_status: "live",
      deploy_url: client.domain_name ? `https://${client.domain_name}` : null,
      last_deployed_at: deployedAt,
      deploy_count: newDeployCount,
    }).eq("client_id", clientId);

    await supabase.from("audit_log").insert({
      user_id: user.id,
      user_email: user.email,
      action: `Deployed ${client.business_name} to ${target === "client_ftp" ? "client FTP" : "shared hosting"} (${files.length} file${files.length === 1 ? "" : "s"})`,
      target_table: "sites",
      target_id: clientId,
    });

    await supabase.from("generation_logs").insert({
      client_id: clientId,
      status: "deployed",
      generation_notes: `target=${target}, files=${files.length}`,
    });

    // Send "Your website is live" email to the client (only on first successful deploy)
    if ((client.deploy_count || 0) === 0 && client.email && client.domain_name) {
      try {
        const siteUrl = `https://${client.domain_name.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
        await supabase.functions.invoke("send-email", {
          body: {
            to: client.email,
            template: "site_live",
            clientId,
            data: {
              first_name: client.first_name || client.business_name || "there",
              business_name: client.business_name,
              domain: client.domain_name,
              site_url: siteUrl,
            },
          },
        });
      } catch (e) {
        console.error("[deploy-to-live] site_live email failed:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      target,
      files_uploaded: files.length,
      deployed_at: deployedAt,
      live_url: client.domain_name ? `https://${client.domain_name}` : null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[deploy-to-live] error:", error);
    if (clientId) {
      try {
        await supabase.from("notifications").insert({
          type: "deployment_failed",
          client_id: clientId,
          message: `Deployment failed — ${error.message}`,
          target_role: "operator",
        });
      } catch { /* noop */ }
    }
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
