import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";

const PAGE_MAP: Record<string, string> = {
  homepage: "index.html",
  about: "about.html",
  services: "services.html",
  contact: "contact.html",
};
const ALL_PAGE_FILES = Object.values(PAGE_MAP);

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

function detectChangeType(instruction: string): string {
  const lower = instruction.toLowerCase();
  if (lower.match(/color|navy|red|gold|blue|green|font|css|style|background|#[0-9a-f]{3,6}/i)) {
    return "css_variable";
  }
  if (lower.match(/headline|title|text|copy|wording|say|change.*to|replace|update.*section|about|tagline/i)) {
    return "copy";
  }
  if (lower.match(/remove|hide|delete|add|move|section|show|footer|header|nav/i)) {
    return "section";
  }
  return "general";
}

function buildPrompt(instruction: string, changeType: string, currentHtml: string) {
  const systemPrompt = `You are a precise HTML editor for SiteQueen websites.
You make ONLY the specific changes requested — nothing else.
Return ONLY raw complete HTML. No markdown, no explanation, no code blocks.`;

  const userPrompt = `
CHANGE TYPE: ${changeType}
INSTRUCTION: ${instruction}

${changeType === "css_variable" ? `
IMPORTANT: This is a CSS variable change. Find the :root { } block and update the relevant CSS variable there.
Do NOT change individual element styles — only update the CSS variable in :root.
All elements using that variable will update automatically.
Example: changing navy → find "--navy: #0d1d3b" and change the hex value.
` : ""}

${changeType === "copy" ? `
IMPORTANT: This is a copy/text change. Find the specific text mentioned and update only that text.
Do not change any CSS, structure, or other copy.
` : ""}

${changeType === "section" ? `
IMPORTANT: This is a section change. Find the specific HTML section and modify only that section.
Keep all CSS, other sections, and scripts exactly as they are.
` : ""}

RULES:
- Make ONLY the requested change
- Do not change anything else
- Keep all CSS classes and IDs exactly as they are
- Keep the analytics script intact
- Keep all href and src attributes intact unless specifically asked to change them
- Return the complete updated HTML

CURRENT HTML:
${currentHtml}`;

  return { systemPrompt, userPrompt };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function runInBackground(task: Promise<unknown>) {
  // @ts-ignore — EdgeRuntime is available in Supabase Edge runtime
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    (EdgeRuntime as any).waitUntil(task);
    return;
  }
  task.catch((e) => console.error("[quick-edit] background task failed:", e));
}

async function updateJob(supabase: any, jobId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("quick_edit_jobs").update(patch).eq("id", jobId);
  if (error) console.error(`[quick-edit] failed to update job ${jobId}:`, error);
}

async function processQuickEditJob(params: {
  supabase: any;
  anthropicKey: string;
  jobId: string;
  clientId: string;
  instruction: string;
  pages: string;
  callerId: string;
  operatorEmail: string | null;
}) {
  const { supabase, anthropicKey, jobId, clientId, instruction, pages, callerId, operatorEmail } = params;

  try {
    await updateJob(supabase, jobId, { status: "processing", started_at: new Date().toISOString() });

    const changeType = detectChangeType(instruction);

    // Determine which files to edit. CSS variable changes always cascade to all pages.
    let filesToEdit: string[];
    if (pages === "all" || changeType === "css_variable") {
      filesToEdit = [...ALL_PAGE_FILES];
    } else {
      const file = PAGE_MAP[pages];
      if (!file) throw new Error(`Invalid page: ${pages}`);
      filesToEdit = [file];
    }

    await updateJob(supabase, jobId, { change_type: changeType });

    // ─── Versioning: snapshot every existing deploy file before editing (parallel) ──
    const versionTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filesSaved: string[] = [];
    await Promise.all(ALL_PAGE_FILES.map(async (fname) => {
      const { data: existing } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${fname}`);
      if (!existing) return;
      const bytes = new Uint8Array(await existing.arrayBuffer());
      const { error: snapErr } = await supabase.storage
        .from("generated-sites")
        .upload(
          `${clientId}/versions/${versionTimestamp}/${fname}`,
          new Blob([bytes], { type: "text/html" }),
          { upsert: true, contentType: "text/html" }
        );
      if (snapErr) {
        console.error(`[quick-edit] snapshot failed for ${fname}:`, snapErr);
        return;
      }
      filesSaved.push(fname);
    }));

    if (filesSaved.length === 0) {
      throw new Error("No deployed files found to edit — has the site been generated?");
    }

    await supabase.from("site_versions").insert({
      client_id: clientId,
      timestamp: versionTimestamp,
      instruction,
      files_saved: filesSaved,
      restored: false,
      created_by: callerId,
    });

    // ─── Edit each target file (parallel — keeps total time near a single call) ──
    const editedFiles: string[] = [];
    const skippedFiles: string[] = [];
    let rateLimited = false;

    const editOne = async (pageFile: string): Promise<void> => {
      if (!filesSaved.includes(pageFile)) {
        skippedFiles.push(pageFile);
        return;
      }

      const { data: file, error: dlErr } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${pageFile}`);
      if (dlErr || !file) {
        skippedFiles.push(pageFile);
        return;
      }

      const currentHtml = await file.text();
      const { systemPrompt, userPrompt } = buildPrompt(instruction, changeType, currentHtml);

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          // Sonnet 4 supports up to 64K output tokens. The function must echo the
          // entire HTML file back, so we need headroom for ~65KB index pages plus
          // any growth from the edit. 16K was truncating mid-document, producing
          // output without </html> that the validator (correctly) rejected.
          max_tokens: 64000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (aiRes.status === 429) {
        rateLimited = true;
        throw new Error(`Rate limited on ${pageFile}`);
      }
      if (!aiRes.ok) {
        const txt = await aiRes.text();
        throw new Error(`Anthropic API error ${aiRes.status} on ${pageFile}: ${txt.slice(0, 200)}`);
      }

      const aiJson = await aiRes.json();
      let updatedHtml: string = aiJson?.content?.[0]?.text ?? "";
      if (!updatedHtml) throw new Error(`AI returned empty content for ${pageFile}`);

      updatedHtml = updatedHtml
        .replace(/^```(?:html)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      if (updatedHtml.length < 200 || !/<\/html>/i.test(updatedHtml)) {
        throw new Error(`AI output for ${pageFile} does not look like a complete HTML document`);
      }

      const { error: upErr } = await supabase.storage
        .from("generated-sites")
        .upload(
          `${clientId}/deploy/${pageFile}`,
          new Blob([updatedHtml], { type: "text/html" }),
          { upsert: true, contentType: "text/html" }
        );
      if (upErr) throw new Error(`Storage upload failed for ${pageFile}: ${upErr.message}`);

      // Push to Hostinger staging in the background so a slow mirror does not hold the job open.
      runInBackground((async () => {
        try {
          const stagingHtml = injectNoindex(updatedHtml);
          await uploadFileToHostingerFtp(
            `/public_html/${clientId}/${pageFile}`,
            stagingHtml,
          );
        } catch (e: any) {
          console.error(`[quick-edit] Hostinger staging push error for ${pageFile}:`, e);
        }
      })());

      editedFiles.push(pageFile);
    };

    const results = await Promise.allSettled(filesToEdit.map(editOne));

    if (rateLimited) {
      await logEdit(supabase, clientId, callerId, operatorEmail,
        `[${pages}] ${instruction}`, "failed", "Rate limited (429)");
      await updateJob(supabase, jobId, {
        status: "failed",
        error_message: "Rate limited — please wait a moment and try again.",
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failures.length > 0 && editedFiles.length === 0) {
      throw new Error(failures.map((f) => (f.reason as any)?.message ?? String(f.reason)).join("; "));
    }

    // Update sites metadata
    await supabase
      .from("sites")
      .update({
        last_updated: new Date().toISOString(),
        operator_edit_count:
          ((await supabase.from("sites").select("operator_edit_count").eq("client_id", clientId).maybeSingle())
            .data?.operator_edit_count ?? 0) + 1,
      } as any)
      .eq("client_id", clientId);

    await logEdit(
      supabase, clientId, callerId, operatorEmail,
      `[${pages}, ${changeType}] ${instruction}`, "completed", null
    );

    await updateJob(supabase, jobId, {
      status: "completed",
      change_type: changeType,
      version_timestamp: versionTimestamp,
      edited_files: editedFiles,
      skipped_files: skippedFiles,
      error_message: failures.length > 0
        ? failures.map((f) => (f.reason as any)?.message ?? String(f.reason)).join("; ")
        : null,
      completed_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("quick-edit-html background error:", e);
    await logEdit(supabase, clientId, callerId, operatorEmail,
      `[${pages}] ${instruction}`, "failed", e.message ?? String(e));
    await updateJob(supabase, jobId, {
      status: "failed",
      error_message: e.message ?? String(e),
      completed_at: new Date().toISOString(),
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!anthropicKey) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !caller) {
    return json({ error: "Invalid token" }, 401);
  }

  // Verify caller is operator (admin or partner)
  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    supabase.from("profiles").select("role, email").eq("user_id", caller.id).maybeSingle(),
  ]);
  const isOperator = !!roleRow || profileRow?.role === "partner" || profileRow?.role === "admin";
  if (!isOperator) {
    return json({ error: "Operator access required" }, 403);
  }

  try {
    const body = await req.json();
    const clientId = (body.client_id || "").toString().trim();
    const instruction = (body.instruction || "").toString().trim();
    const pages = (body.pages || "homepage").toString().trim().toLowerCase();

    if (!clientId || !instruction) {
      return json({ error: "client_id and instruction required" }, 400);
    }
    if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) {
      return json({ error: "Invalid client_id" }, 400);
    }
    if (instruction.length > 4000) {
      return json({ error: "Instruction too long (max 4000 chars)" }, 400);
    }
    if (pages !== "all" && !PAGE_MAP[pages]) {
      return json({ error: `Invalid page: ${pages}` }, 400);
    }

    const operatorEmail = profileRow?.email ?? caller.email ?? null;
    const { data: job, error: jobErr } = await supabase
      .from("quick_edit_jobs")
      .insert({
        client_id: clientId,
        operator_id: caller.id,
        operator_email: operatorEmail,
        instruction,
        pages,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job?.id) {
      throw new Error(jobErr?.message || "Unable to queue quick edit job");
    }

    runInBackground(processQuickEditJob({
      supabase,
      anthropicKey,
      jobId: job.id,
      clientId,
      instruction,
      pages,
      callerId: caller.id,
      operatorEmail,
    }));

    return json({ success: true, queued: true, job_id: job.id, status: "pending" });
  } catch (e: any) {
    console.error("quick-edit-html error:", e);
    return json({ error: e.message ?? "Unknown error" }, 500);
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
