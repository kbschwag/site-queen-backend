import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { testFtpConnection } from "../_shared/client-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: caller must be admin
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

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { client_id, ftp_host, ftp_user, ftp_password, ftp_path, ftp_port, use_secure } = body || {};

  // Allow either explicit creds in body OR `client_id` to load from DB.
  let creds: any = null;
  if (ftp_host && ftp_user && ftp_password) {
    creds = {
      ftp_host: String(ftp_host),
      ftp_user: String(ftp_user),
      ftp_password: String(ftp_password),
      ftp_path: String(ftp_path || "/public_html/"),
      ftp_port: Number(ftp_port) || 21,
      use_secure: use_secure !== false,
    };
  } else if (client_id) {
    const { data, error } = await supabase
      .from("client_ftp_credentials")
      .select("*")
      .eq("client_id", client_id)
      .maybeSingle();
    if (error || !data) {
      return new Response(JSON.stringify({ ok: false, error: "No FTP credentials saved for client" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    creds = data;
  } else {
    return new Response(JSON.stringify({ error: "Provide ftp_host/user/password or client_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await testFtpConnection(creds);

  // If a client_id was provided, persist the test result.
  if (client_id) {
    await supabase
      .from("client_ftp_credentials")
      .update({
        tested_at: new Date().toISOString(),
        test_passed: result.ok,
        test_error: result.ok ? null : result.message,
      })
      .eq("client_id", client_id);
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
