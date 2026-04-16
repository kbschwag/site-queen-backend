import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const results: string[] = [];

    // Helper: check if email already sent (idempotency)
    const alreadySent = async (emailType: string, clientId: string): Promise<boolean> => {
      const { data } = await supabase
        .from("emails_log")
        .select("id")
        .eq("email_type", emailType)
        .eq("client_id", clientId)
        .limit(1);
      return (data?.length || 0) > 0;
    };

    // Helper: send email via send-email function
    const sendEmail = async (to: string, template: string, data: Record<string, any>, clientId?: string) => {
      try {
        await supabase.functions.invoke("send-email", {
          body: { to, template, data, clientId },
        });
        results.push(`✓ ${template} → ${to}`);
      } catch (e) {
        results.push(`✗ ${template} → ${to}: ${(e as Error).message}`);
      }
    };

    // Helper: get client profile email
    const getClientEmail = async (userId: string): Promise<{ email: string; name: string } | null> => {
      const { data } = await supabase.from("profiles").select("email, full_name").eq("user_id", userId).maybeSingle();
      if (!data?.email) return null;
      return { email: data.email, name: data.full_name || "" };
    };

    // ═══════════════════════════════════════════
    // 1. PROCESS SCHEDULED EMAILS
    // ═══════════════════════════════════════════
    const { data: scheduled } = await supabase
      .from("scheduled_emails")
      .select("*")
      .eq("sent", false)
      .eq("cancelled", false)
      .lte("send_at", now.toISOString());

    for (const sched of scheduled || []) {
      // Check if client completed intake (stop onboarding sequence)
      if (sched.email_type.startsWith("onboarding_day") || sched.email_type.startsWith("intake_reminder")) {
        if (sched.client_id) {
          const { data: client } = await supabase.from("clients").select("intake_completed").eq("id", sched.client_id).single();
          if (client?.intake_completed) {
            await supabase.from("scheduled_emails").update({ cancelled: true }).eq("id", sched.id);
            results.push(`⏭ ${sched.email_type} cancelled (intake completed)`);
            continue;
          }
        }
      }

      await sendEmail(sched.recipient_email, sched.email_type, sched.payload || {}, sched.client_id);
      await supabase.from("scheduled_emails").update({ sent: true, sent_at: now.toISOString() }).eq("id", sched.id);
    }

    // ═══════════════════════════════════════════
    // 2. INTAKE REMINDERS (24h, 3d, 7d)
    // ═══════════════════════════════════════════
    const { data: newClients } = await supabase
      .from("clients")
      .select("*, profiles!inner(email, full_name)")
      .eq("intake_completed", false)
      .eq("subscription_status", "active")
      .is("deleted_at", null);

    for (const client of newClients || []) {
      const profile = (client as any).profiles;
      if (!profile?.email) continue;

      const hoursSinceCreation = (now.getTime() - new Date(client.created_at).getTime()) / (1000 * 60 * 60);
      const firstName = (profile.full_name || "").split(" ")[0] || "there";

      // 24h reminder
      if (hoursSinceCreation >= 24 && hoursSinceCreation < 72) {
        if (!(await alreadySent("intake_reminder_24h", client.id))) {
          await sendEmail(profile.email, "intake_reminder_24h", {
            name: profile.full_name, first_name: firstName, business_name: client.business_name,
          }, client.id);
        }
      }

      // 3 day reminder
      if (hoursSinceCreation >= 72 && hoursSinceCreation < 168) {
        if (!(await alreadySent("intake_reminder_3d", client.id))) {
          await sendEmail(profile.email, "intake_reminder_3d", {
            name: profile.full_name, first_name: firstName, business_name: client.business_name,
          }, client.id);
        }
      }

      // 7 day reminder
      if (hoursSinceCreation >= 168 && hoursSinceCreation < 336) {
        if (!(await alreadySent("intake_reminder_7d", client.id))) {
          await sendEmail(profile.email, "intake_reminder_7d", {
            name: profile.full_name, first_name: firstName, business_name: client.business_name,
          }, client.id);
        }
      }

      // 14 day operator alert
      if (hoursSinceCreation >= 336) {
        if (!(await alreadySent("operator_incomplete_intake", client.id))) {
          await sendEmail("hello@sitequeen.ai", "operator_incomplete_intake", {
            business_name: client.business_name,
            plan: client.plan,
            phone_number: client.phone_number,
            join_date: new Date(client.created_at).toLocaleDateString(),
          }, client.id);
        }
      }
    }

    // ═══════════════════════════════════════════
    // 3. PAYMENT FAILURE REMINDERS (Day 3, Day 6, Day 7 suspend)
    // ═══════════════════════════════════════════
    const { data: failedPaymentClients } = await supabase
      .from("clients")
      .select("*")
      .eq("payment_status", "failed")
      .not("payment_failed_at", "is", null)
      .is("deleted_at", null);

    for (const client of failedPaymentClients || []) {
      if (!client.user_id || !client.payment_failed_at) continue;
      const profile = await getClientEmail(client.user_id);
      if (!profile) continue;

      const daysSinceFail = (now.getTime() - new Date(client.payment_failed_at).getTime()) / (1000 * 60 * 60 * 24);
      const firstName = profile.name.split(" ")[0] || "there";

      // Day 3 reminder
      if (daysSinceFail >= 3 && daysSinceFail < 6) {
        if (!(await alreadySent("payment_failed_day3", client.id))) {
          await sendEmail(profile.email, "payment_failed_day3", {
            name: profile.name, first_name: firstName,
          }, client.id);
        }
      }

      // Day 6 final warning + operator alert
      if (daysSinceFail >= 6 && daysSinceFail < 7) {
        if (!(await alreadySent("payment_failed_day6", client.id))) {
          await sendEmail(profile.email, "payment_failed_day6", {
            name: profile.name, first_name: firstName,
          }, client.id);
          // Operator alert
          if (!(await alreadySent("payment_failed_operator_urgent", client.id))) {
            await sendEmail("hello@sitequeen.ai", "payment_failed_operator_urgent", {
              business_name: client.business_name,
              plan: client.plan,
              phone_number: client.phone_number,
            }, client.id);
          }
        }
      }

      // Day 7 — suspend site
      if (daysSinceFail >= 7) {
        if (!(await alreadySent("account_suspended", client.id))) {
          // Suspend the client
          await supabase.from("clients").update({
            subscription_status: "suspended",
            site_status: "suspended",
            suspension_date: now.toISOString(),
          }).eq("id", client.id);

          await sendEmail(profile.email, "account_suspended", {
            name: profile.name, first_name: firstName,
          }, client.id);

          // Operator alert
          await sendEmail("hello@sitequeen.ai", "operator_site_suspended", {
            business_name: client.business_name,
            plan: client.plan,
            phone_number: client.phone_number,
            days_overdue: Math.floor(daysSinceFail),
          }, client.id);
        }
      }
    }

    // ═══════════════════════════════════════════
    // 4. MILESTONE EMAILS (NPS, Testimonial, Anniversary)
    // ═══════════════════════════════════════════
    const { data: liveClients } = await supabase
      .from("clients")
      .select("*")
      .eq("site_status", "live")
      .eq("subscription_status", "active")
      .is("deleted_at", null);

    for (const client of liveClients || []) {
      if (!client.user_id) continue;
      const profile = await getClientEmail(client.user_id);
      if (!profile) continue;
      const firstName = profile.name.split(" ")[0] || "there";

      // NPS survey — 30 days after join
      const daysSinceJoin = (now.getTime() - new Date(client.join_date || client.created_at).getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceJoin >= 30 && daysSinceJoin < 33) {
        if (!(await alreadySent("nps_survey", client.id))) {
          await sendEmail(profile.email, "nps_survey", {
            name: profile.name, first_name: firstName, business_name: client.business_name,
          }, client.id);
        }
      }

      // Testimonial request — 33 days
      if (daysSinceJoin >= 33 && daysSinceJoin < 40) {
        if (!(await alreadySent("testimonial_request", client.id))) {
          await sendEmail(profile.email, "testimonial_request", {
            name: profile.name, first_name: firstName, business_name: client.business_name,
          }, client.id);
        }
      }

      // Anniversary — 11 months 21 days (355 days)
      if (daysSinceJoin >= 355 && daysSinceJoin < 365) {
        if (!(await alreadySent("anniversary", client.id))) {
          // Add 20 bonus credits
          const newBalance = (client.credits_balance || 0) + 20;
          await supabase.from("clients").update({ credits_balance: newBalance }).eq("id", client.id);
          await supabase.from("credits_transactions").insert({
            client_id: client.id,
            transaction_type: "anniversary_bonus",
            credits_amount: 20,
            credits_balance_after: newBalance,
            description: "12-month anniversary bonus — 20 credits",
          });

          await sendEmail(profile.email, "anniversary", {
            name: profile.name, first_name: firstName, business_name: client.business_name,
          }, client.id);
        }
      }
    }

    // ═══════════════════════════════════════════
    // 5. LOW CREDITS WARNING
    // ═══════════════════════════════════════════
    const { data: lowCreditClients } = await supabase
      .from("clients")
      .select("*")
      .lt("credits_balance", 5)
      .gt("credits_balance", 0)
      .eq("subscription_status", "active")
      .is("deleted_at", null);

    for (const client of lowCreditClients || []) {
      if (!client.user_id) continue;

      // Only send once per month — check emails_log for this month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: recentWarning } = await supabase
        .from("emails_log")
        .select("id")
        .eq("email_type", "low_credits_warning")
        .eq("client_id", client.id)
        .gte("created_at", startOfMonth)
        .limit(1);
      if (recentWarning?.length) continue;

      const profile = await getClientEmail(client.user_id);
      if (!profile) continue;

      await sendEmail(profile.email, "low_credits_warning", {
        name: profile.name, first_name: profile.name.split(" ")[0],
        credits_balance: client.credits_balance,
      }, client.id);
    }

    // ═══════════════════════════════════════════
    // 6. MONTHLY MAINTENANCE EMAIL (1st of month)
    // ═══════════════════════════════════════════
    if (now.getDate() === 1) {
      const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
      for (const client of liveClients || []) {
        if (!client.user_id) continue;
        // Check if already sent this month
        const { data: sent } = await supabase
          .from("emails_log")
          .select("id")
          .eq("email_type", "monthly_maintenance")
          .eq("client_id", client.id)
          .gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
          .limit(1);
        if (sent?.length) continue;

        const profile = await getClientEmail(client.user_id);
        if (!profile) continue;

        await sendEmail(profile.email, "monthly_maintenance", {
          name: profile.name, first_name: profile.name.split(" ")[0],
          business_name: client.business_name,
        }, client.id);
      }
    }

    // ═══════════════════════════════════════════
    // 7. WIN-BACK (30 days after cancellation)
    // ═══════════════════════════════════════════
    const { data: cancelledClients } = await supabase
      .from("clients")
      .select("*")
      .eq("subscription_status", "cancelled")
      .is("deleted_at", null);

    for (const client of cancelledClients || []) {
      if (!client.user_id || !client.suspension_date) continue;
      const daysSinceCancel = (now.getTime() - new Date(client.suspension_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCancel >= 30 && daysSinceCancel < 37) {
        if (!(await alreadySent("win_back", client.id))) {
          const profile = await getClientEmail(client.user_id);
          if (!profile) continue;
          await sendEmail(profile.email, "win_back", {
            name: profile.name, first_name: profile.name.split(" ")[0],
            business_name: client.business_name,
          }, client.id);
        }
      }
    }

    // ═══════════════════════════════════════════
    // 8. PAUSE ENDING REMINDER (7 days before pause ends)
    // — Placeholder: requires pause_ends_at column on clients
    // ═══════════════════════════════════════════

    return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("daily-checks error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
