import { designDirections, designFramePrompt, reviewDesign, type Review } from "./artdirector";
import type { Ctx } from "./env";
import { createImageTask, getImageTask, type ImageVersion } from "./kie";
import { logImageEnd, logImageStart } from "./log";
import { composeImageJob, loadStyle } from "./server";
import { getJson, resolveToUrl, spend, type StoredFile } from "./storage";

export type DesignArgs =
  | {
      kind: "options";
      frame: string;
      brief: string;
      count: number;
      aspect_ratio?: string;
      resolution?: string;
      project?: string;
      review?: boolean;
    }
  | {
      kind: "frames";
      style: string;
      frames: { image: string; brief: string; label?: string }[];
      aspect_ratio?: string;
      resolution?: string;
      project?: string;
      review?: boolean;
    };

const PERSON_RULE =
  "PHOTO RULE: Image 1 is the real video frame and stays exactly as it is — same framing, same background and every object in it, same person (face, identity, body, pose, clothing). Do not replace, redraw, crop, blur, move, remove or add anything in the photo. Only add layers on top of it: dark/colour overlays, vignettes, glows, light effects and the graphic design elements.";

interface Item {
  label: string;
  name?: string;
  frame: string;
  brief: string;
  prompt: string;
  urls: string[];
  task_id?: string;
  model?: string;
  status: "pending" | "success" | "fail";
  images?: StoredFile[];
  first_try?: string;
  review?: Review;
  retried?: boolean;
  error?: string;
}

/** Saved "taste" examples of this user (designs they love), used as a quality bar. */
async function tasteRefs(ctx: Ctx): Promise<string[]> {
  const s = await getJson<{ refs: { url: string }[] }>(ctx.env, `styles/${ctx.user.name}/taste.json`).catch(() => null);
  return (s?.refs ?? []).map((r) => r.url).slice(-8);
}

/** Runs inside the Jobs Durable Object: GPT plans the designs, GPT Image renders, GPT reviews. */
export async function runDesign(ctx: Ctx, a: DesignArgs): Promise<unknown> {
  const version = (ctx.env.DEFAULT_IMAGE_MODEL ?? "2.5-sunburst") as ImageVersion;
  const resolution = a.resolution ?? "2K";
  const quality = ctx.env.IMAGE_QUALITY || undefined;
  const project = a.project ?? (a.kind === "frames" ? a.style : "general");
  const items: Item[] = [];
  let director = "";

  const submit = async (item: Item) => {
    item.status = "pending";
    item.task_id = undefined;
    try {
      const t = await createImageTask(ctx, { prompt: item.prompt, input_urls: item.urls, aspect_ratio: a.aspect_ratio, resolution, quality, version });
      item.task_id = t.task_id;
      item.model = t.model;
      await logImageStart(ctx, {
        task_id: t.task_id,
        project,
        model: t.model,
        resolution,
        prompt: `${item.label}${item.name ? ` · ${item.name}` : ""}${item.retried ? " · retry" : ""}`,
        before: t.credits_before,
        after: t.credits_after,
      }).catch(() => {});
    } catch (e) {
      item.status = "fail";
      item.error = String((e as Error).message).slice(0, 300);
      await spend(ctx, "images", -1).catch(() => {});
    }
  };

  const waitAll = async (deadline: number) => {
    while (items.some((i) => i.status === "pending" && i.task_id) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000));
      for (const item of items) {
        if (item.status !== "pending" || !item.task_id) continue;
        try {
          const r = await getImageTask(ctx, item.task_id);
          if (r.state === "pending") continue;
          item.status = r.state;
          if (r.images) item.images = r.images;
          item.error = r.error;
          await logImageEnd(ctx, item.task_id, r.state, r.images?.[0]?.url).catch(() => {});
        } catch {
          /* try again next round */
        }
      }
    }
  };

  const started = Date.now();

  if (a.kind === "options") {
    const frame = resolveToUrl(ctx, a.frame);
    const taste = await tasteRefs(ctx);
    const plan = await designDirections(ctx, frame, a.brief, a.count, taste);
    director = plan.model;
    for (let i = 0; i < plan.directions.length; i++) {
      const d = plan.directions[i];
      const job = composeImageJob([frame], `${d.prompt}\n\n${PERSON_RULE}`, null, false, [], taste.slice(0, 3));
      items.push({ label: `option ${i + 1}`, name: d.name, frame, brief: a.brief, prompt: job.prompt, urls: job.urls, status: "pending" });
    }
    // Directions GPT did not return were paid in advance: give them back.
    if (plan.directions.length < a.count) await spend(ctx, "images", plan.directions.length - a.count).catch(() => {});
  } else {
    const style = await loadStyle(ctx, a.style);
    const refs = style.refs.map((r) => r.url);
    const plans = await Promise.all(
      a.frames.map(async (f, i) => {
        const frame = resolveToUrl(ctx, f.image);
        const label = f.label ?? `frame ${i + 1}`;
        try {
          const p = await designFramePrompt(ctx, frame, refs, f.brief);
          return { frame, label, brief: f.brief, prompt: p.prompt, model: p.model };
        } catch (e) {
          return { frame, label, brief: f.brief, error: String((e as Error).message).slice(0, 300) };
        }
      }),
    );
    for (const p of plans) {
      if ("error" in p) {
        items.push({ label: p.label, frame: p.frame, brief: p.brief, prompt: "", urls: [], status: "fail", error: p.error });
        await spend(ctx, "images", -1).catch(() => {});
        continue;
      }
      director = p.model;
      const job = composeImageJob([p.frame], `${p.prompt}\n\n${PERSON_RULE}`, style, false);
      items.push({ label: p.label, frame: p.frame, brief: p.brief, prompt: job.prompt, urls: job.urls, status: "pending" });
    }
  }

  for (const item of items) if (item.status === "pending") await submit(item);
  await waitAll(started + 8 * 60 * 1000);

  // A render refused by the content filter is retried once with only the frame (no extra reference images).
  const flagged = items.filter((i) => i.status === "fail" && /sensitive|flagged|moderation|policy/i.test(i.error ?? ""));
  for (const item of flagged) {
    try {
      await spend(ctx, "images", 1);
    } catch {
      continue;
    }
    item.retried = true;
    item.urls = item.urls.slice(0, 1);
    item.prompt = item.prompt.replace(/^- Image[^\n]*TASTE REFERENCES[^\n]*\n/m, "");
    item.error = undefined;
    await submit(item);
  }
  if (flagged.length) await waitAll(started + 10 * 60 * 1000);

  // Art-director review: GPT looks at each result; weak ones (or wrong text / changed person) are fixed once.
  if (a.review === true && Date.now() - started < 8 * 60 * 1000) {
    await Promise.all(
      items.map(async (item) => {
        if (item.status !== "success" || !item.images?.[0]) return;
        try {
          item.review = await reviewDesign(ctx, item.frame, item.images[0].url, item.brief, item.prompt);
        } catch {
          /* no review, keep the image */
        }
      }),
    );
    for (const item of items) {
      const r = item.review;
      if (!r || !r.revised_prompt) continue;
      // On-screen text is retyped with real fonts later, so only design quality or a changed person triggers a remake.
      if (r.score >= 7 && r.person_ok) continue;
      try {
        await spend(ctx, "images", 1);
      } catch {
        continue; // daily limit reached: keep the first result
      }
      item.first_try = item.images?.[0]?.url;
      item.retried = true;
      const keepRefs = item.urls.slice(1);
      item.prompt = composeImageJob([item.frame], `${r.revised_prompt}\n\n${PERSON_RULE}`, null, false).prompt;
      // Frames keep their style references.
      if (keepRefs.length && a.kind === "frames") {
        const style = await loadStyle(ctx, a.style);
        const job = composeImageJob([item.frame], `${r.revised_prompt}\n\n${PERSON_RULE}`, style, false);
        item.prompt = job.prompt;
        item.urls = job.urls;
      }
      await submit(item);
    }
    await waitAll(started + 13 * 60 * 1000);
    // A failed retry falls back to the first image.
    for (const item of items) {
      if (item.retried && item.status !== "success" && item.first_try) {
        item.status = "success";
        item.images = [{ file_id: "", filename: "", url: item.first_try }];
        item.error = undefined;
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
      ...(i.review ? { review: { score: i.review.score, text_ok: i.review.text_ok, person_ok: i.review.person_ok, issues: i.review.issues } } : {}),
      ...(i.retried ? { first_try: i.first_try } : {}),
      ...(i.task_id && i.status === "pending" ? { task_id: i.task_id, next: "call image_result with this task_id" } : {}),
      ...(i.error ? { error: i.error } : {}),
    })),
    next: "Download every image (images[0]) with curl, look at each one, then send them all together to the user.",
  };
}
