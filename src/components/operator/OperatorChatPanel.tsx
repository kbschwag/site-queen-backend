import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Paperclip, Check, X, ChevronDown, ChevronRight, AlertTriangle, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
}

type Pending = {
  message_id: string;
  tool_name: string;
  tool_input: any;
  summary: string;
};

type ToolRun = {
  message_id: string;
  tool_name: string;
  tool_input: any;
  result?: any;
  status: "running" | "done";
};

type RenderedMsg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; toolRuns: ToolRun[]; pendings: Pending[] };

export function OperatorChatPanel({ clientId }: Props) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<RenderedMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: "image" | "file"; mime_type: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing history
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
    const path = `${clientId}/chat/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("client-uploads").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("client-uploads").getPublicUrl(path);
    setAttachments((prev) => [...prev, {
      url: data.publicUrl,
      name: file.name,
      mime_type: file.type,
      type: file.type.startsWith("image/") ? "image" : "file",
    }]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmAction = async (message_id: string, action: "approve" | "cancel") => {
    const { error } = await supabase.functions.invoke("operator-chat-confirm", { body: { message_id, action } });
    if (error) toast.error(error.message);
    // Optimistically remove the pending card
    setMessages((prev) => prev.map((m) => m.kind === "assistant" ? { ...m, pendings: m.pendings.filter(p => p.message_id !== message_id) } : m));
  };

  const send = async () => {
    if (!input.trim() || sending) return;
    const userText = input.trim();
    const userAttachments = attachments;
    setInput("");
    setAttachments([]);
    setSending(true);
    setMessages((prev) => [...prev, { kind: "user", text: userText }, { kind: "assistant", text: "", toolRuns: [], pendings: [] }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Not authenticated"); setSending(false); return; }
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
    } else if (ev.type === "tool_use_requires_confirmation") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") {
          last.pendings = [...last.pendings, { message_id: ev.message_id, tool_name: ev.tool_name, tool_input: ev.tool_input, summary: ev.summary }];
        }
        return next;
      });
    } else if (ev.type === "tool_result") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant") {
          const run = last.toolRuns.find((r) => r.message_id === ev.message_id);
          if (run) { run.status = "done"; run.result = ev.result; }
          else last.toolRuns = [...last.toolRuns, { message_id: ev.message_id, tool_name: "(tool)", tool_input: {}, status: "done", result: ev.result }];
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
              Talk to Claude about this site. Ask for edits, new pages, fixes, or audits — Claude will read the deployed files and propose changes.
            </div>
          )}
          {messages.map((m, i) => m.kind === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm">{m.text}</div>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {m.text && <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>}
              {m.toolRuns.map((r) => <ToolRunRow key={r.message_id} run={r} />)}
              {m.pendings.map((p) => (
                <ConfirmationCard key={p.message_id} pending={p} onApprove={() => confirmAction(p.message_id, "approve")} onCancel={() => confirmAction(p.message_id, "cancel")} />
              ))}
            </div>
          ))}
          {sending && messages[messages.length - 1]?.kind === "assistant" && !messages[messages.length - 1]?.text && (
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
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
          <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending}>
            <Paperclip className="h-4 w-4" />
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
          <Button onClick={send} disabled={sending || !input.trim()} size="icon">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolRunRow({ run }: { run: ToolRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs border rounded bg-muted/40">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-3 w-3" />
        <span className="font-mono">{run.tool_name}</span>
        <span className="text-muted-foreground flex-1 truncate">{summarizeInput(run.tool_input)}</span>
        {run.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
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

function ConfirmationCard({ pending, onApprove, onCancel }: { pending: Pending; onApprove: () => void; onCancel: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <div className="border-2 border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium">Claude wants to: <span className="font-mono text-xs bg-background px-1 rounded">{pending.tool_name}</span></div>
          <div className="text-sm mt-1">{pending.summary}</div>
        </div>
      </div>
      {showDetails && (
        <pre className="text-[10px] bg-background p-2 rounded overflow-auto max-h-60">{JSON.stringify(pending.tool_input, null, 2)}</pre>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove}><Check className="h-3 w-3 mr-1" />Approve</Button>
        <Button size="sm" variant="outline" onClick={() => setShowDetails((s) => !s)}>{showDetails ? "Hide" : "Show"} details</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-3 w-3 mr-1" />Cancel</Button>
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
  for (const row of rows) {
    if (row.role === "user") {
      const text = Array.isArray(row.content) ? row.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : String(row.content || "");
      out.push({ kind: "user", text });
    } else if (row.role === "assistant") {
      const blocks = Array.isArray(row.content) ? row.content : [];
      const text = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      const toolRuns: ToolRun[] = blocks.filter((b: any) => b.type === "tool_use").map((b: any) => ({
        message_id: b.id, tool_name: b.name, tool_input: b.input, status: "done", result: undefined,
      }));
      out.push({ kind: "assistant", text, toolRuns, pendings: [] });
    } else if (row.role === "tool_result" && Array.isArray(row.content)) {
      // Attach results to the previous assistant message's tool runs
      const last = out[out.length - 1];
      if (last?.kind === "assistant") {
        for (const tr of row.content) {
          const run = last.toolRuns.find((r) => r.message_id === tr.tool_use_id);
          if (run) try { run.result = JSON.parse(tr.content); } catch { run.result = tr.content; }
        }
      }
    }
  }
  return out;
}
