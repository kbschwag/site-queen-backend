import { useMemo, useState } from "react";
import { useClientPlan } from "@/hooks/useClientPlan";
import { useAnalyticsEvents, pageNameFromPath } from "@/hooks/useAnalyticsData";
import { AnalyticsHeader, InfoIcon, Period, UpgradeLock, EmptyState, rangeForPeriod } from "@/components/analytics/shared";
import "@/styles/analytics.css";

export default function AnalyticsBehavior() {
  const { clientId, isPremium, isLoading } = useClientPlan();
  const [period, setPeriod] = useState<Period>("7");
  const { data } = useAnalyticsEvents(clientId, period, isPremium);

  const pages = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.rows.filter((r) => new Date(r.created_at) >= data.start).forEach((r) => set.add(r.page_path || "/"));
    return Array.from(set).sort();
  }, [data]);

  const [scrollPage, setScrollPage] = useState<string>("");
  const [clickPage, setClickPage] = useState<string>("");
  const activeScrollPage = scrollPage || pages[0] || "/";
  const activeClickPage = clickPage || pages[0] || "/";

  // Scroll depth — per page, count distinct visitors per milestone
  const scrollStats = useMemo(() => {
    if (!data) return null;
    const curr = data.rows.filter((r) => new Date(r.created_at) >= data.start && (r.page_path || "/") === activeScrollPage);
    const visitorsOnPage = new Set(curr.filter((r) => r.event_type === "page_view").map((r) => r.visitor_id).filter(Boolean));
    const total = visitorsOnPage.size;
    const milestone = (m: number) => {
      const reached = new Set(curr.filter((r) => r.event_type === "scroll_depth" && (r.scroll_milestone || 0) >= m).map((r) => r.visitor_id).filter(Boolean));
      return reached.size;
    };
    return {
      total,
      m25: milestone(25), m50: milestone(50), m75: milestone(75), m100: milestone(100),
    };
  }, [data, activeScrollPage]);

  // Clicks — per page, group by element label (top-N)
  const clicks = useMemo(() => {
    if (!data) return { total: 0, rows: [] as { label: string; count: number }[] };
    const curr = data.rows.filter((r) => new Date(r.created_at) >= data.start && r.event_type === "click" && (r.page_path || "/") === activeClickPage);
    const counts: Record<string, number> = {};
    curr.forEach((r) => {
      const el = r.element as any;
      const label = el?.text?.trim?.() || el?.id || el?.tag || "(unlabeled element)";
      counts[label] = (counts[label] || 0) + 1;
    });
    const rows = Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10);
    return { total: curr.length, rows };
  }, [data, activeClickPage]);

  const clickIntensity = (count: number, max: number): string => {
    if (max === 0) return "cool";
    const pct = count / max;
    if (pct >= 0.7) return "hot";
    if (pct >= 0.4) return "warm";
    if (pct >= 0.2) return "mid";
    return "cool";
  };
  const clickMax = clicks.rows[0]?.count || 0;

  // Custom events
  const customEvents = useMemo(() => {
    if (!data) return [];
    const curr = data.rows.filter((r) => new Date(r.created_at) >= data.start && r.event_type === "custom_event");
    const counts: Record<string, number> = {};
    curr.forEach((r) => { const n = r.event_name || "Unnamed"; counts[n] = (counts[n] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  if (isLoading) return <div className="analytics-root"><EmptyState>Loading…</EmptyState></div>;
  const periodLabel = rangeForPeriod(period).label;

  return (
    <div className="analytics-root">
      <AnalyticsHeader title="Behavior" subtitle="How visitors interact with your pages" period={period} onPeriodChange={setPeriod} />
      {!isPremium ? (
        <UpgradeLock title="Behavior is a Premium feature" blurb="See how far visitors scroll, which buttons and links they actually click, and which custom actions they take across your site." />
      ) : (
        <>
          {/* Scroll depth */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              Scroll Depth
              <InfoIcon title="Scroll Depth" body="How far down each page visitors actually scroll. Helpful for deciding whether important content is too far down to be seen." benchmark="What's good: at least 50% of visitors reaching your main CTA." />
              {pages.length > 0 && (
                <PagePicker pages={pages} value={activeScrollPage} onChange={setScrollPage} />
              )}
              <span className="card-subtitle">{scrollStats?.total ?? 0} visitors</span>
            </div>
            {!scrollStats || scrollStats.total === 0 ? (
              <EmptyState>No scroll data for this page yet.</EmptyState>
            ) : (
              <div className="scroll-page-mock">
                <div className="scroll-page-frame">
                  <div className="scroll-page-content">
                    <div className="scroll-mock-block h1" /><div className="scroll-mock-block txt" /><div className="scroll-mock-block txt short" />
                    <div className="scroll-mock-block img" /><div className="scroll-mock-block h2" /><div className="scroll-mock-block txt" />
                    <div className="scroll-mock-block txt" /><div className="scroll-mock-block txt short" /><div className="scroll-mock-block cta" />
                    <div className="scroll-mock-block h2" /><div className="scroll-mock-block txt" /><div className="scroll-mock-block txt short" />
                    <div className="scroll-mock-block img" /><div className="scroll-mock-block txt" />
                  </div>
                  <div className="scroll-line" style={{ top: "25%" }} data-label={`${pct(scrollStats.m100, scrollStats.total)}%`} />
                  <div className="scroll-line" style={{ top: "50%" }} data-label={`${pct(scrollStats.m75, scrollStats.total)}%`} />
                  <div className="scroll-line" style={{ top: "75%" }} data-label={`${pct(scrollStats.m50, scrollStats.total)}%`} />
                </div>
                <div className="scroll-stats">
                  {[
                    { label: "Reached 25% of page", v: scrollStats.m25 },
                    { label: "Reached 50% of page", v: scrollStats.m50 },
                    { label: "Reached 75% of page", v: scrollStats.m75 },
                    { label: "Reached bottom (100%)", v: scrollStats.m100 },
                  ].map((row) => (
                    <div className="scroll-stat-row" key={row.label}>
                      <div className="scroll-stat-label">{row.label}</div>
                      <div className="scroll-stat-val">{row.v} / {scrollStats.total} visitors ({pct(row.v, scrollStats.total)}%)</div>
                      <div className="scroll-stat-bar"><div className="scroll-stat-fill" style={{ width: `${pct(row.v, scrollStats.total)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Click locations */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              Click Locations
              <InfoIcon title="Click Locations" body="Every button, link, and clickable element on your page — ranked by how often visitors clicked it this period. The colored dot shows relative intensity." benchmark="What's good: your main CTAs (like 'Get a Quote') should dominate the top of the list." />
              {pages.length > 0 && (
                <PagePicker pages={pages} value={activeClickPage} onChange={setClickPage} />
              )}
              <span className="card-subtitle">{clicks.total} clicks · {periodLabel}</span>
            </div>
            {clicks.rows.length === 0 ? (
              <EmptyState>No click data for this page yet.</EmptyState>
            ) : (
              <>
                <div className="click-list">
                  {clicks.rows.map((c) => (
                    <div className="click-row" key={c.label}>
                      <div className={`click-intensity ${clickIntensity(c.count, clickMax)}`} />
                      <div className="click-info">
                        <div className="click-element">{c.label}</div>
                      </div>
                      <div className="click-count">{c.count}<span className="click-count-label">clicks</span></div>
                    </div>
                  ))}
                </div>
                <div className="click-list-footer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                  <span>Want to see <em>where on the page</em> these clicks happened? Visual heatmaps with page screenshots are coming soon as part of this Premium plan.</span>
                </div>
              </>
            )}
          </div>

          {/* Custom events */}
          <div className="card">
            <div className="card-title">
              Custom Events
              <InfoIcon title="Custom Events" body="Specific actions visitors take that you care about — like clicking a phone number, watching a video, or downloading a PDF. These are defined per site during setup." />
              <span className="card-subtitle">{periodLabel}</span>
            </div>
            {customEvents.length === 0 ? (
              <EmptyState>No custom events tracked yet.</EmptyState>
            ) : (
              <div className="event-list">
                {customEvents.map(([name, count]) => (
                  <div className="event-item" key={name}>
                    <div className="event-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                    </div>
                    <div className="event-info">
                      <div className="event-name">{name}</div>
                    </div>
                    <div className="event-count">{count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 100) : 0;
}

function PagePicker({ pages, value, onChange }: { pages: string[]; value: string; onChange: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="page-picker">
      <button type="button" className="page-picker-btn" onClick={() => setOpen((o) => !o)}>
        <span className="page-picker-current">{pageNameFromPath(value)}</span>
        <span className="caret">▼</span>
      </button>
      {open && (
        <div className="page-picker-menu" onMouseLeave={() => setOpen(false)}>
          {pages.map((p) => (
            <div key={p} className={`page-picker-opt ${p === value ? "active" : ""}`} onClick={() => { onChange(p); setOpen(false); }}>
              {pageNameFromPath(p)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
