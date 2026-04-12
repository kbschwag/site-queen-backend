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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Globe, ExternalLink, Users } from "lucide-react";
import { format } from "date-fns";

export default function OperatorClients() {
  const { user } = useAuth();
  const { isOwner } = useOperatorRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["operator-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

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
    if (status === "live") return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200"><Globe className="h-3 w-3 mr-1" />Live</Badge>;
    if (status === "building") return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">Building</Badge>;
    return <Badge variant="outline">{status || "—"}</Badge>;
  };

  const planLabel = (plan: string) => {
    const map: Record<string, string> = { starter: "Starter — $79", growth: "Growth — $129", pro: "Pro — $199" };
    return map[plan] || plan;
  };

  const handleUpdateField = async (clientId: string, field: string, value: any) => {
    await supabase.from("clients").update({ [field]: value }).eq("id", clientId);
    await supabase.from("audit_log").insert({
      user_id: user!.id,
      user_email: user!.email,
      action: `Updated client ${field} to ${value}`,
      target_table: "clients",
      target_id: clientId,
    });
    queryClient.invalidateQueries({ queryKey: ["operator-clients"] });
    toast.success("Client updated");
    // Refresh selected
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
              <p>No clients found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Updates</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{c.business_name}</p>
                        <p className="text-xs text-muted-foreground">{c.business_type}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{planLabel(c.plan)}</TableCell>
                    <TableCell>{statusBadge(c.subscription_status)}</TableCell>
                    <TableCell>{siteBadge(c.site_status)}</TableCell>
                    <TableCell className="text-sm">{c.updates_used_this_month ?? 0}/{c.updates_limit ?? 0}</TableCell>
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
              <SheetTitle>{selected.business_name}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                {statusBadge(selected.subscription_status)}
                {siteBadge(selected.site_status)}
                <Badge variant="outline">{planLabel(selected.plan)}</Badge>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Business Type</span><span>{selected.business_type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{selected.join_date ? format(new Date(selected.join_date), "MMM d, yyyy") : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Last Active</span><span>{selected.last_active ? format(new Date(selected.last_active), "MMM d, yyyy") : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Updates This Month</span><span>{selected.updates_used_this_month ?? 0} / {selected.updates_limit ?? 0}</span></div>
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

              {/* Quick actions */}
              {(isOwner) && (
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
                    <Input
                      defaultValue={selected.site_url || ""}
                      placeholder="https://..."
                      onBlur={(e) => {
                        if (e.target.value !== (selected.site_url || "")) {
                          handleUpdateField(selected.id, "site_url", e.target.value);
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
