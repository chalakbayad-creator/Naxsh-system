import type { Ctx } from "./env";
import { importUrl, type StoredFile } from "./storage";

const KIE = "https://api.kie.ai/api/v1";

/**
 * Kie.ai model IDs for OpenAI's GPT Image family. Kie runs every model through the same
 * createTask / recordInfo pair. "2.5-sunburst" is the quality-first 2.5 model, "2.5-flare"
 * the speed-first one, "2.0" the older GPT Image 2.
 */
export const IMAGE_MODELS = {
  "2.5-sunburst": { t2i: "gpt-image-2-5-sunburst-text-to-image", i2i: "gpt-image-2-5-sunburst-image-to-image" },
  "2.5-flare": { t2i: "gpt-image-2-5-flare-text-to-image", i2i: "gpt-image-2-5-flare-image-to-image" },
  "2.0": { t2i: "gpt-image-2-text-to-image", i2i: "gpt-image-2-image-to-image" },
} as const;
export type ImageVersion = keyof typeof IMAGE_MODELS;

/** Order to try when a model is refused (the user asked: if 2.5 is not available, use 2.0). */
function fallbackChain(first: ImageVersion): ImageVersion[] {
  const all: ImageVersion[] = [first, "2.5-sunburst", "2.5-flare", "2.0"];
  return [...new Set(all)];
}

export interface ImageRequest {
  prompt: string;
  input_urls: string[]; // empty = text-to-image
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
  background?: string;
  version: ImageVersion;
}

async function kieFetch(ctx: Ctx, path: string, init?: RequestInit) {
  const res = await fetch(`${KIE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${ctx.env.KIE_API_KEY}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  }).catch((e) => {
    throw new Error(`Could not reach Kie.ai: ${(e as Error).message}`);
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Kie.ai answered HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || (json.code !== undefined && json.code !== 200)) {
    const err = new Error(`Kie.ai error ${json.code ?? res.status}: ${json.msg ?? json.message ?? text.slice(0, 300)}`);
    (err as any).kieCode = json.code ?? res.status;
    throw err;
  }
  return json;
}

/** Errors that mean "this model ID is not accepted" rather than "your request is wrong". */
function looksLikeModelMissing(e: unknown): boolean {
  const m = String((e as Error)?.message ?? "").toLowerCase();
  return /model|not\s*(found|exist|support)|invalid.*model|unsupported/.test(m) && !/prompt|input_urls|aspect|resolution/.test(m);
}

export async function createImageTask(ctx: Ctx, r: ImageRequest): Promise<{ task_id: string; model: string; version: ImageVersion }> {
  if (!ctx.env.KIE_API_KEY) throw new Error("KIE_API_KEY is not set on the server.");
  const input: Record<string, unknown> = { prompt: r.prompt };
  if (r.input_urls.length) input.input_urls = r.input_urls.slice(0, 16);
  if (r.aspect_ratio) input.aspect_ratio = r.aspect_ratio;
  if (r.resolution) input.resolution = r.resolution;
  if (r.quality) input.quality = r.quality;
  if (r.background) input.background = r.background;

  let lastErr: unknown;
  for (const v of fallbackChain(r.version)) {
    const model = r.input_urls.length ? IMAGE_MODELS[v].i2i : IMAGE_MODELS[v].t2i;
    try {
      const j = await kieFetch(ctx, "/jobs/createTask", { method: "POST", body: JSON.stringify({ model, input }) });
      const taskId = j?.data?.taskId ?? j?.data?.task_id;
      if (!taskId) throw new Error(`Kie.ai gave no taskId: ${JSON.stringify(j).slice(0, 300)}`);
      return { task_id: taskId, model, version: v };
    } catch (e) {
      lastErr = e;
      if (!looksLikeModelMissing(e)) throw e;
    }
  }
  throw lastErr;
}

export interface TaskResult {
  state: "pending" | "success" | "fail";
  raw_state?: string;
  images?: StoredFile[];
  error?: string;
}

export async function getImageTask(ctx: Ctx, taskId: string, persist = true): Promise<TaskResult> {
  const j = await kieFetch(ctx, `/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
  const d = j?.data ?? {};
  const state = String(d.state ?? "").toLowerCase();
  if (state === "success") {
    let result: any = d.resultJson;
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        result = {};
      }
    }
    const urls: string[] = result?.resultUrls ?? result?.result_urls ?? [];
    if (!urls.length) return { state: "fail", raw_state: state, error: "Task succeeded but returned no image." };
    if (!persist) return { state: "success", images: urls.map((u) => ({ file_id: "", filename: "", url: u })) };
    // Kie links expire after about a day, so keep our own copy.
    const images: StoredFile[] = [];
    for (let i = 0; i < urls.length; i++) {
      const ext = (urls[i].split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png").toLowerCase();
      images.push(await importUrl(ctx, urls[i], `${taskId.slice(0, 12)}_${i + 1}.${ext}`));
    }
    return { state: "success", images };
  }
  if (state === "fail" || state === "failed") {
    return { state: "fail", raw_state: state, error: d.failMsg || d.failCode || "Generation failed." };
  }
  return { state: "pending", raw_state: state || "waiting" };
}

/** Poll until done or until `seconds` pass. */
export async function waitForImage(ctx: Ctx, taskId: string, seconds: number): Promise<TaskResult> {
  const until = Date.now() + seconds * 1000;
  let r: TaskResult = { state: "pending" };
  let delay = 3000;
  while (Date.now() < until) {
    r = await getImageTask(ctx, taskId);
    if (r.state !== "pending") return r;
    await new Promise((res) => setTimeout(res, Math.min(delay, Math.max(0, until - Date.now()))));
    delay = Math.min(delay + 1000, 6000);
  }
  return r;
}
