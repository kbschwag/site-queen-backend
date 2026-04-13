import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function PasswordSection() {
  const { user } = useAuth();
  const [hasPassword, setHasPassword] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (user) {
      const emailIdentity = user.identities?.some((i: any) => i.provider === "email");
      setHasPassword(!!emailIdentity);
    }
  }, [user]);

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(hasPassword ? "Password updated ♛" : "Password set successfully ♛");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      setHasPassword(true);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {hasPassword ? "Change Password" : "Add a password to your account"}
        </CardTitle>
        {!hasPassword && (
          <p className="text-sm text-muted-foreground">
            You currently sign in with Google. Add a password so you can also sign in with email.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPassword && (
          <div className="space-y-1">
            <Label>Current Password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="mt-1"
            />
          </div>
        )}
        <div className="space-y-1">
          <Label>New Password</Label>
          <div className="relative mt-1">
            <Input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
            />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Confirm New Password</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className="mt-1"
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-destructive mt-1">Passwords don't match</p>
          )}
        </div>
        <Button onClick={handleSetPassword} disabled={loading} variant="outline" className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {hasPassword ? "Update password" : "Set password"}
        </Button>
      </CardContent>
    </Card>
  );
}
