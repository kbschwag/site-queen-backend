import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Crown, Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { checkRateLimit } from "@/lib/rate-limit";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [noPasswordHint, setNoPasswordHint] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();

  // Redirect already-logged-in users away from login page
  useEffect(() => {
    if (user) {
      navigate(isAdmin ? "/admin" : "/dashboard");
    }
  }, [user, isAdmin, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNoPasswordHint(false);

    // Rate limit: 5 attempts per 15 minutes
    const rl = checkRateLimit("login", 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      setRateLimited(true);
      toast({ title: "Too many attempts", description: "Please wait a few minutes before trying again.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Detect "no password set" scenario
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        setNoPasswordHint(true);
      }
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      navigate(isAdmin ? "/admin" : "/dashboard");
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast({ title: "Error", description: result.error.message, variant: "destructive" });
      setGoogleLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate("/dashboard");
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicEmail) return;
    setMagicLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email: magicEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/set-password`,
      },
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setMagicSent(true);
    }
    setMagicLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <Crown className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">SiteQueen</CardTitle>
          <CardDescription>Client portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google */}
          <Button
            variant="outline"
            className="w-full gap-3 h-11"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          {/* No password hint */}
          {noPasswordHint && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium">It looks like you haven't set your password yet</p>
              <p className="text-muted-foreground text-xs">Check your email for your account setup link, or click below to get a new one</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  setShowMagicLink(true);
                  setMagicEmail(email);
                  setNoPasswordHint(false);
                }}
              >
                <Mail className="h-4 w-4" /> Send me a login link
              </Button>
            </div>
          )}

          <div className="text-center">
            <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
              Forgot your password?
            </Link>
          </div>

          {/* Magic link section */}
          <div className="border-t pt-4">
            {!showMagicLink ? (
              <button
                type="button"
                onClick={() => setShowMagicLink(true)}
                className="text-sm text-muted-foreground hover:text-primary w-full text-center"
              >
                New client? Never set a password?
              </button>
            ) : magicSent ? (
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-primary">Check your inbox ♛</p>
                <p className="text-xs text-muted-foreground">We sent you a login link to {magicEmail}</p>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="space-y-3">
                <p className="text-xs text-muted-foreground text-center">Enter your email and we'll send you a login link</p>
                <Input
                  type="email"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <Button type="submit" variant="outline" className="w-full gap-2" disabled={magicLoading}>
                  {magicLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Send Access Link
                </Button>
              </form>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account? <Link to="/apply" className="text-primary underline">Apply</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
