import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, json } from "../_shared/change-request-shared.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const token = authHeader.replace("Bearer ", "");
  const supabaseAuth = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Invalid token" }, 401);

  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { job_id } = await req.json();
    if (!job_id) return json({ error: "job_id required" }, 400);
    const { error } = await supabase.from("quick_edit_jobs").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    }).eq("id", job_id).eq("status", "awaiting_confirmation");
    if (error) throw error;
    return json({ success: true });
  } catch (e: any) {
    return json({ error: e.message ?? "Unknown error" }, 500);
  }
});
