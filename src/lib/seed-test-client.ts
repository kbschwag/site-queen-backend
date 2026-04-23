import { supabase } from "@/integrations/supabase/client";

export interface SeedResult {
  clientId: string;
  businessName: string;
}

/**
 * Creates a fully populated test client (Phoenix Pro Plumbing) with intake data
 * stored on the sites record and call notes attached. Returns the new client ID.
 *
 * NOTE: No auth user is created — this is a developer-only seed for visual / pipeline
 * testing inside the operator portal. The client.user_id is left null.
 */
export async function seedTestClient(): Promise<SeedResult> {
  const business_name = "Phoenix Pro Plumbing";

  // 1) clients row
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      business_name,
      business_type: "plumbing",
      plan: "growth",
      site_status: "building",
      intake_completed: true,
      call_notes_completed: true,
      primary_color: "#1a3a5c",
      accent_color: "#f6a823",
      phone_number: "(480) 555-0199",
    } as any)
    .select("id, business_name")
    .single();

  if (clientErr || !client) throw clientErr || new Error("Failed to create test client");
  const clientId = (client as any).id as string;

  const intakeData: any = {
    business_name,
    tagline: "Fast. Reliable. Local.",
    business_phone: "(480) 555-0199",
    business_phone_raw: "4805550199",
    business_email: "info@phoenixproplumbing.com",
    business_city: "Phoenix",
    business_state: "AZ",
    business_address: "Mobile Service",
    domain: "phoenixproplumbing.com",
    years_in_business: "12",
    google_rating: "4.8",
    google_review_count: "312",
    service_area: "Phoenix & Surrounding Areas",
    template_id: "trades-hero",
    template_selected: "trades",
    primary_color: "#1a3a5c",
    primary_dark: "#122840",
    accent_color: "#f6a823",
    dark_color: "#0d1d3b",
    font_heading: "Oswald",
    font_body: "Open Sans",
    hero_badge: "PHOENIX'S MOST TRUSTED PLUMBER",
    hero_headline_line1: "PHOENIX'S MOST TRUSTED",
    hero_headline_highlight: "PLUMBING",
    hero_headline_line2: "EXPERTS",
    hero_subheading:
      "Over 12 years of fast, reliable plumbing service delivered right to your door. Licensed, insured, and ready 24/7.",
    about_headline: "Your Trusted Phoenix Plumbing Experts Since 2012",
    about_story:
      "Phoenix Pro Plumbing has been serving the Greater Phoenix area for over 12 years. We specialize in residential plumbing repairs, drain cleaning, and water heater installation. Family owned and operated — we treat every home like our own.",
    about_points: [
      "Family owned since 2012",
      "Licensed & insured",
      "Flat-rate pricing",
      "24/7 emergency service",
    ],
    services: [
      { name: "Drain Cleaning", description: "Fast, effective drain cleaning for kitchen, bathroom, and main line clogs. We clear it the first time.", icon: "🔧" },
      { name: "Water Heater Installation", description: "Expert installation of tank and tankless water heaters. Same-day service available.", icon: "🌡" },
      { name: "Leak Detection", description: "Advanced leak detection technology to find and fix hidden leaks before they become disasters.", icon: "💧" },
      { name: "Toilet Repair", description: "Running toilets, clogs, and full replacements handled quickly and affordably.", icon: "🔩" },
      { name: "Emergency Plumbing", description: "Burst pipes, major leaks, no hot water — we respond fast 24 hours a day.", icon: "⚡" },
    ],
    stat_1_number: "12+",
    stat_1_label: "YEARS IN BUSINESS",
    stat_2_number: "4.8★",
    stat_2_label: "AVERAGE RATING",
    stat_3_number: "312+",
    stat_3_label: "HAPPY CUSTOMERS",
    stat_4_number: "100%",
    stat_4_label: "SATISFACTION GUARANTEED",
    testimonials: [
      { text: "Called at 7am with a burst pipe. Phoenix Pro had someone out within an hour and fixed it fast. Honest pricing, no surprises.", name: "Maria D.", location: "Scottsdale, AZ" },
      { text: "Replaced our water heater same day. The tech was professional, clean, and walked us through everything. Will never call anyone else.", name: "James R.", location: "Tempe, AZ" },
      { text: "Fair prices, showed up on time, fixed the problem right the first time. That's all I ask for and they delivered every time.", name: "Sandra K.", location: "Chandler, AZ" },
    ],
    faq_items: [
      { question: "Do you offer same-day service?", answer: "Yes — we offer same-day service for most plumbing issues in the Greater Phoenix area. Call us early and we'll do our best to get someone out the same day." },
      { question: "Are your prices upfront?", answer: "Always. We give you a flat-rate price before we start any work. No surprises, no hidden fees." },
      { question: "Do you offer emergency plumbing?", answer: "Yes — we're available 24/7 for plumbing emergencies including burst pipes, major leaks, and no hot water." },
      { question: "What areas do you serve?", answer: "We serve Phoenix, Scottsdale, Tempe, Mesa, Chandler, Gilbert, and surrounding communities in the Greater Phoenix area." },
    ],
    service_area_locations: [
      { name: "Phoenix" }, { name: "Scottsdale" },
      { name: "Tempe" }, { name: "Mesa" },
      { name: "Chandler" }, { name: "Gilbert" },
    ],
    emergency_headline: "PLUMBING EMERGENCY?",
    emergency_subtext: "Burst pipe, no hot water, backed up drain — call now and a licensed plumber is on the way.",
    why_us_headline: "WHY PHOENIX HOMEOWNERS CHOOSE US",
    why_us_points: [
      { number: "01", title: "We Show Up On Time", description: "We respect your time. Our techs call ahead and arrive in the promised window — every time." },
      { number: "02", title: "Flat-Rate Honest Pricing", description: "You get a price before we start. No surprises on the final bill. Ever." },
      { number: "03", title: "Guaranteed Quality Work", description: "Every repair is backed by our satisfaction guarantee. If it's not right we come back and fix it." },
    ],
    final_cta_headline: "READY TO FIX IT RIGHT?",
    final_cta_subtext: "One call, one trusted crew, every job. Same-day appointments available across Greater Phoenix.",
    footer_tagline: "Phoenix's trusted plumbing team since 2012.",
    footer_newsletter_text: "Monthly tips and exclusive deals for Phoenix homeowners.",
    copyright_year: "2026",
    show_coupons: false,
    show_financing: false,
    show_awards: false,
    trust_item_3: "EMERGENCY CALLS WELCOME",
  };

  // 2) sites row with intake data
  const { error: siteErr } = await supabase
    .from("sites")
    .insert({
      client_id: clientId,
      business_type: "plumbing",
      brand_vibe: "Strong, trustworthy, emergency-forward",
      primary_color: "#1a3a5c",
      template_used: "trades-hero",
      generation_status: "pending",
      intake_data: intakeData,
    } as any);

  if (siteErr) throw siteErr;

  // 3) call notes
  const { error: notesErr } = await supabase.from("call_notes").insert({
    client_id: clientId,
    completed: true,
    completed_at: new Date().toISOString(),
    their_story:
      "Mike has been plumbing for 12 years, started solo out of his truck, now has 3 trucks and 2 employees. Very proud of his reputation and online reviews.",
    ideal_customer:
      "Homeowners 35-65 in Phoenix suburbs who want reliable service and are willing to pay fair prices for quality work.",
    color_direction:
      "Navy #1a3a5c as primary, gold #f6a823 as accent. Professional but approachable.",
    vibe_notes:
      "Strong, trustworthy, emergency-forward. Big phone number energy.",
    expert_additions:
      "Lead with the emergency availability angle. Make the phone number as large as possible everywhere it appears. Emphasize 12 years and family owned throughout. Use navy #1a3a5c as the primary color everywhere the template uses the primary variable. The about section should feel personal and human not corporate.",
    expert_avoid:
      "Do not make it feel like a big corporate company. Keep it personal and local.",
    template_selected: "trades",
    tone_of_voice: "friendly_professional",
    website_goal: "Generate phone calls for emergency and same-day plumbing work.",
  } as any);

  if (notesErr) throw notesErr;

  return { clientId, businessName: business_name };
}
