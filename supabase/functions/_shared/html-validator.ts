// HTML Validator: Checks for design fidelity issues before deployment

export interface ValidationIssue {
  type: "error" | "warning";
  code: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface ValidationReport {
  isValid: boolean;
  issues: ValidationIssue[];
  metrics: {
    totalPlaceholders: number;
    filledPlaceholders: number;
    emptyPlaceholders: number;
    unclosedTags: number;
    brokenImages: number;
    missingAltText: number;
  };
  fidelityScore: number; // 0-100
}

export class HTMLValidator {
  private html: string;
  private issues: ValidationIssue[] = [];

  constructor(html: string) {
    this.html = html;
  }

  /**
   * Run all validation checks
   */
  validate(): ValidationReport {
    this.issues = [];

    this.checkUnfilledPlaceholders();
    this.checkTagMatching();
    this.checkImages();
    this.checkAccessibility();
    this.checkCommonIssues();

    const metrics = this.getMetrics();
    const fidelityScore = this.calculateFidelityScore(metrics);

    return {
      isValid: this.issues.filter(i => i.severity === "critical").length === 0,
      issues: this.issues,
      metrics,
      fidelityScore,
    };
  }

  /**
   * Check for unfilled placeholders
   */
  private checkUnfilledPlaceholders(): void {
    const placeholders = this.html.match(/\{\{[^}]+\}\}/g) || [];

    if (placeholders.length > 0) {
      this.issues.push({
        type: "error",
        code: "UNFILLED_PLACEHOLDERS",
        message: `${placeholders.length} unfilled placeholders found: ${placeholders.slice(0, 3).join(", ")}${placeholders.length > 3 ? "..." : ""}`,
        severity: "critical",
      });
    }

    // Check for common placeholder patterns that might be missed
    const commonMissed = this.html.match(/###|<<<|>>>|\[\[\[|\]\]\]|<placeholder|<PLACEHOLDER/gi) || [];
    if (commonMissed.length > 0) {
      this.issues.push({
        type: "error",
        code: "MISSED_PLACEHOLDERS",
        message: `${commonMissed.length} potential missed placeholders found`,
        severity: "critical",
      });
    }
  }

  /**
   * Check for tag matching
   */
  private checkTagMatching(): void {
    const openTags = (this.html.match(/<(div|section|article|header|footer|main|nav|aside|p|h[1-6]|ul|ol|li|form|input|button|img|a|span|strong|em|b|i)[^>]*>/gi) || []).length;
    const closeTags = (this.html.match(/<\/(div|section|article|header|footer|main|nav|aside|p|h[1-6]|ul|ol|li|form|input|button|img|a|span|strong|em|b|i)>/gi) || []).length;
    const selfClosing = (this.html.match(/<(img|input|br|hr)[^>]*\/>/gi) || []).length;

    const mismatch = Math.abs(openTags - closeTags - selfClosing);
    if (mismatch > 0) {
      this.issues.push({
        type: "error",
        code: "TAG_MISMATCH",
        message: `Tag mismatch detected: ${openTags} open, ${closeTags} close, ${selfClosing} self-closing (diff: ${mismatch})`,
        severity: "critical",
      });
    }
  }

  /**
   * Check for image issues
   */
  private checkImages(): void {
    // Empty src attributes
    const emptyImages = (this.html.match(/<img[^>]*src=""[^>]*>/gi) || []).length;
    if (emptyImages > 0) {
      this.issues.push({
        type: "error",
        code: "EMPTY_IMAGE_SRC",
        message: `${emptyImages} images have empty src attribute`,
        severity: "critical",
      });
    }

    // Missing alt text
    const imagesWithoutAlt = (this.html.match(/<img(?!.*alt=)[^>]*>/gi) || []).length;
    if (imagesWithoutAlt > 0) {
      this.issues.push({
        type: "warning",
        code: "MISSING_ALT_TEXT",
        message: `${imagesWithoutAlt} images missing alt text (accessibility issue)`,
        severity: "medium",
      });
    }

    // Broken image paths
    const brokenPaths = (this.html.match(/<img[^>]*src="(img\/|\/img\/|\.\/img\/)[^"]*"[^>]*>/gi) || []).length;
    if (brokenPaths > 0) {
      this.issues.push({
        type: "warning",
        code: "RELATIVE_IMAGE_PATHS",
        message: `${brokenPaths} images use relative paths (may break on deployment)`,
        severity: "high",
      });
    }
  }

  /**
   * Check accessibility
   */
  private checkAccessibility(): void {
    // Missing form labels
    const inputsWithoutLabels = (this.html.match(/<input[^>]*(?!.*<label)[^>]*>/gi) || []).length;
    if (inputsWithoutLabels > 0) {
      this.issues.push({
        type: "warning",
        code: "MISSING_FORM_LABELS",
        message: `${inputsWithoutLabels} form inputs may be missing labels`,
        severity: "low",
      });
    }

    // Missing page title
    if (!this.html.includes("<title>")) {
      this.issues.push({
        type: "warning",
        code: "MISSING_PAGE_TITLE",
        message: "Page is missing <title> tag (SEO issue)",
        severity: "medium",
      });
    }
  }

  /**
   * Check for common design issues
   */
  private checkCommonIssues(): void {
    // Inline styles that might override design
    const inlineStyles = (this.html.match(/style="[^"]*"/gi) || []).length;
    if (inlineStyles > 10) {
      this.issues.push({
        type: "warning",
        code: "EXCESSIVE_INLINE_STYLES",
        message: `${inlineStyles} inline styles found (may override design system)`,
        severity: "low",
      });
    }

    // Very long text nodes (potential overflow)
    const longText = this.html.match(/>(.{500,})</g) || [];
    if (longText.length > 0) {
      this.issues.push({
        type: "warning",
        code: "POTENTIALLY_LONG_TEXT",
        message: `${longText.length} text nodes exceed 500 characters (may cause overflow)`,
        severity: "medium",
      });
    }

    // Missing viewport meta tag
    if (!this.html.includes('viewport')) {
      this.issues.push({
        type: "warning",
        code: "MISSING_VIEWPORT",
        message: "Missing viewport meta tag (responsive design issue)",
        severity: "high",
      });
    }
  }

  /**
   * Get validation metrics
   */
  private getMetrics(): ValidationReport["metrics"] {
    const placeholders = this.html.match(/\{\{[^}]+\}\}/g) || [];
    const openTags = (this.html.match(/<(div|section|article|header|footer|main|nav|aside|p|h[1-6]|ul|ol|li|form|input|button|img|a|span|strong|em|b|i)[^>]*>/gi) || []).length;
    const closeTags = (this.html.match(/<\/(div|section|article|header|footer|main|nav|aside|p|h[1-6]|ul|ol|li|form|input|button|img|a|span|strong|em|b|i)>/gi) || []).length;
    const selfClosing = (this.html.match(/<(img|input|br|hr)[^>]*\/>/gi) || []).length;
    const emptyImages = (this.html.match(/<img[^>]*src=""[^>]*>/gi) || []).length;
    const missingAltText = (this.html.match(/<img(?!.*alt=)[^>]*>/gi) || []).length;

    return {
      totalPlaceholders: placeholders.length,
      filledPlaceholders: 0, // Would need to track during generation
      emptyPlaceholders: placeholders.length,
      unclosedTags: Math.abs(openTags - closeTags - selfClosing),
      brokenImages: emptyImages,
      missingAltText,
    };
  }

  /**
   * Calculate a fidelity score (0-100)
   */
  private calculateFidelityScore(metrics: ValidationReport["metrics"]): number {
    let score = 100;

    // Deduct points for issues
    score -= metrics.emptyPlaceholders * 10; // Critical
    score -= metrics.unclosedTags * 5; // Critical
    score -= metrics.brokenImages * 8; // Critical
    score -= metrics.missingAltText * 2; // Minor

    // Deduct for warnings
    const warnings = this.issues.filter(i => i.severity === "high").length;
    score -= warnings * 3;

    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get a human-readable report
   */
  getReport(): string {
    const validation = this.validate();
    const lines: string[] = [];

    lines.push("=".repeat(60));
    lines.push("HTML VALIDATION REPORT");
    lines.push("=".repeat(60));

    lines.push(`\nStatus: ${validation.isValid ? "✅ VALID" : "❌ INVALID"}`);
    lines.push(`Fidelity Score: ${validation.fidelityScore}/100`);

    lines.push(`\nMetrics:`);
    lines.push(`  - Total placeholders: ${validation.metrics.totalPlaceholders}`);
    lines.push(`  - Empty placeholders: ${validation.metrics.emptyPlaceholders}`);
    lines.push(`  - Unclosed tags: ${validation.metrics.unclosedTags}`);
    lines.push(`  - Broken images: ${validation.metrics.brokenImages}`);
    lines.push(`  - Missing alt text: ${validation.metrics.missingAltText}`);

    if (validation.issues.length > 0) {
      lines.push(`\nIssues (${validation.issues.length}):`);
      const byType = {
        error: validation.issues.filter(i => i.type === "error"),
        warning: validation.issues.filter(i => i.type === "warning"),
      };

      if (byType.error.length > 0) {
        lines.push("\n  Errors:");
        byType.error.forEach(issue => {
          lines.push(`    ❌ [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`);
        });
      }

      if (byType.warning.length > 0) {
        lines.push("\n  Warnings:");
        byType.warning.forEach(issue => {
          lines.push(`    ⚠️  [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`);
        });
      }
    } else {
      lines.push("\n✅ No issues found!");
    }

    lines.push("\n" + "=".repeat(60));

    return lines.join("\n");
  }
}
