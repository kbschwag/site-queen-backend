/**
 * TEMPLATE ENGINE
 * 
 * Deterministic HTML manipulation engine.
 * The AI never touches HTML — this engine does all the work.
 * 
 * Responsibilities:
 * 1. Remove sections that shouldn't be included
 * 2. Fill text slots with validated copy
 * 3. Fill image slots with URLs
 * 4. Apply style formatting (uppercase, title case, etc.)
 * 5. Validate the final output
 */

import { TemplateConfig, TemplateSlot } from "./template-registry.ts";

// ═══════════════════════════════════════════════════════════════════════
// SECTION REMOVAL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Remove sections from the HTML that shouldn't be included.
 * Uses the section class names from the template structure.
 * 
 * Strategy: Each template's top-level wrapper contains child divs.
 * We identify sections by their class and remove the entire div.
 */
export function removeSections(html: string, sectionsToRemove: string[], templateId: string): string {
  // Map section IDs to their CSS classes for each template
  const sectionClassMap = getSectionClassMap(templateId);
  
  let result = html;
  for (const sectionId of sectionsToRemove) {
    const classes = sectionClassMap[sectionId];
    if (!classes) continue;
    
    for (const cls of classes) {
      // Remove the entire div with this class (greedy but safe for top-level sections)
      result = removeDivByClass(result, cls);
    }
  }
  
  return result;
}

/**
 * Remove a div element and all its contents by class name.
 * Works for top-level section divs.
 */
function removeDivByClass(html: string, className: string): string {
  // Match the opening tag with this class, then find its balanced closing tag
  // We use a stack-based approach for safety
  const classPattern = new RegExp(`<div[^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>`, 'i');
  const match = classPattern.exec(html);
  if (!match) return html;
  
  const startIdx = match.index;
  let depth = 1;
  let i = startIdx + match[0].length;
  
  while (i < html.length && depth > 0) {
    if (html.substring(i, i + 4) === '<div') {
      depth++;
      i += 4;
    } else if (html.substring(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) {
        // Found the matching closing tag
        const endIdx = i + 6;
        return html.substring(0, startIdx) + html.substring(endIdx);
      }
      i += 6;
    } else {
      i++;
    }
  }
  
  return html; // Couldn't find balanced close, return unchanged
}

// ═══════════════════════════════════════════════════════════════════════
// TEXT SLOT FILLING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fill all text slots in the HTML with the provided values.
 * Uses the slot-to-element mapping for each template.
 */
export function fillTextSlots(
  html: string,
  slotValues: Record<string, string>,
  templateConfig: TemplateConfig,
  templateId: string
): { html: string; report: SlotFillReport } {
  const slotElementMap = getSlotElementMap(templateId);
  const report: SlotFillReport = { filled: [], skipped: [], truncated: [], failed: [] };
  
  let result = html;
  
  for (const [slotId, value] of Object.entries(slotValues)) {
    if (!value || value.trim() === "") {
      report.skipped.push(slotId);
      continue;
    }
    
    const slotConfig = templateConfig.slots[slotId];
    if (!slotConfig) {
      report.skipped.push(slotId);
      continue;
    }
    
    // Apply style formatting
    let formattedValue = applyStyle(value, slotConfig.style);
    
    // Enforce character limit
    if (formattedValue.length > slotConfig.maxChars) {
      formattedValue = smartTruncate(formattedValue, slotConfig.maxChars);
      report.truncated.push({ slotId, original: value.length, truncated: formattedValue.length });
    }
    
    // Find and replace in HTML
    const elements = slotElementMap[slotId];
    if (!elements || elements.length === 0) {
      // Fallback: try to find by placeholder pattern
      const placeholderPattern = new RegExp(`\\{\\{${slotId.toUpperCase()}\\}\\}`, 'g');
      if (placeholderPattern.test(result)) {
        result = result.replace(placeholderPattern, escapeHtml(formattedValue));
        report.filled.push(slotId);
      } else {
        report.failed.push(slotId);
      }
      continue;
    }
    
    // Replace text content in each mapped element
    let filled = false;
    for (const elem of elements) {
      const replaced = replaceTextInElement(result, elem.tag, elem.class, elem.originalText, formattedValue);
      if (replaced !== result) {
        result = replaced;
        filled = true;
      }
    }
    
    if (filled) {
      report.filled.push(slotId);
    } else {
      report.failed.push(slotId);
    }
  }
  
  return { html: result, report };
}

/**
 * Replace text content within a specific HTML element identified by tag and class.
 */
function replaceTextInElement(html: string, tag: string, className: string, originalText: string, newText: string): string {
  // Strategy 1: Find by original text content (most reliable for Figma exports)
  if (originalText) {
    const escaped = escapeRegex(originalText);
    const pattern = new RegExp(
      `(<${tag}[^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>)([^<]*)(${escaped})([^<]*</${tag}>)`,
      'i'
    );
    const match = pattern.exec(html);
    if (match) {
      return html.replace(pattern, `$1${escapeHtml(newText)}$4`);
    }
    
    // Try simpler: just replace the original text wherever it appears in an element with this class
    const simplePattern = new RegExp(
      `(<${tag}[^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>)([\\s\\S]*?)(</${tag}>)`,
      'i'
    );
    const simpleMatch = simplePattern.exec(html);
    if (simpleMatch && simpleMatch[2].includes(originalText)) {
      const newContent = simpleMatch[2].replace(originalText, escapeHtml(newText));
      return html.replace(simplePattern, `$1${newContent}$3`);
    }
  }
  
  // Strategy 2: Replace entire text content of element with this class
  const fullPattern = new RegExp(
    `(<${tag}[^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*>)([^<]*)(</${tag}>)`,
    'i'
  );
  const fullMatch = fullPattern.exec(html);
  if (fullMatch) {
    return html.replace(fullPattern, `$1${escapeHtml(newText)}$3`);
  }
  
  return html; // No match found
}

// ═══════════════════════════════════════════════════════════════════════
// IMAGE SLOT FILLING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Fill all image slots with the provided URLs.
 */
export function fillImageSlots(
  html: string,
  imageUrls: Record<string, string>,
  templateId: string
): string {
  const imageElementMap = getImageElementMap(templateId);
  let result = html;
  
  for (const [slotId, url] of Object.entries(imageUrls)) {
    if (!url) continue;
    
    const elements = imageElementMap[slotId];
    if (elements && elements.length > 0) {
      for (const elem of elements) {
        result = replaceImageSrc(result, elem.class, url);
      }
    }
  }
  
  // Also replace any remaining placeholder image URLs
  result = result.replace(/src="images\/[^"]*"/g, (match) => {
    // Keep the original if no replacement was provided
    return match;
  });
  
  return result;
}

/**
 * Replace the src attribute of an img element identified by class.
 */
function replaceImageSrc(html: string, className: string, newSrc: string): string {
  const pattern = new RegExp(
    `(<img[^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*"[^>]*?)src="[^"]*"`,
    'i'
  );
  if (pattern.test(html)) {
    return html.replace(pattern, `$1src="${escapeHtml(newSrc)}"`);
  }
  
  // Try with src before class
  const pattern2 = new RegExp(
    `(<img[^>]*?)src="[^"]*"([^>]*class="[^"]*\\b${escapeRegex(className)}\\b[^"]*")`,
    'i'
  );
  if (pattern2.test(html)) {
    return html.replace(pattern2, `$1src="${escapeHtml(newSrc)}"$2`);
  }
  
  return html;
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  score: number; // 0-100
  issues: string[];
  warnings: string[];
}

/**
 * Validate the final HTML output for quality.
 */
export function validateOutput(html: string): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // Check for remaining placeholders
  const placeholders = html.match(/\{\{[^}]+\}\}/g);
  if (placeholders) {
    issues.push(`${placeholders.length} unfilled placeholder(s): ${placeholders.slice(0, 3).join(", ")}`);
    score -= placeholders.length * 10;
  }
  
  // Check for broken images (local file paths)
  const localImages = html.match(/src="images\/[^"]*"/g);
  if (localImages) {
    warnings.push(`${localImages.length} image(s) still using local paths`);
    score -= localImages.length * 2;
  }
  
  // Check for empty text elements
  const emptyElements = html.match(/<(h[1-6]|p|span|div)[^>]*>\s*<\/\1>/g);
  if (emptyElements && emptyElements.length > 3) {
    warnings.push(`${emptyElements.length} empty text elements found`);
    score -= 5;
  }
  
  // Check for unclosed tags (basic)
  const openDivs = (html.match(/<div/g) || []).length;
  const closeDivs = (html.match(/<\/div>/g) || []).length;
  if (openDivs !== closeDivs) {
    issues.push(`Unbalanced divs: ${openDivs} open, ${closeDivs} close`);
    score -= 20;
  }
  
  // Check for Lorem Ipsum or placeholder text
  if (/lorem ipsum/i.test(html)) {
    issues.push("Lorem Ipsum text detected");
    score -= 15;
  }
  
  // Check for duplicate consecutive text
  const textBlocks = html.match(/>([^<]{20,})</g) || [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const block of textBlocks) {
    const text = block.substring(1);
    if (seen.has(text)) duplicates++;
    seen.add(text);
  }
  if (duplicates > 2) {
    warnings.push(`${duplicates} duplicate text blocks detected`);
    score -= duplicates * 3;
  }
  
  return { score: Math.max(0, score), issues, warnings };
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function applyStyle(text: string, style: TemplateSlot["style"]): string {
  switch (style) {
    case "uppercase": return text.toUpperCase();
    case "lowercase": return text.toLowerCase();
    case "title": return text.replace(/\b\w/g, c => c.toUpperCase());
    case "sentence": return text.charAt(0).toUpperCase() + text.slice(1);
    default: return text;
  }
}

function smartTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Cut at last word boundary before maxChars
  const truncated = text.substring(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.6) {
    return truncated.substring(0, lastSpace);
  }
  return truncated;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATE-SPECIFIC MAPPINGS
// ═══════════════════════════════════════════════════════════════════════

interface ElementMapping {
  tag: string;
  class: string;
  originalText?: string;
}

/**
 * Maps section IDs to their CSS class names for removal.
 * These are the top-level div classes that wrap each section.
 */
function getSectionClassMap(templateId: string): Record<string, string[]> {
  const maps: Record<string, Record<string, string[]>> = {
    "trades": {
      "trust-badges": ["background"],
      "navigation": ["header"],
      "hero": ["hero"],
      "services-intro": ["container-wrapper"],
      "social-proof": ["section"],
      "about": ["about"],
      "why-us": ["section-2"],
      "services-detail": ["section-3", "section-4"],
      "portfolio": ["section-5", "section-9", "section-11"],
      "service-areas": ["section-6"],
      "testimonials": ["section-7"],
      "cta": ["section-8"],
      "footer": ["footer"],
    },
    "professional-services": {
      "trust-badges": ["section"],
      "navigation": ["header"],
      "about": ["container-wrapper"],
      "services": ["section-2"],
      "stats": ["section-3"],
      "who-we-serve": ["section-4"],
      "differentiators": ["section-5"],
      "brand-statement": ["section-6"],
      "team": ["section-7"],
      "testimonials": ["section-8"],
      "cta": ["section-9"],
      "footer": ["footer"],
    },
    "salon": {
      "navigation": ["header"],
      "hero": ["section"],
      "philosophy": ["container-wrapper"],
      "services": ["section-2"],
      "experience": ["section-3"],
      "testimonials": ["section-5"],
      "cta": ["section-6", "section-7", "background-2"],
      "footer": ["footer"],
    },
    "food": {
      "navigation": ["header"],
      "hero": ["background"],
      "cta": ["section-7"],
      "footer": ["footer"],
    },
    "feminine-services": {
      // Feminine template is deeply nested - sections are within .main
      "navigation": ["nav-wrapper"],
      "hero": ["hero-section"],
      "about": ["about-section"],
      "services": ["services-section"],
      "testimonials": ["testimonials-section"],
      "before-after": ["results-section"],
      "cta": ["cta-section"],
      "footer": ["footer-section"],
    },
  };
  
  return maps[templateId] || maps["trades"];
}

/**
 * Maps slot IDs to their HTML element locations.
 * This is the critical mapping that allows deterministic text replacement.
 */
function getSlotElementMap(templateId: string): Record<string, ElementMapping[]> {
  const maps: Record<string, Record<string, ElementMapping[]>> = {
    "trades": {
      "business_name": [
        { tag: "span", class: "text-wrapper-52", originalText: "SPARKLE" },
        { tag: "span", class: "text-wrapper-4", originalText: "PRO" },
        { tag: "div", class: "text-wrapper-3", originalText: "SPARKLEPRO" },
      ],
      "phone": [
        { tag: "div", class: "text-wrapper-51", originalText: "(215) 555-0199" },
        { tag: "div", class: "text-wrapper-53", originalText: "(215) 555-0199" },
        { tag: "div", class: "text-wrapper-14", originalText: "(215) 555-0199" },
      ],
      "hero_headline": [
        { tag: "div", class: "one-call-one-trusted", originalText: "One call, one trusted crew, every job." },
      ],
      "hero_subheading": [
        { tag: "p", class: "one-call-one-trusted", originalText: "available across Greater Philly" },
      ],
      "hero_cta_text": [
        { tag: "div", class: "text-wrapper-14", originalText: "CALL NOW" },
      ],
      "trust_rating": [
        { tag: "div", class: "text-wrapper", originalText: "4.9" },
      ],
      "trust_review_count": [
        { tag: "div", class: "text-wrapper-2", originalText: "(2,260 Reviews)" },
      ],
      "about_headline": [
        { tag: "div", class: "award-winning", originalText: "Award-Winning" },
      ],
      "about_story": [
        { tag: "p", class: "from-a-single-van-in", originalText: "" },
      ],
      "footer_tagline": [
        { tag: "p", class: "philadelphia-s", originalText: "Philadelphia" },
      ],
    },
    "professional-services": {
      "business_name": [
        { tag: "div", class: "text-wrapper-20", originalText: "BLACKWOOD" },
        { tag: "div", class: "legal", originalText: "LEGAL" },
        { tag: "div", class: "text-wrapper-23", originalText: "BLACKWOOD" },
        { tag: "div", class: "legal-2", originalText: "LEGAL" },
      ],
      "about_eyebrow": [
        { tag: "div", class: "text-wrapper-2", originalText: "ABOUT US" },
      ],
      "about_headline": [
        { tag: "p", class: "more-than-a-law-firm", originalText: "More Than A Law" },
      ],
      "about_story": [
        { tag: "p", class: "for-seven-decades", originalText: "For seven decades" },
      ],
      "services_eyebrow": [
        { tag: "div", class: "text-wrapper-2", originalText: "SERVICES" },
      ],
      "services_headline": [
        { tag: "div", class: "comprehensive-legal", originalText: "Comprehensive" },
      ],
      "stats_headline": [
        { tag: "div", class: "our-results", originalText: "OUR RESULTS" },
      ],
      "cta_headline": [
        { tag: "div", class: "engage-with-our", originalText: "Engage With Our Practice." },
      ],
      "cta_button_text": [
        { tag: "div", class: "text-wrapper-3", originalText: "SCHEDULE A CONSULTATION" },
        { tag: "div", class: "free-consultation", originalText: "FREE CONSULTATION" },
      ],
      "footer_tagline": [
        { tag: "p", class: "seventy-years-of-2", originalText: "Seventy years" },
      ],
    },
    "salon": {
      "business_name": [
        { tag: "div", class: "MAREN-BLOOM", originalText: "MAREN BLOOM" },
      ],
      "hero_eyebrow": [
        { tag: "div", class: "about", originalText: "✦   ABOUT   ✦" },
      ],
      "hero_headline": [
        { tag: "div", class: "a-house-built-for", originalText: "A House Built" },
      ],
      "hero_story": [
        { tag: "p", class: "building-restored", originalText: "" },
      ],
      "services_headline": [
        { tag: "div", class: "a-boutique-luxury", originalText: "" },
      ],
      "cta_headline": [
        { tag: "div", class: "book-online", originalText: "Book Online" },
      ],
      "cta_button_text": [
        { tag: "div", class: "book", originalText: "BOOK" },
      ],
    },
    "food": {
      "business_name": [
        { tag: "div", class: "EMBER-BUN", originalText: "EMBER BUN" },
      ],
      "hero_headline": [
        { tag: "div", class: "come-hungry-leave", originalText: "Come Hungry, Leave" },
      ],
      "about_headline": [
        { tag: "div", class: "about-grill-betbfozh", originalText: "" },
      ],
      "about_story": [
        { tag: "p", class: "beef-from-one-farm", originalText: "" },
      ],
      "hero_cta_text": [
        { tag: "div", class: "book-a-table", originalText: "BOOK A TABLE" },
      ],
    },
    "feminine-services": {
      "business_name": [
        { tag: "div", class: "adaeze-okafor", originalText: "" },
      ],
      "hero_headline": [
        { tag: "div", class: "because-the-women", originalText: "" },
      ],
      "about_headline": [
        { tag: "div", class: "about-me", originalText: "" },
      ],
      "about_story": [
        { tag: "p", class: "a-complimentary", originalText: "" },
      ],
    },
  };
  
  return maps[templateId] || {};
}

/**
 * Maps image slot IDs to their img element classes.
 */
function getImageElementMap(templateId: string): Record<string, ElementMapping[]> {
  const maps: Record<string, Record<string, ElementMapping[]>> = {
    "trades": {
      "hero_bg": [{ tag: "img", class: "background-2", originalText: "" }],
      "about_photo": [{ tag: "img", class: "background-3", originalText: "" }],
      "service_1_img": [{ tag: "img", class: "background-4", originalText: "" }],
      "service_2_img": [{ tag: "img", class: "background-5", originalText: "" }],
      "service_3_img": [{ tag: "img", class: "background-6", originalText: "" }],
    },
    "professional-services": {
      "about_photo": [{ tag: "img", class: "background", originalText: "" }],
    },
    "salon": {
      "hero_photo": [{ tag: "img", class: "a-candlelit", originalText: "" }],
    },
    "food": {
      "hero_photo": [{ tag: "img", class: "chef-searing-a", originalText: "" }],
    },
    "feminine-services": {
      "hero_photo": [{ tag: "img", class: "beautiful-woman-with", originalText: "" }],
    },
  };
  
  return maps[templateId] || {};
}

// ═══════════════════════════════════════════════════════════════════════
// REPORT TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface SlotFillReport {
  filled: string[];
  skipped: string[];
  truncated: { slotId: string; original: number; truncated: number }[];
  failed: string[];
}
