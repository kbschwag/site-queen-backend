import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clock, Loader2, AlertCircle, Eye, Zap, ChevronDown, ChevronUp, Coins, HelpCircle, Send } from "lucide-react";
import { format } from "date-fns";
import { useFileUpload } from "@/hooks/useFileUpload";
import { toast } from "sonner";

interface MyTicketsProps {
  changeRequests: any[];
  clientId?: string;
}

const statusConfig: Record<string, { icon: any; label: string; class: string }> = {
  submitted: { icon: Clock, label: "Submitted", class: "bg-amber-500/10 text-amber-700 border-amber-200" },
  pending_assessment: { icon: Eye, label: "Pending credit confirmation", class: "bg-purple-500/10 text-purple-700 border-purple-200" },
  in_review: { icon: Eye, label: "In review", class: "bg-blue-500/10 text-blue-700 border-blue-200" },
  in_progress: { icon: Loader2, label: "In progress", class: "bg-blue-500/10 text-blue-700 border-blue-200" },
  awaiting_info: { icon: HelpCircle, label: "Awaiting your response", class: "bg-amber-500/10 text-amber-700 border-amber-200" },
  completed: { icon: CheckCircle2, label: "Completed", class: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  declined: { icon: AlertCircle, label: "Declined", class: "bg-destructive/10 text-destructive border-destructive/20" },
  pending: { icon: Clock, label: "Submitted", class: "bg-amber-500/10 text-amber-700 border-amber-200" },
};

export function MyTickets({ changeRequests, clientId }: MyTicketsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyAttachmentUrl, setReplyAttachmentUrl] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);
  const queryClient = useQueryClient();
  const { uploadFile, uploading } = useFileUpload(clientId || "");

  // Separate pre-launch from regular tickets
  const regularTickets = changeRequests.filter((cr) => !cr.is_pre_launch);
  const preLaunchTickets = changeRequests.filter((cr) => cr.is_pre_launch);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, "replies");
    if (url) setReplyAttachmentUrl(url);
  };

  const handleReply = async (crId: string) => {
    if (!replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const attachments = replyAttachmentUrl ? [replyAttachmentUrl] : [];
      await supabase.from("change_requests").update({
        client_info_response: replyText,
        client_info_attachments: attachments.length > 0 ? attachments : null,
        status: "in_progress",
      } as any).eq("id", crId);

      // Notify operator via notification + email
      await supabase.from("notifications").insert({
        type: "client_responded_info",
        client_id: clientId,
        message: `Client responded to info request`,
        target_role: "operator",
      } as any);

      // Send operator email
      const { data: clientRec } = await supabase.from("clients").select("business_name").eq("id", clientId).single();
      supabase.functions.invoke("send-email", {
        body: {
          to: "hello@sitequeen.ai",
          template: "client_responded_info",
          data: {
            business_name: clientRec?.business_name || "Unknown",
            response_text: replyText,
            has_attachments: !!replyAttachmentUrl,
          },
          clientId,
        },
      }).catch(console.error);

      toast.success("Response sent! Our team will continue working on your request.");
      setReplyText("");
      setReplyAttachmentUrl(null);
      queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmittingReply(false);
    }
  };

  const renderTicketCard = (cr: any) => {
    const cfg = statusConfig[cr.status || "pending"] || statusConfig.pending;
    const StatusIcon = cfg.icon;
    const isExpanded = expanded === cr.id;
    const isAwaitingInfo = cr.status === "awaiting_info";

    return (
      <Card key={cr.id} className={`cursor-pointer ${isAwaitingInfo ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/10" : ""}`} onClick={() => setExpanded(isExpanded ? null : cr.id)}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {cr.change_type && <span className="text-sm font-medium">{cr.change_type}</span>}
                {cr.priority === "urgent" && <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-[10px] px-1.5"><Zap className="h-2.5 w-2.5 mr-0.5" />Urgent</Badge>}
              </div>
              <p className="text-sm text-muted-foreground truncate">{cr.request_text}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{format(new Date(cr.created_at), "MMM d, yyyy")}</span>
                {cr.credits_cost != null && cr.credits_cost > 0 && !cr.is_pre_launch && (
                  <span className="flex items-center gap-0.5"><Coins className="h-3 w-3" />{cr.credits_cost} credits</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={cfg.class}>
                <StatusIcon className={`h-3 w-3 mr-1 ${cr.status === "in_progress" ? "animate-spin" : ""}`} />
                {cfg.label}
              </Badge>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {isExpanded && (
            <div className="mt-3 pt-3 border-t space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
              <div>
                <p className="text-muted-foreground text-xs mb-1">Full description</p>
                <p className="whitespace-pre-wrap">{cr.request_text}</p>
              </div>
              {cr.attachment_url && (
                <div>
                  <a href={cr.attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">View attachment →</a>
                </div>
              )}

              {/* Awaiting info — show operator question and reply area */}
              {isAwaitingInfo && cr.needs_info_note && (
                <div className="space-y-3">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-800 mb-1">We need more information:</p>
                    <p className="text-sm">{cr.needs_info_note}</p>
                  </div>
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Type your response..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                    <div>
                      <Input type="file" accept="image/*,.pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} className="text-xs" />
                      {replyAttachmentUrl && <p className="text-xs text-emerald-600 mt-1">✓ File attached</p>}
                    </div>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => handleReply(cr.id)}
                      disabled={!replyText.trim() || submittingReply}
                    >
                      {submittingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Send response
                    </Button>
                  </div>
                </div>
              )}

              {/* Already responded */}
              {cr.client_info_response && cr.status !== "awaiting_info" && cr.needs_info_note && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-emerald-800 mb-1">Your response:</p>
                  <p className="text-sm">{cr.client_info_response}</p>
                </div>
              )}

              {!cr.is_pre_launch && cr.credits_cost != null && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Credits spent</span>
                  <span>{cr.credits_cost}</span>
                </div>
              )}
              {cr.priority && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Priority</span>
                  <span className="capitalize">{cr.priority}</span>
                </div>
              )}
              {cr.status === "completed" && cr.admin_notes && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Completion notes</p>
                  <p className="text-xs bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded">{cr.admin_notes}</p>
                </div>
              )}
              {cr.status === "declined" && (
                <div className="bg-destructive/5 p-2 rounded text-xs">
                  <p className="text-destructive font-medium">Request declined</p>
                  {cr.admin_notes && <p className="mt-1">{cr.admin_notes}</p>}
                  {cr.credits_cost > 0 && !cr.is_pre_launch && <p className="text-emerald-600 mt-1">✓ {cr.credits_cost} credits refunded</p>}
                </div>
              )}
              {cr.completed_at && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Completed</span>
                  <span>{format(new Date(cr.completed_at), "MMM d, yyyy h:mm a")}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (changeRequests.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No requests yet.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Regular tickets */}
      {regularTickets.length > 0 && (
        <div className="space-y-3">
          {regularTickets.map(renderTicketCard)}
        </div>
      )}

      {/* Pre-launch feedback (separate section) */}
      {preLaunchTickets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Pre-launch feedback
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">No credits used</Badge>
          </h3>
          {preLaunchTickets.map(renderTicketCard)}
        </div>
      )}
    </div>
  );
}
