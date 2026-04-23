import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";

// Page slug → human label + brief
const PAGE_BRIEFS: Record<string, { label: string; brief: string; templateRef?: "about" | "services" }> = {
  about: {
    label: "About",
    templateRef: "about",
    brief:
      "Tell the company story, founders/owners background, values, certifications, years in business, what makes them different. Include team or owner photo if provided. End with strong CTA back to contact/booking.",
  },
  services: {
    label: "Services",
    templateRef: "services",
    brief:
      "Detailed services list. For each service: name, description, what's included, optional pricing or 'Call for quote'. Group related services. Include service-area mention. End with CTA.",
  },
  contact: {
    label: "Contact",
    brief:
      "Phone (click-to-call), email (mailto), service area, hours, contact form (name/email/phone/message), embedded map block (use a styled placeholder if no map URL). Quick-response messaging.",
  },
  gallery: {
    label: "Gallery",
    brief: "Visual portfolio of past work. Use any client-provided photos in a responsive grid with hover effects.",
  },
  pricing: {
    label: "Pricing",
    brief: "Clear pricing tiers or service-by-service pricing. Include what's included, fine print, and CTA.",
  },
  faq: {
    label: "FAQ",
    brief: "8-12 common customer questions with concise answers. Use accordion styling from the homepage CSS.",
  },
  reviews: {
    label: "Reviews",
    brief: "Long-form testimonial wall. Use any provided reviews + 4-6 realistic local-sounding ones.",
  },
  blog: {
    label: "Blog",
    brief: "Blog index placeholder with 3-4 stub article cards (date, title, excerpt, 'Read more'). Note: real posts coming soon.",
  },
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // ── Load homepage + supporting context ──────────────────────────────
    const { data: homeFile, error: homeErr } = await supabase.storage.from("generated-sites").download(`${clientId}/index.html`);
    if (homeErr || !homeFile) throw new Error(`Cannot load homepage: ${homeErr?.message}`);
    const homepageHTML = await homeFile.text();

    const { data: siteData } = await supabase.from("sites").select("*").eq("client_id", clientId).single();
    const { data: clientData } = await supabase.from("clients").select("*").eq("id", clientId).single();
    const intake = (siteData as any)?.intake_data || {};
    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    // ── Decide which pages to build ─────────────────────────────────────
    const pages = resolveRequestedPages(intake, callNotes);
    if (pages.length === 0) {
      console.log("[extra-pages] No additional pages requested for", clientId);
      return new Response(JSON.stringify({ success: true, generated: [] }), { headers: corsHeaders });
    }

    console.log(`[extra-pages] Building ${pages.length} page(s) for ${clientId}: ${pages.map((p) => p.slug).join(", ")}`);

    // ── Pre-load reference templates (best-effort) ──────────────────────
    const [aboutTpl, aboutCss, servicesTpl, servicesCss] = await Promise.all([
      loadTemplate(supabase, "trades-hero-about.html"),
      loadTemplate(supabase, "trades-hero-about.css"),
      loadTemplate(supabase, "trades-hero-services.html"),
      loadTemplate(supabase, "trades-hero-services.css"),
    ]);

    // Trim homepage to the parts useful as style/structure reference
    const headBlock = extractHead(homepageHTML);
    const headerBlock = extractFirstMatch(homepageHTML, /<header[\s\S]*?<\/header>/i) || "";
    const footerBlock = extractFirstMatch(homepageHTML, /<footer[\s\S]*?<\/footer>/i) || "";
    const sharedScripts = extractBodyScripts(homepageHTML);

    const sharedContext = `BUSINESS CONTEXT:
Business name: ${clientData?.business_name || "Business"}
Business type: ${clientData?.business_type || "Service Business"}

CLIENT INTAKE:
${JSON.stringify(intake, null, 2)}

${callNotes ? `CALL NOTES:\n${JSON.stringify(callNotes, null, 2)}\n` : ""}`;

    const generated: string[] = [];
    const failed: string[] = [];

    for (const page of pages) {
      try {
        const ref = page.templateRef === "about"
          ? buildRef("ABOUT PAGE REFERENCE (trades-hero template — use ONLY for inspiration on layout & sections, NOT for code/CSS to copy)", aboutTpl, aboutCss)
          : page.templateRef === "services"
          ? buildRef("SERVICES PAGE REFERENCE (trades-hero template — use ONLY for inspiration on layout & sections, NOT for code/CSS to copy)", servicesTpl, servicesCss)
          : "";

        const prompt = `You are building the ${page.label.toUpperCase()} page of a multi-page website for a small business.
The homepage already exists. You must produce ONLY the INNER PAGE CONTENT that belongs between the shared header and shared footer.
Your output must visually match the homepage exactly — same fonts, colors, spacing, buttons, cards, and section rhythm.

${sharedContext}

HOMEPAGE <head> (contains the full inlined CSS that styles the entire site):
${headBlock}

HOMEPAGE HEADER (already handled separately — use it as visual reference only):
${headerBlock}

HOMEPAGE FOOTER (already handled separately):
${footerBlock}
${ref}

PAGE BRIEF — ${page.label.toUpperCase()}:
${page.brief}

REQUIREMENTS:
- Return ONLY the markup that goes BETWEEN the shared header and footer.
- Do NOT return <!DOCTYPE html>, <html>, <head>, <body>, <header>, or <footer>.
- Build the page body using the SAME class names the homepage uses (e.g. .hero, .about, .services, .btn, .section-heading, .section-eyebrow). Do NOT invent a new design system. If you need a new section, you may include one small <style> block before the first section — but prefer reusing existing classes.
- Add a small "page hero" / breadcrumb area at the top (dark background, page title, optional breadcrumb). The homepage CSS already has helpers — reuse them.
- All internal links: Home → "./index.html", About → "./about.html", Services → "./services.html", Contact → "./contact.html", and any other pages should follow the same "./<slug>.html" pattern.
- All phone numbers must be tel: links, emails must be mailto: links.
- Replace any nav link to a page that does not exist with "#".
- Do NOT include any <script> tags. Shared scripts are already handled globally.
- Inline-only CSS. No external stylesheets.
- Mobile-perfect responsive.

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML for the inner page content — no markdown, no code blocks, no explanation.
Do NOT wrap in \`\`\`.
First character must be < and should usually begin with <section or <style>.
Do not include closing </body> or </html> tags.`;

        console.log(`[extra-pages] Generating ${page.slug} (${prompt.length} chars prompt)…`);
        const res = await callAI(ANTHROPIC_API_KEY, prompt, `page-${page.slug}`);
        const pageBody = normalizeGeneratedBody(stripMarkdown(res.text));
        if (!pageBody) {
          throw new Error(`Page ${page.slug} returned malformed HTML`);
        }
        const html = composePageHtml({
          businessName: clientData?.business_name || "Business",
          headBlock,
          headerBlock,
          footerBlock,
          sharedScripts,
          pageSlug: page.slug,
          pageLabel: page.label,
          pageBody,
        });

        await supabase.storage.from("generated-sites").upload(
          `${clientId}/${page.slug}.html`,
          new Blob([html], { type: "text/html" }),
          { upsert: true }
        );
        generated.push(page.slug);
        console.log(`[extra-pages] ✓ ${page.slug}.html saved (${res.outputTokens} tokens)`);
      } catch (e: any) {
        console.error(`[extra-pages] ✗ ${page.slug} failed:`, e.message);
        failed.push(`${page.slug}: ${e.message}`);
      }
    }

    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: "extra-pages",
      status: failed.length === 0 ? "complete" : "partial",
      generation_notes: `Extra pages — built: ${generated.join(", ") || "none"}. Failed: ${failed.join("; ") || "none"}.`,
    } as any);

    return new Response(JSON.stringify({ success: true, generated, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[extra-pages] fatal error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

function resolveRequestedPages(intake: any, callNotes: any): Array<{ slug: string; label: string; brief: string; templateRef?: "about" | "services" }> {
  const requested = new Set<string>();

  // Defaults: every site gets about + services + contact unless explicitly disabled
  const explicitlyDisabled = new Set<string>(
    Array.isArray(intake?.disabled_pages) ? intake.disabled_pages.map((s: string) => slugify(s)) : []
  );
  for (const slug of ["about", "services", "contact"]) {
    if (!explicitlyDisabled.has(slug)) requested.add(slug);
  }

  // From call notes pages_agreed
  const pagesAgreed = (callNotes as any)?.pages_agreed;
  if (Array.isArray(pagesAgreed)) {
    for (const p of pagesAgreed) {
      const slug = typeof p === "string" ? slugify(p) : slugify(p?.slug || p?.name || "");
      if (slug && slug !== "home" && slug !== "index") requested.add(slug);
    }
  }

  // From intake additional pages list
  const intakePages = intake?.pages || intake?.requested_pages;
  if (Array.isArray(intakePages)) {
    for (const p of intakePages) {
      const slug = typeof p === "string" ? slugify(p) : slugify(p?.slug || p?.name || "");
      if (slug && slug !== "home" && slug !== "index") requested.add(slug);
    }
  }

  // Custom pages (with their own brief if given)
  const customPages = intake?.custom_pages;
  const customBriefs: Record<string, string> = {};
  if (Array.isArray(customPages)) {
    for (const p of customPages) {
      const slug = slugify(p?.slug || p?.name || p?.title || "");
      if (!slug) continue;
      requested.add(slug);
      if (p?.brief || p?.description || p?.content) {
        customBriefs[slug] = String(p.brief || p.description || p.content);
      }
    }
  }

  return Array.from(requested).map((slug) => {
    const known = PAGE_BRIEFS[slug];
    if (known) return { slug, label: known.label, brief: known.brief, templateRef: known.templateRef };
    return {
      slug,
      label: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "),
      brief:
        customBriefs[slug] ||
        `Build the "${slug.replace(/-/g, " ")}" page using the homepage's design system. Use any relevant intake or call-notes content. Include a clear CTA at the bottom.`,
    };
  });
}

async function loadTemplate(supabase: any, file: string): Promise<string> {
  try {
    const { data } = await supabase.storage.from("templates").download(file);
    if (!data) return "";
    return await data.text();
  } catch {
    return "";
  }
}

function extractHead(html: string): string {
  const m = html.match(/<head[\s\S]*?<\/head>/i);
  return m ? m[0] : "";
}

function extractFirstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[0] : null;
}

function buildRef(label: string, html: string, css: string): string {
  if (!html && !css) return "";
  const trimmedHtml = html ? html.slice(0, 6000) : "";
  const trimmedCss = css ? css.slice(0, 4000) : "";
  return `\n\n${label}:\n${trimmedHtml ? `HTML:\n${trimmedHtml}\n` : ""}${trimmedCss ? `CSS (excerpt):\n${trimmedCss}\n` : ""}`;
}

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
          max_tokens: 12000,
          messages: [{ role: "user", content }],
        }),
      });
      if (!r.ok) {
        const errText = await r.text();
        console.error(`[${label}] Claude error ${r.status}:`, errText);
        if ((r.status === 429 || r.status === 529) && attempt < MAX_ATTEMPTS) {
          await new Promise((res) => setTimeout(res, 3000 * attempt));
          continue;
        }
        throw new Error(`Claude ${label} failed: ${r.status} — ${errText.substring(0, 300)}`);
      }
      const data = await r.json();
      const text = Array.isArray(data.content)
        ? data.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("")
        : "";
      return { text, outputTokens: data.usage?.output_tokens || 0 };
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