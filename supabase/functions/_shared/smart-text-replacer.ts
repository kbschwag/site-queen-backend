// Smart Text Replacer: Validates and replaces text in Figma-exported templates
// Ensures all replacements fit within design constraints

export interface TextConstraint {
  placeholder: string;
  maxChars: number;
  minChars?: number;
  tone?: "bold" | "professional" | "casual" | "friendly";
  fallback: string;
  description?: string;
}

export interface ReplacementResult {
  placeholder: string;
  original: string;
  replaced: string;
  isValid: boolean;
  charCount: number;
  errors: string[];
}

export class SmartTextReplacer {
  private constraints: Map<string, TextConstraint> = new Map();
  private results: ReplacementResult[] = [];

  constructor(constraints: TextConstraint[]) {
    constraints.forEach(c => {
      this.constraints.set(c.placeholder, c);
    });
  }

  /**
   * Validate text against constraints
   */
  validateText(placeholder: string, text: string): { isValid: boolean; errors: string[] } {
    const constraint = this.constraints.get(placeholder);
    if (!constraint) {
      return { isValid: false, errors: [`No constraint found for ${placeholder}`] };
    }

    const errors: string[] = [];
    const charCount = text.length;

    // Check max length
    if (charCount > constraint.maxChars) {
      errors.push(`Text exceeds max ${constraint.maxChars} chars (got ${charCount})`);
    }

    // Check min length if specified
    if (constraint.minChars && charCount < constraint.minChars) {
      errors.push(`Text is shorter than min ${constraint.minChars} chars (got ${charCount})`);
    }

    // Check for line breaks in single-line fields
    if (placeholder.includes("HEADLINE") && text.includes("\n")) {
      errors.push("Headline cannot contain line breaks");
    }

    // Check for empty strings
    if (!text || text.trim().length === 0) {
      errors.push("Text cannot be empty");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Replace a placeholder with validated text
   */
  replace(html: string, placeholder: string, text: string): string {
    const constraint = this.constraints.get(placeholder);
    if (!constraint) {
      console.warn(`[smart-replacer] No constraint for ${placeholder}, skipping`);
      return html;
    }

    const validation = this.validateText(placeholder, text);

    let finalText = text;
    if (!validation.isValid) {
      console.warn(`[smart-replacer] Validation failed for ${placeholder}:`, validation.errors);
      // Use fallback
      finalText = constraint.fallback;
      console.log(`[smart-replacer] Using fallback: "${finalText}"`);
    }

    // Truncate if still too long (safety net)
    if (finalText.length > constraint.maxChars) {
      finalText = finalText.substring(0, constraint.maxChars - 3) + "...";
    }

    // Replace all occurrences of the placeholder
    const regex = new RegExp(`{{${placeholder}}}`, "g");
    const updated = html.replace(regex, finalText);

    this.results.push({
      placeholder,
      original: text,
      replaced: finalText,
      isValid: validation.isValid,
      charCount: finalText.length,
      errors: validation.errors,
    });

    return updated;
  }

  /**
   * Replace multiple placeholders at once
   */
  replaceMultiple(html: string, replacements: Record<string, string>): string {
    let result = html;
    for (const [placeholder, text] of Object.entries(replacements)) {
      result = this.replace(result, placeholder, text);
    }
    return result;
  }

  /**
   * Get replacement results
   */
  getResults(): ReplacementResult[] {
    return this.results;
  }

  /**
   * Check if all replacements were valid
   */
  allValid(): boolean {
    return this.results.every(r => r.isValid);
  }

  /**
   * Get a summary of replacements
   */
  getSummary(): {
    total: number;
    valid: number;
    invalid: number;
    errors: string[];
  } {
    const errors: string[] = [];
    this.results.forEach(r => {
      if (!r.isValid) {
        errors.push(`${r.placeholder}: ${r.errors.join(", ")}`);
      }
    });

    return {
      total: this.results.length,
      valid: this.results.filter(r => r.isValid).length,
      invalid: this.results.filter(r => !r.isValid).length,
      errors,
    };
  }
}

/**
 * Pre-defined constraints for common template slots
 */
export const COMMON_CONSTRAINTS: Record<string, TextConstraint> = {
  BUSINESS_NAME: {
    placeholder: "BUSINESS_NAME",
    maxChars: 40,
    minChars: 2,
    tone: "bold",
    fallback: "Professional Services",
    description: "Company name - appears in header and hero",
  },
  HERO_HEADLINE_LINE1: {
    placeholder: "HERO_HEADLINE_LINE1",
    maxChars: 30,
    minChars: 3,
    tone: "bold",
    fallback: "EXPERT SERVICE",
    description: "First line of hero headline (ALL CAPS)",
  },
  HERO_HEADLINE_HIGHLIGHT: {
    placeholder: "HERO_HEADLINE_HIGHLIGHT",
    maxChars: 25,
    minChars: 2,
    tone: "bold",
    fallback: "IN YOUR AREA",
    description: "Accent/highlight part of headline (ALL CAPS)",
  },
  HERO_HEADLINE_LINE2: {
    placeholder: "HERO_HEADLINE_LINE2",
    maxChars: 30,
    minChars: 0,
    tone: "bold",
    fallback: "",
    description: "Optional third line of headline (ALL CAPS)",
  },
  HERO_SUBHEADING: {
    placeholder: "HERO_SUBHEADING",
    maxChars: 200,
    minChars: 20,
    tone: "professional",
    fallback: "Professional service with years of local expertise and dedication to quality.",
    description: "Hero subheading - 1-2 sentences",
  },
  SERVICE_NAME: {
    placeholder: "SERVICE_NAME",
    maxChars: 40,
    minChars: 3,
    tone: "professional",
    fallback: "Professional Service",
    description: "Service or product name",
  },
  SERVICE_DESC: {
    placeholder: "SERVICE_DESC",
    maxChars: 300,
    minChars: 20,
    tone: "professional",
    fallback: "Expert service tailored to your specific needs and circumstances.",
    description: "Service description - 2-3 sentences",
  },
  ABOUT_HEADLINE: {
    placeholder: "ABOUT_HEADLINE",
    maxChars: 60,
    minChars: 5,
    tone: "professional",
    fallback: "About Our Business",
    description: "About page headline",
  },
  ABOUT_STORY: {
    placeholder: "ABOUT_STORY",
    maxChars: 800,
    minChars: 50,
    tone: "friendly",
    fallback: "We are a dedicated team committed to providing exceptional service to our clients.",
    description: "About page story - 3-4 paragraphs",
  },
  TESTIMONIAL_QUOTE: {
    placeholder: "TESTIMONIAL_QUOTE",
    maxChars: 300,
    minChars: 20,
    tone: "friendly",
    fallback: "Great service and highly professional team.",
    description: "Customer testimonial quote",
  },
  TESTIMONIAL_NAME: {
    placeholder: "TESTIMONIAL_NAME",
    maxChars: 50,
    minChars: 2,
    tone: "professional",
    fallback: "Satisfied Customer",
    description: "Testimonial author name",
  },
  CTA_BUTTON_TEXT: {
    placeholder: "CTA_BUTTON_TEXT",
    maxChars: 25,
    minChars: 3,
    tone: "bold",
    fallback: "GET STARTED",
    description: "Call-to-action button text",
  },
  PHONE_NUMBER: {
    placeholder: "PHONE_NUMBER",
    maxChars: 14,
    minChars: 10,
    tone: "professional",
    fallback: "(555) 000-0000",
    description: "Phone number - format: (XXX) XXX-XXXX",
  },
};

/**
 * Create a replacer with common constraints
 */
export function createCommonReplacer(): SmartTextReplacer {
  return new SmartTextReplacer(Object.values(COMMON_CONSTRAINTS));
}
