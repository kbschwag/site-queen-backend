import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/change-request-shared.ts";
import { requireUser } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authed = await requireUser(req, corsHeaders);
  if (authed instanceof Response) return authed;
  const { supabase } = authed;

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
