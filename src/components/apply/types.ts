export interface ApplicationFormData {
  // Step 1 — Your Business
  business_type: string;
  business_name: string;
  industry: string;
  city: string;
  state_province: string;
  country: string;
  business_instagram: string;
  business_facebook: string;

  // Step 2 — Your Customers
  ideal_customer: string;
  google_search_terms: string;

  // Step 3 — Your Vision
  website_goal: string[];
  has_domain: string; // yes | no
  current_domain: string;
  has_logo: string; // yes | want_addon | no
  support_level: string; // basic | standard | full_service | not_sure
  restricted_niches: string[];
  readiness: string; // ready_now | within_30_days | few_months | exploring
  anything_else: string;

  // Step 4 — Let's Connect
  name: string;
  email: string;
  phone: string;
  referral_source: string;
}

export const initialFormData: ApplicationFormData = {
  business_type: "",
  business_name: "",
  industry: "",
  city: "",
  state_province: "",
  country: "United States",
  business_instagram: "",
  business_facebook: "",
  ideal_customer: "",
  google_search_terms: "",
  website_goal: [],
  has_domain: "",
  current_domain: "",
  has_logo: "",
  support_level: "",
  restricted_niches: ["None of the above"],
  readiness: "",
  anything_else: "",
  name: "",
  email: "",
  phone: "",
  referral_source: "",
};

export const STEP_LABELS = [
  "Your business",
  "Your customers",
  "Your vision",
  "Let's connect",
] as const;

export const BUSINESS_TYPES = [
  { value: "service", label: "I provide a service", desc: "plumber, salon, coach, contractor, photographer, etc." },
  { value: "products_offline", label: "I sell products but take orders by phone or in person", desc: "" },
  { value: "online_shop", label: "I need a full online shop where customers can buy and checkout", desc: "" },
  { value: "brand_new", label: "I'm brand new — just getting started", desc: "" },
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

export const WEBSITE_GOALS = [
  { value: "get_more_leads", label: "Get more leads and phone calls" },
  { value: "look_professional", label: "Look more professional and credible" },
  { value: "replace_outdated", label: "Replace my outdated website" },
  { value: "establish_presence", label: "Establish my online presence for the first time" },
  { value: "all_of_above", label: "All of the above" },
];

export const LOGO_OPTIONS = [
  { value: "yes", label: "Yes I have one ready" },
  { value: "want_addon", label: "No — I'd like to add a professional logo design for $75 ♛" },
  { value: "no", label: "No and I'll sort it out myself" },
];

export const SUPPORT_LEVELS = [
  { value: "basic", label: "Basic — I just need a great website live and maintained" },
  { value: "standard", label: "Standard — I want a website plus some help making updates each month" },
  { value: "full_service", label: "Full service — I want a website, regular updates, and dedicated support" },
  { value: "not_sure", label: "Not sure yet — I'd love guidance on our call" },
];

export const RESTRICTED_NICHES = [
  "CBD or cannabis products",
  "Adult content or services",
  "Firearms or weapons",
  "Cryptocurrency or NFTs",
  "Multi level marketing or network marketing",
  "None of the above",
];

export const READINESS_OPTIONS = [
  { value: "ready_now", label: "I'm ready now — within the next 2 weeks" },
  { value: "within_30_days", label: "Soon — within the next 30 days" },
  { value: "few_months", label: "In the next few months" },
  { value: "exploring", label: "Just exploring for now" },
];

export const REFERRAL_SOURCES = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Facebook group",
  "Google search",
  "Friend or family referral",
  "Another business owner recommended you",
  "YouTube",
  "Other",
];

// Map support_level to internal plan name
export function mapSupportToPlan(supportLevel: string): string {
  if (supportLevel === "basic") return "starter";
  if (supportLevel === "standard") return "growth";
  if (supportLevel === "full_service") return "pro";
  return "not_sure";
}

// Basic profanity / aggressive language detection
const PROFANITY_LIST = [
  "fuck", "shit", "bitch", "asshole", "dick", "pussy", "cunt", "fag", "nigger", "retard",
  "scam", "garbage", "trash", "stupid idiot", "morons",
];

const AGGRESSIVE_PHRASES = [
  "i hate", "you suck", "rip off", "ripoff", "screw you", "shut up",
];

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const word of PROFANITY_LIST) {
    // word-boundary-ish check
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) return true;
  }
  for (const phrase of AGGRESSIVE_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

export function checkInstantDecline(form: ApplicationFormData): string | null {
  if (form.business_type === "online_shop") return "online_shop";

  const combined = [form.ideal_customer, form.google_search_terms, form.anything_else, form.business_name].join(" ");
  if (containsProfanity(combined)) return "inappropriate_content";

  return null;
}

export function checkFlags(form: ApplicationFormData): string[] {
  const flags: string[] = [];
  const niches = form.restricted_niches.filter((n) => n !== "None of the above");
  if (niches.length > 0) flags.push("sensitive_niche");
  return flags;
}

export function calculateScore(form: ApplicationFormData): { score: number; temperature: string } {
  let score = 0;

  // Business type
  if (["service", "products_offline"].includes(form.business_type)) score += 3;
  else if (form.business_type === "brand_new") score += 1;

  // Website goal
  const goals = Array.isArray(form.website_goal) ? form.website_goal : [];
  if (goals.includes("get_more_leads") || goals.includes("all_of_above")) score += 3;
  else if (goals.includes("look_professional")) score += 2;
  else if (goals.length > 0) score += 1;

  // Support level
  if (form.support_level === "full_service") score += 3;
  else if (form.support_level === "standard") score += 2;
  else score += 1;

  // Readiness
  if (form.readiness === "ready_now") score += 3;
  else if (form.readiness === "within_30_days") score += 2;
  else if (form.readiness === "few_months") score += 1;

  // Anything else (effort signal)
  if (form.anything_else && form.anything_else.length > 50) score += 2;

  // Social provided
  if (form.business_instagram || form.business_facebook) score += 1;

  // Thresholds
  const temperature = score >= 10 ? "HOT" : score >= 6 ? "WARM" : "COLD";
  return { score, temperature };
}
