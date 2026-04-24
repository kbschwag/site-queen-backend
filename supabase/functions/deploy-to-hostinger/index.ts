import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check — require valid JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authSupabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user: caller }, error: authErr } = await authSupabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // Must be admin
  const { data: isAdmin } = await authSupabase.rpc("has_role", { _user_id: caller.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let clientId: string | null = null;

  try {
    const body = await req.json();
    clientId = body.client_id;
    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch client record
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    if (clientError || !client) throw new Error("Client not found");

    // Safety check 1 — deployment path must be confirmed
    if (!client.deployment_path_confirmed) {
      throw new Error("Deployment path not confirmed — aborting to prevent overwriting wrong site");
    }

    // Safety check 2 — domain must be ready to deploy
    if (client.domain_status !== "ready_to_deploy") {
      throw new Error("Domain status is not ready to deploy — aborting");
    }

    // Safety check 3 — must have a folder path
    if (!client.hostinger_folder_path) {
      throw new Error("No Hostinger folder path set — aborting");
    }

    const folderPath = client.hostinger_folder_path;
    const domain = client.domain_name;
    const deployCount = client.deploy_count || 0;

    // Fetch all generated HTML pages from the CLEAN deploy folder.
    // Staging copies live at `[clientId]/<slug>.html` (router-rewritten links
    // for the operator preview) — those must NEVER reach Hostinger. The
    // production-ready files live at `[clientId]/deploy/<slug>.html` with
    // normal relative links and no noindex meta tag.
    const { data: deployList, error: listError } = await supabase.storage
      .from("generated-sites")
      .list(`${clientId}/deploy`, { limit: 100 });
    if (listError) throw new Error(`Cannot list deploy files: ${listError.message}`);

    const htmlFiles = (deployList || []).filter((f: any) => f.name.toLowerCase().endsWith(".html"));
    if (!htmlFiles.find((f: any) => f.name.toLowerCase() === "index.html")) {
      throw new Error("Clean deploy/index.html not found in storage — re-generate the site first");
    }

    // Check for Hostinger API token
    const hostingerToken = Deno.env.get("HOSTINGER_API_TOKEN");
    if (!hostingerToken) {
      throw new Error("HOSTINGER_API_TOKEN not configured");
    }

    // Upload every clean HTML page (index.html + about.html + services.html + …)
    const uploaded: string[] = [];
    for (const f of htmlFiles) {
      const { data: pageFile, error: pageErr } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${f.name}`);
      if (pageErr || !pageFile) {
        throw new Error(`Could not download deploy/${f.name}: ${pageErr?.message}`);
      }
      const pageContent = await pageFile.text();
      const uploadResponse = await fetch(
        "https://api.hostinger.com/v1/hosting/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hostingerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: `${folderPath}/${f.name}`,
            content: btoa(unescape(encodeURIComponent(pageContent))),
          }),
        }
      );
      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Hostinger upload failed for ${f.name}: ${uploadResponse.status} - ${errText}`);
      }
      uploaded.push(f.name);
    }
    console.log(`[deploy] Uploaded ${uploaded.length} pages from deploy/: ${uploaded.join(", ")}`);

    // Plant safety marker file on first deployment
    if (deployCount === 0) {
      await fetch("https://api.hostinger.com/v1/hosting/files/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hostingerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: `${folderPath}/.sitequeen-${clientId}`,
          content: btoa(clientId),
        }),
      });
    }

    // Update client to live
    await supabase
      .from("clients")
      .update({
        site_status: "live",
        deploy_count: deployCount + 1,
      })
      .eq("id", clientId);

    // Update sites record
    await supabase
      .from("sites")
      .update({
        generation_status: "live",
        deploy_url: `https://${domain}`,
        last_deployed_at: new Date().toISOString(),
        deploy_count: deployCount + 1,
      })
      .eq("client_id", clientId);

    // Send celebration email
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (RESEND_API_KEY && LOVABLE_API_KEY) {
      try {
        await fetch("https://connector-gateway.lovable.dev/resend/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: "SiteQueen <hello@sitequeen.ai>",
            to: [client.email || ""],
            subject: "Your website is live ♛",
            html: `<h1>Your website is live. ♛</h1>
<p>Congratulations — your website is now live at <a href="https://${domain}">${domain}</a></p>
<p>Welcome to SiteQueen. ♛</p>`,
          }),
        });
      } catch (e) {
        console.error("Failed to send celebration email:", e);
      }
    }

    // Create operator notification
    await supabase.from("notifications").insert({
      type: "site_went_live",
      client_id: clientId,
      message: `${client.business_name} is now live at ${domain} ♛`,
      target_role: "operator",
    });

    // Log deployment
    await supabase.from("generation_logs").insert({
      client_id: clientId,
      status: "deployed",
    });

    return new Response(
      JSON.stringify({ success: true, live_url: `https://${domain}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Deployment error:", error);

    if (clientId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase.from("notifications").insert({
          type: "deployment_failed",
          client_id: clientId,
          message: `Deployment failed — ${error.message}`,
          target_role: "operator",
        });
      } catch (e) {
        console.error("Could not create failure notification:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
