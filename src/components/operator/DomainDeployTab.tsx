import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";

interface Props {
  clientId: string;
  businessName: string;
}

const DOMAIN_STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "transfer_in_progress", label: "Transfer in progress" },
  { value: "dns_configured", label: "DNS configured" },
  { value: "email_verified", label: "Email verified — all MX and TXT records confirmed" },
  { value: "ready_to_deploy", label: "Ready to deploy ♛" },
];

const DEPLOY_CHECKLIST_ITEMS = [
  { key: "verified_folder", label: "I have verified this folder exists on Hostinger" },
  { key: "folder_belongs", label: "This folder belongs exclusively to this client" },
  { key: "dns_pointing", label: "I have confirmed the domain DNS is pointing to Hostinger" },
  { key: "email_safe", label: "I have verified the client's email will not be affected" },
];

const TRANSFER_CHECKLIST_ITEMS = [
  { key: "domain_confirmed", label: "Domain situation confirmed on discovery call" },
  { key: "registrar_identified", label: "Current registrar identified" },
  { key: "client_has_access", label: "Client has registrar login access" },
  { key: "dns_documented", label: "All DNS records documented — A, MX, TXT, CNAME" },
  { key: "email_identified", label: "Email provider identified" },
  { key: "transfer_initiated", label: "Domain transfer initiated or DNS updated" },
  { key: "mx_records_recreated", label: "MX and TXT records recreated in Hostinger" },
  { key: "email_tested", label: "Email tested and confirmed working after transfer" },
  { key: "deployment_path_confirmed", label: "Deployment path confirmed in system" },
];

export function DomainDeployTab({ clientId, businessName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ["operator-client-domain", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [domainName, setDomainName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [domainStatus, setDomainStatus] = useState("not_started");
  const [emailNotes, setEmailNotes] = useState("");
  const [domainSaved, setDomainSaved] = useState(false);
  const [deployChecks, setDeployChecks] = useState<Record<string, boolean>>({});
  const [transferChecklist, setTransferChecklist] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setDomainName((client as any).domain_name || "");
      setFolderPath((client as any).hostinger_folder_path || "");
      setDomainStatus((client as any).domain_status || "not_started");
      setEmailNotes((client as any).email_hosting_notes || "");
      setDomainSaved(!!((client as any).domain_name));
      setTransferChecklist((client as any).domain_checklist || {});
    }
  }, [client]);

  const handleDomainNameChange = (value: string) => {
    setDomainName(value);
    // Auto-populate folder path
    if (value && !folderPath || folderPath.startsWith("/public_html/")) {
      setFolderPath(`/public_html/${value}`);
    }
  };

  const handleSaveDomain = async () => {
    setSaving(true);
    try {
      await supabase
        .from("clients")
        .update({
          domain_name: domainName,
          hostinger_folder_path: folderPath,
          domain_status: domainStatus,
          email_hosting_notes: emailNotes,
        } as any)
        .eq("id", clientId);

      await supabase.from("audit_log").insert({
        user_id: user!.id,
        user_email: user!.email,
        action: `Updated domain info for ${businessName}: ${domainName}`,
        target_table: "clients",
        target_id: clientId,
      });

      setDomainSaved(true);
      queryClient.invalidateQueries({ queryKey: ["operator-client-domain", clientId] });
      toast.success("Domain info saved");
    } catch {
      toast.error("Failed to save domain info");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeploymentPath = async () => {
    await supabase
      .from("clients")
      .update({ deployment_path_confirmed: true } as any)
      .eq("id", clientId);

    await supabase.from("audit_log").insert({
      user_id: user!.id,
      user_email: user!.email,
      action: `Confirmed deployment path for ${businessName}: ${folderPath}`,
      target_table: "clients",
      target_id: clientId,
    });

    queryClient.invalidateQueries({ queryKey: ["operator-client-domain", clientId] });
    toast.success("Deployment path confirmed");
  };

  const handleTransferChecklistChange = async (key: string, checked: boolean) => {
    const updated = { ...transferChecklist, [key]: checked };
    setTransferChecklist(updated);
    await supabase
      .from("clients")
      .update({ domain_checklist: updated } as any)
      .eq("id", clientId);
  };

  const allDeployChecked = DEPLOY_CHECKLIST_ITEMS.every((item) => deployChecks[item.key]);
  const deploymentConfirmed = (client as any)?.deployment_path_confirmed;

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Domain Information */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Domain Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Domain Name</label>
            <Input
              value={domainName}
              onChange={(e) => handleDomainNameChange(e.target.value)}
              placeholder="joesbakery.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Hostinger Folder Path</label>
            <Input
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/public_html/joesbakery.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Domain Status</label>
            <Select value={domainStatus} onValueChange={setDomainStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOMAIN_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email Hosting Notes</label>
            <Textarea
              value={emailNotes}
              onChange={(e) => setEmailNotes(e.target.value)}
              placeholder="e.g. Email hosted on Google Workspace, MX records recreated in Hostinger"
              rows={2}
            />
          </div>
          <Button onClick={handleSaveDomain} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save domain info"}
          </Button>
        </CardContent>
      </Card>

      {/* Deployment Path Confirmation */}
      {domainSaved && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Deployment Path Confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {deploymentConfirmed ? (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Deployment path confirmed ✓ — {folderPath}
                </span>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  You are about to authorize deployment to <strong>{folderPath}</strong> for <strong>{businessName}</strong>
                </p>
                <div className="space-y-2">
                  {DEPLOY_CHECKLIST_ITEMS.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={!!deployChecks[item.key]}
                        onCheckedChange={(checked) =>
                          setDeployChecks((prev) => ({ ...prev, [item.key]: !!checked }))
                        }
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <Button
                  onClick={handleConfirmDeploymentPath}
                  disabled={!allDeployChecked}
                  className="gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Confirm deployment path
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Domain Transfer Checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Domain Transfer Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {TRANSFER_CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={!!(transferChecklist as any)[item.key]}
                  onCheckedChange={(checked) => handleTransferChecklistChange(item.key, !!checked)}
                />
                <span className={!!(transferChecklist as any)[item.key] ? "line-through text-muted-foreground" : ""}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
