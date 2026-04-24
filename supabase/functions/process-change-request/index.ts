import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Inject a noindex meta tag for staging copies pushed to Hostinger.
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

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  {
    const tmpSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error } = await tmpSupabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    const { changeRequestId, change_request_id, client_id } = await req.json();
    const crId = changeRequestId || change_request_id;
    if (!crId) {
      return new Response(JSON.stringify({ error: "changeRequestId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cr, error } = await supabase
      .from("change_requests")
      .select("*")
      .eq("id", crId)
      .single();

    if (error || !cr) {
      return new Response(JSON.stringify({ error: "Change request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = client_id || cr.client_id;

    // Fetch client info
    const { data: clientData } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Check if there's a generated site HTML to modify.
    // Source of truth is the clean copy at deploy/index.html — staging
    // copies live on Hostinger and the legacy root index.html path is no
    // longer maintained.
    let currentHTML = "";
    try {
      const { data: htmlFile } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/index.html`);
      if (htmlFile) currentHTML = await htmlFile.text();
    } catch {
      console.log("No existing site HTML found at deploy/index.html");
    }

    let aiPrompt: string;
    let model: string;

    if (currentHTML) {
      // Has site HTML — try to auto-apply the change
      model = "google/gemini-2.5-flash";
      aiPrompt = `You are processing a website change request for a small business.

The client's request in plain English:
"${cr.request_text}"

Here is their current website HTML:
${currentHTML}

Instructions:
1. Identify exactly what needs to change based on the plain English request
2. Make ONLY that specific change — do not change anything else
3. If the request is simple and clear — make the change
4. If the request is unclear, involves new design work, requires new pages, or is too complex — do not make any changes

Return ONLY a valid JSON object with three fields:
- "status": either "completed" or "needs_review"
- "html": the complete updated HTML (if completed) or the original unchanged HTML (if needs_review)
- "explanation": one sentence describing exactly what was changed, or why it needs manual review

Do not include any explanation, markdown formatting, or code blocks. Return raw JSON only.`;
    } else {
      // No site HTML — just classify
      model = "google/gemini-2.5-flash";
      aiPrompt = `You are a website change request classifier. Analyze the request and determine:
1. complexity: "simple" (text/image swap, color change, minor tweak) or "complex" (layout change, new section, functionality)
2. category: one of "text_change", "image_change", "color_change", "layout_change", "new_feature", "bug_fix", "other"
3. summary: A brief admin-friendly summary of what needs to be done
4. auto_completable: true if the change is trivially simple (e.g., update phone number, fix typo)

Change request: "${cr.request_text}"

Return ONLY a valid JSON object with these four fields. No explanation or markdown.`;
    }

    // Update status to processing
    await supabase
      .from("change_requests")
      .update({ status: "processing" })
      .eq("id", crId);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI error:", aiResponse.status, await aiResponse.text());
      await supabase.from("change_requests").update({
        ai_processed: true,
        status: "needs_review",
        admin_notes: "AI processing failed - needs manual review",
      }).eq("id", crId);
      return new Response(JSON.stringify({ classified: false, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.choices?.[0]?.message?.content || "";

    let result: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON");
      result = JSON.parse(jsonMatch[0]);
    } catch {
      result = { status: "needs_review", explanation: "AI response could not be parsed" };
    }

    if (currentHTML && result.status === "completed" && result.html) {
      // Save updated HTML back to the deploy/ backup folder (clean copy).
      const htmlBlob = new Blob([result.html], { type: "text/html" });
      await supabase.storage
        .from("generated-sites")
        .upload(`${clientId}/deploy/index.html`, htmlBlob, { upsert: true, contentType: "text/html" });

      // Push the updated copy straight to Hostinger staging so the operator
      // and client preview iframes show the change immediately. Skipped if
      // the site is already live — the deploy step below will handle that.
      const hostingerToken = Deno.env.get("HOSTINGER_API_TOKEN");
      if (hostingerToken && clientData?.site_status !== "live") {
        try {
          const stagingHtml = injectNoindex(result.html);
          const r = await fetch("https://api.hostinger.com/v1/hosting/files/upload", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hostingerToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              path: `/public_html/staging/${clientId}/index.html`,
              content: btoa(unescape(encodeURIComponent(stagingHtml))),
            }),
          });
          if (!r.ok) {
            const errText = await r.text();
            console.error(`[process-change-request] staging push failed ${r.status}:`, errText.substring(0, 300));
          }
        } catch (e) {
          console.error("[process-change-request] staging push error:", e);
        }
      }

      await supabase.from("change_requests").update({
        status: "completed",
        ai_processed: true,
        completed_at: new Date().toISOString(),
        admin_notes: result.explanation,
      }).eq("id", crId);

      // Auto-flip stock_photos_replaced when a photo-related change is completed
      const isPhotoChange = (cr.change_type || "").toLowerCase().includes("photo")
        || (cr.request_text || "").toLowerCase().includes("photo")
        || (cr.request_text || "").toLowerCase().includes("image");
      if (isPhotoChange) {
        await supabase
          .from("sites")
          .update({ stock_photos_replaced: true } as any)
          .eq("client_id", clientId);
      }

      // Update usage
      if (clientData) {
        await supabase.from("clients").update({
          updates_used_this_month: (clientData.updates_used_this_month || 0) + 1,
        }).eq("id", clientId);
      }

      // Notify client
      await supabase.from("notifications").insert({
        type: "change_request_completed",
        client_id: clientId,
        message: `Your change request has been completed ♛ — ${result.explanation}`,
        target_role: "client",
      });

      // Auto redeploy to Hostinger if site is live
      if (clientData?.site_status === "live" && clientData?.deployment_path_confirmed) {
        try {
          const deployResponse = await fetch(
            `${supabaseUrl}/functions/v1/deploy-to-hostinger`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ client_id: clientId }),
            }
          );

          if (!deployResponse.ok) {
            await supabase.from("notifications").insert({
              type: "redeployment_failed",
              client_id: clientId,
              message: `Change completed but redeployment to Hostinger failed — manual push needed for ${clientData?.business_name}`,
              target_role: "operator",
            });
          }
        } catch (deployErr) {
          console.error("Auto-redeploy failed:", deployErr);
          await supabase.from("notifications").insert({
            type: "redeployment_failed",
            client_id: clientId,
            message: `Change completed but redeployment failed — manual push needed for ${clientData?.business_name}`,
            target_role: "operator",
          });
        }
      }

    } else if (currentHTML) {
      // Needs manual review
      await supabase.from("change_requests").update({
        status: "needs_review",
        ai_processed: false,
        admin_notes: result.explanation || "Needs manual review",
      }).eq("id", crId);

      await supabase.from("notifications").insert({
        type: "change_request_needs_review",
        client_id: clientId,
        message: `Change request needs manual review — ${clientData?.business_name}: ${result.explanation}`,
        target_role: "operator",
      });

    } else {
      // Classification only (no site HTML)
      const classification = result;
      const updateData: Record<string, unknown> = {
        ai_processed: true,
        admin_notes: `[AI] ${(classification.complexity || "unknown").toUpperCase()} | ${classification.category || "other"} | ${classification.summary || "Needs review"}`,
      };

      if (classification.auto_completable) {
        updateData.status = "completed";
        updateData.completed_at = new Date().toISOString();
      } else if (classification.complexity === "simple") {
        updateData.status = "in_progress";
      }

      await supabase.from("change_requests").update(updateData).eq("id", crId);

      if (clientData) {
        await supabase.from("clients").update({
          updates_used_this_month: (clientData.updates_used_this_month || 0) + 1,
        }).eq("id", clientId);
      }
    }

    return new Response(JSON.stringify({ success: true, status: result.status || "classified" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-change-request error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
