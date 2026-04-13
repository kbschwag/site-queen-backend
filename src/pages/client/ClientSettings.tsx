import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

export default function ClientSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [fullName, setFullName] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (profile && !loaded) {
    setFullName(profile.full_name || "");
    setLoaded(true);
  }

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated!");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <h1 className="text-xl font-bold">Account Settings</h1>

      {/* Personal info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user?.email || ""} disabled className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Contact support to update your email</p>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </CardContent>
      </Card>

      {/* Business info */}
      {client && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Business Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Business Name</Label>
              <Input value={client.business_name} disabled className="mt-1" />
            </div>
            <div>
              <Label>Business Type</Label>
              <Input value={client.business_type} disabled className="mt-1" />
            </div>
            {client.domain_name && (
              <div>
                <Label>Domain Name</Label>
                <Input value={client.domain_name} disabled className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Contact support to update</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>New Password</Label>
            <Input type="password" placeholder="Enter new password" className="mt-1" />
          </div>
          <div>
            <Label>Confirm New Password</Label>
            <Input type="password" placeholder="Confirm new password" className="mt-1" />
          </div>
          <Button variant="outline">Change password</Button>
        </CardContent>
      </Card>

      {/* Notification preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            "Email me when my ticket is completed",
            "Email me when my credits refresh",
            "Email me when my payment is processed",
            "Email me about SiteQueen updates",
          ].map((label) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Switch defaultChecked />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Request account deletion. This will submit a request to our team. Your account will not be immediately deleted.
          </p>
          <Button variant="destructive" size="sm">Request account deletion</Button>
        </CardContent>
      </Card>
    </div>
  );
}
