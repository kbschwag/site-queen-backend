import { useMemo, useState } from "react";
import { useClientPlan } from "@/hooks/useClientPlan";
import { useAnalyticsEvents, useFormSubmissions, classifySource, pageNameFromPath } from "@/hooks/useAnalyticsData";
import { AnalyticsHeader, InfoIcon, Period, UpgradeLock, EmptyState, rangeForPeriod } from "@/components/analytics/shared";
import "@/styles/analytics.css";

export default function AnalyticsJourney() {
  const { clientId, isPremium, isLoading } = useClientPlan();
  const [period, setPeriod] = useState<Period>("7");
  const { data } = useAnalyticsEvents(clientId, period, isPremium);
  const { data: forms } = useFormSubmissions(clientId, period, isPremium);

  // Build session paths — ordered page_view sequences per session.
  // Tag each session "submitted" iff a form_submission in this period has the same session_id_fk.
  const sessions = useMemo(() => {
    if (!data) return [] as { sid: string; path: string[]; submitted: boolean }[];
    const submittedSids = new Set<string>(
      (forms || [])
        .filter((f: any) => f.session_id_fk && new Date(f.created_at) >= data.start)
        .map((f: any) => f.session_id_fk as string)
    );
    const curr = data.rows.filter(
      (r) => new Date(r.created_at) >= data.start && r.event_type === "page_view" && r.session_id_fk
    );
    const bySession: Record<string, string[]> = {};
    curr.forEach((r) => {
      const sid = r.session_id_fk!;
      bySession[sid] = bySession[sid] || [];
      const name = pageNameFromPath(r.page_path || "/");
      if (bySession[sid][bySession[sid].length - 1] !== name) bySession[sid].push(name);
    });
    return Object.entries(bySession).map(([sid, path]) => ({
      sid, path, submitted: submittedSids.has(sid),
    }));
  }, [data, forms]);

  const submittedCount = (forms || []).filter((f) => data && new Date(f.created_at) >= data.start).length;

  // Top paths — sequence-string → { count, submittedCount }
  const topPaths = useMemo(() => {
    if (!sessions.length) return [] as { steps: string[]; n: number; submittedN: number; pct: number; submitted: boolean }[];
    const counts: Record<string, { steps: string[]; n: number; submittedN: number }> = {};
    sessions.forEach((s) => {
      const key = s.path.slice(0, 5).join(" → ");
      if (!counts[key]) counts[key] = { steps: s.path.slice(0, 5), n: 0, submittedN: 0 };
      counts[key].n++;
      if (s.submitted) counts[key].submittedN++;
    });
    const total = sessions.length;
    return Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 5).map((p) => ({
      ...p,
      pct: Math.round((p.n / total) * 100),
      // Path is "Submitted" if majority of sessions following it ended with a form submission
      submitted: p.submittedN > 0 && p.submittedN >= p.n / 2,
    }));
  }, [sessions]);

  const mostCommon = topPaths[0];

  // Recent submissions
  const recent = useMemo(() => {
    if (!forms || !data) return [];
    return forms.filter((f) => new Date(f.created_at) >= data.start).slice(0, 10);
  }, [forms, data]);

  if (isLoading) return <div className="analytics-root"><EmptyState>Loading…</EmptyState></div>;
  const periodLabel = rangeForPeriod(period).label;

  return (
    <div className="analytics-root">
      <AnalyticsHeader title="Visitor Journey" subtitle="The paths visitors take through your site" period={period} onPeriodChange={setPeriod} />
      {!isPremium ? (
        <UpgradeLock title="Visitor Journey is a Premium feature." blurb="Visitor Journey shows the paths visitors take through your site and surfaces your latest leads with their full message." />
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              Most Common Path
              <InfoIcon title="Most Common Path" body="The page-by-page journey that the largest share of visitors followed. The drop-off numbers show where you lose people between steps." />
              {mostCommon && <span className="card-subtitle">{mostCommon.pct}% of all visitors followed this path</span>}
            </div>
            {!mostCommon ? (
              <EmptyState>Not enough session data yet. Journey paths appear once your site has multiple multi-page sessions.</EmptyState>
            ) : (
              <div className="journey-flow">
                {mostCommon.steps.map((step, i) => (
                  <div key={i} style={{ display: "contents" }}>
                    <div className={`journey-node ${i === mostCommon.steps.length - 1 ? "terminal" : ""}`}>
                      <div className="journey-node-page">{step}</div>
                    </div>
                    {i < mostCommon.steps.length - 1 && (
                      <div className="journey-arrow">
                        <div className="journey-arrow-line">→</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              Top Visitor Paths
              <InfoIcon title="Top Visitor Paths" body="The most common page sequences across all visitors. 'Submitted' = ended with a form submission. 'Exit' = left the site without filling out the form." />
              <span className="card-subtitle">{periodLabel}</span>
            </div>
            {topPaths.length === 0 ? (
              <EmptyState>No journey data yet.</EmptyState>
            ) : (
              <div className="path-list">
                {topPaths.map((p, idx) => (
                  <div className="path-item" key={idx}>
                    <div className="path-pct">{p.pct}%</div>
                    <div className="path-sequence">
                      {p.steps.map((s, i) => (
                        <span key={i} style={{ display: "contents" }}>
                          <span className="path-step">{s}</span>
                          {i < p.steps.length - 1 && <span className="path-arrow">→</span>}
                        </span>
                      ))}
                      <span className={`path-end-tag ${p.submitted ? "converted" : "exit"}`}>
                        {p.submitted ? "Submitted" : "Exit"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Recent Form Submissions
              <InfoIcon title="Recent Form Submissions" body="Your latest leads from the website, with the source and landing page that brought them in." />
              <span className="card-subtitle">{submittedCount} lead{submittedCount === 1 ? "" : "s"} this period</span>
            </div>
            {recent.length === 0 ? (
              <EmptyState>No form submissions in this period.</EmptyState>
            ) : (
              <div className="submission-list">
                {recent.map((f) => (
                  <div className="submission-card" key={f.id}>
                    <div className="submission-avatar">{initials(f.name || f.email || "")}</div>
                    <div className="submission-body">
                      <div className="submission-head">
                        <div className="submission-name">{f.name || f.email || "Anonymous"}</div>
                        <div className="submission-time">{relativeTime(f.created_at)}</div>
                      </div>
                      {f.message && <div className="submission-msg">"{f.message}"</div>}
                      <div className="submission-tags">
                        {f.source && <span className="submission-tag source">{f.source}</span>}
                        {!f.source && f.referrer && <span className="submission-tag source">{classifySource(f.referrer)}</span>}
                        {f.page_path && <span className="submission-tag">Landed on {f.page_path}</span>}
                      </div>
                    </div>
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

function initials(s: string): string {
  const parts = s.trim().split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
function relativeTime(iso: string): string {
  const d = new Date(iso); const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
