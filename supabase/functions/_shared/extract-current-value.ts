// Shared helper: find the current value of a data field for a client.
// Tries intake first, falls back to Claude reading deployed HTML.

interface ExtractionContext {
  field: string;
  intake: any;
  deployedHtml: Record<string, string>;
  anthropicKey: string;
}

export interface ExtractionResult {
  value: string | null;
  source: "intake" | "extracted" | "not_found";
  confidence: "high" | "medium" | "low";
  occurrences_found?: number;
  notes?: string;
}

const FIELD_TO_INTAKE_KEYS: Record<string, string[]> = {
  business_name:    ["business_name", "company_name", "brand_name", "name"],
  business_phone:   ["business_phone", "phone", "primary_phone", "phone_number", "contact_phone"],
  business_email:   ["business_email", "email", "contact_email", "primary_email"],
  business_address: ["business_address", "address", "street_address", "street", "location_address"],
  business_city:    ["business_city", "city", "location_city"],
  business_state:   ["business_state", "state", "location_state"],
  business_zip:     ["business_zip", "zip", "postal_code", "zip_code", "location_zip"],
  business_hours:   ["business_hours", "hours", "hours_of_operation", "opening_hours"],
  service_area:     ["service_area", "service_areas", "areas_served"],
  owner_name:       ["owner_name", "owner", "founder_name", "principal_name"],
  owner_title:      ["owner_title", "title", "owner_role"],
  tagline:          ["tagline", "brand_tagline", "subtitle", "byline"],
  years_in_business:["years_in_business", "years_established", "founded", "since"],
  instagram_url:    ["instagram_url", "instagram", "ig", "ig_url"],
  facebook_url:     ["facebook_url", "facebook", "fb", "fb_url"],
  linkedin_url:     ["linkedin_url", "linkedin", "li", "li_url"],
  tiktok_url:       ["tiktok_url", "tiktok", "tt", "tt_url"],
  pinterest_url:    ["pinterest_url", "pinterest"],
  youtube_url:      ["youtube_url", "youtube", "yt"],
  twitter_url:      ["twitter_url", "twitter", "x_url"],
  google_business_url:["google_business_url", "google_business", "gmb_url"],
  yelp_url:         ["yelp_url", "yelp"],
  booking_url:      ["booking_url", "booking", "schedule_url", "appointment_url"],
  ordering_url:     ["ordering_url", "order_online", "online_ordering_url"],
  menu_url:         ["menu_url", "menu"],
  license_number:   ["license_number", "license", "license_no"],
  google_rating:    ["google_rating", "rating"],
  google_review_count:["google_review_count", "review_count", "reviews_count"],
};

function lookUpInIntake(field: string, intake: any): string | null {
  if (!intake) return null;
  const keys = FIELD_TO_INTAKE_KEYS[field] || [field];
  for (const k of keys) {
    const v = intake[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      if (typeof v === "object") return JSON.stringify(v);
      return String(v).trim();
    }
  }
  return null;
}

function countOccurrencesAcrossFiles(value: string, deployedHtml: Record<string, string>): number {
  if (!value || value.length < 3) return 0;
  let total = 0;
  for (const html of Object.values(deployedHtml)) {
    if (!html) continue;
    total += html.split(value).length - 1;
  }
  return total;
}

export async function extractCurrentValue(ctx: ExtractionContext): Promise<ExtractionResult> {
  const intakeValue = lookUpInIntake(ctx.field, ctx.intake);
  if (intakeValue) {
    const occurrences = countOccurrencesAcrossFiles(intakeValue, ctx.deployedHtml);
    if (occurrences > 0) {
      return { value: intakeValue, source: "intake", confidence: "high", occurrences_found: occurrences };
    }
    // Intake value exists but doesn't appear on the site — fall through to Claude.
  }

  const extracted = await askClaudeToExtract(ctx);
  if (extracted.value) {
    const occurrences = countOccurrencesAcrossFiles(extracted.value, ctx.deployedHtml);
    return {
      value: extracted.value,
      source: "extracted",
      confidence: occurrences >= 1 ? "high" : "medium",
      occurrences_found: occurrences,
      notes: extracted.notes,
    };
  }

  return {
    value: null,
    source: "not_found",
    confidence: "low",
    notes: extracted.notes || `Could not find current ${ctx.field} in intake or deployed HTML`,
  };
}

async function askClaudeToExtract(ctx: ExtractionContext): Promise<{ value: string | null; notes?: string }> {
  const sample = buildExtractionSample(ctx.field, ctx.deployedHtml);
  const fieldDescription = describeField(ctx.field);

  const systemPrompt = `You are a precise data extractor. You receive a snippet of deployed website HTML and you find the current value of a specific data field on that website. You return the value exactly as it appears on the site, or null if you can't find it.`;
  const userPrompt = `FIELD TO EXTRACT: ${ctx.field}
FIELD DESCRIPTION: ${fieldDescription}

DEPLOYED HTML SAMPLE:
\`\`\`
${sample}
\`\`\`

Find the current ${fieldDescription} on this website. Return ONLY this JSON:
{
  "value": "<the exact string as it appears on the site, or null if not found>",
  "notes": "<brief note about where you found it, or why you couldn't>"
}

Rules:
- Return the value EXACTLY as it appears, including any formatting (e.g., for a phone number "(480) 488-2100" not "4804882100").
- If the value appears in multiple slightly-different forms, return the most common form.
- If you can't find the field, return null. Don't guess.
- Don't include surrounding HTML tags or whitespace in the value.
- For addresses, return the full street address as it appears (excluding city/state/zip unless they're in the same string).
- For hours, return the hours block as it appears.
- Return ONLY the JSON object — no markdown, no code fences.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ctx.anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5-20250929",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) return { value: null, notes: `Extraction Claude call failed: ${res.status}` };

    const data = await res.json();
    const raw: string = data?.content?.[0]?.text ?? "";
    const cleaned = raw.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return { value: parsed.value || null, notes: parsed.notes };
  } catch (e: any) {
    return { value: null, notes: `Extraction error: ${e?.message ?? String(e)}` };
  }
}

function buildExtractionSample(field: string, deployedHtml: Record<string, string>): string {
  const fieldToScope: Record<string, string[]> = {
    business_name: ["footer", "header", "nav"],
    business_phone: ["footer", "contact", "header"],
    business_email: ["footer", "contact"],
    business_address: ["footer", "contact", "visit"],
    business_city: ["footer", "contact", "visit"],
    business_state: ["footer", "contact", "visit"],
    business_zip: ["footer", "contact", "visit"],
    business_hours: ["footer", "contact", "visit"],
    service_area: ["footer", "contact", "hero"],
    owner_name: ["about", "founder", "team"],
    owner_title: ["about", "founder", "team"],
    tagline: ["hero", "footer"],
    license_number: ["footer", "about"],
    google_rating: ["footer", "testimonials", "hero"],
    google_review_count: ["footer", "testimonials"],
  };

  if (field.endsWith("_url")) return extractSections(deployedHtml, ["footer"]);
  const scopes = fieldToScope[field] || ["footer", "contact", "hero", "about"];
  return extractSections(deployedHtml, scopes);
}

function extractSections(deployedHtml: Record<string, string>, scopes: string[]): string {
  const sectionPatterns: Record<string, RegExp> = {
    footer: /<footer[\s\S]*?<\/footer>/i,
    header: /<header[\s\S]*?<\/header>/i,
    nav: /<nav[\s\S]*?<\/nav>/i,
    hero: /<section[^>]*class="[^"]*hero[^"]*"[\s\S]*?<\/section>/i,
    about: /<section[^>]*class="[^"]*(?:about|founder|story)[^"]*"[\s\S]*?<\/section>/i,
    contact: /<section[^>]*class="[^"]*contact[^"]*"[\s\S]*?<\/section>/i,
    visit: /<section[^>]*class="[^"]*visit[^"]*"[\s\S]*?<\/section>/i,
    testimonials: /<section[^>]*class="[^"]*testimonial[^"]*"[\s\S]*?<\/section>/i,
    founder: /<section[^>]*class="[^"]*founder[^"]*"[\s\S]*?<\/section>/i,
    team: /<section[^>]*class="[^"]*team[^"]*"[\s\S]*?<\/section>/i,
  };

  const chunks: string[] = [];
  const maxTotal = 12000;
  let totalSize = 0;

  for (const [pageName, html] of Object.entries(deployedHtml)) {
    if (!html) continue;
    if (totalSize > maxTotal) break;
    for (const scope of scopes) {
      const pattern = sectionPatterns[scope];
      if (!pattern) continue;
      const match = html.match(pattern);
      if (match) {
        const chunk = `<!-- FROM ${pageName} (${scope}) -->\n${match[0]}`;
        if (totalSize + chunk.length < maxTotal) {
          chunks.push(chunk);
          totalSize += chunk.length;
        }
      }
    }
  }

  if (chunks.length === 0) {
    for (const [pageName, html] of Object.entries(deployedHtml)) {
      if (totalSize > maxTotal) break;
      const slice = html.slice(0, 4000);
      chunks.push(`<!-- FROM ${pageName} (fallback) -->\n${slice}`);
      totalSize += slice.length;
    }
  }

  return chunks.join("\n\n");
}

function describeField(field: string): string {
  const descriptions: Record<string, string> = {
    business_name: "the name of the business",
    business_phone: "the business's phone number",
    business_email: "the business's email address",
    business_address: "the business's street address (just the street, not city/state/zip)",
    business_city: "the city the business is located in",
    business_state: "the state the business is located in",
    business_zip: "the business's zip / postal code",
    business_hours: "the business's hours of operation",
    service_area: "the geographic area the business serves",
    owner_name: "the name of the business's owner or founder",
    owner_title: "the owner's job title",
    tagline: "the business's tagline or short marketing phrase",
    years_in_business: "how many years the business has been operating",
    license_number: "the business's license number",
    google_rating: "the business's Google rating",
    google_review_count: "how many reviews the business has on Google",
    instagram_url: "the business's Instagram URL",
    facebook_url: "the business's Facebook URL",
    linkedin_url: "the business's LinkedIn URL",
    tiktok_url: "the business's TikTok URL",
    pinterest_url: "the business's Pinterest URL",
    youtube_url: "the business's YouTube URL",
    twitter_url: "the business's Twitter/X URL",
    google_business_url: "the business's Google Business profile URL",
    yelp_url: "the business's Yelp page URL",
    booking_url: "the URL where customers can book or schedule",
    ordering_url: "the URL where customers can place online orders",
    menu_url: "the URL of the business's menu",
  };
  return descriptions[field] || `the value of the ${field} field`;
}
