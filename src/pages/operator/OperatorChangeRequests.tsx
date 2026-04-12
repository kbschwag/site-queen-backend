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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, MessageSquare, CheckCircle2, Clock, User } from "lucide-react";
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
  clients: { business_name: string; business_type: string; plan: string } | null;
}

export default function OperatorChangeRequests() {
  const { user } = useAuth();
  const { isOwner, isPartner } = useOperatorRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState<ChangeRequestWithClient | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["operator-change-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("*, clients(business_name, business_type, plan)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ChangeRequestWithClient[];
    },
  });

  // Fetch staff profiles for assignment
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
      (r.clients?.business_name || "").toLowerCase().includes(search.toLowerCase());
    if (tab === "pending") return matchesSearch && r.status === "pending";
    if (tab === "in_progress") return matchesSearch && r.status === "in_progress";
    if (tab === "completed") return matchesSearch && r.status === "completed";
    return matchesSearch;
  });

  const statusBadge = (status: string | null) => {
    if (status === "pending") return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    if (status === "in_progress") return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">In Progress</Badge>;
    if (status === "completed") return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    return <Badge variant="outline">{status || "—"}</Badge>;
  };

  const handleAssign = async (crId: string, userId: string) => {
    await supabase.from("change_requests").update({ assigned_to: userId, status: "in_progress" }).eq("id", crId);
    await supabase.from("audit_log").insert({
      user_id: user!.id,
      user_email: user!.email,
      action: `Assigned change request`,
      target_table: "change_requests",
      target_id: crId,
      details: { assigned_to: userId },
    });
    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success("Request assigned");
    // Refresh selected
    const { data } = await supabase.from("change_requests").select("*, clients(business_name, business_type, plan)").eq("id", crId).single();
    if (data) setSelected(data as ChangeRequestWithClient);
  };

  const handleStartWork = async (crId: string) => {
    await supabase.from("change_requests").update({ status: "in_progress", assigned_to: user!.id }).eq("id", crId);
    await supabase.from("audit_log").insert({
      user_id: user!.id, user_email: user!.email,
      action: `Started working on change request`,
      target_table: "change_requests", target_id: crId,
    });
    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success("Marked as in progress");
    const { data } = await supabase.from("change_requests").select("*, clients(business_name, business_type, plan)").eq("id", crId).single();
    if (data) setSelected(data as ChangeRequestWithClient);
  };

  const handleComplete = async () => {
    if (!selected) return;
    setLoading(true);

    await supabase.from("change_requests").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      admin_notes: selected.admin_notes
        ? `${selected.admin_notes}\n[Completed]: ${completionNote}`
        : `[Completed]: ${completionNote}`,
    }).eq("id", selected.id);

    // Send completion email to client
    const { data: client } = await supabase.from("clients").select("*").eq("id", selected.client_id).single();
    if (client) {
      // Look up email from profiles using user_id
      if (client.user_id) {
        const { data: profile } = await supabase.from("profiles").select("email").eq("user_id", client.user_id).single();
        if (profile?.email) {
          supabase.functions.invoke("send-email", {
            body: {
              to: profile.email,
              template: "change_request_completed",
              data: { business_name: client.business_name, site_url: client.site_url || "" },
              clientId: client.id,
            },
          }).catch(console.error);
        }
      }
    }

    await supabase.from("audit_log").insert({
      user_id: user!.id, user_email: user!.email,
      action: `Completed change request for ${selected.clients?.business_name}`,
      target_table: "change_requests", target_id: selected.id,
    });

    queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    toast.success("Change request completed! Client notified.");
    setShowCompleteModal(false);
    setCompletionNote("");
    setSelected(null);
    setLoading(false);
  };

  const assigneeName = (userId: string | null) => {
    if (!userId) return null;
    const profile = staffProfiles.find((p: any) => p.user_id === userId);
    return profile?.full_name || profile?.email || "Assigned";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Change Requests</h1>
          <p className="text-muted-foreground text-sm">
            {requests.filter((r) => r.status === "pending").length} pending · {requests.filter((r) => r.status === "in_progress").length} in progress
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search requests..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({requests.filter((r) => r.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress ({requests.filter((r) => r.status === "in_progress").length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({requests.filter((r) => r.status === "completed").length})</TabsTrigger>
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
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell>
                      <p className="font-medium text-sm">{r.clients?.business_name || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm truncate max-w-[250px]">{r.request_text}</p>
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>
                      {r.ai_processed ? (
                        <Badge variant="outline" className="text-xs">Classified</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.assigned_to ? (
                        <span className="text-sm flex items-center gap-1"><User className="h-3 w-3" />{assigneeName(r.assigned_to)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
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
              <div className="flex items-center gap-2">
                {statusBadge(selected.status)}
                {selected.ai_processed && <Badge variant="outline" className="text-xs">AI Classified</Badge>}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">{selected.clients?.business_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{selected.clients?.plan} plan</p>
              </div>

              <Separator />

              <div>
                <p className="text-sm text-muted-foreground mb-1">Request</p>
                <p className="text-sm bg-muted p-3 rounded-lg">{selected.request_text}</p>
              </div>

              {selected.attachment_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Attachment</p>
                  <a href={selected.attachment_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                    View attachment →
                  </a>
                </div>
              )}

              {selected.admin_notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Admin Notes</p>
                  <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap">{selected.admin_notes}</pre>
                </div>
              )}

              <Separator />

              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{format(new Date(selected.created_at), "MMM d, yyyy h:mm a")}</span></div>
                {selected.completed_at && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{format(new Date(selected.completed_at), "MMM d, yyyy h:mm a")}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Assigned to</span><span>{assigneeName(selected.assigned_to) || "Unassigned"}</span></div>
              </div>

              <Separator />

              {/* Actions */}
              {selected.status !== "completed" && (
                <div className="space-y-2">
                  {/* Assignment (owner/partner only) */}
                  {(isOwner || isPartner) && staffProfiles.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground">Assign to</label>
                      <select
                        className="w-full border rounded-md p-2 text-sm mt-1"
                        value={selected.assigned_to || ""}
                        onChange={(e) => handleAssign(selected.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {staffProfiles.map((p: any) => (
                          <option key={p.user_id} value={p.user_id}>
                            {p.full_name || p.email} ({p.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selected.status === "pending" && (
                    <Button className="w-full" onClick={() => handleStartWork(selected.id)}>
                      Start Working
                    </Button>
                  )}

                  {(selected.status === "in_progress" || selected.status === "pending") && (
                    <Button
                      className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setShowCompleteModal(true)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark Complete
                    </Button>
                  )}
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Complete modal */}
      <Dialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Change Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will mark the request as completed and notify the client via email.
            </p>
            <Textarea
              placeholder="Completion notes (optional)..."
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteModal(false)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {loading ? "Completing..." : <><CheckCircle2 className="h-4 w-4" /> Confirm Complete</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
