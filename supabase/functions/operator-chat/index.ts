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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";
const MAX_ITERATIONS = 10;
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
    name: "write_deployed_file",
    description: "Write new contents to a deployed HTML file. Automatically takes a snapshot first, writes to storage, AND pushes to Hostinger staging. Verifies both succeeded and reports honestly. You do NOT need to call push_to_staging separately after this.",
    input_schema: {
      type: "object",
      required: ["filename", "contents", "change_summary"],
      properties: {
        filename: { type: "string" },
        contents: { type: "string", description: "Full new HTML contents" },
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
];

// ─── Tool execution ─────────────────────────────────────────────────────────

interface ToolCtx {
  supabase: any;
  clientId: string;
  site: any;
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
    await uploadFileToHostingerFtp(`/public_html/${clientId}/${filename}`, html);
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

async function runTool(name: string, input: any, ctx: ToolCtx): Promise<any> {
  const { supabase, clientId } = ctx;

  switch (name) {
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
          error: `write_deployed_file requires the FULL new HTML in the 'contents' field as a non-empty string. You passed contents of type '${contents === null ? "null" : typeof contents}'. There is no partial/patch mode — call read_deployed_file first, modify the HTML in memory, then send the entire updated document as 'contents'.`,
          received_keys: Object.keys(input || {}),
        };
      }

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
      const { data } = await supabase.storage.from("client-uploads").list(clientId);
      const base = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/client-uploads/${clientId}`;
      return {
        success: true,
        media: (data || []).filter((f: any) => f.name && !f.name.startsWith(".")).map((f: any) => ({
          name: f.name, url: `${base}/${f.name}`, uploaded_at: f.created_at,
        })),
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
  const rows = (data || [])
    .filter((m: any) => m.role === "user" || m.role === "assistant" || m.role === "tool_result")
    .reverse();
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
Use the tools to read files, make changes, and deploy. Don't load everything upfront — fetch what you need.

When you write files, update intake, or push to staging, the changes apply IMMEDIATELY. Snapshots are taken automatically before each write so the operator can undo with one click if needed. Just do the work and tell the operator what you did. Be specific in change_summary — clearly state what changed and where.

write_deployed_file already writes to storage AND pushes to staging in one step. You normally do NOT need to call push_to_staging afterwards.

write_deployed_file is a FULL-FILE REPLACE — there is no diff/patch mode. You MUST call read_deployed_file first to get the current HTML, modify the relevant portion in your response, then pass the ENTIRE updated HTML document as the 'contents' argument (string). Never call write_deployed_file with only a snippet, an empty string, or without 'contents'.

Match the existing design when adding or extending. Read the existing HTML/CSS first, then add new things that fit the same patterns. Don't invent new visual treatments.

For data fields that appear in multiple places (address, phone, hours), update everywhere they appear AND update the intake so future regenerations include the change.

HONEST REPORTING:
If a tool returns success: false (or staging_push: "failed" / "pushed_but_unverified"), the change did NOT fully land. Do NOT claim success in your message. Explain exactly what failed and suggest next steps (retry, manual check, etc.).

SAFETY:
If the operator asks for a vague destructive action ("delete everything", "wipe the site"), ask for clarification before doing it. Specific destructive actions ("remove the testimonials section") are fine — the operator means it.

Be concise. After completing work, briefly tell the operator what you did and where to verify.`;
}

// ─── Streaming handler ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

  const { data: isOp } = await supabase.rpc("is_operator", { _user_id: user.id });
  if (!isOp) return new Response(JSON.stringify({ error: "Operator only" }), { status: 403, headers: corsHeaders });

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

  const userContent: any[] = [{ type: "text", text: user_message }];
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a?.type === "image" && a.url) userContent.push({ type: "image_url", url: a.url, name: a.name });
    }
  }
  await supabase.from("operator_chat_messages").insert({ chat_id: chatId, role: "user", content: userContent });

  const systemPrompt = await buildSystemPrompt(supabase, client, site);
  const history = await loadChatMessages(supabase, chatId);
  const messages: any[] = history.map((m: any) => {
    if (Array.isArray(m.content)) {
      const safe = m.content.filter((b: any) => b && typeof b === "object" && (b.type === "text" || b.type === "tool_use" || b.type === "tool_result"));
      return { role: m.role, content: safe.length ? safe : [{ type: "text", text: "" }] };
    }
    return m;
  });

  // Sanitize conversation for Claude's strict tool_use/tool_result pairing.
  // Two failure modes we defend against:
  //  (a) Assistant tool_use rows persisted but tool_result row never inserted
  //      (prior turn interrupted) → next message is a plain user text, leaving
  //      tool_use orphaned.
  //  (b) Recent-N history window starts in the middle, so the first message
  //      is a user(tool_result) with no preceding assistant tool_use.
  // Strategy: walk forward, drop orphan leading tool_result blocks, and for
  // every assistant tool_use, inject a synthetic error tool_result if the
  // very next message doesn't already supply one.
  {
    // 1. Drop leading user messages whose content is only orphan tool_results.
    while (messages.length > 0) {
      const m0 = messages[0];
      if (m0.role !== "user" || !Array.isArray(m0.content)) break;
      const filtered = m0.content.filter((b: any) => b?.type !== "tool_result");
      if (filtered.length === m0.content.length) break; // no tool_results to worry about
      if (filtered.length === 0) {
        messages.shift();
        continue;
      }
      m0.content = filtered;
      break;
    }

    // 2. For each assistant with tool_use, ensure next message provides results.
    const repaired: any[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      repaired.push(m);
      if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
      const toolUseIds: string[] = m.content
        .filter((b: any) => b?.type === "tool_use" && b.id)
        .map((b: any) => b.id);
      if (toolUseIds.length === 0) continue;
      const next = messages[i + 1];
      const nextResultIds = new Set<string>();
      if (next?.role === "user" && Array.isArray(next.content)) {
        for (const b of next.content) {
          if (b?.type === "tool_result" && b.tool_use_id) nextResultIds.add(b.tool_use_id);
        }
      }
      const missing = toolUseIds.filter((id) => !nextResultIds.has(id));
      if (missing.length === 0) continue;
      const synthetic = missing.map((id) => ({
        type: "tool_result",
        tool_use_id: id,
        content: JSON.stringify({ success: false, error: "Previous turn was interrupted before this tool completed." }),
        is_error: true,
      }));
      if (next?.role === "user" && Array.isArray(next.content)) {
        next.content = [...synthetic, ...next.content];
      } else {
        // Inject a new user message with just the synthetic results.
        repaired.push({ role: "user", content: synthetic });
      }
    }
    messages.length = 0;
    messages.push(...repaired);
  }

  // Final guard: validate every tool_use has a following tool_result. If any
  // orphan still slips through (shouldn't), strip those tool_use blocks rather
  // than 400ing the user.
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    const next = messages[i + 1];
    const nextIds = new Set<string>();
    if (next?.role === "user" && Array.isArray(next.content)) {
      for (const b of next.content) {
        if (b?.type === "tool_result" && b.tool_use_id) nextIds.add(b.tool_use_id);
      }
    }
    const cleaned = m.content.filter(
      (b: any) => b?.type !== "tool_use" || (b.id && nextIds.has(b.id))
    );
    if (cleaned.length !== m.content.length) {
      m.content = cleaned.length ? cleaned : [{ type: "text", text: "" }];
    }
  }


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
              max_tokens: 4096,
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
                    try { block.input = currentJson ? JSON.parse(currentJson) : {}; } catch { block.input = {}; }
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
            supabase, clientId: client_id, site: site || {},
            assistantMessageId, writeLog,
          };

          const toolResults: any[] = [];
          for (const tu of toolUses) {
            send({ type: "tool_use_started", tool_name: tu.name, tool_input: tu.input, message_id: tu.id });
            let result: any;
            try {
              result = await runTool(tu.name, tu.input, ctx);
            } catch (e: any) {
              result = { success: false, error: e.message || String(e) };
            }
            const ok = result?.success !== false && !result?.error;
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
