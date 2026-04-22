import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, Send, CheckCircle2, Search, Mail, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface SupportMsg {
  id: string;
  created_at: string;
  client_id: string | null;
  message: string;
  client_name: string | null;
  business_name: string | null;
  client_email: string | null;
  status: string;
  replied_at: string | null;
  reply_text: string | null;
}

export default function OperatorSupportMessages() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["operator-support-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SupportMsg[];
    },
    refetchInterval: 30000,
  });

  const filtered = messages.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.message.toLowerCase().includes(q) ||
      (m.client_name || "").toLowerCase().includes(q) ||
      (m.business_name || "").toLowerCase().includes(q) ||
      (m.client_email || "").toLowerCase().includes(q)
    );
  });

  const newCount = messages.filter((m) => m.status === "new").length;

  const markReplied = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("support_messages")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
          replied_by: user?.id || null,
        } as any)
        .eq("id", id);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["operator-support-messages"] }),
  });

  const sendReply = async (msg: SupportMsg) => {
    const text = (replyDrafts[msg.id] || "").trim();
    if (!text || !msg.client_email) {
      toast.error("Reply cannot be empty and client email is required");
      return;
    }
    setSendingId(msg.id);
    try {
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: msg.client_email,
          template: "support_message_reply",
          data: {
            name: msg.client_name,
            first_name: (msg.client_name || "").split(" ")[0],
            reply_text: text,
          },
          clientId: msg.client_id || undefined,
        },
      });
      if (error) throw error;

      await supabase
        .from("support_messages")
        .update({
          status: "replied",
          replied_at: new Date().toISOString(),
          replied_by: user?.id || null,
          reply_text: text,
        } as any)
        .eq("id", msg.id);

      setReplyDrafts((d) => ({ ...d, [msg.id]: "" }));
      toast.success("Reply sent ♛");
      queryClient.invalidateQueries({ queryKey: ["operator-support-messages"] });
    } catch (e: any) {
      toast.error("Failed to send reply", { description: e.message });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Support Messages</h1>
          <p className="text-sm text-muted-foreground">
            Messages from the client dashboard "Send us a message" form
          </p>
        </div>
        {newCount > 0 && (
          <Badge variant="default" className="bg-amber-500">
            {newCount} new
          </Badge>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client, business, message..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No support messages yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg) => (
            <Card key={msg.id}>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {msg.client_name || "Unknown"}
                        </span>
                        {msg.business_name && (
                          <span className="text-xs text-muted-foreground">
                            · {msg.business_name}
                          </span>
                        )}
                        {msg.status === "new" ? (
                          <Badge className="bg-amber-500 text-white text-[10px]">
                            New
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-white text-[10px]">
                            Replied
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {msg.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(msg.created_at), {
                          addSuffix: true,
                        })}{" "}
                        · {format(new Date(msg.created_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-3 border-t pt-3">
                    <div className="bg-muted/40 rounded-md p-3 text-sm whitespace-pre-wrap">
                      {msg.message}
                    </div>
                    {msg.client_email && (
                      <p className="text-xs text-muted-foreground">
                        Reply to:{" "}
                        <a
                          href={`mailto:${msg.client_email}`}
                          className="text-primary hover:underline"
                        >
                          {msg.client_email}
                        </a>
                      </p>
                    )}

                    {msg.status === "replied" && msg.reply_text && (
                      <div className="border-l-2 border-emerald-500 pl-3 text-sm">
                        <p className="text-xs text-muted-foreground mb-1">
                          Your reply
                          {msg.replied_at &&
                            ` · ${format(new Date(msg.replied_at), "MMM d, h:mm a")}`}
                        </p>
                        <p className="whitespace-pre-wrap">{msg.reply_text}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Type a quick reply — sends from hello@sitequeen.ai"
                        rows={3}
                        value={replyDrafts[msg.id] || ""}
                        onChange={(e) =>
                          setReplyDrafts((d) => ({
                            ...d,
                            [msg.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => sendReply(msg)}
                          disabled={
                            sendingId === msg.id ||
                            !(replyDrafts[msg.id] || "").trim()
                          }
                          className="gap-2"
                        >
                          {sendingId === msg.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          Send reply
                        </Button>
                        {msg.status === "new" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => markReplied.mutate(msg.id)}
                            className="gap-2"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Mark as replied
                          </Button>
                        )}
                        {msg.client_email && (
                          <Button asChild size="sm" variant="ghost" className="gap-2">
                            <a
                              href={`mailto:${msg.client_email}?subject=${encodeURIComponent(`Re: your SiteQueen message`)}`}
                            >
                              <Mail className="h-3 w-3" />
                              Open in email client
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
