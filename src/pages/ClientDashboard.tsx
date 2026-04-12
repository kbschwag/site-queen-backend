import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Crown,
  Globe,
  ExternalLink,
  Send,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  Wrench,
  BarChart3,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { IntakeForm } from "@/components/intake/IntakeForm";
import type { IntakeData } from "@/components/intake/types";

export default function ClientDashboard() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [newRequest, setNewRequest] = useState("");
  const [showIntake, setShowIntake] = useState(false);

  const { data: client, isLoading: clientLoading } = useQuery({
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

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client record");
      const { error } = await supabase.from("change_requests").insert({
        client_id: client.id,
        request_text: newRequest,
      });
      if (error) throw error;
      supabase.functions.invoke("send-email", {
        body: {
          to: profile?.email || user!.email,
          template: "change_request_received",
          data: { business_name: client.business_name },
          clientId: client.id,
        },
      }).catch(console.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-change-requests"] });
      setNewRequest("");
      toast.success("Request submitted! We'll process it shortly.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updatesPercent = client
    ? Math.min(((client.updates_used_this_month ?? 0) / Math.max(client.updates_limit ?? 1, 1)) * 100, 100)
    : 0;

  const planLabel: Record<string, string> = {
    starter: "Starter — $79/mo",
    growth: "Growth — $129/mo",
    pro: "Pro — $199/mo",
  };

  const statusIcon = (status: string | null) => {
    if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (status === "in_progress") return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const statusBadge = (status: string | null) => {
    if (status === "completed") return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">Completed</Badge>;
    if (status === "in_progress") return <Badge className="bg-primary/10 text-primary border-primary/20">In Progress</Badge>;
    return <Badge variant="secondary">Pending</Badge>;
  };

  if (clientLoading) {
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

  // Check if intake not completed — cast to access the field
  const intakeCompleted = (client as any).intake_completed;
  const intakeData = (site?.intake_data as IntakeData) || {};
  const intakeProgress = Math.round(((intakeData.completed_steps || []).length / 9) * 100);

  // Show intake form full screen
  if (showIntake) {
    return (
      <IntakeForm
        clientId={client.id}
        userId={user!.id}
        plan={client.plan}
        businessName={client.business_name}
        onComplete={() => {
          setShowIntake(false);
          queryClient.invalidateQueries({ queryKey: ["my-client"] });
          queryClient.invalidateQueries({ queryKey: ["my-site"] });
        }}
      />
    );
  }

  // Onboarding state — intake not completed
  if (!intakeCompleted && client.site_status === "building") {
    const firstName = profile?.full_name?.split(" ")[0] || "there";
    const hasStarted = intakeData.current_step && intakeData.current_step > 1;

    return (
      <div className="min-h-screen bg-secondary/30">
        <header className="border-b bg-card">
          <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-primary" />
              <span className="font-bold">{client.business_name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="mb-8">
            <Crown className="h-16 w-16 text-primary mx-auto mb-6" />
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              Welcome, {firstName}. <br />Let's build your website. ♛
            </h1>
            <p className="text-muted-foreground text-lg">
              This should take about 10-15 minutes. Your progress saves automatically so you can come back anytime.
            </p>
          </div>

          {hasStarted ? (
            <div className="space-y-4">
              <div className="bg-card rounded-xl border p-6 max-w-sm mx-auto">
                <p className="text-sm text-muted-foreground mb-2">Your progress</p>
                <Progress value={intakeProgress} className="h-3 mb-2" />
                <p className="text-sm font-medium">{intakeProgress}% complete — Step {intakeData.current_step} of 9</p>
              </div>
              <Button size="lg" onClick={() => setShowIntake(true)} className="gap-2 text-lg px-8">
                Continue where you left off <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <Button size="lg" onClick={() => setShowIntake(true)} className="gap-2 text-lg px-8">
              <Sparkles className="h-5 w-5" /> Start building my website
            </Button>
          )}

          <p className="text-xs text-muted-foreground mt-8">
            Have questions? Email <a href="mailto:hello@sitequeen.ai" className="text-primary hover:underline">hello@sitequeen.ai</a>
          </p>
        </main>
      </div>
    );
  }

  // Building state — intake completed but site not live
  if (intakeCompleted && client.site_status === "building") {
    const tips = [
      "Tip: Claim your Google Business Profile to boost local SEO 🗺️",
      "Tip: Start collecting customer testimonials now for your site ⭐",
      "Tip: Make sure your business hours are up to date on Google 📅",
      "Fun fact: 75% of users judge a business's credibility by their website design 🎨",
      "Tip: Set up your business social media accounts while you wait 📱",
    ];
    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    return (
      <div className="min-h-screen bg-secondary/30">
        <header className="border-b bg-card">
          <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-primary" />
              <span className="font-bold">{client.business_name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="relative mx-auto mb-8 w-24 h-24">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse" />
            <div className="absolute inset-2 rounded-full border-4 border-primary/40 animate-pulse" style={{ animationDelay: "0.5s" }} />
            <div className="absolute inset-4 rounded-full bg-primary/10 flex items-center justify-center">
              <Crown className="h-8 w-8 text-primary" />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-3">Your website is being built. ♛</h1>
          <p className="text-muted-foreground text-lg mb-8">
            We'll email you the moment it's live. Average build time is 24 hours.
          </p>

          <Card className="max-w-md mx-auto text-left">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{randomTip}</p>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground mt-8">
            Forgot something? Email <a href="mailto:hello@sitequeen.ai" className="text-primary hover:underline">hello@sitequeen.ai</a>
          </p>
        </main>
      </div>
    );
  }

  // Regular dashboard — site is live
  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Crown className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold leading-tight">{client.business_name}</h1>
              <p className="text-xs text-muted-foreground">{planLabel[client.plan] || client.plan}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Site Status</p>
                  <p className="font-semibold capitalize">{client.site_status || "Building"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wrench className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Updates This Month</p>
                  <p className="font-semibold">{client.updates_used_this_month ?? 0} / {client.updates_limit ?? 0}</p>
                  <Progress value={updatesPercent} className="h-1.5 mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Requests</p>
                  <p className="font-semibold">{changeRequests.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {site && (site.deploy_url || site.staging_url) && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Your Website</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {site.deploy_url && (
                <a href={site.deploy_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Globe className="h-4 w-4" /> {site.deploy_url} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {site.staging_url && (
                <a href={site.staging_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:underline">
                  Staging: {site.staging_url} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {site.last_updated && (
                <p className="text-xs text-muted-foreground">Last updated: {format(new Date(site.last_updated), "MMM d, yyyy")}</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Request a Change</CardTitle>
            <CardDescription>Describe what you'd like updated on your website.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="e.g., Update the phone number to (555) 123-4567, change the hero image, add a new testimonial..."
              value={newRequest}
              onChange={(e) => setNewRequest(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <Button onClick={() => submitRequest.mutate()} disabled={!newRequest.trim() || submitRequest.isPending} className="gap-2">
              {submitRequest.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : <><Send className="h-4 w-4" /> Submit Request</>}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Request History</CardTitle></CardHeader>
          <CardContent>
            {changeRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No requests yet.</p>
            ) : (
              <div className="space-y-3">
                {changeRequests.map((cr, i) => (
                  <div key={cr.id}>
                    {i > 0 && <Separator className="mb-3" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="mt-0.5">{statusIcon(cr.status)}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{cr.request_text}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(cr.created_at), "MMM d, yyyy")}
                            {cr.completed_at && ` · Completed ${format(new Date(cr.completed_at), "MMM d")}`}
                          </p>
                        </div>
                      </div>
                      {statusBadge(cr.status)}
                    </div>
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
