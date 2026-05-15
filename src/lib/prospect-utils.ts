export const ACTIVE_PROSPECT_STAGES = [
  "prospect",
  "pitched",
  "viewed_demo",
  "call_booked",
  "replied",
] as const;

export const ALL_PROSPECT_STAGES = [
  "prospect",
  "pitched",
  "viewed_demo",
  "call_booked",
  "replied",
  "cold",
  "converted",
] as const;

export type ProspectStage = (typeof ALL_PROSPECT_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  pitched: "Pitched",
  viewed_demo: "Viewed Demo",
  call_booked: "Call Booked",
  replied: "Replied",
  cold: "Cold",
  converted: "Converted",
  active_client: "Active Client",
};

export const STAGE_COLORS: Record<string, string> = {
  prospect: "bg-slate-100 text-slate-700 border-slate-200",
  pitched: "bg-blue-100 text-blue-700 border-blue-200",
  viewed_demo: "bg-amber-100 text-amber-700 border-amber-200",
  call_booked: "bg-purple-100 text-purple-700 border-purple-200",
  replied: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cold: "bg-gray-100 text-gray-500 border-gray-200",
  converted: "bg-primary/15 text-primary border-primary/30",
};

export const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  dm: "DM",
  call: "Call",
  in_person: "In Person",
  other: "Other",
};

export function downloadCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
