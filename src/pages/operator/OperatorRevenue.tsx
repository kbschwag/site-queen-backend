import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays } from "date-fns";
import { BarChart3, Users, TrendingUp, TrendingDown } from "lucide-react";

export default function OperatorRevenue() {
  const now = new Date();
  const thirtyDaysAgo = format(subDays(now, 30), "yyyy-MM-dd");

  const { data: summaries, isLoading } = useQuery({
    queryKey: ["operator-analytics-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics_daily_summary")
        .select("*, clients!inner(business_name)")
        .gte("date", thirtyDaysAgo)
        .order("date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const totalVisitors = summaries?.reduce((a, b) => a + (b.page_views || 0), 0) || 0;
  const totalPhoneClicks = summaries?.reduce((a, b) => a + (b.phone_clicks || 0), 0) || 0;
  const totalForms = summaries?.reduce((a, b) => a + (b.form_submissions || 0), 0) || 0;

  // Aggregate by client
  const clientMap = new Map<string, { name: string; views: number }>();
  summaries?.forEach(s => {
    const name = (s as any).clients?.business_name || "Unknown";
    const existing = clientMap.get(s.client_id) || { name, views: 0 };
    existing.views += s.page_views || 0;
    clientMap.set(s.client_id, existing);
  });
  const sorted = [...clientMap.entries()].sort((a, b) => b[1].views - a[1].views);
  const topClients = sorted.slice(0, 5);
  const bottomClients = sorted.slice(-5).reverse();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Revenue & Analytics</h1>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[100px]" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Total Visitors (30d)</p>
                <p className="text-2xl font-bold text-primary">{totalVisitors.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">across all client sites</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Phone Clicks (30d)</p>
                <p className="text-2xl font-bold text-primary">{totalPhoneClicks.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Form Submissions (30d)</p>
                <p className="text-2xl font-bold text-primary">{totalForms.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" /> Most Active Sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No analytics data yet</p>
                ) : (
                  <div className="space-y-2">
                    {topClients.map(([id, c], i) => (
                      <div key={id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{i + 1}. {c.name}</span>
                        <span className="font-medium text-primary">{c.views.toLocaleString()} views</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" /> Least Active Sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                {bottomClients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No analytics data yet</p>
                ) : (
                  <div className="space-y-2">
                    {bottomClients.map(([id, c], i) => (
                      <div key={id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{i + 1}. {c.name}</span>
                        <span className="font-medium text-muted-foreground">{c.views.toLocaleString()} views</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
