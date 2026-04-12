import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function ClientDashboard() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRequest, setNewRequest] = useState("");

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

  const { data: changeRequests = [] } = useQuery({
    queryKey: ["my-change-requests"],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("change_requests")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  const { data: site } = useQuery({
    queryKey: ["my-site"],
    queryFn: async () => {
      if (!client) return null;
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("client_id", client.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client record");
      const { error } = await supabase.from("change_requests").insert({
        client_id: client.id,
        request_text: newRequest,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
      setNewRequest("");
      toast({ title: "Request submitted!", description: "We'll process it shortly." });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!client) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>Your client account is being set up. If you just applied, an admin will link your account shortly.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOut}>Sign Out</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">{client.business_name}</h1>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Plan</CardDescription></CardHeader>
            <CardContent><Badge className="text-lg capitalize">{client.plan}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Site Status</CardDescription></CardHeader>
            <CardContent><Badge variant="secondary" className="text-lg capitalize">{client.site_status}</Badge></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Updates This Month</CardDescription></CardHeader>
            <CardContent><p className="text-2xl font-bold">{client.updates_used_this_month}/{client.updates_limit}</p></CardContent>
          </Card>
        </div>

        {/* Site Info */}
        {site && (
          <Card>
            <CardHeader>
              <CardTitle>Your Website</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {site.deploy_url && <p>Live: <a href={site.deploy_url} className="text-primary underline" target="_blank">{site.deploy_url}</a></p>}
              {site.staging_url && <p>Staging: <a href={site.staging_url} className="text-primary underline" target="_blank">{site.staging_url}</a></p>}
              {site.last_updated && <p className="text-sm text-muted-foreground">Last updated: {new Date(site.last_updated).toLocaleDateString()}</p>}
            </CardContent>
          </Card>
        )}

        {/* Submit Change Request */}
        <Card>
          <CardHeader>
            <CardTitle>Request a Change</CardTitle>
            <CardDescription>Describe what you'd like changed on your website.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="e.g., Update the phone number to (555) 123-4567..."
              value={newRequest}
              onChange={(e) => setNewRequest(e.target.value)}
              rows={4}
            />
            <Button onClick={() => submitRequest.mutate()} disabled={!newRequest.trim() || submitRequest.isPending}>
              {submitRequest.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </CardContent>
        </Card>

        {/* Request History */}
        <Card>
          <CardHeader>
            <CardTitle>Request History</CardTitle>
          </CardHeader>
          <CardContent>
            {changeRequests.length === 0 ? (
              <p className="text-muted-foreground">No requests yet.</p>
            ) : (
              <div className="space-y-4">
                {changeRequests.map((cr) => (
                  <div key={cr.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant={cr.status === "completed" ? "default" : "secondary"}>{cr.status}</Badge>
                      <span className="text-sm text-muted-foreground">{new Date(cr.created_at).toLocaleDateString()}</span>
                    </div>
                    <p>{cr.request_text}</p>
                    {cr.completed_at && <p className="text-sm text-muted-foreground mt-2">Completed: {new Date(cr.completed_at).toLocaleDateString()}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
