import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";

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
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  if (!lovableKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify caller is operator (admin or partner)
  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    supabase.from("profiles").select("role, email").eq("user_id", caller.id).maybeSingle(),
  ]);
  const isOperator = !!roleRow || profileRow?.role === "partner" || profileRow?.role === "admin";
  if (!isOperator) {
    return new Response(JSON.stringify({ error: "Operator access required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let clientId: string | null = null;
  let instruction = "";

  try {
    const body = await req.json();
    clientId = body.client_id;
    instruction = (body.instruction || "").toString().trim();

    if (!clientId || !instruction) {
      return new Response(JSON.stringify({ error: "client_id and instruction required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (instruction.length > 4000) {
      return new Response(JSON.stringify({ error: "Instruction too long (max 4000 chars)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download current clean HTML from the deploy backup folder.
    // (Staging copies live on Hostinger; deploy/ is the source of truth.)
    const { data: file, error: dlErr } = await supabase.storage
      .from("generated-sites")
      .download(`${clientId}/deploy/index.html`);
    if (dlErr || !file) throw new Error("Could not load site HTML — has the site been generated?");

    const currentHtml = await file.text();

    // Call Lovable AI Gateway
    const aiPrompt = `You are editing an existing website HTML file. Here is the current HTML:

${currentHtml}

Make ONLY these specific changes:
${instruction}

Rules:
- Only change what was explicitly requested
- Do not change anything else including structure, other sections, or styling
- Keep all {{PLACEHOLDER}} values that haven't been filled yet intact
- Keep the SiteQueen analytics script intact
- Return ONLY the complete updated HTML — no explanation, no markdown, just the raw HTML`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a precise HTML editor. Return only raw HTML, no markdown fences." },
          { role: "user", content: aiPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      await logEdit(supabase, clientId!, caller.id, profileRow?.email ?? caller.email ?? null, instruction, "failed", "Rate limited (429)");
      return new Response(JSON.stringify({ error: "Rate limited — please wait a moment and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      await logEdit(supabase, clientId!, caller.id, profileRow?.email ?? caller.email ?? null, instruction, "failed", "Credits exhausted (402)");
      return new Response(JSON.stringify({ error: "AI credits exhausted — top up Lovable AI usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      throw new Error(`AI gateway error ${aiRes.status}: ${txt.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    let updatedHtml: string = aiJson?.choices?.[0]?.message?.content ?? "";
    if (!updatedHtml) throw new Error("AI returned empty content");

    // Strip any accidental markdown fences
    updatedHtml = updatedHtml
      .replace(/^```(?:html)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    if (updatedHtml.length < 200 || !/<\/html>/i.test(updatedHtml)) {
      throw new Error("AI output does not look like a complete HTML document");
    }

    // 1) Save clean copy back to the deploy backup folder
    const { error: upErr } = await supabase.storage
      .from("generated-sites")
      .upload(`${clientId}/deploy/index.html`, new Blob([updatedHtml], { type: "text/html" }), {
        upsert: true,
        contentType: "text/html",
      });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    // 2) Push staging copy (with noindex) straight to Hostinger so the
    //    operator + client preview iframes show the change immediately.
    try {
      const stagingHtml = injectNoindex(updatedHtml);
      await uploadFileToHostingerFtp(
        `/public_html/${clientId}/index.html`,
        stagingHtml,
      );
    } catch (e: any) {
      console.error("[quick-edit] Hostinger staging push error:", e);
    }

    // Update sites metadata
    await supabase
      .from("sites")
      .update({
        last_updated: new Date().toISOString(),
        operator_edit_count: ((await supabase.from("sites").select("operator_edit_count").eq("client_id", clientId!).maybeSingle()).data?.operator_edit_count ?? 0) + 1,
      } as any)
      .eq("client_id", clientId!);


    // Log edit
    await logEdit(supabase, clientId!, caller.id, profileRow?.email ?? caller.email ?? null, instruction, "completed", null);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("quick-edit-html error:", e);
    if (clientId) {
      await logEdit(supabase, clientId, caller.id, caller.email ?? null, instruction, "failed", e.message ?? String(e));
    }
    return new Response(JSON.stringify({ error: e.message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logEdit(
  supabase: any,
  clientId: string,
  operatorId: string,
  operatorEmail: string | null,
  instruction: string,
  status: string,
  errorMessage: string | null,
) {
  try {
    await supabase.from("operator_edits").insert({
      client_id: clientId,
      operator_id: operatorId,
      operator_email: operatorEmail,
      instruction,
      status,
      model_used: MODEL,
      error_message: errorMessage,
    });
  } catch (e) {
    console.error("Failed to log operator edit:", e);
  }
}
