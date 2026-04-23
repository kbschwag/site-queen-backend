import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let clientId = "";
  try {
    const body = await req.json();
    clientId = body.client_id;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: corsHeaders });
  }
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
  }

  try {
    // ── Bump attempt counter + status ────────────────────────────────────
    const { data: existingSite } = await supabase
      .from("sites")
      .select("generation_attempts")
      .eq("client_id", clientId)
      .maybeSingle();

    await supabase
      .from("sites")
      .update({
        generation_status: "generating",
        generation_progress: "fetching_data",
        generation_attempts: ((existingSite as any)?.generation_attempts || 0) + 1,
        last_generation_attempt_at: new Date().toISOString(),
      } as any)
      .eq("client_id", clientId);

    // ── Fetch site + client + call notes ────────────────────────────────
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

    // Snapshot intake immediately
    await supabase
      .from("sites")
      .update({
        intake_snapshot: intakeData,
        intake_snapshot_saved_at: new Date().toISOString(),
      } as any)
      .eq("client_id", clientId);

    // Call notes via application_id
    const applicationId = clientData?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };
    if (!intakeData && !callNotes) throw new Error("No intake data or call notes found");
    if (callNotes) {
      await supabase.from("sites").update({ call_notes_snapshot: callNotes } as any).eq("client_id", clientId);
    }

    // ── Photo handling (Unsplash) ───────────────────────────────────────
    const usingStockPhotos = !!(siteData as any).using_stock_photos;
    const id: any = intakeData || {};
    const clientPhotoUrls: string[] = [];
    if (id.hero_photo_url) clientPhotoUrls.push(id.hero_photo_url);
    if (id.owner_photo_url) clientPhotoUrls.push(id.owner_photo_url);
    for (const arr of [id.portfolio_photos, id.team_photos, id.location_photos, id.extra_photos, id.award_logos]) {
      if (Array.isArray(arr)) for (const u of arr) if (u) clientPhotoUrls.push(u);
    }
    for (const s of id.services || []) if (s.photo_url) clientPhotoUrls.push(s.photo_url);
    for (const m of id.team_members || []) if (m.photo_url) clientPhotoUrls.push(m.photo_url);
    for (const t of id.testimonials || []) if (t.photo_url) clientPhotoUrls.push(t.photo_url);
    for (const p of id.custom_pages || []) if (Array.isArray(p.photos)) for (const u of p.photos) if (u) clientPhotoUrls.push(u);

    const photoTerms = getPhotoSearchTerms(clientData, intakeData);

    let heroPhoto: any = null, aboutPhoto: any = null, whyUsPhoto: any = null, emergencyBgPhoto: any = null;
    if (usingStockPhotos) {
      [heroPhoto, aboutPhoto, whyUsPhoto, emergencyBgPhoto] = await Promise.all([
        fetchUnsplashPhoto(photoTerms.map((t) => `${t} hero wide`), 1920, 900),
        fetchUnsplashPhoto(photoTerms.map((t) => `${t} team working`), 800, 600),
        fetchUnsplashPhoto(photoTerms.map((t) => `${t} professional`), 600, 700),
        fetchUnsplashPhoto(["dark background texture", "dark professional background", "dark city night"], 1920, 600),
      ]);
    }

    const photoSection = buildPhotoSection(usingStockPhotos, clientPhotoUrls, photoTerms, id, heroPhoto, aboutPhoto, whyUsPhoto, emergencyBgPhoto);

    // ── Template loading ────────────────────────────────────────────────
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero", professional: "professional", warm: "warm-welcome",
      local: "local-favorite", modern: "modern-business",
    };
    const selectedTemplate = (intakeData as any)?.template_selected || (callNotes as any)?.template_selected || (intakeData as any)?.template_id;
    const templateId = selectedTemplate ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate) : null;

    let templateHTML = "", templateCSS = "";
    if (templateId) {
      try {
        const { data: htmlFile } = await supabase.storage.from("templates").download(`${templateId}.html`);
        if (htmlFile) templateHTML = await htmlFile.text();
        const { data: cssFile } = await supabase.storage.from("templates").download(`${templateId}.css`);
        if (cssFile) templateCSS = await cssFile.text();
      } catch (err) {
        console.log(`No template files for ${templateId}`, err);
      }
    }

    // ── Build prompt context ────────────────────────────────────────────
    const callNotesSection = buildCallNotesSection(callNotes);
    const brandingInstructions = BRANDING_INSTRUCTIONS;
    const missingDataInstructions = MISSING_DATA_INSTRUCTIONS;

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

    // ── Update progress, then CALL 1 ────────────────────────────────────
    await supabase.from("sites").update({ generation_progress: "building_first_half" } as any).eq("client_id", clientId);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const call1Prompt = `You are a professional web developer building a website for a small business client.

${sharedContext}

INSTRUCTIONS — FIRST HALF:
Generate the FIRST HALF of this website.
Start with <!DOCTYPE html> and include the full <head> with ALL CSS inlined in a <style> tag.
That CSS must cover the ENTIRE site, not just the first half — include styles for all sections that will appear later too, including emergency CTA, why us, reviews, financing, service areas, FAQ, final CTA, and footer.
ALSO include CSS for shared layout elements that will be reused on inner pages (about, services, contact): .page-hero / breadcrumb, .content-section, .sidebar, .coupon-card, .feature-list, .service-card, .pricing-card, .accordion. Inner pages will reuse this exact CSS — design it generously so a separate About / Services / Contact page can render with no extra <style>.
Include these sections in order: topbar, header, mobile nav, hero, trust bar, credentials, about, stats, services.
Stop after the closing </section> tag of the services section.
Do NOT close </body> or </html> yet — the second half continues from here.
Replace all {{PLACEHOLDERS}} with real client data.
For any missing data use a professional relevant default — never leave a placeholder visible.
All CSS must be inlined in a <style> tag in the <head> — do not reference any external stylesheet.
Make all phone numbers click-to-call links and email addresses mailto links.
IMPORTANT — multi-page navigation: this site will be multi-page. In the desktop nav AND the mobile nav, the links must point to real files: Home → "./index.html" (or "#"), About → "./about.html", Services → "./services.html", Contact → "./contact.html". If the call notes list additional pages, link those too (e.g. "./gallery.html"). Anchors like #about are fine ONLY for sections that exist on the homepage.
The site must be fully responsive and mobile-perfect.

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML — no markdown, no code blocks, no explanation.
Do NOT wrap the response in \`\`\`html fences.
The very first character must be < and start with <!DOCTYPE html>.`;

    console.log("[part1] Calling Claude for top half…");
    const call1 = await callAI(ANTHROPIC_API_KEY, call1Prompt, "call-1-top");
    let firstHalf = stripMarkdown(call1.text);
    if (!firstHalf.includes("<!DOCTYPE html>")) {
      throw new Error(`Call 1 did not return valid HTML. Started with: ${firstHalf.substring(0, 200)}`);
    }

    // ── Save first half + sidecar context for part2 ─────────────────────
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/part1.html`,
      new Blob([firstHalf], { type: "text/html" }),
      { upsert: true }
    );

    const part2Context = {
      sharedContext,
      photoTerms,
      usingStockPhotos,
      photos: { heroPhoto, aboutPhoto, whyUsPhoto, emergencyBgPhoto },
      businessName: clientData?.business_name || "Client",
      templateId: templateId || "scratch",
      call1OutputTokens: call1.outputTokens,
    };
    await supabase.storage.from("generated-sites").upload(
      `${clientId}/part2-context.json`,
      new Blob([JSON.stringify(part2Context)], { type: "application/json" }),
      { upsert: true }
    );

    await supabase.from("sites").update({ generation_progress: "first_half_complete" } as any).eq("client_id", clientId);

    // ── Fire part2 ──────────────────────────────────────────────────────
    fetch(`${supabaseUrl}/functions/v1/generate-website-part2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ client_id: clientId }),
    }).catch((e) => console.error("[part1] Failed to dispatch part2:", e));

    return new Response(
      JSON.stringify({ success: true, status: "part1_complete" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[part1] error:", error);
    await markFailed(supabase, clientId, `Part 1 failed: ${error.message}`);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const MAX_ATTEMPTS = 2;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 16000,
          messages: [{ role: "user", content }],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        console.error(`[${label}] Claude error ${r.status}:`, errText);
        if ((r.status === 429 || r.status === 529 || r.status === 529) && attempt < MAX_ATTEMPTS) {
          await new Promise((res) => setTimeout(res, 3000 * attempt));
          continue;
        }
        throw new Error(`Claude ${label} failed: ${r.status} — ${errText.substring(0, 300)}`);
      }
      const data = await r.json();
      const text = Array.isArray(data.content)
        ? data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        : "";
      return {
        text,
        outputTokens: data.usage?.output_tokens || 0,
      };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 2000));
    }
  }
  throw lastErr || new Error(`Claude failed: ${label}`);
}

function stripMarkdown(s: string): string {
  return s.replace(/^```(?:html|json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

async function markFailed(supabase: any, clientId: string, message: string) {
  if (!clientId) return;
  try {
    await supabase
      .from("sites")
      .update({ generation_status: "failed", generation_error: message })
      .eq("client_id", clientId);
    await supabase.from("generation_logs").insert({
      client_id: clientId, status: "failed", error_message: message,
    });
  } catch (e) {
    console.error("[part1] failed to mark failure:", e);
  }
}

function getPhotoSearchTerms(client: any, intake: any): string[] {
  const industry = (client?.business_type || client?.industry || "").toLowerCase();
  const services = Array.isArray(intake?.services)
    ? intake.services.map((s: any) => (typeof s === "string" ? s : s?.name || s?.title || "")).join(" ")
    : "";
  const description = [intake?.business_description, intake?.about_text, intake?.story, intake?.tagline, intake?.hero_subheadline].filter(Boolean).join(" ");
  const businessName = client?.business_name || "";
  const context = `${industry} ${description} ${services} ${businessName}`.toLowerCase();

  const photoTerms: Record<string, string[]> = {
    eggs: ["fresh eggs", "farm eggs", "chicken eggs", "egg farm", "free range eggs"],
    chicken: ["chicken farm", "free range chickens", "backyard chickens", "hens farm"],
    produce: ["fresh produce", "farmers market", "fresh vegetables", "organic produce"],
    dairy: ["dairy farm", "fresh milk", "dairy products", "farm dairy"],
    farm: ["farm fresh", "farming", "agricultural farm", "countryside farm"],
    agriculture: ["agriculture field", "farm fresh", "farming countryside", "harvest"],
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
    lawyer: ["law office", "attorney office", "legal consultation", "professional lawyer"],
    attorney: ["law office", "attorney office", "legal consultation", "professional lawyer"],
    accountant: ["accounting office", "financial planning", "business meeting", "accountant working"],
    accounting: ["accounting office", "financial planning", "business meeting", "accountant working"],
    insurance: ["insurance agent", "insurance office", "business consultation", "professional meeting"],
    realtor: ["real estate agent", "house for sale", "real estate", "home buying"],
    "real estate": ["real estate agent", "house for sale", "real estate", "home buying"],
    consulting: ["business consulting", "professional meeting", "office consultation", "business strategy"],
    marketing: ["digital marketing", "marketing team", "social media marketing", "advertising"],
    restaurant: ["restaurant interior", "food dining", "restaurant kitchen", "fine dining"],
    cafe: ["coffee shop", "cafe interior", "barista coffee", "cozy cafe"],
    coffee: ["coffee shop", "cafe interior", "barista coffee", "cozy cafe"],
    bakery: ["bakery fresh bread", "pastry baking", "artisan bakery", "bread baking"],
    catering: ["catering food", "catering service", "event catering", "food catering"],
    "food truck": ["food truck", "street food", "mobile food", "food vendor"],
    photography: ["professional photographer", "photography session", "camera photography", "photo studio"],
    photographer: ["professional photographer", "photography session", "camera photography", "photo studio"],
    videography: ["videographer filming", "video production", "filming crew", "video camera"],
    design: ["graphic design", "creative studio", "design work", "creative agency"],
    chiropractor: ["chiropractic adjustment", "chiropractor treatment", "back pain treatment", "chiropractic care"],
    dentist: ["dental office", "dentist working", "dental care", "dental treatment"],
    dental: ["dental office", "dentist working", "dental care", "dental treatment"],
    therapy: ["therapy session", "counseling session", "mental health therapy", "therapist office"],
    veterinary: ["veterinarian pet", "animal clinic", "vet working", "pet care"],
    vet: ["veterinarian pet", "animal clinic", "vet working", "pet care"],
    optometry: ["eye exam", "optometrist", "vision care", "eye care"],
  };

  for (const [keyword, terms] of Object.entries(photoTerms)) {
    if (context.includes(keyword)) return terms;
  }
  const words = context.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(
    (w) => w.length > 4 && !["business", "company", "service", "services", "professional", "quality", "local"].includes(w)
  );
  const seed = words.slice(0, 2).join(" ") || "small business professional";
  return [seed, `${seed} service`, "professional service", "small business"];
}

async function fetchUnsplashPhoto(searchTerms: string[], width = 800, height = 600) {
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return null;
  for (const term of searchTerms) {
    try {
      const r = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(term)}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } }
      );
      if (r.ok) {
        const p = await r.json();
        return {
          url: `${p.urls.raw}&w=${width}&h=${height}&fit=crop&auto=format`,
          photographer: p.user?.name || "Unsplash",
          photographer_url: p.user?.links?.html || "https://unsplash.com",
          unsplash_url: p.links?.html || "https://unsplash.com",
          alt: p.alt_description || term,
        };
      }
    } catch (e) {
      console.error(`[unsplash] error for "${term}":`, e);
    }
  }
  return null;
}

function buildPhotoSection(
  usingStock: boolean, clientPhotoUrls: string[], photoTerms: string[], id: any,
  hero: any, about: any, whyUs: any, emergency: any
): string {
  if (usingStock) {
    return `

PHOTO HANDLING — STOCK PHOTOGRAPHY:
Pre-fetched stock photos to use (these EXACT URLs only):
- Hero background: ${hero?.url || "none — use CSS dark gradient only"}
- About section image: ${about?.url || "none — use placeholder color"}
- Why us section image: ${whyUs?.url || "none — use placeholder color"}
- Emergency / dark section background: ${emergency?.url || "none — use dark overlay only"}

Search terms used: ${photoTerms.join(", ")}.

RULES:
- Use the URLs above exactly as given. If "none" — use a CSS background color or gradient instead.
- For service icons use inline SVG, never image URLs.
- For extra images use https://source.unsplash.com/[WxH]/?${encodeURIComponent(photoTerms[0])} as a fallback.
- Every image must have a meaningful alt attribute.`;
  }
  return `

PHOTO HANDLING — CLIENT-PROVIDED PHOTOS:
The client uploaded ${clientPhotoUrls.length} photo${clientPhotoUrls.length === 1 ? "" : "s"}. Use these throughout:
${clientPhotoUrls.map((u, i) => `- ${i + 1}. ${u}`).join("\n")}

${id.hero_photo_url ? `Hero image: ${id.hero_photo_url}` : ""}
Place portfolio in galleries, team in about, location in contact. Stock fallback keywords: ${photoTerms.join(", ")}.`;
}

function buildCallNotesSection(callNotes: any): string {
  if (!callNotes) return `\n\nNo discovery call notes available — use intake form data only.`;
  return `

SOURCE 2 — DISCOVERY CALL NOTES (expert observations — MORE VALUABLE THAN INTAKE):
${JSON.stringify({
  their_story: callNotes.their_story, ideal_customer: callNotes.ideal_customer,
  inspiration_sites: callNotes.inspiration_sites, instagram_handle: callNotes.instagram_handle,
  google_search_terms: callNotes.google_search_terms, website_goal: callNotes.website_goal,
  contact_preferences: callNotes.contact_preferences, booking_url: callNotes.booking_url,
  pages_agreed: callNotes.pages_agreed, template_selected: callNotes.template_selected,
  color_direction: callNotes.color_direction, vibe_notes: callNotes.vibe_notes,
  tone_of_voice: callNotes.tone_of_voice, tone_custom: callNotes.tone_custom,
  expert_additions: callNotes.expert_additions, expert_avoid: callNotes.expert_avoid,
  exact_phrases: callNotes.exact_phrases, final_notes: callNotes.final_notes,
}, null, 2)}

CRITICAL: Call notes outweigh intake form. Honor expert_additions, expert_avoid, exact_phrases, website_goal, pages_agreed, tone_of_voice exactly.`;
}

const BRANDING_INSTRUCTIONS = `
BRANDING INSTRUCTIONS:
- PRIMARY_COLOR: Client's brand color or industry-appropriate (trades: deep red/navy, wellness: sage/blush, professional: navy/charcoal, food: warm orange/terracotta).
- ACCENT_COLOR: Complementary accent.
- DARK_COLOR: Default #0d1d3b.
- FONT_HEADING: Oswald/Bebas Neue for trades, Montserrat/Raleway for professional, Nunito/Poppins for warm, Cormorant/Playfair for luxury.
- FONT_BODY: Open Sans, Inter, or Lato.
`;

const MISSING_DATA_INSTRUCTIONS = `
MISSING DATA — handle gracefully, never show placeholders:
- HERO_BADGE missing → use "TRUSTED LOCAL EXPERTS" or "SERVING [CITY] SINCE [YEAR]"
- HERO_HEADLINE_LINE2/3 missing → restructure to 1-2 lines without gaps
- ABOUT_IMAGE_URL/WHY_US_IMAGE_URL missing → use relevant Unsplash image
- EMERGENCY_BG_URL missing → dark overlay only
- GOOGLE_RATING/REVIEW_COUNT missing → remove rating display
- MAP_EMBED_URL missing → styled text list of service areas
- SHOW_COUPONS/FINANCING/AWARDS false → remove section entirely
- FAQ_ITEMS < 3 → generate 3 relevant FAQs
- TESTIMONIALS < 3 → generate 2-3 realistic ones with local names
- SERVICE_AREA_LOCATIONS empty → use city + 6-8 nearby suburbs
- COPYRIGHT_YEAR missing → current year
- INSTAGRAM_URL/FACEBOOK_URL missing → remove links

For any placeholder with no data and no sensible default — remove the element. Site must look complete.
`;
