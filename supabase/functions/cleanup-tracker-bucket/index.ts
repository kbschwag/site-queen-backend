import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // List + remove all files
    const { data: files, error: listErr } = await supabase.storage
      .from("tracker").list("", { limit: 1000 });
    if (listErr) throw new Error(`list: ${listErr.message}`);

    const paths = (files || []).map((f) => f.name);
    let removed: string[] = [];
    if (paths.length > 0) {
      const { data: rm, error: rmErr } = await supabase.storage
        .from("tracker").remove(paths);
      if (rmErr) throw new Error(`remove: ${rmErr.message}`);
      removed = (rm || []).map((r: any) => r.name);
    }

    // Delete the bucket via Storage REST (admin endpoint)
    const delResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/bucket/tracker`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
      },
    );
    const delBody = await delResp.text();

    return new Response(JSON.stringify({
      listed: paths,
      removed,
      bucket_delete_status: delResp.status,
      bucket_delete_body: delBody,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
