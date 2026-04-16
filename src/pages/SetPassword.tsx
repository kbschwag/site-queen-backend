import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Crown, Loader2, Eye, EyeOff, Check, X } from "lucide-react";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if we have a session (magic link was exchanged)
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      } else {
        // Check URL for error indicating expired link
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.replace("#", ""));
        if (params.get("error") || params.get("error_description")) {
          setExpired(true);
        } else {
          // Listen for auth state changes (magic link exchange in progress)
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session) {
              setSessionReady(true);
            }
          });
          // Wait a moment then check again
          setTimeout(async () => {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (s) setSessionReady(true);
            else setExpired(true);
          }, 3000);
          return () => subscription.unsubscribe();
        }
      }
    };
    checkSession();
  }, []);

  const hasMinLength = password.length >= 8;
  const hasLettersAndNumbers = /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canSubmit = hasMinLength && passwordsMatch && !loading;

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    toast({ title: "Password set successfully ♛", description: "Welcome to SiteQueen!" });
    navigate("/dashboard");
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpEmail) return;
    setOtpLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: otpEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/set-password`,
      },
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOtpSent(true);
    }
    setOtpLoading(false);
  };

  // Expired state
  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center"><Crown className="h-10 w-10 text-primary" /></div>
            <CardTitle className="text-2xl">This link has expired ♛</CardTitle>
            <CardDescription>No worries — enter your email below and we'll send you a fresh link</CardDescription>
          </CardHeader>
          <CardContent>
            {otpSent ? (
              <div className="text-center space-y-2">
                <p className="text-primary font-medium">Check your inbox ♛</p>
                <p className="text-sm text-muted-foreground">We sent you a new login link. Click it to set your password.</p>
              </div>
            ) : (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={otpLoading}>
                  {otpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send New Link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Waiting for session
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Crown className="h-10 w-10 text-primary mx-auto" />
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Setting up your account...</p>
        </div>
      </div>
    );
  }

  // Set password form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center"><Crown className="h-10 w-10 text-primary" /></div>
          <CardTitle className="text-2xl">Welcome to SiteQueen ♛</CardTitle>
          <CardDescription>You're almost in — just set a password for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input
                id="confirm"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {/* Password requirements */}
            <div className="space-y-1 text-xs">
              <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-green-600" : "text-muted-foreground"}`}>
                {hasMinLength ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                At least 8 characters
              </div>
              <div className={`flex items-center gap-1.5 ${hasLettersAndNumbers ? "text-green-600" : "text-muted-foreground"}`}>
                {hasLettersAndNumbers ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                Mix of letters and numbers (recommended)
              </div>
              <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-green-600" : "text-muted-foreground"}`}>
                {passwordsMatch ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                Passwords match
              </div>
            </div>

            <Button type="submit" className="w-full h-11" disabled={!canSubmit}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Set Password & Enter Dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
