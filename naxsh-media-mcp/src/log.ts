import type { Ctx, Env } from "./env";

/**
 * Job log for the dashboard. One KV entry per job under `log/<id>`; the summary sits in
 * the KV *metadata* (max 1 KB) so the dashboard can read every job with list() alone.
 * Stored only when the STORE KV namespace is bound.
 */

export interface JobMeta {
  u: string; // user
  t: string; // created ISO time
  k: "img" | "tr"; // kind
  p: string; // project
  m: string; // model
  r?: string; // resolution
  s: "pending" | "success" | "fail";
  c: number | null; // Kie credits (images); null = unknown
  est?: boolean; // c is an estimate from earlier jobs of the same model
  n: string; // prompt / file name snippet
  img?: string; // first result image
  tok?: number; // Gemini tokens (transcription)
  sec?: number; // seconds the job took
}

function kv(env: Env): KVNamespace | null {
  return env.STORE ?? null;
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

async function write(env: Env, id: string, meta: JobMeta) {
  const store = kv(env);
  if (!store) return;
  // Keep metadata under 1 KB.
  let m = { ...meta };
  while (JSON.stringify(m).length > 1000 && m.n.length > 10) m = { ...m, n: clip(m.n, Math.floor(m.n.length * 0.7)) };
  if (JSON.stringify(m).length > 1000) delete m.img;
  await store.put(`log/${id}`, "", { metadata: m });
}

export async function readJob(env: Env, id: string): Promise<JobMeta | null> {
  const store = kv(env);
  if (!store) return null;
  const r = await store.getWithMetadata<JobMeta>(`log/${id}`);
  return r.value === null ? null : r.metadata;
}

/** Average measured cost of earlier jobs with this model + resolution. */
async function estimate(env: Env, model: string, res?: string): Promise<number | null> {
  const store = kv(env);
  if (!store) return null;
  const r = await store.get<{ sum: number; n: number }>(`price/${model}/${res ?? "-"}`, "json");
  return r && r.n ? Math.round((r.sum / r.n) * 100) / 100 : null;
}

async function learn(env: Env, model: string, res: string | undefined, cost: number) {
  const store = kv(env);
  if (!store) return;
  const key = `price/${model}/${res ?? "-"}`;
  const r = (await store.get<{ sum: number; n: number }>(key, "json")) ?? { sum: 0, n: 0 };
  // Keep the last ~20 measurements' weight.
  if (r.n >= 20) {
    r.sum = (r.sum / r.n) * 19;
    r.n = 19;
  }
  r.sum += cost;
  r.n += 1;
  await store.put(key, JSON.stringify(r));
}

export async function logImageStart(
  ctx: Ctx,
  a: { task_id: string; project: string; model: string; resolution?: string; prompt: string; before: number | null; after: number | null },
) {
  let c: number | null = null;
  let est = false;
  if (a.before !== null && a.after !== null) {
    const d = Math.round((a.before - a.after) * 100) / 100;
    if (d > 0 && d < 10000) {
      c = d;
      await learn(ctx.env, a.model, a.resolution, d);
    }
  }
  if (c === null) {
    c = await estimate(ctx.env, a.model, a.resolution);
    est = c !== null;
  }
  await write(ctx.env, a.task_id, {
    u: ctx.user.name,
    t: new Date().toISOString(),
    k: "img",
    p: clip(a.project || "general", 40),
    m: a.model,
    r: a.resolution,
    s: "pending",
    c,
    est,
    n: clip(a.prompt, 140),
  });
}

export async function logImageEnd(ctx: Ctx, task_id: string, state: "success" | "fail", img?: string) {
  const j = await readJob(ctx.env, task_id);
  if (!j || j.s !== "pending") return;
  const sec = Math.round((Date.now() - Date.parse(j.t)) / 1000);
  // Kie refunds failed tasks.
  await write(ctx.env, task_id, { ...j, s: state, img, sec, ...(state === "fail" ? { c: 0, est: false } : {}) });
}

export async function logTranscription(
  ctx: Ctx,
  a: { project: string; model: string; file: string; tokens?: number; ok: boolean; seconds: number },
) {
  const id = `tr_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  await write(ctx.env, id, {
    u: ctx.user.name,
    t: new Date().toISOString(),
    k: "tr",
    p: clip(a.project || "general", 40),
    m: a.model,
    s: a.ok ? "success" : "fail",
    c: null,
    n: clip(a.file, 80),
    tok: a.tokens,
    sec: a.seconds,
  });
}

export async function listJobs(env: Env, user?: string): Promise<(JobMeta & { id: string })[]> {
  const store = kv(env);
  if (!store) return [];
  const out: (JobMeta & { id: string })[] = [];
  let cursor: string | undefined;
  do {
    const r = await store.list<JobMeta>({ prefix: "log/", cursor });
    for (const k of r.keys) {
      if (!k.metadata) continue;
      if (user && k.metadata.u !== user) continue;
      out.push({ ...k.metadata, id: k.name.slice(4) });
    }
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out.sort((a, b) => b.t.localeCompare(a.t));
}
