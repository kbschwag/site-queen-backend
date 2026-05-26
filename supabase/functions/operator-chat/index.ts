// operator-chat: streaming chat endpoint that lets operators talk to Claude
// with tool use to read/write/deploy client site files.
//
// Streams SSE events back to the browser:
//   { type: "chat_created", chat_id }
//   { type: "text_delta", text }
//   { type: "tool_use_started", tool_name, tool_input, message_id }
//   { type: "tool_use_requires_confirmation", tool_name, tool_input, summary, message_id }
//   { type: "tool_result", message_id, result }
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
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

const DESTRUCTIVE_TOOLS = new Set([
  "write_deployed_file",
  "update_intake_field",
  "push_to_staging",
  "snapshot_current_state",
  "restore_from_snapshot",
]);

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  return html;
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
    description: "Write new contents to a deployed HTML file. A snapshot of the current file is taken automatically before the write. Does NOT push to staging — call push_to_staging afterwards.",
    input_schema: {
      type: "object",
      required: ["filename", "contents", "change_summary"],
      properties: {
        filename: { type: "string" },
        contents: { type: "string", description: "Full new HTML contents" },
        change_summary: { type: "string", description: "Brief description for the operator and history" },
      },
    },
  },
  {
    name: "read_template_file",
    description: "Read a file from the template this client was generated from, for reference when extending the design.",
    input_schema: { type: "object", required: ["filename"], properties: { filename: { type: "string" } } },
  },
  {
    name: "read_intake_field",
    description: "Read a single field from the client intake data (e.g. 'business_address', 'business_hours').",
    input_schema: { type: "object", required: ["field_name"], properties: { field_name: { type: "string" } } },
  },
  {
    name: "read_full_intake",
    description: "Read the entire client intake data object. Use sparingly.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_intake_field",
    description: "Update a field in the client intake so future regenerations include the change.",
    input_schema: {
      type: "object",
      required: ["field_name", "new_value"],
      properties: { field_name: { type: "string" }, new_value: {} },
    },
  },
  {
    name: "list_uploaded_media",
    description: "List uploaded media (photos, etc.) for this client. Returns filenames and public URLs.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "push_to_staging",
    description: "Push specified deployed files to Hostinger staging so the operator can see changes live.",
    input_schema: {
      type: "object",
      required: ["files"],
      properties: { files: { type: "array", items: { type: "string" } } },
    },
  },
  {
    name: "snapshot_current_state",
    description: "Create an explicit named snapshot of all currently deployed files.",
    input_schema: { type: "object", properties: { label: { type: "string" } } },
  },
  {
    name: "list_snapshots",
    description: "List available snapshots for this client, most recent first.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "restore_from_snapshot",
    description: "Restore deployed files from a previous snapshot.",
    input_schema: { type: "object", required: ["snapshot_id"], properties: { snapshot_id: { type: "string" } } },
  },
];

function describeAction(name: string, input: any): string {
  switch (name) {
    case "write_deployed_file": return `Write ${input.filename}: ${input.change_summary || ""}`;
    case "update_intake_field": return `Update intake.${input.field_name} = ${JSON.stringify(input.new_value)}`;
    case "push_to_staging": return `Push to staging: ${(input.files || []).join(", ")}`;
    case "snapshot_current_state": return `Snapshot current files${input.label ? ` (${input.label})` : ""}`;
    case "restore_from_snapshot": return `Restore snapshot ${input.snapshot_id}`;
    default: return name;
  }
}

// ─── Tool execution ─────────────────────────────────────────────────────────

interface ToolCtx {
  supabase: any;
  clientId: string;
  site: any;
}

async function snapshotFile(supabase: any, clientId: string, filename: string, snapshotId: string) {
  const { data } = await supabase.storage.from("generated-sites").download(`${clientId}/deploy/${filename}`);
  if (!data) return;
  const bytes = new Uint8Array(await data.arrayBuffer());
  await supabase.storage.from("generated-sites").upload(
    `${clientId}/versions/${snapshotId}/${filename}`,
    new Blob([bytes], { type: "text/html" }),
    { upsert: true, contentType: "text/html" },
  );
}

async function listDeployedFilenames(supabase: any, clientId: string): Promise<string[]> {
  const { data } = await supabase.storage.from("generated-sites").list(`${clientId}/deploy`);
  return (data || []).map((f: any) => f.name).filter((n: string) => n && !n.startsWith("."));
}

async function runTool(name: string, input: any, ctx: ToolCtx): Promise<any> {
  const { supabase, clientId } = ctx;

  switch (name) {
    case "read_deployed_file": {
      const { data, error } = await supabase.storage.from("generated-sites").download(`${clientId}/deploy/${input.filename}`);
      if (error || !data) return { error: `File ${input.filename} not found` };
      return { contents: await data.text() };
    }

    case "list_deployed_files": {
      return { files: await listDeployedFilenames(supabase, clientId) };
    }

    case "write_deployed_file": {
      const snapId = new Date().toISOString().replace(/[:.]/g, "-");
      await snapshotFile(supabase, clientId, input.filename, snapId);
      const { error } = await supabase.storage.from("generated-sites").upload(
        `${clientId}/deploy/${input.filename}`,
        new Blob([input.contents], { type: "text/html" }),
        { upsert: true, contentType: "text/html" },
      );
      if (error) return { error: error.message };
      return { success: true, bytes_written: input.contents.length, snapshot_id: snapId, change_summary: input.change_summary };
    }

    case "read_template_file": {
      const tmpl = ctx.site?.template_used;
      if (!tmpl) return { error: "No template recorded for this client" };
      const { data, error } = await supabase.storage.from("templates").download(`${tmpl}/${input.filename}`);
      if (error || !data) return { error: `Template file ${tmpl}/${input.filename} not found` };
      return { contents: await data.text() };
    }

    case "read_intake_field": {
      const intake = ctx.site?.intake_data || {};
      return { value: intake[input.field_name] ?? null };
    }

    case "read_full_intake": {
      return { intake: ctx.site?.intake_data || {} };
    }

    case "update_intake_field": {
      const next = { ...(ctx.site?.intake_data || {}), [input.field_name]: input.new_value };
      const { error } = await supabase.from("sites").update({ intake_data: next }).eq("client_id", clientId);
      if (error) return { error: error.message };
      ctx.site.intake_data = next;
      return { success: true };
    }

    case "list_uploaded_media": {
      const { data } = await supabase.storage.from("client-uploads").list(clientId);
      const base = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/client-uploads/${clientId}`;
      return {
        media: (data || []).filter((f: any) => f.name && !f.name.startsWith(".")).map((f: any) => ({
          name: f.name,
          url: `${base}/${f.name}`,
          uploaded_at: f.created_at,
        })),
      };
    }

    case "push_to_staging": {
      const pushed: string[] = [];
      const failed: { file: string; error: string }[] = [];
      for (const filename of input.files || []) {
        try {
          const { data } = await supabase.storage.from("generated-sites").download(`${clientId}/deploy/${filename}`);
          if (!data) { failed.push({ file: filename, error: "not found in storage" }); continue; }
          const html = injectNoindex(await data.text());
          await uploadFileToHostingerFtp(`/public_html/${clientId}/${filename}`, html);
          pushed.push(filename);
        } catch (e: any) {
          failed.push({ file: filename, error: e.message || String(e) });
        }
      }
      return { success: failed.length === 0, pushed, failed };
    }

    case "snapshot_current_state": {
      const snapId = (input.label ? `${input.label}-` : "") + new Date().toISOString().replace(/[:.]/g, "-");
      const files = await listDeployedFilenames(supabase, clientId);
      for (const f of files) await snapshotFile(supabase, clientId, f, snapId);
      return { success: true, snapshot_id: snapId, files_saved: files.length };
    }

    case "list_snapshots": {
      const { data } = await supabase.storage.from("generated-sites").list(`${clientId}/versions`);
      const snaps = (data || []).map((s: any) => ({ id: s.name, created_at: s.created_at }));
      snaps.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return { snapshots: snaps };
    }

    case "restore_from_snapshot": {
      const { data } = await supabase.storage.from("generated-sites").list(`${clientId}/versions/${input.snapshot_id}`);
      if (!data || data.length === 0) return { error: "Snapshot not found or empty" };
      const restored: string[] = [];
      for (const f of data) {
        if (!f.name || f.name.startsWith(".")) continue;
        const { data: blob } = await supabase.storage.from("generated-sites").download(`${clientId}/versions/${input.snapshot_id}/${f.name}`);
        if (!blob) continue;
        await supabase.storage.from("generated-sites").upload(
          `${clientId}/deploy/${f.name}`,
          new Blob([new Uint8Array(await blob.arrayBuffer())], { type: "text/html" }),
          { upsert: true, contentType: "text/html" },
        );
        restored.push(f.name);
      }
      return { success: true, restored };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Confirmation polling ────────────────────────────────────────────────────
async function waitForConfirmation(supabase: any, messageId: string): Promise<"approved" | "cancelled" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < CONFIRMATION_TIMEOUT_MS) {
    const { data } = await supabase
      .from("operator_chat_messages")
      .select("confirmed_at, cancelled_at")
      .eq("id", messageId)
      .maybeSingle();
    if (data?.confirmed_at) return "approved";
    if (data?.cancelled_at) return "cancelled";
    await new Promise((r) => setTimeout(r, 1500));
  }
  return "timeout";
}

// ─── Build message history & system prompt ──────────────────────────────────
async function loadChatMessages(supabase: any, chatId: string): Promise<any[]> {
  const { data } = await supabase
    .from("operator_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);
  return (data || []).map((m: any) => ({ role: m.role === "tool_result" ? "user" : m.role, content: m.content }));
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
  const socials = ["instagram_url","facebook_url","tiktok_url","linkedin_url"].filter(k => intake[k]);
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

Match the existing design when adding or extending. Read the existing HTML/CSS, then add new things that fit the same patterns. Don't invent new visual treatments.

For data fields that appear in multiple places (address, phone, hours), update everywhere they appear AND update the intake so future regenerations include the change.

Destructive actions (writing files, updating intake, pushing to staging, snapshots, restores) are paused for operator confirmation automatically — just call the tool, the confirmation happens before it runs.

After making changes that should be visible, call push_to_staging with the affected files.

Be concise. Be honest. If a request is ambiguous, ask. After completing work, briefly tell the operator what you did.`;
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

  // Operator check
  const { data: isOp } = await supabase.rpc("is_operator", { _user_id: user.id });
  if (!isOp) return new Response(JSON.stringify({ error: "Operator only" }), { status: 403, headers: corsHeaders });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders }); }
  const { chat_id, client_id, user_message, attachments } = body || {};
  if (!client_id || !user_message) {
    return new Response(JSON.stringify({ error: "client_id and user_message required" }), { status: 400, headers: corsHeaders });
  }

  // Load client + site
  const { data: client, error: cErr } = await supabase.from("clients").select("*").eq("id", client_id).single();
  if (cErr || !client) return new Response(JSON.stringify({ error: "Client not found" }), { status: 404, headers: corsHeaders });
  const { data: site } = await supabase.from("sites").select("*").eq("client_id", client_id).maybeSingle();

  // Load or create chat
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

  // Persist the user message
  const userContent: any[] = [{ type: "text", text: user_message }];
  if (Array.isArray(attachments)) {
    for (const a of attachments) {
      if (a?.type === "image" && a.url) userContent.push({ type: "image_url", url: a.url, name: a.name });
    }
  }
  await supabase.from("operator_chat_messages").insert({ chat_id: chatId, role: "user", content: userContent });

  const ctx: ToolCtx = { supabase, clientId: client_id, site: site || {} };
  const systemPrompt = await buildSystemPrompt(supabase, client, site);
  const history = await loadChatMessages(supabase, chatId);
  // Strip our custom image_url parts (Claude expects different format); for simplicity, only forward text from user messages
  const messages = history.map((m: any) => {
    if (Array.isArray(m.content)) {
      const safe = m.content.filter((b: any) => b && typeof b === "object" && (b.type === "text" || b.type === "tool_use" || b.type === "tool_result"));
      return { role: m.role, content: safe.length ? safe : [{ type: "text", text: "" }] };
    }
    return m;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      send({ type: "chat_created", chat_id: chatId });

      try {
        let convo = messages;
        let stopReason = "end_turn";

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
          let currentBlock: any = null;
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
                  currentBlock = { ...ev.content_block };
                  currentJson = "";
                  if (currentBlock.type === "text") currentBlock.text = "";
                  assistantContent[ev.index] = currentBlock;
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

          // Persist assistant turn
          await supabase.from("operator_chat_messages").insert({
            chat_id: chatId,
            role: "assistant",
            content: assistantContent,
          });
          convo = [...convo, { role: "assistant", content: assistantContent }];

          const toolUses = assistantContent.filter((b: any) => b?.type === "tool_use");
          if (toolUses.length === 0) {
            send({ type: "done", stop_reason: stopReason });
            break;
          }

          // Execute each tool, gathering results
          const toolResults: any[] = [];
          for (const tu of toolUses) {
            const isDestructive = DESTRUCTIVE_TOOLS.has(tu.name);
            let result: any;

            if (isDestructive) {
              // Persist a pending message and wait for confirmation
              const { data: pending, error } = await supabase
                .from("operator_chat_messages")
                .insert({
                  chat_id: chatId,
                  role: "system_note",
                  content: { type: "pending_confirmation", tool_name: tu.name, tool_input: tu.input, summary: describeAction(tu.name, tu.input) },
                  tool_name: tu.name,
                  tool_input: tu.input,
                  requires_confirmation: true,
                })
                .select("id")
                .single();
              if (error) { result = { error: "Could not record confirmation request" }; }
              else {
                send({
                  type: "tool_use_requires_confirmation",
                  tool_name: tu.name,
                  tool_input: tu.input,
                  summary: describeAction(tu.name, tu.input),
                  message_id: pending.id,
                });
                const outcome = await waitForConfirmation(supabase, pending.id);
                if (outcome === "approved") {
                  result = await runTool(tu.name, tu.input, ctx);
                } else if (outcome === "cancelled") {
                  result = { cancelled: true, reason: "Operator cancelled the action." };
                } else {
                  result = { error: "Confirmation timed out" };
                }
                await supabase.from("operator_chat_messages").update({ tool_result: result }).eq("id", pending.id);
              }
            } else {
              send({ type: "tool_use_started", tool_name: tu.name, tool_input: tu.input, message_id: tu.id });
              result = await runTool(tu.name, tu.input, ctx);
            }

            send({ type: "tool_result", message_id: tu.id, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: typeof result === "string" ? result : JSON.stringify(result).slice(0, 30000),
            });
          }

          // Persist tool results as a user-role message
          await supabase.from("operator_chat_messages").insert({
            chat_id: chatId,
            role: "tool_result",
            content: toolResults,
          });
          convo = [...convo, { role: "user", content: toolResults }];
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
