import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Clock, Loader2, AlertCircle, Eye, Zap, ChevronDown, ChevronUp, Coins } from "lucide-react";
import { format } from "date-fns";

interface MyTicketsProps {
  changeRequests: any[];
}

const statusConfig: Record<string, { icon: any; label: string; class: string }> = {
  submitted: { icon: Clock, label: "Submitted", class: "bg-amber-500/10 text-amber-700 border-amber-200" },
  pending_assessment: { icon: Eye, label: "Pending credit confirmation", class: "bg-purple-500/10 text-purple-700 border-purple-200" },
  in_review: { icon: Eye, label: "In review", class: "bg-blue-500/10 text-blue-700 border-blue-200" },
  in_progress: { icon: Loader2, label: "In progress", class: "bg-blue-500/10 text-blue-700 border-blue-200" },
  completed: { icon: CheckCircle2, label: "Completed", class: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  declined: { icon: AlertCircle, label: "Declined", class: "bg-destructive/10 text-destructive border-destructive/20" },
  pending: { icon: Clock, label: "Submitted", class: "bg-amber-500/10 text-amber-700 border-amber-200" },
};

export function MyTickets({ changeRequests }: MyTicketsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (changeRequests.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No requests yet.</p>;
  }

  return (
    <div className="space-y-3">
      {changeRequests.map((cr) => {
        const cfg = statusConfig[cr.status || "pending"] || statusConfig.pending;
        const StatusIcon = cfg.icon;
        const isExpanded = expanded === cr.id;

        return (
          <Card key={cr.id} className="cursor-pointer" onClick={() => setExpanded(isExpanded ? null : cr.id)}>
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
                    {cr.credits_cost != null && cr.credits_cost > 0 && (
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
                <div className="mt-3 pt-3 border-t space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Full description</p>
                    <p className="whitespace-pre-wrap">{cr.request_text}</p>
                  </div>
                  {cr.attachment_url && (
                    <div>
                      <a href={cr.attachment_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">View attachment →</a>
                    </div>
                  )}
                  {cr.credits_cost != null && (
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
                      {cr.credits_cost > 0 && <p className="text-emerald-600 mt-1">✓ {cr.credits_cost} credits refunded</p>}
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
      })}
    </div>
  );
}
