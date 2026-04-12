import { useEffect, useState } from "react";
import { useOperatorRole } from "@/hooks/useOperatorRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, Users, FileText, MessageSquare, AlertTriangle, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

export default function OperatorDashboard() {
  const { role, isOwner } = useOperatorRole();
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["operator-dashboard-stats"],
    queryFn: async () => {
      const [clientsRes, appsRes, changeReqRes, flaggedRes] = await Promise.all([
        supabase.from("clients").select("id, plan, subscription_status").eq("subscription_status", "active"),
        supabase.from("applications").select("id, lead_temperature, created_at").gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
        supabase.from("change_requests").select("id").eq("status", "pending"),
        supabase.from("applications").select("id").eq("status", "needs_review"),
      ]);

      const clients = clientsRes.data || [];
      const apps = appsRes.data || [];
      const hot = apps.filter(a => a.lead_temperature === "HOT").length;
      const warm = apps.filter(a => a.lead_temperature === "WARM").length;
      const cold = apps.filter(a => a.lead_temperature === "COLD").length;

      const mrrMap: Record<string, number> = { starter: 79, growth: 129, pro: 199 };
      const mrr = clients.reduce((sum, c) => sum + (mrrMap[c.plan] || 0), 0);

      return {
        activeClients: clients.length,
        mrr,
        newAppsToday: apps.length,
        hot, warm, cold,
        pendingCR: changeReqRes.data?.length || 0,
        flagged: flaggedRes.data?.length || 0,
      };
    },
  });

  const { data: recentActivity } = useQuery({
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
          {role?.replace("_", " ")}
        </span>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" /> New Applications Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.newAppsToday ?? "—"}</p>
            {stats && stats.newAppsToday > 0 && (
              <div className="flex gap-2 text-xs mt-1">
                <span className="text-amber-500 font-medium">🔥 {stats.hot} HOT</span>
                <span className="text-primary font-medium">💜 {stats.warm} WARM</span>
                <span className="text-muted-foreground">{stats.cold} COLD</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Pending Change Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.pendingCR ?? "—"}</p>
          </CardContent>
        </Card>

        <Card className={stats?.flagged ? "border-amber-300 bg-amber-50/50" : ""}>
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
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate("/operator/applications")} variant="outline" className="gap-2">
          <FileText className="h-4 w-4" /> Review Applications
        </Button>
        <Button onClick={() => navigate("/operator/change-requests")} variant="outline" className="gap-2">
          <MessageSquare className="h-4 w-4" /> Pending Change Requests
        </Button>
      </div>

      {/* Activity feed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity && recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 text-sm border-b pb-3 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{log.action}</p>
                    <p className="text-muted-foreground text-xs">
                      {log.user_name || log.user_email || "System"} · {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No recent activity yet. Actions will appear here as you and your team work.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
