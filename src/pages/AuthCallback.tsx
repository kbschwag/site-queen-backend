import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Crown } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          setError("No account found for this email. Please contact hello@sitequeen.ai");
          setTimeout(() => navigate("/"), 4000);
          return;
        }

        const userId = session.user.id;

        // Check profile role for operator access
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", userId)
          .single();

        const role = profile?.role;
        if (role === "owner" || role === "partner" || role === "team_member") {
          navigate("/operator", { replace: true });
          return;
        }

        // Check if they're a client
        const { data: client } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();

        if (client) {
          navigate("/dashboard", { replace: true });
          return;
        }

        // Neither operator nor client
        setError("No account found for this email. Please contact hello@sitequeen.ai");
        await supabase.auth.signOut();
        setTimeout(() => navigate("/"), 4000);
      } catch {
        setError("Something went wrong. Please try again.");
        setTimeout(() => navigate("/"), 4000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <Crown className="h-10 w-10 text-primary mb-4" />
      {error ? (
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-sm text-muted-foreground">Redirecting you home...</p>
        </div>
      ) : (
        <div className="text-center space-y-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Signing you in...</p>
        </div>
      )}
    </div>
  );
}
