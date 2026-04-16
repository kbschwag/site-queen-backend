/**
 * Sanitize user input to prevent XSS and injection attacks.
 * Apply to every free-text field before storing or sending to AI.
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') return String(input ?? '');

  return input
    .trim()
    // Remove script tags first (most dangerous)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove all HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Remove data: protocol (potential XSS vector)
    .replace(/data:/gi, '')
    // Remove on* event handlers that might survive
    .replace(/on\w+\s*=/gi, '')
    // Limit length to prevent abuse
    .substring(0, 10000);
}

/**
 * Sanitize all string values in an object (shallow).
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'string') {
      (result as any)[key] = sanitizeInput(result[key]);
    }
  }
  return result;
}
