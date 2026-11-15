/**
 * Single-user password gate. The cookie holds sha256(APP_PASSWORD + AUTH_SECRET),
 * so changing either env var logs every session out. Uses Web Crypto so it runs
 * in middleware (edge) and in server actions alike.
 */
export const SESSION_COOKIE = "radar_session";

export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}:${process.env.AUTH_SECRET ?? "radar"}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Expected cookie value, or null when no APP_PASSWORD is set (gate disabled). */
export async function sessionToken(): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  return password ? tokenFor(password) : null;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
