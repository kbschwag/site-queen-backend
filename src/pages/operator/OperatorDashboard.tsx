import { useEffect, useState } from "react";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, Users, FileText, MessageSquare, AlertTriangle, TrendingUp, Zap, Eye, Clock, RefreshCw, Loader2, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function OperatorDashboard() {
  const { role, isOwner } = useOperatorRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data: failedSites = [] } = useQuery({
    queryKey: ["operator-failed-sites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sites")
        .select("client_id, generation_status, generation_attempts, generation_error, last_generation_attempt_at, clients!inner(business_name, deleted_at)")
        .or("generation_status.eq.failed,generation_attempts.gt.2")
        .order("last_generation_attempt_at", { ascending: false, nullsFirst: false })
        .limit(20);
      return (data || []).filter((s: any) => !s.clients?.deleted_at);
    },
  });

  const handleRetry = async (clientId: string) => {
    setRetryingId(clientId);
    try {
      const { error } = await supabase.functions.invoke("generate-website", { body: { client_id: clientId } });
      if (error) throw error;
      toast.success("Retry started ♛");
      queryClient.invalidateQueries({ queryKey: ["operator-failed-sites"] });
    } catch (e: any) {
      toast.error(e?.message || "Retry failed to start");
    } finally {
      setRetryingId(null);
    }
  };

  const { data: stats } = useQuery({
    queryKey: ["operator-dashboard-stats"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [clientsRes, appsRes, changeReqRes, flaggedRes, attentionRes, prospectsRes, pitchedWeekRes] = await Promise.all([
        supabase.from("clients").select("id, plan, subscription_status, site_status, last_active, created_at, lifecycle_stage").is("deleted_at", null),
        supabase.from("applications").select("id, lead_temperature, created_at").is("deleted_at", null).gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        supabase.from("change_requests").select("id").is("deleted_at", null).in("status", ["submitted", "pending"]),
        supabase.from("applications").select("id").is("deleted_at", null).eq("status", "needs_review"),
        supabase.from("clients").select("id, business_name, subscription_status, site_status, last_active, created_at").is("deleted_at", null),
        supabase.from("clients").select("id").is("deleted_at", null).in("lifecycle_stage", ["prospect", "pitched", "viewed_demo", "call_booked", "replied"]),
        supabase.from("clients").select("id").is("deleted_at", null).eq("lifecycle_stage", "pitched").gte("date_last_contacted", weekAgo),
      ]);

      const clients = clientsRes.data || [];
      const activeClients = clients.filter(c => c.subscription_status === "active");
      const apps = appsRes.data || [];
      const hot = apps.filter(a => a.lead_temperature === "HOT").length;
      const warm = apps.filter(a => a.lead_temperature === "WARM").length;
      const cold = apps.filter(a => a.lead_temperature === "COLD").length;

      const mrrMap: Record<string, number> = { starter: 79, growth: 129, pro: 199 };
      const mrr = activeClients.reduce((sum, c) => sum + (mrrMap[c.plan] || 0), 0);

      // Clients needing attention
      const now = new Date();
      const allClients = attentionRes.data || [];
      const needsAttention = allClients.filter(c => {
        if (c.subscription_status !== "active") return true;
        if (c.site_status === "building" && new Date(c.created_at).getTime() < now.getTime() - 48 * 60 * 60 * 1000) return true;
        if (c.last_active && new Date(c.last_active).getTime() < now.getTime() - 30 * 24 * 60 * 60 * 1000) return true;
        return false;
      });

      return {
        activeClients: activeClients.length,
        mrr,
        newAppsToday: apps.length,
        hot, warm, cold,
        pendingCR: changeReqRes.data?.length || 0,
        flagged: flaggedRes.data?.length || 0,
        needsAttention: needsAttention.length,
        activeProspects: prospectsRes.data?.length || 0,
        pitchedThisWeek: pitchedWeekRes.data?.length || 0,
      };
    },
  });

  const { data: recentActivity = [] } = useQuery({
    queryKey: ["operator-recent-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const [activityFilter, setActivityFilter] = useState<"today" | "week" | "month" | "all">("week");

  const filteredActivity = recentActivity.filter((log: any) => {
    if (activityFilter === "all") return true;
    const d = new Date(log.created_at);
    const now = new Date();
    if (activityFilter === "today") return d.toDateString() === now.toDateString();
    if (activityFilter === "week") return d.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (activityFilter === "month") return d.getTime() > now.getTime() - 30 * 24 * 60 * 60 * 1000;
    return true;
  });

  const navigateToRecord = (log: any) => {
    if (log.target_table === "applications") navigate("/operator/applications");
    else if (log.target_table === "clients") navigate("/operator/clients");
    else if (log.target_table === "change_requests") navigate("/operator/change-requests");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
          {role?.replace("_", " ")}
        </span>
      </div>

      {/* Stats cards — clickable */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/30" onClick={() => navigate("/operator/prospects")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" /> Active Prospects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.activeProspects ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats?.pitchedThisWeek ?? 0} pitched this week</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/operator/clients")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Active Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.activeClients ?? "—"}</p>
            {isOwner && stats && (
              <p className="text-sm text-muted-foreground">${stats.mrr.toLocaleString()} MRR</p>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/operator/applications")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" /> New Applications Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.newAppsToday ?? "—"}</p>
            {stats && stats.newAppsToday > 0 && (
              <div className="flex gap-2 text-xs mt-1">
                <span className="text-amber-600 font-medium">🔥 {stats.hot} HOT</span>
                <span className="text-primary font-medium">💜 {stats.warm} WARM</span>
                <span className="text-muted-foreground">{stats.cold} COLD</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/operator/change-requests")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Pending Change Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.pendingCR ?? "—"}</p>
          </CardContent>
        </Card>

        <Card className={`cursor-pointer hover:shadow-md transition-shadow ${stats?.flagged ? "border-amber-300 bg-amber-50/50" : ""}`} onClick={() => navigate("/operator/applications")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Flagged for Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats?.flagged ? "text-amber-600" : ""}`}>
              {stats?.flagged ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Owner-only MRR */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Monthly Recurring Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${stats?.mrr?.toLocaleString() ?? "—"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {stats?.activeClients ?? 0} active subscriptions
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate("/operator/applications")} className="gap-2">
              <FileText className="h-4 w-4" /> Review Applications
              {stats?.newAppsToday ? <span className="bg-primary-foreground/20 rounded-full px-1.5 text-xs">{stats.newAppsToday}</span> : null}
            </Button>
            <Button onClick={() => navigate("/operator/change-requests")} variant="outline" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Process Pending Tickets
              {stats?.pendingCR ? <span className="bg-primary/10 text-primary rounded-full px-1.5 text-xs">{stats.pendingCR}</span> : null}
            </Button>
            <Button onClick={() => navigate("/operator/clients")} variant="outline" className="gap-2">
              <Eye className="h-4 w-4" /> Clients Needing Attention
              {stats?.needsAttention ? <span className="bg-amber-100 text-amber-700 rounded-full px-1.5 text-xs">{stats.needsAttention}</span> : null}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sites needing attention — failed generations + high-attempt warnings */}
      {failedSites.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Sites needing attention ({failedSites.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {failedSites.map((s: any) => {
                const isFailed = s.generation_status === "failed";
                const highAttempts = (s.generation_attempts || 0) > 2;
                return (
                  <div
                    key={s.client_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-background border hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/operator/clients?id=${s.client_id}`)}
                          className="font-medium text-sm hover:underline truncate"
                        >
                          {s.clients?.business_name || "Unknown business"}
                        </button>
                        {isFailed && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                            Failed
                          </span>
                        )}
                        {highAttempts && !isFailed && (
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-200">
                            {s.generation_attempts} attempts
                          </span>
                        )}
                      </div>
                      {s.generation_error && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                          {s.generation_error}
                        </p>
                      )}
                      {s.last_generation_attempt_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last attempt {formatDistanceToNow(new Date(s.last_generation_attempt_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/operator/clients?id=${s.client_id}`)}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRetry(s.client_id)}
                        disabled={retryingId === s.client_id}
                        className="gap-1.5"
                      >
                        {retryingId === s.client_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Retry
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity feed */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
          <div className="flex gap-1">
            {(["today", "week", "month", "all"] as const).map((f) => (
              <Button
                key={f}
                variant={activityFilter === f ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2 capitalize"
                onClick={() => setActivityFilter(f)}
              >
                {f === "week" ? "This week" : f === "month" ? "This month" : f === "today" ? "Today" : "All time"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {filteredActivity.length > 0 ? (
            <div className="space-y-2">
              {filteredActivity.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 text-sm border-b pb-2 last:border-0 cursor-pointer hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                  onClick={() => navigateToRecord(log)}
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{log.action}</p>
                    <p className="text-muted-foreground text-xs">
                      {log.user_name || log.user_email || "System"} · {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No activity in this time period</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
