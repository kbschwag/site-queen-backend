// operator-chat: streaming chat endpoint that lets operators talk to Claude
// with tool use to read/write/deploy client site files.
//
// Streams SSE events back to the browser:
//   { type: "chat_created", chat_id }
//   { type: "text_delta", text }
//   { type: "tool_use_started", tool_name, tool_input, message_id }
//   { type: "tool_result", message_id, result, success }
//   { type: "turn_summary", message_id, writes, any_failures, staging_url, undo_available, undo_token }
//   { type: "done", stop_reason }
//   { type: "error", error }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";
import { requireUser, requireOperator } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 30;
const MAX_HISTORY_MESSAGES = 60;

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  return html;
}

function pickDistinctiveSubstring(html: string): string | null {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length < 30) return null;
  const words = stripped.split(" ").filter((w) => w.length > 3);
  if (words.length < 8) return null;
  const startIdx = Math.floor(words.length / 3);
  const chunk = words.slice(startIdx, startIdx + 8).join(" ");
  return chunk.length >= 20 ? chunk : null;
}

// ─── Tool definitions for Claude ────────────────────────────────────────────
const TOOLS = [
  {
    name: "read_deployed_file",
    description: "Read the contents of a currently deployed HTML file (e.g. 'index.html', 'about.html'). Use to inspect a page before editing.",
    input_schema: { type: "object", required: ["filename"], properties: { filename: { type: "string" } } },
  },
  {
    name: "list_deployed_files",
    description: "List the filenames currently deployed for this client.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "apply_site_change",
    description: "Primary website-edit tool. Give it the operator's natural-language request and, optionally, a filename. It silently reads the deployed HTML, creates exact targeted edits, writes storage, and pushes staging. Use this for normal website edits instead of rewriting files.",
    input_schema: {
      type: "object",
      required: ["instructions"],
      properties: {
        instructions: { type: "string", description: "The operator's requested website change, in plain English." },
        filename: { type: "string", description: "Optional page to edit, e.g. index.html. Leave blank for sitewide or uncertain changes." },
        files: { type: "array", items: { type: "string" }, description: "Optional specific deployed HTML files to edit." },
      },
    },
  },
  {
    name: "edit_deployed_file",
    description: "Make targeted find-and-replace edits to a deployed HTML file. Pass an array of {find, replace} pairs. Each 'find' string must appear EXACTLY ONCE in the file (include enough surrounding context to make it unique). Use this for almost all edits — much more efficient than rewriting the whole file. Automatically snapshots, writes to storage, AND pushes to staging.",
    input_schema: {
      type: "object",
      required: ["filename", "edits", "change_summary"],
      properties: {
        filename: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            required: ["find", "replace"],
            properties: {
              find: { type: "string", description: "Exact string to find. Must match exactly ONCE in the file. Include surrounding context if the snippet is short." },
              replace: { type: "string", description: "String to replace it with. Pass an empty string to delete." },
            },
          },
        },
        change_summary: { type: "string", description: "Brief description of what changed and why" },
      },
    },
  },

  {
    name: "read_template_file",
    description: "Read a file from the template this client was generated from.",
    input_schema: { type: "object", required: ["filename"], properties: { filename: { type: "string" } } },
  },
  {
    name: "read_intake_field",
    description: "Read a single field from the client intake data.",
    input_schema: { type: "object", required: ["field_name"], properties: { field_name: { type: "string" } } },
  },
  {
    name: "read_full_intake",
    description: "Read the entire client intake data object. Use sparingly.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_intake_field",
    description: "Update a field in the client intake. Verifies the write succeeded.",
    input_schema: {
      type: "object",
      required: ["field_name", "new_value"],
      properties: { field_name: { type: "string" }, new_value: {} },
    },
  },
  {
    name: "list_uploaded_media",
    description: "List uploaded media (photos) for this client. Returns filenames and public URLs.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "push_to_staging",
    description: "Re-push deployed files to Hostinger staging. Normally you don't need this — write_deployed_file already pushes. Use this only to retry a failed push.",
    input_schema: {
      type: "object",
      required: ["files"],
      properties: { files: { type: "array", items: { type: "string" } } },
    },
  },
  {
    name: "list_snapshots",
    description: "List available snapshots for this client, most recent first.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_call_notes",
    description: "Read the discovery / sales-call notes captured for this client (their story, ideal customer, inspiration sites, pages agreed, color direction, vibe/tone, expert additions, things to avoid, exact phrases the owner wants, final notes, internal notes, etc.). Use this whenever you need the operator's actual conversation context with the client before editing copy, choosing tone, or making design decisions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "read_application",
    description: "Read the original application this client submitted (business type, industry, location, socials, ideal customer, goals, restricted niches, anything_else, referral source). Useful background before edits.",
    input_schema: { type: "object", properties: {} },
  },
];

// ─── Tool execution ─────────────────────────────────────────────────────────

interface ToolCtx {
  supabase: any;
  clientId: string;
  client: any;
  site: any;
  anthropicKey: string;
  assistantMessageId: string; // tags snapshots taken during this assistant turn
  writeLog: WriteRecord[]; // collected for the turn_summary
}

interface WriteRecord {
  type: "file_edit" | "intake_update" | "staging_push";
  filename?: string;
  field?: string;
  status: "success" | "partial" | "failed";
  message: string;
  staging_url?: string;
  staging_verified?: boolean;
  staging_error?: string;
}

async function snapshotFileToChatMessage(
  supabase: any,
  clientId: string,
  filename: string,
  messageId: string,
): Promise<string | null> {
  const currentPath = `${clientId}/deploy/${filename}`;
  const { data } = await supabase.storage.from("generated-sites").download(currentPath);
  if (!data) return null; // file doesn't exist yet — nothing to snapshot
  const bytes = new Uint8Array(await data.arrayBuffer());
  const snapshotPath = `${clientId}/versions/chat_${messageId}/${filename}`;
  await supabase.storage
    .from("generated-sites")
    .upload(snapshotPath, new Blob([bytes], { type: "text/html" }), {
      upsert: true,
      contentType: "text/html",
    });
  return snapshotPath;
}

async function recordSnapshotRow(
  supabase: any,
  clientId: string,
  messageId: string,
  filename: string,
  instruction: string,
) {
  // Upsert behavior: append filename to existing row for this message, or create one.
  const { data: existing } = await supabase
    .from("site_versions")
    .select("id, files_saved")
    .eq("client_id", clientId)
    .eq("chat_message_id", messageId)
    .maybeSingle();
  if (existing) {
    const files = Array.from(new Set([...(existing.files_saved || []), filename]));
    await supabase.from("site_versions").update({ files_saved: files }).eq("id", existing.id);
  } else {
    await supabase.from("site_versions").insert({
      client_id: clientId,
      chat_message_id: messageId,
      timestamp: new Date().toISOString(),
      instruction,
      files_saved: [filename],
    });
  }
}

async function listDeployedFilenames(supabase: any, clientId: string): Promise<string[]> {
  const { data } = await supabase.storage.from("generated-sites").list(`${clientId}/deploy`);
  return (data || []).map((f: any) => f.name).filter((n: string) => n && !n.startsWith("."));
}

function imageUrlText(url: string, name?: string): string {
  return `[Attached image${name ? `: ${name}` : ""} — use this exact URL when placing it in the website: ${url}]`;
}

function normalizeContentForClaude(content: any): any[] {
  const blocks = Array.isArray(content) ? content : [];
  const out: any[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" || b.type === "tool_use" || b.type === "tool_result") {
      out.push(b);
      continue;
    }
    const url = b.type === "image" ? b.source?.url : b.type === "image_url" ? b.url : null;
    if (typeof url === "string" && url) {
      out.push({ type: "image", source: { type: "url", url } });
      out.push({ type: "text", text: imageUrlText(url, b.name) });
    } else if (typeof b.url === "string" && b.url) {
      out.push({ type: "text", text: `[Attached file${b.name ? `: ${b.name}` : ""} — ${b.url}]` });
    }
  }
  return out;
}

async function listUploadedFilesRecursive(supabase: any, clientId: string, prefix = ""): Promise<any[]> {
  const folder = prefix ? `${clientId}/${prefix}` : clientId;
  const { data } = await supabase.storage.from("client-uploads").list(folder);
  const rows: any[] = [];
  for (const item of data || []) {
    if (!item?.name || item.name.startsWith(".")) continue;
    const relPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id && !item.metadata?.size) {
      rows.push(...await listUploadedFilesRecursive(supabase, clientId, relPath));
    } else {
      const url = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/client-uploads/${clientId}/${relPath}`;
      rows.push({ name: item.name, path: relPath, url, uploaded_at: item.created_at, size: item.metadata?.size || null });
    }
  }
  return rows;
}

function stagingUrlFor(clientId: string, filename: string): string {
  return `https://staging.sitequeen.ai/${clientId}/${filename}`;
}

async function pushOneToStaging(
  supabase: any,
  clientId: string,
  filename: string,
): Promise<{ ok: boolean; verified: boolean; error?: string; url: string }> {
  const url = stagingUrlFor(clientId, filename);
  const { data } = await supabase.storage
    .from("generated-sites")
    .download(`${clientId}/deploy/${filename}`);
  if (!data) return { ok: false, verified: false, error: "file not in storage", url };
  const original = await data.text();
  const html = injectNoindex(original);
  try {
    await uploadFileToHostingerFtp(`/public_html/staging/${clientId}/${filename}`, html);
  } catch (e: any) {
    return { ok: false, verified: false, error: e.message || String(e), url };
  }
  // Verify
  let verified = false;
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
    if (res.ok) {
      const live = await res.text();
      const distinctive = pickDistinctiveSubstring(original);
      verified = distinctive ? live.includes(distinctive) : true;
    }
  } catch { verified = false; }
  return { ok: true, verified, url };
}

async function commitFileChange(
  ctx: ToolCtx,
  filename: string,
  contents: string,
  change_summary?: string,
): Promise<any> {
  const { supabase, clientId } = ctx;

  // 1. Snapshot
  let snapshotPath: string | null = null;
  try {
    snapshotPath = await snapshotFileToChatMessage(supabase, clientId, filename, ctx.assistantMessageId);
    if (snapshotPath) {
      await recordSnapshotRow(supabase, clientId, ctx.assistantMessageId, filename, change_summary || `chat edit: ${filename}`);
    }
  } catch (e: any) {
    return { success: false, error: `Snapshot failed: ${e.message}`, stage: "snapshot" };
  }

  // 2. Write storage
  const storagePath = `${clientId}/deploy/${filename}`;
  const { error: writeError } = await supabase.storage
    .from("generated-sites")
    .upload(storagePath, new Blob([contents], { type: "text/html" }), {
      upsert: true, contentType: "text/html",
    });
  if (writeError) {
    return { success: false, error: `Storage write failed: ${writeError.message}`, stage: "storage_write" };
  }

  // 3. Verify storage
  const { data: verifyBlob } = await supabase.storage.from("generated-sites").download(storagePath);
  if (!verifyBlob) {
    return { success: false, error: "Storage write completed but file could not be re-fetched", stage: "storage_verify" };
  }
  const verifyText = await verifyBlob.text();
  if (verifyText !== contents) {
    return {
      success: false,
      error: "Storage write completed but contents do not match",
      stage: "storage_verify",
      details: { wrote_bytes: contents.length, read_bytes: verifyText.length },
    };
  }

  // 4. Push to staging + verify
  const push = await pushOneToStaging(supabase, clientId, filename);
  const url = push.url;
  const success = push.ok && push.verified;
  const message = success
    ? `Updated ${filename} and verified live at staging.`
    : push.ok
      ? `Wrote ${filename} to staging but could not verify the change is live. Check ${url} manually.`
      : `Wrote ${filename} to storage but staging push failed: ${push.error}.`;

  ctx.writeLog.push({
    type: "file_edit",
    filename,
    status: success ? "success" : (push.ok ? "partial" : "failed"),
    message: change_summary || `Updated ${filename}`,
    staging_url: url,
    staging_verified: push.verified,
    staging_error: push.error,
  });

  return {
    success,
    filename,
    bytes_written: contents.length,
    snapshot_path: snapshotPath,
    storage_write: "success",
    staging_push: push.ok ? (push.verified ? "success" : "pushed_but_unverified") : "failed",
    staging_error: push.error,
    staging_url: url,
    message,
  };
}

function extractJsonObject(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (match?.[1]) return JSON.parse(match[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("No JSON object found in editor response");
}

function shouldEditAllPages(instructions: string): boolean {
  return /\b(everywhere|sitewide|all pages|whole site|every page|wherever|anywhere|all files)\b/i.test(instructions);
}

async function planTargetedSiteEdits(ctx: ToolCtx, input: any): Promise<any> {
  const instructions = typeof input?.instructions === "string" ? input.instructions.trim() : "";
  if (!instructions) return { success: false, error: "apply_site_change requires plain-English instructions." };

  const deployed = await listDeployedFilenames(ctx.supabase, ctx.clientId);
  const requestedFiles = Array.isArray(input?.files) ? input.files.filter((f: any) => typeof f === "string") : [];
  if (typeof input?.filename === "string" && input.filename.trim()) requestedFiles.unshift(input.filename.trim());
  const candidates = requestedFiles.length
    ? Array.from(new Set(requestedFiles))
    : shouldEditAllPages(instructions)
      ? deployed
      : [deployed.includes("index.html") ? "index.html" : deployed[0]].filter(Boolean);

  const files: Record<string, string> = {};
  for (const filename of candidates) {
    const { data } = await ctx.supabase.storage.from("generated-sites").download(`${ctx.clientId}/deploy/${filename}`);
    if (data) files[filename] = await data.text();
  }
  if (Object.keys(files).length === 0) return { success: false, error: "No deployed HTML files could be read for this client." };

  const filePayload = Object.entries(files).map(([filename, html]) => `--- ${filename} ---\n${html}`).join("\n\n");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ctx.anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      system: `You are a precise HTML editor. Return ONLY valid JSON. Do not use markdown. Make targeted exact find/replace edits, not full-file rewrites.

Schema:
{
  "changes": [
    { "filename": "index.html", "change_summary": "brief summary", "edits": [{ "find": "exact existing substring", "replace": "new substring" }] }
  ],
  "note": "one short sentence"
}

Rules:
- Every find string must be copied exactly from the provided HTML and appear exactly once in that file.
- Include enough surrounding HTML to make each find unique.
- Do not include unchanged files.
- If the request is impossible from the provided HTML, return {"changes":[],"note":"explain briefly"}.`,
      messages: [{ role: "user", content: `Operator request:\n${instructions}\n\nCurrent deployed HTML:\n${filePayload}` }],
    }),
  });
  if (!resp.ok) return { success: false, error: `Internal editor failed: ${await resp.text()}` };
  const data = await resp.json();
  const text = (data?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  let plan: any;
  try { plan = extractJsonObject(text); } catch (e: any) { return { success: false, error: `Internal editor returned invalid JSON: ${e.message}`, preview: text.slice(0, 500) }; }
  if (!Array.isArray(plan?.changes) || plan.changes.length === 0) {
    return { success: false, error: plan?.note || "No applicable HTML changes were produced." };
  }

  const results: any[] = [];
  for (const change of plan.changes) {
    const result = await runTool("edit_deployed_file", {
      filename: change.filename,
      edits: change.edits,
      change_summary: change.change_summary || instructions.slice(0, 120),
    }, ctx);
    results.push({ filename: change.filename, ...result });
  }
  const failures = results.filter((r) => r?.success === false || r?.error);
  return {
    success: failures.length === 0,
    message: failures.length === 0 ? (plan.note || "Applied requested website change.") : `${failures.length} file edit(s) failed.`,
    planned_files: plan.changes.map((c: any) => c.filename),
    results,
  };
}

async function runTool(name: string, input: any, ctx: ToolCtx): Promise<any> {
  const { supabase, clientId } = ctx;


  switch (name) {
    case "apply_site_change": {
      return await planTargetedSiteEdits(ctx, input);
    }

    case "read_deployed_file": {
      const { data, error } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${input.filename}`);
      if (error || !data) return { success: false, error: `File ${input.filename} not found` };
      return { success: true, contents: await data.text() };
    }

    case "list_deployed_files": {
      return { success: true, files: await listDeployedFilenames(supabase, clientId) };
    }

    case "write_deployed_file": {
      const { filename, contents, change_summary } = input;
      if (!filename || typeof filename !== "string") {
        return { success: false, error: "write_deployed_file requires a 'filename' string (e.g. 'index.html')." };
      }
      if (typeof contents !== "string" || contents.length === 0) {
        return {
          success: false,
          error: `write_deployed_file requires the FULL new HTML in 'contents' (non-empty string). For targeted changes, use edit_deployed_file instead.`,
          received_keys: Object.keys(input || {}),
        };
      }
      return await commitFileChange(ctx, filename, contents, change_summary);
    }

    case "edit_deployed_file": {
      const { filename, edits, change_summary } = input;
      if (!filename || typeof filename !== "string") {
        return { success: false, error: "edit_deployed_file requires a 'filename' string." };
      }
      if (!Array.isArray(edits) || edits.length === 0) {
        return { success: false, error: "edit_deployed_file requires a non-empty 'edits' array of {find, replace} objects." };
      }
      // Load current file
      const { data: curData } = await supabase.storage
        .from("generated-sites")
        .download(`${clientId}/deploy/${filename}`);
      if (!curData) return { success: false, error: `File ${filename} not found — use write_deployed_file to create it.` };
      let current = await curData.text();
      const applied: any[] = [];
      for (let i = 0; i < edits.length; i++) {
        const e = edits[i];
        if (typeof e?.find !== "string" || typeof e?.replace !== "string") {
          return { success: false, error: `Edit #${i + 1} must have string 'find' and 'replace' fields.` };
        }
        if (e.find.length === 0) {
          return { success: false, error: `Edit #${i + 1} has an empty 'find' string.` };
        }
        const firstIdx = current.indexOf(e.find);
        if (firstIdx === -1) {
          return {
            success: false,
            error: `Edit #${i + 1}: 'find' string not found in ${filename}. Re-read the file and copy the exact substring (whitespace and casing matter).`,
            find_preview: e.find.slice(0, 200),
          };
        }
        const lastIdx = current.lastIndexOf(e.find);
        if (firstIdx !== lastIdx) {
          return {
            success: false,
            error: `Edit #${i + 1}: 'find' string appears multiple times in ${filename}. Add surrounding context so it matches exactly once.`,
            find_preview: e.find.slice(0, 200),
          };
        }
        current = current.slice(0, firstIdx) + e.replace + current.slice(firstIdx + e.find.length);
        applied.push({ index: i + 1, replaced_bytes: e.find.length, with_bytes: e.replace.length });
      }
      const result = await commitFileChange(ctx, filename, current, change_summary);
      return { ...result, edits_applied: applied };
    }

    case "read_template_file": {
      const tmpl = ctx.site?.template_used;
      if (!tmpl) return { success: false, error: "No template recorded for this client" };
      const { data, error } = await supabase.storage.from("templates").download(`${tmpl}/${input.filename}`);
      if (error || !data) return { success: false, error: `Template file ${tmpl}/${input.filename} not found` };
      return { success: true, contents: await data.text() };
    }

    case "read_intake_field": {
      const intake = ctx.site?.intake_data || {};
      return { success: true, value: intake[input.field_name] ?? null };
    }

    case "read_full_intake": {
      return { success: true, intake: ctx.site?.intake_data || {} };
    }

    case "update_intake_field": {
      const { field_name, new_value } = input;
      const next = { ...(ctx.site?.intake_data || {}), [field_name]: new_value };
      const { error } = await supabase.from("sites").update({ intake_data: next }).eq("client_id", clientId);
      if (error) return { success: false, error: error.message };
      // Verify
      const { data: check } = await supabase.from("sites").select("intake_data").eq("client_id", clientId).maybeSingle();
      const stored = check?.intake_data?.[field_name];
      const matches = JSON.stringify(stored) === JSON.stringify(new_value);
      if (!matches) {
        return { success: false, error: "Intake update completed but readback did not match", stored, expected: new_value };
      }
      ctx.site.intake_data = next;
      ctx.writeLog.push({
        type: "intake_update",
        field: field_name,
        status: "success",
        message: `Updated intake field ${field_name}`,
      });
      return { success: true, field: field_name, value: new_value, message: `Updated intake.${field_name}` };
    }


    case "list_uploaded_media": {
      const media = await listUploadedFilesRecursive(supabase, clientId);
      return {
        success: true,
        media,
      };
    }

    case "push_to_staging": {
      const pushed: any[] = [];
      const failed: any[] = [];
      for (const filename of input.files || []) {
        const r = await pushOneToStaging(supabase, clientId, filename);
        if (r.ok && r.verified) pushed.push({ filename, url: r.url, verified: true });
        else if (r.ok) pushed.push({ filename, url: r.url, verified: false });
        else failed.push({ filename, error: r.error });
        ctx.writeLog.push({
          type: "staging_push",
          filename,
          status: r.ok && r.verified ? "success" : r.ok ? "partial" : "failed",
          message: r.ok ? (r.verified ? `Pushed ${filename}` : `Pushed ${filename} (unverified)`) : `Push failed for ${filename}: ${r.error}`,
          staging_url: r.url,
          staging_verified: r.verified,
          staging_error: r.error,
        });
      }
      return { success: failed.length === 0, pushed, failed, message: failed.length === 0 ? "All pushes succeeded" : `${failed.length} push(es) failed` };
    }

    case "list_snapshots": {
      const { data } = await supabase.storage.from("generated-sites").list(`${clientId}/versions`);
      const snaps = (data || []).map((s: any) => ({ id: s.name, created_at: s.created_at }));
      snaps.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return { success: true, snapshots: snaps };
    }

    case "read_call_notes": {
      const { data, error } = await supabase
        .from("call_notes")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!data) return { success: true, call_notes: null, message: "No call notes recorded for this client yet." };
      // Strip noisy fields
      const { id, created_at, updated_at, completed_by, ...notes } = data;
      return { success: true, call_notes: notes };
    }

    case "read_application": {
      const appId = ctx.client?.application_id;
      if (!appId) return { success: true, application: null, message: "No application linked to this client." };
      const { data: app, error } = await supabase
        .from("applications")
        .select("*")
        .eq("id", appId)
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!app) return { success: true, application: null, message: "Linked application not found." };
      return { success: true, application: app };
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// ─── Build message history & system prompt ──────────────────────────────────
async function loadChatMessages(supabase: any, chatId: string): Promise<any[]> {
  // Load the MOST RECENT N messages (desc + reverse), not the oldest N.
  // Loading oldest first chops tool_result rows off the tail of long chats.
  const { data } = await supabase
    .from("operator_chat_messages")
    .select("role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);
  const rawRows = (data || [])
    .filter((m: any) => m.role === "user" || m.role === "assistant" || m.role === "tool_result")
    .reverse();
  const rows: any[] = [];
  let dropNextToolResult = false;
  for (const row of rawRows) {
    if (dropNextToolResult && row.role === "tool_result") {
      dropNextToolResult = false;
      continue;
    }
    dropNextToolResult = false;
    const blocks = Array.isArray(row.content) ? row.content : [];
    const legacyRewrite = row.role === "assistant" && blocks.some((b: any) => b?.type === "tool_use" && b?.name === "write_deployed_file");
    if (legacyRewrite) {
      dropNextToolResult = true;
      continue;
    }
    rows.push(row);
  }
  return rows.map((m: any) => ({ role: m.role === "tool_result" ? "user" : m.role, content: m.content }));
}


function formatIntakeSummary(intake: any): string {
  if (!intake) return "(no intake data yet)";
  const lines: string[] = [];
  const add = (k: string, v: any) => { if (v) lines.push(`- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`); };
  add("business_name", intake.business_name);
  add("phone", intake.business_phone || intake.phone || intake.phone_number);
  add("email", intake.business_email || intake.email);
  const addr = [intake.business_address || intake.address, intake.business_city || intake.city, intake.business_state || intake.state, intake.business_zip || intake.zip].filter(Boolean).join(", ");
  if (addr) lines.push(`- address: ${addr}`); else lines.push(`- address: (not set)`);
  if (intake.business_hours || intake.hours) lines.push(`- hours: set`);
  const socials = ["instagram_url", "facebook_url", "tiktok_url", "linkedin_url"].filter((k) => intake[k]);
  if (socials.length) lines.push(`- socials: ${socials.length} set`);
  return lines.join("\n") || "(empty)";
}

async function buildSystemPrompt(supabase: any, client: any, site: any): Promise<string> {
  const deployedFiles = await listDeployedFilenames(supabase, client.id);
  const { data: media } = await supabase.storage.from("client-uploads").list(client.id);
  const isProspect = client.lifecycle_stage !== "active_client";
  const stagingUrl = site?.staging_url || `https://staging.sitequeen.ai/${client.id}/index.html`;

  return `You are working in SiteQueen's operator portal. You help the operator edit and extend ${isProspect ? "prospect demo" : "paying client"} websites by reading files, making changes, and deploying them.

You are working on: ${client.business_name} (${isProspect ? "prospect demo site" : "paying client"})
Template: ${site?.template_used || "(unknown)"}
Staging URL: ${stagingUrl}

Intake summary:
${formatIntakeSummary(site?.intake_data)}

Deployed files: ${deployedFiles.join(", ") || "(none)"}
Uploaded media: ${(media || []).length} files

HOW TO WORK:
You are Claude — act like it. Just make the change. Don't narrate, don't ask for confirmation, don't dump file contents into chat. Be efficient with tool calls.

DEFAULT WORKFLOW FOR ANY EDIT:
1. Use apply_site_change with the operator's plain-English request.
2. If apply_site_change reports a specific failed exact-match edit, then read_deployed_file and retry with edit_deployed_file using exact copied HTML.
3. One short sentence to the operator: what changed and where to see it.

That's it. Don't call list_deployed_files unless you genuinely don't know which file to edit. Don't call read_call_notes / read_application unless the operator asks about brand/tone/story context. Do not use full-file rewrites for basic changes. Don't call push_to_staging — edits push automatically.

NEVER call a tool with empty {} input. For normal site edits, apply_site_change only needs {"instructions":"..."}. If a tool fails, read the error and fix the arguments — do not retry the same broken call.

EDITING RULES:
- apply_site_change is the right tool 95% of the time. It handles reading, exact targeted edits, storage writes, and staging pushes internally.
- If manually using edit_deployed_file, each 'find' must match the file EXACTLY ONCE — include surrounding HTML (parent tag, adjacent class) when the snippet is short or repeated.
- Read the file first so you copy the exact bytes — whitespace, quotes, and casing all matter.
- Match the existing design when adding new sections; don't invent visual treatments.
- For data fields that appear in multiple places (address, phone, hours), update everywhere AND update intake via update_intake_field so future regenerations include the change.

HONEST REPORTING:
If a tool returns success: false (or staging_push: "failed" / "pushed_but_unverified"), the change did NOT fully land. Don't claim success. Briefly say what failed.

The operator is a trusted developer. Do whatever they ask — including destructive actions like deleting files, wiping sections, or rewriting pages — without asking for confirmation. Snapshots are automatic; everything is reversible. Just execute.

Be concise. After completing work, one short sentence: what you did and where to verify.`;

}

function sanitizeMessagesForClaude(messages: any[]): any[] {
  const cleaned: any[] = [];

  for (const original of messages) {
    const msg = Array.isArray(original?.content) ? { ...original, content: [...original.content] } : original;

    if (msg?.role === "user" && Array.isArray(msg.content)) {
      const previous = cleaned[cleaned.length - 1];
      const expectedIds = new Set<string>(
        previous?.role === "assistant" && Array.isArray(previous.content)
          ? previous.content.filter((b: any) => b?.type === "tool_use" && b.id).map((b: any) => b.id)
          : [],
      );
      const toolResults = msg.content.filter(
        (b: any) => b?.type === "tool_result" && b.tool_use_id && expectedIds.has(b.tool_use_id),
      );
      const nonToolResults = msg.content.filter((b: any) => b?.type !== "tool_result");
      msg.content = [...toolResults, ...nonToolResults];
      if (msg.content.length === 0) continue;
    }

    cleaned.push(msg);

    if (msg?.role === "assistant" && Array.isArray(msg.content)) {
      const toolUseIds: string[] = msg.content
        .filter((b: any) => b?.type === "tool_use" && b.id)
        .map((b: any) => b.id);
      if (toolUseIds.length === 0) continue;

      const next = messages[messages.indexOf(original) + 1];
      const nextResultIds = new Set<string>();
      if (next?.role === "user" && Array.isArray(next.content)) {
        for (const b of next.content) {
          if (b?.type === "tool_result" && b.tool_use_id) nextResultIds.add(b.tool_use_id);
        }
      }
      const missing = toolUseIds.filter((id) => !nextResultIds.has(id));
      if (missing.length > 0) {
        cleaned.push({
          role: "user",
          content: missing.map((id) => ({
            type: "tool_result",
            tool_use_id: id,
            content: JSON.stringify({ success: false, error: "Previous turn was interrupted before this tool completed." }),
            is_error: true,
          })),
        });
      }
    }
  }

  return cleaned;
}

// ─── Streaming handler ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authed = await requireUser(req, corsHeaders);
  if (authed instanceof Response) return authed;
  const op = await requireOperator(authed, corsHeaders);
  if (op instanceof Response) return op;
  const { user, supabase } = authed;

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }
  const { chat_id, client_id, user_message, attachments } = body || {};
  if (!client_id || !user_message) {
    return new Response(JSON.stringify({ error: "client_id and user_message required" }), { status: 400, headers: corsHeaders });
  }

  const { data: client, error: cErr } = await supabase.from("clients").select("*").eq("id", client_id).single();
  if (cErr || !client) return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
  const { data: site } = await supabase.from("sites").select("*").eq("client_id", client_id).maybeSingle();

  let chatId = chat_id;
  if (!chatId) {
    const { data: existing } = await supabase
      .from("operator_chats")
      .select("id")
      .eq("client_id", client_id)
      .eq("operator_id", user.id)
      .eq("archived", false)
      .maybeSingle();
    if (existing) chatId = existing.id;
    else {
      const { data: created, error } = await supabase
        .from("operator_chats")
        .insert({ client_id, operator_id: user.id })
        .select("id")
        .single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      chatId = created.id;
    }
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: corsHeaders });

  const userContent: any[] = [];
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a?.type === "image" && a.url) {
        userContent.push({
          type: "image",
          source: { type: "url", url: a.url },
        });
        userContent.push({ type: "text", text: imageUrlText(a.url, a.name) });
      } else if (a?.url) {
        // Non-image attachment — include as a text reference so Claude knows about it
        userContent.push({ type: "text", text: `[Attached file: ${a.name || a.url} — ${a.url}]` });
      }
    }
  }
  userContent.push({ type: "text", text: user_message });
  await supabase.from("operator_chat_messages").insert({ chat_id: chatId, role: "user", content: userContent });

  const systemPrompt = await buildSystemPrompt(supabase, client, site);
  const history = await loadChatMessages(supabase, chatId);
  const messages: any[] = history.map((m: any) => {
    if (Array.isArray(m.content)) {
      const safe = normalizeContentForClaude(m.content);
      return { role: m.role, content: safe.length ? safe : [{ type: "text", text: "" }] };
    }
    return m;
  });

  const sanitizedMessages = sanitizeMessagesForClaude(messages);
  messages.length = 0;
  messages.push(...sanitizedMessages);


  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      send({ type: "chat_created", chat_id: chatId });

      try {
        let convo = messages;
        let stopReason = "end_turn";
        // Aggregate writes across all assistant turns in this loop, scoped per-message.
        const turnWritesByMessage: Record<string, WriteRecord[]> = {};
        // Circuit breaker: track repeated identical failing tool calls.
        const failureCounts: Record<string, number> = {};


        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 16000,
              system: systemPrompt,
              tools: TOOLS,
              messages: convo,
              stream: true,
            }),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 500)}`);
          }

          const reader = resp.body!.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          const assistantContent: any[] = [];
          let currentJson = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (!data || data === "[DONE]") continue;
              try {
                const ev = JSON.parse(data);
                if (ev.type === "content_block_start") {
                  const block: any = { ...ev.content_block };
                  currentJson = "";
                  if (block.type === "text") block.text = "";
                  assistantContent[ev.index] = block;
                } else if (ev.type === "content_block_delta") {
                  const block = assistantContent[ev.index];
                  if (!block) continue;
                  if (ev.delta.type === "text_delta") {
                    block.text = (block.text || "") + ev.delta.text;
                    send({ type: "text_delta", text: ev.delta.text });
                  } else if (ev.delta.type === "input_json_delta") {
                    currentJson += ev.delta.partial_json || "";
                  }
                } else if (ev.type === "content_block_stop") {
                  const block = assistantContent[ev.index];
                  if (block?.type === "tool_use") {
                    try {
                      block.input = currentJson ? JSON.parse(currentJson) : {};
                    } catch {
                      // Truncated/invalid JSON — mark it so we can return a useful error
                      // instead of silently passing {} to the tool.
                      block.input = { __parse_failed: true, __raw: currentJson.slice(0, 200) };
                    }
                  }
                  currentJson = "";
                } else if (ev.type === "message_delta") {
                  if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
                }
              } catch {}
            }
          }

          // Persist assistant turn and get its ID (needed to tag snapshots)
          const { data: persisted, error: persistErr } = await supabase
            .from("operator_chat_messages")
            .insert({ chat_id: chatId, role: "assistant", content: assistantContent })
            .select("id")
            .single();
          if (persistErr) throw new Error(`Could not persist assistant message: ${persistErr.message}`);
          const assistantMessageId = persisted.id;

          convo = [...convo, { role: "assistant", content: assistantContent }];

          const toolUses = assistantContent.filter((b: any) => b?.type === "tool_use");
          if (toolUses.length === 0) {
            send({ type: "done", stop_reason: stopReason });
            break;
          }

          // Tool execution — no confirmation gates
          const writeLog: WriteRecord[] = [];
          turnWritesByMessage[assistantMessageId] = writeLog;
          const ctx: ToolCtx = {
            supabase, clientId: client_id, client, site: site || {}, anthropicKey,
            assistantMessageId, writeLog,
          };

          const toolResults: any[] = [];
          let circuitTripped = false;
          for (const tu of toolUses) {
            send({ type: "tool_use_started", tool_name: tu.name, tool_input: tu.input, message_id: tu.id });
            let result: any;
            if (tu.input?.__parse_failed) {
              result = {
                success: false,
                error: `Your tool call arguments were truncated/cut off mid-stream (response hit the token limit). Do NOT retry write_deployed_file with the full HTML — use edit_deployed_file with targeted {find, replace} edits instead, which is far smaller.`,
              };
            } else {
              try {
                result = await runTool(tu.name, tu.input, ctx);
              } catch (e: any) {
                result = { success: false, error: e.message || String(e) };
              }
            }
            const ok = result?.success !== false && !result?.error;
            // Circuit breaker: if the same tool fails with the same input 3x, stop the loop.
            if (!ok) {
              const sig = `${tu.name}:${JSON.stringify(tu.input || {})}`;
              failureCounts[sig] = (failureCounts[sig] || 0) + 1;
              if (failureCounts[sig] >= 3) {
                result = { success: false, error: `Aborted: ${tu.name} failed 3 times with the same input. Stopping the loop. Original error: ${result?.error || "unknown"}` };
                circuitTripped = true;
              }
            }
            send({ type: "tool_result", message_id: tu.id, result, success: ok });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: typeof result === "string" ? result : JSON.stringify(result).slice(0, 30000),
            });
          }


          await supabase.from("operator_chat_messages").insert({
            chat_id: chatId, role: "tool_result", content: toolResults,
          });
          convo = [...convo, { role: "user", content: toolResults }];

          // Emit a turn_summary for this assistant message if it produced writes
          if (writeLog.length > 0) {
            const anyFailures = writeLog.some((w) => w.status !== "success");
            const firstStagingUrl = writeLog.find((w) => w.staging_url)?.staging_url;
            send({
              type: "turn_summary",
              message_id: assistantMessageId,
              writes: writeLog,
              any_failures: anyFailures,
              staging_url: firstStagingUrl || stagingUrlFor(client_id, "index.html"),
              undo_available: writeLog.some((w) => w.type === "file_edit" && (w.status === "success" || w.status === "partial")),
              undo_token: assistantMessageId,
            });
          }

          if (circuitTripped) {
            send({ type: "text_delta", text: "\n\n[Stopped — the same tool call kept failing. Try rephrasing the request.]" });
            send({ type: "done", stop_reason: "circuit_breaker" });
            break;
          }
        }


        send({ type: "done", stop_reason: stopReason });
      } catch (e: any) {
        send({ type: "error", error: e.message || String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
