const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all active clients
    const { data: clients, error } = await supabase
      .from("clients")
      .select("*")
      .eq("subscription_status", "active");

    if (error) throw error;

    let resetCount = 0;

    for (const client of clients || []) {
      const monthlyAllowance = client.credits_monthly_allowance || 10;
      const rolloverCap = client.credits_rollover_cap || 20;
      const currentBalance = client.credits_balance || 0;

      // Calculate new balance with rollover
      const rolledOver = Math.min(currentBalance, rolloverCap);
      const newBalance = Math.min(rolledOver + monthlyAllowance, rolloverCap + monthlyAllowance);

      // Update client
      await supabase
        .from("clients")
        .update({
          credits_balance: newBalance,
          credits_last_reset: new Date().toISOString(),
        })
        .eq("id", client.id);

      // Record transaction
      await supabase.from("credits_transactions").insert({
        client_id: client.id,
        transaction_type: "monthly_reset",
        credits_amount: monthlyAllowance,
        credits_balance_after: newBalance,
        description: `Monthly credit refresh — ${monthlyAllowance} credits added`,
      });

      resetCount++;
    }

    return new Response(
      JSON.stringify({ success: true, clients_reset: resetCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Monthly credits reset error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
