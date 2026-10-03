import { createHash, timingSafeEqual } from "crypto";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Validates `x-api-key` (or `Authorization: Bearer`) against N8N_API_KEY. Returns a Response when denied. */
export function checkApiKey(request: Request): Response | null {
  const expected = process.env["N8N_API_KEY"];
  if (!expected || expected.length < 24) return json({ ok: false, error: "N8N_API_KEY belum diatur di server" }, 503);
  const given = request.headers.get("x-api-key") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) return json({ ok: false, error: "Unauthorized" }, 401);
  return null;
}
