import { randomId, sign, verify } from "./auth";
import type { Ctx, Env } from "./env";

/**
 * Files live in R2 under files/<id>/<filename>. The id is a long random value, so the
 * public link /f/<id>/<filename> cannot be guessed. Kie.ai needs public links to read
 * reference images, which is why files are served without a token.
 */

export interface StoredFile {
  file_id: string;
  filename: string;
  url: string;
  size?: number;
  content_type?: string;
}

const SAFE_NAME = /[^A-Za-z0-9._\-]/g;

export function cleanName(name: string): string {
  const n = (name || "file").split("/").pop()!.replace(SAFE_NAME, "_").slice(-80);
  return n.replace(/^\.+/, "") || "file";
}

export function fileKey(id: string, filename: string) {
  return `files/${id}/${filename}`;
}

export function publicUrl(ctx: Ctx, id: string, filename: string) {
  return `${ctx.origin}/f/${id}/${encodeURIComponent(filename)}`;
}

/** file_id looks like "<id>/<filename>". */
export function parseFileId(fileId: string): { id: string; filename: string } {
  const m = fileId.trim().match(/^([A-Za-z0-9_\-]{16,})\/([^/]+)$/);
  if (!m) throw new Error(`Bad file_id "${fileId}". It looks like "AbC123.../frame1.png".`);
  return { id: m[1], filename: decodeURIComponent(m[2]) };
}

/** Accept a file_id, one of our /f/ links, or any https URL. Returns a URL Kie/Gemini can fetch. */
export function resolveToUrl(ctx: Ctx, ref: string): string {
  const r = ref.trim();
  if (/^https:\/\//i.test(r) || r.startsWith(`${ctx.origin}/f/`)) return r;
  const { id, filename } = parseFileId(r);
  return publicUrl(ctx, id, filename);
}

/** If the ref points at our own storage, return its R2 key. */
export function ownKey(ctx: Ctx, ref: string): string | null {
  const r = ref.trim();
  if (r.startsWith(`${ctx.origin}/f/`)) {
    const rest = r.slice(`${ctx.origin}/f/`.length).split("?")[0];
    const [id, name] = rest.split("/");
    return fileKey(id, decodeURIComponent(name));
  }
  if (/^https?:\/\//i.test(r)) return null;
  const { id, filename } = parseFileId(r);
  return fileKey(id, filename);
}

export async function putBytes(
  ctx: Ctx,
  filename: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType: string,
): Promise<StoredFile> {
  const id = randomId();
  const name = cleanName(filename);
  const obj = await ctx.env.FILES.put(fileKey(id, name), body, {
    httpMetadata: { contentType },
    customMetadata: { owner: ctx.user.name, created: new Date().toISOString() },
  });
  return { file_id: `${id}/${name}`, filename: name, url: publicUrl(ctx, id, name), size: obj?.size, content_type: contentType };
}

/** Copy a remote https file (e.g. a Kie result that expires after ~24 h) into our storage. */
export async function importUrl(ctx: Ctx, url: string, filename?: string): Promise<StoredFile> {
  if (!/^https:\/\//i.test(url)) throw new Error("Only https:// links can be imported.");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Could not download ${url} (HTTP ${res.status}).`);
  const max = maxUploadBytes(ctx.env);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > max) throw new Error(`File is larger than ${ctx.env.MAX_UPLOAD_MB ?? 200} MB.`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
  const name = filename ?? decodeURIComponent(new URL(url).pathname.split("/").pop() || "file");
  // R2 needs a known length for streams; buffer when the server does not send one.
  const body = len > 0 ? res.body : await res.arrayBuffer();
  if (body instanceof ArrayBuffer && body.byteLength > max) throw new Error("File too large.");
  return putBytes(ctx, name, body, type);
}

export function maxUploadBytes(env: Env) {
  return Number(env.MAX_UPLOAD_MB ?? "200") * 1024 * 1024;
}

/** Signed one-time-ish upload link, valid for 30 minutes. */
export async function createUploadLink(ctx: Ctx, filename: string, contentType: string) {
  const id = randomId();
  const name = cleanName(filename);
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const ct = contentType || "application/octet-stream";
  const payload = `${id}|${name}|${ctx.user.name}|${exp}|${ct}`;
  const sig = await sign(ctx.env, payload);
  const q = new URLSearchParams({ u: ctx.user.name, exp: String(exp), ct, sig });
  return {
    file_id: `${id}/${name}`,
    upload_url: `${ctx.origin}/u/${id}/${encodeURIComponent(name)}?${q}`,
    url: publicUrl(ctx, id, name),
    content_type: ct,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}

/** PUT /u/<id>/<name>?u=&exp=&ct=&sig= */
export async function handleUpload(req: Request, env: Env, url: URL): Promise<Response> {
  if (req.method !== "PUT" && req.method !== "POST") return new Response("Use PUT", { status: 405 });
  const m = url.pathname.match(/^\/u\/([A-Za-z0-9_\-]{16,})\/([^/]+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const id = m[1];
  const name = cleanName(decodeURIComponent(m[2]));
  const u = url.searchParams.get("u") ?? "";
  const exp = Number(url.searchParams.get("exp") ?? "0");
  const ct = url.searchParams.get("ct") ?? "application/octet-stream";
  const sig = url.searchParams.get("sig") ?? "";
  if (!(await verify(env, `${id}|${name}|${u}|${exp}|${ct}`, sig))) return new Response("Bad signature", { status: 403 });
  if (exp < Date.now() / 1000) return new Response("Upload link expired", { status: 403 });
  const key = fileKey(id, name);
  if (await env.FILES.head(key)) return new Response("Already uploaded", { status: 409 });
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!req.body) return new Response("Empty body", { status: 400 });
  if (len > maxUploadBytes(env)) return new Response("File too large", { status: 413 });
  const body = len > 0 ? req.body : await req.arrayBuffer();
  if (body instanceof ArrayBuffer && body.byteLength > maxUploadBytes(env)) return new Response("File too large", { status: 413 });
  const obj = await env.FILES.put(key, body, {
    httpMetadata: { contentType: ct },
    customMetadata: { owner: u, created: new Date().toISOString() },
  });
  return Response.json({ ok: true, file_id: `${id}/${name}`, size: obj?.size });
}

/** GET /f/<id>/<name> */
export async function handleFile(req: Request, env: Env, url: URL): Promise<Response> {
  const m = url.pathname.match(/^\/f\/([A-Za-z0-9_\-]{16,})\/([^/]+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const key = fileKey(m[1], decodeURIComponent(m[2]));
  const range = req.headers.get("range");
  const obj = await env.FILES.get(key, range ? { range: req.headers } : undefined);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-security-policy", "default-src 'none'; img-src 'self'; media-src 'self'");
  if (req.method === "HEAD") return new Response(null, { headers });
  return new Response(obj.body, { status: range ? 206 : 200, headers });
}

// ---------- small JSON documents (styles, usage) ----------

export async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const o = await env.FILES.get(key);
  return o ? ((await o.json()) as T) : null;
}

export async function putJson(env: Env, key: string, value: unknown) {
  await env.FILES.put(key, JSON.stringify(value, null, 2), { httpMetadata: { contentType: "application/json" } });
}

// ---------- daily limits ----------

type Kind = "images" | "transcribe";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function usage(ctx: Ctx) {
  const key = `usage/${ctx.user.name}/${today()}.json`;
  return (await getJson<Record<Kind, number>>(ctx.env, key)) ?? { images: 0, transcribe: 0 };
}

export function limits(env: Env) {
  return {
    images: Number(env.DAILY_IMAGE_LIMIT ?? "60"),
    transcribe: Number(env.DAILY_TRANSCRIBE_LIMIT ?? "40"),
  };
}

/** Throws when the user is over today's limit, otherwise counts the use. */
export async function spend(ctx: Ctx, kind: Kind, amount = 1) {
  const key = `usage/${ctx.user.name}/${today()}.json`;
  const u = await usage(ctx);
  const lim = limits(ctx.env)[kind];
  if (amount > 0 && !ctx.user.admin && u[kind] + amount > lim) {
    throw new Error(`Daily limit reached for ${kind} (${u[kind]}/${lim}). It resets at 00:00 UTC.`);
  }
  u[kind] = Math.max(0, u[kind] + amount);
  await putJson(ctx.env, key, u);
}
