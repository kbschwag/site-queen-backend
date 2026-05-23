import { ReactNode } from "react";
import { Link } from "react-router-dom";

export type Period = "today" | "7" | "30" | "custom";

export function InfoIcon({ title, body, benchmark, upsell }: { title: string; body: string; benchmark?: string; upsell?: string }) {
  return (
    <span className="info-icon">i
      <div className="tooltip">
        <div className="tooltip-title">{title}</div>
        <div className="tooltip-body">{body}</div>
        {benchmark && <div className="tooltip-benchmark">{benchmark}</div>}
        {upsell && <div className="tooltip-benchmark" style={{ color: "var(--sq-gold)" }}>★ {upsell}</div>}
      </div>
    </span>
  );
}

export function PeriodSelector({ value, onChange, includeCustom = true }: { value: Period; onChange: (p: Period) => void; includeCustom?: boolean }) {
  const opts: { v: Period; label: string; disabled?: boolean }[] = [
    { v: "today", label: "Today" },
    { v: "7", label: "7 days" },
    { v: "30", label: "30 days" },
  ];
  if (includeCustom) opts.push({ v: "custom", label: "Custom", disabled: true });
  return (
    <div className="time-selector">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`time-option ${value === o.v ? "active" : ""} ${o.disabled ? "disabled" : ""}`}
          onClick={() => !o.disabled && onChange(o.v)}
          title={o.disabled ? "Custom ranges coming soon" : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsHeader({ title, subtitle, period, onPeriodChange }: { title: string; subtitle: string; period: Period; onPeriodChange: (p: Period) => void }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        <div className="page-subtitle">{subtitle}</div>
      </div>
      <PeriodSelector value={period} onChange={onPeriodChange} />
    </div>
  );
}

export function rangeForPeriod(period: Period): { start: Date; end: Date; prevStart: Date; prevEnd: Date; label: string } {
  const end = new Date();
  const start = new Date();
  let days = 7;
  if (period === "today") days = 1;
  else if (period === "30") days = 30;
  else if (period === "7" || period === "custom") days = 7;
  start.setDate(end.getDate() - days);
  const prevEnd = new Date(start);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);
  const label = period === "today" ? "today" : period === "30" ? "last 30d" : "last 7d";
  return { start, end, prevStart, prevEnd, label };
}

export function UpgradeLock({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="upgrade-prompt">
      <h3>{title}</h3>
      <p>{blurb}</p>
      <Link to="/dashboard/billing" className="upgrade-cta">Upgrade to Premium</Link>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function trendDelta(curr: number, prev: number): { pct: number; up: boolean; same: boolean } {
  if (prev === 0 && curr === 0) return { pct: 0, up: true, same: true };
  if (prev === 0) return { pct: 100, up: true, same: false };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: pct >= 0, same: pct === 0 };
}

export function StatDelta({ curr, prev, label, suffix = "" }: { curr: number; prev: number; label: string; suffix?: string }) {
  const { pct, up, same } = trendDelta(curr, prev);
  if (same && curr === 0) return <div className="stat-delta" style={{ color: "var(--sq-muted)" }}>— no data yet</div>;
  return (
    <div className={`stat-delta ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {pct}%{suffix} <span className="stat-delta-period">vs {label}</span>
    </div>
  );
}
