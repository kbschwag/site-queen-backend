// Auto-fill leftover {{PLACEHOLDER}} tags using Lovable AI for text and
// Unsplash for image-like placeholders. Run BEFORE the silent strip line.
//
// Returns the HTML with placeholders replaced. Anything still unfilled is
// returned to the caller, who can pass it to logUnfilledPlaceholders and
// then run the existing strip regex.

const LOVABLE_AI_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-3-flash-preview";

// Treat any placeholder whose KEY name matches as an image URL slot.
const IMAGE_KEY_RE = /(IMG|IMAGE|PHOTO|PIC|HERO_?BG|BACKGROUND|BG_URL|AVATAR|HEADSHOT|PORTRAIT|GALLERY|LOGO_URL|COVER|BANNER)/i;

export interface AutoFillContext {
  businessName: string;
  businessType: string;
  city?: string;
  services?: string;
  notes?: string;
  tone?: string;
}

export interface AutoFillResult {
  html: string;
  filled: Record<string, string>;
  stillUnfilled: string[];
}

async function fetchUnsplash(searchTerms: string[]): Promise<string> {
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if (!key) return "";
  for (const term of searchTerms) {
    if (!term) continue;
    try {
      const r = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(term)}`,
        { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } },
      );
      if (r.ok) {
        const p = await r.json();
        if (p?.urls?.raw) return `${p.urls.raw}&w=1200&h=1200&fit=crop&crop=entropy&auto=format&q=80`;
      }
    } catch (e) {
      console.error(`[autofill/unsplash] error for "${term}":`, e);
    }
  }
  return "";
}

export async function autoFillPlaceholders(
  html: string,
  ctx: AutoFillContext,
  imageSearchTerms: string[] = [],
): Promise<AutoFillResult> {
  const matches = html.match(/\{\{[^}]+\}\}/g) || [];
  const unique = [...new Set(matches)];
  if (unique.length === 0) return { html, filled: {}, stillUnfilled: [] };

  // Split into image vs text placeholders
  const imageKeys: string[] = [];
  const textKeys: string[] = [];
  for (const ph of unique) {
    const inner = ph.replace(/[{}]/g, "");
    if (IMAGE_KEY_RE.test(inner)) imageKeys.push(ph);
    else textKeys.push(ph);
  }

  const filled: Record<string, string> = {};

  // 1) Resolve image placeholders via Unsplash
  const baseImageTerms = [
    ...imageSearchTerms,
    ctx.businessType,
    ctx.services?.split(/[,;\n]/)[0]?.trim() || "",
    `${ctx.businessType} business`,
  ].filter(Boolean);

  for (const key of imageKeys) {
    const inner = key.replace(/[{}]/g, "").toLowerCase();
    // bias query by slot type so different slots get different images
    let bias = "";
    if (inner.includes("hero")) bias = "hero";
    else if (inner.includes("team") || inner.includes("about") || inner.includes("portrait") || inner.includes("headshot")) bias = "team portrait";
    else if (inner.includes("gallery") || inner.includes("portfolio")) bias = "portfolio";
    else if (inner.includes("testimonial") || inner.includes("avatar")) bias = "person headshot";
    else if (inner.includes("service") || inner.includes("product")) bias = "professional";
    const terms = bias ? baseImageTerms.map((t) => `${t} ${bias}`) : baseImageTerms;
    const url = await fetchUnsplash([...terms, bias].filter(Boolean));
    if (url) filled[key] = url;
  }

  // 2) Resolve text placeholders with a single Lovable AI call returning JSON
  if (textKeys.length > 0) {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.warn("[autofill] LOVABLE_API_KEY missing — skipping AI text fill");
    } else {
      const sys = `You are a website copywriter. Generate short, on-brand text snippets to fill missing placeholders for a real business. Match the tone, keep copy concise and natural — never include the placeholder name in the output. Use the business context to make each value relevant.`;
      const userPrompt = `BUSINESS
- Name: ${ctx.businessName}
- Type: ${ctx.businessType}
- City: ${ctx.city || "n/a"}
- Services: ${ctx.services || "n/a"}
- Tone: ${ctx.tone || "warm, professional"}
- Notes: ${ctx.notes || "n/a"}

For each placeholder key below, return a JSON object mapping the EXACT key (with the {{ }} braces) to a short string value. Infer what each key represents from its name. Keep:
- headlines: 3–8 words
- subheads/taglines: 6–14 words
- body/paragraph keys: 1–2 sentences
- button/CTA/label keys: 1–4 words
- stat numbers: realistic number with unit
- name/title/role keys: a believable short name or role
- city/area keys: ${ctx.city || "a nearby city"}

Placeholders:
${textKeys.join("\n")}

Return ONLY a JSON object, no prose, no markdown. Example: {"{{HERO_TITLE}}":"Beautiful Lawns, Year Round"}`;

      try {
        const r = await fetch(LOVABLE_AI_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: LOVABLE_AI_MODEL,
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const txt = data?.choices?.[0]?.message?.content || "{}";
          const cleaned = txt.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
          const obj = JSON.parse(cleaned);
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === "string" && v.trim()) {
              filled[k] = v.trim();
            }
          }
        } else {
          console.warn("[autofill] AI call failed:", r.status, await r.text());
        }
      } catch (e) {
        console.error("[autofill] AI text fill error:", e);
      }
    }
  }

  // 3) Apply replacements
  let out = html;
  for (const [key, value] of Object.entries(filled)) {
    out = out.split(key).join(value);
  }

  const stillUnfilled = unique.filter((k) => !filled[k]);
  console.log(
    `[autofill] resolved ${Object.keys(filled).length}/${unique.length} placeholders (images:${imageKeys.length}, text:${textKeys.length}, remaining:${stillUnfilled.length})`,
  );
  return { html: out, filled, stillUnfilled };
}
