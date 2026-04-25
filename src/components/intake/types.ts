export interface IntakeData {
  // Step 1 — Business Basics
  business_name?: string;
  tagline?: string;
  primary_phone?: string;
  secondary_phone?: string;
  business_email?: string;
  street_address?: string;
  city?: string;
  state_province?: string;
  zip_code?: string;
  country?: string;
  location_type?: "physical" | "mobile" | "both" | "online";
  business_hours?: Record<string, { open: string; close: string; closed: boolean }>;
  appointment_only?: boolean;
  social_links?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    linkedin?: string;
    youtube?: string;
    pinterest?: string;
    yelp?: string;
    other?: string;
  };

  // Step 2 — Your Brand
  logo_url?: string;
  logo_dark_url?: string;
  logo_white_url?: string;
  favicon_url?: string;
  no_logo?: boolean;
  logo_addon_requested?: boolean;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  help_choose_colors?: boolean;
  color_palette?: string;
  heading_font?: string;
  body_font?: string;
  // Typography preference
  font_choice_mode?: "auto" | "list" | "upload";
  preferred_font?: string;
  custom_font_url?: string;
  custom_font_name?: string;

  // Step 3 — Your Story
  story_started?: string;
  story_different?: string;
  story_ideal_customer?: string;
  story_problem?: string;
  about_section_generated?: string;
  owner_name?: string;
  owner_title?: string;
  owner_bio_raw?: string;
  owner_bio_generated?: string;
  owner_photo_url?: string;
  team_members?: { name: string; title: string; bio: string; photo_url?: string }[];

  // Step 4 — Your Services
  services?: {
    name: string;
    description: string;
    price_type?: "exact" | "range" | "starting" | "call" | "free";
    price_value?: string;
    photo_url?: string;
    description_generated?: string;
  }[];
  services_intro_generated?: string;

  // Step 5 — Your Photos
  hero_photo_url?: string;
  hero_use_stock?: boolean;
  portfolio_photos?: string[];
  team_photos?: string[];
  location_photos?: string[];
  extra_photos?: string[];
  use_stock_photos?: boolean;
  photo_rights_confirmed?: boolean;

  // Step 6 — Social Proof
  google_business_url?: string;
  testimonials?: {
    name: string;
    title?: string;
    text: string;
    photo_url?: string;
  }[];
  no_testimonials?: boolean;
  awards_text?: string;
  award_logos?: string[];

  // Step 7 — Your Pages
  custom_pages?: { name: string; description: string; photos?: string[]; content_generated?: string }[];
  special_features?: string[];
  blog_addon_requested?: boolean;
  booking_addon_requested?: boolean;

  // Step 8 — Website Style
  template_selected?: string;
  style_notes?: string;
  template_help_request?: string;

  // Step 9 — Final Details
  final_features?: string[];
  final_checklist?: string[];
  final_notes?: string;

  // Meta
  current_step?: number;
  completed_steps?: number[];
}

export const INTAKE_STEPS = [
  "Business Basics",
  "Your Brand",
  "Your Story",
  "Your Services",
  "Your Photos",
  "Social Proof",
  "Your Pages",
  "Website Style",
  "Final Details",
] as const;

export const TOTAL_STEPS = INTAKE_STEPS.length;
