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
const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html";

// Staging URL — points at the Hostinger staging subdomain. Real web server,
// real relative links, no router needed.
function buildStagingUrl(clientId: string, page = "index"): string {
  const slug = page.replace(/\.html$/i, "");
  return `${STAGING_BASE_URL}/${clientId}/${slug}.html`;
}

// Rewrite internal page links (./about.html, about.html) so they navigate
// within the same Hostinger staging folder. Because Hostinger serves these
// files at /staging/{clientId}/, plain relative links like "./about.html"
// already work — but we still inject noindex so search engines don't index
// the staging copy. Link rewriting is a no-op here for sibling pages; we
// keep the function so we can still strip stray absolute URLs later if
// needed.
function rewriteLinksForStaging(html: string): string {
  let out = html;

  // Inject noindex once
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
// REST endpoint we used before (`/v1/hosting/files/upload`) does not exist.

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
    await supabase.from("sites").update({ generation_progress: "building_second_half" } as any).eq("client_id", clientId);

    // ── Load first half + sidecar context ────────────────────────────────
    const { data: part1File, error: dlErr } = await supabase.storage.from("generated-sites").download(`${clientId}/part1.html`);
    if (dlErr || !part1File) throw new Error(`Could not load part1.html: ${dlErr?.message}`);
    const firstHalf = await part1File.text();

    const { data: ctxFile, error: ctxErr } = await supabase.storage.from("generated-sites").download(`${clientId}/part2-context.json`);
    if (ctxErr || !ctxFile) throw new Error(`Could not load part2-context.json: ${ctxErr?.message}`);
    const ctx = JSON.parse(await ctxFile.text());

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // ── CALL 2: bottom half ──────────────────────────────────────────────
    const call2Prompt = `You are a professional web developer continuing to build a website for a small business client.

${ctx.sharedContext}

Here is the FIRST HALF already generated (for context — do NOT repeat any of it):
${firstHalf}

INSTRUCTIONS — SECOND HALF:
Generate the SECOND HALF continuing exactly where the first half left off.
Start directly with the next section after services — do NOT repeat <!DOCTYPE html>, <head>, or any CSS.

STRUCTURE RULES (same as first half — maintain consistency):
- Semantic HTML5 elements only. No div soup.
- Same BEM-lite class naming as the first half. No new naming schemes.
- Zero inline styles. Reuse classes already defined in the first half's CSS.
- If you need a new class not in the first half, add a single <style> block before the first new section only — keep it minimal.

SECTIONS TO INCLUDE:
Emergency CTA (if applicable), why us, reviews/testimonials, financing (if applicable), service areas, FAQ, final CTA, footer.
If a section has no real data, remove it entirely. Never render an empty section.

JAVASCRIPT — write ONE <script> block at the very end of <body>, before </body>:
- Vanilla JavaScript only. No jQuery, no lodash, no external libraries.
- Wrap ALL logic in one DOMContentLoaded listener.
- Include: mobile menu toggle with body scroll lock and Escape key handler, FAQ accordion, sticky header on scroll, scroll-reveal animations (default elements to visible — use IntersectionObserver to ADD a class, never start hidden), smooth scroll for anchor links, contact form validation and submit handler.
- No inline event handlers (no onclick=, no onsubmit=). All event listeners added in JS only.
- The <script defer src="./site.js"></script> tag will be injected by post-processing. Do NOT add it yourself.

ANALYTICS — include this script just before </body>, after your main <script> block:

<script>
(function(){
  var CID='${clientId}';
  var EP='${supabaseUrl}/functions/v1/track-event';
  function dt(){return /Mobile|Android|iPhone/i.test(navigator.userAgent)?'mobile':'desktop'}
  function sid(){var s=sessionStorage.getItem('sq_sid');if(!s){s=Math.random().toString(36).substr(2,9);sessionStorage.setItem('sq_sid',s)}return s}
  function t(e,m){fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CID,event_type:e,page_path:location.pathname,page_title:document.title,referrer:document.referrer,device_type:dt(),session_id:sid(),metadata:m||{}})}).catch(function(){})}
  t('page_view');
  document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;if(a.href&&a.href.indexOf('tel:')===0)t('phone_click');if(a.href&&a.href.indexOf('mailto:')===0)t('email_click');if(a.classList.contains('cta-button'))t('cta_click',{text:a.textContent.trim().substring(0,50)})});
  document.addEventListener('submit',function(e){t('form_submission',{form_id:e.target.id||'unknown'})});
})();
</script>

End with </body> and </html> as the absolute last things.
Replace all {{PLACEHOLDERS}} with real client data.
Make all phone numbers tel: links and email addresses mailto: links.

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML — no markdown, no code blocks, no explanation.
Do NOT wrap in \`\`\`html fences.
Do NOT start with <!DOCTYPE html> — start directly with the first section after services.
End with </html> as the very last character.`;

    console.log("[part2] Calling Claude for bottom half…");
    const call2 = await callAI(ANTHROPIC_API_KEY, call2Prompt, "call-2-bottom");
    let secondHalf = stripMarkdown(call2.text);

    // ── Join + validate ──────────────────────────────────────────────────
    let finalHTML = firstHalf + "\n" + secondHalf;
    if (!finalHTML.includes("</html>")) throw new Error("Site incomplete — missing </html>");
    if (!finalHTML.includes("</body>")) throw new Error("Site incomplete — missing </body>");

    // Strip any stray external stylesheet link
    finalHTML = finalHTML.replace(/<link[^>]*href=["']styles?\.css["'][^>]*>/gi, "");

    // ── Extract CSS into site.css ────────────────────────────────────────
    const cssMatch = finalHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const extractedCSS = cssMatch ? cssMatch[1].trim() : "";
    if (!extractedCSS) throw new Error("Generated HTML contains no <style> block — cannot extract site.css");

    // ── Extract JS into site.js ─────────────────────────────────────────
    // Collect all <script> blocks except the analytics snippet (keep that inline)
    const scriptBlocks: string[] = [];
    const analyticsMarker = "(function(){";
    finalHTML = finalHTML.replace(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi, (_match, content) => {
      if (content.includes(analyticsMarker)) return _match; // keep analytics inline
      if (content.trim().length > 0) scriptBlocks.push(content.trim());
      return ""; // remove from HTML
    });
    const extractedJS = scriptBlocks.join("\n\n");

    // ── Rewrite HTML to reference external files ─────────────────────────
    // Replace the <style> block with a <link> to site.css
    finalHTML = finalHTML.replace(/<style[^>]*>[\s\S]*?<\/style>/i,
      `<link rel="stylesheet" href="./site.css" />`
    );
    // Inject site.js <script defer> just before </body>
    finalHTML = finalHTML.replace("</body>",
      `<script defer src="./site.js"></script>\n</body>`
    );

    // ── Animate-on-scroll safety net (goes into site.js, not inline) ─────
    const animateSafetyNet = `
// Belt-and-suspenders: force all scroll-animated elements visible on load
(function(){
  function reveal(){
    document.querySelectorAll('.animate-on-scroll').forEach(function(el){
      el.classList.add('visible');
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reveal);
  } else {
    reveal();
  }
})();`;

    const finalJS = extractedJS + "\n" + animateSafetyNet;

    // ── Build site-meta.json ─────────────────────────────────────────────
    const classNames = [...new Set(
      [...extractedCSS.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[{,]/g)].map(m => m[1])
    )].filter(c => !c.startsWith("animate") && c.length > 1).slice(0, 200);

    const primaryColorMatch = extractedCSS.match(/--color-primary\s*:\s*([^;]+)/);
    const accentColorMatch = extractedCSS.match(/--color-accent\s*:\s*([^;]+)/);
    const fontHeadingMatch = extractedCSS.match(/--font-heading\s*:\s*'([^']+)'/);
    const fontBodyMatch = extractedCSS.match(/--font-body\s*:\s*'([^']+)'/);

    const siteMeta = {
      primaryColor: primaryColorMatch ? primaryColorMatch[1].trim() : "",
      accentColor: accentColorMatch ? accentColorMatch[1].trim() : "",
      fontHeading: fontHeadingMatch ? fontHeadingMatch[1] : "",
      fontBody: fontBodyMatch ? fontBodyMatch[1] : "",
      classes: classNames,
      generatedAt: new Date().toISOString(),
    };

    // Append Unsplash photo credits comment
    const { heroPhoto, aboutPhoto, whyUsPhoto, emergencyBgPhoto } = ctx.photos || {};
    if (ctx.usingStockPhotos && (heroPhoto || aboutPhoto || whyUsPhoto || emergencyBgPhoto)) {
      const credits = `\n<!-- Photo credits (Unsplash):\n${heroPhoto ? `  Hero: ${heroPhoto.photographer} (${heroPhoto.unsplash_url})\n` : ""}${aboutPhoto ? `  About: ${aboutPhoto.photographer} (${aboutPhoto.unsplash_url})\n` : ""}${whyUsPhoto ? `  Why us: ${whyUsPhoto.photographer} (${whyUsPhoto.unsplash_url})\n` : ""}${emergencyBgPhoto ? `  Emergency: ${emergencyBgPhoto.photographer} (${emergencyBgPhoto.unsplash_url})\n` : ""}-->`;
      finalHTML += credits;
    }

    const cleanHTML = finalHTML;
    const stagingHTML = rewriteLinksForStaging(finalHTML);

    // 1) Push staging copy to Hostinger over FTPS
    try {
      await uploadFileToHostingerFtp(
        `${STAGING_FOLDER_ROOT}/${clientId}/index.html`,
        stagingHTML,
      );
      console.log("[part2] ✓ Staging index.html pushed to Hostinger");
    } catch (e: any) {
      console.error("[part2] Hostinger staging upload failed:", e.message);
      throw new Error(`Hostinger staging upload failed: ${e.message}`);
    }

    // 2) Backup clean copy to Supabase storage (deploy folder)
    const { error: cleanErr } = await supabase.storage
      .from("generated-sites")
      .upload(
        `${clientId}/deploy/index.html`,
        new Blob([cleanHTML], { type: "text/html" }),
        { upsert: true, contentType: "text/html; charset=utf-8" },
      );
    if (cleanErr) {
      console.error("[part2] Deploy backup upload failed:", cleanErr);
      throw new Error(`Failed to save deploy/index.html backup: ${cleanErr.message}`);
    }
    console.log("[part2] ✓ Clean deploy backup saved to storage");

    // ── Upload site.css ──────────────────────────────────────────────────
    try {
      await uploadFileToHostingerFtp(
        `${STAGING_FOLDER_ROOT}/${clientId}/site.css`,
        extractedCSS,
      );
      console.log("[part2] ✓ site.css pushed to Hostinger staging");
    } catch (e: any) {
      console.error("[part2] site.css Hostinger upload failed:", e.message);
      throw new Error(`Hostinger site.css upload failed: ${e.message}`);
    }

    const { error: cssErr } = await supabase.storage
      .from("generated-sites")
      .upload(
        `${clientId}/deploy/site.css`,
        new Blob([extractedCSS], { type: "text/css" }),
        { upsert: true, contentType: "text/css; charset=utf-8" },
      );
    if (cssErr) throw new Error(`Failed to save deploy/site.css: ${cssErr.message}`);
    console.log("[part2] ✓ site.css deploy backup saved");

    // ── Upload site.js ───────────────────────────────────────────────────
    try {
      await uploadFileToHostingerFtp(
        `${STAGING_FOLDER_ROOT}/${clientId}/site.js`,
        finalJS,
      );
      console.log("[part2] ✓ site.js pushed to Hostinger staging");
    } catch (e: any) {
      console.error("[part2] site.js Hostinger upload failed:", e.message);
      throw new Error(`Hostinger site.js upload failed: ${e.message}`);
    }

    const { error: jsErr } = await supabase.storage
      .from("generated-sites")
      .upload(
        `${clientId}/deploy/site.js`,
        new Blob([finalJS], { type: "application/javascript" }),
        { upsert: true, contentType: "application/javascript; charset=utf-8" },
      );
    if (jsErr) throw new Error(`Failed to save deploy/site.js: ${jsErr.message}`);
    console.log("[part2] ✓ site.js deploy backup saved");

    // ── Upload site-meta.json ────────────────────────────────────────────
    const { error: metaErr } = await supabase.storage
      .from("generated-sites")
      .upload(
        `${clientId}/deploy/site-meta.json`,
        new Blob([JSON.stringify(siteMeta, null, 2)], { type: "application/json" }),
        { upsert: true, contentType: "application/json; charset=utf-8" },
      );
    if (metaErr) console.error("[part2] site-meta.json upload failed (non-fatal):", metaErr);
    else console.log("[part2] ✓ site-meta.json saved");

    // Cleanup intermediate files (best-effort)
    await supabase.storage.from("generated-sites").remove([
      `${clientId}/part1.html`,
      `${clientId}/part2-context.json`,
    ]).catch(() => {});

    const stagingURL = buildStagingUrl(clientId, "index");

    await supabase.from("sites").update({
      generation_status: "complete",
      generation_progress: "complete",
      generated_at: new Date().toISOString(),
      staging_url: stagingURL,
      site_status: "review",
    } as any).eq("client_id", clientId);

    await supabase.from("notifications").insert({
      type: "site_ready_for_review",
      client_id: clientId,
      message: `${ctx.businessName} website is ready for your review`,
      staging_url: stagingURL,
      target_role: "operator",
    });

    const totalOutputTokens = (ctx.call1OutputTokens || 0) + (call2.outputTokens || 0);
    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: ctx.templateId || "scratch",
      status: "complete",
      tokens_used: totalOutputTokens || null,
      generation_notes: `Two-function split. Part 1: ${ctx.call1OutputTokens} tokens. Part 2: ${call2.outputTokens} tokens. Model: ${AI_MODEL}.`,
    } as any);

    console.log(`[part2] ✓ Complete for ${clientId} → ${stagingURL}`);

    // ── Fire extra-pages generator (about, services, contact, …) ────────
    fetch(`${supabaseUrl}/functions/v1/generate-extra-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ client_id: clientId }),
    }).catch((e) => console.error("[part2] Failed to dispatch extra pages:", e));

    return new Response(JSON.stringify({ success: true, staging_url: stagingURL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[part2] error:", error);
    await markFailed(supabase, clientId, `Part 2 failed: ${error.message}`);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const MAX_ATTEMPTS = 2;
  const TIMEOUT_MS = 90_000; // 90 seconds — clean error instead of silent hang
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
    await supabase.from("notifications").insert({
      type: "site_generation_failed",
      client_id: clientId,
      message: "Site generation failed — manual review needed",
      target_role: "operator",
    });
  } catch (e) {
    console.error("[part2] failed to mark failure:", e);
  }
}
