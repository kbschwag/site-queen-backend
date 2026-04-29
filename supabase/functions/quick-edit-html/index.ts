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

/**
 * Tiered change-type detection.
 *   additive        — adding new content (card, item, link) → AI given pattern as template
 *   section_removal — remove/hide a section → deterministic block delete
 *   css_variable    — color/font/spacing tweaks → deterministic :root edit
 *   copy            — small text/copy tweak → AI on a small excerpt
 *   section         — restructure/rewrite a section → AI on the full section
 */
function detectChangeType(instruction: string): string {
  const lower = instruction.toLowerCase();

  // Additive — must be checked FIRST before section/copy.
  if (/\b(add|include|insert|create|put in|append)\b/.test(lower)) {
    return "additive";
  }

  // Destructive structural edit.
  if (/\b(remove|delete|hide|get rid of|take out|drop)\b/.test(lower)) {
    return "section_removal";
  }

  // CSS variable / color / font / spacing tweaks.
  if (
    /#[0-9a-f]{3,8}\b/i.test(instruction) ||
    /\brgb\s*\(/i.test(instruction) ||
    /\b(color|colour|font|font-family|font size|spacing|padding|margin|radius|border|background|css|style)\b/i.test(lower) ||
    /\b(navy|crimson|gold|teal|sage|maroon|beige|charcoal|red|blue|green)\b/i.test(lower)
  ) {
    return "css_variable";
  }

  // Clearly section-scale work.
  if (/\b(rewrite|redo|restructure|redesign|replace the entire)\b/i.test(lower)) {
    return "section";
  }

  // Small copy/text edits.
  if (/\b(headline|title|tagline|heading|text|copy|wording|phrase|word|say|change|update|fix|rename|rephrase|capitalize|punctuation|spelling|typo|phone|email|address|hours)\b/i.test(lower)) {
    return "copy";
  }

  return "section";
}

// ─── Type 1: deterministic CSS variable edit ────────────────────────────────

/** Common natural-language → CSS custom property name aliases. */
const CSS_VAR_ALIASES: Record<string, string[]> = {
  primary: ["--primary", "--color-primary", "--brand", "--brand-color", "--accent"],
  secondary: ["--secondary", "--color-secondary"],
  accent: ["--accent", "--accent-color"],
  background: ["--background", "--bg", "--bg-color", "--color-bg"],
  text: ["--text", "--text-color", "--foreground", "--color-text"],
  navy: ["--navy", "--primary", "--brand"],
  gold: ["--gold", "--accent"],
  font: ["--font", "--font-family", "--font-body", "--font-heading"],
};

/** Pull a hex/rgb/named color value out of the instruction. */
function extractColorValue(instruction: string): string | null {
  const hex = instruction.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hex) return hex[0];
  const rgb = instruction.match(/rgba?\s*\([^)]+\)/i);
  if (rgb) return rgb[0];
  return null;
}

/** Try to deterministically apply a CSS-variable change. Returns updated HTML or null. */
function applyCssVariableEdit(
  html: string,
  instruction: string,
): { updated: string; varName: string; oldValue: string; newValue: string } | null {
  const rootMatch = html.match(/(:root\s*\{)([\s\S]*?)(\})/);
  if (!rootMatch) return null;
  const rootBlock = rootMatch[0];
  const rootBody = rootMatch[2];

  const newValue = extractColorValue(instruction);
  if (!newValue) return null;

  // Try to identify the target variable via aliases or any name in :root mentioned in the instruction.
  const lower = instruction.toLowerCase();

  // Collect all defined vars in :root.
  const definedVars = Array.from(rootBody.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi))
    .map((m) => ({ name: m[1], value: m[2].trim() }));
  if (definedVars.length === 0) return null;

  // 1. Direct mention of a var name (e.g. "set --primary to #001a4d").
  let target = definedVars.find((v) => lower.includes(v.name.toLowerCase()));

  // 2. Alias mention (e.g. "make the primary color …", "navy to …").
  if (!target) {
    for (const [alias, candidates] of Object.entries(CSS_VAR_ALIASES)) {
      if (new RegExp(`\\b${alias}\\b`, "i").test(lower)) {
        target = definedVars.find((v) => candidates.includes(v.name));
        if (target) break;
      }
    }
  }

  if (!target) return null;

  // Replace just this declaration inside the :root block — must be unique.
  const declRe = new RegExp(
    `(${target.name.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`,
  );
  const newRootBlock = rootBlock.replace(declRe, `$1${newValue}$3`);
  if (newRootBlock === rootBlock) return null;

  const updated = html.replace(rootBlock, newRootBlock);
  return {
    updated,
    varName: target.name,
    oldValue: target.value,
    newValue,
  };
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
 * Extract a focused excerpt of the HTML for AI editing.
 *   copy    → small ~80-line window around the relevant text/keyword
 *   section → the full <section>…</section> containing the relevant keywords
 * The excerpt itself becomes the `find` string for splicing.
 */
function extractExcerpt(html: string, instruction: string, changeType: string): string {
  if (changeType === "copy") {
    const quoted = instruction.match(/["']([^"']{3,})["']/);
    const needle = quoted?.[1];
    if (needle) {
      const idx = html.indexOf(needle);
      if (idx >= 0) {
        const start = Math.max(0, idx - 1500);
        const end = Math.min(html.length, idx + needle.length + 1500);
        const slice = html.slice(start, end);
        if (occurrencesOf(html, slice) === 1) return slice;
      }
    }
    const keyword = pickFirstKeyword(instruction);
    if (keyword) {
      const idx = html.toLowerCase().indexOf(keyword.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 1200);
        const end = Math.min(html.length, idx + 1200);
        const slice = html.slice(start, end);
        if (occurrencesOf(html, slice) === 1) return slice;
      }
    }
    const block = findSectionBlock(html, extractSectionKeywords(instruction));
    if (block) return block;
  }

  if (changeType === "section") {
    const block = findSectionBlock(html, extractSectionKeywords(instruction));
    if (block) return block;
  }

  // Last-resort head+tail summary (rarely used now Types 1/2 short-circuit).
  const lines = html.split("\n");
  if (lines.length <= 250) return html;
  return [
    ...lines.slice(0, 200),
    "\n<!-- … HTML omitted … -->\n",
    ...lines.slice(-50),
  ].join("\n");
}

function occurrencesOf(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function pickFirstKeyword(instruction: string): string | null {
  const stop = new Set([
    "the","and","for","with","into","change","update","make","fix","please","to","a","an",
    "remove","delete","hide","section","page","site","website","add","new","copy","text","headline",
    "this","that","from","tagline","title","heading",
  ]);
  const tokens = instruction
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !stop.has(t));
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0] || null;
}

/**
 * The AI returns the rewritten snippet directly; the server splices it back in
 * by replacing the original excerpt. Minimal tokens, no JSON parsing failure mode.
 */
function buildExcerptPrompt(instruction: string, changeType: string, excerpt: string) {
  const systemPrompt = `You are a precise HTML editor. You receive a snippet of HTML from a larger page and a change request.
Return ONLY the updated snippet — same boundaries as the input — with the requested change applied.
No markdown, no code fences, no commentary. Raw HTML only.`;

  const userPrompt = `CHANGE REQUESTED: ${instruction}
CHANGE TYPE: ${changeType}

Return the snippet below with ONLY the requested change applied. Preserve all surrounding markup, classes, attributes, and indentation exactly. Do not modify anything outside the requested change.

ORIGINAL SNIPPET:
${excerpt}

UPDATED SNIPPET:`;

  return { systemPrompt, userPrompt };
}

interface Patch { find: string; replace: string; }

function cleanAiHtml(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function applyPatch(html: string, patch: Patch, changeType: string): string {
  const occurrences = html.split(patch.find).length - 1;
  if (occurrences === 0) {
    throw new Error(`Patch target not found in HTML — find string did not match (find length=${patch.find.length})`);
  }
  if (occurrences > 1) {
    throw new Error(`Patch target ambiguous — found ${occurrences} matches in HTML`);
  }
  const updated = html.replace(patch.find, patch.replace);
  const delta = Math.abs(updated.length - html.length);
  const maxDelta =
    changeType === "section_removal" ? 50000 :
    changeType === "section" ? 30000 :
    changeType === "css_variable" ? 200 :
    3000;
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

    if (changeType === "css_variable") {
      // Type 1 — deterministic. No AI call.
      const result = applyCssVariableEdit(primaryHtml, instruction);
      if (!result) {
        throw new Error(
          "Could not apply CSS variable edit deterministically — " +
          "no matching :root variable found, or no color/value detected in the instruction.",
        );
      }
      const declRe = new RegExp(
        `(${result.varName.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`,
      );
      const declMatch = primaryHtml.match(declRe);
      if (!declMatch) {
        throw new Error(`CSS variable ${result.varName} declaration not found for patching`);
      }
      patch = {
        find: declMatch[0],
        replace: `${declMatch[1]}${result.newValue}${declMatch[3]}`,
      };
      console.log(
        `[quick-edit] css_variable: ${result.varName} ${result.oldValue} → ${result.newValue} (deterministic)`,
      );
    } else if (changeType === "section_removal") {
      // Type 2 — deterministic. No AI call.
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
      // Types 3 & 4 — AI on a focused excerpt. AI returns the rewritten snippet
      // directly; we splice it back by replacing the original excerpt.
      const excerpt = extractExcerpt(primaryHtml, instruction, changeType);
      if (!excerpt || occurrencesOf(primaryHtml, excerpt) !== 1) {
        throw new Error(
          `Could not extract a unique excerpt for ${changeType} edit ` +
          `(excerpt length=${excerpt?.length ?? 0}, occurrences=${occurrencesOf(primaryHtml, excerpt || "")})`,
        );
      }
      const { systemPrompt, userPrompt } = buildExcerptPrompt(instruction, changeType, excerpt);

      console.log(`[quick-edit] AI edit on ${primaryFile} (excerpt=${excerpt.length} chars, full=${primaryHtml.length} chars, type=${changeType})`);

      // Token budget scales with excerpt size — generous cap for Type 4.
      const maxTokens = Math.min(8000, Math.ceil(excerpt.length / 2) + 500);

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
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
      console.log(`[quick-edit] AI response: stop=${stopReason}, out_tokens=${usage?.output_tokens}, len=${rawText.length}`);

      if (!rawText) throw new Error(`AI returned empty response (stop=${stopReason})`);
      if (stopReason && stopReason !== "end_turn" && stopReason !== "stop_sequence") {
        throw new Error(`AI did not finish cleanly (stop=${stopReason}) — snippet may be truncated`);
      }

      const updatedExcerpt = cleanAiHtml(rawText);
      if (!updatedExcerpt) throw new Error("AI returned empty snippet after cleanup");

      patch = { find: excerpt, replace: updatedExcerpt };
      console.log(`[quick-edit] excerpt patch: ${excerpt.length} → ${updatedExcerpt.length} chars`);
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
