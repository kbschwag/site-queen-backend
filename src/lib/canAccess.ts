// Centralized feature-gate matrix. Pure function — easy to unit-test and
// easy to extend when new paid tiers (agency/enterprise) ship.

export type PremiumFeature =
  | "conversions"
  | "search"
  | "behavior"
  | "journey"
  | "ai_insight"
  | "benchmarks"
  | "trend_compare"
  | "csv_export";

const FREE_TIERS = new Set<string>(["", "starter", "free", "growth"]);

export function isPremiumPlan(plan: string | null | undefined): boolean {
  if (plan === null || plan === undefined) return false;
  return !FREE_TIERS.has(plan);
}

export function canAccess(feature: PremiumFeature, plan: string | null | undefined): boolean {
  // All Premium features currently gate on the same tier check. Kept as a
  // switch so a future tier (e.g. 'agency') can grant a subset.
  switch (feature) {
    case "conversions":
    case "search":
    case "behavior":
    case "journey":
    case "ai_insight":
    case "benchmarks":
    case "trend_compare":
    case "csv_export":
      return isPremiumPlan(plan);
  }
}
