import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WebsiteBriefPanel } from "@/components/operator/WebsiteBriefPanel";
import { WebsiteBuildPanel } from "@/components/operator/WebsiteBuildPanel";
import { DomainDeployTab } from "@/components/operator/DomainDeployTab";
import { CallNotesTab } from "@/components/operator/CallNotesTab";
import { SoftDeleteModal } from "@/components/operator/SoftDeleteModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Globe, ExternalLink, Users, Trash2, Mail, Loader2 } from "lucide-react";
import { format, differenceInDays } from "date-fns";

export default function OperatorClients() {
  const { user } = useAuth();
  const { isOwner } = useOperatorRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [resendingWelcome, setResendingWelcome] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["operator-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["operator-sites-status"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("client_id, generation_status");
      if (error) throw error;
      return data;
    },
  });

  const { data: lastTickets = [] } = useQuery({
    queryKey: ["operator-last-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests")
        .select("client_id, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Get latest per client
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { if (!map[r.client_id]) map[r.client_id] = r.created_at; });
      return map;
    },
  });

  const siteStatusMap = Object.fromEntries(sites.map((s: any) => [s.client_id, s.generation_status]));

  const filtered = clients.filter((c: any) => {
    const matchesSearch =
      c.business_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.business_type || "").toLowerCase().includes(search.toLowerCase());
    if (tab === "active") return matchesSearch && c.subscription_status === "active";
    if (tab === "building") return matchesSearch && c.site_status === "building";
    if (tab === "paused") return matchesSearch && c.subscription_status !== "active";
    return matchesSearch;
  });

  const statusBadge = (status: string | null) => {
    if (status === "active") return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Active</Badge>;
    if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
    if (status === "cancelled") return <Badge variant="destructive">Cancelled</Badge>;
    return <Badge variant="outline">{status || "—"}</Badge>;
  };

  const siteBadge = (status: string | null) => {
    if (status === "live") return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Live</Badge>;
    if (status === "building") return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Building</Badge>;
    if (status === "paused") return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Paused</Badge>;
    return <Badge variant="outline">{status || "—"}</Badge>;
  };

  const healthDot = (c: any) => {
    const isLive = c.site_status === "live";
    const isActive = c.subscription_status === "active";
    const lowCredits = (c.credits_balance ?? 0) <= 2;
    if (!isActive) return <span className="h-2.5 w-2.5 rounded-full bg-destructive inline-block" title="Payment issue" />;
    if (!isLive || lowCredits) return <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" title="Needs attention" />;
    return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" title="All good" />;
  };

  const planLabel = (plan: string) => {
    const map: Record<string, string> = { starter: "Starter — $79", growth: "Growth — $129", pro: "Pro — $199" };
    return map[plan] || plan;
  };

  const handleUpdateField = async (clientId: string, field: string, value: any) => {
    const updateData: Record<string, any> = { [field]: value };
    // When plan changes, also update credit allowance and rollover cap
    if (field === "plan") {
      const creditConfig: Record<string, { monthly: number; rollover: number }> = {
        starter: { monthly: 10, rollover: 20 },
        growth: { monthly: 30, rollover: 60 },
        pro: { monthly: 100, rollover: 200 },
      };
      const cfg = creditConfig[value] || creditConfig.starter;
      updateData.credits_monthly_allowance = cfg.monthly;
      updateData.credits_rollover_cap = cfg.rollover;
    }
    await supabase.from("clients").update(updateData as any).eq("id", clientId);
    await supabase.from("audit_log").insert({ user_id: user!.id, user_email: user!.email, action: `Updated client ${field} to ${value}`, target_table: "clients", target_id: clientId });
    queryClient.invalidateQueries({ queryKey: ["operator-clients"] });
    toast.success("Client updated");
    const { data } = await supabase.from("clients").select("*").eq("id", clientId).single();
    if (data) setSelected(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground text-sm">{clients.length} total clients</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({clients.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({clients.filter((c: any) => c.subscription_status === "active").length})</TabsTrigger>
          <TabsTrigger value="building">Building ({clients.filter((c: any) => c.site_status === "building").length})</TabsTrigger>
          <TabsTrigger value="paused">Paused ({clients.filter((c: any) => c.subscription_status !== "active").length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No clients found</p>
              <p className="text-xs mt-1">Approved applications will appear here as clients</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Last Ticket</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-primary/5 transition-colors" onClick={() => setSelected(c)}>
                    <TableCell>{healthDot(c)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{c.business_name}</p>
                          <p className="text-xs text-muted-foreground">{c.business_type}</p>
                        </div>
                        {siteStatusMap[c.id] === "complete" && (
                          <Badge className="bg-blue-500/10 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">Review</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{planLabel(c.plan)}</TableCell>
                    <TableCell>{statusBadge(c.subscription_status)}</TableCell>
                    <TableCell>{siteBadge(c.site_status)}</TableCell>
                    <TableCell className="text-sm">{c.credits_balance ?? 0} cr</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(lastTickets as any)[c.id] ? format(new Date((lastTickets as any)[c.id]), "MMM d") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.join_date ? format(new Date(c.join_date), "MMM d, yyyy") : "—"}</TableCell>
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
              <div className="flex items-center justify-between">
                <SheetTitle>{selected.business_name}</SheetTitle>
                {isOwner && (
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => {
                    setDeleteTarget({ id: selected.id, name: selected.business_name });
                    setShowDeleteModal(true);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </SheetHeader>

            {/* Quick stats bar */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold">{selected.join_date ? differenceInDays(new Date(), new Date(selected.join_date)) : 0}</p>
                <p className="text-[10px] text-muted-foreground">Days as client</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2 text-center">
                <p className="text-lg font-bold">{selected.credits_balance ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Credits balance</p>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-2 mt-3">
              <Badge className={selected.intake_completed ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200"}>
                Intake: {selected.intake_completed ? "Complete" : "Pending"}
              </Badge>
              <Badge className={(selected as any).call_notes_completed ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200"}>
                Call Notes: {(selected as any).call_notes_completed ? "Complete" : "Pending"}
              </Badge>
            </div>

            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                <TabsTrigger value="callnotes" className="flex-1">Call Notes</TabsTrigger>
                <TabsTrigger value="build" className="flex-1">Website Build</TabsTrigger>
                <TabsTrigger value="domain" className="flex-1">Domain</TabsTrigger>
                <TabsTrigger value="brief" className="flex-1">Brief</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {healthDot(selected)}
                  {statusBadge(selected.subscription_status)}
                  {siteBadge(selected.site_status)}
                  <Badge variant="outline">{planLabel(selected.plan)}</Badge>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Business Type</span><span>{selected.business_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{selected.join_date ? format(new Date(selected.join_date), "MMM d, yyyy") : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Active</span><span>{selected.last_active ? format(new Date(selected.last_active), "MMM d, yyyy") : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Credits Balance</span><span className="font-semibold">{selected.credits_balance ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Monthly Allowance</span><span>{selected.credits_monthly_allowance ?? 10}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Rollover Cap</span><span>{selected.credits_rollover_cap ?? 20}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Credits Reset</span><span>{selected.credits_last_reset ? format(new Date(selected.credits_last_reset), "MMM d, yyyy") : "—"}</span></div>
                  {selected.site_url && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Site URL</span>
                      <a href={selected.site_url} target="_blank" rel="noreferrer" className="text-primary flex items-center gap-1 hover:underline">
                        {selected.site_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
                <Separator />
                {isOwner && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Manage</h3>
                    <div>
                      <label className="text-xs text-muted-foreground">Plan</label>
                      <Select value={selected.plan} onValueChange={(v) => handleUpdateField(selected.id, "plan", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Site Status</label>
                      <Select value={selected.site_status || "building"} onValueChange={(v) => handleUpdateField(selected.id, "site_status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="building">Building</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Subscription Status</label>
                      <Select value={selected.subscription_status || "active"} onValueChange={(v) => handleUpdateField(selected.id, "subscription_status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Site URL</label>
                      <Input defaultValue={selected.site_url || ""} placeholder="https://..." onBlur={(e) => {
                        if (e.target.value !== (selected.site_url || "")) handleUpdateField(selected.id, "site_url", e.target.value);
                      }} />
                    </div>
                    <Separator />
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      disabled={resendingWelcome}
                      onClick={async () => {
                        setResendingWelcome(true);
                        try {
                          // Get client email from application or profile
                          const { data: profile } = await supabase
                            .from("profiles")
                            .select("email, full_name")
                            .eq("user_id", selected.user_id)
                            .single();
                          
                          if (!profile?.email) {
                            toast.error("No email found for this client");
                            setResendingWelcome(false);
                            return;
                          }

                          // Generate new magic link via edge function
                          const { data, error } = await supabase.functions.invoke("send-email", {
                            body: {
                              to: profile.email,
                              template: "welcome_set_password",
                              data: {
                                name: profile.full_name || selected.business_name,
                                first_name: (profile.full_name || "").split(" ")[0] || "there",
                                business_name: selected.business_name,
                              },
                              clientId: selected.id,
                            },
                          });

                          toast.success(`Welcome email resent to ${profile.email}`);
                        } catch (err: any) {
                          toast.error(err.message || "Failed to resend");
                        }
                        setResendingWelcome(false);
                      }}
                    >
                      {resendingWelcome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Resend Welcome Email
                    </Button>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="callnotes" className="mt-4">
                <CallNotesTab clientId={selected.id} businessName={selected.business_name} />
              </TabsContent>
              <TabsContent value="build" className="mt-4">
                <WebsiteBuildPanel clientId={selected.id} businessName={selected.business_name} />
              </TabsContent>
              <TabsContent value="domain" className="mt-4">
                <DomainDeployTab clientId={selected.id} businessName={selected.business_name} />
              </TabsContent>
              <TabsContent value="brief" className="mt-4">
                <WebsiteBriefPanel clientId={selected.id} businessName={selected.business_name} />
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>
      )}

      {deleteTarget && (
        <SoftDeleteModal
          open={showDeleteModal}
          onOpenChange={setShowDeleteModal}
          recordName={deleteTarget.name}
          table="clients"
          recordId={deleteTarget.id}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ["operator-clients"] });
            setSelected(null);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
