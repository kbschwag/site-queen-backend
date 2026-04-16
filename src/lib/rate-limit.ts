/**
 * Client-side rate limiting using localStorage.
 * This is a UX convenience — real enforcement happens server-side.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const storageKey = `rl_${key}`;
  const now = Date.now();

  try {
    const raw = localStorage.getItem(storageKey);
    const entry: RateLimitEntry = raw ? JSON.parse(raw) : null;

    if (!entry || now > entry.resetAt) {
      // Fresh window
      localStorage.setItem(storageKey, JSON.stringify({ count: 1, resetAt: now + windowMs }));
      return { allowed: true, remaining: maxAttempts - 1, retryAfterMs: 0 };
    }

    if (entry.count >= maxAttempts) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    }

    entry.count++;
    localStorage.setItem(storageKey, JSON.stringify(entry));
    return { allowed: true, remaining: maxAttempts - entry.count, retryAfterMs: 0 };
  } catch {
    return { allowed: true, remaining: maxAttempts, retryAfterMs: 0 };
  }
}
