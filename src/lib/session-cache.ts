/**
 * Client-side cache of the last successful session check so client navigations
 * don't pay a server round-trip before every page. Security is still enforced
 * by `requireAuth` on every data server fn; an "Unauthorized" error clears this
 * cache and sends the user to /login (see router.tsx).
 */
export const SESSION_TTL_MS = 5 * 60_000;

let cached: { user: string | null; at: number } | null = null;

export function getCachedSession(now = Date.now()): { user: string | null } | null {
  if (typeof window === "undefined") return null; // never share across SSR requests
  if (!cached || now - cached.at > SESSION_TTL_MS) return null;
  return { user: cached.user };
}

export function setCachedSession(user: string | null, now = Date.now()): void {
  if (typeof window === "undefined") return;
  cached = { user, at: now };
}

export function clearSessionCache(): void {
  cached = null;
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error ? err.message === "Unauthorized" : false;
}
