import type { IntakeData } from "@/components/intake/types";

/** Industry → Unsplash search term mapping. Used for both Claude prompts and any client-side fallback rendering. */
export const INDUSTRY_PHOTO_TERMS: Record<string, string[]> = {
  trades_contractors: ["plumber", "electrician", "contractor", "tools", "construction"],
  wellness_beauty: ["salon", "spa", "beauty", "hair", "wellness"],
  professional_services: ["office", "business", "professional", "consulting", "meeting"],
  food_hospitality: ["restaurant", "food", "cafe", "cooking", "dining"],
  retail_products: ["retail", "products", "shopping", "store", "merchandise"],
  creative_photography: ["photography", "creative", "studio", "camera", "art"],
  health_fitness: ["fitness", "gym", "workout", "health", "exercise"],
  education_coaching: ["coaching", "education", "teaching", "learning", "mentoring"],
  other: ["business", "professional", "office", "work", "service"],
};

/** Counts every photo uploaded across the intake form. */
export function countIntakePhotos(data: IntakeData): number {
  let n = 0;
  if (data.hero_photo_url) n += 1;
  if (data.owner_photo_url) n += 1;
  n += (data.portfolio_photos || []).length;
  n += (data.team_photos || []).length;
  n += (data.location_photos || []).length;
  n += (data.extra_photos || []).length;
  n += (data.award_logos || []).length;
  // service photos
  for (const s of data.services || []) if (s.photo_url) n += 1;
  // team-member photos
  for (const m of data.team_members || []) if (m.photo_url) n += 1;
  // testimonial photos
  for (const t of data.testimonials || []) if (t.photo_url) n += 1;
  // custom-page photos
  for (const p of data.custom_pages || []) n += (p.photos || []).length;
  return n;
}
