// change-request-preview
// Reads operator instruction, calls Claude with tool definitions, returns a plan.
// Writes plan + tool params to quick_edit_jobs. UI calls change-request-apply on confirm.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  corsHeaders, json, ALL_PAGE_FILES, loadDeployedHtml,
  FIELD_INTAKE_KEYS, getCurrentFieldValue,
} from "../_shared/change-request-shared.ts";

const MODEL = "claude-sonnet-4-20250514";

const TOOLS = [
  {
    name: "update_data_field",
    description: "Update a structured business data field that appears in multiple places on the site (name, phone, email, address, hours, social URLs, booking URL, tagline, etc). Finds every occurrence of the current value and replaces it.",
    input_schema: {
      type: "object",
      required: ["field", "new_value", "reason"],
      properties: {
        field: {
          type: "string",
          enum: Object.keys(FIELD_INTAKE_KEYS),
        },
        new_value: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "update_visual_token",
    description: "Update a site-wide design token: colors, fonts, border radius. Cascades across all pages via the :root CSS block.",
    input_schema: {
      type: "object",
      required: ["token", "new_value", "reason"],
      properties: {
        token: { type: "string", description: "e.g. primary-color, accent-color, heading-font, body-font, border-radius" },
        new_value: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "update_text_content",
    description: "Update specific copy (headline, paragraph, button label) on a specific page. Use only when the change is not a structured data field.",
    input_schema: {
      type: "object",
      required: ["target_page", "current_text", "new_text", "reason"],
      properties: {
        target_page: { type: "string", enum: ["index", "about", "services", "contact", "all"] },
        target_section: { type: "string" },
        current_text: { type: "string", description: "Exact unique substring to replace" },
        new_text: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "replace_media",
    description: "Replace an image at a defined slot with the operator's uploaded file. Requires an uploaded_file_url in context.",
    input_schema: {
      type: "object",
      required: ["slot", "target_page", "reason"],
      properties: {
        slot: {
          type: "string",
          enum: ["hero_image", "about_image", "why_us_image",
            "service_1_image", "service_2_image", "service_3_image", "service_4_image", "service_5_image",
            "logo", "favicon", "transformation_image", "lead_magnet_image"],
        },
        target_page: { type: "string", enum: ["index", "about", "services", "contact", "all"] },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "add_item_to_collection",
    description: "Add a new item to a list (services, testimonials, FAQs, team, service areas, social platforms, footer links).",
    input_schema: {
      type: "object",
      required: ["collection", "new_item", "reason"],
      properties: {
        collection: { type: "string", enum: ["services", "testimonials", "faqs", "team", "service_areas", "social_platforms", "footer_links"] },
        new_item: { type: "object" },
        position: { type: "string", enum: ["start", "end"] },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "remove_item_from_collection",
    description: "Remove a specific item from a collection by unique identifier text.",
    input_schema: {
      type: "object",
      required: ["collection", "identifier", "reason"],
      properties: {
        collection: { type: "string", enum: ["services", "testimonials", "faqs", "team", "service_areas", "social_platforms", "footer_links"] },
        identifier: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "reorder_collection",
    description: "Reorder items in a collection by identifiers.",
    input_schema: {
      type: "object",
      required: ["collection", "new_order", "reason"],
      properties: {
        collection: { type: "string", enum: ["services", "testimonials", "faqs", "team", "service_areas", "nav_links"] },
        new_order: { type: "array", items: { type: "string" } },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "remove_section",
    description: "Delete an entire section from a page.",
    input_schema: {
      type: "object",
      required: ["target_page", "section_identifier", "reason"],
      properties: {
        target_page: { type: "string", enum: ["index", "about", "services", "contact", "all"] },
        section_identifier: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "toggle_section_visibility",
    description: "Hide or show a section without deleting it (display:none).",
    input_schema: {
      type: "object",
      required: ["target_page", "section_identifier", "visible", "reason"],
      properties: {
        target_page: { type: "string", enum: ["index", "about", "services", "contact", "all"] },
        section_identifier: { type: "string" },
        visible: { type: "boolean" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "add_section",
    description: "Add a new section to a page using template-consistent classes.",
    input_schema: {
      type: "object",
      required: ["target_page", "section_type", "position", "content", "reason"],
      properties: {
        target_page: { type: "string", enum: ["index", "about", "services", "contact"] },
        section_type: { type: "string" },
        position: {
          type: "object",
          properties: {
            anchor: { type: "string" },
            placement: { type: "string", enum: ["before", "after"] },
          },
        },
        content: { type: "object" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "update_metadata",
    description: "Update SEO / social / tracking metadata.",
    input_schema: {
      type: "object",
      required: ["field", "new_value", "reason"],
      properties: {
        field: {
          type: "string",
          enum: ["meta_title", "meta_description", "og_image_url",
            "google_analytics_id", "facebook_pixel_id", "google_tag_manager_id",
            "schema_business_type", "schema_price_range"],
        },
        target_page: { type: "string", enum: ["index", "about", "services", "contact", "all"] },
        new_value: { type: "string" },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "update_settings",
    description: "Update site-wide toggles.",
    input_schema: {
      type: "object",
      required: ["setting", "new_value", "reason"],
      properties: {
        setting: {
          type: "string",
          enum: ["sticky_nav", "animations_enabled", "cookie_banner_enabled",
            "password_protected", "maintenance_mode", "smooth_scroll"],
        },
        new_value: {},
        reason: { type: "string" },
      },
    },
  },
  {
    name: "audit_and_fix",
    description: "Use this when the operator reports that something is 'wrong', 'broken', 'off', 'looks weird', or 'needs fixing' but doesn't specify exactly what. Also use when they ask to 'format X correctly' or 'fix the X' without saying what specifically is wrong. When this tool fires, the system loads the deployed HTML for the affected page(s) and asks Claude to examine it for obvious data quality issues: duplicated values, truncated text, placeholder leakage, malformed addresses (e.g., zip appearing twice), missing labels, broken formatting, business names rendered partially. Each issue Claude finds becomes a sub-fix using one of the other tools. The operator confirms all the fixes at once.",
    input_schema: {
      type: "object",
      required: ["target_scope", "target_page", "operator_complaint"],
      properties: {
        target_scope: {
          type: "string",
          enum: [
            "footer", "header", "nav", "hero", "about_section",
            "services_section", "testimonials_section", "contact_section",
            "values_section", "announcement_bar", "whole_page", "whole_site",
          ],
          description: "Smallest scope that matches the complaint. 'Fix the footer' = 'footer'. 'About page looks weird' = 'whole_page'. 'Something's off' = 'whole_site'.",
        },
        target_page: {
          type: "string",
          enum: ["index", "about", "services", "contact", "all"],
          description: "Page the issue is on. Use 'all' for site-wide elements like nav and footer.",
        },
        operator_complaint: { type: "string", description: "Operator's exact words, verbatim." },
        reason: { type: "string" },
      },
    },
  },
  {
    name: "clarify",
    description: "Use this when the operator's request is too vague to act on AND audit_and_fix can't help (i.e., they're asking for taste/preference changes like 'make it nicer' rather than reporting broken state). Returns clarifying questions and example better-phrased requests.",
    input_schema: {
      type: "object",
      required: ["reason", "suggestions"],
      properties: {
        reason: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the change request router for SiteQueen, a done-for-you website service. An operator just submitted a change request for a client's deployed website. Your job is to read the request and call the right tool to execute it.

CONTEXT YOU WILL RECEIVE:
- The operator's natural-language instruction
- The client's current business data (name, address, phone, etc.)
- The list of pages on the site
- Whether the operator uploaded a file
- A summary of what the site currently looks like

YOUR JOB:
1. Read the instruction.
2. Identify what kind of change is being requested.
3. Call exactly ONE tool with the right parameters.
4. If the request is too vague or ambiguous, call the clarify tool.

RULES:
- Always call a tool. Never respond with free text.
- Prefer the most specific tool that fits. Don't use update_text_content for an address change — use update_data_field.
- When in doubt about which page/section, prefer the smallest scope.
- For destructive changes (remove_section, remove_item_from_collection), only proceed if intent is unambiguous; otherwise clarify.
- For data field updates the change propagates to every place that data appears — mention this in your reason.
- If the request mentions multiple changes, pick the most important one and note the rest belong in separate requests.
- If a file was uploaded but the instruction doesn't say what to do with it, clarify which slot.
- If the operator says something is "wrong", "broken", "off", "weird", "needs fixing", "doesn't look right", or asks to "format X correctly" without specifying exactly what's wrong — call \`audit_and_fix\` (not clarify). This tool examines the deployed HTML for issues and proposes fixes.
- Only use \`clarify\` when the request is vague in a way that audit_and_fix can't solve (e.g., "make it better", "change the color to something nicer" — these don't describe broken state, they describe taste preferences that require operator input).
- If the instruction is entirely unactionable ("make our website better"), clarify with specific rephrasings.`;

function pickPages(toolName: string, params: any): string[] {
  const t = params?.target_page;
  if (t === "all" || !t) return ALL_PAGE_FILES;
  if (t && PAGE_FILE(t)) return [PAGE_FILE(t)];
  // Tools that always cascade
  if (["update_data_field", "update_visual_token"].includes(toolName)) return ALL_PAGE_FILES;
  return ALL_PAGE_FILES;
}
function PAGE_FILE(t: string): string {
  const m: Record<string, string> = { index: "index.html", about: "about.html", services: "services.html", contact: "contact.html" };
  return m[t] || "";
}

function buildSummary(tool: string, params: any, intake: any, deployedHtml: Record<string, string>): {
  summary: string;
  affectedPages: string[];
  affectedFields: string[];
  estimatedChanges: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let estimated = 0;
  let affectedFields: string[] = [];
  let pages: string[] = [];

  switch (tool) {
    case "update_data_field": {
      const cur = getCurrentFieldValue(intake, params.field);
      affectedFields = [params.field];
      if (!cur) {
        warnings.push(`Current value for ${params.field} not found in intake — text-level replacement may be skipped.`);
      } else {
        for (const [f, h] of Object.entries(deployedHtml)) {
          const n = h.split(cur).length - 1;
          if (n > 0) { pages.push(f); estimated += n; }
        }
      }
      return {
        summary: `Update ${params.field.replace(/_/g, " ")} to "${params.new_value}" — ${estimated} occurrence(s) across ${pages.length} page(s).`,
        affectedPages: pages, affectedFields, estimatedChanges: estimated, warnings,
      };
    }
    case "update_visual_token": {
      pages = Object.keys(deployedHtml);
      estimated = pages.length;
      return {
        summary: `Update site-wide ${params.token} to ${params.new_value}.`,
        affectedPages: pages, affectedFields: [params.token], estimatedChanges: estimated, warnings,
      };
    }
    case "update_text_content": {
      pages = params.target_page === "all"
        ? Object.keys(deployedHtml).filter((f) => deployedHtml[f].includes(params.current_text))
        : [PAGE_FILE(params.target_page)].filter((f) => f && deployedHtml[f]?.includes(params.current_text));
      estimated = pages.reduce((acc, f) => acc + (deployedHtml[f]?.split(params.current_text).length - 1 || 0), 0);
      if (estimated === 0) warnings.push("Couldn't find that exact text in the deployed HTML.");
      return {
        summary: `Replace "${truncate(params.current_text, 60)}" → "${truncate(params.new_text, 60)}" on ${pages.length || params.target_page}.`,
        affectedPages: pages, affectedFields: [], estimatedChanges: estimated, warnings,
      };
    }
    case "replace_media": {
      pages = params.target_page === "all" ? Object.keys(deployedHtml) : [PAGE_FILE(params.target_page)].filter(Boolean);
      return {
        summary: `Replace ${params.slot.replace(/_/g, " ")} on ${pages.length} page(s) with uploaded image.`,
        affectedPages: pages, affectedFields: [params.slot], estimatedChanges: pages.length, warnings,
      };
    }
    case "remove_section":
      pages = params.target_page === "all" ? Object.keys(deployedHtml) : [PAGE_FILE(params.target_page)].filter(Boolean);
      return {
        summary: `Remove "${params.section_identifier}" section from ${pages.join(", ") || params.target_page}.`,
        affectedPages: pages, affectedFields: [], estimatedChanges: pages.length, warnings: ["This permanently deletes the section markup. Use Restore to undo."],
      };
    case "toggle_section_visibility":
      pages = params.target_page === "all" ? Object.keys(deployedHtml) : [PAGE_FILE(params.target_page)].filter(Boolean);
      return {
        summary: `${params.visible ? "Show" : "Hide"} "${params.section_identifier}" section on ${pages.join(", ") || params.target_page}.`,
        affectedPages: pages, affectedFields: [], estimatedChanges: pages.length, warnings,
      };
    case "add_item_to_collection":
      return { summary: `Add a new item to ${params.collection}.`, affectedPages: [], affectedFields: [params.collection], estimatedChanges: 1, warnings };
    case "remove_item_from_collection":
      return { summary: `Remove "${params.identifier}" from ${params.collection}.`, affectedPages: [], affectedFields: [params.collection], estimatedChanges: 1, warnings };
    case "reorder_collection":
      return { summary: `Reorder ${params.collection}.`, affectedPages: [], affectedFields: [params.collection], estimatedChanges: 1, warnings };
    case "add_section":
      return { summary: `Add a new ${params.section_type} section to ${params.target_page}.`, affectedPages: [PAGE_FILE(params.target_page)], affectedFields: [], estimatedChanges: 1, warnings: ["New section uses template-consistent classes; review before deploy."] };
    case "update_metadata":
      pages = params.target_page === "all" || !params.target_page ? Object.keys(deployedHtml) : [PAGE_FILE(params.target_page)].filter(Boolean);
      return { summary: `Update ${params.field} on ${pages.length} page(s).`, affectedPages: pages, affectedFields: [params.field], estimatedChanges: pages.length, warnings };
    case "update_settings":
      pages = Object.keys(deployedHtml);
      return { summary: `Update setting ${params.setting} = ${params.new_value} site-wide.`, affectedPages: pages, affectedFields: [params.setting], estimatedChanges: pages.length, warnings };
  }
  return { summary: "Plan ready.", affectedPages: pages, affectedFields, estimatedChanges: estimated, warnings };
}

function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

// ─── audit_and_fix executor (returns multi-fix plan) ────────────────────────
interface AuditPlan {
  is_audit_plan: true;
  tool: "audit_and_fix";
  summary: string;
  target_scope: string;
  target_page: string;
  sub_fixes: Array<{
    id: string;
    description: string;
    tool: string;
    params: any;
    confidence: "high" | "medium";
    enabled_by_default: boolean;
  }>;
}

const ALLOWED_AUDIT_FIX_TOOLS = new Set([
  "update_data_field", "update_text_content", "remove_section", "toggle_section_visibility",
]);

function extractScopedHtml(
  deployedHtml: Record<string, string>,
  targetFiles: string[],
  scope: string,
): string {
  if (scope === "whole_site") {
    return Object.entries(deployedHtml)
      .map(([name, html]) => `<!-- FILE: ${name} -->\n${html.slice(0, 8000)}`)
      .join("\n\n");
  }
  if (scope === "whole_page") {
    return targetFiles.map((f) => {
      const h = deployedHtml[f];
      return h ? `<!-- FILE: ${f} -->\n${h.slice(0, 12000)}` : "";
    }).filter(Boolean).join("\n\n");
  }
  const sectionTagMap: Record<string, RegExp[]> = {
    footer: [/<footer[\s\S]*?<\/footer>/i],
    header: [/<header[\s\S]*?<\/header>/i],
    nav: [/<nav[\s\S]*?<\/nav>/i],
    hero: [/<section[^>]*class="[^"]*hero[^"]*"[\s\S]*?<\/section>/i],
    about_section: [/<section[^>]*class="[^"]*about[^"]*"[\s\S]*?<\/section>/i],
    services_section: [/<section[^>]*class="[^"]*service[^"]*"[\s\S]*?<\/section>/i],
    testimonials_section: [/<section[^>]*class="[^"]*testimonial[^"]*"[\s\S]*?<\/section>/i],
    contact_section: [/<section[^>]*class="[^"]*contact[^"]*"[\s\S]*?<\/section>/i],
    values_section: [/<section[^>]*class="[^"]*values[^"]*"[\s\S]*?<\/section>/i],
    announcement_bar: [/<div[^>]*class="[^"]*announc[^"]*"[\s\S]*?<\/div>/i],
  };
  const patterns = sectionTagMap[scope] || [];
  const chunks: string[] = [];
  for (const filename of targetFiles) {
    const html = deployedHtml[filename];
    if (!html) continue;
    for (const re of patterns) {
      const match = html.match(re);
      if (match) chunks.push(`<!-- FROM ${filename} -->\n${match[0]}`);
    }
  }
  return chunks.join("\n\n");
}

async function executeAuditAndFix(
  params: { target_scope: string; target_page: string; operator_complaint: string },
  ctx: {
    clientId: string; supabase: any; deployedHtml: Record<string, string>;
    intake: any; anthropicKey: string;
  },
): Promise<AuditPlan> {
  const pageFile = (t: string): string => ({
    index: "index.html", about: "about.html", services: "services.html", contact: "contact.html",
  }[t] || "");

  const targetFiles = params.target_page === "all"
    ? Object.keys(ctx.deployedHtml)
    : [pageFile(params.target_page)].filter(Boolean);

  let extractedHtml = extractScopedHtml(ctx.deployedHtml, targetFiles, params.target_scope);
  if (!extractedHtml || extractedHtml.length < 50) {
    // Fall back to whole page so the audit can still proceed
    console.warn(`[audit] scope "${params.target_scope}" not found on ${params.target_page}; falling back to whole_page`);
    extractedHtml = extractScopedHtml(ctx.deployedHtml, targetFiles, "whole_page");
  }
  if (!extractedHtml || extractedHtml.length < 50) {
    return {
      is_audit_plan: true,
      audit_summary: `No content found on ${params.target_page} to audit for "${params.target_scope}".`,
      fixes: [],
    } as AuditPlan;
  }

  const businessData = {
    business_name: ctx.intake.business_name,
    business_phone: ctx.intake.business_phone || ctx.intake.primary_phone,
    business_email: ctx.intake.business_email,
    business_address: ctx.intake.business_address || ctx.intake.address,
    business_city: ctx.intake.business_city || ctx.intake.city,
    business_state: ctx.intake.business_state || ctx.intake.state,
    business_zip: ctx.intake.business_zip || ctx.intake.zip,
    business_hours: ctx.intake.business_hours,
    service_area: ctx.intake.service_area,
    owner_name: ctx.intake.owner_name,
    owner_title: ctx.intake.owner_title,
  };

  const auditSystemPrompt = `You audit small business websites for data quality issues. You receive a section of deployed HTML, the operator's complaint, and the business's intake data. You return a structured list of issues found.

You DO NOT make taste or design judgments. You only flag objectively broken or malformed data:
- Truncated values (deployed shows partial value; intake has full value)
- Duplicated values (same data appearing twice in one field)
- Placeholder leakage (literal {{...}} or fallback strings like "By Appointment Only" that look like defaults)
- Missing labels (data shown without context that would help a visitor understand it)
- Malformed structure (extra commas, repeated zip, inconsistent formatting)
- Empty fields that should have content
- Generic fallback strings where intake has real data

Do NOT flag:
- Copywriting choices
- Design or color decisions
- Section ordering
- Anything that's a preference rather than a defect

Return ONLY a JSON object. No markdown, no explanation.`;

  const auditUserPrompt = `OPERATOR'S COMPLAINT: ${params.operator_complaint}
SCOPE: ${params.target_scope}
PAGE: ${params.target_page}

HTML BEING AUDITED:
\`\`\`
${extractedHtml.slice(0, 24000)}
\`\`\`

BUSINESS INTAKE DATA (the source of truth — compare deployed values to these):
${JSON.stringify(businessData, null, 2)}

Return this JSON shape:
{
  "issues_found": <number>,
  "issues": [
    {
      "issue_type": "truncated_value" | "duplicated_value" | "placeholder_leak" | "missing_label" | "malformed_data" | "empty_field" | "default_fallback" | "wrong_industry_terms" | "formatting_inconsistent",
      "description": "Operator-friendly human description. Example: 'Business name shows as Carol but the full name is Carol Lynn de Szendeffy'",
      "proposed_fix_tool": "update_data_field" | "update_text_content" | "remove_section" | "toggle_section_visibility",
      "proposed_fix_params": { /* params for that tool */ },
      "confidence": "high" | "medium"
    }
  ]
}

Only include issues you are confident about. If you find nothing wrong, return {"issues_found": 0, "issues": []}.`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ctx.anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: auditSystemPrompt,
      messages: [{ role: "user", content: auditUserPrompt }],
    }),
  });
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`Audit Claude call failed: ${aiRes.status} — ${errText.slice(0, 300)}`);
  }
  const aiJson = await aiRes.json();
  const rawText: string = aiJson?.content?.[0]?.text ?? "";
  const cleaned = rawText.trim()
    .replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let parsed: { issues_found: number; issues: any[] };
  try { parsed = JSON.parse(cleaned); }
  catch (e: any) { throw new Error(`Audit Claude returned malformed JSON: ${e.message}`); }

  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const validIssues = issues.filter((i) => ALLOWED_AUDIT_FIX_TOOLS.has(i.proposed_fix_tool));

  return {
    is_audit_plan: true,
    tool: "audit_and_fix",
    target_scope: params.target_scope,
    target_page: params.target_page,
    summary: validIssues.length === 0
      ? `I examined the ${params.target_scope} and didn't find any obvious data quality issues. If something specific is wrong, please describe what you're seeing.`
      : `Audited ${params.target_scope}. Found ${validIssues.length} issue${validIssues.length === 1 ? "" : "s"}:`,
    sub_fixes: validIssues.map((issue, idx) => ({
      id: `fix_${idx}`,
      description: issue.description || "(no description)",
      tool: issue.proposed_fix_tool,
      params: issue.proposed_fix_params || {},
      confidence: issue.confidence === "high" ? "high" : "medium",
      enabled_by_default: issue.confidence === "high",
    })),
  };
}



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !caller) return json({ error: "Invalid token" }, 401);

  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle(),
    supabase.from("profiles").select("role, email").eq("user_id", caller.id).maybeSingle(),
  ]);
  const isOperator = !!roleRow || profileRow?.role === "partner" || profileRow?.role === "admin";
  if (!isOperator) return json({ error: "Operator access required" }, 403);

  try {
    const body = await req.json();
    const clientId = (body.client_id || "").toString().trim();
    const instruction = (body.instruction || "").toString().trim();
    const uploadedFileUrl = body.uploaded_file_url ? String(body.uploaded_file_url) : null;
    const pagesHint = (body.pages || "auto").toString().trim().toLowerCase();

    if (!clientId || !instruction) return json({ error: "client_id and instruction required" }, 400);
    if (!/^[0-9a-fA-F-]{36}$/.test(clientId)) return json({ error: "Invalid client_id" }, 400);
    if (instruction.length > 4000) return json({ error: "Instruction too long" }, 400);

    const operatorEmail = profileRow?.email ?? caller.email ?? null;

    // Create job row
    const { data: job, error: jobErr } = await supabase
      .from("quick_edit_jobs")
      .insert({
        client_id: clientId,
        operator_id: caller.id,
        operator_email: operatorEmail,
        instruction,
        pages: pagesHint,
        status: "previewing",
        uploaded_file_url: uploadedFileUrl,
      })
      .select("id")
      .single();
    if (jobErr || !job?.id) throw new Error(jobErr?.message || "Could not create job");

    // Load context
    const [deployedHtml, siteRow] = await Promise.all([
      loadDeployedHtml(supabase, clientId),
      supabase.from("sites").select("intake_data, template_used").eq("client_id", clientId).maybeSingle(),
    ]);
    const intake = (siteRow.data as any)?.intake_data || {};
    const template = (siteRow.data as any)?.template_used || "unknown";
    const pagesPresent = Object.keys(deployedHtml);

    if (pagesPresent.length === 0) {
      await supabase.from("quick_edit_jobs").update({ status: "failed", error_message: "No deployed pages found" }).eq("id", job.id);
      return json({ error: "No deployed pages found for this client" }, 400);
    }

    const contextSummary = `Template: ${template}
Pages deployed: ${pagesPresent.join(", ")}
Business data on file:
  business_name: ${intake.business_name || "(not set)"}
  business_phone: ${intake.business_phone || intake.phone || "(not set)"}
  business_email: ${intake.business_email || intake.email || "(not set)"}
  business_address: ${intake.business_address || intake.address || "(not set)"}
  business_city: ${intake.business_city || intake.city || "(not set)"}
  business_state: ${intake.business_state || intake.state || "(not set)"}
File uploaded with this request: ${uploadedFileUrl ? "yes" : "no"}`;

    const t0 = Date.now();
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: `${contextSummary}\n\nOPERATOR REQUEST:\n${instruction}` }],
      }),
    });
    const previewMs = Date.now() - t0;

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      await supabase.from("quick_edit_jobs").update({ status: "failed", error_message: `AI error ${aiRes.status}: ${txt.slice(0, 300)}` }).eq("id", job.id);
      return json({ error: `AI error ${aiRes.status}` }, 500);
    }
    const aiJson = await aiRes.json();
    const toolUse = (aiJson.content || []).find((b: any) => b.type === "tool_use");

    if (!toolUse) {
      // No tool call — offer fallback
      await supabase.from("quick_edit_jobs").update({
        status: "awaiting_confirmation",
        tool_used: "fallback_offered",
        preview_at: new Date().toISOString(),
        preview_ms: previewMs,
        used_fallback: true,
      }).eq("id", job.id);
      return json({
        success: false,
        job_id: job.id,
        fallback_available: true,
        reason: "I couldn't match this request to a known change pattern.",
        fallback_summary: "Try a full-page AI edit instead — Claude will attempt a targeted patch on the most relevant page.",
      });
    }

    const toolName = toolUse.name;
    const params = toolUse.input || {};

    if (toolName === "clarify") {
      await supabase.from("quick_edit_jobs").update({
        status: "awaiting_confirmation",
        tool_used: "clarify",
        tool_params: params,
        plan: params,
        preview_at: new Date().toISOString(),
        preview_ms: previewMs,
      }).eq("id", job.id);
      return json({
        success: false,
        job_id: job.id,
        needs_clarification: true,
        reason: params.reason || "Could you be more specific?",
        suggestions: params.suggestions || [],
      });
    }

    if (toolName === "audit_and_fix") {
      try {
        const auditPlan = await executeAuditAndFix(params, {
          clientId, supabase, deployedHtml, intake, anthropicKey,
        });
        const enabledDefault = auditPlan.sub_fixes.filter((f) => f.enabled_by_default).map((f) => f.id);
        await supabase.from("quick_edit_jobs").update({
          status: "awaiting_confirmation",
          tool_used: "audit_and_fix",
          tool_params: params,
          plan: auditPlan,
          confidence: auditPlan.sub_fixes.length > 0 ? "high" : "low",
          enabled_sub_fix_ids: enabledDefault,
          preview_at: new Date().toISOString(),
          preview_ms: Date.now() - t0,
        }).eq("id", job.id);
        return json({ success: true, job_id: job.id, plan: auditPlan });
      } catch (e: any) {
        await supabase.from("quick_edit_jobs").update({
          status: "failed", error_message: e.message ?? String(e),
        }).eq("id", job.id);
        return json({ error: e.message ?? "Audit failed" }, 500);
      }
    }


    // Build plan summary
    const sm = buildSummary(toolName, params, intake, deployedHtml);
    const confidence: "high" | "medium" | "low" =
      sm.warnings.length === 0 && sm.estimatedChanges > 0 ? "high"
        : sm.warnings.length > 0 ? "low" : "medium";

    const plan = {
      tool: toolName,
      summary: sm.summary,
      params,
      affected_pages: sm.affectedPages,
      affected_fields: sm.affectedFields,
      estimated_changes: sm.estimatedChanges,
      confidence,
      warnings: sm.warnings,
    };

    await supabase.from("quick_edit_jobs").update({
      status: "awaiting_confirmation",
      tool_used: toolName,
      tool_params: params,
      plan,
      confidence,
      preview_at: new Date().toISOString(),
      preview_ms: previewMs,
    }).eq("id", job.id);

    return json({ success: true, job_id: job.id, plan });
  } catch (e: any) {
    console.error("change-request-preview error:", e);
    return json({ error: e.message ?? "Unknown error" }, 500);
  }
});
