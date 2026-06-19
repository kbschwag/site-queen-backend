// change-request-apply
// Loads an awaiting_confirmation job, runs the executor for its tool, snapshots first,
// writes updated files and pushes to Hostinger.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders, json, ALL_PAGE_FILES, loadDeployedHtml, snapshotDeploy,
  uploadAndPushFile, FIELD_INTAKE_KEYS, getCurrentFieldValue, VISUAL_TOKEN_ALIASES,
  findSectionBlock, IMAGE_SLOT_KEYS,
} from "../_shared/change-request-shared.ts";
import { requireUser } from "../_shared/auth.ts";

const FALLBACK_MODEL = "claude-opus-4-20250514";

function pageFile(t: string): string {
  const m: Record<string, string> = { index: "index.html", about: "about.html", services: "services.html", contact: "contact.html" };
  return m[t] || "";
}

interface ExecContext {
  clientId: string;
  supabase: any;
  deployedHtml: Record<string, string>;
  intake: any;
  uploadedFileUrl: string | null;
  anthropicKey: string;
  cachedCurrentValue?: string | null;
}
interface ExecResult { editedFiles: string[]; changesCount: number; updatedFiles: Record<string, string>; }

// ─── update_data_field ──────────────────────────────────────────────────────
async function execUpdateDataField(params: any, ctx: ExecContext): Promise<ExecResult> {
  let cur: string | null = ctx.cachedCurrentValue && ctx.cachedCurrentValue.trim()
    ? ctx.cachedCurrentValue
    : getCurrentFieldValue(ctx.intake, params.field) || null;

  // Fallback: run extraction now if neither cache nor intake had it.
  if (!cur) {
    const { extractCurrentValue } = await import("../_shared/extract-current-value.ts");
    const r = await extractCurrentValue({
      field: params.field,
      intake: ctx.intake,
      deployedHtml: ctx.deployedHtml,
      anthropicKey: ctx.anthropicKey,
    });
    cur = r.value;
  }

  if (!cur) throw new Error(`Could not determine current value for ${params.field}. Not in intake or deployed HTML.`);
  if (cur === params.new_value) throw new Error(`Field already equals "${params.new_value}"`);

  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  let changes = 0;
  for (const [f, html] of Object.entries(ctx.deployedHtml)) {
    if (!html.includes(cur)) continue;
    const occ = html.split(cur).length - 1;
    const updated = html.split(cur).join(params.new_value);
    updatedFiles[f] = updated;
    edited.push(f);
    changes += occ;
  }
  // Persist back into intake_data
  const keys = FIELD_INTAKE_KEYS[params.field] || [params.field];
  const nextIntake = { ...(ctx.intake || {}) };
  nextIntake[keys[0]] = params.new_value;
  await ctx.supabase.from("sites").update({ intake_data: nextIntake }).eq("client_id", ctx.clientId);
  return { editedFiles: edited, changesCount: changes, updatedFiles };
}

// ─── update_visual_token ────────────────────────────────────────────────────
async function execUpdateVisualToken(params: any, ctx: ExecContext): Promise<ExecResult> {
  const aliasList = VISUAL_TOKEN_ALIASES[params.token] || [`--${params.token}`];
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  let changes = 0;

  for (const [f, html] of Object.entries(ctx.deployedHtml)) {
    const rootMatch = html.match(/(:root\s*\{)([\s\S]*?)(\})/);
    if (!rootMatch) continue;
    const defined = Array.from(rootMatch[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)).map((m) => m[1]);
    const target = aliasList.find((a) => defined.includes(a));
    if (!target) continue;
    const declRe = new RegExp(`(${target.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`);
    const newRoot = rootMatch[0].replace(declRe, `$1${params.new_value}$3`);
    if (newRoot === rootMatch[0]) continue;
    updatedFiles[f] = html.replace(rootMatch[0], newRoot);
    edited.push(f);
    changes++;
  }
  if (edited.length === 0) throw new Error(`No matching CSS variable for ${params.token} found in :root`);
  return { editedFiles: edited, changesCount: changes, updatedFiles };
}

// ─── update_text_content ────────────────────────────────────────────────────
async function execUpdateTextContent(params: any, ctx: ExecContext): Promise<ExecResult> {
  const targets = params.target_page === "all" ? Object.keys(ctx.deployedHtml) : [pageFile(params.target_page)];
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  let changes = 0;
  for (const f of targets) {
    const html = ctx.deployedHtml[f];
    if (!html?.includes(params.current_text)) continue;
    const occ = html.split(params.current_text).length - 1;
    if (occ > 1 && params.target_page !== "all") {
      throw new Error(`"${params.current_text}" appears ${occ} times on ${f} — be more specific`);
    }
    updatedFiles[f] = html.split(params.current_text).join(params.new_text);
    edited.push(f);
    changes += occ;
  }
  if (edited.length === 0) throw new Error(`Could not find "${params.current_text}" on target page(s)`);
  return { editedFiles: edited, changesCount: changes, updatedFiles };
}

// ─── replace_media ──────────────────────────────────────────────────────────
async function execReplaceMedia(params: any, ctx: ExecContext): Promise<ExecResult> {
  if (!ctx.uploadedFileUrl) throw new Error("replace_media called but no file was uploaded");
  const targets = params.target_page === "all" ? Object.keys(ctx.deployedHtml) : [pageFile(params.target_page)];
  const keys = IMAGE_SLOT_KEYS[params.slot] || [params.slot];

  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  let changes = 0;

  for (const f of targets) {
    const html = ctx.deployedHtml[f];
    if (!html) continue;

    if (params.slot === "favicon") {
      const r = html.replace(/(<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["'])([^"']+)(["'])/i, `$1${ctx.uploadedFileUrl}$3`);
      if (r !== html) { updatedFiles[f] = r; edited.push(f); changes++; }
      continue;
    }

    // Find first <img> whose surrounding markup mentions one of the slot keys
    const imgRe = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    let replaced = false;
    let newHtml = html;
    while ((m = imgRe.exec(html)) !== null) {
      const surround = html.slice(Math.max(0, m.index - 300), m.index + m[0].length + 300).toLowerCase();
      if (keys.some((k) => surround.includes(k))) {
        newHtml = html.slice(0, m.index) +
          m[0].replace(m[1], ctx.uploadedFileUrl) +
          html.slice(m.index + m[0].length);
        replaced = true;
        break;
      }
    }
    if (replaced) { updatedFiles[f] = newHtml; edited.push(f); changes++; }
  }
  if (edited.length === 0) throw new Error(`Couldn't locate the ${params.slot} image to replace`);
  return { editedFiles: edited, changesCount: changes, updatedFiles };
}

// ─── remove_section ─────────────────────────────────────────────────────────
async function execRemoveSection(params: any, ctx: ExecContext): Promise<ExecResult> {
  const targets = params.target_page === "all" ? Object.keys(ctx.deployedHtml) : [pageFile(params.target_page)];
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  for (const f of targets) {
    const html = ctx.deployedHtml[f];
    if (!html) continue;
    const block = findSectionBlock(html, params.section_identifier);
    if (!block) continue;
    updatedFiles[f] = html.replace(block, "");
    edited.push(f);
  }
  if (edited.length === 0) throw new Error(`No section matching "${params.section_identifier}" found`);
  return { editedFiles: edited, changesCount: edited.length, updatedFiles };
}

// ─── toggle_section_visibility ──────────────────────────────────────────────
async function execToggleVisibility(params: any, ctx: ExecContext): Promise<ExecResult> {
  const targets = params.target_page === "all" ? Object.keys(ctx.deployedHtml) : [pageFile(params.target_page)];
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  for (const f of targets) {
    const html = ctx.deployedHtml[f];
    if (!html) continue;
    const block = findSectionBlock(html, params.section_identifier);
    if (!block) continue;
    const openTagMatch = block.match(/^<([a-z0-9]+)\b([^>]*)>/i);
    if (!openTagMatch) continue;
    const [openTag, tagName, attrs] = openTagMatch;
    let newAttrs = attrs;
    if (params.visible) {
      newAttrs = attrs
        .replace(/\sstyle=["']([^"']*)display\s*:\s*none;?\s*([^"']*)["']/i, (_m, a, b) => ` style="${(a + b).trim()}"`)
        .replace(/\sstyle=["']\s*["']/i, "");
    } else {
      if (/\sstyle=["']/.test(attrs)) {
        newAttrs = attrs.replace(/(\sstyle=["'])([^"']*)(["'])/i, (_m, p, s, q) => `${p}display:none;${s}${q}`);
      } else {
        newAttrs = `${attrs} style="display:none"`;
      }
    }
    const newOpen = `<${tagName}${newAttrs}>`;
    updatedFiles[f] = html.replace(openTag, newOpen);
    edited.push(f);
  }
  if (edited.length === 0) throw new Error(`No section matching "${params.section_identifier}" found`);
  return { editedFiles: edited, changesCount: edited.length, updatedFiles };
}

// ─── add_item_to_collection ─────────────────────────────────────────────────
// Uses Claude to generate a duplicate item using the existing pattern as template.
async function execAddItem(params: any, ctx: ExecContext): Promise<ExecResult> {
  const collectionToKeyword: Record<string, string> = {
    services: "services", testimonials: "testimonials", faqs: "faq",
    team: "team", service_areas: "service area", social_platforms: "social", footer_links: "footer",
  };
  const kw = collectionToKeyword[params.collection] || params.collection;
  const targetFile = ctx.deployedHtml["index.html"] || ctx.deployedHtml["services.html"];
  if (!targetFile) throw new Error("No page found containing the target collection");

  // Find which file actually contains the collection
  let targetFilename = "";
  let html = "";
  for (const f of ["index.html", "services.html", "about.html", "contact.html"]) {
    const h = ctx.deployedHtml[f];
    if (h && findSectionBlock(h, kw)) { targetFilename = f; html = h; break; }
  }
  if (!targetFilename) throw new Error(`Couldn't find ${params.collection} section in any deployed page`);

  const section = findSectionBlock(html, kw)!;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ctx.anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      max_tokens: 3000,
      system: `You are a precise HTML editor. Return ONLY a JSON object {"find": "...", "replace": "..."} — no commentary. "find" must be a verbatim substring appearing exactly once. "replace" starts with the same content as "find" and then appends one new item using IDENTICAL classes and structure.`,
      messages: [{
        role: "user",
        content: `Add this new item to the ${params.collection} collection: ${JSON.stringify(params.new_item)}\n\nHere is the existing section (use the last existing item as your template):\n\n${section}`,
      }],
    }),
  });
  if (!aiRes.ok) throw new Error(`AI error generating new item: ${aiRes.status}`);
  const aiJson = await aiRes.json();
  const raw: string = aiJson?.content?.[0]?.text ?? "";
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  const patch = JSON.parse(cleaned.slice(start, end + 1));
  if (!patch.find || !patch.replace || !patch.replace.startsWith(patch.find)) {
    throw new Error("AI returned invalid additive patch");
  }
  const occ = html.split(patch.find).length - 1;
  if (occ !== 1) throw new Error(`Additive patch target not unique (${occ} matches)`);
  return { editedFiles: [targetFilename], changesCount: 1, updatedFiles: { [targetFilename]: html.replace(patch.find, patch.replace) } };
}

// ─── remove_item_from_collection ────────────────────────────────────────────
async function execRemoveItem(params: any, ctx: ExecContext): Promise<ExecResult> {
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  for (const [f, html] of Object.entries(ctx.deployedHtml)) {
    // Find the smallest list-item-like wrapper that contains the identifier
    const idLower = params.identifier.toLowerCase();
    if (!html.toLowerCase().includes(idLower)) continue;
    const wrapRe = /<(li|article|div|a)\b[^>]*>[\s\S]*?<\/\1>/gi;
    let m: RegExpExecArray | null;
    let removedBlock: string | null = null;
    while ((m = wrapRe.exec(html)) !== null) {
      if (m[0].toLowerCase().includes(idLower) && m[0].length < 4000) {
        if (!removedBlock || m[0].length < removedBlock.length) removedBlock = m[0];
      }
    }
    if (!removedBlock) continue;
    updatedFiles[f] = html.replace(removedBlock, "");
    edited.push(f);
  }
  if (edited.length === 0) throw new Error(`Couldn't find an item matching "${params.identifier}"`);
  return { editedFiles: edited, changesCount: edited.length, updatedFiles };
}

// ─── reorder_collection (best-effort fallback) ──────────────────────────────
async function execReorder(_params: any, _ctx: ExecContext): Promise<ExecResult> {
  throw new Error("Reordering collections is not yet supported — please make the change as a manual code edit.");
}

// ─── add_section (uses AI to generate matching markup) ──────────────────────
async function execAddSection(params: any, ctx: ExecContext): Promise<ExecResult> {
  const f = pageFile(params.target_page);
  const html = ctx.deployedHtml[f];
  if (!html) throw new Error(`Page ${params.target_page} not deployed`);
  const anchorBlock = findSectionBlock(html, params.position?.anchor || "footer");
  if (!anchorBlock) throw new Error(`Couldn't find anchor section "${params.position?.anchor}"`);

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ctx.anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      max_tokens: 2500,
      system: `You generate a single HTML <section> using the same CSS classes already present in the page. Return ONLY the raw <section>...</section> HTML, no commentary or code fences.`,
      messages: [{
        role: "user",
        content: `Generate a "${params.section_type}" section for this page. Content: ${JSON.stringify(params.content)}.\n\nHere is the anchor section showing the style/classes used on this page:\n${anchorBlock.slice(0, 2000)}`,
      }],
    }),
  });
  if (!aiRes.ok) throw new Error(`AI error generating section: ${aiRes.status}`);
  const aiJson = await aiRes.json();
  let sectionHtml: string = (aiJson?.content?.[0]?.text ?? "").trim();
  sectionHtml = sectionHtml.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!/^<section/i.test(sectionHtml)) throw new Error("AI did not return a <section>");

  const replacement = params.position?.placement === "before"
    ? `${sectionHtml}\n${anchorBlock}`
    : `${anchorBlock}\n${sectionHtml}`;
  return { editedFiles: [f], changesCount: 1, updatedFiles: { [f]: html.replace(anchorBlock, replacement) } };
}

// ─── update_metadata ────────────────────────────────────────────────────────
async function execUpdateMetadata(params: any, ctx: ExecContext): Promise<ExecResult> {
  const targets = !params.target_page || params.target_page === "all"
    ? Object.keys(ctx.deployedHtml)
    : [pageFile(params.target_page)];
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];

  for (const f of targets) {
    const html = ctx.deployedHtml[f];
    if (!html) continue;
    let next = html;
    const v = String(params.new_value);

    switch (params.field) {
      case "meta_title":
        next = /<title>[\s\S]*?<\/title>/i.test(next)
          ? next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${v}</title>`)
          : next.replace(/<head[^>]*>/i, (m) => `${m}\n  <title>${v}</title>`);
        break;
      case "meta_description":
        next = /<meta[^>]+name=["']description["'][^>]*>/i.test(next)
          ? next.replace(/<meta[^>]+name=["']description["'][^>]*>/i, `<meta name="description" content="${v}">`)
          : next.replace(/<\/head>/i, `  <meta name="description" content="${v}">\n</head>`);
        break;
      case "og_image_url":
        next = /<meta[^>]+property=["']og:image["'][^>]*>/i.test(next)
          ? next.replace(/<meta[^>]+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${v}">`)
          : next.replace(/<\/head>/i, `  <meta property="og:image" content="${v}">\n</head>`);
        break;
      case "google_analytics_id": {
        const ga = `<!-- GA -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${v}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${v}');</script>`;
        next = next.replace(/<!-- GA -->[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/i, ga);
        if (!next.includes(v)) next = next.replace(/<\/head>/i, `${ga}\n</head>`);
        break;
      }
      case "facebook_pixel_id": {
        const fb = `<!-- FB Pixel ${v} -->\n<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${v}');fbq('track','PageView');</script>`;
        next = next.replace(/<!-- FB Pixel [^>]+?-->[\s\S]*?<\/script>/i, fb);
        if (!next.includes(v)) next = next.replace(/<\/head>/i, `${fb}\n</head>`);
        break;
      }
      case "google_tag_manager_id": {
        const gtm = `<!-- GTM -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${v}');</script>`;
        next = next.replace(/<!-- GTM -->[\s\S]*?<\/script>/i, gtm);
        if (!next.includes(v)) next = next.replace(/<\/head>/i, `${gtm}\n</head>`);
        break;
      }
      default:
        throw new Error(`Metadata field ${params.field} not implemented for direct edit`);
    }
    if (next !== html) { updatedFiles[f] = next; edited.push(f); }
  }
  if (edited.length === 0) throw new Error("No metadata changes applied");
  return { editedFiles: edited, changesCount: edited.length, updatedFiles };
}

// ─── update_settings ────────────────────────────────────────────────────────
async function execUpdateSettings(params: any, ctx: ExecContext): Promise<ExecResult> {
  const updatedFiles: Record<string, string> = {};
  const edited: string[] = [];
  for (const [f, html] of Object.entries(ctx.deployedHtml)) {
    let next = html;
    const marker = `<!-- siteq:setting:${params.setting} -->`;
    // Remove any prior injection
    next = next.replace(new RegExp(`${marker}[\\s\\S]*?<!-- /siteq -->`, "g"), "");
    let injection = "";
    switch (params.setting) {
      case "sticky_nav":
        injection = params.new_value
          ? `${marker}<style>nav,header{position:sticky !important;top:0;z-index:100}</style><!-- /siteq -->`
          : `${marker}<style>nav,header{position:static !important}</style><!-- /siteq -->`;
        break;
      case "animations_enabled":
        injection = params.new_value
          ? `${marker}<!-- /siteq -->`
          : `${marker}<style>*,*::before,*::after{animation:none !important;transition:none !important}</style><!-- /siteq -->`;
        break;
      case "smooth_scroll":
        injection = `${marker}<style>html{scroll-behavior:${params.new_value ? "smooth" : "auto"} !important}</style><!-- /siteq -->`;
        break;
      case "maintenance_mode":
        injection = params.new_value
          ? `${marker}<style>body>*{display:none !important}body::before{content:"We'll be right back — site under maintenance.";display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;font-size:1.5rem;text-align:center;padding:2rem}</style><!-- /siteq -->`
          : `${marker}<!-- /siteq -->`;
        break;
      case "cookie_banner_enabled":
      case "password_protected":
        throw new Error(`Setting "${params.setting}" requires manual integration — not yet supported via change request`);
      default:
        throw new Error(`Unknown setting: ${params.setting}`);
    }
    next = next.replace(/<\/head>/i, `${injection}\n</head>`);
    if (next !== html) { updatedFiles[f] = next; edited.push(f); }
  }
  if (edited.length === 0) throw new Error("Setting update produced no changes");
  return { editedFiles: edited, changesCount: edited.length, updatedFiles };
}

// ─── Fallback: full-page AI patch (when operator opts in) ───────────────────
async function execFallback(instruction: string, ctx: ExecContext): Promise<ExecResult> {
  const primary = ctx.deployedHtml["index.html"];
  if (!primary) throw new Error("No homepage to fall back on");

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ctx.anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: FALLBACK_MODEL,
      max_tokens: 4000,
      system: `You are a precise HTML editor. Return ONLY a JSON object {"find":"...","replace":"..."} — "find" must be a verbatim substring of the page appearing exactly once.`,
      messages: [{
        role: "user",
        content: `CHANGE REQUEST: ${instruction}\n\nHOMEPAGE HTML:\n${primary}`,
      }],
    }),
  });
  if (!aiRes.ok) throw new Error(`Fallback AI error: ${aiRes.status}`);
  const aiJson = await aiRes.json();
  const raw: string = aiJson?.content?.[0]?.text ?? "";
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  const patch = JSON.parse(cleaned.slice(s, e + 1));
  if (!patch.find || patch.replace === undefined) throw new Error("Fallback returned invalid patch");
  const occ = primary.split(patch.find).length - 1;
  if (occ !== 1) throw new Error(`Fallback patch ambiguous (${occ} matches)`);
  return { editedFiles: ["index.html"], changesCount: 1, updatedFiles: { "index.html": primary.replace(patch.find, patch.replace) } };
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
async function executeTool(tool: string, params: any, ctx: ExecContext, instruction: string): Promise<ExecResult> {
  switch (tool) {
    case "update_data_field": return execUpdateDataField(params, ctx);
    case "update_visual_token": return execUpdateVisualToken(params, ctx);
    case "update_text_content": return execUpdateTextContent(params, ctx);
    case "replace_media": return execReplaceMedia(params, ctx);
    case "remove_section": return execRemoveSection(params, ctx);
    case "toggle_section_visibility": return execToggleVisibility(params, ctx);
    case "add_item_to_collection": return execAddItem(params, ctx);
    case "remove_item_from_collection": return execRemoveItem(params, ctx);
    case "reorder_collection": return execReorder(params, ctx);
    case "add_section": return execAddSection(params, ctx);
    case "update_metadata": return execUpdateMetadata(params, ctx);
    case "update_settings": return execUpdateSettings(params, ctx);
    case "fallback":
    case "fallback_offered":
      return execFallback(instruction, ctx);
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

async function logEdit(supabase: any, clientId: string, opId: string, opEmail: string | null, instruction: string, status: string, err: string | null) {
  try {
    await supabase.from("operator_edits").insert({
      client_id: clientId,
      operator_id: opId,
      operator_email: opEmail,
      instruction,
      status,
      model_used: FALLBACK_MODEL,
      error_message: err,
    });
  } catch (e) { console.error("logEdit failed", e); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const authed = await requireUser(req, corsHeaders);
  if (authed instanceof Response) return authed;
  const caller = authed.user;
  const supabase = authed.supabase;

  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    supabase.from("profiles").select("role, email").eq("user_id", caller.id).maybeSingle(),
  ]);
  const isOperator = !!roleRow || profileRow?.role === "partner" || profileRow?.role === "admin";
  if (!isOperator) return json({ error: "Operator access required" }, 403);

  try {
    const body = await req.json();
    const jobId = (body.job_id || "").toString();
    const useFallback = !!body.use_fallback;
    if (!jobId) return json({ error: "job_id required" }, 400);

    const { data: job, error: jobErr } = await supabase.from("quick_edit_jobs").select("*").eq("id", jobId).maybeSingle();
    if (jobErr || !job) return json({ error: "Job not found" }, 404);
    if (job.status !== "awaiting_confirmation") {
      return json({ error: `Job is in status "${job.status}" — only awaiting_confirmation can be applied` }, 400);
    }

    await supabase.from("quick_edit_jobs").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", jobId);

    const clientId = job.client_id;
    const [deployedHtml, siteRow] = await Promise.all([
      loadDeployedHtml(supabase, clientId),
      supabase.from("sites").select("intake_data").eq("client_id", clientId).maybeSingle(),
    ]);
    const intake = (siteRow.data as any)?.intake_data || {};

    if (Object.keys(deployedHtml).length === 0) {
      throw new Error("No deployed pages to edit");
    }

    // Snapshot
    const versionTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filesSaved = await snapshotDeploy(supabase, clientId, versionTimestamp);
    if (filesSaved.length === 0) throw new Error("Snapshot failed — no files saved");
    await supabase.from("site_versions").insert({
      client_id: clientId,
      timestamp: versionTimestamp,
      instruction: job.instruction,
      files_saved: filesSaved,
      restored: false,
      created_by: caller.id,
    });

    const plan = job.plan as any;
    const isAuditPlan = !!(plan && plan.is_audit_plan);

    const ctx: ExecContext = {
      clientId, supabase, deployedHtml, intake,
      uploadedFileUrl: job.uploaded_file_url || null,
      anthropicKey,
      cachedCurrentValue: (job as any).current_value || null,
    };

    let totalEditedFiles: string[] = [];
    let totalChanges = 0;
    let subFixResults: Array<{ id: string; description: string; status: "success" | "failed"; error?: string; edited_files?: string[]; changes?: number }> | null = null;
    let toolForLog = "";

    if (isAuditPlan) {
      toolForLog = "audit_and_fix";
      const enabledIds: string[] = Array.isArray(body.enabled_sub_fix_ids) && body.enabled_sub_fix_ids.length
        ? body.enabled_sub_fix_ids
        : (job.enabled_sub_fix_ids || plan.sub_fixes.filter((f: any) => f.enabled_by_default).map((f: any) => f.id));
      const enabled = (plan.sub_fixes || []).filter((f: any) => enabledIds.includes(f.id));

      subFixResults = [];
      const editedSet = new Set<string>();
      const aggregateUpdates: Record<string, string> = {};

      for (const fix of enabled) {
        try {
          // Refresh ctx.deployedHtml with prior accumulated updates so sequential fixes compose
          const composedHtml: Record<string, string> = { ...deployedHtml, ...aggregateUpdates };
          const subCtx: ExecContext = { ...ctx, deployedHtml: composedHtml };
          const r = await executeTool(fix.tool, fix.params, subCtx, job.instruction);
          for (const [f, h] of Object.entries(r.updatedFiles)) {
            aggregateUpdates[f] = h;
            editedSet.add(f);
          }
          totalChanges += r.changesCount || 0;
          subFixResults.push({
            id: fix.id, description: fix.description, status: "success",
            edited_files: r.editedFiles, changes: r.changesCount,
          });
        } catch (e: any) {
          subFixResults.push({
            id: fix.id, description: fix.description, status: "failed",
            error: e.message ?? String(e),
          });
          // continue with next fix
        }
      }

      totalEditedFiles = Array.from(editedSet);
      // Push every aggregated file once
      for (const [filename, html] of Object.entries(aggregateUpdates)) {
        await uploadAndPushFile(supabase, clientId, filename, html);
      }
    } else {
      const tool = useFallback ? "fallback" : job.tool_used;
      toolForLog = tool;
      if (!tool || tool === "clarify") {
        throw new Error("Cannot apply this job — no actionable tool was selected");
      }
      const result = await executeTool(tool, job.tool_params, ctx, job.instruction);
      for (const [filename, html] of Object.entries(result.updatedFiles)) {
        await uploadAndPushFile(supabase, clientId, filename, html);
      }
      totalEditedFiles = result.editedFiles;
      totalChanges = result.changesCount;
    }

    // Update sites metadata
    const { data: siteMeta } = await supabase.from("sites").select("operator_edit_count").eq("client_id", clientId).maybeSingle();
    await supabase.from("sites").update({
      last_updated: new Date().toISOString(),
      operator_edit_count: ((siteMeta as any)?.operator_edit_count ?? 0) + 1,
    }).eq("client_id", clientId);

    await supabase.from("quick_edit_jobs").update({
      status: "completed",
      version_timestamp: versionTimestamp,
      edited_files: totalEditedFiles,
      changes_count: totalChanges,
      used_fallback: useFallback,
      sub_fix_results: subFixResults,
      enabled_sub_fix_ids: isAuditPlan ? (body.enabled_sub_fix_ids || job.enabled_sub_fix_ids || null) : null,
      confirmed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    const operatorEmail = profileRow?.email ?? caller.email ?? null;
    await logEdit(supabase, clientId, caller.id, operatorEmail,
      `[${toolForLog}${useFallback ? "+fallback" : ""}] ${job.instruction}`, "completed", null);

    return json({
      success: true,
      edited_files: totalEditedFiles,
      changes_made: totalChanges,
      version_timestamp: versionTimestamp,
      sub_fix_results: subFixResults,
      is_audit_plan: isAuditPlan,
    });

  } catch (e: any) {
    console.error("change-request-apply error:", e);
    try {
      const body = await req.clone().json().catch(() => ({}));
      const jobId = (body as any).job_id;
      if (jobId) {
        await supabase.from("quick_edit_jobs").update({
          status: "failed",
          error_message: e.message ?? String(e),
          completed_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
    } catch {}
    return json({ error: e.message ?? "Unknown error" }, 500);
  }
});
