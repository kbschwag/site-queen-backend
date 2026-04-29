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
  // Section removal takes priority — it's a destructive structural edit.
  if (lower.match(/\b(remove|delete|hide|get rid of|take out|drop)\b/)) {
    return "section_removal";
  }
  if (lower.match(/color|navy|red|gold|blue|green|font|css|style|background|#[0-9a-f]{3,6}/i)) {
    return "css_variable";
  }
  if (lower.match(/headline|title|text|copy|wording|say|change.*to|replace|update.*section|about|tagline/i)) {
    return "copy";
  }
  if (lower.match(/add|move|section|show|footer|header|nav/i)) {
    return "section";
  }
  return "general";
}

const SECTION_KEYWORDS = [
  "hero","footer","header","nav","navigation","about","service","services",
  "contact","testimonial","testimonials","review","reviews","pricing","cta",
  "gallery","faq","financing","awards","team","stats","features","portfolio",
  "process","banner",
];

function extractSectionKeywords(instruction: string): string[] {
  const lower = instruction.toLowerCase();
  const found = SECTION_KEYWORDS.filter((k) => new RegExp(`\\b${k}\\b`, "i").test(lower));
  // Also pull any quoted phrase as a keyword.
  const quoted = instruction.match(/["']([^"']{2,40})["']/g);
  if (quoted) found.push(...quoted.map((q) => q.replace(/["']/g, "").toLowerCase()));
  return Array.from(new Set(found));
}

/**
 * Find the full <section>…</section> (or <header>/<footer>/<nav>) block whose
 * markup or inner text contains any of the given keywords. Returns the exact
 * substring suitable for use as a patch `find` value.
 */
function findSectionBlock(html: string, keywords: string[]): string | null {
  if (keywords.length === 0) return null;
  const tagRe = /<(section|header|footer|nav|aside)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const start = m.index;
    // Find matching close tag (sections rarely nest in our generated sites).
    const closeRe = new RegExp(`</${tag}>`, "i");
    closeRe.lastIndex = m.index + m[0].length;
    const rest = html.slice(m.index + m[0].length);
    const closeMatch = rest.match(closeRe);
    if (!closeMatch || closeMatch.index === undefined) continue;
    const end = m.index + m[0].length + closeMatch.index + closeMatch[0].length;
    const block = html.slice(start, end);
    const blockLower = block.toLowerCase();
    if (keywords.some((k) => blockLower.includes(k))) {
      return block;
    }
  }
  return null;
}

/**
 * Extract a small, focused excerpt of the HTML that's relevant to the
 * requested change. Keeping the excerpt small means Claude only ever
 * needs to return a tiny JSON patch — no truncation, no large outputs.
 */
function extractExcerpt(html: string, instruction: string, changeType: string): string {
  if (changeType === "css_variable") {
    const rootMatch = html.match(/:root\s*\{[\s\S]*?\}/);
    if (rootMatch) return rootMatch[0];
  }

  if (changeType === "section_removal") {
    const block = findSectionBlock(html, extractSectionKeywords(instruction));
    if (block) return block;
  }

  if (changeType === "copy") {
    const quoted = instruction.match(/["']([^"']{3,})["']/);
    const needle = quoted?.[1];
    if (needle) {
      const idx = html.indexOf(needle);
      if (idx >= 0) {
        const before = html.lastIndexOf("<section", idx);
        const afterStart = html.indexOf("</section>", idx);
        if (before >= 0 && afterStart >= 0 && afterStart - before < 8000) {
          return html.slice(before, afterStart + "</section>".length);
        }
        const start = Math.max(0, idx - 1500);
        const end = Math.min(html.length, idx + needle.length + 1500);
        return html.slice(start, end);
      }
    }
  }

  if (changeType === "section") {
    const block = findSectionBlock(html, extractSectionKeywords(instruction));
    if (block) return block;
  }

  const lines = html.split("\n");
  if (lines.length <= 250) return html;
  return [
    ...lines.slice(0, 200),
    "\n<!-- … HTML omitted … -->\n",
    ...lines.slice(-50),
  ].join("\n");
}

function buildPatchPrompt(instruction: string, changeType: string, excerpt: string) {
  const systemPrompt = `You are a precise HTML editor that returns surgical find/replace patches.
Return ONLY a single JSON object — no markdown, no code fences, no explanation.`;

  const userPrompt = `You are editing a specific part of a website HTML file.

CHANGE REQUESTED: ${instruction}
CHANGE TYPE: ${changeType}

RELEVANT HTML EXCERPT:
${excerpt}

Return a JSON object with exactly this structure:
{
  "find": "the exact string to find in the original HTML (must be unique)",
  "replace": "the replacement string"
}

Rules:
- "find" must be an exact match to text in the excerpt — copy it character for character (including whitespace).
- "find" must be unique enough to identify exactly one location in the full HTML file.
- "replace" is the corrected version with ONLY the requested change applied.
- Keep the patch as small as possible — do not include unchanged surrounding context unless required for uniqueness.
- Return ONLY the JSON object. No explanation. No markdown. No code fences.`;

  return { systemPrompt, userPrompt };
}

interface Patch { find: string; replace: string; }

function parsePatch(raw: string): Patch {
  let txt = raw.trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  // Find the first {...} block.
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start >= 0 && end > start) txt = txt.slice(start, end + 1);
  const obj = JSON.parse(txt);
  if (typeof obj?.find !== "string" || typeof obj?.replace !== "string") {
    throw new Error("Patch JSON missing find/replace strings");
  }
  return { find: obj.find, replace: obj.replace };
}

function applyPatch(html: string, patch: Patch, changeType: string): string {
  const occurrences = html.split(patch.find).length - 1;
  if (occurrences === 0) {
    throw new Error(`Patch target not found in HTML — find string did not match (find length=${patch.find.length})`);
  }
  if (occurrences > 1) {
    throw new Error(`Patch target ambiguous — found ${occurrences} matches; AI must return a more unique 'find' string`);
  }
  const updated = html.replace(patch.find, patch.replace);
  const delta = Math.abs(updated.length - html.length);
  // Sanity bounds: copy/CSS edits should be small. Section edits/removals can be larger.
  const maxDelta =
    changeType === "section_removal" ? 50000 :
    changeType === "section" ? 20000 :
    2000;
  if (delta > maxDelta) {
    throw new Error(`Patch size out of bounds (${delta} chars changed, max ${maxDelta} for ${changeType})`);
  }
  return updated;
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

    // ─── Compute the patch ONCE from a representative file, then apply ──
    const editedFiles: string[] = [];
    const skippedFiles: string[] = [];
    let rateLimited = false;

    // Pick a "primary" file to ask Claude about. Prefer index.html if present.
    const primaryFile = filesToEdit.find((f) => filesSaved.includes(f) && f === "index.html")
      ?? filesToEdit.find((f) => filesSaved.includes(f));
    if (!primaryFile) {
      throw new Error("None of the requested pages have a deployed file to edit");
    }

    const { data: primaryFileData, error: primaryDlErr } = await supabase.storage
      .from("generated-sites")
      .download(`${clientId}/deploy/${primaryFile}`);
    if (primaryDlErr || !primaryFileData) {
      throw new Error(`Could not download primary file ${primaryFile}: ${primaryDlErr?.message}`);
    }
    const primaryHtml = await primaryFileData.text();

    let patch: Patch;

    if (changeType === "section_removal") {
      // Deterministic: locate the full <section>…</section> block ourselves
      // and delete it. No AI round-trip needed — and no risk of the model
      // returning a partial block that leaves orphan markup behind.
      const keywords = extractSectionKeywords(instruction);
      if (keywords.length === 0) {
        throw new Error("Section removal requested but no recognizable section keyword found in instruction");
      }
      const block = findSectionBlock(primaryHtml, keywords);
      if (!block) {
        throw new Error(`No <section> matching keywords [${keywords.join(", ")}] found in ${primaryFile}`);
      }
      patch = { find: block, replace: "" };
      console.log(`[quick-edit] section_removal: deterministic patch, removing ${block.length} chars (keywords=${keywords.join(",")})`);
    } else {
      const excerpt = extractExcerpt(primaryHtml, instruction, changeType);
      const { systemPrompt, userPrompt } = buildPatchPrompt(instruction, changeType, excerpt);

      console.log(`[quick-edit] computing patch from ${primaryFile} (excerpt=${excerpt.length} chars, full=${primaryHtml.length} chars, type=${changeType})`);

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (aiRes.status === 429) {
        rateLimited = true;
      } else if (!aiRes.ok) {
        const txt = await aiRes.text();
        throw new Error(`Anthropic API error ${aiRes.status}: ${txt.slice(0, 300)}`);
      }

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

      const aiJson = await aiRes.json();
      const rawText: string = aiJson?.content?.[0]?.text ?? "";
      const stopReason = aiJson?.stop_reason;
      const usage = aiJson?.usage;
      console.log(`[quick-edit] patch response: stop=${stopReason}, out_tokens=${usage?.output_tokens}, len=${rawText.length}`);

      if (!rawText) throw new Error(`AI returned empty patch (stop=${stopReason})`);

      patch = parsePatch(rawText);
      console.log(`[quick-edit] patch find=${patch.find.length} chars, replace=${patch.replace.length} chars`);
    }

    // Apply the same patch to every target file. CSS variables and shared
    // markup (nav/footer) cascade naturally across pages this way.
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

      // Patch target may not exist on every page (e.g. hero only on homepage).
      if (!currentHtml.includes(patch.find)) {
        console.log(`[quick-edit] ${pageFile}: patch target not present, skipping`);
        skippedFiles.push(pageFile);
        return;
      }

      const updatedHtml = applyPatch(currentHtml, patch, changeType);

      const { error: upErr } = await supabase.storage
        .from("generated-sites")
        .upload(
          `${clientId}/deploy/${pageFile}`,
          new Blob([updatedHtml], { type: "text/html" }),
          { upsert: true, contentType: "text/html" }
        );
      if (upErr) throw new Error(`Storage upload failed for ${pageFile}: ${upErr.message}`);

      // Push to Hostinger staging in the background.
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
