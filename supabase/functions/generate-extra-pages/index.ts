import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";

// Staging is hosted on Hostinger at staging.sitequeen.ai → /public_html/staging
const STAGING_FOLDER_ROOT = "/public_html";

// Inject noindex meta tag for staging copies. Internal page links use plain
// relative paths (./about.html etc.) which work natively on the Hostinger
// staging subdomain — no rewriting needed.
function rewriteLinksForStaging(html: string): string {
  let out = html;
  if (!/name=["']robots["']/i.test(out)) {
    const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
    if (/<meta\s+charset=["'][^"']+["']\s*\/?>/i.test(out)) {
      out = out.replace(/(<meta\s+charset=["'][^"']+["']\s*\/?>)/i, `$1${tag}`);
    } else if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/(<head[^>]*>)/i, `$1${tag}`);
    }
  }
  return out;
}

// Hostinger uploads now go over FTPS via the shared helper. The fictional
// REST endpoint we used before (`/v1/hosting/files/upload`) does not exist —
// it returned 530 because Cloudflare had nothing to route to.

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
    // FTP credentials are checked lazily inside uploadFileToHostingerFtp.

    // ── Load homepage (clean copy) + supporting context ─────────────────
    // Homepage now lives only in the deploy/ backup folder — staging is
    // pushed straight to Hostinger.
    const { data: homeFile, error: homeErr } = await supabase.storage.from("generated-sites").download(`${clientId}/deploy/index.html`);
    if (homeErr || !homeFile) throw new Error(`Cannot load homepage: ${homeErr?.message}`);
    const homepageHTML = await homeFile.text();

    // Load site-meta (class inventory + brand tokens) — tiny, replaces sending full CSS to Claude
    const { data: metaFile } = await supabase.storage.from("generated-sites").download(`${clientId}/deploy/site-meta.json`);
    const siteMeta = metaFile ? JSON.parse(await metaFile.text()) : { classes: [], primaryColor: "", accentColor: "", fontHeading: "", fontBody: "" };

    const { data: siteData } = await supabase.from("sites").select("*").eq("client_id", clientId).single();
    const { data: clientData } = await supabase.from("clients").select("*").eq("id", clientId).single();
    const intake = (siteData as any)?.intake_data || {};
    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    // Extract only the <head> tag (for meta/title injection) and header/footer blocks
    // Strip the <style> block entirely — styles now live in site.css
    const rawHeadBlock = extractHead(homepageHTML);
    const headBlock = rawHeadBlock.replace(/<style[^>]*>[\s\S]*?<\/style>/gi,
      `<link rel="stylesheet" href="./site.css" />`
    );
    const headerBlock = extractFirstMatch(homepageHTML, /<header[\s\S]*?<\/header>/i) || "";
    const footerBlock = extractFirstMatch(homepageHTML, /<footer[\s\S]*?<\/footer>/i) || "";
    // No shared scripts needed — site.js handles everything

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

    // Trim intake to only what Claude needs for inner pages
    const trimmedIntake = {
      business_name: intake.business_name,
      phone: intake.business_phone,
      email: intake.business_email,
      city: intake.business_city,
      state: intake.business_state,
      services: intake.services,
      about_story: intake.about_story,
      years_in_business: intake.years_in_business,
      google_rating: intake.google_rating,
      google_review_count: intake.google_review_count,
      tagline: intake.tagline,
      team_members: intake.team_members,
      testimonials: intake.testimonials,
      service_areas: intake.service_areas,
      faq_items: intake.faq_items,
    };

    const sharedContext = `BUSINESS CONTEXT:
Business name: ${clientData?.business_name || "Business"}
Business type: ${clientData?.business_type || "Service Business"}

CLIENT INTAKE:
${JSON.stringify(trimmedIntake, null, 2)}

${callNotes ? `CALL NOTES (higher priority than intake):\n${JSON.stringify({
  their_story: callNotes.their_story,
  ideal_customer: callNotes.ideal_customer,
  google_search_terms: callNotes.google_search_terms,
  website_goal: callNotes.website_goal,
  expert_additions: callNotes.expert_additions,
  expert_avoid: callNotes.expert_avoid,
  exact_phrases: callNotes.exact_phrases,
  tone_of_voice: callNotes.tone_of_voice,
  pages_agreed: callNotes.pages_agreed,
}, null, 2)}\n` : ""}

BRAND DESIGN SYSTEM (already defined in site.css — reuse these exactly):
Primary color: ${siteMeta.primaryColor || "see CSS --color-primary"}
Accent color: ${siteMeta.accentColor || "see CSS --color-accent"}
Heading font: ${siteMeta.fontHeading || "see CSS --font-heading"}
Body font: ${siteMeta.fontBody || "see CSS --font-body"}
Available CSS classes (use these, do not invent new ones unless essential):
${siteMeta.classes.join(", ")}`;

    const generated: string[] = [];
    const failed: string[] = [];

    const results = await Promise.allSettled(
      pages.map(async (page): Promise<string> => {
        const ref = page.templateRef === "about"
          ? buildRef("ABOUT PAGE REFERENCE (layout inspiration only — do NOT copy code or CSS)", aboutTpl, aboutCss)
          : page.templateRef === "services"
          ? buildRef("SERVICES PAGE REFERENCE (layout inspiration only — do NOT copy code or CSS)", servicesTpl, servicesCss)
          : "";

        const prompt = `You are building the ${page.label.toUpperCase()} page of a multi-page small business website.

${sharedContext}

HOMEPAGE HEADER (visual reference — will be injected separately):
${headerBlock}

HOMEPAGE FOOTER (visual reference — will be injected separately):
${footerBlock}
${ref}

PAGE BRIEF — ${page.label.toUpperCase()}:
${page.brief}

REQUIREMENTS:
- Return ONLY the markup between the shared header and footer. Nothing else.
- Do NOT return <!DOCTYPE html>, <html>, <head>, <body>, <header>, or <footer> tags.
- Use the SAME BEM-lite class names already in site.css (listed in the brand design system above). Do not invent a new design system.
- If you need a class that does not exist, add ONE small <style> block before your first <section> — keep it minimal, use CSS custom properties from :root.
- Start with a page-hero section (dark background, page title, optional breadcrumb).
- All internal links: Home → "./index.html", About → "./about.html", Services → "./services.html", Contact → "./contact.html". Other pages use "./<slug>.html".
- All phone numbers must be tel: links. All emails must be mailto: links.
- All <img> tags must have loading="lazy" and a meaningful alt attribute.
- Zero inline styles. No style="" attributes.
- Do NOT include any <script> tags.
- Do NOT include a <link> to site.css — it is already in the <head>.
- If a section has no real data, remove it entirely. Never render an empty or skeleton section.
- Mobile-perfect responsive.

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML — no markdown, no code blocks, no explanation.
Do NOT wrap in \`\`\`.
First character must be < and start with <section or <style>.
Do not include </body> or </html>.`;

        console.log(`[extra-pages] Generating ${page.slug} (${prompt.length} chars)…`);
        const res = await callAI(ANTHROPIC_API_KEY, prompt, `page-${page.slug}`);
        const pageBody = normalizeGeneratedBody(stripMarkdown(res.text));
        if (!pageBody) throw new Error(`Page ${page.slug} returned malformed HTML`);

        const html = composePageHtml({
          businessName: clientData?.business_name || "Business",
          headBlock,
          headerBlock,
          footerBlock,
          sharedScripts: `<script defer src="./site.js"></script>`,
          pageSlug: page.slug,
          pageLabel: page.label,
          pageBody,
        });

        const stagingHTML = rewriteLinksForStaging(html);

        await uploadFileToHostingerFtp(
          `${STAGING_FOLDER_ROOT}/${clientId}/${page.slug}.html`,
          stagingHTML,
        );

        const { error: cleanErr } = await supabase.storage
          .from("generated-sites")
          .upload(
            `${clientId}/deploy/${page.slug}.html`,
            new Blob([html], { type: "text/html" }),
            { upsert: true, contentType: "text/html; charset=utf-8" },
          );
        if (cleanErr) throw new Error(`Failed to save deploy/${page.slug}.html: ${cleanErr.message}`);

        console.log(`[extra-pages] ✓ ${page.slug}.html (${res.outputTokens} tokens)`);
        return page.slug;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        generated.push(result.value);
      } else {
        const msg = (result.reason as any)?.message || "unknown error";
        console.error(`[extra-pages] ✗ page failed:`, msg);
        failed.push(msg);
      }
    }

    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: "extra-pages",
      status: failed.length === 0 ? "complete" : "partial",
      generation_notes: `Extra pages — built: ${generated.join(", ") || "none"}. Failed: ${failed.join("; ") || "none"}.`,
    } as any);

    // ── Mark generation fully complete ───────────────────────────────────
    // Extra-pages is the LAST function in the chain (homepage part1 → part2 →
    // extra-pages). It owns the final "complete" status flip so the operator
    // portal stops showing "Generating…" only after every page is on Hostinger.
    const stagingURL = `https://staging.sitequeen.ai/${clientId}/index.html`;
    const { error: siteUpdateErr } = await supabase
      .from("sites")
      .update({
        generation_status: "complete",
        generation_progress: "complete",
        generated_at: new Date().toISOString(),
        staging_url: stagingURL,
        site_status: "review",
      } as any)
      .eq("client_id", clientId);
    if (siteUpdateErr) {
      console.error("[extra-pages] Failed to mark site complete:", siteUpdateErr);
    } else {
      console.log(`[extra-pages] ✓ Marked site complete for ${clientId}`);
    }

    const { data: clientRow } = await supabase
      .from("clients")
      .select("business_name")
      .eq("id", clientId)
      .maybeSingle();
    const businessName = (clientRow as any)?.business_name || "Website";

    await supabase.from("notifications").insert({
      type: "site_ready_for_review",
      client_id: clientId,
      message: `${businessName} website ready for review ♛`,
      staging_url: stagingURL,
      target_role: "operator",
      read: false,
    });

    return new Response(JSON.stringify({ success: true, generated, failed, staging_url: stagingURL }), {
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
  const trimmedHtml = html ? html.slice(0, 2000) : "";
  const trimmedCss = css ? css.slice(0, 1000) : "";
  return `\n\n${label}:\n${trimmedHtml ? `HTML:\n${trimmedHtml}\n` : ""}${trimmedCss ? `CSS (excerpt):\n${trimmedCss}\n` : ""}`;
}

function extractBodyScripts(html: string): string {
  const matches = html.match(/<script[\s\S]*?<\/script>/gi);
  return matches ? matches.join("\n") : "";
}

function normalizeGeneratedBody(html: string): string {
  if (!html) return "";

  let normalized = html
    .replace(/<link[^>]*href=["']styles?\.css["'][^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();

  const bodyMatch = normalized.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) normalized = bodyMatch[1].trim();

  return normalized
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .trim();
}

function composePageHtml({
  businessName,
  headBlock,
  headerBlock,
  footerBlock,
  sharedScripts,
  pageSlug,
  pageLabel,
  pageBody,
}: {
  businessName: string;
  headBlock: string;
  headerBlock: string;
  footerBlock: string;
  sharedScripts: string;
  pageSlug: string;
  pageLabel: string;
  pageBody: string;
}): string {
  const title = `${businessName} — ${pageLabel}`;
  const description = `${pageLabel} page for ${businessName}. Learn more about the company, services, and how to get in touch.`;

  return [
    "<!DOCTYPE html>",
    "<html lang=\"en\">",
    injectPageMeta(headBlock || "<head></head>", title, description, pageSlug),
    "<body>",
    markActiveNav(headerBlock, pageSlug),
    pageBody,
    markActiveNav(footerBlock, pageSlug),
    sharedScripts,
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");
}

function injectPageMeta(headBlock: string, title: string, description: string, pageSlug: string): string {
  let head = headBlock;
  const pagePath = pageSlug === "index" ? "./index.html" : `./${pageSlug}.html`;

  head = /<title>[\s\S]*?<\/title>/i.test(head)
    ? head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    : head.replace(/<head>/i, `<head>\n<title>${escapeHtml(title)}</title>`);

  head = /<meta\s+name=["']description["'][^>]*>/i.test(head)
    ? head.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${escapeHtml(description)}" />`)
    : head.replace(/<\/head>/i, `  <meta name="description" content="${escapeHtml(description)}" />\n</head>`);

  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(head)) {
    head = head.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${pagePath}" />`);
  }

  return head;
}

function markActiveNav(markup: string, pageSlug: string): string {
  if (!markup) return "";
  const targetHref = pageSlug === "index" ? "./index.html" : `./${pageSlug}.html`;

  return markup.replace(/<a\b([^>]*?)href=(['"])(.*?)\2([^>]*)>/gi, (full, before, quote, href, after) => {
    const isActive = href === targetHref || (pageSlug === "index" && (href === "./index.html" || href === "#"));
    let attrs = `${before}href=${quote}${href}${quote}${after}`;
    attrs = attrs.replace(/\saria-current=(['"]).*?\1/gi, "");
    attrs = attrs.replace(/\sclass=(['"])(.*?)\1/i, (_m, q, cls) => {
      const tokens = String(cls).split(/\s+/).filter(Boolean).filter((token) => token !== "active");
      if (isActive) tokens.push("active");
      return ` class=${q}${tokens.join(" ")}${q}`;
    });
    if (isActive) attrs += ` aria-current="page"`;
    return `<a${attrs}>`;
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const MAX_ATTEMPTS = 2;
  const TIMEOUT_MS = 120_000; // 2 minutes per page (pages run in parallel)
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(AI_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
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
      clearTimeout(timeout);
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
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        lastErr = new Error(`Claude ${label} timed out after ${TIMEOUT_MS / 1000}s`);
      } else {
        lastErr = err as Error;
      }
      console.error(`[${label}] attempt ${attempt} failed:`, lastErr.message);
      if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 2000));
    }
  }
  throw lastErr || new Error(`Claude failed: ${label}`);
}

function stripMarkdown(s: string): string {
  return s.replace(/^```(?:html|json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}

function stripCssBody(head: string): string {
  return head.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, cssContent) => {
    const classNames = [...new Set(
      [...cssContent.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[{,]/g)]
        .map((m: RegExpMatchArray) => m[1])
    )].slice(0, 150).join(", ");
    return `<style>/* Existing classes (reuse these): ${classNames} */</style>`;
  });
}