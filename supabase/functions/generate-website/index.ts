import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth check — require valid JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authCheck = createClient(supabaseUrl, supabaseKey);
  const { data: { user: caller }, error: authErr } = await authCheck.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !caller) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let clientId: string | null = null;
  let rawText = "";

  try {
    const body = await req.json();
    clientId = body.client_id;
    if (!clientId) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch existing site so we can increment attempt counter
    const { data: existingSite } = await supabase
      .from("sites")
      .select("generation_attempts")
      .eq("client_id", clientId)
      .maybeSingle();

    // Update status to generating + bump attempt counter + timestamp
    await supabase
      .from("sites")
      .update({
        generation_status: "generating",
        generation_attempts: ((existingSite as any)?.generation_attempts || 0) + 1,
        last_generation_attempt_at: new Date().toISOString(),
      } as any)
      .eq("client_id", clientId);

    // Fetch client + site data
    const { data: siteData, error: siteError } = await supabase
      .from("sites")
      .select("*")
      .eq("client_id", clientId)
      .single();

    if (siteError || !siteData) throw new Error("Site record not found");

    const { data: clientData } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .single();

    const intakeData = siteData.intake_data || {};

    // ====================================================================
    // SNAPSHOT INTAKE DATA — preserved even if generation later fails
    // ====================================================================
    await supabase
      .from("sites")
      .update({
        intake_snapshot: intakeData,
        intake_snapshot_saved_at: new Date().toISOString(),
      } as any)
      .eq("client_id", clientId);

    // Photo handling — decide if we're using client photos or stock
    const usingStockPhotos = !!(siteData as any).using_stock_photos;

    // Collect uploaded client photo URLs (if any)
    const clientPhotoUrls: string[] = [];
    const id = intakeData || {};
    if (id.hero_photo_url) clientPhotoUrls.push(id.hero_photo_url);
    if (id.owner_photo_url) clientPhotoUrls.push(id.owner_photo_url);
    for (const arr of [id.portfolio_photos, id.team_photos, id.location_photos, id.extra_photos, id.award_logos]) {
      if (Array.isArray(arr)) for (const u of arr) if (u) clientPhotoUrls.push(u);
    }
    for (const s of id.services || []) if (s.photo_url) clientPhotoUrls.push(s.photo_url);
    for (const m of id.team_members || []) if (m.photo_url) clientPhotoUrls.push(m.photo_url);
    for (const t of id.testimonials || []) if (t.photo_url) clientPhotoUrls.push(t.photo_url);
    for (const p of id.custom_pages || []) if (Array.isArray(p.photos)) for (const u of p.photos) if (u) clientPhotoUrls.push(u);

    // ========================================================================
    // INTELLIGENT PHOTO SEARCH TERM GENERATION
    // Builds business-specific Unsplash search terms based on the client's
    // actual industry, services, and description — NOT just business_type.
    // ========================================================================
    function getPhotoSearchTerms(client: any, intake: any): string[] {
      const industry = (client?.business_type || client?.industry || "").toLowerCase();
      const services = Array.isArray(intake?.services)
        ? intake.services.map((s: any) => (typeof s === "string" ? s : s?.name || s?.title || "")).join(" ")
        : "";
      const description = [
        intake?.business_description,
        intake?.about_text,
        intake?.story,
        intake?.tagline,
        intake?.hero_subheadline,
      ].filter(Boolean).join(" ");
      const businessName = client?.business_name || "";

      const context = `${industry} ${description} ${services} ${businessName}`.toLowerCase();

      // Keyword → curated search-term lists. Order matters: longer/more specific keys first.
      const photoTerms: Record<string, string[]> = {
        // Agriculture / farm — placed FIRST so "fresh eggs" beats generic "business"
        eggs: ["fresh eggs", "farm eggs", "chicken eggs", "egg farm", "free range eggs"],
        chicken: ["chicken farm", "free range chickens", "backyard chickens", "hens farm"],
        produce: ["fresh produce", "farmers market", "fresh vegetables", "organic produce"],
        dairy: ["dairy farm", "fresh milk", "dairy products", "farm dairy"],
        farm: ["farm fresh", "farming", "agricultural farm", "countryside farm"],
        agriculture: ["agriculture field", "farm fresh", "farming countryside", "harvest"],

        // Trades and contractors
        plumbing: ["plumber working", "pipe repair", "bathroom plumbing", "kitchen sink repair"],
        plumber: ["plumber working", "pipe repair", "bathroom plumbing", "kitchen sink repair"],
        electrical: ["electrician working", "electrical panel", "wiring installation", "electrical contractor"],
        electrician: ["electrician working", "electrical panel", "wiring installation", "electrical contractor"],
        hvac: ["hvac technician", "air conditioning unit", "heating system", "hvac repair"],
        roofing: ["roofer working", "roof repair", "roofing contractor", "roof installation"],
        landscaping: ["landscaping garden", "lawn care", "garden maintenance", "landscaper working"],
        cleaning: ["house cleaning", "professional cleaning", "cleaning service", "clean home"],
        painting: ["house painter", "interior painting", "exterior painting", "painting contractor"],
        construction: ["construction worker", "building construction", "contractor working", "renovation"],
        carpentry: ["carpenter working", "woodworking", "custom carpentry", "wood furniture"],
        flooring: ["flooring installation", "hardwood floors", "tile flooring", "floor installation"],

        // Wellness and beauty
        barbershop: ["barber shop", "barber cutting hair", "barbershop interior", "men haircut"],
        barber: ["barber shop", "barber cutting hair", "barbershop interior", "men haircut"],
        salon: ["hair salon", "hair styling", "hairdresser working", "salon interior"],
        hair: ["hair salon", "hair styling", "hairdresser working", "salon interior"],
        spa: ["spa treatment", "massage therapy", "relaxing spa", "spa interior"],
        nails: ["nail salon", "nail art", "manicure", "nail technician"],
        massage: ["massage therapy", "massage therapist", "relaxing massage", "spa massage"],
        skincare: ["skincare treatment", "facial treatment", "skin care", "esthetician"],
        tattoo: ["tattoo artist", "tattoo studio", "tattoo design", "tattooing"],
        fitness: ["gym workout", "personal trainer", "fitness training", "exercise gym"],
        yoga: ["yoga class", "yoga practice", "yoga studio", "meditation yoga"],

        // Professional services
        lawyer: ["law office", "attorney office", "legal consultation", "professional lawyer"],
        attorney: ["law office", "attorney office", "legal consultation", "professional lawyer"],
        accountant: ["accounting office", "financial planning", "business meeting", "accountant working"],
        accounting: ["accounting office", "financial planning", "business meeting", "accountant working"],
        insurance: ["insurance agent", "insurance office", "business consultation", "professional meeting"],
        realtor: ["real estate agent", "house for sale", "real estate", "home buying"],
        "real estate": ["real estate agent", "house for sale", "real estate", "home buying"],
        consulting: ["business consulting", "professional meeting", "office consultation", "business strategy"],
        marketing: ["digital marketing", "marketing team", "social media marketing", "advertising"],

        // Food and hospitality
        restaurant: ["restaurant interior", "food dining", "restaurant kitchen", "fine dining"],
        cafe: ["coffee shop", "cafe interior", "barista coffee", "cozy cafe"],
        coffee: ["coffee shop", "cafe interior", "barista coffee", "cozy cafe"],
        bakery: ["bakery fresh bread", "pastry baking", "artisan bakery", "bread baking"],
        catering: ["catering food", "catering service", "event catering", "food catering"],
        "food truck": ["food truck", "street food", "mobile food", "food vendor"],

        // Photography and creative
        photography: ["professional photographer", "photography session", "camera photography", "photo studio"],
        photographer: ["professional photographer", "photography session", "camera photography", "photo studio"],
        videography: ["videographer filming", "video production", "filming crew", "video camera"],
        design: ["graphic design", "creative studio", "design work", "creative agency"],

        // Health
        chiropractor: ["chiropractic adjustment", "chiropractor treatment", "back pain treatment", "chiropractic care"],
        dentist: ["dental office", "dentist working", "dental care", "dental treatment"],
        dental: ["dental office", "dentist working", "dental care", "dental treatment"],
        therapy: ["therapy session", "counseling session", "mental health therapy", "therapist office"],
        veterinary: ["veterinarian pet", "animal clinic", "vet working", "pet care"],
        vet: ["veterinarian pet", "animal clinic", "vet working", "pet care"],
        optometry: ["eye exam", "optometrist", "vision care", "eye care"],
      };

      // Find first matching keyword in the context
      for (const [keyword, terms] of Object.entries(photoTerms)) {
        if (context.includes(keyword)) {
          console.log(`[photo-terms] Matched keyword "${keyword}" → ${terms.join(", ")}`);
          return terms;
        }
      }

      // Fallback: extract meaningful words from description
      const words = context
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !["business", "company", "service", "services", "professional", "quality", "local"].includes(w));
      const seed = words.slice(0, 2).join(" ") || "small business professional";
      const fallback = [seed, `${seed} service`, "professional service", "small business"];
      console.log(`[photo-terms] No keyword match — falling back to: ${fallback.join(", ")}`);
      return fallback;
    }

    // Fetch a single Unsplash photo, trying each search term until one returns a result
    async function fetchUnsplashPhoto(
      searchTerms: string[],
      width = 800,
      height = 600
    ): Promise<{ url: string; photographer: string; photographer_url: string; unsplash_url: string; alt: string } | null> {
      const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
      if (!key) {
        console.error("[unsplash] UNSPLASH_ACCESS_KEY not set");
        return null;
      }
      for (const term of searchTerms) {
        try {
          const r = await fetch(
            `https://api.unsplash.com/photos/random?query=${encodeURIComponent(term)}&orientation=landscape`,
            { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } }
          );
          if (r.ok) {
            const p = await r.json();
            console.log(`[unsplash] ✓ "${term}" → ${p.id} by ${p.user?.name}`);
            return {
              url: `${p.urls.raw}&w=${width}&h=${height}&fit=crop&auto=format`,
              photographer: p.user?.name || "Unsplash",
              photographer_url: p.user?.links?.html || "https://unsplash.com",
              unsplash_url: p.links?.html || "https://unsplash.com",
              alt: p.alt_description || term,
            };
          } else {
            console.warn(`[unsplash] ✗ "${term}" → HTTP ${r.status}`);
          }
        } catch (e) {
          console.error(`[unsplash] error for "${term}":`, e);
        }
      }
      return null;
    }

    const photoTerms = getPhotoSearchTerms(clientData, intakeData);
    console.log(`[generate-website] Photo terms for ${clientData?.business_name}:`, photoTerms);

    // Pre-fetch section-specific photos (only when using stock)
    let heroPhoto: any = null;
    let aboutPhoto: any = null;
    let whyUsPhoto: any = null;
    let emergencyBgPhoto: any = null;
    if (usingStockPhotos) {
      [heroPhoto, aboutPhoto, whyUsPhoto, emergencyBgPhoto] = await Promise.all([
        fetchUnsplashPhoto(photoTerms.map((t) => `${t} hero wide`), 1920, 900),
        fetchUnsplashPhoto(photoTerms.map((t) => `${t} team working`), 800, 600),
        fetchUnsplashPhoto(photoTerms.map((t) => `${t} professional`), 600, 700),
        fetchUnsplashPhoto(["dark background texture", "dark professional background", "dark city night"], 1920, 600),
      ]);
    }

    const photoContext = usingStockPhotos
      ? `
STOCK PHOTOS TO USE (already fetched specifically for this business — use these EXACT URLs):
- Hero background: ${heroPhoto?.url || "none — use CSS dark gradient only"}
- About section image: ${aboutPhoto?.url || "none — use placeholder color"}
- Why us section image: ${whyUsPhoto?.url || "none — use placeholder color"}
- Emergency / dark section background: ${emergencyBgPhoto?.url || "none — use dark overlay only"}
`
      : "";

    const photoSection = usingStockPhotos
      ? `

PHOTO HANDLING — STOCK PHOTOGRAPHY:
No client photos were provided. The following stock photos have been pre-fetched from Unsplash specifically for this business — use ONLY these URLs for stock photos. Do not generate, guess, or invent other Unsplash URLs.

${photoContext}

The photos above were searched using terms relevant to this business: ${photoTerms.join(", ")}.

RULES:
- If a photo URL is provided, use it exactly as given.
- If a section says "none", use a CSS background color or gradient instead — never use a broken image URL or invent one.
- For service section icons, use inline SVG icons appropriate to each service name — do not use image URLs for icons.
- For any additional images you need (gallery, testimonial avatars, etc.), use https://source.unsplash.com/[WxH]/?${encodeURIComponent(photoTerms[0])} as a fallback.
- Every image must have a meaningful alt attribute related to this business.`
      : `

PHOTO HANDLING — CLIENT-PROVIDED PHOTOS:
The client uploaded ${clientPhotoUrls.length} photo${clientPhotoUrls.length === 1 ? "" : "s"} stored in our system. Use these real client photos throughout the site:
${clientPhotoUrls.map((u, i) => `- ${i + 1}. ${u}`).join("\n")}

${id.hero_photo_url ? `Hero image (use as the main hero): ${id.hero_photo_url}` : ""}
Place portfolio photos in galleries/services, team photos in about/team sections, location photos in contact sections.
Only use Unsplash stock photos for sections where no client photo was provided. If you need a stock fallback use keywords: ${photoTerms.join(", ")}.`;

    // Fetch call notes via application_id from the client record
    const applicationId = clientData?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase
          .from("call_notes")
          .select("*")
          .eq("application_id", applicationId)
          .maybeSingle()
      : { data: null };

    if (!intakeData && !callNotes) throw new Error("No intake data or call notes found");

    // SNAPSHOT CALL NOTES — preserved even if generation later fails
    if (callNotes) {
      await supabase
        .from("sites")
        .update({ call_notes_snapshot: callNotes } as any)
        .eq("client_id", clientId);
    }

    // Try to fetch template if a template was selected
    let templateHTML = "";
    let templateCSS = "";
    // Map intake template_selected ID -> storage filename slug
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero",
      professional: "professional",
      warm: "warm-welcome",
      local: "local-favorite",
      modern: "modern-business",
    };
    const selectedTemplate =
      (intakeData as any)?.template_selected ||
      (callNotes as any)?.template_selected ||
      (intakeData as any)?.template_id;
    const templateId = selectedTemplate
      ? TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate
      : null;

    if (templateId) {
      try {
        const { data: htmlFile } = await supabase.storage
          .from("templates")
          .download(`${templateId}.html`);
        if (htmlFile) templateHTML = await htmlFile.text();

        const { data: cssFile } = await supabase.storage
          .from("templates")
          .download(`${templateId}.css`);
        if (cssFile) templateCSS = await cssFile.text();
        console.log(`Loaded template: ${templateId} (html: ${!!templateHTML}, css: ${!!templateCSS})`);
      } catch (err) {
        console.log(`No template files found for ${templateId}, generating from scratch`, err);
      }
    }

    // Build the AI prompt
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let prompt: string;

    // Build call notes section for prompt
    const callNotesSection = callNotes ? `

SOURCE 2 — DISCOVERY CALL NOTES (expert observations from our designer who spoke with the client on a call — THIS IS MORE VALUABLE THAN THE INTAKE FORM):
${JSON.stringify({
  their_story: callNotes.their_story,
  ideal_customer: callNotes.ideal_customer,
  inspiration_sites: callNotes.inspiration_sites,
  instagram_handle: callNotes.instagram_handle,
  google_search_terms: callNotes.google_search_terms,
  website_goal: callNotes.website_goal,
  contact_preferences: callNotes.contact_preferences,
  booking_url: callNotes.booking_url,
  pages_agreed: callNotes.pages_agreed,
  template_selected: callNotes.template_selected,
  color_direction: callNotes.color_direction,
  vibe_notes: callNotes.vibe_notes,
  tone_of_voice: callNotes.tone_of_voice,
  tone_custom: callNotes.tone_custom,
  expert_additions: callNotes.expert_additions,
  expert_avoid: callNotes.expert_avoid,
  exact_phrases: callNotes.exact_phrases,
  final_notes: callNotes.final_notes,
}, null, 2)}

CRITICAL INSTRUCTIONS FOR CALL NOTES:
- The call notes from our designer carry MORE WEIGHT than the client's self-reported intake form
- Pay special attention to expert_additions — include ALL elements the designer requested
- Pay special attention to expert_avoid — these are things you must NOT do
- Use exact_phrases — weave these exact words naturally into headlines and copy
- website_goal determines the entire hierarchy and structure — build around this goal
- pages_agreed overrides the client's page selection — build exactly these pages
- Match tone_of_voice exactly — this is how they actually communicate` : `

No discovery call notes available — use intake form data only.`;

    const brandingInstructions = `
BRANDING INSTRUCTIONS:
- PRIMARY_COLOR: Use the client's brand color from their intake form or call notes. If none provided, choose a color appropriate for their industry — trades: deep red or navy, wellness: sage green or blush, professional: navy or charcoal, food: warm orange or terracotta
- ACCENT_COLOR: Choose a complementary accent. If primary is dark use a warm gold or bright contrasting color. If primary is light use a deep complementary tone.
- DARK_COLOR: Default to #0d1d3b unless client has a specific dark brand color
- FONT_HEADING: Choose from these Google Fonts based on their brand personality — bold/trades: Oswald or Bebas Neue, professional: Montserrat or Raleway, warm/friendly: Nunito or Poppins, luxury: Cormorant or Playfair Display
- FONT_BODY: Always pair with Open Sans, Inter, or Lato for readability
`;

    const missingDataInstructions = `
MISSING DATA INSTRUCTIONS — handle gracefully, never leave a placeholder visible:

If HERO_BADGE is missing: use "TRUSTED LOCAL EXPERTS" or "SERVING [CITY] SINCE [YEAR]"
If HERO_HEADLINE_LINE2 or LINE3 is missing: restructure the headline to work on 1-2 lines without gaps
If ABOUT_IMAGE_URL is missing: use a relevant Unsplash image for their industry
If WHY_US_IMAGE_URL is missing: use a relevant Unsplash image
If EMERGENCY_BG_URL is missing: use a dark overlay without background image — it still looks great
If GOOGLE_RATING is missing: remove the rating display entirely rather than showing empty stars
If GOOGLE_REVIEW_COUNT is missing: remove the review count
If MAP_EMBED_URL is missing: replace the map section with a styled text list of service areas only
If SHOW_COUPONS is false or missing: remove the entire coupons section
If SHOW_FINANCING is false or missing: remove the financing banner
If SHOW_AWARDS is false or missing: remove the awards section
If FAQ_ITEMS has fewer than 3 items: generate 3 relevant FAQs based on their industry and services
If TESTIMONIALS has fewer than 3: generate 2-3 realistic sounding testimonials based on their services and location — use realistic first names and neighborhood names from their city
If SERVICE_AREA_LOCATIONS is empty: use the client's city and 6-8 nearby suburbs based on their location
If FOOTER_NEWSLETTER_TEXT is missing: use "Monthly tips and exclusive deals for [city] homeowners"
If COPYRIGHT_YEAR is missing: use the current year
If INSTAGRAM_URL or FACEBOOK_URL are missing: remove those social links rather than showing broken links

For any placeholder that has no data and no sensible default — remove that element entirely. Never show a visible placeholder, empty bracket, or broken section to the end user. The site must look complete and intentional even with minimal data.
`;

    if (templateHTML) {
      prompt = `You are a professional web developer building a website for a small business client.

You have two sources of information:

SOURCE 1 — CLIENT INTAKE FORM (what the client told us directly):
${JSON.stringify(intakeData, null, 2)}
${callNotesSection}
${photoSection}

Here is the HTML template with placeholders in double curly braces:
${templateHTML}

Here is the CSS template with color variables as placeholders:
${templateCSS}
${brandingInstructions}
${missingDataInstructions}

Your instructions:
1. Replace every {{PLACEHOLDER}} with the corresponding client data
2. For repeatable sections marked {{#SECTION}} and {{/SECTION}} generate one block per item in the data array
3. If any placeholder has no data use a professional sensible default appropriate for their business type — follow the MISSING DATA INSTRUCTIONS above precisely
4. Generate compelling professional copy for headlines and descriptions based on their business answers
5. Make all phone numbers click-to-call links
6. Make all email addresses mailto links
7. Make all social media links open in a new tab
8. Make sure the site is fully responsive and mobile perfect
9. Do not change any layout structure or design elements — only replace content and colors
10. Output format — return EITHER:
    (a) raw HTML starting with <!DOCTYPE html> with the CSS inlined in a <style> tag in the head, OR
    (b) a single JSON object with exactly two fields "html" and "css"

CRITICAL OUTPUT INSTRUCTIONS:
- Return ONLY the response — no explanation, no commentary, no markdown code fences
- Do NOT wrap the response in \`\`\`html or \`\`\`json fences
- The very first character of your response must be either < (for HTML) or { (for JSON)
- Never include any text before or after the HTML/JSON`;
    } else {
      prompt = `You are a professional web designer building a website for a small business client.

You have two sources of information:

SOURCE 1 — CLIENT INTAKE FORM (what the client told us directly):
${JSON.stringify(intakeData, null, 2)}

Business name: ${clientData?.business_name || "Business"}
Business type: ${clientData?.business_type || "Service Business"}
${callNotesSection}
${photoSection}
${brandingInstructions}
${missingDataInstructions}

Your instructions:
1. Create a complete, production-ready single-page website with HTML and CSS
2. Include sections: Hero with CTA, About/Story, Services, Testimonials (if provided), Contact, Footer
3. Use their brand colors, fonts, and style preferences from the intake data — apply the BRANDING INSTRUCTIONS above for any missing color or font choices
4. Generate compelling professional copy for all sections based on their business answers
5. Make all phone numbers click-to-call links
6. Make all email addresses mailto links
7. Make all social media links open in a new tab
8. The site MUST be fully responsive and mobile-first
9. Use modern CSS (flexbox, grid, custom properties)
10. Include smooth scroll behavior and clean typography
11. Follow the MISSING DATA INSTRUCTIONS above — never show empty placeholders or broken sections
12. Output format — return EITHER:
    (a) raw HTML starting with <!DOCTYPE html> with all CSS inlined in a <style> tag in the head, OR
    (b) a single JSON object with exactly two fields "html" and "css"

CRITICAL OUTPUT INSTRUCTIONS:
- Return ONLY the response — no explanation, no commentary, no markdown code fences
- Do NOT wrap the response in \`\`\`html or \`\`\`json fences
- The very first character of your response must be either < (for HTML) or { (for JSON)
- Never include any text before or after the HTML/JSON`;
    }

    // ====================================================================
    // TWO-CALL GENERATION — splits the build in half so the HTML never
    // gets cut off by the model's max output token limit. Call 1 produces
    // the top half (DOCTYPE → end of services); Call 2 continues from
    // reviews → </html>. Halves are then concatenated.
    // ====================================================================

    const AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
    const AI_MODEL = "google/gemini-2.5-pro";

    async function callAI(userContent: string, label: string): Promise<{ text: string; outputTokens: number }> {
      const MAX_AI_ATTEMPTS = 2;
      let attempt = 0;
      let lastErr: Error | null = null;

      while (attempt < MAX_AI_ATTEMPTS) {
        attempt++;
        try {
          const r = await fetch(AI_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: AI_MODEL,
              max_tokens: 16000,
              messages: [{ role: "user", content: userContent }],
            }),
          });

          if (!r.ok) {
            const errText = await r.text();
            console.error(`[${label}] AI API error (attempt ${attempt}/${MAX_AI_ATTEMPTS}):`, r.status, errText);
            if ((r.status === 429 || r.status === 529) && attempt < MAX_AI_ATTEMPTS) {
              await new Promise((res) => setTimeout(res, 3000 * attempt));
              continue;
            }
            throw new Error(`AI generation failed (${label}): ${r.status}`);
          }

          const data = await r.json();
          const text = data.choices?.[0]?.message?.content || "";
          const outputTokens = data.usage?.completion_tokens || data.usage?.output_tokens || 0;
          return { text, outputTokens };
        } catch (err) {
          lastErr = err as Error;
          console.error(`[${label}] AI fetch error (attempt ${attempt}/${MAX_AI_ATTEMPTS}):`, err);
          if (attempt < MAX_AI_ATTEMPTS) {
            await new Promise((res) => setTimeout(res, 2000));
            continue;
          }
          throw lastErr;
        }
      }
      throw lastErr || new Error(`AI call failed: ${label}`);
    }

    function stripMarkdown(s: string): string {
      return s
        .replace(/^```(?:html|json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
    }

    // Shared context block reused in both calls
    const sharedContext = `BUSINESS CONTEXT:
Business name: ${clientData?.business_name || "Business"}
Business type: ${clientData?.business_type || "Service Business"}

SOURCE 1 — CLIENT INTAKE FORM:
${JSON.stringify(intakeData, null, 2)}
${callNotesSection}
${photoSection}
${brandingInstructions}
${missingDataInstructions}
${templateHTML ? `\nHTML TEMPLATE (replace placeholders):\n${templateHTML}\n` : ""}${templateCSS ? `\nCSS TEMPLATE (inline this in <style>):\n${templateCSS}\n` : ""}`;

    // ---------- CALL 1: top half ----------
    const call1Prompt = `You are a professional web developer building a website for a small business client.

${sharedContext}

INSTRUCTIONS — FIRST HALF:
Generate the FIRST HALF of this website.
Start with <!DOCTYPE html> and include everything through the end of the services section.
Stop at a clean closing </section> tag after services.
Do NOT close </body> or </html> yet — the second half will continue from here.
Replace all {{PLACEHOLDERS}} with real client data.
ALL CSS must be inlined in a <style> tag in the <head>. Do not reference any external stylesheet files.
Make all phone numbers click-to-call links and email addresses mailto links.
The site must be fully responsive and mobile-perfect.

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML — no markdown, no code blocks, no explanation.
Do NOT wrap the response in \`\`\`html fences.
The very first character of your response must be < and start with <!DOCTYPE html>.`;

    console.log("[generate-website] Call 1 — generating top half…");
    const call1 = await callAI(call1Prompt, "call-1-top");
    let firstHalf = stripMarkdown(call1.text);

    if (!firstHalf.includes("<!DOCTYPE html>")) {
      throw new Error(`Call 1 did not return valid HTML. Response started with: ${firstHalf.substring(0, 200)}`);
    }

    // ---------- CALL 2: bottom half ----------
    const call2Prompt = `You are a professional web developer continuing to build a website for a small business client.

${sharedContext}

Here is the FIRST HALF of the site already generated (for context — do NOT repeat any of it):
${firstHalf}

INSTRUCTIONS — SECOND HALF:
Generate the SECOND HALF of this website continuing exactly where the first half left off.
Start directly with the reviews/testimonials section — do NOT repeat <!DOCTYPE html>, <head>, or any CSS.
Include all remaining sections: reviews/testimonials, emergency CTA (if applicable), why us, financing (if applicable), service areas, FAQ, final CTA, footer.
End with the closing </body> and </html> tags.
Replace all {{PLACEHOLDERS}} with real client data.
Make all phone numbers click-to-call links and email addresses mailto links.

Include the SiteQueen analytics script just before </body>:

<script>
(function(){
  var CID='${clientId}';
  var EP='${supabaseUrl}/functions/v1/track-event';
  function dt(){return /Mobile|Android|iPhone/i.test(navigator.userAgent)?'mobile':'desktop'}
  function sid(){var s=sessionStorage.getItem('sq_sid');if(!s){s=Math.random().toString(36).substr(2,9);sessionStorage.setItem('sq_sid',s)}return s}
  function t(e,m){fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CID,event_type:e,page_path:location.pathname,page_title:document.title,referrer:document.referrer,device_type:dt(),session_id:sid(),metadata:m||{}})}).catch(function(){})}
  t('page_view');
  document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;if(a.href&&a.href.indexOf('tel:')===0)t('phone_click');if(a.href&&a.href.indexOf('mailto:')===0)t('email_click');if(a.classList.contains('cta-button'))t('cta_click',{text:a.textContent.trim().substring(0,50)})});
  document.addEventListener('submit',function(){t('form_submission')});
})();
</script>

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML — no markdown, no code blocks, no explanation.
Do NOT wrap the response in \`\`\`html fences.
The very first character must be a HTML tag continuing from the reviews section.
End with </html> as the absolute last thing.`;

    console.log("[generate-website] Call 2 — generating bottom half…");
    const call2 = await callAI(call2Prompt, "call-2-bottom");
    let secondHalf = stripMarkdown(call2.text);

    // Join the two halves
    let finalHTML = firstHalf + "\n" + secondHalf;

    // Validate the complete site
    if (!finalHTML.includes("</html>")) {
      throw new Error("Site generation incomplete — second half did not close properly. Check token limits.");
    }
    if (!finalHTML.includes("</body>")) {
      throw new Error("Site generation incomplete — missing closing body tag.");
    }

    // Track totals for logs
    const totalOutputTokens = (call1.outputTokens || 0) + (call2.outputTokens || 0);
    const generationNotes = `Call 1: ${call1.outputTokens} output tokens. Call 2: ${call2.outputTokens} output tokens. Model: ${AI_MODEL}.`;

    // Set rawText for any downstream error context
    rawText = finalHTML;

    // Remove any external stylesheet link to styles.css (defensive — CSS must be inlined)
    finalHTML = finalHTML.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/gi, "");

    // Inject analytics tracking script before </body>
    const trackingScript = `
<!-- SiteQueen Analytics -->
<script>
(function(){
  var CID='${clientId}';
  var EP='${supabaseUrl}/functions/v1/track-event';
  function dt(){return /Mobile|Android|iPhone/i.test(navigator.userAgent)?'mobile':'desktop'}
  function sid(){var s=sessionStorage.getItem('sq_sid');if(!s){s=Math.random().toString(36).substr(2,9);sessionStorage.setItem('sq_sid',s)}return s}
  function t(e,m){fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CID,event_type:e,page_path:location.pathname,page_title:document.title,referrer:document.referrer,device_type:dt(),session_id:sid(),metadata:m||{}})}).catch(function(){})}
  t('page_view');
  document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;if(a.href&&a.href.indexOf('tel:')===0)t('phone_click',{phone:a.href});if(a.href&&a.href.indexOf('mailto:')===0)t('email_click',{email:a.href});if(a.classList.contains('cta-button')||a.classList.contains('btn-primary'))t('cta_click',{text:a.textContent.trim()})});
  document.addEventListener('submit',function(e){t('form_submission',{form_id:e.target.id||'contact-form'})});
})();
</script>`;
    if (finalHTML.includes("</body>")) {
      finalHTML = finalHTML.replace("</body>", `${trackingScript}\n</body>`);
    } else {
      finalHTML += trackingScript;
    }

    // Append Unsplash photo credit comment (license compliance)
    if (usingStockPhotos && (heroPhoto || aboutPhoto || whyUsPhoto || emergencyBgPhoto)) {
      const credits = `
<!-- Photo credits (Unsplash):
${heroPhoto ? `  Hero: ${heroPhoto.photographer} on Unsplash (${heroPhoto.unsplash_url})\n` : ""}${aboutPhoto ? `  About: ${aboutPhoto.photographer} on Unsplash (${aboutPhoto.unsplash_url})\n` : ""}${whyUsPhoto ? `  Why us: ${whyUsPhoto.photographer} on Unsplash (${whyUsPhoto.unsplash_url})\n` : ""}${emergencyBgPhoto ? `  Emergency bg: ${emergencyBgPhoto.photographer} on Unsplash (${emergencyBgPhoto.unsplash_url})\n` : ""}  Search terms used: ${photoTerms.join(", ")}
-->`;
      finalHTML += credits;
    }

    // Store generated HTML in Supabase storage
    const htmlBlob = new Blob([finalHTML], { type: "text/html" });
    await supabase.storage
      .from("generated-sites")
      .upload(`${clientId}/index.html`, htmlBlob, { upsert: true });

    // Get public staging URL
    const { data: stagingURLData } = supabase.storage
      .from("generated-sites")
      .getPublicUrl(`${clientId}/index.html`);

    const stagingURL = stagingURLData.publicUrl;

    // Update sites table
    await supabase
      .from("sites")
      .update({
        generation_status: "complete",
        generated_at: new Date().toISOString(),
        staging_url: stagingURL,
      })
      .eq("client_id", clientId);

    // Create operator notification
    await supabase.from("notifications").insert({
      type: "site_ready_for_review",
      client_id: clientId,
      message: `${clientData?.business_name || "Client"} website is ready for your review`,
      staging_url: stagingURL,
      target_role: "operator",
    });

    // Log generation
    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: templateId || "scratch",
      status: "complete",
      tokens_used: aiData.usage?.total_tokens || null,
    });

    return new Response(JSON.stringify({ success: true, staging_url: stagingURL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-website error:", {
      error: error.message,
      stack: error.stack,
      client_id: clientId,
      response_preview: rawText ? rawText.substring(0, 500) : null,
    });

    if (clientId) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        await supabase
          .from("sites")
          .update({
            generation_status: "failed",
            generation_error: error.message,
          })
          .eq("client_id", clientId);

        await supabase.from("notifications").insert({
          type: "site_generation_failed",
          client_id: clientId,
          message: `Site generation failed — manual review needed`,
          target_role: "operator",
        });

        await supabase.from("generation_logs").insert({
          client_id: clientId,
          status: "failed",
          error_message: error.message,
        });

        // Send operator failure email
        try {
          const { data: failedSite } = await supabase
            .from("sites")
            .select("generation_attempts")
            .eq("client_id", clientId)
            .maybeSingle();
          const { data: failedClient } = await supabase
            .from("clients")
            .select("business_name, user_id")
            .eq("id", clientId)
            .maybeSingle();
          let clientName = "Unknown";
          if ((failedClient as any)?.user_id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("user_id", (failedClient as any).user_id)
              .maybeSingle();
            clientName = (prof as any)?.full_name || (prof as any)?.email || "Unknown";
          }

          await supabase.functions.invoke("send-email", {
            body: {
              to: "hello@sitequeen.ai",
              template: "operator_generation_failed",
              data: {
                business_name: (failedClient as any)?.business_name || "Unknown business",
                client_name: clientName,
                client_id: clientId,
                attempts: (failedSite as any)?.generation_attempts || 1,
                error_message: error.message,
              },
              clientId,
            },
          });
        } catch (emailErr) {
          console.error("Failed to send operator failure email:", emailErr);
        }
      } catch (e) {
        console.error("Failed to update failure status:", e);
      }
    }

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
