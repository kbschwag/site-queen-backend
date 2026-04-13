import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, MessageSquare, CheckCircle2, Clock, User, Zap, Eye, AlertCircle, Coins, X } from "lucide-react";
import { format } from "date-fns";

interface ChangeRequestWithClient {
  id: string;
  request_text: string;
  status: string | null;
  ai_processed: boolean | null;
  admin_notes: string | null;
  assigned_to: string | null;
  attachment_url: string | null;
  completed_at: string | null;
  created_at: string;
  client_id: string;
  change_type: string | null;
  credits_cost: number | null;
  priority: string | null;
  operator_notes: string | null;
  assessed_by_operator: boolean | null;
  clients: { business_name: string; business_type: string; plan: string; credits_balance: number } | null;
}

export default function OperatorChangeRequests() {
  const { user } = useAuth();
  const { isOwner, isPartner } = useOperatorRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState<ChangeRequestWithClient | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [assessCredits, setAssessCredits] = useState("5");
  const [assessNote, setAssessNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["operator-change-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("*, clients(business_name, business_type, plan, credits_balance)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ChangeRequestWithClient[];
    },
  });

  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["operator-staff-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, role")
        .in("role", ["owner", "partner", "team_member"]);
      if (error) throw error;
      return data;
    },
    enabled: isOwner || isPartner,
  });

  const filtered = requests.filter((r) => {
    const matchesSearch =
      r.request_text.toLowerCase().includes(search.toLowerCase()) ||
      (r.clients?.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.change_type || "").toLowerCase().includes(search.toLowerCase());
    const matchesPriority = filterPriority === "all" || r.priority === filterPriority;
    const matchesPlan = filterPlan === "all" || r.clients?.plan === filterPlan;

    let matchesTab = true;
    if (tab === "pending") matchesTab = r.status === "submitted" || r.status === "pending";
    else if (tab === "in_progress") matchesTab = r.status === "in_review" || r.status === "in_progress";
    else if (tab === "completed") matchesTab = r.status === "completed";
    else if (tab === "assessment") matchesTab = r.status === "pending_assessment";

    return matchesSearch && matchesPriority && matchesPlan && matchesTab;
  }).sort((a, b) => {
    if (sortBy === "urgent") {
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (b.priority === "urgent" && a.priority !== "urgent") return 1;
    }
    if (sortBy === "credits") return (b.credits_cost || 0) - (a.credits_cost || 0);
    if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const statusBadge = (status: string | null) => {
    const configs: Record<string, { class: string; label: string; icon: any }> = {
      submitted: { class: "bg-amber-500/10 text-amber-700 border-amber-200", label: "Submitted", icon: Clock },
      pending: { class: "bg-amber-500/10 text-amber-700 border-amber-200", label: "Submitted", icon: Clock },
      pending_assessment: { class: "bg-purple-500/10 text-purple-700 border-purple-200", label: "Needs Assessment", icon: Eye },
      in_review: { class: "bg-blue-500/10 text-blue-700 border-blue-200", label: "In Review", icon: Eye },
      in_progress: { class: "bg-blue-500/10 text-blue-700 border-blue-200", label: "In Progress", icon: Clock },
      completed: { class: "bg-emerald-500/10 text-emerald-700 border-emerald-200", label: "Completed", icon: CheckCircle2 },
      declined: { class: "bg-destructive/10 text-destructive border-destructive/20", label: "Declined", icon: AlertCircle },
    };
    const cfg = configs[status || "pending"] || configs.pending;
    const Icon = cfg.icon;
    return <Badge className={cfg.class}><Icon className="h-3 w-3 mr-1" />{cfg.label}</Badge>;
  };

  const refreshSelected = async (id: string) => {
    const { data } = await supabase.from("change_requests").select("*, clients(business_name, business_type, plan, credits_balance)").eq("id", id).single();
    if (data) setSelected(data as ChangeRequestWithClient);
  };

  const handleStatusChange = async (crId: string, newStatus: string) => {
    await supabase.from("change_requests").update({ status: newStatus, ...(newStatus === "in_progress" || newStatus === "in_review" ? { assigned_to: user!.id } : {}) } as any).eq("id", crId);
    await supabase.from("audit_log").insert({ user_id: user!.id, user_email: user!.email, action: `Changed request status to ${newStatus}`, target_table: "change_requests", target_id: crId });
    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success(`Status updated to ${newStatus.replace("_", " ")}`);
    refreshSelected(crId);
  };

  const handleComplete = async () => {
    if (!selected || !completionNote.trim()) return;
    setLoading(true);
    await supabase.from("change_requests").update({ status: "completed", completed_at: new Date().toISOString(), admin_notes: completionNote, operator_notes: internalNotes || null } as any).eq("id", selected.id);
    await supabase.from("audit_log").insert({ user_id: user!.id, user_email: user!.email, action: `Completed change request for ${selected.clients?.business_name}`, target_table: "change_requests", target_id: selected.id });
    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success("Request completed! Client notified.");
    setShowCompleteModal(false); setCompletionNote(""); setInternalNotes(""); setSelected(null); setLoading(false);
  };

  const handleDecline = async () => {
    if (!selected || !declineReason.trim()) return;
    setLoading(true);
    const creditsCost = selected.credits_cost || 0;

    await supabase.from("change_requests").update({ status: "declined", admin_notes: declineReason } as any).eq("id", selected.id);

    // Refund credits
    if (creditsCost > 0) {
      const clientBalance = selected.clients?.credits_balance || 0;
      const newBalance = clientBalance + creditsCost;
      await supabase.from("clients").update({ credits_balance: newBalance } as any).eq("id", selected.client_id);
      await supabase.from("credits_transactions").insert({ client_id: selected.client_id, transaction_type: "refund", credits_amount: creditsCost, credits_balance_after: newBalance, description: `Refund for declined request: ${selected.change_type}`, change_request_id: selected.id } as any);
    }

    await supabase.from("audit_log").insert({ user_id: user!.id, user_email: user!.email, action: `Declined change request for ${selected.clients?.business_name}`, target_table: "change_requests", target_id: selected.id });
    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success("Request declined. Credits refunded.");
    setShowDeclineModal(false); setDeclineReason(""); setSelected(null); setLoading(false);
  };

  const handleAssessCredits = async () => {
    if (!selected) return;
    setLoading(true);
    const cost = parseInt(assessCredits);
    const clientBalance = selected.clients?.credits_balance || 0;

    if (clientBalance < cost) {
      toast.error("Client doesn't have enough credits");
      setLoading(false);
      return;
    }

    const newBalance = clientBalance - cost;
    await supabase.from("clients").update({ credits_balance: newBalance } as any).eq("id", selected.client_id);
    await supabase.from("change_requests").update({ credits_cost: cost, assessed_by_operator: true, status: "in_review", admin_notes: assessNote || null } as any).eq("id", selected.id);
    await supabase.from("credits_transactions").insert({ client_id: selected.client_id, transaction_type: "ticket_spent", credits_amount: -cost, credits_balance_after: newBalance, description: `Assessed: ${selected.change_type || "Custom request"} — ${cost} credits`, change_request_id: selected.id } as any);
    await supabase.from("audit_log").insert({ user_id: user!.id, user_email: user!.email, action: `Assessed change request at ${cost} credits`, target_table: "change_requests", target_id: selected.id });

    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success(`Assessed at ${cost} credits. Client charged.`);
    refreshSelected(selected.id);
    setLoading(false);
  };

  const assigneeName = (userId: string | null) => {
    if (!userId) return null;
    const profile = staffProfiles.find((p: any) => p.user_id === userId);
    return profile?.full_name || profile?.email || "Assigned";
  };

  const countByStatus = (s: string | string[]) => {
    const statuses = Array.isArray(s) ? s : [s];
    return requests.filter(r => statuses.includes(r.status || "")).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Change Requests</h1>
          <p className="text-muted-foreground text-sm">
            {countByStatus(["submitted", "pending"])} pending · {countByStatus(["in_review", "in_progress"])} in progress · {countByStatus("pending_assessment")} need assessment
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search requests..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPlan} onValueChange={setFilterPlan}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Plan" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="urgent">Urgent first</SelectItem>
            <SelectItem value="credits">Credits high→low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({countByStatus(["submitted", "pending"])})</TabsTrigger>
          <TabsTrigger value="assessment">Needs Assessment ({countByStatus("pending_assessment")})</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress ({countByStatus(["in_review", "in_progress"])})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({countByStatus("completed")})</TabsTrigger>
          <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No change requests found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Change Type</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className={`cursor-pointer ${r.priority === "urgent" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`} onClick={() => { setSelected(r); setInternalNotes(r.operator_notes || ""); }}>
                    <TableCell>
                      <p className="font-medium text-sm">{r.clients?.business_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{r.clients?.plan}</p>
                    </TableCell>
                    <TableCell><p className="text-sm">{r.change_type || "—"}</p></TableCell>
                    <TableCell>
                      {r.credits_cost != null ? (
                        <span className="text-sm flex items-center gap-1"><Coins className="h-3 w-3" />{r.credits_cost}</span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.priority === "urgent" ? (
                        <Badge className="bg-amber-500/10 text-amber-700 border-amber-200"><Zap className="h-3 w-3 mr-0.5" />Urgent</Badge>
                      ) : <span className="text-xs text-muted-foreground">Normal</span>}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>
                      {r.assigned_to ? (
                        <span className="text-sm flex items-center gap-1"><User className="h-3 w-3" />{assigneeName(r.assigned_to)}</span>
                      ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), "MMM d")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail panel */}
      {selected && (
        <Sheet open onOpenChange={() => setSelected(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Change Request</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {statusBadge(selected.status)}
                {selected.priority === "urgent" && <Badge className="bg-amber-500/10 text-amber-700 border-amber-200"><Zap className="h-3 w-3 mr-0.5" />Urgent</Badge>}
              </div>

              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="font-medium">{selected.clients?.business_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{selected.clients?.plan} plan · {selected.clients?.credits_balance ?? 0} credits remaining</p>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-1">Change Type</p>
                <p className="text-sm font-medium">{selected.change_type || "—"}</p>
                {selected.credits_cost != null && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Coins className="h-3 w-3" />{selected.credits_cost} credits</p>
                )}
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">Request</p>
                <p className="text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">{selected.request_text}</p>
              </div>

              {selected.attachment_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Attachment</p>
                  <a href={selected.attachment_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">View attachment →</a>
                </div>
              )}

              <Separator />

              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{format(new Date(selected.created_at), "MMM d, yyyy h:mm a")}</span></div>
                {selected.completed_at && <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{format(new Date(selected.completed_at), "MMM d, yyyy h:mm a")}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Assigned to</span><span>{assigneeName(selected.assigned_to) || "Unassigned"}</span></div>
              </div>

              <Separator />

              {/* Credit assessment for "Not sure" tickets */}
              {selected.status === "pending_assessment" && (
                <div className="border rounded-lg p-3 space-y-3 bg-purple-50/50 dark:bg-purple-950/10">
                  <p className="text-sm font-semibold text-purple-700">Credit Assessment Required</p>
                  <div>
                    <label className="text-xs text-muted-foreground">Credit cost</label>
                    <Select value={assessCredits} onValueChange={setAssessCredits}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 credits (Micro)</SelectItem>
                        <SelectItem value="15">15 credits (Content)</SelectItem>
                        <SelectItem value="30">30 credits (Medium)</SelectItem>
                        <SelectItem value="60">60 credits (Large)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Note to client</label>
                    <Textarea className="mt-1" rows={2} placeholder="Explain the cost..." value={assessNote} onChange={(e) => setAssessNote(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAssessCredits} disabled={loading} className="flex-1">
                      {loading ? "Processing..." : `Confirm ${assessCredits} credits`}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setShowDeclineModal(true)} className="shrink-0">
                      Decline
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions for non-completed tickets */}
              {selected.status !== "completed" && selected.status !== "declined" && selected.status !== "pending_assessment" && (
                <div className="space-y-2">
                  {(isOwner || isPartner) && staffProfiles.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground">Assign to</label>
                      <select className="w-full border rounded-md p-2 text-sm mt-1" value={selected.assigned_to || ""} onChange={(e) => {
                        supabase.from("change_requests").update({ assigned_to: e.target.value || null, status: "in_review" } as any).eq("id", selected.id).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
                          refreshSelected(selected.id);
                          toast.success("Assigned");
                        });
                      }}>
                        <option value="">Unassigned</option>
                        {staffProfiles.map((p: any) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email} ({p.role})</option>)}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-muted-foreground">Internal notes (not shown to client)</label>
                    <Textarea className="mt-1" rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal notes..." onBlur={() => {
                      supabase.from("change_requests").update({ operator_notes: internalNotes } as any).eq("id", selected.id);
                    }} />
                  </div>

                  <div className="flex gap-2">
                    {(selected.status === "submitted" || selected.status === "pending") && (
                      <Button className="flex-1" onClick={() => handleStatusChange(selected.id, "in_review")}>Start Review</Button>
                    )}
                    {selected.status === "in_review" && (
                      <Button className="flex-1" onClick={() => handleStatusChange(selected.id, "in_progress")}>Mark In Progress</Button>
                    )}
                    <Button className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowCompleteModal(true)}>
                      <CheckCircle2 className="h-4 w-4" /> Complete
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => setShowDeclineModal(true)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Complete modal */}
      <Dialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete Change Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Completion notes are shown to the client.</p>
            <Textarea placeholder="Explain what was done..." value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} rows={3} />
            <Textarea placeholder="Internal notes (optional, not shown to client)..." value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteModal(false)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={loading || !completionNote.trim()} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {loading ? "Completing..." : <><CheckCircle2 className="h-4 w-4" /> Confirm Complete</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline modal */}
      <Dialog open={showDeclineModal} onOpenChange={setShowDeclineModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline Change Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Credits will be fully refunded. Explain why the request is being declined.
            </p>
            <Textarea placeholder="Reason for declining..." value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline} disabled={loading || !declineReason.trim()}>
              {loading ? "Processing..." : "Decline & Refund Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
