import type { Env, User } from "./env";

const enc = new TextEncoder();

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return diff === 0;
}

/** Find the user that owns this token. ACCESS_TOKENS = "name:token,name2:token2". */
export function userForToken(env: Env, token: string | null | undefined): User | null {
  if (!token || token.length < 24) return null;
  const admins = (env.ADMIN_USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let found: User | null = null;
  for (const entry of (env.ACCESS_TOKENS ?? "").split(",")) {
    const i = entry.indexOf(":");
    if (i < 1) continue;
    const name = entry.slice(0, i).trim();
    const tok = entry.slice(i + 1).trim();
    // Check every entry (no early exit) so timing does not reveal which entry matched.
    if (tok.length >= 24 && safeEqual(tok, token) && !found) {
      found = { name, admin: admins.includes(name) };
    }
  }
  return found;
}

/** Token from "Authorization: Bearer x" or from the URL path /mcp/<token>. */
export function tokenFromRequest(req: Request, url: URL): string | null {
  const h = req.headers.get("authorization");
  if (h && /^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, "").trim();
  const m = url.pathname.match(/^\/mcp\/([A-Za-z0-9_\-]+)\/?$/);
  return m ? m[1] : null;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sign(env: Env, payload: string): Promise<string> {
  if (!env.SIGNING_SECRET || env.SIGNING_SECRET.length < 24) {
    throw new Error("SIGNING_SECRET is missing or too short (set it with wrangler secret put).");
  }
  const key = await hmacKey(env.SIGNING_SECRET);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

export async function verify(env: Env, payload: string, sig: string): Promise<boolean> {
  return safeEqual(await sign(env, payload), sig);
}

export function randomId(bytes = 18): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}
