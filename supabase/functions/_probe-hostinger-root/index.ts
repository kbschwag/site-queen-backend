// Temporary probe: posts a harmless file to the Hostinger receiver with
// client_id="__root__" so we can see which docroot __root__ actually maps to.
// Delete this function after the probe is complete.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("HOSTINGER_UPLOAD_URL")!;
  const secret =
    Deno.env.get("STAGING_UPLOAD_SECRET") || Deno.env.get("HOSTINGER_UPLOAD_SECRET")!;

  const filename = "sq-deploy-probe-DELETE-ME.txt";
  const form = new FormData();
  form.append("file", new Blob(["probe"], { type: "text/plain" }), filename);
  form.append("client_id", "__root__");
  form.append("filename", filename);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "X-SECRET": secret },
    body: form,
  });
  const text = await resp.text();

  return new Response(
    JSON.stringify({ status: resp.status, receiver_url: url, body: text.substring(0, 800) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
