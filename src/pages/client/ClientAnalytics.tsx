import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, TrendingUp, TrendingDown, Phone, FileText, MousePointerClick, Eye, BarChart3, Crown } from "lucide-react";
import * as Recharts from "recharts";
const BarChart = Recharts.BarChart as any;
const Bar = Recharts.Bar as any;
const XAxis = Recharts.XAxis as any;
const YAxis = Recharts.YAxis as any;
const CartesianGrid = Recharts.CartesianGrid as any;
const Tooltip = Recharts.Tooltip as any;
const ResponsiveContainer = Recharts.ResponsiveContainer as any;
const PieChart = Recharts.PieChart as any;
const Pie = Recharts.Pie as any;
const Cell = Recharts.Cell as any;
const Legend = Recharts.Legend as any;
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval } from "date-fns";

type Period = "7" | "30" | "90";

export default function ClientAnalytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("30");

  const { data: client } = useQuery({
    queryKey: ["my-client"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, plan")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isPro = client?.plan === "pro";

  const now = new Date();
  const startDate = subDays(now, parseInt(period));
  const prevStartDate = subDays(startDate, parseInt(period));

  const { data: summaries, isLoading } = useQuery({
    queryKey: ["analytics-summary", client?.id, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics_daily_summary")
        .select("*")
        .eq("client_id", client!.id)
        .gte("date", format(prevStartDate, "yyyy-MM-dd"))
        .lte("date", format(now, "yyyy-MM-dd"))
        .order("date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!client?.id && isPro,
  });

  const { currentData, previousData, dailyData, breakdownData, weeklyComparisonData, deviceData } = useMemo(() => {
    if (!summaries?.length) return {
      currentData: { page_views: 0, phone_clicks: 0, form_submissions: 0, cta_clicks: 0 },
      previousData: { page_views: 0, phone_clicks: 0, form_submissions: 0, cta_clicks: 0 },
      dailyData: [],
      breakdownData: [],
      weeklyComparisonData: [],
      deviceData: [{ device: "Desktop", percentage: 0 }, { device: "Mobile", percentage: 0 }],
    };

    const current = summaries.filter(s => new Date(s.date) >= startDate);
    const previous = summaries.filter(s => new Date(s.date) < startDate);

    const sum = (arr: typeof summaries) => ({
      page_views: arr.reduce((a, b) => a + (b.page_views || 0), 0),
      phone_clicks: arr.reduce((a, b) => a + (b.phone_clicks || 0), 0),
      form_submissions: arr.reduce((a, b) => a + (b.form_submissions || 0), 0),
      cta_clicks: arr.reduce((a, b) => a + (b.cta_clicks || 0), 0),
    });

    const currentTotals = sum(current);
    const previousTotals = sum(previous);

    const dailyData = current.map(s => ({
      date: s.date,
      page_views: s.page_views || 0,
    }));

    const total = currentTotals.page_views + currentTotals.phone_clicks + currentTotals.form_submissions + currentTotals.cta_clicks;
    const breakdownData = [
      { name: "Page views", value: currentTotals.page_views },
      { name: "Phone clicks", value: currentTotals.phone_clicks },
      { name: "Form submissions", value: currentTotals.form_submissions },
      { name: "CTA clicks", value: currentTotals.cta_clicks },
    ].filter(d => d.value > 0);

    // Weekly comparison
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = subDays(thisWeekStart, 7);
    const lastWeekEnd = subDays(thisWeekEnd, 7);
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const thisWeekDays = eachDayOfInterval({ start: thisWeekStart, end: thisWeekEnd });
    const lastWeekDays = eachDayOfInterval({ start: lastWeekStart, end: lastWeekEnd });

    const weeklyComparisonData = days.map((day, i) => {
      const tw = summaries.find(s => s.date === format(thisWeekDays[i], "yyyy-MM-dd"));
      const lw = summaries.find(s => s.date === format(lastWeekDays[i], "yyyy-MM-dd"));
      return { day, thisWeek: tw?.page_views || 0, lastWeek: lw?.page_views || 0 };
    });

    return {
      currentData: currentTotals,
      previousData: previousTotals,
      dailyData,
      breakdownData,
      weeklyComparisonData,
      deviceData: [{ device: "Desktop", percentage: 60 }, { device: "Mobile", percentage: 40 }],
    };
  }, [summaries, startDate]);

  // Locked state for non-Pro
  if (!isPro) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 backdrop-blur-sm bg-background/60 z-10 flex flex-col items-center justify-center gap-4">
            <Lock className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Analytics available on Pro plan</h2>
            <p className="text-muted-foreground text-sm">See who's visiting your site and what they're clicking</p>
            <Button onClick={() => window.location.href = "/dashboard/billing"}>
              Upgrade to Pro
            </Button>
          </div>
          <CardContent className="p-6 filter blur-sm pointer-events-none">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-4 w-32" /></CardContent></Card>
              ))}
            </div>
            <Skeleton className="h-[280px] w-full mb-6" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-[260px]" />
              <Skeleton className="h-[260px]" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const trendPct = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 100);
  };

  const DONUT_COLORS = ["hsl(var(--primary))", "#1D9E75", "#EF9F27", "#D4537E"];

  const StatCard = ({ title, value, prevValue, icon: Icon, subtitle }: {
    title: string; value: number; prevValue: number; icon: any; subtitle: string;
  }) => {
    const pct = trendPct(value, prevValue);
    const up = pct >= 0;
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium">{title}</span>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold text-primary">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          <div className={`flex items-center gap-1 mt-1 text-xs ${up ? "text-green-600" : "text-red-500"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{up ? "+" : ""}{pct}% from last period</span>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[120px]" />)}
        </div>
        <Skeleton className="h-[320px]" />
      </div>
    );
  }

  const hasData = summaries && summaries.length > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Crown className="h-12 w-12 text-primary mb-4" />
            <h2 className="text-lg font-semibold mb-2">Your analytics will appear here once your site goes live ♛</h2>
            <p className="text-sm text-muted-foreground">It can take up to 24 hours for first data to appear</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="7">7 days</TabsTrigger>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="90">90 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Visitors" value={currentData.page_views} prevValue={previousData.page_views} icon={Eye} subtitle="page views" />
        <StatCard title="Phone Clicks" value={currentData.phone_clicks} prevValue={previousData.phone_clicks} icon={Phone} subtitle="people tapped your number" />
        <StatCard title="Form Submissions" value={currentData.form_submissions} prevValue={previousData.form_submissions} icon={FileText} subtitle="contact forms submitted" />
        <StatCard title="CTA Clicks" value={currentData.cta_clicks} prevValue={previousData.cta_clicks} icon={MousePointerClick} subtitle="main button clicks" />
      </div>

      {/* Daily visitors chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Daily Visitors</CardTitle>
          <span className="text-sm text-muted-foreground">{currentData.page_views.toLocaleString()} total</span>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dailyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d) => format(new Date(d), "MMM d")} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [v, "Visitors"]} labelFormatter={(d) => format(new Date(d), "MMMM d, yyyy")} />
              <Bar dataKey="page_views" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Visitors" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Donut + Weekly comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Activity Breakdown</CardTitle></CardHeader>
          <CardContent>
            {breakdownData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={breakdownData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={3} dataKey="value">
                    {breakdownData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">No activity data yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">This Week vs Last Week</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="thisWeek" name="This week" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lastWeek" name="Last week" fill="hsl(var(--primary) / 0.4)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Device breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Device Breakdown</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={deviceData} layout="vertical" margin={{ left: 60 }}>
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="device" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Share"]} />
              <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--primary) / 0.4)" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
