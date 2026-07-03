/**
 * TEMPLATE REGISTRY
 * 
 * Defines the structure, sections, and text/image slots for each Figma template.
 * The AI never touches HTML — it fills these slots, and the engine does the rest.
 * 
 * Each template has:
 * - sections: ordered list of content blocks that can be included/removed
 * - slots: text fields the AI must fill, with character limits
 * - imageSlots: image positions that need URLs
 */

export interface TemplateSlot {
  id: string;
  description: string;
  maxChars: number;
  style: "uppercase" | "sentence" | "title" | "lowercase";
  required: boolean;
  fallback: string; // Used if AI fails or field is empty
}

export interface TemplateImageSlot {
  id: string;
  description: string;
  suggestedSearch: string; // Default Unsplash search term
  required: boolean;
}

export interface TemplateSection {
  id: string;
  type: "navigation" | "hero" | "about" | "services" | "testimonials" | "portfolio" | "cta" | "contact" | "stats" | "team" | "faq" | "footer" | "trust-badges";
  label: string;
  removable: boolean;
  requiresData?: string[]; // What data must exist to keep this section (e.g., ["reviews"] for testimonials)
  slots: string[]; // IDs of text slots in this section
  imageSlots: string[]; // IDs of image slots in this section
}

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  bestFor: string[]; // Business types this template works best for
  sections: TemplateSection[];
  slots: Record<string, TemplateSlot>;
  imageSlots: Record<string, TemplateImageSlot>;
}

// ═══════════════════════════════════════════════════════════════════════
// TRADES TEMPLATE (Plumbers, Electricians, HVAC, Contractors)
// ═══════════════════════════════════════════════════════════════════════
const tradesTemplate: TemplateConfig = {
  id: "trades",
  name: "Trades & Home Services",
  description: "Bold, trust-focused layout for trade professionals",
  bestFor: ["plumber", "electrician", "hvac", "contractor", "roofer", "landscaper", "painter", "handyman", "pest control", "pool service"],
  sections: [
    {
      id: "trust-badges",
      type: "trust-badges",
      label: "Trust Badges Bar",
      removable: true,
      requiresData: ["rating"],
      slots: ["trust_rating", "trust_review_count", "trust_tagline"],
      imageSlots: []
    },
    {
      id: "navigation",
      type: "navigation",
      label: "Header Navigation",
      removable: false,
      slots: ["business_name", "phone"],
      imageSlots: ["logo"]
    },
    {
      id: "hero",
      type: "hero",
      label: "Hero Section",
      removable: false,
      slots: ["hero_headline", "hero_subheading", "hero_cta_text", "phone"],
      imageSlots: ["hero_bg"]
    },
    {
      id: "services-intro",
      type: "services",
      label: "Services Introduction",
      removable: false,
      slots: ["services_eyebrow", "services_headline"],
      imageSlots: []
    },
    {
      id: "social-proof",
      type: "testimonials",
      label: "Social Proof Strip",
      removable: true,
      requiresData: ["reviews"],
      slots: ["review_1_text", "review_1_author", "review_2_text", "review_2_author"],
      imageSlots: []
    },
    {
      id: "about",
      type: "about",
      label: "About Section",
      removable: false,
      slots: ["about_headline", "about_story", "about_years", "about_badge"],
      imageSlots: ["about_photo"]
    },
    {
      id: "why-us",
      type: "stats",
      label: "Why Choose Us",
      removable: true,
      slots: ["why_us_headline", "stat_1_number", "stat_1_label", "stat_2_number", "stat_2_label", "stat_3_number", "stat_3_label"],
      imageSlots: []
    },
    {
      id: "services-detail",
      type: "services",
      label: "Services Detail Grid",
      removable: false,
      slots: ["service_1_name", "service_1_desc", "service_2_name", "service_2_desc", "service_3_name", "service_3_desc", "service_4_name", "service_4_desc", "service_5_name", "service_5_desc", "service_6_name", "service_6_desc"],
      imageSlots: ["service_1_img", "service_2_img", "service_3_img", "service_4_img", "service_5_img", "service_6_img"]
    },
    {
      id: "portfolio",
      type: "portfolio",
      label: "Work Gallery",
      removable: true,
      requiresData: ["photos"],
      slots: ["portfolio_headline"],
      imageSlots: ["portfolio_1", "portfolio_2", "portfolio_3", "portfolio_4", "portfolio_5"]
    },
    {
      id: "service-areas",
      type: "about",
      label: "Service Areas",
      removable: true,
      requiresData: ["service_area"],
      slots: ["areas_headline", "areas_description", "areas_list"],
      imageSlots: []
    },
    {
      id: "testimonials",
      type: "testimonials",
      label: "Full Testimonials",
      removable: true,
      requiresData: ["reviews"],
      slots: ["testimonial_1_quote", "testimonial_1_author", "testimonial_2_quote", "testimonial_2_author", "testimonial_3_quote", "testimonial_3_author"],
      imageSlots: []
    },
    {
      id: "cta",
      type: "cta",
      label: "Call to Action",
      removable: false,
      slots: ["cta_headline", "cta_subtext", "cta_button_text", "phone"],
      imageSlots: []
    },
    {
      id: "footer",
      type: "footer",
      label: "Footer",
      removable: false,
      slots: ["business_name", "footer_tagline", "phone", "address", "city_state"],
      imageSlots: ["logo"]
    }
  ],
  slots: {
    business_name: { id: "business_name", description: "Business name", maxChars: 30, style: "uppercase", required: true, fallback: "BUSINESS NAME" },
    phone: { id: "phone", description: "Phone number", maxChars: 14, style: "sentence", required: true, fallback: "(555) 000-0000" },
    address: { id: "address", description: "Street address", maxChars: 50, style: "sentence", required: false, fallback: "" },
    city_state: { id: "city_state", description: "City, State", maxChars: 30, style: "sentence", required: true, fallback: "Your City, ST" },
    trust_rating: { id: "trust_rating", description: "Google rating (e.g., 4.9)", maxChars: 3, style: "sentence", required: false, fallback: "5.0" },
    trust_review_count: { id: "trust_review_count", description: "Number of reviews", maxChars: 10, style: "sentence", required: false, fallback: "" },
    trust_tagline: { id: "trust_tagline", description: "Short trust phrase", maxChars: 40, style: "sentence", required: false, fallback: "" },
    hero_headline: { id: "hero_headline", description: "Main hero headline - bold, short, impactful", maxChars: 50, style: "uppercase", required: true, fallback: "TRUSTED LOCAL PROS" },
    hero_subheading: { id: "hero_subheading", description: "Supporting text under headline", maxChars: 120, style: "sentence", required: true, fallback: "Professional service you can count on." },
    hero_cta_text: { id: "hero_cta_text", description: "CTA button text", maxChars: 20, style: "uppercase", required: true, fallback: "GET A FREE QUOTE" },
    services_eyebrow: { id: "services_eyebrow", description: "Small text above services headline", maxChars: 25, style: "uppercase", required: false, fallback: "WHAT WE DO" },
    services_headline: { id: "services_headline", description: "Services section headline", maxChars: 40, style: "sentence", required: true, fallback: "Our Services" },
    service_1_name: { id: "service_1_name", description: "Service 1 name", maxChars: 30, style: "title", required: true, fallback: "Service One" },
    service_1_desc: { id: "service_1_desc", description: "Service 1 description", maxChars: 150, style: "sentence", required: true, fallback: "Professional service tailored to your needs." },
    service_2_name: { id: "service_2_name", description: "Service 2 name", maxChars: 30, style: "title", required: true, fallback: "Service Two" },
    service_2_desc: { id: "service_2_desc", description: "Service 2 description", maxChars: 150, style: "sentence", required: true, fallback: "Expert solutions for your home." },
    service_3_name: { id: "service_3_name", description: "Service 3 name", maxChars: 30, style: "title", required: true, fallback: "Service Three" },
    service_3_desc: { id: "service_3_desc", description: "Service 3 description", maxChars: 150, style: "sentence", required: true, fallback: "Reliable work, guaranteed." },
    service_4_name: { id: "service_4_name", description: "Service 4 name", maxChars: 30, style: "title", required: false, fallback: "" },
    service_4_desc: { id: "service_4_desc", description: "Service 4 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    service_5_name: { id: "service_5_name", description: "Service 5 name", maxChars: 30, style: "title", required: false, fallback: "" },
    service_5_desc: { id: "service_5_desc", description: "Service 5 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    service_6_name: { id: "service_6_name", description: "Service 6 name", maxChars: 30, style: "title", required: false, fallback: "" },
    service_6_desc: { id: "service_6_desc", description: "Service 6 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    about_headline: { id: "about_headline", description: "About section headline", maxChars: 50, style: "sentence", required: true, fallback: "About Us" },
    about_story: { id: "about_story", description: "About paragraph - company story", maxChars: 400, style: "sentence", required: true, fallback: "We are a locally owned and operated business dedicated to serving our community with excellence." },
    about_years: { id: "about_years", description: "Years in business or founding year", maxChars: 15, style: "sentence", required: false, fallback: "" },
    about_badge: { id: "about_badge", description: "Badge text (e.g., 'Family Owned')", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    why_us_headline: { id: "why_us_headline", description: "Why choose us headline", maxChars: 40, style: "sentence", required: false, fallback: "Why Choose Us" },
    stat_1_number: { id: "stat_1_number", description: "Stat number (e.g., '500+')", maxChars: 8, style: "sentence", required: false, fallback: "" },
    stat_1_label: { id: "stat_1_label", description: "Stat label (e.g., 'Jobs Completed')", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    stat_2_number: { id: "stat_2_number", description: "Stat number", maxChars: 8, style: "sentence", required: false, fallback: "" },
    stat_2_label: { id: "stat_2_label", description: "Stat label", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    stat_3_number: { id: "stat_3_number", description: "Stat number", maxChars: 8, style: "sentence", required: false, fallback: "" },
    stat_3_label: { id: "stat_3_label", description: "Stat label", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    review_1_text: { id: "review_1_text", description: "Short review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    review_1_author: { id: "review_1_author", description: "Reviewer name", maxChars: 30, style: "title", required: false, fallback: "" },
    review_2_text: { id: "review_2_text", description: "Short review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    review_2_author: { id: "review_2_author", description: "Reviewer name", maxChars: 30, style: "title", required: false, fallback: "" },
    testimonial_1_quote: { id: "testimonial_1_quote", description: "Full testimonial quote", maxChars: 250, style: "sentence", required: false, fallback: "" },
    testimonial_1_author: { id: "testimonial_1_author", description: "Testimonial author", maxChars: 30, style: "title", required: false, fallback: "" },
    testimonial_2_quote: { id: "testimonial_2_quote", description: "Full testimonial quote", maxChars: 250, style: "sentence", required: false, fallback: "" },
    testimonial_2_author: { id: "testimonial_2_author", description: "Testimonial author", maxChars: 30, style: "title", required: false, fallback: "" },
    testimonial_3_quote: { id: "testimonial_3_quote", description: "Full testimonial quote", maxChars: 250, style: "sentence", required: false, fallback: "" },
    testimonial_3_author: { id: "testimonial_3_author", description: "Testimonial author", maxChars: 30, style: "title", required: false, fallback: "" },
    portfolio_headline: { id: "portfolio_headline", description: "Portfolio section headline", maxChars: 30, style: "uppercase", required: false, fallback: "OUR WORK" },
    areas_headline: { id: "areas_headline", description: "Service areas headline", maxChars: 40, style: "sentence", required: false, fallback: "Areas We Serve" },
    areas_description: { id: "areas_description", description: "Service areas description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    areas_list: { id: "areas_list", description: "Comma-separated list of service areas", maxChars: 200, style: "sentence", required: false, fallback: "" },
    cta_headline: { id: "cta_headline", description: "CTA section headline", maxChars: 40, style: "sentence", required: true, fallback: "Ready to Get Started?" },
    cta_subtext: { id: "cta_subtext", description: "CTA supporting text", maxChars: 80, style: "sentence", required: false, fallback: "Call today for a free estimate." },
    cta_button_text: { id: "cta_button_text", description: "CTA button text", maxChars: 20, style: "uppercase", required: true, fallback: "CALL NOW" },
    footer_tagline: { id: "footer_tagline", description: "Short footer tagline", maxChars: 80, style: "sentence", required: false, fallback: "Your trusted local professionals." },
  },
  imageSlots: {
    logo: { id: "logo", description: "Business logo", suggestedSearch: "", required: false },
    hero_bg: { id: "hero_bg", description: "Hero background image", suggestedSearch: "professional tradesperson working", required: true },
    about_photo: { id: "about_photo", description: "About section photo (team or owner)", suggestedSearch: "professional team portrait", required: false },
    service_1_img: { id: "service_1_img", description: "Service 1 image", suggestedSearch: "", required: false },
    service_2_img: { id: "service_2_img", description: "Service 2 image", suggestedSearch: "", required: false },
    service_3_img: { id: "service_3_img", description: "Service 3 image", suggestedSearch: "", required: false },
    service_4_img: { id: "service_4_img", description: "Service 4 image", suggestedSearch: "", required: false },
    service_5_img: { id: "service_5_img", description: "Service 5 image", suggestedSearch: "", required: false },
    service_6_img: { id: "service_6_img", description: "Service 6 image", suggestedSearch: "", required: false },
    portfolio_1: { id: "portfolio_1", description: "Portfolio photo 1", suggestedSearch: "", required: false },
    portfolio_2: { id: "portfolio_2", description: "Portfolio photo 2", suggestedSearch: "", required: false },
    portfolio_3: { id: "portfolio_3", description: "Portfolio photo 3", suggestedSearch: "", required: false },
    portfolio_4: { id: "portfolio_4", description: "Portfolio photo 4", suggestedSearch: "", required: false },
    portfolio_5: { id: "portfolio_5", description: "Portfolio photo 5", suggestedSearch: "", required: false },
  }
};

// ═══════════════════════════════════════════════════════════════════════
// PROFESSIONAL SERVICES TEMPLATE (Lawyers, Accountants, Consultants)
// ═══════════════════════════════════════════════════════════════════════
const professionalServicesTemplate: TemplateConfig = {
  id: "professional-services",
  name: "Professional Services",
  description: "Sophisticated, trust-building layout for professional firms",
  bestFor: ["lawyer", "attorney", "accountant", "consultant", "financial advisor", "insurance", "real estate agent", "architect"],
  sections: [
    {
      id: "trust-badges",
      type: "trust-badges",
      label: "Credentials Bar",
      removable: true,
      requiresData: ["credentials"],
      slots: ["credential_1", "credential_2", "credential_3", "credential_4", "credential_5"],
      imageSlots: []
    },
    {
      id: "navigation",
      type: "navigation",
      label: "Header Navigation",
      removable: false,
      slots: ["business_name", "cta_button_text"],
      imageSlots: []
    },
    {
      id: "about",
      type: "about",
      label: "About / Introduction",
      removable: false,
      slots: ["about_eyebrow", "about_headline", "about_story"],
      imageSlots: ["about_photo"]
    },
    {
      id: "services",
      type: "services",
      label: "Services Grid",
      removable: false,
      slots: ["services_eyebrow", "services_headline", "services_subheading", "service_1_name", "service_1_desc", "service_2_name", "service_2_desc", "service_3_name", "service_3_desc", "service_4_name", "service_4_desc", "service_5_name", "service_5_desc", "service_6_name", "service_6_desc"],
      imageSlots: []
    },
    {
      id: "stats",
      type: "stats",
      label: "Results / Statistics",
      removable: true,
      slots: ["stats_headline", "stat_1_number", "stat_1_label", "stat_2_number", "stat_2_label", "stat_3_number", "stat_3_label"],
      imageSlots: []
    },
    {
      id: "who-we-serve",
      type: "about",
      label: "Who We Serve",
      removable: true,
      slots: ["serve_eyebrow", "serve_headline", "serve_1_name", "serve_1_desc", "serve_2_name", "serve_2_desc", "serve_3_name", "serve_3_desc"],
      imageSlots: []
    },
    {
      id: "differentiators",
      type: "about",
      label: "What Makes Us Different",
      removable: true,
      slots: ["diff_headline", "diff_subheading"],
      imageSlots: []
    },
    {
      id: "brand-statement",
      type: "cta",
      label: "Brand Statement",
      removable: false,
      slots: ["brand_tagline", "brand_established", "brand_description"],
      imageSlots: []
    },
    {
      id: "team",
      type: "team",
      label: "Leadership / Team",
      removable: true,
      requiresData: ["team"],
      slots: ["team_headline", "team_subheading", "team_1_name", "team_1_title", "team_1_bio", "team_2_name", "team_2_title", "team_2_bio"],
      imageSlots: ["team_1_photo", "team_2_photo"]
    },
    {
      id: "testimonials",
      type: "testimonials",
      label: "Client Testimonials",
      removable: true,
      requiresData: ["reviews"],
      slots: ["testimonials_eyebrow", "testimonial_1_quote", "testimonial_1_author", "testimonial_1_title"],
      imageSlots: []
    },
    {
      id: "cta",
      type: "cta",
      label: "Call to Action",
      removable: false,
      slots: ["cta_headline", "cta_button_text"],
      imageSlots: []
    },
    {
      id: "footer",
      type: "footer",
      label: "Footer",
      removable: false,
      slots: ["business_name", "footer_tagline", "phone", "address", "city_state"],
      imageSlots: []
    }
  ],
  slots: {
    business_name: { id: "business_name", description: "Business/firm name", maxChars: 25, style: "uppercase", required: true, fallback: "FIRM NAME" },
    phone: { id: "phone", description: "Phone number", maxChars: 14, style: "sentence", required: true, fallback: "(555) 000-0000" },
    address: { id: "address", description: "Street address", maxChars: 50, style: "sentence", required: false, fallback: "" },
    city_state: { id: "city_state", description: "City, State", maxChars: 30, style: "sentence", required: true, fallback: "Your City, ST" },
    credential_1: { id: "credential_1", description: "Credential/award name", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    credential_2: { id: "credential_2", description: "Credential/award name", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    credential_3: { id: "credential_3", description: "Credential/award name", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    credential_4: { id: "credential_4", description: "Credential/award name", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    credential_5: { id: "credential_5", description: "Credential/award name", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    about_eyebrow: { id: "about_eyebrow", description: "Small text above about headline", maxChars: 15, style: "uppercase", required: true, fallback: "ABOUT US" },
    about_headline: { id: "about_headline", description: "About section headline (2-3 words per line)", maxChars: 50, style: "title", required: true, fallback: "More Than A Firm.\nAn Institution." },
    about_story: { id: "about_story", description: "About paragraph", maxChars: 350, style: "sentence", required: true, fallback: "We provide expert professional services with a commitment to excellence and client satisfaction." },
    about_photo: { id: "about_photo", description: "About section photo", suggestedSearch: "professional office interior", required: false },
    services_eyebrow: { id: "services_eyebrow", description: "Small text above services", maxChars: 15, style: "uppercase", required: true, fallback: "SERVICES" },
    services_headline: { id: "services_headline", description: "Services headline", maxChars: 60, style: "title", required: true, fallback: "Comprehensive Services\nfor Every Need." },
    services_subheading: { id: "services_subheading", description: "Services subheading", maxChars: 120, style: "sentence", required: false, fallback: "" },
    service_1_name: { id: "service_1_name", description: "Service 1 name", maxChars: 30, style: "title", required: true, fallback: "Core Service" },
    service_1_desc: { id: "service_1_desc", description: "Service 1 description", maxChars: 150, style: "sentence", required: true, fallback: "Expert guidance and support." },
    service_2_name: { id: "service_2_name", description: "Service 2 name", maxChars: 30, style: "title", required: true, fallback: "Advisory" },
    service_2_desc: { id: "service_2_desc", description: "Service 2 description", maxChars: 150, style: "sentence", required: true, fallback: "Strategic counsel for complex matters." },
    service_3_name: { id: "service_3_name", description: "Service 3 name", maxChars: 30, style: "title", required: true, fallback: "Consultation" },
    service_3_desc: { id: "service_3_desc", description: "Service 3 description", maxChars: 150, style: "sentence", required: true, fallback: "Personalized solutions." },
    service_4_name: { id: "service_4_name", description: "Service 4 name", maxChars: 30, style: "title", required: false, fallback: "" },
    service_4_desc: { id: "service_4_desc", description: "Service 4 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    service_5_name: { id: "service_5_name", description: "Service 5 name", maxChars: 30, style: "title", required: false, fallback: "" },
    service_5_desc: { id: "service_5_desc", description: "Service 5 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    service_6_name: { id: "service_6_name", description: "Service 6 name", maxChars: 30, style: "title", required: false, fallback: "" },
    service_6_desc: { id: "service_6_desc", description: "Service 6 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    stats_headline: { id: "stats_headline", description: "Stats section headline", maxChars: 50, style: "sentence", required: false, fallback: "Our Results" },
    stat_1_number: { id: "stat_1_number", description: "Stat number", maxChars: 8, style: "sentence", required: false, fallback: "" },
    stat_1_label: { id: "stat_1_label", description: "Stat label", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    stat_2_number: { id: "stat_2_number", description: "Stat number", maxChars: 8, style: "sentence", required: false, fallback: "" },
    stat_2_label: { id: "stat_2_label", description: "Stat label", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    stat_3_number: { id: "stat_3_number", description: "Stat number", maxChars: 8, style: "sentence", required: false, fallback: "" },
    stat_3_label: { id: "stat_3_label", description: "Stat label", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    serve_eyebrow: { id: "serve_eyebrow", description: "Who we serve eyebrow", maxChars: 15, style: "uppercase", required: false, fallback: "WHO WE SERVE" },
    serve_headline: { id: "serve_headline", description: "Who we serve headline", maxChars: 50, style: "title", required: false, fallback: "" },
    serve_1_name: { id: "serve_1_name", description: "Client type 1", maxChars: 35, style: "title", required: false, fallback: "" },
    serve_1_desc: { id: "serve_1_desc", description: "Client type 1 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    serve_2_name: { id: "serve_2_name", description: "Client type 2", maxChars: 35, style: "title", required: false, fallback: "" },
    serve_2_desc: { id: "serve_2_desc", description: "Client type 2 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    serve_3_name: { id: "serve_3_name", description: "Client type 3", maxChars: 35, style: "title", required: false, fallback: "" },
    serve_3_desc: { id: "serve_3_desc", description: "Client type 3 description", maxChars: 150, style: "sentence", required: false, fallback: "" },
    diff_headline: { id: "diff_headline", description: "Differentiator headline", maxChars: 40, style: "uppercase", required: false, fallback: "THE DIFFERENCE" },
    diff_subheading: { id: "diff_subheading", description: "Differentiator subheading", maxChars: 50, style: "sentence", required: false, fallback: "" },
    brand_tagline: { id: "brand_tagline", description: "Brand statement (2-3 words per line)", maxChars: 50, style: "title", required: true, fallback: "Excellence,\nUnwavering Commitment." },
    brand_established: { id: "brand_established", description: "Established line", maxChars: 60, style: "uppercase", required: false, fallback: "" },
    brand_description: { id: "brand_description", description: "Brand description paragraph", maxChars: 150, style: "sentence", required: false, fallback: "" },
    team_headline: { id: "team_headline", description: "Team section headline", maxChars: 20, style: "uppercase", required: false, fallback: "LEADERSHIP" },
    team_subheading: { id: "team_subheading", description: "Team subheading", maxChars: 50, style: "sentence", required: false, fallback: "" },
    team_1_name: { id: "team_1_name", description: "Team member 1 name", maxChars: 30, style: "title", required: false, fallback: "" },
    team_1_title: { id: "team_1_title", description: "Team member 1 title", maxChars: 30, style: "uppercase", required: false, fallback: "" },
    team_1_bio: { id: "team_1_bio", description: "Team member 1 bio", maxChars: 150, style: "sentence", required: false, fallback: "" },
    team_2_name: { id: "team_2_name", description: "Team member 2 name", maxChars: 30, style: "title", required: false, fallback: "" },
    team_2_title: { id: "team_2_title", description: "Team member 2 title", maxChars: 30, style: "uppercase", required: false, fallback: "" },
    team_2_bio: { id: "team_2_bio", description: "Team member 2 bio", maxChars: 150, style: "sentence", required: false, fallback: "" },
    team_1_photo: { id: "team_1_photo", description: "Team member 1 photo", suggestedSearch: "professional headshot", required: false },
    team_2_photo: { id: "team_2_photo", description: "Team member 2 photo", suggestedSearch: "professional headshot", required: false },
    testimonials_eyebrow: { id: "testimonials_eyebrow", description: "Testimonials eyebrow", maxChars: 20, style: "uppercase", required: false, fallback: "IN THEIR WORDS" },
    testimonial_1_quote: { id: "testimonial_1_quote", description: "Testimonial quote", maxChars: 250, style: "sentence", required: false, fallback: "" },
    testimonial_1_author: { id: "testimonial_1_author", description: "Testimonial author", maxChars: 30, style: "title", required: false, fallback: "" },
    testimonial_1_title: { id: "testimonial_1_title", description: "Testimonial author title", maxChars: 50, style: "uppercase", required: false, fallback: "" },
    cta_headline: { id: "cta_headline", description: "CTA headline", maxChars: 35, style: "title", required: true, fallback: "Engage With Our Practice." },
    cta_button_text: { id: "cta_button_text", description: "CTA button text", maxChars: 25, style: "uppercase", required: true, fallback: "SCHEDULE A CONSULTATION" },
    footer_tagline: { id: "footer_tagline", description: "Footer tagline", maxChars: 100, style: "sentence", required: false, fallback: "" },
  },
  imageSlots: {
    about_photo: { id: "about_photo", description: "About section image", suggestedSearch: "modern professional office", required: false },
    team_1_photo: { id: "team_1_photo", description: "Team member 1 headshot", suggestedSearch: "professional headshot", required: false },
    team_2_photo: { id: "team_2_photo", description: "Team member 2 headshot", suggestedSearch: "professional headshot", required: false },
  }
};

// ═══════════════════════════════════════════════════════════════════════
// FEMININE SERVICES TEMPLATE (Coaches, Consultants, Wellness)
// ═══════════════════════════════════════════════════════════════════════
const feminineServicesTemplate: TemplateConfig = {
  id: "feminine-services",
  name: "Feminine Services",
  description: "Elegant, warm layout for coaches, wellness practitioners, and creative professionals",
  bestFor: ["coach", "life coach", "business coach", "therapist", "counselor", "yoga", "wellness", "nutritionist", "doula", "photographer", "designer", "stylist"],
  sections: [
    {
      id: "navigation",
      type: "navigation",
      label: "Header Navigation",
      removable: false,
      slots: ["business_name"],
      imageSlots: []
    },
    {
      id: "hero",
      type: "hero",
      label: "Hero Section",
      removable: false,
      slots: ["announcement_bar", "hero_headline", "hero_subheading", "hero_cta_text"],
      imageSlots: ["hero_photo"]
    },
    {
      id: "about",
      type: "about",
      label: "About / Introduction",
      removable: false,
      slots: ["about_eyebrow", "about_headline", "about_story", "about_signature"],
      imageSlots: ["about_photo"]
    },
    {
      id: "services",
      type: "services",
      label: "Services / Offerings",
      removable: false,
      slots: ["services_headline", "service_1_name", "service_1_desc", "service_1_price", "service_2_name", "service_2_desc", "service_2_price", "service_3_name", "service_3_desc", "service_3_price"],
      imageSlots: []
    },
    {
      id: "testimonials",
      type: "testimonials",
      label: "Client Testimonials",
      removable: true,
      requiresData: ["reviews"],
      slots: ["testimonials_headline", "testimonial_1_quote", "testimonial_1_author", "testimonial_2_quote", "testimonial_2_author"],
      imageSlots: []
    },
    {
      id: "before-after",
      type: "portfolio",
      label: "Before & After / Results",
      removable: true,
      requiresData: ["photos"],
      slots: ["results_headline"],
      imageSlots: ["before_photo", "after_photo"]
    },
    {
      id: "cta",
      type: "cta",
      label: "Call to Action",
      removable: false,
      slots: ["cta_headline", "cta_subtext", "cta_button_text"],
      imageSlots: []
    },
    {
      id: "footer",
      type: "footer",
      label: "Footer",
      removable: false,
      slots: ["business_name", "footer_tagline", "phone", "email"],
      imageSlots: []
    }
  ],
  slots: {
    business_name: { id: "business_name", description: "Business/brand name", maxChars: 25, style: "uppercase", required: true, fallback: "BRAND NAME" },
    phone: { id: "phone", description: "Phone number", maxChars: 14, style: "sentence", required: false, fallback: "" },
    email: { id: "email", description: "Email address", maxChars: 40, style: "lowercase", required: false, fallback: "" },
    announcement_bar: { id: "announcement_bar", description: "Top announcement (e.g., 'NOW ENROLLING')", maxChars: 50, style: "uppercase", required: false, fallback: "" },
    hero_headline: { id: "hero_headline", description: "Main headline - empowering, aspirational", maxChars: 60, style: "title", required: true, fallback: "Transform Your Life\nWith Expert Guidance" },
    hero_subheading: { id: "hero_subheading", description: "Supporting subheading", maxChars: 150, style: "sentence", required: true, fallback: "Personalized support to help you achieve your goals." },
    hero_cta_text: { id: "hero_cta_text", description: "CTA button text", maxChars: 25, style: "uppercase", required: true, fallback: "BOOK A SESSION" },
    hero_photo: { id: "hero_photo", description: "Hero photo", suggestedSearch: "professional woman portrait", required: true },
    about_eyebrow: { id: "about_eyebrow", description: "About eyebrow text", maxChars: 15, style: "uppercase", required: false, fallback: "ABOUT" },
    about_headline: { id: "about_headline", description: "About headline", maxChars: 50, style: "title", required: true, fallback: "Hi, I'm [Name]" },
    about_story: { id: "about_story", description: "Personal story / bio", maxChars: 500, style: "sentence", required: true, fallback: "I help people transform their lives through personalized guidance and support." },
    about_signature: { id: "about_signature", description: "Signature name", maxChars: 25, style: "sentence", required: false, fallback: "" },
    about_photo: { id: "about_photo", description: "About photo", suggestedSearch: "professional woman working", required: false },
    services_headline: { id: "services_headline", description: "Services section headline", maxChars: 40, style: "title", required: true, fallback: "How I Can Help" },
    service_1_name: { id: "service_1_name", description: "Service/offering 1 name", maxChars: 30, style: "title", required: true, fallback: "1:1 Coaching" },
    service_1_desc: { id: "service_1_desc", description: "Service 1 description", maxChars: 150, style: "sentence", required: true, fallback: "Personalized sessions tailored to your unique journey." },
    service_1_price: { id: "service_1_price", description: "Service 1 price (optional)", maxChars: 15, style: "sentence", required: false, fallback: "" },
    service_2_name: { id: "service_2_name", description: "Service/offering 2 name", maxChars: 30, style: "title", required: true, fallback: "Group Program" },
    service_2_desc: { id: "service_2_desc", description: "Service 2 description", maxChars: 150, style: "sentence", required: true, fallback: "Community-driven transformation with like-minded individuals." },
    service_2_price: { id: "service_2_price", description: "Service 2 price (optional)", maxChars: 15, style: "sentence", required: false, fallback: "" },
    service_3_name: { id: "service_3_name", description: "Service/offering 3 name", maxChars: 30, style: "title", required: true, fallback: "VIP Day" },
    service_3_desc: { id: "service_3_desc", description: "Service 3 description", maxChars: 150, style: "sentence", required: true, fallback: "An intensive, focused day of breakthrough work." },
    service_3_price: { id: "service_3_price", description: "Service 3 price (optional)", maxChars: 15, style: "sentence", required: false, fallback: "" },
    testimonials_headline: { id: "testimonials_headline", description: "Testimonials headline", maxChars: 40, style: "title", required: false, fallback: "What My Clients Say" },
    testimonial_1_quote: { id: "testimonial_1_quote", description: "Testimonial quote", maxChars: 250, style: "sentence", required: false, fallback: "" },
    testimonial_1_author: { id: "testimonial_1_author", description: "Testimonial author", maxChars: 30, style: "title", required: false, fallback: "" },
    testimonial_2_quote: { id: "testimonial_2_quote", description: "Testimonial quote", maxChars: 250, style: "sentence", required: false, fallback: "" },
    testimonial_2_author: { id: "testimonial_2_author", description: "Testimonial author", maxChars: 30, style: "title", required: false, fallback: "" },
    results_headline: { id: "results_headline", description: "Results section headline", maxChars: 30, style: "title", required: false, fallback: "Results" },
    before_photo: { id: "before_photo", description: "Before photo", suggestedSearch: "", required: false },
    after_photo: { id: "after_photo", description: "After photo", suggestedSearch: "", required: false },
    cta_headline: { id: "cta_headline", description: "CTA headline", maxChars: 40, style: "title", required: true, fallback: "Ready to Begin?" },
    cta_subtext: { id: "cta_subtext", description: "CTA supporting text", maxChars: 100, style: "sentence", required: false, fallback: "Book your complimentary discovery call today." },
    cta_button_text: { id: "cta_button_text", description: "CTA button text", maxChars: 25, style: "uppercase", required: true, fallback: "BOOK NOW" },
    footer_tagline: { id: "footer_tagline", description: "Footer tagline", maxChars: 80, style: "sentence", required: false, fallback: "" },
  },
  imageSlots: {
    hero_photo: { id: "hero_photo", description: "Hero portrait photo", suggestedSearch: "professional woman portrait natural light", required: true },
    about_photo: { id: "about_photo", description: "About section photo", suggestedSearch: "woman working at desk", required: false },
    before_photo: { id: "before_photo", description: "Before/results photo", suggestedSearch: "", required: false },
    after_photo: { id: "after_photo", description: "After/results photo", suggestedSearch: "", required: false },
  }
};

// ═══════════════════════════════════════════════════════════════════════
// SALON TEMPLATE (Salons, Spas, Beauty)
// ═══════════════════════════════════════════════════════════════════════
const salonTemplate: TemplateConfig = {
  id: "salon",
  name: "Salon & Spa",
  description: "Luxurious, serene layout for beauty and wellness businesses",
  bestFor: ["salon", "hair salon", "barber", "spa", "nail salon", "beauty", "skincare", "massage", "med spa", "lash", "brow"],
  sections: [
    {
      id: "navigation",
      type: "navigation",
      label: "Header Navigation",
      removable: false,
      slots: ["business_name"],
      imageSlots: []
    },
    {
      id: "hero",
      type: "hero",
      label: "Hero / About Intro",
      removable: false,
      slots: ["hero_eyebrow", "hero_headline", "hero_story"],
      imageSlots: ["hero_photo"]
    },
    {
      id: "philosophy",
      type: "about",
      label: "Philosophy / Approach",
      removable: true,
      slots: ["philosophy_quote", "philosophy_text"],
      imageSlots: []
    },
    {
      id: "services",
      type: "services",
      label: "Services Menu",
      removable: false,
      slots: ["services_headline", "service_1_name", "service_1_desc", "service_1_price", "service_2_name", "service_2_desc", "service_2_price", "service_3_name", "service_3_desc", "service_3_price", "service_4_name", "service_4_desc", "service_4_price"],
      imageSlots: ["services_photo"]
    },
    {
      id: "experience",
      type: "about",
      label: "The Experience",
      removable: true,
      slots: ["experience_headline", "experience_text"],
      imageSlots: ["experience_photo"]
    },
    {
      id: "testimonials",
      type: "testimonials",
      label: "Client Reviews",
      removable: true,
      requiresData: ["reviews"],
      slots: ["testimonial_1_quote", "testimonial_1_author", "testimonial_2_quote", "testimonial_2_author", "testimonial_3_quote", "testimonial_3_author"],
      imageSlots: []
    },
    {
      id: "cta",
      type: "cta",
      label: "Booking CTA",
      removable: false,
      slots: ["cta_headline", "cta_subtext", "cta_button_text", "phone"],
      imageSlots: []
    },
    {
      id: "footer",
      type: "footer",
      label: "Footer",
      removable: false,
      slots: ["business_name", "footer_tagline", "phone", "address", "city_state", "hours_line_1", "hours_line_2"],
      imageSlots: []
    }
  ],
  slots: {
    business_name: { id: "business_name", description: "Salon/spa name", maxChars: 25, style: "uppercase", required: true, fallback: "SALON NAME" },
    phone: { id: "phone", description: "Phone number", maxChars: 14, style: "sentence", required: true, fallback: "(555) 000-0000" },
    address: { id: "address", description: "Street address", maxChars: 50, style: "sentence", required: false, fallback: "" },
    city_state: { id: "city_state", description: "City, State", maxChars: 30, style: "sentence", required: true, fallback: "Your City, ST" },
    hours_line_1: { id: "hours_line_1", description: "Hours line 1", maxChars: 30, style: "sentence", required: false, fallback: "" },
    hours_line_2: { id: "hours_line_2", description: "Hours line 2", maxChars: 30, style: "sentence", required: false, fallback: "" },
    hero_eyebrow: { id: "hero_eyebrow", description: "Hero eyebrow", maxChars: 20, style: "uppercase", required: false, fallback: "✦ ABOUT ✦" },
    hero_headline: { id: "hero_headline", description: "Hero headline", maxChars: 50, style: "title", required: true, fallback: "A House Built\nFor Stillness" },
    hero_story: { id: "hero_story", description: "Hero story paragraph", maxChars: 300, style: "sentence", required: true, fallback: "A sanctuary dedicated to your beauty and well-being." },
    hero_photo: { id: "hero_photo", description: "Hero photo", suggestedSearch: "luxury salon interior", required: true },
    philosophy_quote: { id: "philosophy_quote", description: "Philosophy quote", maxChars: 80, style: "sentence", required: false, fallback: "" },
    philosophy_text: { id: "philosophy_text", description: "Philosophy paragraph", maxChars: 200, style: "sentence", required: false, fallback: "" },
    services_headline: { id: "services_headline", description: "Services headline", maxChars: 30, style: "title", required: true, fallback: "Our Services" },
    service_1_name: { id: "service_1_name", description: "Service 1 name", maxChars: 25, style: "title", required: true, fallback: "Signature Service" },
    service_1_desc: { id: "service_1_desc", description: "Service 1 description", maxChars: 120, style: "sentence", required: true, fallback: "Our most popular treatment." },
    service_1_price: { id: "service_1_price", description: "Service 1 price", maxChars: 10, style: "sentence", required: false, fallback: "" },
    service_2_name: { id: "service_2_name", description: "Service 2 name", maxChars: 25, style: "title", required: true, fallback: "Premium Service" },
    service_2_desc: { id: "service_2_desc", description: "Service 2 description", maxChars: 120, style: "sentence", required: true, fallback: "Elevated care for discerning clients." },
    service_2_price: { id: "service_2_price", description: "Service 2 price", maxChars: 10, style: "sentence", required: false, fallback: "" },
    service_3_name: { id: "service_3_name", description: "Service 3 name", maxChars: 25, style: "title", required: true, fallback: "Express Service" },
    service_3_desc: { id: "service_3_desc", description: "Service 3 description", maxChars: 120, style: "sentence", required: true, fallback: "Quick refresh for busy schedules." },
    service_3_price: { id: "service_3_price", description: "Service 3 price", maxChars: 10, style: "sentence", required: false, fallback: "" },
    service_4_name: { id: "service_4_name", description: "Service 4 name", maxChars: 25, style: "title", required: false, fallback: "" },
    service_4_desc: { id: "service_4_desc", description: "Service 4 description", maxChars: 120, style: "sentence", required: false, fallback: "" },
    service_4_price: { id: "service_4_price", description: "Service 4 price", maxChars: 10, style: "sentence", required: false, fallback: "" },
    services_photo: { id: "services_photo", description: "Services section photo", suggestedSearch: "luxury beauty treatment", required: false },
    experience_headline: { id: "experience_headline", description: "Experience headline", maxChars: 40, style: "title", required: false, fallback: "The Experience" },
    experience_text: { id: "experience_text", description: "Experience description", maxChars: 200, style: "sentence", required: false, fallback: "" },
    experience_photo: { id: "experience_photo", description: "Experience photo", suggestedSearch: "spa interior candles", required: false },
    testimonial_1_quote: { id: "testimonial_1_quote", description: "Review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    testimonial_1_author: { id: "testimonial_1_author", description: "Reviewer name", maxChars: 25, style: "title", required: false, fallback: "" },
    testimonial_2_quote: { id: "testimonial_2_quote", description: "Review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    testimonial_2_author: { id: "testimonial_2_author", description: "Reviewer name", maxChars: 25, style: "title", required: false, fallback: "" },
    testimonial_3_quote: { id: "testimonial_3_quote", description: "Review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    testimonial_3_author: { id: "testimonial_3_author", description: "Reviewer name", maxChars: 25, style: "title", required: false, fallback: "" },
    cta_headline: { id: "cta_headline", description: "CTA headline", maxChars: 30, style: "title", required: true, fallback: "Book Your Visit" },
    cta_subtext: { id: "cta_subtext", description: "CTA subtext", maxChars: 80, style: "sentence", required: false, fallback: "We look forward to welcoming you." },
    cta_button_text: { id: "cta_button_text", description: "CTA button", maxChars: 20, style: "uppercase", required: true, fallback: "BOOK ONLINE" },
    footer_tagline: { id: "footer_tagline", description: "Footer tagline", maxChars: 80, style: "sentence", required: false, fallback: "" },
  },
  imageSlots: {
    hero_photo: { id: "hero_photo", description: "Hero/about photo", suggestedSearch: "luxury salon interior", required: true },
    services_photo: { id: "services_photo", description: "Services photo", suggestedSearch: "beauty treatment close up", required: false },
    experience_photo: { id: "experience_photo", description: "Experience photo", suggestedSearch: "spa relaxation room", required: false },
  }
};

// ═══════════════════════════════════════════════════════════════════════
// FOOD TEMPLATE (Restaurants, Cafes, Bakeries, Food Trucks)
// ═══════════════════════════════════════════════════════════════════════
const foodTemplate: TemplateConfig = {
  id: "food",
  name: "Food & Restaurant",
  description: "Bold, appetizing layout for food businesses",
  bestFor: ["restaurant", "cafe", "bakery", "food truck", "catering", "bar", "brewery", "pizzeria", "diner", "bistro"],
  sections: [
    {
      id: "navigation",
      type: "navigation",
      label: "Header Navigation",
      removable: false,
      slots: ["business_name"],
      imageSlots: ["logo"]
    },
    {
      id: "hero",
      type: "hero",
      label: "Hero Section",
      removable: false,
      slots: ["hero_badge", "hero_headline", "hero_subheading", "hero_cta_text"],
      imageSlots: ["hero_photo"]
    },
    {
      id: "about",
      type: "about",
      label: "Our Story",
      removable: false,
      slots: ["about_headline", "about_story", "about_badge"],
      imageSlots: ["about_photo"]
    },
    {
      id: "menu-highlights",
      type: "services",
      label: "Menu Highlights",
      removable: false,
      slots: ["menu_headline", "menu_subheading", "menu_item_1_name", "menu_item_1_desc", "menu_item_1_price", "menu_item_2_name", "menu_item_2_desc", "menu_item_2_price", "menu_item_3_name", "menu_item_3_desc", "menu_item_3_price"],
      imageSlots: ["menu_photo_1", "menu_photo_2"]
    },
    {
      id: "philosophy",
      type: "about",
      label: "Food Philosophy",
      removable: true,
      slots: ["philosophy_headline", "philosophy_text", "philosophy_badge_1", "philosophy_badge_2", "philosophy_badge_3"],
      imageSlots: ["philosophy_photo"]
    },
    {
      id: "testimonials",
      type: "testimonials",
      label: "Reviews",
      removable: true,
      requiresData: ["reviews"],
      slots: ["testimonial_1_quote", "testimonial_1_author", "testimonial_2_quote", "testimonial_2_author"],
      imageSlots: []
    },
    {
      id: "cta",
      type: "cta",
      label: "Reservation CTA",
      removable: false,
      slots: ["cta_headline", "cta_subtext", "cta_button_text", "phone"],
      imageSlots: []
    },
    {
      id: "footer",
      type: "footer",
      label: "Footer",
      removable: false,
      slots: ["business_name", "footer_tagline", "phone", "address", "city_state", "hours_line_1", "hours_line_2"],
      imageSlots: []
    }
  ],
  slots: {
    business_name: { id: "business_name", description: "Restaurant/business name", maxChars: 25, style: "uppercase", required: true, fallback: "RESTAURANT" },
    phone: { id: "phone", description: "Phone number", maxChars: 14, style: "sentence", required: true, fallback: "(555) 000-0000" },
    address: { id: "address", description: "Street address", maxChars: 50, style: "sentence", required: false, fallback: "" },
    city_state: { id: "city_state", description: "City, State", maxChars: 30, style: "sentence", required: true, fallback: "Your City, ST" },
    hours_line_1: { id: "hours_line_1", description: "Hours line 1", maxChars: 30, style: "sentence", required: false, fallback: "" },
    hours_line_2: { id: "hours_line_2", description: "Hours line 2", maxChars: 30, style: "sentence", required: false, fallback: "" },
    hero_badge: { id: "hero_badge", description: "Hero badge (e.g., 'SINCE 2014')", maxChars: 25, style: "uppercase", required: false, fallback: "" },
    hero_headline: { id: "hero_headline", description: "Hero headline", maxChars: 40, style: "title", required: true, fallback: "Come Hungry,\nLeave Happy" },
    hero_subheading: { id: "hero_subheading", description: "Hero subheading", maxChars: 100, style: "sentence", required: true, fallback: "Fresh, made-from-scratch food served with heart." },
    hero_cta_text: { id: "hero_cta_text", description: "CTA button", maxChars: 20, style: "uppercase", required: true, fallback: "BOOK A TABLE" },
    hero_photo: { id: "hero_photo", description: "Hero food photo", suggestedSearch: "restaurant food plating", required: true },
    about_headline: { id: "about_headline", description: "About headline", maxChars: 30, style: "title", required: true, fallback: "Our Story" },
    about_story: { id: "about_story", description: "Restaurant story", maxChars: 400, style: "sentence", required: true, fallback: "Born from a passion for great food and community." },
    about_badge: { id: "about_badge", description: "About badge text", maxChars: 20, style: "uppercase", required: false, fallback: "" },
    about_photo: { id: "about_photo", description: "About photo", suggestedSearch: "chef cooking in kitchen", required: false },
    menu_headline: { id: "menu_headline", description: "Menu section headline", maxChars: 25, style: "title", required: true, fallback: "The Menu" },
    menu_subheading: { id: "menu_subheading", description: "Menu subheading", maxChars: 80, style: "sentence", required: false, fallback: "" },
    menu_item_1_name: { id: "menu_item_1_name", description: "Menu item 1", maxChars: 30, style: "title", required: true, fallback: "Signature Dish" },
    menu_item_1_desc: { id: "menu_item_1_desc", description: "Menu item 1 description", maxChars: 100, style: "sentence", required: true, fallback: "Our most popular creation." },
    menu_item_1_price: { id: "menu_item_1_price", description: "Menu item 1 price", maxChars: 8, style: "sentence", required: false, fallback: "" },
    menu_item_2_name: { id: "menu_item_2_name", description: "Menu item 2", maxChars: 30, style: "title", required: true, fallback: "House Special" },
    menu_item_2_desc: { id: "menu_item_2_desc", description: "Menu item 2 description", maxChars: 100, style: "sentence", required: true, fallback: "A house favorite." },
    menu_item_2_price: { id: "menu_item_2_price", description: "Menu item 2 price", maxChars: 8, style: "sentence", required: false, fallback: "" },
    menu_item_3_name: { id: "menu_item_3_name", description: "Menu item 3", maxChars: 30, style: "title", required: true, fallback: "Chef's Choice" },
    menu_item_3_desc: { id: "menu_item_3_desc", description: "Menu item 3 description", maxChars: 100, style: "sentence", required: true, fallback: "Seasonal and inspired." },
    menu_item_3_price: { id: "menu_item_3_price", description: "Menu item 3 price", maxChars: 8, style: "sentence", required: false, fallback: "" },
    menu_photo_1: { id: "menu_photo_1", description: "Menu photo 1", suggestedSearch: "restaurant dish close up", required: false },
    menu_photo_2: { id: "menu_photo_2", description: "Menu photo 2", suggestedSearch: "food plating", required: false },
    philosophy_headline: { id: "philosophy_headline", description: "Philosophy headline", maxChars: 25, style: "title", required: false, fallback: "Built Different" },
    philosophy_text: { id: "philosophy_text", description: "Philosophy text", maxChars: 200, style: "sentence", required: false, fallback: "" },
    philosophy_badge_1: { id: "philosophy_badge_1", description: "Philosophy point 1", maxChars: 30, style: "sentence", required: false, fallback: "" },
    philosophy_badge_2: { id: "philosophy_badge_2", description: "Philosophy point 2", maxChars: 30, style: "sentence", required: false, fallback: "" },
    philosophy_badge_3: { id: "philosophy_badge_3", description: "Philosophy point 3", maxChars: 30, style: "sentence", required: false, fallback: "" },
    philosophy_photo: { id: "philosophy_photo", description: "Philosophy photo", suggestedSearch: "fresh ingredients kitchen", required: false },
    testimonial_1_quote: { id: "testimonial_1_quote", description: "Review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    testimonial_1_author: { id: "testimonial_1_author", description: "Reviewer", maxChars: 25, style: "title", required: false, fallback: "" },
    testimonial_2_quote: { id: "testimonial_2_quote", description: "Review quote", maxChars: 200, style: "sentence", required: false, fallback: "" },
    testimonial_2_author: { id: "testimonial_2_author", description: "Reviewer", maxChars: 25, style: "title", required: false, fallback: "" },
    cta_headline: { id: "cta_headline", description: "CTA headline", maxChars: 30, style: "title", required: true, fallback: "Reserve Your Table" },
    cta_subtext: { id: "cta_subtext", description: "CTA subtext", maxChars: 80, style: "sentence", required: false, fallback: "Walk-ins welcome. Reservations recommended." },
    cta_button_text: { id: "cta_button_text", description: "CTA button", maxChars: 20, style: "uppercase", required: true, fallback: "BOOK A TABLE" },
    footer_tagline: { id: "footer_tagline", description: "Footer tagline", maxChars: 80, style: "sentence", required: false, fallback: "" },
  },
  imageSlots: {
    logo: { id: "logo", description: "Restaurant logo", suggestedSearch: "", required: false },
    hero_photo: { id: "hero_photo", description: "Hero food photo", suggestedSearch: "gourmet burger close up", required: true },
    about_photo: { id: "about_photo", description: "About/kitchen photo", suggestedSearch: "chef cooking flames", required: false },
    menu_photo_1: { id: "menu_photo_1", description: "Menu item photo", suggestedSearch: "restaurant dish plating", required: false },
    menu_photo_2: { id: "menu_photo_2", description: "Menu item photo", suggestedSearch: "food photography", required: false },
    philosophy_photo: { id: "philosophy_photo", description: "Ingredients/philosophy photo", suggestedSearch: "fresh ingredients cutting board", required: false },
  }
};

// ═══════════════════════════════════════════════════════════════════════
// REGISTRY EXPORT
// ═══════════════════════════════════════════════════════════════════════

export const TEMPLATE_REGISTRY: Record<string, TemplateConfig> = {
  "trades": tradesTemplate,
  "professional-services": professionalServicesTemplate,
  "feminine-services": feminineServicesTemplate,
  "salon": salonTemplate,
  "food": foodTemplate,
  // Aliases for existing template IDs in the database
  "business-professional": professionalServicesTemplate,
  "feminine-bold": feminineServicesTemplate,
  "local-favorite": foodTemplate,
  "glamour-studio": salonTemplate,
  "sparkle-pro": tradesTemplate,
};

/**
 * Get the best template for a given business type.
 */
export function selectTemplate(businessType: string): TemplateConfig {
  const bt = (businessType || "").toLowerCase();
  for (const config of [tradesTemplate, professionalServicesTemplate, feminineServicesTemplate, salonTemplate, foodTemplate]) {
    if (config.bestFor.some(term => bt.includes(term))) {
      return config;
    }
  }
  // Default to trades (most generic)
  return tradesTemplate;
}

/**
 * Build the AI prompt's slot definitions section from a template config.
 */
export function buildSlotPrompt(config: TemplateConfig, availableData: Record<string, boolean>): string {
  const lines: string[] = [];
  
  // Determine which sections to include
  const activeSections = config.sections.filter(s => {
    if (!s.removable) return true;
    if (!s.requiresData) return true;
    return s.requiresData.every(d => availableData[d]);
  });
  
  lines.push("SECTIONS TO INCLUDE:");
  for (const s of activeSections) {
    lines.push(`  - ${s.id} (${s.label})`);
  }
  
  lines.push("\nSECTIONS TO REMOVE (no data available):");
  const removedSections = config.sections.filter(s => !activeSections.includes(s));
  for (const s of removedSections) {
    lines.push(`  - ${s.id} (${s.label}) — missing: ${s.requiresData?.join(", ")}`);
  }
  
  lines.push("\nTEXT SLOTS TO FILL:");
  const activeSlotIds = new Set(activeSections.flatMap(s => s.slots));
  for (const [id, slot] of Object.entries(config.slots)) {
    if (!activeSlotIds.has(id)) continue;
    const req = slot.required ? "REQUIRED" : "optional";
    lines.push(`  "${id}": ${slot.description} (max ${slot.maxChars} chars, ${slot.style}, ${req})`);
  }
  
  lines.push("\nIMAGE SEARCH TERMS TO SUGGEST:");
  const activeImageIds = new Set(activeSections.flatMap(s => s.imageSlots));
  for (const [id, img] of Object.entries(config.imageSlots)) {
    if (!activeImageIds.has(id)) continue;
    lines.push(`  "${id}": ${img.description}${img.suggestedSearch ? ` (default: "${img.suggestedSearch}")` : ""}`);
  }
  
  return lines.join("\n");
}
