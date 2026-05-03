import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, PlugZap, Loader2, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";

interface Props {
  clientId: string;
  businessName: string;
}

export function ClientFtpCredentialsCard({ clientId, businessName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["client-ftp-credentials", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ftp_credentials" as any)
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data as any;
    },
  });

  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [path, setPath] = useState("/public_html/");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (existing) {
      setHost(existing.ftp_host || "");
      setUsername(existing.ftp_user || "");
      // Never display the saved password — leave blank, treat blank as "keep existing"
      setPassword("");
      setPath(existing.ftp_path || "/public_html/");
    }
  }, [existing]);

  const handleSave = async () => {
    if (!host.trim() || !username.trim()) {
      toast.error("Host and username are required");
      return;
    }
    if (!existing && !password.trim()) {
      toast.error("Password is required");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        client_id: clientId,
        ftp_host: host.trim(),
        ftp_user: username.trim(),
        ftp_path: path.trim() || "/public_html/",
      };
      if (password.trim()) payload.ftp_password = password;

      if (existing) {
        const { error } = await supabase
          .from("client_ftp_credentials" as any)
          .update(payload)
          .eq("client_id", clientId);
        if (error) throw error;
      } else {
        payload.ftp_password = password;
        const { error } = await supabase
          .from("client_ftp_credentials" as any)
          .insert(payload);
        if (error) throw error;
      }

      await supabase.from("audit_log").insert({
        user_id: user!.id,
        user_email: user!.email,
        action: `Saved Hostinger FTP credentials for ${businessName}`,
        target_table: "client_ftp_credentials",
        target_id: clientId,
      });

      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["client-ftp-credentials", clientId] });
      toast.success("FTP credentials saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!host.trim() || !username.trim()) {
      toast.error("Host and username are required");
      return;
    }
    if (!password.trim() && !existing) {
      toast.error("Password is required to test");
      return;
    }
    setTesting(true);
    try {
      // If user typed a password, test with the typed values directly so they
      // don't have to save first. Otherwise test with the saved record.
      const body: any = password.trim()
        ? {
            ftp_host: host.trim(),
            ftp_user: username.trim(),
            ftp_password: password,
            ftp_path: path.trim() || "/public_html/",
          }
        : { client_id: clientId };

      const { data, error } = await supabase.functions.invoke("test-ftp-connection", { body });
      if (error) throw new Error(error.message);
      if (data?.ok) {
        toast.success(data.message || "Connection OK ♛");
      } else {
        toast.error(data?.message || data?.error || "Connection failed");
      }
      queryClient.invalidateQueries({ queryKey: ["client-ftp-credentials", clientId] });
    } catch (e: any) {
      toast.error(e?.message || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Client Hostinger FTP Credentials
          {existing?.test_passed === true && (
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 ml-auto">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Tested ✓
            </Badge>
          )}
          {existing?.test_passed === false && (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 ml-auto">
              <AlertTriangle className="h-3 w-3 mr-1" /> Test failed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          When set, "Approve and go live" pushes files directly to the client's own Hostinger account.
          Leave blank to deploy to SiteQueen's shared hosting instead.
        </p>
        <div>
          <label className="text-xs text-muted-foreground">FTP Host</label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="srv1353.hstgr.io" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">FTP Username</label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="u453591386" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            FTP Password {existing && <span className="italic">(leave blank to keep existing)</span>}
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={existing ? "••••••••" : "Enter password"}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">FTP Path</label>
          <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/public_html/" />
        </div>
        {existing?.tested_at && (
          <p className="text-[11px] text-muted-foreground">
            Last tested: {new Date(existing.tested_at).toLocaleString()}
            {existing.test_passed === false && existing.test_error && (
              <span className="block text-destructive">Error: {existing.test_error}</span>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save FTP credentials"}
          </Button>
          <Button onClick={handleTest} disabled={testing} variant="outline" className="gap-2">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Test FTP connection
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
