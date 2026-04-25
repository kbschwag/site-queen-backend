import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadFileToHostingerFtp } from "../_shared/hostinger-ftp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";
const AI_MODEL = "claude-sonnet-4-20250514";
const TIMEOUT_MS = 600_000; // 10 minutes

const STAGING_BASE_URL = "https://staging.sitequeen.ai";
const STAGING_FOLDER_ROOT = "/public_html";

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

    // ── Fetch data ───────────────────────────────────────────────────────
    const { data: siteData } = await supabase.from("sites").select("*").eq("client_id", clientId).single();
    const { data: clientData } = await supabase.from("clients").select("*").eq("id", clientId).single();
    const intake: any = (siteData as any)?.intake_data || {};
    const applicationId = (clientData as any)?.application_id;
    const { data: callNotes } = applicationId
      ? await supabase.from("call_notes").select("*").eq("application_id", applicationId).maybeSingle()
      : { data: null };

    // ── Business data shortcuts ──────────────────────────────────────────
    const businessName = (clientData as any)?.business_name || intake.business_name || "Business";
    const businessType = (clientData as any)?.business_type || "Service Business";
    const city = intake.business_city || intake.city || "";
    const state = intake.business_state || intake.state || "";
    const phone = intake.business_phone || intake.primary_phone || intake.phone || "";
    const email = intake.business_email || intake.email || "";
    const address = intake.business_address || intake.address || "";
    const yearsInBusiness = intake.years_in_business || "";
    const googleRating = intake.google_rating || "";
    const googleReviewCount = intake.google_review_count || "";
    const aboutStory = intake.about_story || intake.owner_bio_raw || intake.story_started || "";
    const ownerName = intake.owner_name || "";
    const ownerTitle = intake.owner_title || "Owner";
    const tagline = intake.tagline || "";

    const portfolioPhotos: string[] = Array.isArray(intake.portfolio_photos) ? intake.portfolio_photos : [];
    const teamPhotos: string[] = Array.isArray(intake.team_photos) ? intake.team_photos : [];
    const services: any[] = Array.isArray(intake.services) ? intake.services : [];
    const serviceAreas: any[] = Array.isArray(intake.service_areas) ? intake.service_areas : [];

    const serviceNames = services.slice(0, 6).map((s: any) =>
      typeof s === "string" ? s : s?.name || s?.title || ""
    ).filter(Boolean);

    // ── Determine template prefix ────────────────────────────────────────
    const TEMPLATE_FILE_MAP: Record<string, string> = {
      trades: "trades-hero",
      professional: "professional",
      warm: "warm-welcome",
      local: "local-favorite",
      modern: "modern-business",
    };
    const selectedTemplate = intake?.template_selected || (callNotes as any)?.template_selected || intake?.template_id;
    const templateId = selectedTemplate ? (TEMPLATE_FILE_MAP[selectedTemplate] || selectedTemplate) : "trades-hero";

    // ── Shared fill values (used across all pages) ───────────────────────
    const sharedFill: Record<string, string> = {
      "{{BUSINESS_NAME}}": businessName,
      "{{BUSINESS_PHONE}}": phone,
      "{{BUSINESS_EMAIL}}": email,
      "{{BUSINESS_ADDRESS}}": address,
      "{{BUSINESS_CITY}}": city,
      "{{BUSINESS_STATE}}": state,
      "{{GOOGLE_RATING}}": String(googleRating || "4.9"),
      "{{GOOGLE_REVIEW_COUNT}}": String(googleReviewCount || "100"),
      "{{SERVICE_AREA}}": intake.service_area || (city ? `${city} & Surrounding Areas` : ""),
      "{{YEARS_IN_BUSINESS}}": String(yearsInBusiness || "10"),
      "{{COPYRIGHT_YEAR}}": String(new Date().getFullYear()),
      "{{FOOTER_TAGLINE}}": tagline || "",
      "{{SERVICE_1_NAME}}": serviceNames[0] || "",
      "{{SERVICE_2_NAME}}": serviceNames[1] || "",
      "{{SERVICE_3_NAME}}": serviceNames[2] || "",
      "{{SERVICE_4_NAME}}": serviceNames[3] || "",
      "{{SERVICE_5_NAME}}": serviceNames[4] || "",
      "{{SERVICE_6_NAME}}": serviceNames[5] || "",
      "{{EMERGENCY_HEADLINE}}": "EMERGENCY? WE'RE ON THE WAY.",
      "{{AREA_1}}": serviceAreas[0] ? (typeof serviceAreas[0] === "string" ? serviceAreas[0] : serviceAreas[0].name) : city,
      "{{AREA_2}}": serviceAreas[1] ? (typeof serviceAreas[1] === "string" ? serviceAreas[1] : serviceAreas[1].name) : "",
      "{{AREA_3}}": serviceAreas[2] ? (typeof serviceAreas[2] === "string" ? serviceAreas[2] : serviceAreas[2].name) : "",
    };

    const analyticsScript = `
<script>
(function() {
  var CLIENT_ID = '${clientId}';
  var ENDPOINT = '${supabaseUrl}/functions/v1/track-event';
  function getDevice() { return /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop'; }
  function getSid() { var s = sessionStorage.getItem('sq_sid'); if (!s) { s = Math.random().toString(36).substr(2,9); sessionStorage.setItem('sq_sid',s); } return s; }
  function track(type, meta) { fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ client_id:CLIENT_ID, event_type:type, page_path:window.location.pathname, page_title:document.title, referrer:document.referrer, device_type:getDevice(), session_id:getSid(), metadata:meta||{} }) }).catch(function(){}); }
  track('page_view');
  document.addEventListener('click', function(e) { var a = e.target.closest('a'); if (!a) return; if (a.href && a.href.indexOf('tel:') === 0) track('phone_click'); if (a.href && a.href.indexOf('mailto:') === 0) track('email_click'); });
  document.addEventListener('submit', function() { track('form_submission'); });
})();
</script>`;

    const generated: string[] = [];
    const failed: string[] = [];

    // ── ABOUT PAGE ───────────────────────────────────────────────────────
    try {
      const { data: aboutFile } = await supabase.storage.from("templates").download(`${templateId}-about.html`);
      if (!aboutFile) throw new Error(`Template not found: ${templateId}-about.html`);
      let aboutHTML = await aboutFile.text();

      // Generate about-specific copy
      const aboutCopyPrompt = `You are a copywriter for SiteQueen. Generate about page copy for ${businessName}, a ${businessType} in ${city}, ${state}.

OWNER INFO:
- Name: ${ownerName || "not provided"}
- Title: ${ownerTitle}
- Story: ${aboutStory || "not provided"}
- What makes them different: ${intake.story_different || "not provided"}
- How they started: ${intake.story_started || "not provided"}
- Years in business: ${yearsInBusiness || "not provided"}

CALL NOTES: ${callNotes ? JSON.stringify({ their_story: (callNotes as any).their_story, tone_of_voice: (callNotes as any).tone_of_voice, expert_additions: (callNotes as any).expert_additions, exact_phrases: (callNotes as any).exact_phrases }, null, 2) : "None"}

Return ONLY valid JSON. No markdown:
{
  "ABOUT_PAGE_SUBHEADING": "1 sentence about the business location and experience",
  "ABOUT_STORY_P1": "first paragraph of about story - personal and specific to this business",
  "ABOUT_STORY_P2": "second paragraph - what drives them, their approach",
  "ABOUT_STORY_P3": "third paragraph - their commitment and values",
  "EXPECT_1": "thing clients can always expect #1",
  "EXPECT_2": "thing clients can always expect #2",
  "EXPECT_3": "thing clients can always expect #3",
  "EXPECT_4": "thing clients can always expect #4",
  "EXPECT_5": "thing clients can always expect #5",
  "EXPECT_6": "thing clients can always expect #6",
  "WHY_US_BADGE": "short badge text e.g. #1 CONTRACTOR",
  "WHY_US_TAGLINE": "short tagline e.g. FAMILY-OWNED · LICENSED · SINCE ${yearsInBusiness ? String(new Date().getFullYear() - parseInt(String(yearsInBusiness))) : "2010"}",
  "WHY_US_STORY": "2-3 sentences about why clients trust this business",
  "AREA_GROUP_1_NAME": "${city.toUpperCase()} AREA",
  "AREA_GROUP_1_CITIES": "list of nearby cities separated by · ",
  "AREA_GROUP_2_NAME": "second region name if applicable",
  "AREA_GROUP_2_CITIES": "cities in that region",
  "AREA_GROUP_3_NAME": "third region name if applicable",
  "AREA_GROUP_3_CITIES": "cities in that region"
}`;

      const aboutCopy = await callAI(ANTHROPIC_API_KEY, aboutCopyPrompt, "about-copy");
      let aboutCopyData: any = {};
      try {
        aboutCopyData = JSON.parse(stripMarkdown(aboutCopy.text));
      } catch (e) {
        console.error("[extra-pages] about copy JSON parse failed:", e);
      }

      const aboutFill: Record<string, string> = {
        ...sharedFill,
        "{{ABOUT_PAGE_SUBHEADING}}": aboutCopyData.ABOUT_PAGE_SUBHEADING || "",
        "{{ABOUT_STORY_P1}}": aboutCopyData.ABOUT_STORY_P1 || "",
        "{{ABOUT_STORY_P2}}": aboutCopyData.ABOUT_STORY_P2 || "",
        "{{ABOUT_STORY_P3}}": aboutCopyData.ABOUT_STORY_P3 || "",
        "{{EXPECT_1}}": aboutCopyData.EXPECT_1 || "",
        "{{EXPECT_2}}": aboutCopyData.EXPECT_2 || "",
        "{{EXPECT_3}}": aboutCopyData.EXPECT_3 || "",
        "{{EXPECT_4}}": aboutCopyData.EXPECT_4 || "",
        "{{EXPECT_5}}": aboutCopyData.EXPECT_5 || "",
        "{{EXPECT_6}}": aboutCopyData.EXPECT_6 || "",
        "{{WHY_US_BADGE}}": aboutCopyData.WHY_US_BADGE || "#1 CONTRACTOR",
        "{{WHY_US_TAGLINE}}": aboutCopyData.WHY_US_TAGLINE || "FAMILY-OWNED · LICENSED & INSURED",
        "{{WHY_US_STORY}}": aboutCopyData.WHY_US_STORY || "",
        "{{AREA_GROUP_1_NAME}}": aboutCopyData.AREA_GROUP_1_NAME || `${city.toUpperCase()} AREA`,
        "{{AREA_GROUP_1_CITIES}}": aboutCopyData.AREA_GROUP_1_CITIES || city,
        "{{AREA_GROUP_2_NAME}}": aboutCopyData.AREA_GROUP_2_NAME || "",
        "{{AREA_GROUP_2_CITIES}}": aboutCopyData.AREA_GROUP_2_CITIES || "",
        "{{AREA_GROUP_3_NAME}}": aboutCopyData.AREA_GROUP_3_NAME || "",
        "{{AREA_GROUP_3_CITIES}}": aboutCopyData.AREA_GROUP_3_CITIES || "",
      };

      for (const [key, value] of Object.entries(aboutFill)) {
        aboutHTML = aboutHTML.split(key).join(value);
      }
      aboutHTML = aboutHTML.replace(/\{\{[^}]+\}\}/g, "");
      aboutHTML = aboutHTML.replace("</body>", analyticsScript + "\n</body>");

      const stagingAbout = injectNoindex(aboutHTML);
      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/about.html`, stagingAbout);
      await supabase.storage.from("generated-sites").upload(`${clientId}/deploy/about.html`, new Blob([aboutHTML], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });

      generated.push("about");
      console.log(`[extra-pages] ✓ about.html (${aboutCopy.outputTokens} tokens)`);
    } catch (e: any) {
      console.error("[extra-pages] ✗ about failed:", e.message);
      failed.push(`about: ${e.message}`);
    }

    // ── SERVICES PAGE ────────────────────────────────────────────────────
    try {
      const { data: servicesFile } = await supabase.storage.from("templates").download(`${templateId}-services.html`);
      if (!servicesFile) throw new Error(`Template not found: ${templateId}-services.html`);
      let servicesHTML = await servicesFile.text();

      // Generate services-specific copy
      const servicesCopyPrompt = `You are a copywriter for SiteQueen. Generate services page copy for ${businessName}, a ${businessType} in ${city}, ${state}.

SERVICES: ${serviceNames.join(", ")}
YEARS IN BUSINESS: ${yearsInBusiness || "not provided"}
CALL NOTES: ${callNotes ? JSON.stringify({ tone_of_voice: (callNotes as any).tone_of_voice, expert_additions: (callNotes as any).expert_additions }, null, 2) : "None"}

Return ONLY valid JSON. No markdown:
{
  "SERVICES_PAGE_HEADLINE": "3-5 words all caps e.g. OUR SERVICES",
  "SERVICES_PAGE_SUBTEXT": "1-2 sentences about their range of services",
  "SERVICES_MAIN_HEADLINE": "5-8 words describing their expertise",
  "SERVICES_MAIN_BODY": "2-3 sentences about their service quality and approach",
  "CONTACT_CTA_SUBTEXT": "1-2 sentences encouraging contact",
  "WHY_US_BADGE": "short badge e.g. #1 CONTRACTOR",
  "WHY_US_TAGLINE": "tagline e.g. FAMILY-OWNED · LICENSED · INSURED",
  "WHY_US_STORY": "2-3 sentences about their expertise and reputation",
  "SERVICE_CAT_1_NAME": "${serviceNames[0] || "SERVICE 1"}",
  "SERVICE_CAT_1_ITEM_1": "specific sub-service",
  "SERVICE_CAT_1_ITEM_2": "specific sub-service",
  "SERVICE_CAT_1_ITEM_3": "specific sub-service",
  "SERVICE_CAT_1_ITEM_4": "specific sub-service",
  "SERVICE_CAT_1_ITEM_5": "specific sub-service",
  "SERVICE_CAT_1_ITEM_6": "specific sub-service",
  "SERVICE_CAT_1_ITEM_7": "specific sub-service",
  "SERVICE_CAT_1_ITEM_8": "specific sub-service",
  "SERVICE_CAT_1_ITEM_9": "specific sub-service",
  "SERVICE_CAT_1_ITEM_10": "specific sub-service",
  "SERVICE_CAT_2_NAME": "${serviceNames[1] || "SERVICE 2"}",
  "SERVICE_CAT_2_ITEM_1": "specific sub-service",
  "SERVICE_CAT_2_ITEM_2": "specific sub-service",
  "SERVICE_CAT_2_ITEM_3": "specific sub-service",
  "SERVICE_CAT_2_ITEM_4": "specific sub-service",
  "SERVICE_CAT_2_ITEM_5": "specific sub-service",
  "SERVICE_CAT_2_ITEM_6": "specific sub-service",
  "SERVICE_CAT_2_ITEM_7": "specific sub-service",
  "SERVICE_CAT_3_NAME": "${serviceNames[2] || "SERVICE 3"}",
  "SERVICE_CAT_3_ITEM_1": "specific sub-service",
  "SERVICE_CAT_3_ITEM_2": "specific sub-service",
  "SERVICE_CAT_3_ITEM_3": "specific sub-service",
  "SERVICE_CAT_3_ITEM_4": "specific sub-service",
  "SERVICE_CAT_3_ITEM_5": "specific sub-service",
  "SERVICE_CAT_3_ITEM_6": "specific sub-service",
  "SERVICE_CAT_3_ITEM_7": "specific sub-service",
  "SERVICE_CAT_4_NAME": "${serviceNames[3] || "SERVICE 4"}",
  "SERVICE_CAT_4_ITEM_1": "specific sub-service",
  "SERVICE_CAT_4_ITEM_2": "specific sub-service",
  "SERVICE_CAT_4_ITEM_3": "specific sub-service",
  "SERVICE_CAT_4_ITEM_4": "specific sub-service",
  "SERVICE_CAT_4_ITEM_5": "specific sub-service",
  "SERVICE_CAT_5_NAME": "${serviceNames[4] || "SERVICE 5"}",
  "SERVICE_CAT_5_ITEM_1": "specific sub-service",
  "SERVICE_CAT_5_ITEM_2": "specific sub-service",
  "SERVICE_CAT_5_ITEM_3": "specific sub-service",
  "SERVICE_CAT_5_ITEM_4": "specific sub-service",
  "SERVICE_CAT_5_ITEM_5": "specific sub-service",
  "CASE_1_TITLE": "job title e.g. BASEMENT EXCAVATION",
  "CASE_1_DATE": "recent date e.g. MARCH 2026",
  "CASE_1_LOCATION": "${city}, ${state}",
  "CASE_1_QUOTE": "1-2 sentence job description",
  "CASE_2_TITLE": "different job title",
  "CASE_2_DATE": "recent date",
  "CASE_2_LOCATION": "nearby city, ${state}",
  "CASE_2_QUOTE": "1-2 sentence job description",
  "CASE_3_TITLE": "different job title",
  "CASE_3_DATE": "recent date",
  "CASE_3_LOCATION": "nearby city, ${state}",
  "CASE_3_QUOTE": "1-2 sentence job description",
  "CASE_4_TITLE": "different job title",
  "CASE_4_DATE": "recent date",
  "CASE_4_LOCATION": "nearby city, ${state}",
  "CASE_4_QUOTE": "1-2 sentence job description"
}`;

      const servicesCopy = await callAI(ANTHROPIC_API_KEY, servicesCopyPrompt, "services-copy");
      let servicesCopyData: any = {};
      try {
        servicesCopyData = JSON.parse(stripMarkdown(servicesCopy.text));
      } catch (e) {
        console.error("[extra-pages] services copy JSON parse failed:", e);
      }

      const servicesFill: Record<string, string> = {
        ...sharedFill,
        "{{SERVICES_PAGE_HEADLINE}}": servicesCopyData.SERVICES_PAGE_HEADLINE || "OUR SERVICES",
        "{{SERVICES_PAGE_SUBTEXT}}": servicesCopyData.SERVICES_PAGE_SUBTEXT || "",
        "{{SERVICES_MAIN_HEADLINE}}": servicesCopyData.SERVICES_MAIN_HEADLINE || "",
        "{{SERVICES_MAIN_BODY}}": servicesCopyData.SERVICES_MAIN_BODY || "",
        "{{CONTACT_CTA_SUBTEXT}}": servicesCopyData.CONTACT_CTA_SUBTEXT || "",
        "{{WHY_US_BADGE}}": servicesCopyData.WHY_US_BADGE || "#1 CONTRACTOR",
        "{{WHY_US_TAGLINE}}": servicesCopyData.WHY_US_TAGLINE || "FAMILY-OWNED · LICENSED & INSURED",
        "{{WHY_US_STORY}}": servicesCopyData.WHY_US_STORY || "",
        "{{SERVICE_CAT_1_NAME}}": servicesCopyData.SERVICE_CAT_1_NAME || serviceNames[0] || "",
        "{{SERVICE_CAT_1_ITEM_1}}": servicesCopyData.SERVICE_CAT_1_ITEM_1 || "",
        "{{SERVICE_CAT_1_ITEM_2}}": servicesCopyData.SERVICE_CAT_1_ITEM_2 || "",
        "{{SERVICE_CAT_1_ITEM_3}}": servicesCopyData.SERVICE_CAT_1_ITEM_3 || "",
        "{{SERVICE_CAT_1_ITEM_4}}": servicesCopyData.SERVICE_CAT_1_ITEM_4 || "",
        "{{SERVICE_CAT_1_ITEM_5}}": servicesCopyData.SERVICE_CAT_1_ITEM_5 || "",
        "{{SERVICE_CAT_1_ITEM_6}}": servicesCopyData.SERVICE_CAT_1_ITEM_6 || "",
        "{{SERVICE_CAT_1_ITEM_7}}": servicesCopyData.SERVICE_CAT_1_ITEM_7 || "",
        "{{SERVICE_CAT_1_ITEM_8}}": servicesCopyData.SERVICE_CAT_1_ITEM_8 || "",
        "{{SERVICE_CAT_1_ITEM_9}}": servicesCopyData.SERVICE_CAT_1_ITEM_9 || "",
        "{{SERVICE_CAT_1_ITEM_10}}": servicesCopyData.SERVICE_CAT_1_ITEM_10 || "",
        "{{SERVICE_CAT_2_NAME}}": servicesCopyData.SERVICE_CAT_2_NAME || serviceNames[1] || "",
        "{{SERVICE_CAT_2_ITEM_1}}": servicesCopyData.SERVICE_CAT_2_ITEM_1 || "",
        "{{SERVICE_CAT_2_ITEM_2}}": servicesCopyData.SERVICE_CAT_2_ITEM_2 || "",
        "{{SERVICE_CAT_2_ITEM_3}}": servicesCopyData.SERVICE_CAT_2_ITEM_3 || "",
        "{{SERVICE_CAT_2_ITEM_4}}": servicesCopyData.SERVICE_CAT_2_ITEM_4 || "",
        "{{SERVICE_CAT_2_ITEM_5}}": servicesCopyData.SERVICE_CAT_2_ITEM_5 || "",
        "{{SERVICE_CAT_2_ITEM_6}}": servicesCopyData.SERVICE_CAT_2_ITEM_6 || "",
        "{{SERVICE_CAT_2_ITEM_7}}": servicesCopyData.SERVICE_CAT_2_ITEM_7 || "",
        "{{SERVICE_CAT_3_NAME}}": servicesCopyData.SERVICE_CAT_3_NAME || serviceNames[2] || "",
        "{{SERVICE_CAT_3_ITEM_1}}": servicesCopyData.SERVICE_CAT_3_ITEM_1 || "",
        "{{SERVICE_CAT_3_ITEM_2}}": servicesCopyData.SERVICE_CAT_3_ITEM_2 || "",
        "{{SERVICE_CAT_3_ITEM_3}}": servicesCopyData.SERVICE_CAT_3_ITEM_3 || "",
        "{{SERVICE_CAT_3_ITEM_4}}": servicesCopyData.SERVICE_CAT_3_ITEM_4 || "",
        "{{SERVICE_CAT_3_ITEM_5}}": servicesCopyData.SERVICE_CAT_3_ITEM_5 || "",
        "{{SERVICE_CAT_3_ITEM_6}}": servicesCopyData.SERVICE_CAT_3_ITEM_6 || "",
        "{{SERVICE_CAT_3_ITEM_7}}": servicesCopyData.SERVICE_CAT_3_ITEM_7 || "",
        "{{SERVICE_CAT_4_NAME}}": servicesCopyData.SERVICE_CAT_4_NAME || serviceNames[3] || "",
        "{{SERVICE_CAT_4_ITEM_1}}": servicesCopyData.SERVICE_CAT_4_ITEM_1 || "",
        "{{SERVICE_CAT_4_ITEM_2}}": servicesCopyData.SERVICE_CAT_4_ITEM_2 || "",
        "{{SERVICE_CAT_4_ITEM_3}}": servicesCopyData.SERVICE_CAT_4_ITEM_3 || "",
        "{{SERVICE_CAT_4_ITEM_4}}": servicesCopyData.SERVICE_CAT_4_ITEM_4 || "",
        "{{SERVICE_CAT_4_ITEM_5}}": servicesCopyData.SERVICE_CAT_4_ITEM_5 || "",
        "{{SERVICE_CAT_5_NAME}}": servicesCopyData.SERVICE_CAT_5_NAME || serviceNames[4] || "",
        "{{SERVICE_CAT_5_ITEM_1}}": servicesCopyData.SERVICE_CAT_5_ITEM_1 || "",
        "{{SERVICE_CAT_5_ITEM_2}}": servicesCopyData.SERVICE_CAT_5_ITEM_2 || "",
        "{{SERVICE_CAT_5_ITEM_3}}": servicesCopyData.SERVICE_CAT_5_ITEM_3 || "",
        "{{SERVICE_CAT_5_ITEM_4}}": servicesCopyData.SERVICE_CAT_5_ITEM_4 || "",
        "{{SERVICE_CAT_5_ITEM_5}}": servicesCopyData.SERVICE_CAT_5_ITEM_5 || "",
        "{{CASE_1_TITLE}}": servicesCopyData.CASE_1_TITLE || "",
        "{{CASE_1_DATE}}": servicesCopyData.CASE_1_DATE || "",
        "{{CASE_1_LOCATION}}": servicesCopyData.CASE_1_LOCATION || city,
        "{{CASE_1_QUOTE}}": servicesCopyData.CASE_1_QUOTE || "",
        "{{CASE_2_TITLE}}": servicesCopyData.CASE_2_TITLE || "",
        "{{CASE_2_DATE}}": servicesCopyData.CASE_2_DATE || "",
        "{{CASE_2_LOCATION}}": servicesCopyData.CASE_2_LOCATION || city,
        "{{CASE_2_QUOTE}}": servicesCopyData.CASE_2_QUOTE || "",
        "{{CASE_3_TITLE}}": servicesCopyData.CASE_3_TITLE || "",
        "{{CASE_3_DATE}}": servicesCopyData.CASE_3_DATE || "",
        "{{CASE_3_LOCATION}}": servicesCopyData.CASE_3_LOCATION || city,
        "{{CASE_3_QUOTE}}": servicesCopyData.CASE_3_QUOTE || "",
        "{{CASE_4_TITLE}}": servicesCopyData.CASE_4_TITLE || "",
        "{{CASE_4_DATE}}": servicesCopyData.CASE_4_DATE || "",
        "{{CASE_4_LOCATION}}": servicesCopyData.CASE_4_LOCATION || city,
        "{{CASE_4_QUOTE}}": servicesCopyData.CASE_4_QUOTE || "",
      };

      for (const [key, value] of Object.entries(servicesFill)) {
        servicesHTML = servicesHTML.split(key).join(value);
      }
      servicesHTML = servicesHTML.replace(/\{\{[^}]+\}\}/g, "");
      servicesHTML = servicesHTML.replace("</body>", analyticsScript + "\n</body>");

      const stagingServices = injectNoindex(servicesHTML);
      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/services.html`, stagingServices);
      await supabase.storage.from("generated-sites").upload(`${clientId}/deploy/services.html`, new Blob([servicesHTML], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });

      generated.push("services");
      console.log(`[extra-pages] ✓ services.html (${servicesCopy.outputTokens} tokens)`);
    } catch (e: any) {
      console.error("[extra-pages] ✗ services failed:", e.message);
      failed.push(`services: ${e.message}`);
    }

    // ── CONTACT PAGE (Claude generates — no template) ────────────────────
    try {
      const contactPrompt = `You are building a contact page for ${businessName}, a ${businessType} in ${city}, ${state}.

BUSINESS INFO:
- Phone: ${phone}
- Email: ${email}
- Address: ${address || "mobile/service area based"}
- Service area: ${intake.service_area || city}
- Services: ${serviceNames.join(", ")}

CALL NOTES: ${callNotes ? JSON.stringify({ tone_of_voice: (callNotes as any).tone_of_voice, contact_preferences: (callNotes as any).contact_preferences }, null, 2) : "None"}

Build a complete, professional contact page HTML. Requirements:
- Match the dark navy/gold/red color scheme of a trades business template
- Include: page hero with breadcrumb, contact info section (phone as tel: link, email as mailto: link, service area, hours if known), contact form (name/phone/email/service/message), footer
- Use Oswald font for headings, Open Sans for body (load from Google Fonts)
- Mobile responsive
- Include the full CSS inlined in a <style> tag in <head>
- Include navigation: Home → ./index.html, Services → ./services.html, About → ./about.html, Contact → ./contact.html (active)
- Include this analytics script before </body>:
${analyticsScript}
- Return complete HTML from <!DOCTYPE html> to </html>
- No markdown, no code blocks, raw HTML only`;

      const contactResult = await callAI(ANTHROPIC_API_KEY, contactPrompt, "contact");
      let contactHTML = stripMarkdown(contactResult.text);
      if (!contactHTML.includes("<!DOCTYPE html>")) throw new Error("Contact page returned invalid HTML");

      const stagingContact = injectNoindex(contactHTML);
      await uploadFileToHostingerFtp(`${STAGING_FOLDER_ROOT}/${clientId}/contact.html`, stagingContact);
      await supabase.storage.from("generated-sites").upload(`${clientId}/deploy/contact.html`, new Blob([contactHTML], { type: "text/html" }), { upsert: true, contentType: "text/html; charset=utf-8" });

      generated.push("contact");
      console.log(`[extra-pages] ✓ contact.html (${contactResult.outputTokens} tokens)`);
    } catch (e: any) {
      console.error("[extra-pages] ✗ contact failed:", e.message);
      failed.push(`contact: ${e.message}`);
    }

    // ── Mark complete ────────────────────────────────────────────────────
    const stagingURL = `${STAGING_BASE_URL}/${clientId}/index.html`;

    await supabase.from("sites").update({
      generation_status: "complete",
      generation_progress: "complete",
      generated_at: new Date().toISOString(),
      staging_url: stagingURL,
    } as any).eq("client_id", clientId);

    await supabase.from("generation_logs").insert({
      client_id: clientId,
      template_id: "extra-pages",
      status: failed.length === 0 ? "complete" : "partial",
      generation_notes: `Extra pages — built: ${generated.join(", ") || "none"}. Failed: ${failed.join("; ") || "none"}.`,
    } as any);

    const { data: clientRow } = await supabase.from("clients").select("business_name").eq("id", clientId).maybeSingle();
    await supabase.from("notifications").insert({
      type: "site_ready_for_review",
      client_id: clientId,
      message: `${(clientRow as any)?.business_name || "Website"} ready for review ♛`,
      staging_url: stagingURL,
      target_role: "operator",
      read: false,
    });

    console.log(`[extra-pages] ✓ Complete. Built: ${generated.join(", ")}`);

    return new Response(JSON.stringify({ success: true, generated, failed, staging_url: stagingURL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[extra-pages] fatal error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

function injectNoindex(html: string): string {
  if (/name=["']robots["']/i.test(html)) return html;
  const tag = `\n  <meta name="robots" content="noindex, nofollow" />`;
  if (/<meta\s+charset=/i.test(html)) {
    return html.replace(/(<meta\s+charset=[^>]+>)/i, `$1${tag}`);
  }
  return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
}

async function callAI(apiKey: string, content: string, label: string): Promise<{ text: string; outputTokens: number }> {
  const MAX_ATTEMPTS = 2;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(AI_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, messages: [{ role: "user", content }] }),
      });
      clearTimeout(timeout);
      if (!r.ok) {
        const errText = await r.text();
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
      lastErr = err.name === "AbortError" ? new Error(`Claude ${label} timed out after ${TIMEOUT_MS / 1000}s`) : err as Error;
      console.error(`[${label}] attempt ${attempt} failed:`, lastErr.message);
      if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 2000));
    }
  }
  throw lastErr || new Error(`Claude failed: ${label}`);
}

function stripMarkdown(s: string): string {
  return s.replace(/^```(?:html|json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
}
