import { useMemo, useState } from "react";
import { useClientPlan } from "@/hooks/useClientPlan";
import { useAnalyticsEvents, useFormSubmissions, classifySource, pageNameFromPath } from "@/hooks/useAnalyticsData";
import { AnalyticsHeader, InfoIcon, Period, UpgradeLock, EmptyState } from "@/components/analytics/shared";
import "@/styles/analytics.css";

export default function AnalyticsConversions() {
  const { clientId, isPremium, isLoading } = useClientPlan();
  const [period, setPeriod] = useState<Period>("7");
  const { data } = useAnalyticsEvents(clientId, period, isPremium);
  const { data: forms } = useFormSubmissions(clientId, period, isPremium);

  const funnel = useMemo(() => {
    if (!data || !forms) return null;
    const curr = data.rows.filter((r) => new Date(r.created_at) >= data.start);
    const visitors = new Set(curr.map((r) => r.visitor_id).filter(Boolean));
    const servicesVisitors = new Set(curr.filter((r) => /service/i.test(r.page_path || "")).map((r) => r.visitor_id).filter(Boolean));
    const contactReached = new Set(curr.filter((r) => /contact/i.test(r.page_path || "")).map((r) => r.visitor_id).filter(Boolean));
    const submitters = forms.filter((f) => new Date(f.created_at) >= data.start).length;
    return [
      { label: "1. Visited Site", n: visitors.size, pct: 100 },
      { label: "2. Viewed Services Page", n: servicesVisitors.size, pct: visitors.size ? Math.round((servicesVisitors.size / visitors.size) * 100) : 0 },
      { label: "3. Reached Contact Page", n: contactReached.size, pct: visitors.size ? Math.round((contactReached.size / visitors.size) * 100) : 0 },
      { label: "4. Submitted Form", n: submitters, pct: visitors.size ? Math.round((submitters / visitors.size) * 100) : 0 },
    ];
  }, [data, forms]);

  const sourceAttr = useMemo(() => {
    if (!data || !forms) return [];
    const curr = data.rows.filter((r) => new Date(r.created_at) >= data.start);
    const visitorsBySource: Record<string, Set<string>> = {};
    curr.forEach((r) => {
      const s = classifySource(r.referrer);
      visitorsBySource[s] = visitorsBySource[s] || new Set();
      if (r.visitor_id) visitorsBySource[s].add(r.visitor_id);
    });
    const submitsBySource: Record<string, number> = {};
    forms.filter((f) => new Date(f.created_at) >= data.start).forEach((f) => {
      const s = f.source || classifySource(f.referrer);
      submitsBySource[s] = (submitsBySource[s] || 0) + 1;
    });
    return Object.entries(visitorsBySource).map(([src, vSet]) => ({
      src, visitors: vSet.size, submits: submitsBySource[src] || 0,
      rate: vSet.size ? ((submitsBySource[src] || 0) / vSet.size) * 100 : 0,
    })).sort((a, b) => b.visitors - a.visitors);
  }, [data, forms]);

  const pageConv = useMemo(() => {
    if (!data || !forms) return [];
    const curr = data.rows.filter((r) => new Date(r.created_at) >= data.start);
    const visitsByPage: Record<string, number> = {};
    curr.filter((r) => r.event_type === "page_view").forEach((r) => {
      const p = r.page_path || "/";
      visitsByPage[p] = (visitsByPage[p] || 0) + 1;
    });
    const submitsByPage: Record<string, number> = {};
    forms.filter((f) => new Date(f.created_at) >= data.start).forEach((f) => {
      const p = f.page_path || "/";
      submitsByPage[p] = (submitsByPage[p] || 0) + 1;
    });
    return Object.entries(visitsByPage).map(([p, v]) => ({
      page: p, visits: v, submits: submitsByPage[p] || 0,
      rate: v ? ((submitsByPage[p] || 0) / v) * 100 : 0,
    })).sort((a, b) => b.visits - a.visits).slice(0, 8);
  }, [data, forms]);

  if (isLoading) return <div className="analytics-root"><EmptyState>Loading…</EmptyState></div>;

  return (
    <div className="analytics-root">
      <AnalyticsHeader title="Conversions" subtitle="How visitors turn into leads on your site" period={period} onPeriodChange={setPeriod} />
      {!isPremium ? (
        <UpgradeLock title="Conversions is a Premium feature" blurb="See exactly where visitors drop off, which sources actually drive form submissions, and which pages convert best — so you know where to focus." />
      ) : !funnel ? (
        <EmptyState>Loading…</EmptyState>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              Conversion Funnel
              <InfoIcon title="Conversion Funnel" body="The journey your visitors take from arriving on your site to submitting a form. Each stage shows where you lose visitors." benchmark="What's good: focus on the biggest drop — that's where small fixes have the largest impact." />
            </div>
            {funnel.map((s, i) => (
              <div key={s.label}>
                <div className="funnel-stage">
                  <div className="funnel-info">
                    <div className="funnel-label">{s.label}</div>
                    <div className="funnel-stat">{s.n} visitor{s.n === 1 ? "" : "s"} ({s.pct}%)</div>
                  </div>
                  <div className="funnel-bar-wrap">
                    <div className="funnel-bar" style={{ width: `${Math.max(s.pct, 4)}%` }}>{s.n}</div>
                  </div>
                </div>
                {i < funnel.length - 1 && funnel[i].n > 0 && (
                  <div className="funnel-drop">▼ {Math.max(0, 100 - Math.round((funnel[i + 1].n / funnel[i].n) * 100))}% drop-off</div>
                )}
              </div>
            ))}
          </div>

          <div className="row-2-equal">
            <div className="card">
              <div className="card-title">
                Source Attribution
                <InfoIcon title="Source Attribution" body="Shows which traffic source actually drives form submissions — not just clicks. Helps you focus marketing spend on what works." />
              </div>
              {sourceAttr.length === 0 ? (
                <EmptyState>No source data yet.</EmptyState>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Source</th><th className="num">Visitors</th><th className="num">Submits</th><th className="num">Rate</th></tr></thead>
                  <tbody>
                    {sourceAttr.map((r) => (
                      <tr key={r.src}><td>{r.src}</td><td className="num">{r.visitors}</td><td className="num">{r.submits}</td><td className="num">{r.rate.toFixed(1)}%</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <div className="card-title">
                Page Conversion Rates
                <InfoIcon title="Page Conversion Rates" body="Of visitors who landed on each page, what percentage submitted a form. Pages with low rates may need improvement." />
              </div>
              {pageConv.length === 0 ? (
                <EmptyState>No page data yet.</EmptyState>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Landing Page</th><th className="num">Visits</th><th className="num">Rate</th></tr></thead>
                  <tbody>
                    {pageConv.map((r) => (
                      <tr key={r.page}><td className="keyword">{r.page}</td><td className="num">{r.visits}</td><td className="num">{r.rate.toFixed(1)}%</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
