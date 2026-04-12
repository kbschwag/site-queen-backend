export interface ApplicationFormData {
  // Step 1
  business_type: string;
  business_name: string;
  industry: string;
  city: string;
  state_province: string;
  country: string;
  has_website: string;
  // Step 2
  years_in_business: string;
  monthly_clients: string;
  decision_maker_status: string;
  restricted_niches: string[];
  update_frequency: string;
  // Step 3
  website_goal: string;
  brand_vibe: string;
  has_logo: string;
  logo_file: File | null;
  inspiration_files: File[];
  // Step 4
  plan_interest: string;
  accepts_commitment: string;
  name: string;
  email: string;
  phone: string;
  additional_notes: string;
}

export const initialFormData: ApplicationFormData = {
  business_type: "",
  business_name: "",
  industry: "",
  city: "",
  state_province: "",
  country: "",
  has_website: "",
  years_in_business: "",
  monthly_clients: "",
  decision_maker_status: "",
  restricted_niches: [],
  update_frequency: "",
  website_goal: "",
  brand_vibe: "",
  has_logo: "",
  logo_file: null,
  inspiration_files: [],
  plan_interest: "",
  accepts_commitment: "",
  name: "",
  email: "",
  phone: "",
  additional_notes: "",
};

export const BUSINESS_TYPES = [
  { value: "service", label: "Service based business", desc: "plumber, salon, consultant, coach, photographer, etc." },
  { value: "product", label: "Product based business", desc: "I sell physical or digital products" },
  { value: "ecommerce", label: "Ecommerce store", desc: "I need a full online shop with cart and checkout" },
  { value: "student", label: "I'm a student or just starting out", desc: "" },
  { value: "other", label: "Other", desc: "" },
];

export const INDUSTRIES = [
  "Trades and contractors",
  "Wellness and beauty",
  "Professional services",
  "Food and hospitality",
  "Retail and products",
  "Creative and photography",
  "Health and fitness",
  "Education and coaching",
  "Other service business",
];

export const WEBSITE_STATUS = [
  { value: "none", label: "No website at all" },
  { value: "social_only", label: "I have a social media page only" },
  { value: "outdated", label: "Yes, but it looks outdated or unprofessional" },
  { value: "happy", label: "Yes, and I'm happy with it" },
];

export const YEARS_OPTIONS = [
  { value: "under_6_months", label: "Just getting started (under 6 months)" },
  { value: "less_than_1", label: "Less than 1 year" },
  { value: "1_to_3", label: "1 to 3 years" },
  { value: "3_plus", label: "3 years or more" },
];

export const MONTHLY_CLIENTS = [
  { value: "1_to_5", label: "1 to 5" },
  { value: "6_to_20", label: "6 to 20" },
  { value: "21_to_50", label: "21 to 50" },
  { value: "50_plus", label: "More than 50" },
];

export const DECISION_MAKER = [
  { value: "yes", label: "Yes, that's me" },
  { value: "check_first", label: "I need to check with someone else first" },
  { value: "shared", label: "This is a shared decision" },
];

export const RESTRICTED_NICHES = [
  "CBD or cannabis products",
  "Adult content or services",
  "Firearms or weapons",
  "Cryptocurrency or NFTs",
  "Multi level marketing or network marketing",
  "None of the above",
];

export const UPDATE_FREQUENCY = [
  { value: "rarely", label: "Rarely — maybe a few times a year" },
  { value: "occasionally", label: "Occasionally — once or twice a month" },
  { value: "frequently", label: "Frequently — I expect weekly changes" },
  { value: "not_sure", label: "I'm not sure yet" },
];

export const WEBSITE_GOALS = [
  { value: "leads", label: "Get more leads and phone calls" },
  { value: "professional", label: "Look more professional and credible" },
  { value: "replace", label: "Replace my outdated website" },
  { value: "establish", label: "Establish my online presence for the first time" },
  { value: "all", label: "All of the above" },
];

export const BRAND_VIBES = [
  { value: "clean_minimal", label: "Clean & Minimal", desc: "Simple, modern, lots of white space", color: "from-slate-100 to-slate-200", icon: "✨" },
  { value: "bold_modern", label: "Bold & Modern", desc: "Strong colors, confident, eye-catching", color: "from-purple-500 to-pink-500", icon: "⚡" },
  { value: "warm_friendly", label: "Warm & Friendly", desc: "Soft tones, approachable, personal", color: "from-amber-200 to-orange-300", icon: "🌸" },
  { value: "professional_corporate", label: "Professional & Corporate", desc: "Traditional, trustworthy, formal", color: "from-blue-800 to-slate-700", icon: "🏛️" },
];

export const LOGO_OPTIONS = [
  { value: "yes", label: "Yes, I have a logo ready" },
  { value: "want_one", label: "No, but I want one designed" },
  { value: "no", label: "No, and I don't need one right now" },
];

export const PLAN_OPTIONS = [
  { value: "starter", label: "Starter", price: "$79/month", features: ["Free website build", "Custom domain", "Hosting & SSL", "Standard support"] },
  { value: "growth", label: "Growth", price: "$129/month", popular: true, features: ["Everything in Starter", "1 content update/month", "Weekly backups", "Priority support"] },
  { value: "pro", label: "Pro", price: "$199/month", features: ["Everything in Growth", "3 content updates/month", "Logo design included", "Dedicated account manager"] },
  { value: "not_sure", label: "Not sure yet", price: "Help me decide", features: ["We'll discuss on the call"] },
];

export const COMMITMENT_OPTIONS = [
  { value: "yes", label: "That sounds completely fair — I'm in" },
  { value: "questions", label: "I have a few questions first" },
  { value: "too_long", label: "That's too long of a commitment for me right now" },
];

export function calculateScore(form: ApplicationFormData): { score: number; temperature: string } {
  let score = 0;

  // Business type (Q1)
  if (form.business_type === "service") score += 3;
  else if (form.business_type === "product") score += 2;
  else score += 1;

  // Website status (Q5)
  if (form.has_website === "none" || form.has_website === "social_only") score += 3;
  else if (form.has_website === "outdated") score += 2;

  // Years in business (Q6)
  if (form.years_in_business === "3_plus") score += 3;
  else if (form.years_in_business === "1_to_3") score += 2;
  else score += 1;

  // Monthly clients (Q7)
  if (form.monthly_clients === "21_to_50" || form.monthly_clients === "50_plus") score += 3;
  else if (form.monthly_clients === "6_to_20") score += 2;
  else score += 1;

  // Decision maker (Q8)
  if (form.decision_maker_status === "yes") score += 3;
  else if (form.decision_maker_status === "shared") score += 2;
  else score += 1;

  // Update frequency (Q10)
  if (form.update_frequency === "rarely" || form.update_frequency === "occasionally") score += 3;
  else score += 2;

  // Plan interest (Q16)
  if (form.plan_interest === "pro") score += 3;
  else if (form.plan_interest === "growth") score += 2;
  else score += 1;

  // Commitment (Q17)
  if (form.accepts_commitment === "yes") score += 3;
  else if (form.accepts_commitment === "questions") score += 2;

  const temperature = score >= 18 ? "HOT" : score >= 12 ? "WARM" : "COLD";
  return { score, temperature };
}

export function checkInstantDecline(form: ApplicationFormData): string | null {
  if (form.business_type === "ecommerce") {
    return "ecommerce";
  }
  return null;
}

export function checkFlags(form: ApplicationFormData): string[] {
  const flags: string[] = [];
  if (form.restricted_niches.length > 0 && !form.restricted_niches.includes("None of the above")) {
    flags.push("sensitive_niche");
  }
  const text = (form.additional_notes + " " + form.business_name).toLowerCase();
  if (text.includes("web design") || text.includes("agency") || text.includes("white label") || text.includes("my clients") || text.includes("for clients")) {
    flags.push("potential_white_label");
  }
  return flags;
}
