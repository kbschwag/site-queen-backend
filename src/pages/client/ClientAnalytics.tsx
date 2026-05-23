import { useMemo, useState } from "react";
import { useClientPlan } from "@/hooks/useClientPlan";
import { useAnalyticsEvents, useFormSubmissions, classifySource, getSourceColor, pageNameFromPath } from "@/hooks/useAnalyticsData";
import { AnalyticsHeader, InfoIcon, Period, StatDelta, EmptyState, rangeForPeriod } from "@/components/analytics/shared";
import "@/styles/analytics.css";

export default function ClientAnalytics() {
  const { clientId, isPremium, isLoading: planLoading } = useClientPlan();
  const [period, setPeriod] = useState<Period>("7");
  const { data, isLoading } = useAnalyticsEvents(clientId, period);
  const { data: forms } = useFormSubmissions(clientId, period);

  const stats = useMemo(() => {
    if (!data) return null;
    const { start, prevStart } = data;
    const curr = data.rows.filter((r) => new Date(r.created_at) >= start);
    const prev = data.rows.filter((r) => new Date(r.created_at) < start);

    const visitors = (rows: typeof curr) => new Set(rows.map((r) => r.visitor_id).filter(Boolean)).size;
    const pv = (rows: typeof curr) => rows.filter((r) => r.event_type === "page_view").length;

    // Time on site: average over sessions of (max created_at - min created_at)
    const sessionsTime = (rows: typeof curr) => {
      const bySess: Record<string, number[]> = {};
      rows.forEach((r) => {
        if (!r.session_id_fk) return;
        const t = new Date(r.created_at).getTime();
        if (!bySess[r.session_id_fk]) bySess[r.session_id_fk] = [t, t];
        else {
          bySess[r.session_id_fk][0] = Math.min(bySess[r.session_id_fk][0], t);
          bySess[r.session_id_fk][1] = Math.max(bySess[r.session_id_fk][1], t);
        }
      });
      const durations = Object.values(bySess).map(([a, b]) => (b - a) / 1000).filter((s) => s > 0);
      if (!durations.length) return 0;
      return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    };

    const cForms = (forms || []).filter((f) => new Date(f.created_at) >= start).length;
    const pForms = (forms || []).filter((f) => new Date(f.created_at) < start && new Date(f.created_at) >= prevStart).length;

    return {
      visitors: visitors(curr),
      visitorsPrev: visitors(prev),
      pv: pv(curr),
      pvPrev: pv(prev),
      forms: cForms,
      formsPrev: pForms,
      time: sessionsTime(curr),
      timePrev: sessionsTime(prev),
      currRows: curr,
    };
  }, [data, forms]);

  // Traffic sources
  const sources = useMemo(() => {
    if (!stats) return [];
    const pageViews = stats.currRows.filter((r) => r.event_type === "page_view");
    const counts: Record<string, number> = {};
    const visitorBySource: Record<string, Set<string>> = {};
    pageViews.forEach((r) => {
      const s = classifySource(r.referrer);
      visitorBySource[s] = visitorBySource[s] || new Set();
      if (r.visitor_id) visitorBySource[s].add(r.visitor_id);
    });
    Object.entries(visitorBySource).forEach(([k, v]) => (counts[k] = v.size));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [stats]);
  const sourceMax = sources.reduce((a, [, v]) => Math.max(a, v), 0);

  // Top pages
  const topPages = useMemo(() => {
    if (!stats) return [];
    const counts: Record<string, number> = {};
    stats.currRows.filter((r) => r.event_type === "page_view").forEach((r) => {
      const p = r.page_path || "/";
      counts[p] = (counts[p] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [stats]);

  // Devices
  const devices = useMemo(() => {
    if (!stats) return { mobile: 0, desktop: 0, tablet: 0 };
    const pv = stats.currRows.filter((r) => r.event_type === "page_view");
    let m = 0, d = 0, t = 0;
    pv.forEach((r) => {
      if (r.device_type === "mobile") m++;
      else if (r.device_type === "tablet") t++;
      else d++;
    });
    const total = m + d + t || 1;
    return { mobile: Math.round((m / total) * 100), desktop: Math.round((d / total) * 100), tablet: Math.round((t / total) * 100), total };
  }, [stats]);

  // Countries
  const countries = useMemo(() => {
    if (!stats) return [];
    const counts: Record<string, number> = {};
    stats.currRows.forEach((r) => {
      const c = r.country || "Unknown";
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [stats]);

  // Trend chart points (daily visitors)
  const trend = useMemo(() => {
    if (!stats || !data) return [];
    const { start } = data;
    const days = period === "today" ? 1 : period === "30" ? 30 : 7;
    const out: { date: string; visitors: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i + 1);
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const visitorSet = new Set<string>();
      stats.currRows.forEach((r) => {
        const t = new Date(r.created_at);
        if (t >= dayStart && t <= dayEnd && r.visitor_id) visitorSet.add(r.visitor_id);
      });
      out.push({ date: dayStart.toLocaleDateString("en", { weekday: "short" }), visitors: visitorSet.size });
    }
    return out;
  }, [stats, data, period]);

  const periodLabel = rangeForPeriod(period).label;
  const visitorsTotal = stats?.visitors ?? 0;
  const friendlyDelta = stats ? Math.round(((stats.visitors - stats.visitorsPrev) / Math.max(stats.visitorsPrev, 1)) * 100) : 0;

  if (planLoading) return <div className="analytics-root"><EmptyState>Loading…</EmptyState></div>;

  return (
    <div className="analytics-root">
      <AnalyticsHeader title="Analytics" subtitle="How your website is performing" period={period} onPeriodChange={setPeriod} />

      {/* AI Insight — Premium only, stub */}
      {isPremium && (
        <div className="ai-insight">
          <div className="ai-insight-header">
            <div className="ai-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z" /></svg>
            </div>
            <div className="ai-label">AI Weekly Insight</div>
            <div className="ai-premium-badge">PREMIUM</div>
          </div>
          <div className="ai-text" style={{ color: "var(--sq-muted)" }}>
            AI insights start generating after your site has at least 7 days of data.
          </div>
        </div>
      )}

      {/* Friendly summary (always visible) */}
      {stats && stats.visitors > 0 && (
        <div className="friendly-summary">
          <div className="friendly-emoji">{friendlyDelta >= 0 ? "🎉" : "📉"}</div>
          <div className="friendly-text">
            <strong>{stats.visitors} visitors {periodLabel}</strong>
            {stats.visitorsPrev > 0 && (
              <> — that's {friendlyDelta >= 0 ? "up" : "down"} {Math.abs(friendlyDelta)}% from the previous period.</>
            )}
            {topPages[0] && <> Your <strong>{pageNameFromPath(topPages[0][0])}</strong> page was the most popular.</>}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Visitors <InfoIcon title="Visitors" body="The number of unique people who came to your website. Each person is counted once, no matter how many pages they look at." benchmark="What's good: depends on your business — but trending up week over week is what matters most." /></div>
          <div className="stat-value">{stats?.visitors ?? 0}</div>
          {stats && <StatDelta curr={stats.visitors} prev={stats.visitorsPrev} label={periodLabel} />}
        </div>
        <div className="stat-card">
          <div className="stat-label">Page Views <InfoIcon title="Page Views" body="The total number of pages looked at across all visitors. One person looking at three pages counts as three page views." benchmark="What's good: 2-4 pages per visitor is healthy for a service site." /></div>
          <div className="stat-value">{stats?.pv ?? 0}</div>
          {stats && <StatDelta curr={stats.pv} prev={stats.pvPrev} label={periodLabel} />}
        </div>
        <div className="stat-card">
          <div className="stat-label">Form Submissions <InfoIcon title="Form Submissions" body="How many people filled out and submitted your contact form. These are your direct leads from the website." benchmark="What's good: 2-5% of visitors typically submit a form on a service site." upsell={!isPremium ? "Premium shows which page and source drove each lead." : undefined} /></div>
          <div className="stat-value">{stats?.forms ?? 0}</div>
          {stats && <StatDelta curr={stats.forms} prev={stats.formsPrev} label={periodLabel} />}
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg. Time on Site <InfoIcon title="Average Time on Site" body="How long, on average, visitors stayed on your website before leaving. A longer time usually means they were genuinely interested." benchmark="What's good: 1-3 minutes is typical for a small business site." /></div>
          <div className="stat-value">{stats ? `${Math.floor(stats.time / 60)}:${String(stats.time % 60).padStart(2, "0")}` : "0:00"}</div>
          {stats && <StatDelta curr={stats.time} prev={stats.timePrev} label={periodLabel} />}
        </div>
      </div>

      {/* Trend chart + Sources */}
      <div className="row-2">
        <div className="card">
          <div className="card-title">
            Visitors Over Time
            <InfoIcon title="Visitors Over Time" body="A daily count of unique visitors to your website over the selected period. Helps you spot patterns — like which days bring the most traffic." />
            <span className="card-subtitle" style={{ marginLeft: "auto" }}>{periodLabel}</span>
          </div>
          <div className="chart-wrap">
            <TrendSvg points={trend} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            Traffic Sources
            <InfoIcon title="Traffic Sources" body="Where your visitors came from. 'Direct' means they typed your URL or used a bookmark. 'Search' means they found you on Google or Bing." benchmark="What's good: a mix is healthy — too dependent on one source is risky." />
          </div>
          {sources.length === 0 ? (
            <EmptyState>No traffic data yet.</EmptyState>
          ) : (
            sources.map(([src, count]) => (
              <div className="source-bar" key={src}>
                <div className="source-label"><span className="source-dot" style={{ background: getSourceColor(src) }} />{src}</div>
                <div className="source-track"><div className="source-fill" style={{ width: `${(count / sourceMax) * 100}%`, background: getSourceColor(src) }} /></div>
                <div className="source-count">{count}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top pages */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">
          Top Pages
          <InfoIcon title="Top Pages" body="The pages on your website that got the most views this period. Useful for knowing which pages do the heavy lifting." />
          <span className="card-subtitle">Most viewed first</span>
        </div>
        {topPages.length === 0 ? (
          <EmptyState>No page view data yet.</EmptyState>
        ) : (
          <div className="page-list">
            {topPages.map(([path, count], i) => (
              <div className="page-item" key={path}>
                <div className="page-rank">{i + 1}</div>
                <div className="page-name">{pageNameFromPath(path)}</div>
                <div className="page-path">{path}</div>
                <div className="page-views">{count} views</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Devices + Countries */}
      <div className="row-2-equal">
        <div className="card">
          <div className="card-title">
            Devices
            <InfoIcon title="Devices" body="How your visitors are split between phones, tablets, and computers. Most small businesses get 60-75% mobile traffic." />
          </div>
          {!devices.total ? (
            <EmptyState>No device data yet.</EmptyState>
          ) : (
            <div className="donut-wrap">
              <DonutSvg mobile={devices.mobile} desktop={devices.desktop} />
              <div className="donut-legend" style={{ flex: 1 }}>
                <div className="legend-item"><span className="legend-dot" style={{ background: "#7C5BC9" }} /><span className="legend-label">Mobile</span><span className="legend-value">{devices.mobile}%</span></div>
                <div className="legend-item"><span className="legend-dot" style={{ background: "#A57EE1" }} /><span className="legend-label">Desktop</span><span className="legend-value">{devices.desktop}%</span></div>
                {devices.tablet > 0 && <div className="legend-item"><span className="legend-dot" style={{ background: "#D5CCDC" }} /><span className="legend-label">Tablet</span><span className="legend-value">{devices.tablet}%</span></div>}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            Top Countries
            <InfoIcon title="Top Countries" body="Where your visitors are physically located, based on their internet connection. Mostly useful to confirm your traffic is local." />
          </div>
          {countries.length === 0 ? (
            <EmptyState>No location data yet.</EmptyState>
          ) : (
            <div className="country-list">
              {countries.map(([c, n]) => (
                <div className="country-item" key={c}>
                  <span className="country-flag">{flagFor(c)}</span>
                  <span className="country-name">{c === "Unknown" ? "Unknown" : c}</span>
                  <span className="country-count">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrendSvg({ points }: { points: { date: string; visitors: number }[] }) {
  if (!points.length) return <div className="empty-state">No data yet.</div>;
  const max = Math.max(1, ...points.map((p) => p.visitors));
  const W = 500, H = 180, pad = 30;
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const yFor = (v: number) => H - 50 - (v / max) * (H - 80);
  const xFor = (i: number) => pad + i * step;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(p.visitors)}`).join(" ");
  const areaPath = `${linePath} L${xFor(points.length - 1)},${H - 10} L${xFor(0)},${H - 10} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7C5BC9" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7C5BC9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="30" x2={W} y2="30" stroke="#E8E1F0" strokeDasharray="3,3" />
      <line x1="0" y1="75" x2={W} y2="75" stroke="#E8E1F0" strokeDasharray="3,3" />
      <line x1="0" y1="120" x2={W} y2="120" stroke="#E8E1F0" strokeDasharray="3,3" />
      <path d={areaPath} fill="url(#chartGrad)" />
      <path d={linePath} fill="none" stroke="#7C5BC9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(p.visitors)} r={i === points.length - 1 ? 4 : 3.5} fill={i === points.length - 1 ? "#7C5BC9" : "white"} stroke="#7C5BC9" strokeWidth="2" />
      ))}
      {points.map((p, i) => (
        <text key={i} x={xFor(i)} y={H - 8} fontSize="9" fill="#8A7388" textAnchor="middle">{p.date}</text>
      ))}
    </svg>
  );
}

function DonutSvg({ mobile, desktop }: { mobile: number; desktop: number }) {
  return (
    <svg width="100" height="100" viewBox="0 0 42 42">
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="#E8E1F0" strokeWidth="6" />
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="#7C5BC9" strokeWidth="6"
        strokeDasharray={`${mobile} ${100 - mobile}`} strokeDashoffset="25" transform="rotate(-90 21 21)" />
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="#A57EE1" strokeWidth="6"
        strokeDasharray={`${desktop} ${100 - desktop}`} strokeDashoffset={`${-(mobile) + 25}`} transform="rotate(-90 21 21)" />
    </svg>
  );
}

function flagFor(country: string): string {
  const map: Record<string, string> = {
    "United States": "🇺🇸", US: "🇺🇸", USA: "🇺🇸",
    Canada: "🇨🇦", CA: "🇨🇦",
    Mexico: "🇲🇽", MX: "🇲🇽",
    "United Kingdom": "🇬🇧", UK: "🇬🇧", GB: "🇬🇧",
    Australia: "🇦🇺", AU: "🇦🇺",
    Unknown: "🌐",
  };
  return map[country] || "🌐";
}
