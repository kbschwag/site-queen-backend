import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";

// Staging is hosted on Hostinger at staging.sitequeen.ai → /public_html/staging
const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html/staging";

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

// Upload one HTML page to Hostinger via REST API. Used for staging deploys.
async function uploadToHostinger(
  hostingerToken: string,
  remotePath: string,
  content: string,
): Promise<void> {
  const r = await fetch("https://api.hostinger.com/v1/hosting/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hostingerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: remotePath,
      content: btoa(unescape(encodeURIComponent(content))),
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Hostinger upload failed (${r.status}) for ${remotePath}: ${errText.substring(0, 300)}`);
  }
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
Include all remaining sections: emergency CTA (if applicable), why us, reviews/testimonials, financing (if applicable), service areas, FAQ, final CTA, footer.
Reuse the design system and class naming already established in the first half so every later section is fully styled by the CSS that is already in the document.
Do NOT invent a new naming scheme for second-half sections unless you use inline styles on those elements.
Then include all JavaScript for mobile menu, FAQ accordion, form submit handler, scroll animations, sticky header.
Then include this analytics script just before </body>:

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
Make all phone numbers click-to-call links and email addresses mailto links.

CRITICAL OUTPUT INSTRUCTIONS:
Return ONLY raw HTML — no markdown, no code blocks, no explanation.
Do NOT wrap the response in \`\`\`html fences.
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
    finalHTML = finalHTML.replace(/<link[^>]*href=["']styles\.css["'][^>]*>/gi, "");

    // Safety net: ensure animate-on-scroll elements are ALWAYS visible.
    // Claude often generates `.animate-on-scroll { opacity: 0 }` with an
    // IntersectionObserver to fade in. In iframe previews, mobile, or when
    // the observer misses below-fold elements, sections stay invisible —
    // making the page look completely blank. We force visibility from the
    // start; the fade-in is purely cosmetic and not worth the risk.
    const animateSafetyNet = `
<style>
  /* Force all scroll-animated elements visible (fade-in disabled for reliability) */
  .animate-on-scroll { opacity: 1 !important; transform: none !important; }
</style>
<script>
  // Belt-and-suspenders: also add the .visible class so any code reading it works.
  (function(){
    function reveal(){
      document.querySelectorAll('.animate-on-scroll').forEach(function(el){
        el.classList.add('visible');
      });
    }
    reveal();
    if (document.readyState !== 'complete') window.addEventListener('load', reveal);
  })();
</script>`;
    finalHTML = finalHTML.replace("</body>", animateSafetyNet + "\n</body>");

    // Append Unsplash photo credits comment
    const { heroPhoto, aboutPhoto, whyUsPhoto, emergencyBgPhoto } = ctx.photos || {};
    if (ctx.usingStockPhotos && (heroPhoto || aboutPhoto || whyUsPhoto || emergencyBgPhoto)) {
      const credits = `
<!-- Photo credits (Unsplash):
${heroPhoto ? `  Hero: ${heroPhoto.photographer} on Unsplash (${heroPhoto.unsplash_url})\n` : ""}${aboutPhoto ? `  About: ${aboutPhoto.photographer} on Unsplash (${aboutPhoto.unsplash_url})\n` : ""}${whyUsPhoto ? `  Why us: ${whyUsPhoto.photographer} on Unsplash (${whyUsPhoto.unsplash_url})\n` : ""}${emergencyBgPhoto ? `  Emergency bg: ${emergencyBgPhoto.photographer} on Unsplash (${emergencyBgPhoto.unsplash_url})\n` : ""}  Search terms used: ${(ctx.photoTerms || []).join(", ")}
-->`;
      finalHTML += credits;
    }

    // ── Save final ───────────────────────────────────────────────────────
    // ── Save final ───────────────────────────────────────────────────────
    // Two destinations:
    //   - Hostinger /public_html/staging/{clientId}/index.html — the LIVE
    //     staging copy operators preview at https://staging.sitequeen.ai/...
    //     (links rewritten as no-op, noindex meta injected).
    //   - Supabase storage [clientId]/deploy/index.html — backup + source
    //     of truth for the go-live deploy-to-hostinger step.
    const cleanHTML = finalHTML;
    const stagingHTML = rewriteLinksForStaging(finalHTML);

    // 1) Push staging copy to Hostinger via REST API
    const hostingerToken = Deno.env.get("HOSTINGER_API_TOKEN");
    if (!hostingerToken) throw new Error("HOSTINGER_API_TOKEN not configured");
    try {
      await uploadToHostinger(
        hostingerToken,
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
