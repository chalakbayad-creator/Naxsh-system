import { userForToken } from "./auth";
import type { Env } from "./env";

/**
 * A small private page where the admin pastes the Kie.ai and Gemini keys from a phone.
 * Keys are encrypted (AES-GCM, key derived from SIGNING_SECRET) before they are stored.
 * Keys set as Worker secrets always win over keys saved here.
 */

const CONFIG_KEY = "config/keys";
const enc = new TextEncoder();

async function aesKey(env: Env) {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(`naxsh-keys|${env.SIGNING_SECRET}`));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function saveKeys(env: Env, keys: Record<string, string>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(JSON.stringify(keys)));
  const blob = new Uint8Array(12 + data.byteLength);
  blob.set(iv);
  blob.set(new Uint8Array(data), 12);
  await env.FILES.put(CONFIG_KEY, blob.buffer, { httpMetadata: { contentType: "application/octet-stream" } });
}

async function readKeys(env: Env): Promise<Record<string, string>> {
  const o = await env.FILES.get(CONFIG_KEY);
  if (!o) return {};
  const blob = new Uint8Array(await new Response(o.body).arrayBuffer());
  if (blob.byteLength < 13) return {};
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, await aesKey(env), blob.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return {};
  }
}

/** Fill KIE_API_KEY / GEMINI_API_KEY from the saved keys when they are not set as secrets. */
export async function withSavedKeys(env: Env): Promise<Env> {
  if (env.KIE_API_KEY && env.GEMINI_API_KEY) return env;
  const k = await readKeys(env);
  return { ...env, KIE_API_KEY: env.KIE_API_KEY || k.KIE_API_KEY || "", GEMINI_API_KEY: env.GEMINI_API_KEY || k.GEMINI_API_KEY || "" };
}

function page(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="ckb" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Naxsh Media Setup</title>
<style>body{font-family:system-ui,Tahoma,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px 16px}
main{max-width:520px;margin:auto}h1{font-size:22px}label{display:block;margin:18px 0 6px;font-weight:600}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:16px;direction:ltr}
button{margin-top:22px;width:100%;padding:14px;border:0;border-radius:10px;background:#22c55e;color:#04210f;font-size:17px;font-weight:700}
.ok{background:#14532d;padding:14px;border-radius:10px}.muted{color:#94a3b8;font-size:14px}</style></head><body><main>${body}</main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

/** GET/POST /setup/<admin token> */
export async function handleSetup(req: Request, env: Env, url: URL): Promise<Response> {
  const token = url.pathname.split("/")[2] ?? "";
  const user = userForToken(env, token);
  if (!user || !user.admin) {
    await new Promise((r) => setTimeout(r, 400));
    return page("<h1>ڕێگەپێنەدراو</h1>", 403);
  }
  const current = await readKeys(env);
  if (req.method === "POST") {
    const form = await req.formData();
    const kie = String(form.get("kie") ?? "").trim();
    const gem = String(form.get("gemini") ?? "").trim();
    const next = { ...current };
    if (kie) next.KIE_API_KEY = kie;
    if (gem) next.GEMINI_API_KEY = gem;
    await saveKeys(env, next);
    return page(`<h1>✅ پاشەکەوت کرا</h1><p class="ok">کلیلەکان بە شێوەی شاردراوە (encrypted) هەڵگیران. ئێستا دەتوانیت ئەم پەڕەیە دابخەیت و بگەڕێیتەوە بۆ Claude.</p>`);
  }
  const has = (k: string) => (env[k as keyof Env] || current[k] ? "✅ دانراوە — بۆ گۆڕین نوێی بنووسە" : "❌ هێشتا دانەنراوە");
  return page(`<h1>دانانی کلیلەکان</h1>
<p class="muted">کلیلەکان لێرە دابنێ. کەس جگە لە سێرڤەرەکە نایانبینێت.</p>
<form method="post">
<label>کلیلی Kie.ai <span class="muted">(${has("KIE_API_KEY")})</span></label>
<input name="kie" type="password" autocomplete="off" placeholder="kie.ai/api-key">
<label>کلیلی Google AI Studio <span class="muted">(${has("GEMINI_API_KEY")})</span></label>
<input name="gemini" type="password" autocomplete="off" placeholder="aistudio.google.com/apikey">
<button type="submit">پاشەکەوت</button></form>`);
}
