// Generate Website v2: Design-First Approach
// This is an improved version of generate-website that prioritizes design fidelity

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface GenerateWebsiteRequest {
  clientId: string;
  businessName: string;
  businessType: string; // "trades", "professional", "salon", "food", "feminine"
  heroHeadline: string;
  heroSubheading: string;
  services: Array<{ name: string; description: string }>;
  aboutText: string;
  testimonials: Array<{ quote: string; author: string }>;
  phone: string;
  email: string;
  location: string;
  photos?: string[]; // URLs to images
}

/**
 * Main handler
 */
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload: GenerateWebsiteRequest = await req.json();

    console.log(`[generate-website-v2] Starting generation for ${payload.businessName}`);

    // Validate input
    const validation = validateInput(payload);
    if (!validation.isValid) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validation.errors }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get template based on business type
    const template = getTemplate(payload.businessType);
    if (!template) {
      return new Response(
        JSON.stringify({ error: `Unknown business type: ${payload.businessType}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate HTML with design-first approach
    let html = template.html;

    // Apply replacements with validation
    html = applyReplacements(html, {
      BUSINESS_NAME: payload.businessName,
      HERO_HEADLINE: payload.heroHeadline,
      HERO_SUBHEADING: payload.heroSubheading,
      ABOUT_TEXT: payload.aboutText,
      PHONE_NUMBER: payload.phone,
      EMAIL: payload.email,
      LOCATION: payload.location,
    });

    // Apply services
    html = applyServices(html, payload.services);

    // Apply testimonials
    html = applyTestimonials(html, payload.testimonials);

    // Validate final HTML
    const validation_result = validateHTML(html);
    if (!validation_result.isValid) {
      console.warn("[generate-website-v2] Validation warnings:", validation_result.issues);
    }

    // Save to database
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("generated_websites")
      .insert({
        client_id: payload.clientId,
        business_name: payload.businessName,
        business_type: payload.businessType,
        html_content: html,
        fidelity_score: validation_result.fidelityScore,
        validation_issues: validation_result.issues,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error("[generate-website-v2] Database error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save website", details: error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-website-v2] Successfully generated website for ${payload.businessName}`);

    return new Response(
      JSON.stringify({
        success: true,
        clientId: payload.clientId,
        fidelityScore: validation_result.fidelityScore,
        validationIssues: validation_result.issues,
        message: "Website generated successfully",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-website-v2] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Validate input payload
 */
function validateInput(payload: GenerateWebsiteRequest): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.clientId) errors.push("clientId is required");
  if (!payload.businessName) errors.push("businessName is required");
  if (!payload.businessType) errors.push("businessType is required");
  if (!payload.heroHeadline) errors.push("heroHeadline is required");
  if (!payload.heroSubheading) errors.push("heroSubheading is required");

  // Check character limits
  if (payload.businessName.length > 40) errors.push("businessName exceeds 40 characters");
  if (payload.heroHeadline.length > 60) errors.push("heroHeadline exceeds 60 characters");
  if (payload.heroSubheading.length > 200) errors.push("heroSubheading exceeds 200 characters");

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get template based on business type
 */
function getTemplate(businessType: string): { html: string; constraints: any } | null {
  // In production, these would be loaded from storage or database
  // For now, return a basic structure
  const templates: Record<string, { html: string; constraints: any }> = {
    trades: {
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{BUSINESS_NAME}}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>{{BUSINESS_NAME}}</h1>
    <nav>HOME | SERVICES | ABOUT | CONTACT</nav>
  </header>
  <section class="hero">
    <h2>{{HERO_HEADLINE}}</h2>
    <p>{{HERO_SUBHEADING}}</p>
  </section>
  <section class="services">
    <h2>Our Services</h2>
    <div id="services-list"></div>
  </section>
  <section class="about">
    <h2>About Us</h2>
    <p>{{ABOUT_TEXT}}</p>
  </section>
  <section class="testimonials">
    <h2>What Our Clients Say</h2>
    <div id="testimonials-list"></div>
  </section>
  <footer>
    <p>{{BUSINESS_NAME}} | {{PHONE_NUMBER}} | {{EMAIL}}</p>
  </footer>
</body>
</html>`,
      constraints: {
        BUSINESS_NAME: { maxChars: 40 },
        HERO_HEADLINE: { maxChars: 60 },
        HERO_SUBHEADING: { maxChars: 200 },
      },
    },
    professional: {
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{BUSINESS_NAME}}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>{{BUSINESS_NAME}}</h1>
  </header>
  <section class="hero">
    <h2>{{HERO_HEADLINE}}</h2>
    <p>{{HERO_SUBHEADING}}</p>
  </section>
  <section class="services">
    <h2>Services</h2>
    <div id="services-list"></div>
  </section>
  <section class="about">
    <h2>About</h2>
    <p>{{ABOUT_TEXT}}</p>
  </section>
  <footer>
    <p>{{BUSINESS_NAME}} | {{PHONE_NUMBER}}</p>
  </footer>
</body>
</html>`,
      constraints: {},
    },
  };

  return templates[businessType] || null;
}

/**
 * Apply text replacements with validation
 */
function applyReplacements(html: string, replacements: Record<string, string>): string {
  let result = html;

  for (const [key, value] of Object.entries(replacements)) {
    // Truncate if too long
    let finalValue = value;
    const maxChars = getMaxChars(key);
    if (finalValue.length > maxChars) {
      finalValue = finalValue.substring(0, maxChars - 3) + "...";
      console.warn(`[replacements] ${key} truncated to ${maxChars} chars`);
    }

    // Replace all occurrences
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, finalValue);
  }

  return result;
}

/**
 * Get max characters for a field
 */
function getMaxChars(field: string): number {
  const limits: Record<string, number> = {
    BUSINESS_NAME: 40,
    HERO_HEADLINE: 60,
    HERO_SUBHEADING: 200,
    ABOUT_TEXT: 800,
    PHONE_NUMBER: 14,
    EMAIL: 100,
    LOCATION: 100,
  };
  return limits[field] || 100;
}

/**
 * Apply services to HTML
 */
function applyServices(html: string, services: Array<{ name: string; description: string }>): string {
  const serviceHtml = services
    .map(
      (s, i) =>
        `<div class="service-item"><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.description)}</p></div>`
    )
    .join("\n");

  return html.replace(/<div id="services-list"><\/div>/, `<div id="services-list">${serviceHtml}</div>`);
}

/**
 * Apply testimonials to HTML
 */
function applyTestimonials(html: string, testimonials: Array<{ quote: string; author: string }>): string {
  const testimonialHtml = testimonials
    .map(
      (t, i) =>
        `<div class="testimonial"><blockquote>"${escapeHtml(t.quote)}"</blockquote><p>— ${escapeHtml(t.author)}</p></div>`
    )
    .join("\n");

  return html.replace(/<div id="testimonials-list"><\/div>/, `<div id="testimonials-list">${testimonialHtml}</div>`);
}

/**
 * Validate HTML for design fidelity
 */
function validateHTML(html: string): {
  isValid: boolean;
  issues: string[];
  fidelityScore: number;
} {
  const issues: string[] = [];

  // Check for unfilled placeholders
  const placeholders = html.match(/\{\{[^}]+\}\}/g) || [];
  if (placeholders.length > 0) {
    issues.push(`Unfilled placeholders: ${placeholders.join(", ")}`);
  }

  // Check for tag matching
  const openTags = (html.match(/<(div|section|header|footer|p|h[1-6])[^>]*>/g) || []).length;
  const closeTags = (html.match(/<\/(div|section|header|footer|p|h[1-6])>/g) || []).length;
  if (openTags !== closeTags) {
    issues.push(`Tag mismatch: ${openTags} open, ${closeTags} close`);
  }

  // Calculate fidelity score
  let score = 100;
  score -= placeholders.length * 10;
  score -= Math.abs(openTags - closeTags) * 5;

  return {
    isValid: issues.length === 0,
    issues,
    fidelityScore: Math.max(0, Math.min(100, score)),
  };
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
