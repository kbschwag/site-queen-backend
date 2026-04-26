import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Crown,
  Globe,
  Coins,
  CreditCard,
  Activity,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { buildSitePreviewUrl } from "@/lib/site-preview";

const planLabels: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

const planPrices: Record<string, string> = {
  starter: "$79",
  growth: "$129",
  pro: "$199",
};

export default function ClientOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["my-recent-activity"],
    queryFn: async () => {
      if (!client) return [];
      const { data, error } = await supabase
        .from("credits_transactions")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
    enabled: !!client,
  });

  if (!client) return null;

  const firstName = profile?.full_name?.split(" ")[0] || "there";
  const intakeCompleted = client.intake_completed;
  const generationStatus = (site as any)?.generation_status || "pending";
  const siteIsLive = client.site_status === "live";
  const previewUrl = buildSitePreviewUrl(client.id);
  const creditsBalance = client.credits_balance ?? 0;
  const monthlyAllowance = client.credits_monthly_allowance ?? 10;
  const creditsUsed = monthlyAllowance - Math.min(creditsBalance, monthlyAllowance);
  const creditsPercent = monthlyAllowance > 0 ? (creditsUsed / monthlyAllowance) * 100 : 0;

  // Staging review covers all statuses where the client should preview/approve the site
  const stagingReviewStatuses = ["shared", "awaiting_client_review", "pre_launch_revision", "revision_call_scheduled"];
  const inStagingReview = stagingReviewStatuses.includes(generationStatus) && !!site?.staging_url;
  const isApproved = ["client_approved", "approved"].includes(generationStatus);

  // Determine CTA
  let ctaText = "Complete your website brief →";
  let ctaAction = () => navigate("/dashboard/website");
  if (!intakeCompleted) {
    ctaText = "Complete your website brief →";
  } else if (siteIsLive) {
    ctaText = "Visit your website →";
    ctaAction = () => window.open(site?.deploy_url || previewUrl || "#", "_blank");
  } else if (inStagingReview) {
    ctaText = "Preview your website →";
  } else if (isApproved) {
    ctaText = "Approved — going live soon →";
  } else {
    ctaText = "Your site is being built — check status →";
  }

  const nextResetDate = client.credits_last_reset
    ? format(new Date(new Date(client.credits_last_reset).setMonth(new Date(client.credits_last_reset).getMonth() + 1)), "MMM d, yyyy")
    : "—";

  const siteStatusLabel = siteIsLive
    ? "Live"
    : intakeCompleted
      ? inStagingReview
        ? "Ready for review"
        : isApproved
          ? "Approved"
          : "Building"
      : "Onboarding";

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Hero greeting */}
      <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="pt-6 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Welcome back, {firstName} ♛</h1>
              <p className="text-muted-foreground">{client.business_name}</p>
              <Badge variant="outline" className="mt-2">{planLabels[client.plan] || client.plan} Plan</Badge>
            </div>
            <Button onClick={ctaAction} className="gap-2 shrink-0">
              {ctaText}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Website status */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/dashboard/website")}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Website Status</p>
                <p className="font-semibold flex items-center gap-2">
                  {siteStatusLabel}
                  {siteIsLive && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  {!siteIsLive && intakeCompleted && generationStatus !== "shared" && (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  )}
                </p>
                {client.domain_name && (
                  <p className="text-xs text-muted-foreground truncate">{client.domain_name}</p>
                )}
                {site?.last_updated && (
                  <p className="text-xs text-muted-foreground">
                    Updated {format(new Date(site.last_updated), "MMM d")}
                  </p>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/dashboard/support")}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Support Credits</p>
                <p className="font-semibold text-lg">{creditsBalance}</p>
                <Progress value={100 - creditsPercent} className="h-1.5 mt-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  Refresh on {nextResetDate}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/dashboard/billing")}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Billing</p>
                <p className="font-semibold">{planLabels[client.plan] || client.plan} — {planPrices[client.plan] || "—"}/mo</p>
                {client.next_billing_date && (
                  <p className="text-xs text-muted-foreground">
                    Next bill: {format(new Date(client.next_billing_date), "MMM d, yyyy")}
                  </p>
                )}
                <div className="flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs text-emerald-600">Active</span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-2">Recent Activity</p>
                {recentActivity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recent activity yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {recentActivity.map((tx: any) => (
                      <div key={tx.id} className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                        <p className="text-xs truncate">{tx.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
