import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rangeForPeriod, Period } from "@/components/analytics/shared";

// Fetches raw events for the current client + period. We do most aggregation
// client-side rather than rely on the daily summary, because summary lacks
// per-page / per-source / per-event-name granularity needed by the mockup.
export function useAnalyticsEvents(clientId: string | null, period: Period, enabled = true) {
  const { start, end, prevStart } = rangeForPeriod(period);
  return useQuery({
    queryKey: ["analytics-events", clientId, period],
    enabled: !!clientId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analytics_events")
        .select("id, event_type, event_name, page_path, page_title, referrer, device_type, country, visitor_id, session_id_fk, created_at, click_x_pct, click_y_pct, scroll_milestone, last_scroll_milestone, seconds_on_page, element, metadata")
        .eq("client_id", clientId!)
        .eq("is_bot", false)
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return { rows: data || [], start, end, prevStart };
    },
    staleTime: 60_000,
  });
}

export function useFormSubmissions(clientId: string | null, period: Period, enabled = true) {
  const { prevStart, end } = rangeForPeriod(period);
  return useQuery({
    queryKey: ["analytics-forms", clientId, period],
    enabled: !!clientId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("id, name, email, phone, message, source, referrer, page_path, created_at, fields")
        .eq("client_id", clientId!)
        .or("is_spam.is.null,is_spam.eq.false")
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });
}

export function classifySource(referrer: string | null | undefined): string {
  if (!referrer) return "Direct";
  const r = referrer.toLowerCase();
  if (r.includes("google.")) return "Google";
  if (r.includes("bing.")) return "Bing";
  if (r.includes("duckduckgo.")) return "DuckDuckGo";
  if (r.includes("facebook.") || r.includes("fb.")) return "Facebook";
  if (r.includes("instagram.")) return "Instagram";
  if (r.includes("linkedin.")) return "LinkedIn";
  if (r.includes("twitter.") || r.includes("t.co") || r.includes("x.com")) return "Twitter/X";
  if (r.includes("youtube.")) return "YouTube";
  if (r.includes("yelp.")) return "Yelp";
  return "Referral";
}

export const SOURCE_COLORS: Record<string, string> = {
  Google: "#7C5BC9",
  Direct: "#A57EE1",
  Facebook: "#C9A961",
  Instagram: "#D5CCDC",
  Bing: "#4A9B6F",
  Yelp: "#C9913D",
  Referral: "#D5CCDC",
};

export function getSourceColor(s: string): string {
  return SOURCE_COLORS[s] || "#A57EE1";
}

export function pageNameFromPath(path: string): string {
  if (!path || path === "/" || path === "") return "Home";
  const seg = path.replace(/\/$/, "").split("/").filter(Boolean).pop() || "Home";
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
}
