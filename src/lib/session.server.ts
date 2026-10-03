import { createHash, createHmac, timingSafeEqual } from "crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const COOKIE = "dk_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 32) throw new Error("SESSION_SECRET belum diatur (minimal 32 karakter).");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEq(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function checkCredentials(username: string, password: string): boolean {
  const u = process.env["APP_USERNAME"];
  const p = process.env["APP_PASSWORD"];
  if (!u || !p) throw new Error("APP_USERNAME dan APP_PASSWORD belum diatur.");
  const okU = safeEq(username, u);
  const okP = safeEq(password, p);
  return okU && okP;
}

const cookieOpts = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  partitioned: true,
  path: "/",
};

export function createSession(username: string): void {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + MAX_AGE * 1000 }),
  ).toString("base64url");
  setCookie(COOKIE, `${payload}.${sign(payload)}`, { ...cookieOpts, maxAge: MAX_AGE });
}

export function readSession(): { u: string } | null {
  const raw = getCookie(COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      u: string;
      exp: number;
    };
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { u: data.u };
  } catch {
    return null;
  }
}

export function destroySession(): void {
  deleteCookie(COOKIE, cookieOpts);
}
