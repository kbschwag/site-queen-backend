import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function tempColor(temp: string | null) {
  if (temp === "HOT") return "destructive";
  if (temp === "WARM") return "default";
  return "secondary";
}

function statusColor(status: string | null) {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: applications = [] } = useQuery({
    queryKey: ["admin-applications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: changeRequests = [] } = useQuery({
    queryKey: ["admin-change-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("change_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: emailsLog = [] } = useQuery({
    queryKey: ["admin-emails"],
    queryFn: async () => {
      const { data, error } = await supabase.from("emails_log").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Mutations
  const updateAppStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("applications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      toast({ title: "Status updated" });
    },
  });

  const scoreLeadMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const { data, error } = await supabase.functions.invoke("score-lead", { body: { applicationId } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      toast({ title: "Lead scored", description: `Score: ${data.score} | ${data.temperature}` });
    },
    onError: (e) => toast({ title: "Error scoring", description: e.message, variant: "destructive" }),
  });

  const approveApp = useMutation({
    mutationFn: async (app: typeof applications[0]) => {
      // Update status
      await supabase.from("applications").update({ status: "approved" }).eq("id", app.id);
      // Create client record
      const { error } = await supabase.from("clients").insert({
        application_id: app.id,
        business_name: app.business_name,
        business_type: app.business_type,
        plan: app.plan_interest || "starter",
      });
      if (error) throw error;
      // Send approval email
      await supabase.functions.invoke("send-email", {
        body: { to: app.email, template: "application_approved", data: { name: app.name, business_name: app.business_name }, applicationId: app.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast({ title: "Application approved & client created" });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectApp = useMutation({
    mutationFn: async (app: typeof applications[0]) => {
      await supabase.from("applications").update({ status: "rejected" }).eq("id", app.id);
      await supabase.functions.invoke("send-email", {
        body: { to: app.email, template: "application_rejected", data: { name: app.name }, applicationId: app.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      toast({ title: "Application rejected" });
    },
  });

  const updateCRStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const update: Record<string, unknown> = { status };
      if (status === "completed") update.completed_at = new Date().toISOString();
      const { error } = await supabase.from("change_requests").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-change-requests"] });
      toast({ title: "Request updated" });
    },
  });

  const processCR = useMutation({
    mutationFn: async (changeRequestId: string) => {
      const { data, error } = await supabase.functions.invoke("process-change-request", { body: { changeRequestId } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-change-requests"] });
      toast({ title: "AI processed", description: `${data.classification?.complexity} — ${data.classification?.category}` });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Stats
  const hotLeads = applications.filter((a) => a.lead_temperature === "HOT").length;
  const activeClients = clients.filter((c) => c.subscription_status === "active").length;
  const pendingRequests = changeRequests.filter((cr) => cr.status === "pending").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">SiteQueen Admin</h1>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total Applications</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold">{applications.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Hot Leads</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold text-destructive">{hotLeads}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Active Clients</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold">{activeClients}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Pending Requests</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold">{pendingRequests}</p></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="applications">
          <TabsList>
            <TabsTrigger value="applications">Applications ({applications.length})</TabsTrigger>
            <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
            <TabsTrigger value="requests">Change Requests ({changeRequests.length})</TabsTrigger>
            <TabsTrigger value="emails">Email Log ({emailsLog.length})</TabsTrigger>
          </TabsList>

          {/* APPLICATIONS TAB */}
          <TabsContent value="applications">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Temp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell>
                          <div>{app.name}</div>
                          <div className="text-sm text-muted-foreground">{app.email}</div>
                        </TableCell>
                        <TableCell>{app.business_name}</TableCell>
                        <TableCell>{app.monthly_revenue}</TableCell>
                        <TableCell>{app.ai_score ?? "—"}</TableCell>
                        <TableCell><Badge variant={tempColor(app.lead_temperature)}>{app.lead_temperature || "—"}</Badge></TableCell>
                        <TableCell><Badge variant={statusColor(app.status)}>{app.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => scoreLeadMutation.mutate(app.id)} disabled={scoreLeadMutation.isPending}>
                              Score
                            </Button>
                            {app.status === "pending" && (
                              <>
                                <Button size="sm" onClick={() => approveApp.mutate(app)} disabled={approveApp.isPending}>Approve</Button>
                                <Button size="sm" variant="destructive" onClick={() => rejectApp.mutate(app)} disabled={rejectApp.isPending}>Reject</Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CLIENTS TAB */}
          <TabsContent value="clients">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Site Status</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Updates Used</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>{client.business_name}</TableCell>
                        <TableCell><Badge>{client.plan}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{client.site_status}</Badge></TableCell>
                        <TableCell><Badge variant={client.subscription_status === "active" ? "default" : "destructive"}>{client.subscription_status}</Badge></TableCell>
                        <TableCell>{client.updates_used_this_month}/{client.updates_limit}</TableCell>
                        <TableCell>{client.join_date ? new Date(client.join_date).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CHANGE REQUESTS TAB */}
          <TabsContent value="requests">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>AI Notes</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changeRequests.map((cr) => (
                      <TableRow key={cr.id}>
                        <TableCell className="max-w-xs truncate">{cr.request_text}</TableCell>
                        <TableCell><Badge variant={cr.status === "completed" ? "default" : "secondary"}>{cr.status}</Badge></TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{cr.admin_notes || "—"}</TableCell>
                        <TableCell>{new Date(cr.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {!cr.ai_processed && (
                              <Button size="sm" variant="outline" onClick={() => processCR.mutate(cr.id)} disabled={processCR.isPending}>
                                AI Process
                              </Button>
                            )}
                            <Select onValueChange={(v) => updateCRStatus.mutate({ id: cr.id, status: v })}>
                              <SelectTrigger className="w-[120px] h-8">
                                <SelectValue placeholder="Status..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EMAILS TAB */}
          <TabsContent value="emails">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailsLog.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell>{email.recipient_email}</TableCell>
                        <TableCell><Badge variant="secondary">{email.email_type}</Badge></TableCell>
                        <TableCell><Badge variant={email.status === "sent" ? "default" : "destructive"}>{email.status}</Badge></TableCell>
                        <TableCell>{new Date(email.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
