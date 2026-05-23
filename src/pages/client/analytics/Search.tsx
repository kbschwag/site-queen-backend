import { useState } from "react";
import { useClientPlan } from "@/hooks/useClientPlan";
import { AnalyticsHeader, InfoIcon, Period, UpgradeLock, EmptyState } from "@/components/analytics/shared";
import "@/styles/analytics.css";

export default function AnalyticsSearch() {
  const { isPremium, isLoading } = useClientPlan();
  const [period, setPeriod] = useState<Period>("30");

  if (isLoading) return <div className="analytics-root"><EmptyState>Loading…</EmptyState></div>;

  return (
    <div className="analytics-root">
      <AnalyticsHeader title="Search Performance" subtitle="How people find your site on Google" period={period} onPeriodChange={setPeriod} />
      {!isPremium ? (
        <UpgradeLock title="Search Performance is a Premium feature" blurb="See impressions, clicks, average ranking position, and the exact search terms bringing people to your site." />
      ) : (
        <>
          <div className="gsc-banner">
            <div className="gsc-text">
              <strong>Connect Google Search Console</strong> to see real impressions, clicks, position, and keyword data for your site. Your operator will set this up when your domain is verified.
            </div>
            <button type="button" disabled title="Coming soon — managed setup">Connect</button>
          </div>

          <div className="stat-grid">
            {[
              ["Impressions", "How many times your site appeared in Google search results. Doesn't mean people clicked — just that they saw your link."],
              ["Clicks", "How many times someone clicked your link from Google search results to visit your site."],
              ["Avg. Position", "Where your site ranks in Google search results, on average. Position 1 is the top result. Lower is better."],
              ["Click-through Rate", "Of people who saw your site in Google results, what percentage clicked. Higher CTR means your title and description are doing their job."],
            ].map(([title, body]) => (
              <div key={title} className="stat-card">
                <div className="stat-label">{title} <InfoIcon title={title} body={body} /></div>
                <div className="stat-value" style={{ color: "var(--sq-muted)" }}>—</div>
                <div className="stat-delta" style={{ color: "var(--sq-muted)" }}>Connect Search Console to see data</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title">
              Top Search Keywords
              <InfoIcon title="Top Search Keywords" body="The actual words people typed into Google before clicking on your site. These show you what your customers are actively looking for." />
            </div>
            <EmptyState>Keyword data will appear here once Google Search Console is connected to your site.</EmptyState>
          </div>

          <div className="card">
            <div className="card-title">
              Top Pages in Search
              <InfoIcon title="Top Pages in Search" body="Which of your pages people are landing on from Google. The pages getting the most search traffic." />
            </div>
            <EmptyState>Search landing-page data will appear here once Google Search Console is connected.</EmptyState>
          </div>
        </>
      )}
    </div>
  );
}
