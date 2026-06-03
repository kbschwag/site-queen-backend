import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Paperclip, Check, X, ChevronDown, ChevronRight, Wrench, Undo2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clientId: string;
}

type ToolRun = {
  message_id: string;
  tool_name: string;
  tool_input: any;
  result?: any;
  success?: boolean;
  status: "running" | "done";
};

type WriteRecord = {
  type: "file_edit" | "intake_update" | "staging_push";
  filename?: string;
  field?: string;
  status: "success" | "partial" | "failed";
  message: string;
  staging_url?: string;
  staging_verified?: boolean;
  staging_error?: string;
};

type TurnSummary = {
  message_id: string;
  writes: WriteRecord[];
  any_failures: boolean;
  staging_url: string;
  undo_available: boolean;
  undo_token: string;
  undone?: boolean;
};

type RenderedMsg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolRuns: ToolRun[]; summary?: TurnSummary }
  | { kind: "system"; note: string };

const CLAUDE_SAFE_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;

type ChatAttachment = { url: string; name: string; type: "image" | "file"; mime_type: string; size?: number };

function extensionFor(file: File): string {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return (file.name.split(".").pop() || "file").replace(/[^a-z0-9]/gi, "").toLowerCase() || "file";
}

async function prepareChatAttachment(file: File): Promise<{ file: File; mimeType: string; displayName: string; optimized: boolean }> {
  const inferredType = file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "application/octet-stream");
  const isCompressibleImage = ["image/jpeg", "image/png", "image/webp"].includes(inferredType);
  if (!isCompressibleImage || file.size <= CLAUDE_SAFE_IMAGE_BYTES) {
    return { file, mimeType: inferredType, displayName: file.name, optimized: false };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { file, mimeType: inferredType, displayName: file.name, optimized: false };
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) return { file, mimeType: inferredType, displayName: file.name, optimized: false };

  const optimizedName = file.name.replace(/\.[^.]+$/, "") + "-optimized.jpg";
  return {
    file: new File([blob], optimizedName, { type: "image/jpeg" }),
    mimeType: "image/jpeg",
    displayName: optimizedName,
    optimized: true,
  };
}

export function OperatorChatPanel({ clientId }: Props) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RenderedMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: chat } = await supabase
        .from("operator_chats" as any)
        .select("id")
        .eq("client_id", clientId)
        .eq("operator_id", user.id)
        .eq("archived", false)
        .maybeSingle();
      if (!chat) return;
      setChatId((chat as any).id);
      const { data: msgs } = await supabase
        .from("operator_chat_messages" as any)
        .select("*")
        .eq("chat_id", (chat as any).id)
        .order("created_at", { ascending: true });
      setMessages(reduceHistory((msgs || []) as any[]));
    })();
  }, [clientId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentUploading(true);
    try {
      const prepared = await prepareChatAttachment(file);
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFor(prepared.file)}`;
      const path = `${clientId}/chat/${safeName}`;
      const { error } = await supabase.storage.from("client-uploads").upload(path, prepared.file, {
        upsert: false,
        contentType: prepared.mimeType,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("client-uploads").getPublicUrl(path);
      setAttachments((prev) => [...prev, {
        url: data.publicUrl,
        name: prepared.displayName,
        mime_type: prepared.mimeType,
        type: prepared.mimeType.startsWith("image/") ? "image" : "file",
        size: prepared.file.size,
      }]);
      if (prepared.optimized) toast.success("Large image optimized for Claude.");
    } catch (error: any) {
      toast.error(error?.message || "Upload failed");
    } finally {
      setAttachmentUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUndo = async (messageId: string) => {
    if (!chatId) return;
    const { data, error } = await supabase.functions.invoke("operator-chat-undo", {
      body: { chat_id: chatId, message_id: messageId },
    });
    if (error) { toast.error(error.message); return; }
    const restored = (data?.results || []).filter((r: any) => r.status === "restored" || r.status === "restored_storage_only").length;
    toast.success(`Reverted ${restored} file(s) to previous version.`);
    setMessages((prev) => {
      const next = [...prev];
      for (const m of next) {
        if (m.kind === "assistant" && m.summary?.message_id === messageId) m.summary.undone = true;
      }
      next.push({ kind: "system", note: `↶ Undone — reverted ${restored} file(s) to their state before that change.` });
      return next;
    });
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const userText = input.trim();
    const userAttachments = attachments;
    setInput("");
    setAttachments([]);
    setSending(true);
    setMessages((prev) => [...prev, { kind: "user", text: userText }, { kind: "assistant", text: "", toolRuns: [] }]);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      // Refresh if token is missing or expires within 60s
      const expSoon = session?.expires_at ? (session.expires_at * 1000 - Date.now()) < 60_000 : true;
      if (!session || expSoon) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshed.session) {
          toast.error("Session expired. Please sign in again.");
          setSending(false);
          return;
        }
        session = refreshed.session;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          chat_id: chatId,
          client_id: clientId,
          user_message: userText,
          attachments: userAttachments,
        }),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text();
        throw new Error(t || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            handleEvent(ev);
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Chat failed");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") last.text = (last.text || "") + `\n\n[error: ${e.message || e}]`;
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  const handleEvent = (ev: any) => {
    if (ev.type === "chat_created") {
      setChatId(ev.chat_id);
    } else if (ev.type === "text_delta") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") last.text = (last.text || "") + ev.text;
        return next;
      });
    } else if (ev.type === "tool_use_started") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") {
          last.toolRuns = [...last.toolRuns, { message_id: ev.message_id, tool_name: ev.tool_name, tool_input: ev.tool_input, status: "running" }];
        }
        return next;
      });
    } else if (ev.type === "tool_result") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") {
          const run = last.toolRuns.find((r) => r.message_id === ev.message_id);
          if (run) { run.status = "done"; run.result = ev.result; run.success = ev.success; }
          else last.toolRuns = [...last.toolRuns, { message_id: ev.message_id, tool_name: "(tool)", tool_input: {}, status: "done", result: ev.result, success: ev.success }];
        }
        return next;
      });
    } else if (ev.type === "turn_summary") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") {
          last.summary = {
            message_id: ev.message_id,
            writes: ev.writes || [],
            any_failures: !!ev.any_failures,
            staging_url: ev.staging_url,
            undo_available: !!ev.undo_available,
            undo_token: ev.undo_token,
          };
        }
        return next;
      });
    } else if (ev.type === "error") {
      toast.error(ev.error);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border rounded-lg">
      <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">
              Talk to Claude about this site. Ask for edits, new pages, fixes, or audits — changes deploy immediately, and you can undo any change in one click.
            </div>
          )}
          {messages.map((m, i) => {
            if (m.kind === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm">{m.text}</div>
                </div>
              );
            }
            if (m.kind === "system") {
              return <div key={i} className="text-xs text-muted-foreground italic px-2">{m.note}</div>;
            }
            return (
              <div key={i} className="space-y-2">
                {m.text && <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>}
                {m.toolRuns.map((r) => <ToolRunRow key={r.message_id} run={r} />)}
                {m.summary && <TurnSummaryCard summary={m.summary} onUndo={handleUndo} />}
              </div>
            );
          })}
          {sending && messages[messages.length - 1]?.kind === "assistant" && !(messages[messages.length - 1] as any)?.text && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t p-3 space-y-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {attachments.map((a, i) => (
              <span key={i} className="bg-muted px-2 py-1 rounded flex items-center gap-1">
                {a.name}
                <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleAttach} />
          <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending || attachmentUploading}>
            {attachmentUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Tell Claude what to change..."
            rows={2}
            className="resize-none"
            disabled={sending}
          />
          <Button onClick={send} disabled={sending || attachmentUploading || !input.trim()} size="icon">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolRunRow({ run }: { run: ToolRun }) {
  const [open, setOpen] = useState(false);
  const failed = run.status === "done" && run.success === false;
  const label = friendlyToolLabel(run.tool_name, run.tool_input);
  return (
    <div className="text-xs border rounded bg-muted/40">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-3 w-3" />
        <span className="flex-1 truncate">{label}</span>
        {run.status === "running"
          ? <Loader2 className="h-3 w-3 animate-spin" />
          : failed
            ? <X className="h-3 w-3 text-destructive" />
            : <Check className="h-3 w-3 text-green-600" />}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          <pre className="text-[10px] bg-background p-2 rounded overflow-auto max-h-40">{JSON.stringify(run.tool_input, null, 2)}</pre>
          {run.result !== undefined && (
            <pre className="text-[10px] bg-background p-2 rounded overflow-auto max-h-40">{JSON.stringify(run.result, null, 2).slice(0, 2000)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function friendlyToolLabel(name: string, input: any): string {
  const f = input?.filename ? ` ${input.filename}` : "";
  switch (name) {
    case "apply_site_change": return input?.filename ? `Applying change${f}` : `Applying site change`;
    case "read_deployed_file": return `Reading${f}`;
    case "list_deployed_files": return `Listing site files`;
    case "edit_deployed_file": return `Editing${f}`;
    case "write_deployed_file": return `Rewriting${f}`;
    case "read_template_file": return `Reading template${f}`;
    case "read_intake_field": return `Reading intake: ${input?.field_name || ""}`;
    case "read_full_intake": return `Reading intake`;
    case "update_intake_field": return `Updating intake: ${input?.field_name || ""}`;
    case "list_uploaded_media": return `Listing uploads`;
    case "push_to_staging": return `Pushing to staging`;
    case "list_snapshots": return `Listing snapshots`;
    case "read_call_notes": return `Reading call notes`;
    case "read_application": return `Reading application`;
    default: return name;
  }
}


function TurnSummaryCard({ summary, onUndo }: { summary: TurnSummary; onUndo: (id: string) => void }) {
  const [undoing, setUndoing] = useState(false);
  const fileEdits = summary.writes.filter((w) => w.type === "file_edit");
  const intakeUpdates = summary.writes.filter((w) => w.type === "intake_update");
  const stagingPushes = summary.writes.filter((w) => w.type === "staging_push");

  const borderColor = summary.any_failures ? "border-amber-500/60" : "border-green-500/60";
  const bgColor = summary.any_failures ? "bg-amber-50 dark:bg-amber-950/30" : "bg-green-50 dark:bg-green-950/20";
  const Icon = summary.any_failures ? AlertTriangle : Check;
  const iconColor = summary.any_failures ? "text-amber-600" : "text-green-600";
  const title = summary.undone
    ? "↶ Changes undone"
    : summary.any_failures ? "Partial success" : "Changes applied";

  return (
    <div className={`border-2 ${borderColor} ${bgColor} rounded-lg p-3 space-y-2`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 ${iconColor} mt-0.5 shrink-0`} />
        <div className="text-sm font-medium">{title}</div>
      </div>
      <div className="text-xs space-y-1 pl-6">
        {fileEdits.length > 0 && (
          <div>
            <div className="font-medium">Updated {fileEdits.length} file{fileEdits.length === 1 ? "" : "s"}:</div>
            <ul className="ml-2">
              {fileEdits.map((w, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className={w.status === "success" ? "text-green-600" : w.status === "partial" ? "text-amber-600" : "text-destructive"}>
                    {w.status === "success" ? "✓" : w.status === "partial" ? "⚠" : "✗"}
                  </span>
                  <span className="font-mono">{w.filename}</span>
                  <span className="text-muted-foreground">— {w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {intakeUpdates.length > 0 && (
          <div>Updated intake: {intakeUpdates.map((w) => w.field).join(", ")}</div>
        )}
        {stagingPushes.length > 0 && (
          <div>
            Staging pushes: {stagingPushes.filter((w) => w.status === "success").length} ok, {stagingPushes.filter((w) => w.status !== "success").length} failed
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {summary.staging_url && (
          <a href={summary.staging_url} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="text-xs">
              <ExternalLink className="h-3 w-3 mr-1" />View on staging
            </Button>
          </a>
        )}
        {summary.undo_available && !summary.undone && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            disabled={undoing}
            onClick={async () => {
              setUndoing(true);
              try { await onUndo(summary.undo_token); } finally { setUndoing(false); }
            }}
          >
            {undoing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Undo2 className="h-3 w-3 mr-1" />}
            Undo these changes
          </Button>
        )}
      </div>
    </div>
  );
}

function summarizeInput(input: any): string {
  if (!input || typeof input !== "object") return "";
  const keys = Object.keys(input);
  if (keys.length === 0) return "";
  const first = keys[0];
  const v = input[first];
  return `${first}: ${typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60)}`;
}

function reduceHistory(rows: any[]): RenderedMsg[] {
  const out: RenderedMsg[] = [];
  let skipNextLegacyRewriteResult = false;
  for (const row of rows) {
    if (skipNextLegacyRewriteResult && row.role === "tool_result") {
      skipNextLegacyRewriteResult = false;
      continue;
    }
    skipNextLegacyRewriteResult = false;
    if (row.role === "user") {
      const text = Array.isArray(row.content) ? row.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : String(row.content || "");
      out.push({ kind: "user", text });
    } else if (row.role === "assistant") {
      const blocks = Array.isArray(row.content) ? row.content : [];
      if (blocks.some((b: any) => b.type === "tool_use" && b.name === "write_deployed_file" && (!b.input || Object.keys(b.input).length === 0))) {
        skipNextLegacyRewriteResult = true;
        continue;
      }
      const text = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const toolRuns: ToolRun[] = blocks.filter((b: any) => b.type === "tool_use").map((b: any) => ({
        message_id: b.id, tool_name: b.name, tool_input: b.input, status: "done", result: undefined,
      }));
      out.push({ kind: "assistant", text, toolRuns });
    } else if (row.role === "tool_result" && Array.isArray(row.content)) {
      const last = out[out.length - 1];
      if (last?.kind === "assistant") {
        for (const tr of row.content) {
          const run = last.toolRuns.find((r) => r.message_id === tr.tool_use_id);
          if (run) try { run.result = JSON.parse(tr.content); } catch { run.result = tr.content; }
        }
      }
    } else if (row.role === "system_note" && row.content?.type === "undo") {
      const restored = (row.content.results || []).filter((r: any) => r.status === "restored" || r.status === "restored_storage_only").length;
      out.push({ kind: "system", note: `↶ Undone — reverted ${restored} file(s) to their state before that change.` });
      // Mark the prior assistant summary as undone
      for (let i = out.length - 2; i >= 0; i--) {
        const m = out[i];
        if (m.kind === "assistant" && m.summary?.message_id === row.content.undone_message_id) {
          m.summary.undone = true;
          break;
        }
      }
    }
  }
  return out;
}
