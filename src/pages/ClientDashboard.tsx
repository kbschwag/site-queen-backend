import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ClientLayout } from "@/components/client/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, LogOut } from "lucide-react";

export default function ClientDashboard() {
  const { user, signOut } = useAuth();

  const { data: client, isLoading } = useQuery({
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-2"><Crown className="h-10 w-10 text-primary" /></div>
            <CardTitle>Welcome to SiteQueen ♛</CardTitle>
            <CardDescription>Your client account is being set up. If you just applied, our team will link your account shortly.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOut} className="gap-2"><LogOut className="h-4 w-4" /> Sign Out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ClientLayout />;
}
