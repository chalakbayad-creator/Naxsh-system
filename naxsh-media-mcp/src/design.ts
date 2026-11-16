import { designDirections, designFramePrompt } from "./artdirector";
import type { Ctx } from "./env";
import { createImageTask, getImageTask, type ImageVersion } from "./kie";
import { logImageEnd, logImageStart } from "./log";
import { composeImageJob, loadStyle } from "./server";
import { resolveToUrl, spend, type StoredFile } from "./storage";

export type DesignArgs =
  | {
      kind: "options";
      frame: string;
      brief: string;
      count: number;
      aspect_ratio?: string;
      resolution?: string;
      project?: string;
    }
  | {
      kind: "frames";
      style: string;
      frames: { image: string; brief: string; label?: string }[];
      aspect_ratio?: string;
      resolution?: string;
      project?: string;
    };

const PERSON_RULE =
  "Keep the real person exactly: same face and identity, same body, pose, clothing and position in the frame. Do not redraw or beautify the person.";

interface Item {
  label: string;
  name?: string;
  task_id?: string;
  model?: string;
  status: "pending" | "success" | "fail";
  images?: StoredFile[];
  error?: string;
}

/** Runs inside the Jobs Durable Object: GPT plans the designs, GPT Image renders them. */
export async function runDesign(ctx: Ctx, a: DesignArgs): Promise<unknown> {
  const version = (ctx.env.DEFAULT_IMAGE_MODEL ?? "2.5-sunburst") as ImageVersion;
  const resolution = a.resolution ?? "2K";
  const project = a.project ?? (a.kind === "frames" ? a.style : "general");
  const items: Item[] = [];
  let director = "";

  const submit = async (item: Item, prompt: string, urls: string[]) => {
    try {
      const t = await createImageTask(ctx, { prompt, input_urls: urls, aspect_ratio: a.aspect_ratio, resolution, version });
      item.task_id = t.task_id;
      item.model = t.model;
      await logImageStart(ctx, {
        task_id: t.task_id,
        project,
        model: t.model,
        resolution,
        prompt: `${item.label}${item.name ? ` · ${item.name}` : ""}`,
        before: t.credits_before,
        after: t.credits_after,
      }).catch(() => {});
    } catch (e) {
      item.status = "fail";
      item.error = String((e as Error).message).slice(0, 300);
      await spend(ctx, "images", -1).catch(() => {});
    }
  };

  if (a.kind === "options") {
    const frame = resolveToUrl(ctx, a.frame);
    const plan = await designDirections(ctx, frame, a.brief, a.count);
    director = plan.model;
    for (let i = 0; i < plan.directions.length; i++) {
      const d = plan.directions[i];
      const item: Item = { label: `option ${i + 1}`, name: d.name, status: "pending" };
      items.push(item);
      const job = composeImageJob([frame], `${d.prompt}\n\n${PERSON_RULE}`, null, false);
      await submit(item, job.prompt, job.urls);
    }
  } else {
    const style = await loadStyle(ctx, a.style);
    const refs = style.refs.map((r) => r.url);
    const plans = await Promise.all(
      a.frames.map(async (f, i) => {
        const frame = resolveToUrl(ctx, f.image);
        try {
          const p = await designFramePrompt(ctx, frame, refs, f.brief);
          return { frame, label: f.label ?? `frame ${i + 1}`, prompt: p.prompt, model: p.model };
        } catch (e) {
          return { frame, label: f.label ?? `frame ${i + 1}`, error: String((e as Error).message).slice(0, 300) };
        }
      }),
    );
    for (const p of plans) {
      const item: Item = { label: p.label, status: "pending" };
      items.push(item);
      if ("error" in p) {
        item.status = "fail";
        item.error = p.error;
        await spend(ctx, "images", -1).catch(() => {});
        continue;
      }
      director = p.model;
      const job = composeImageJob([p.frame], `${p.prompt}\n\n${PERSON_RULE}`, style, false);
      await submit(item, job.prompt, job.urls);
    }
  }

  // Wait for every render (the Durable Object alarm may run up to 15 minutes).
  const until = Date.now() + 13 * 60 * 1000;
  while (items.some((i) => i.status === "pending" && i.task_id) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 6000));
    for (const item of items) {
      if (item.status !== "pending" || !item.task_id) continue;
      try {
        const r = await getImageTask(ctx, item.task_id);
        if (r.state === "pending") continue;
        item.status = r.state;
        item.images = r.images;
        item.error = r.error;
        await logImageEnd(ctx, item.task_id, r.state, r.images?.[0]?.url).catch(() => {});
      } catch {
        /* try again next round */
      }
    }
  }

  return {
    art_director: director,
    results: items.map((i) => ({
      label: i.label,
      ...(i.name ? { direction: i.name } : {}),
      status: i.status === "pending" ? "still_rendering" : i.status,
      ...(i.images ? { images: i.images.map((x) => x.url) } : {}),
      ...(i.task_id && i.status === "pending" ? { task_id: i.task_id, next: "call image_result with this task_id" } : {}),
      ...(i.error ? { error: i.error } : {}),
    })),
    next: "Download every image with curl, look at each one, then send them all together to the user.",
  };
}
