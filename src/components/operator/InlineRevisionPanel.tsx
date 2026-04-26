import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, CheckCircle2, AlertCircle, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  clientId: string;
}

type Status = "idle" | "running" | "success" | "error";

const PAGE_OPTIONS = [
  { value: "index.html", label: "Homepage" },
  { value: "about.html", label: "About" },
  { value: "services.html", label: "Services" },
  { value: "contact.html", label: "Contact" },
  { value: "all", label: "All pages" },
];

export function InlineRevisionPanel({ clientId }: Props) {
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");
  const [page, setPage] = useState<string>("index.html");
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["operator-edits-history", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operator_edits" as any)
        .select("id, instruction, status, created_at, error_message")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleApply = async () => {
    const text = instruction.trim();
    if (!text) return;
    setStatus("running");
    setStatusMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("quick-edit-html", {
        body: { client_id: clientId, instruction: text, page },
      });
      if (error) throw new Error(error.message || "Edit failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      setStatus("success");
      setStatusMsg("✓ Changes applied");
      setInstruction("");
      queryClient.invalidateQueries({ queryKey: ["operator-site-build", clientId] });
      refetchHistory();
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e?.message || "Edit failed");
    }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-muted/20 p-3 space-y-3">
      <div className="text-sm font-medium flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" />
        Quick revision ♛
      </div>

      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="flex-1">
          <Textarea
            placeholder="Describe the change — e.g. 'Change the hero headline to Phoenix's Most Trusted Plumber'"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            disabled={status === "running"}
          />
        </div>
        <div className="sm:w-44 flex flex-col gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Which page?</label>
            <Select value={page} onValueChange={setPage} disabled={status === "running"}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleApply}
            disabled={!instruction.trim() || status === "running"}
            className="gap-2 w-full"
            size="sm"
          >
            {status === "running" ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Applying...</>
            ) : (
              <><Send className="h-4 w-4" /> Apply</>
            )}
          </Button>
        </div>
      </div>

      {status === "success" && (
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> {statusMsg}
        </div>
      )}
      {status === "error" && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" /> Recent edits
          </div>
          <ul className="space-y-1.5">
            {history.map((h: any) => (
              <li key={h.id} className="text-xs flex items-start gap-2">
                <Badge
                  variant="outline"
                  className={
                    h.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200 text-[10px] shrink-0"
                      : "bg-destructive/10 text-destructive border-destructive/20 text-[10px] shrink-0"
                  }
                >
                  {h.status === "completed" ? "✓" : "✗"}
                </Badge>
                <span className="flex-1 truncate" title={h.instruction}>
                  {h.instruction}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
