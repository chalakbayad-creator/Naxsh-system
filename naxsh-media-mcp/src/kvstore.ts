/**
 * A small R2-like wrapper around Workers KV, so the server runs on a free Cloudflare
 * account (R2 needs a payment method; KV does not). Only the calls this server uses are
 * implemented. KV values are limited to 25 MiB.
 */

interface Meta {
  ct?: string;
  size?: number;
  owner?: string;
  created?: string;
}

const FILE_TTL = 60 * 60 * 24 * 30; // files are deleted after 30 days
const USAGE_TTL = 60 * 60 * 24 * 3;

function ttlFor(key: string): number | undefined {
  if (key.startsWith("files/")) return FILE_TTL;
  if (key.startsWith("usage/")) return USAGE_TTL;
  return undefined; // styles and config stay
}

function makeObject(key: string, meta: Meta, body: ReadableStream | null, buf?: ArrayBuffer) {
  return {
    key,
    size: meta.size ?? buf?.byteLength ?? 0,
    httpMetadata: { contentType: meta.ct },
    customMetadata: { owner: meta.owner ?? "", created: meta.created ?? "" },
    httpEtag: `"${key.length}-${meta.size ?? 0}-${meta.created ?? ""}"`,
    body: body ?? (buf ? new Response(buf).body! : new Response("").body!),
    writeHttpMetadata(h: Headers) {
      if (meta.ct) h.set("content-type", meta.ct);
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(buf ?? (await new Response(body).arrayBuffer())));
    },
  };
}

export function kvBucket(kv: KVNamespace): R2Bucket {
  const bucket = {
    async put(key: string, value: ReadableStream | ArrayBuffer | string, opts?: any) {
      const buf =
        typeof value === "string"
          ? (new TextEncoder().encode(value).buffer as ArrayBuffer)
          : value instanceof ArrayBuffer
            ? value
            : await new Response(value).arrayBuffer();
      if (buf.byteLength > 25 * 1024 * 1024) throw new Error("File is larger than 25 MB (storage limit).");
      const meta: Meta = {
        ct: opts?.httpMetadata?.contentType,
        size: buf.byteLength,
        owner: opts?.customMetadata?.owner,
        created: opts?.customMetadata?.created ?? new Date().toISOString(),
      };
      const ttl = ttlFor(key);
      await kv.put(key, buf, { metadata: meta, ...(ttl ? { expirationTtl: ttl } : {}) });
      return makeObject(key, meta, null, buf);
    },
    async get(key: string) {
      const r = await kv.getWithMetadata<Meta>(key, "arrayBuffer");
      if (r.value === null) return null;
      return makeObject(key, r.metadata ?? {}, null, r.value);
    },
    async head(key: string) {
      const r = await kv.getWithMetadata<Meta>(key, "stream");
      if (r.value === null) return null;
      r.value.cancel().catch(() => {});
      return makeObject(key, r.metadata ?? {}, null, new ArrayBuffer(0));
    },
    async list(opts?: { prefix?: string }) {
      const r = await kv.list<Meta>({ prefix: opts?.prefix });
      return {
        objects: r.keys.map((k) => ({ key: k.name, uploaded: k.metadata?.created ?? "" })),
        truncated: !r.list_complete,
      };
    },
  };
  return bucket as unknown as R2Bucket;
}
