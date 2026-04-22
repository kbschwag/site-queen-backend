import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import { Settings, Mail, Link2, Shield, AlertTriangle, CheckCircle2, XCircle, RotateCcw, Loader2, Calendar } from "lucide-react";
import { PasswordSection } from "@/components/PasswordSection";
import { SecuritySection } from "@/components/operator/SecuritySection";
import { format } from "date-fns";

export default function OperatorSettings() {
  const { user } = useAuth();
  const { isOwner } = useOperatorRole();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);

  // Fetch deleted records for Owner
  const { data: deletedRecords = [] } = useQuery({
    queryKey: ["deleted-records"],
    queryFn: async () => {
      const [clients, applications, changeRequests] = await Promise.all([
        supabase.from("clients").select("id, business_name, deleted_at, deleted_by").not("deleted_at", "is", null),
        supabase.from("applications").select("id, business_name, deleted_at, deleted_by").not("deleted_at", "is", null),
        supabase.from("change_requests").select("id, change_type, request_text, deleted_at, deleted_by, clients(business_name)").not("deleted_at", "is", null),
      ]);
      const records: any[] = [];
      (clients.data || []).forEach((r: any) => records.push({ ...r, type: "Client", name: r.business_name, table: "clients" }));
      (applications.data || []).forEach((r: any) => records.push({ ...r, type: "Application", name: r.business_name, table: "applications" }));
      (changeRequests.data || []).forEach((r: any) => records.push({ ...r, type: "Change Request", name: `${(r as any).clients?.business_name || "—"} — ${r.change_type || r.request_text?.slice(0, 30)}`, table: "change_requests" }));
      return records.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
    },
    enabled: isOwner,
  });

  const handleRestore = async (record: any) => {
    setRestoring(record.id);
    try {
      const updateData: Record<string, any> = { deleted_at: null };
      if (record.table !== "notifications") updateData.deleted_by = null;
      await supabase.from(record.table as any).update(updateData as any).eq("id", record.id);
      await supabase.from("audit_log").insert({ user_id: user!.id, user_email: user!.email, action: `Restored ${record.type}: ${record.name}`, target_table: record.table, target_id: record.id });
      toast.success(`${record.type} restored`);
      queryClient.invalidateQueries({ queryKey: ["deleted-records"] });
      queryClient.invalidateQueries({ queryKey: ["operator-clients"] });
      queryClient.invalidateQueries({ queryKey: ["operator-applications"] });
      queryClient.invalidateQueries({ queryKey: ["operator-change-requests"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRestoring(null);
    }
  };

  const integrations = [
    { name: "Stripe", status: false, desc: "Payment processing" },
    { name: "Resend", status: true, desc: "Email delivery" },
    { name: "Lovable Cloud", status: true, desc: "Database & auth" },
    { name: "Hostinger", status: true, desc: "Website hosting" },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Password */}
      <PasswordSection />

      {/* Business Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> Business Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Business Name</Label>
            <Input defaultValue="SiteQueen" className="mt-1" />
          </div>
          <div>
            <Label>Contact Email</Label>
            <Input defaultValue="hello@sitequeen.ai" className="mt-1" />
          </div>
          <div>
            <Label>Cal.com Booking Link</Label>
            <Input defaultValue="https://cal.com/sitequeen" placeholder="https://cal.com/..." className="mt-1" />
          </div>
          <div>
            <Label>Support Response SLA (hours)</Label>
            <Input type="number" defaultValue="24" className="mt-1 w-32" />
          </div>
          <Button size="sm">Save changes</Button>
        </CardContent>
      </Card>

      {/* Email Templates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Email Templates
          </CardTitle>
          <CardDescription>Preview and edit automated email templates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {["Welcome email", "Application approved", "Application declined", "Change request completed", "Credits refreshed", "Site ready for review"].map((template) => (
            <div key={template} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <div>
                <p className="text-sm font-medium">{template}</p>
                <p className="text-xs text-muted-foreground">Auto-sent by the system</p>
              </div>
              <Button variant="outline" size="sm">Edit</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Integrations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {integrations.map((i) => (
            <div key={i.name} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {i.status ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.desc}</p>
                </div>
              </div>
              <Badge variant={i.status ? "outline" : "destructive"} className={i.status ? "text-emerald-600 border-emerald-200" : ""}>
                {i.status ? "Connected" : "Not connected"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security Section — Owner only */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Security
            </CardTitle>
            <CardDescription>Login activity, sessions, and API status</CardDescription>
          </CardHeader>
          <CardContent>
            <SecuritySection />
          </CardContent>
        </Card>
      )}

      {/* Danger Zone — Owner only */}
      {isOwner && (
        <>
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Deleted records */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Deleted Records</h3>
                {deletedRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No deleted records</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Deleted</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deletedRecords.map((r: any) => (
                        <TableRow key={`${r.table}-${r.id}`}>
                          <TableCell><Badge variant="outline" className="text-xs">{r.type}</Badge></TableCell>
                          <TableCell className="text-sm">{r.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{format(new Date(r.deleted_at), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              disabled={restoring === r.id}
                              onClick={() => handleRestore(r)}
                            >
                              {restoring === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button variant="outline" size="sm">Export all data as CSV</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
