// ═══════════════════════════════════════════════════════════════════════════
//  SiteQueen — Website Generation Engine (Path B: author, don't fill)
//  ---------------------------------------------------------------------------
//  Replaces the old fill-map/token-replace approach inside generate-website.
//
//  Design principles (the whole point):
//   1. FIELD-AGNOSTIC. Takes whatever facts exist for a business — 3 fields or
//      30 — and authors from them. No required fields. Missing data never makes
//      a hole; the section is simply omitted.
//   2. CLAUDE AUTHORS, doesn't fill. One call returns a complete, semantic,
//      responsive page — the Cedar Creek / Restore & Rise way.
//   3. THE GATE VALIDATES THE PAGE, NOT THE INPUTS. A page either meets the
//      house standard or it doesn't, regardless of how much data went in.
//
//  Two functions matter:
//    buildGenerationPrompt(business, designReference, mode)  -> string
//    validateOutput(html, business)                          -> {ok, failures}
//
//  Everything else is glue you can adapt to your existing generate-website.
// ═══════════════════════════════════════════════════════════════════════════


// ── TYPES ──────────────────────────────────────────────────────────────────
// A loose bag of "whatever is known." NOTHING is required. Pass what you have.
// Client intake, GBP scrape, half-empty record — all fine. Unknown keys are OK.
export interface BusinessData {
  business_name?: string;
  category?: string;          // "Plumber", "Electrician", "Wellness coach"...
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  address?: string;           // often absent for service-area trades — fine
  services?: string;          // freeform: "water heaters, drains, leak detection"
  rating?: number | string;   // e.g. 4.8
  review_count?: number | string;
  brand_color?: string;       // hex, optional
  about_story?: string;       // the "only they know it" gold — use if present
  owner_name?: string;
  hours?: string;
  service_areas?: string;     // freeform list if known
  years_in_business?: number | string;
  // ...any other fields you have. The prompt is told to use whatever's present.
  [key: string]: unknown;
}

export type GenerationMode = 'client' | 'prospect';

export interface ValidationResult {
  ok: boolean;
  failures: string[];   // human-readable reasons; empty when ok
  warnings: string[];   // non-blocking notes
}


// ── 1. THE HOUSE STYLE ─────────────────────────────────────────────────────
// Your 9 rules, in one place, injected into the prompt AND enforced by the gate.
// Edit here and both the instruction and the validator stay in sync.
const HOUSE_STYLE = `
HOUSE STYLE RULES (non-negotiable — the site must obey every one):

1. NO EMOJI anywhere. Not in headings, buttons, icons, lists, or trust bars.
   Use thin inline SVG line-icons (stroke-based, no fill unless a star rating)
   or no icon at all. Emoji is the #1 "AI-built" tell.

2. NO ROUNDED CORNERS. Every element is square: buttons, cards, inputs, images,
   badges. Set a CSS token --radius: 0 and use it everywhere. Sharp corners read
   as intentional and professional.

3. IMAGES: never use generic stock photography that pretends to be this business
   (a random Unsplash "smiling plumber" is a lie and an AI tell). If real photos
   of THIS business are provided in the data, use them. If not, go design-led:
   brand-color panels, texture, bold type, geometric accents — no fake photo.
   A strong photo-free hero beats any stock photo.

4. ASYMMETRY OVER BALANCE. Do not default to tidy multiples (6 services, 4
   pillars, 4 stats). Real businesses are lopsided — use 5 services, or 3
   differentiators. Vary counts so it doesn't look template-generated.

5. BAN AI COPY CADENCE. Forbidden: "not just X, but Y"; em-dash pivots used as a
   crutch; and the phrases "peace of mind", "done right", "rest easy", "look no
   further", "we've got you covered", "trusted partner", "your satisfaction is
   our priority". Write like a real tradesperson/owner talks: plain, direct,
   specific.

6. BREAK PARALLELISM. Section and feature titles must NOT all be the same shape
   (e.g. four tidy 2-word labels). Vary length and structure so it reads human.

7. HONEST, UNEVEN NUMBERS. Use real figures when provided (e.g. 4.8 rating, 312
   reviews). Do not manufacture round cliché stats ("500+ jobs", "24/7", "100%
   satisfaction") to fill space. If you don't have a real number, don't invent one.

8. SEO: exactly ONE <h1> per page, containing the primary service + the city
   (e.g. "Round Rock's plumbers for water heaters, drains & leaks"). <h2>s carry
   secondary keywords in NATURAL language (never keyword-stuffed). Every page has
   a unique <title> (~55-60 chars, pattern: "Business | Primary Service in City,
   State") and a unique <meta name="description"> (~150-160 chars, natural, with
   service + city + a call to action).

9. CROSS-PAGE CONSISTENCY (when generating more than one page): identical nav,
   footer, phone number, colors, fonts, and identical service names across every
   page. The services named on the homepage must match the services page exactly.
`.trim();


// ── 2. THE HONESTY / DATA-USE CONTRACT ─────────────────────────────────────
// This is what makes it field-agnostic AND non-fabricating.
const DATA_CONTRACT = `
HOW TO USE THE BUSINESS DATA (this is critical):

- Use every real fact provided. Weave the business name, city, services, rating,
  and any story or owner detail into specific, non-generic copy.

- You may INFER reasonable, industry-standard content the business obviously has
  but didn't spell out: plausible service descriptions, sensible FAQ answers,
  nearby service-area towns, standard trust points. This is how you author a full
  page from thin data.

- You must NOT FABRICATE hard facts. Never invent: license numbers, certifications,
  specific award names, founding years, employee counts, specific customer names
  or testimonial quotes, or exact review counts/ratings that weren't provided.
  Inferring "they probably do drain cleaning" is fine. Inventing "Licensed since
  2004, winner of Best of Round Rock 2023" is a lie. Don't.

- OMIT, NEVER EMPTY. If you have no basis for a section (e.g. no testimonials, no
  awards, no physical address), leave that section OUT of the page entirely. Do
  not render an empty or placeholder version of it. A page with 6 strong sections
  beats a page with 9 where 3 are hollow. This single rule is what separates a
  site that looks designed from one that looks broken.

- If a physical address is not provided, do not show a street address or an
  embedded map; refer to the service area instead (e.g. "Serving {city} & nearby").
`.trim();


// ── 3. MODE-SPECIFIC LEASH ─────────────────────────────────────────────────
function modeInstruction(mode: GenerationMode): string {
  if (mode === 'prospect') {
    return `
GENERATION MODE: PROSPECT (cold outreach concept).
This site is a CONCEPT built from limited public data (e.g. a Google Business
Profile) for a business that has NOT signed up. The goal is the "wow, that's my
business" reaction that makes them claim it.
- Lean on restraint: infer credible industry-standard copy, but be extra careful
  NOT to state specific credentials, guarantees, or facts you can't support.
- It's a concept/draft, so aim for credible and clean over deeply personal — you
  likely have no owner story or real voice to work from.
`.trim();
  }
  return `
GENERATION MODE: CLIENT (real, engaged customer).
This business filled out an intake and will refine the site with the team. You
likely have richer data — a story, a voice, specific services. Author fully and
personally: use their actual words and story, match their tone, make it feel
unmistakably theirs (the quality bar is a bespoke designer site, not a template).
`.trim();
}


// ── 4. BUILD THE PROMPT ────────────────────────────────────────────────────
/**
 * Produces the single Sonnet 5 instruction that authors the page.
 * @param business  whatever facts you have (nothing required)
 * @param designReference  the template's HTML/CSS, used as a DESIGN REFERENCE
 *   (colors, fonts, section flow, structure) — NOT as a fill-target. Claude
 *   matches its look while writing clean semantic HTML. Pass your trades-hero
 *   index.html here, for example.
 * @param mode  'client' | 'prospect'
 */
export function buildGenerationPrompt(
  business: BusinessData,
  designReference: string,
  mode: GenerationMode = 'client',
): string {
  // Serialize only the keys that actually have values, so the model sees a clean
  // list of "what's known" and nothing misleading. This is the field-agnostic core.
  const known = Object.entries(business)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `- ${k}: ${String(v).trim()}`)
    .join('\n');

  const knownBlock = known.length
    ? known
    : '(very little is known — author a clean, credible page from the category alone)';

  return `
You are an expert web designer and copywriter building a complete, single-page
website for a local business. Your output is judged against bespoke, human-made
designer sites — NOT AI templates. It must not look AI-generated.

${modeInstruction(mode)}

═══ WHAT IS KNOWN ABOUT THIS BUSINESS ═══
${knownBlock}

${DATA_CONTRACT}

${HOUSE_STYLE}

═══ DESIGN REFERENCE ═══
Below is a reference design. MATCH its visual system exactly: color palette,
typography, spacing feel, section flow, button and form styling, and the square-
cornered, icon-based, photo-light aesthetic. Do NOT copy its literal text content
or its class-name structure — write your own clean, semantic, responsive HTML/CSS
that reproduces the LOOK for THIS business. Treat it as "make it look like this,"
not "fill this in."

--- BEGIN DESIGN REFERENCE ---
${designReference}
--- END DESIGN REFERENCE ---

═══ OUTPUT REQUIREMENTS ═══
- Return ONE complete HTML document: <!DOCTYPE html> … </html>.
- All CSS inline in a single <style> block. Any JS inline at the end.
- Fully responsive (mobile, tablet, desktop). Real, working nav anchors.
- The request/contact form present and styled (it does not need a backend action).
- Apply ALL nine house-style rules and the SEO rules.
- Author real content for every section you include. Omit sections you have no
  basis for. NO placeholder text, NO "lorem", NO empty elements, NO "{{tokens}}".
- Return ONLY the HTML. No explanation, no markdown fences, no commentary.
`.trim();
}


// ── 5. THE FIDELITY GATE ───────────────────────────────────────────────────
/**
 * Validates the FINISHED PAGE against the house standard. It never checks input
 * fields — a page passes or fails on its own merits. This is the thing that makes
 * "first generation looks like trash" structurally impossible: nothing that fails
 * here is allowed to publish.
 *
 * Returns ok:false with reasons if the page must be rejected (→ regenerate or
 * route to needs_review). Warnings are non-blocking.
 */
export function validateOutput(html: string, business: BusinessData = {}): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const h = html || '';

  // — Structural completeness —
  if (!/<!doctype html>/i.test(h)) failures.push('Missing <!DOCTYPE html>.');
  if (!/<html[\s>]/i.test(h) || !/<\/html>/i.test(h)) failures.push('Not a complete HTML document.');
  if (h.length < 3000) failures.push('Output suspiciously short — likely truncated or incomplete.');

  // — Leftover machinery (the VantagePoint failure signatures) —
  if (/\{\{[^}]+\}\}/.test(h)) failures.push('Contains unfilled {{tokens}}.');
  if (/\blorem ipsum\b/i.test(h)) failures.push('Contains lorem ipsum placeholder text.');
  if (/\[(insert|your|business name|placeholder|todo)[^\]]*\]/i.test(h))
    failures.push('Contains bracketed placeholder text like [insert ...].');

  // — Empty elements (holes) —
  // Common empty patterns: <h2></h2>, <h2><br/><em></em></h2>, empty buttons/links.
  if (/<h[1-3][^>]*>\s*(<br\s*\/?>)?\s*(<em>\s*<\/em>)?\s*<\/h[1-3]>/i.test(h))
    failures.push('Contains empty heading element(s).');
  if (/<a[^>]*href=(""|'')[^>]*>\s*<\/a>/i.test(h))
    failures.push('Contains empty link(s) with no href and no text.');
  if (/<(p|span|div|li)[^>]*>\s*<\/\1>/i.test(h)) {
    // empty inline/text containers are a soft signal (some are legit spacers)
    warnings.push('Contains some empty text containers — spot-check for holes.');
  }

  // — Rule 1: NO EMOJI —
  // Covers common emoji ranges + variation selectors. Line-icons/SVG are fine.
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
  if (emojiRe.test(h)) failures.push('Contains emoji (house rule 1: none allowed).');

  // — Rule 2: NO ROUNDED CORNERS —
  // Flag any non-zero border-radius. Allow border-radius:0 and var(--radius) when
  // --radius is defined as 0.
  const radiusDecls = [...h.matchAll(/border-radius\s*:\s*([^;}\n]+)/gi)].map(m => m[1].trim());
  const radiusVarIsZero = /--radius\s*:\s*0(px|rem|em|%)?\s*[;}]/i.test(h);
  for (const val of radiusDecls) {
    const isZero = /^0(px|rem|em|%)?$/i.test(val);
    const isVar = /var\(--radius\)/i.test(val);
    if (!isZero && !(isVar && radiusVarIsZero)) {
      failures.push(`Contains non-zero border-radius ("${val}") (house rule 2: square corners).`);
      break;
    }
  }

  // — Rule 3: NO FAKE STOCK PHOTO —
  // If the business supplied its own image URLs, those are allowed. Any OTHER
  // external stock-photo host is a fake-photo violation.
  const ownImageHosts = extractOwnImageHosts(business);
  const imgSrcs = [...h.matchAll(/<img[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
  const stockHostRe = /(unsplash\.com|pexels\.com|pixabay\.com|istockphoto|shutterstock|gettyimages|stock\.adobe)/i;
  for (const src of imgSrcs) {
    if (stockHostRe.test(src) && !ownImageHosts.some(host => src.includes(host))) {
      failures.push(`Uses stock photography (${shortUrl(src)}) that implies it's the business (house rule 3).`);
      break;
    }
  }

  // — Rule 8: SEO —
  const h1Count = (h.match(/<h1[\s>]/gi) || []).length;
  if (h1Count === 0) failures.push('No <h1> (house rule 8: exactly one required).');
  if (h1Count > 1) failures.push(`Multiple <h1> tags (${h1Count}) (house rule 8: exactly one).`);

  const titleMatch = h.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || '';
  if (!title) failures.push('Missing <title>.');
  else if (title.length < 15 || title.length > 70) warnings.push(`<title> length ${title.length} (aim ~55-60).`);

  const descMatch = h.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  const desc = descMatch?.[1]?.trim() || '';
  if (!desc) failures.push('Missing <meta name="description">.');
  else if (desc.length < 70 || desc.length > 200) warnings.push(`meta description length ${desc.length} (aim ~150-160).`);

  // City in the H1 is a strong SEO + specificity signal (rule 8). Warn, don't block.
  const city = String(business.city ?? '').trim();
  if (city) {
    const h1Match = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1Text = (h1Match?.[1] || '').replace(/<[^>]+>/g, ' ');
    if (!h1Text.toLowerCase().includes(city.toLowerCase()))
      warnings.push(`H1 does not mention the city ("${city}") — weaker local SEO.`);
  }

  // — Rule 5: banned AI phrases —
  const bannedPhrases = [
    'peace of mind', 'done right', 'rest easy', 'look no further',
    "we've got you covered", 'weve got you covered', 'trusted partner',
    'your satisfaction is our priority', 'not just a', 'not just the',
  ];
  const lower = h.toLowerCase();
  const hits = bannedPhrases.filter(p => lower.includes(p));
  if (hits.length) warnings.push(`Contains AI-cadence phrase(s): ${hits.join(', ')} (rule 5).`);

  // — Fabrication smell test (rule / data contract) — warn only, needs human eye —
  if (!business.review_count && /\b\d{2,}\s*(\+)?\s*(reviews|jobs|customers|clients)\b/i.test(h))
    warnings.push('Mentions a specific review/job count not present in the data — check for fabrication.');
  if (/licensed since \d{4}|established \d{4}|since \d{4}/i.test(h) && !business.years_in_business)
    warnings.push('States a founding/since year not present in the data — check for fabrication.');

  return { ok: failures.length === 0, failures, warnings };
}


// ── helpers ─────────────────────────────────────────────────────────────────
function extractOwnImageHosts(business: BusinessData): string[] {
  // Collect any hosts from image-like fields the business actually provided, so
  // their real photos (e.g. GBP photo URLs) are never flagged as "fake stock".
  const hosts: string[] = [];
  for (const [k, v] of Object.entries(business)) {
    if (typeof v !== 'string') continue;
    if (!/photo|image|img|logo|hero|gallery/i.test(k)) continue;
    const m = v.match(/^https?:\/\/([^/]+)/i);
    if (m) hosts.push(m[1]);
  }
  return hosts;
}

function shortUrl(u: string): string { return u.length > 50 ? u.slice(0, 47) + '…' : u; }


// ── 6. HOW THIS SLOTS INTO generate-website ────────────────────────────────
/**
 * Reference wiring. Adapt names to your existing function. The important shape:
 *   fetch business data  ->  load design reference  ->  ONE authoring call
 *   ->  GATE  ->  publish OR needs_review (retry-limited).
 *
 * `callAI` is your existing Anthropic call (model: claude-sonnet-5, the body you
 * already have: { model, max_tokens, messages }). NOTE: bump max_tokens — a full
 * authored page needs more than 8000. 16000+ is safer for Sonnet 5.
 */
export async function generateSite(opts: {
  business: BusinessData;
  designReference: string;
  mode: GenerationMode;
  callAI: (prompt: string) => Promise<string>;   // your existing Anthropic wrapper
  maxAttempts?: number;
}): Promise<
  | { status: 'ok'; html: string; warnings: string[] }
  | { status: 'needs_review'; html: string; failures: string[]; warnings: string[] }
> {
  const { business, designReference, mode, callAI } = opts;
  const maxAttempts = opts.maxAttempts ?? 2;   // cap retries so cost can't loop

  let last = { html: '', failures: ['no attempt made'] as string[], warnings: [] as string[] };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildGenerationPrompt(business, designReference, mode);
    let html = await callAI(prompt);
    html = stripFences(html);   // remove ```html fences if the model adds them

    const result = validateOutput(html, business);
    last = { html, failures: result.failures, warnings: result.warnings };

    if (result.ok) {
      return { status: 'ok', html, warnings: result.warnings };
    }
    // else loop and regenerate (the failures could be appended to the prompt on
    // a retry to nudge the model, but a clean re-roll is often enough).
  }

  // Never publish a page that failed the gate. This is what makes broken output
  // structurally incapable of reaching a prospect.
  return { status: 'needs_review', html: last.html, failures: last.failures, warnings: last.warnings };
}

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}
