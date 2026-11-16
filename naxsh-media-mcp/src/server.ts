import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Ctx } from "./env";
import {
  cleanSegments,
  deleteGeminiFile,
  listModels,
  toSrt,
  transcribeWithModel,
  transcribeWithSpeechModel,
  uploadToGemini,
  type Segment,
  type TranscribeOptions,
} from "./gemini";
import { jobStatus, startTranscriptionJob } from "./jobs";
import { logImageEnd, logImageStart, logTranscription } from "./log";
import { createImageTask, getImageTask, IMAGE_MODELS, waitForImage, type ImageVersion, type TaskResult } from "./kie";
import {
  createUploadLink,
  getJson,
  importUrl,
  limits,
  ownKey,
  putBytes,
  putJson,
  resolveToUrl,
  spend,
  usage,
} from "./storage";

// ---------------------------------------------------------------- helpers

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function ok(value: unknown): ToolResult {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function fail(e: unknown): ToolResult {
  return { content: [{ type: "text", text: `Error: ${(e as Error)?.message ?? String(e)}` }], isError: true };
}

function wrap<A>(fn: (a: A) => Promise<unknown>) {
  return async (a: A) => {
    try {
      return ok(await fn(a));
    } catch (e) {
      return fail(e);
    }
  };
}

// ---------------------------------------------------------------- styles

interface StyleRef {
  url: string;
  label?: string;
}
interface Style {
  name: string;
  notes: string;
  refs: StyleRef[];
  updated: string;
}

function styleKey(ctx: Ctx, name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9؀-ۿ_\-]+/g, "-").slice(0, 60) || "default";
  return `styles/${ctx.user.name}/${slug}.json`;
}

async function loadStyle(ctx: Ctx, name: string): Promise<Style> {
  const s = await getJson<Style>(ctx.env, styleKey(ctx, name));
  if (!s) throw new Error(`No saved style named "${name}". Use style_list to see saved styles.`);
  return s;
}

const MAX_REFS = 16;

/** Build the final prompt + image list. Base images come first, then style references. */
export function composeImageJob(base: string[], prompt: string, style: Style | null, keepBase: boolean, avoid: string[] = []) {
  const refs = style ? style.refs.map((r) => r.url).filter((u) => !base.includes(u)) : [];
  const room = Math.max(0, MAX_REFS - base.length);
  const usedRefs = refs.slice(-room); // newest approved designs matter most
  const usedAvoid = avoid.filter((u) => !base.includes(u)).slice(0, Math.max(0, MAX_REFS - base.length - usedRefs.length));
  const urls = [...base, ...usedRefs, ...usedAvoid];
  if (!style && !base.length && !usedAvoid.length) return { urls, prompt };

  const lines: string[] = [];
  if (base.length || usedRefs.length) {
    lines.push("INPUT IMAGES (in order):");
    base.forEach((_, i) =>
      lines.push(
        `- Image ${i + 1}: ${i === 0 ? "the BASE image to work on" : "an extra input image for this task"}.`,
      ),
    );
    if (usedRefs.length) {
      const a = base.length + 1;
      const b = base.length + usedRefs.length;
      lines.push(
        `- Image${a === b ? "" : "s"} ${a === b ? a : `${a}–${b}`}: STYLE REFERENCES — approved designs of this same project. They are NOT content to copy and NOT the canvas.`,
      );
    }
    if (usedAvoid.length) {
      const a = base.length + usedRefs.length + 1;
      const b = base.length + usedRefs.length + usedAvoid.length;
      lines.push(
        `- Image${a === b ? "" : "s"} ${a === b ? a : `${a}–${b}`}: OTHER DESIGN DIRECTIONS already made for this same frame. They are shown ONLY so you can avoid them. NOT the canvas.`,
      );
    }
    lines.push("");
  }
  if (usedAvoid.length) {
    lines.push(
      "BE DIFFERENT: Create a completely new design direction of your own choice that shares NOTHING with the other directions shown: a different colour palette, different typography style, different shapes and element types, different layout and composition, different visual technique and mood. Someone comparing them side by side must see clearly separate styles. You decide the style yourself.",
      "",
    );
  }
  if (style) {
    lines.push(
      "STYLE LOCK: The result must look like it belongs to the same series as the style references: same design system — colour palette and colour grading of the graphics, gradients, glass / frosted / blur treatment and its opacity, glows and shadows, shapes and corner radii, line weights, icon drawing style, typography style (weight, case, size hierarchy), spacing logic, texture and level of detail, and the same overall mood. Do not invent a new style. But it must NOT be a copy-paste of a reference: do not copy their text, content or exact layout; design a new composition for THIS frame and its content, using the same visual language, like the next page of the same professionally designed series.",
    );
    if (style.notes.trim()) lines.push(`STYLE NOTES (always follow): ${style.notes.trim()}`);
    lines.push("");
  }
  if (keepBase && base.length) {
    lines.push(
      "BASE IMAGE RULES: keep Image 1 exactly as it is — same framing, same size and position of every person and object, same background colour and lighting, same faces. Add or change ONLY what the task asks for.",
      "",
    );
  }
  lines.push("TASK:", prompt);
  return { urls, prompt: lines.join("\n") };
}

function describeResult(r: TaskResult, task_id: string, extra: Record<string, unknown> = {}) {
  if (r.state === "success") {
    return {
      status: "done",
      task_id,
      ...extra,
      images: r.images,
      next: "Download each image with: curl -sSL -o <name>.png '<url>' and view it before showing the user.",
    };
  }
  if (r.state === "fail") return { status: "failed", task_id, ...extra, error: r.error };
  return {
    status: "still_working",
    task_id,
    ...extra,
    next: "Call image_result with this task_id (it waits up to ~45 s). GPT Image usually takes 30–120 s.",
  };
}

// ---------------------------------------------------------------- server

export function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer(
    { name: "naxsh-media", version: "1.0.0" },
    {
      instructions: `Naxsh media tools: careful transcription (Google Gemini) and GPT Image generation/editing (Kie.ai).
Files: to send a local file, call file_upload_link, then run the returned curl command; pass the returned file_id to other tools. Results are https links; download them with curl to look at them.
Style consistency: an API call has no chat memory. Save approved designs with style_save, then pass style=<name> to image_generate / image_edit; the saved designs are attached as references every time.
Transcription: send audio only (extract with ffmpeg: -vn -ac 1 -ar 16000 -c:a flac). For recordings longer than ~10 minutes, split into chunks of about 5 minutes at silences and pass offset_seconds for each chunk.`,
    },
  );

  // ---------------- files ----------------

  server.registerTool(
    "file_upload_link",
    {
      title: "Get an upload link",
      description:
        "Creates a private upload link (valid 30 min) for a local file such as a video frame, a design, a reference image or an audio file. Upload with the returned curl command, then use file_id in other tools.",
      inputSchema: {
        filename: z.string().describe("File name with extension, e.g. scene1.png or voice.flac"),
        content_type: z.string().optional().describe("MIME type, e.g. image/png, audio/flac. Guessed from the extension if omitted."),
      },
    },
    wrap(async ({ filename, content_type }) => {
      const link = await createUploadLink(ctx, filename, content_type || guessType(filename));
      return {
        ...link,
        curl: `curl -sS -X PUT -H 'content-type: ${link.content_type}' --data-binary @'${filename}' '${link.upload_url}'`,
        note: "Run the curl command from the folder that holds the file (or replace the @path). The file is then available as file_id / url.",
      };
    }),
  );

  server.registerTool(
    "file_import_url",
    {
      title: "Import a file from a link",
      description: "Copies a public https file (image or audio) into storage and returns a file_id. Use for files that are already online.",
      inputSchema: { url: z.string().url(), filename: z.string().optional() },
    },
    wrap(async ({ url, filename }) => importUrl(ctx, url, filename)),
  );

  // ---------------- styles ----------------

  server.registerTool(
    "style_save",
    {
      title: "Save / update a style lock",
      description:
        "Saves a named style for a project: approved designs (as references) + written style notes. Every image_generate/image_edit call with style=<name> sends these references, so new designs keep the same look. Call again to add newly approved designs.",
      inputSchema: {
        name: z.string().describe("Project or style name, e.g. 'clinic-video-nov'"),
        add_refs: z.array(z.string()).optional().describe("file_ids or https links of approved designs to add"),
        remove_refs: z.array(z.string()).optional().describe("links to remove"),
        notes: z
          .string()
          .optional()
          .describe("Written style notes (palette hex codes, fonts look, glass/glow rules, layout rules). Replaces previous notes when given."),
        replace: z.boolean().optional().describe("true = start the reference list from scratch"),
      },
    },
    wrap(async ({ name, add_refs, remove_refs, notes, replace }) => {
      const key = styleKey(ctx, name);
      const old = replace ? null : await getJson<Style>(ctx.env, key);
      const style: Style = old ?? { name, notes: "", refs: [], updated: "" };
      if (notes !== undefined) style.notes = notes;
      for (const r of add_refs ?? []) {
        const url = resolveToUrl(ctx, r);
        if (!style.refs.some((x) => x.url === url)) style.refs.push({ url });
      }
      if (remove_refs?.length) {
        const rm = new Set(remove_refs.map((r) => resolveToUrl(ctx, r)));
        style.refs = style.refs.filter((x) => !rm.has(x.url));
      }
      if (style.refs.length > MAX_REFS - 1) style.refs = style.refs.slice(-(MAX_REFS - 1));
      style.updated = new Date().toISOString();
      await putJson(ctx.env, key, style);
      return { saved: style.name, references: style.refs.length, notes: style.notes };
    }),
  );

  server.registerTool(
    "style_get",
    { title: "Show a style", description: "Shows the saved references and notes of a style.", inputSchema: { name: z.string() } },
    wrap(async ({ name }) => loadStyle(ctx, name)),
  );

  server.registerTool(
    "style_list",
    { title: "List styles", description: "Lists your saved styles.", inputSchema: {} },
    wrap(async () => {
      const list = await ctx.env.FILES.list({ prefix: `styles/${ctx.user.name}/` });
      return list.objects.map((o) => ({ key: o.key.split("/").pop()!.replace(/\.json$/, ""), updated: o.uploaded }));
    }),
  );

  // ---------------- images ----------------

  async function finish(task_id: string, r: TaskResult) {
    if (r.state !== "pending") await logImageEnd(ctx, task_id, r.state, r.images?.[0]?.url).catch(() => {});
    return r;
  }

  const version = z
    .enum(Object.keys(IMAGE_MODELS) as [ImageVersion, ...ImageVersion[]])
    .optional()
    .describe("GPT Image version. Default from server settings (2.5-sunburst = best quality). Falls back to 2.0 if 2.5 is unavailable.");
  const aspect = z
    .string()
    .optional()
    .describe("auto, 1:1, 9:16, 16:9, 4:3, 3:4 (others if the model allows). For editing a video frame, use the frame's own ratio.");
  const resolution = z.enum(["1K", "2K", "4K"]).optional().describe("Output size. 2K is a good default for design work.");
  const quality = z.string().optional().describe("Optional, only if the model supports it (e.g. high).");
  const background = z
    .enum(["auto", "opaque", "transparent"])
    .optional()
    .describe("transparent = real alpha PNG (useful for element sheets), only on models that support it.");
  const avoidArg = z
    .array(z.string())
    .optional()
    .describe("Designs already made for this same frame (other style options). The model sees them only to make a completely different style.");
  const projectArg = z
    .string()
    .optional()
    .describe("Project name for the cost dashboard (defaults to the style name, else 'general'). Use the same name for all work of one project.");
  const wait = z.number().int().min(0).max(45).optional().describe("Seconds to wait for the result in this call (default 35; keep under 45 — clients stop waiting at ~60 s).");

  server.registerTool(
    "image_generate",
    {
      title: "Generate an image (GPT Image via Kie.ai)",
      description:
        "Creates a new image from a prompt. With style=<name>, the saved approved designs are sent as style references so the result matches the project's look.",
      inputSchema: {
        prompt: z.string().min(3),
        style: z.string().optional(),
        reference_images: z.array(z.string()).optional().describe("Extra file_ids/links to use as references"),
        avoid_images: avoidArg,
        aspect_ratio: aspect,
        resolution,
        quality,
        background,
        version,
        wait_seconds: wait,
        project: projectArg,
      },
    },
    wrap(async (a) => {
      const style = a.style ? await loadStyle(ctx, a.style) : null;
      const extra = (a.reference_images ?? []).map((r) => resolveToUrl(ctx, r));
      const job = composeImageJob(extra, a.prompt, style, false, (a.avoid_images ?? []).map((r) => resolveToUrl(ctx, r)));
      const v = (a.version ?? ctx.env.DEFAULT_IMAGE_MODEL ?? "2.5-sunburst") as ImageVersion;
      await spend(ctx, "images");
      const t = await createImageTask(ctx, {
        prompt: job.prompt,
        input_urls: job.urls,
        aspect_ratio: a.aspect_ratio,
        resolution: a.resolution ?? "2K",
        quality: a.quality,
        background: a.background,
        version: v,
      }).catch(async (e) => {
        await spend(ctx, "images", -1); // give the credit back when Kie refuses the job
        throw e;
      });
      await logImageStart(ctx, {
        task_id: t.task_id,
        project: a.project ?? a.style ?? "general",
        model: t.model,
        resolution: a.resolution ?? "2K",
        prompt: a.prompt,
        before: t.credits_before,
        after: t.credits_after,
      });
      const r = await finish(t.task_id, await waitForImage(ctx, t.task_id, a.wait_seconds ?? 35));
      return describeResult(r, t.task_id, { model: t.model, references_sent: job.urls.length });
    }),
  );

  server.registerTool(
    "image_edit",
    {
      title: "Edit / design on an image (GPT Image via Kie.ai)",
      description:
        "Edits an image or designs on top of it (e.g. add motion-graphics elements onto a video key frame, revise a design, make an element sheet). images[0] is the base image. With style=<name>, approved designs are attached as style references. Every call is independent: always pass style for consistency.",
      inputSchema: {
        prompt: z.string().min(3),
        images: z.array(z.string()).min(1).describe("file_ids or links; the first is the base image"),
        avoid_images: avoidArg,
        style: z.string().optional(),
        keep_base: z
          .boolean()
          .optional()
          .describe("Default true: tell the model to keep the base photo unchanged and only add/change what is asked."),
        aspect_ratio: aspect,
        resolution,
        quality,
        background,
        version,
        wait_seconds: wait,
        project: projectArg,
      },
    },
    wrap(async (a) => {
      const style = a.style ? await loadStyle(ctx, a.style) : null;
      const base = a.images.map((r) => resolveToUrl(ctx, r));
      const job = composeImageJob(base, a.prompt, style, a.keep_base ?? true, (a.avoid_images ?? []).map((r) => resolveToUrl(ctx, r)));
      const v = (a.version ?? ctx.env.DEFAULT_IMAGE_MODEL ?? "2.5-sunburst") as ImageVersion;
      await spend(ctx, "images");
      const t = await createImageTask(ctx, {
        prompt: job.prompt,
        input_urls: job.urls,
        aspect_ratio: a.aspect_ratio,
        resolution: a.resolution ?? "2K",
        quality: a.quality,
        background: a.background,
        version: v,
      }).catch(async (e) => {
        await spend(ctx, "images", -1); // give the credit back when Kie refuses the job
        throw e;
      });
      await logImageStart(ctx, {
        task_id: t.task_id,
        project: a.project ?? a.style ?? "general",
        model: t.model,
        resolution: a.resolution ?? "2K",
        prompt: a.prompt,
        before: t.credits_before,
        after: t.credits_after,
      });
      const r = await finish(t.task_id, await waitForImage(ctx, t.task_id, a.wait_seconds ?? 35));
      return describeResult(r, t.task_id, { model: t.model, references_sent: job.urls.length });
    }),
  );

  server.registerTool(
    "image_result",
    {
      title: "Get an image result",
      description: "Waits for (up to ~45 s) and returns the result of an image task started by image_generate or image_edit.",
      inputSchema: { task_id: z.string(), wait_seconds: wait },
    },
    wrap(async ({ task_id, wait_seconds }) => {
      const r = await finish(
        task_id,
        wait_seconds === 0 ? await getImageTask(ctx, task_id) : await waitForImage(ctx, task_id, wait_seconds ?? 45),
      );
      return describeResult(r, task_id);
    }),
  );

  // ---------------- transcription ----------------

  server.registerTool(
    "transcribe",
    {
      title: "Transcribe audio precisely (Google Gemini)",
      description:
        "Careful verbatim transcription with timestamps for subtitles. Made for Kurdish (Sorani/Kurmanji), Arabic and Persian (and English). Starts a background job and returns a job_id at once; then call transcribe_result to get the SRT + JSON. Upload audio first (file_upload_link). Chunks of up to ~5 minutes; pass offset_seconds per chunk.",
      inputSchema: {
        audio: z.string().describe("file_id or https link of the audio (flac/mp3/wav/m4a/ogg; mp4 video also works but is larger)"),
        languages: z
          .array(z.string())
          .optional()
          .describe("Main language codes: ckb (Sorani), kmr (Kurmanji), ar, fa, en. Give them — it improves spelling."),
        glossary: z.array(z.string()).optional().describe("Names, brands, places, terms, spelled as they must appear"),
        context: z.string().optional().describe("What the recording is about, who speaks, dialect"),
        speakers: z.boolean().optional().describe("Label different speakers (default false)"),
        keep_fillers: z.boolean().optional().describe("Keep um/uh, repetitions (default false)"),
        verify: z.boolean().optional().describe("Second listening pass that corrects the draft (default true, more accurate, slower)"),
        quality: z
          .enum(["best", "standard"])
          .optional()
          .describe("best (default): several models transcribe independently and a final editor pass decides every word by listening again — most accurate, ~1–3 min. standard: one model + one review, faster."),
        model: z.string().optional().describe("Admin only: force one Gemini model for testing."),
        engine: z
          .enum(["auto", "model", "speech"])
          .optional()
          .describe("auto (default): careful general model for every language. speech: Google's dedicated speech model (word timestamps; Kurdish not confirmed)."),
        offset_seconds: z.number().optional().describe("Added to every timestamp (start time of this chunk in the full video)"),
        max_segment_seconds: z.number().optional().describe("Longest subtitle line in seconds (default 6)"),
        max_chars: z.number().int().optional().describe("Longest subtitle line in characters (default 42)"),
        project: projectArg,
      },
    },
    wrap(async (a) => {
      await spend(ctx, "transcribe");
      const job = await startTranscriptionJob(ctx, a);
      return {
        status: "started",
        job_id: job,
        next: "Call transcribe_result with this job_id now and again until status is done. Each call waits up to ~45 s. Best quality takes about 2 minutes per minute of audio; up to 15 minutes per job.",
      };
    }),
  );

  server.registerTool(
    "transcribe_result",
    {
      title: "Get a transcription result",
      description: "Waits (up to ~45 s per call) for a transcription job started by transcribe and returns the SRT when done. Call it again while status is running.",
      inputSchema: {
        job_id: z.string(),
        wait_seconds: z.number().int().min(0).max(45).optional().describe("Seconds to wait in this call (default 40)."),
      },
    },
    wrap(async ({ job_id, wait_seconds }) => {
      const until = Date.now() + (wait_seconds ?? 40) * 1000;
      for (;;) {
        const st = await jobStatus(ctx, job_id);
        if (st.status !== "running" || Date.now() >= until) {
          if (st.status === "done") return st.result;
          if (st.status === "error") throw new Error(`Transcription failed: ${st.error}`);
          return {
            status: "running",
            job_id,
            elapsed_seconds: Math.round((Date.now() - Date.parse(st.started)) / 1000),
            next: "Still working. Call transcribe_result again with the same job_id.",
          };
        }
        await new Promise((r) => setTimeout(r, Math.min(3000, Math.max(0, until - Date.now()))));
      }
    }),
  );

  // ---------------- status ----------------

  server.registerTool(
    "status",
    {
      title: "Usage and settings",
      description: "Shows who you are, today's usage and limits, and the configured models. Admins can also list the Gemini models the key can use.",
      inputSchema: { list_gemini_models: z.boolean().optional() },
    },
    wrap(async ({ list_gemini_models }) => ({
      user: ctx.user.name,
      admin: ctx.user.admin,
      today: await usage(ctx),
      daily_limits: ctx.user.admin ? "none (admin)" : limits(ctx.env),
      image_model_default: ctx.env.DEFAULT_IMAGE_MODEL ?? "2.5-sunburst",
      gemini_model: ctx.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
      gemini_speech_model: ctx.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe",
      ...(list_gemini_models && ctx.user.admin ? { gemini_models_available: await listModels(ctx) } : {}),
    })),
  );

  return server;
}

export function guessType(name: string): string {
  const ext = name.toLowerCase().split("?")[0].split(".").pop() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    flac: "audio/flac",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    srt: "application/x-subrip",
    json: "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------- background transcription

export type TranscribeArgs = {
  audio: string;
  languages?: string[];
  glossary?: string[];
  context?: string;
  speakers?: boolean;
  keep_fillers?: boolean;
  verify?: boolean;
  quality?: "best" | "standard";
  model?: string;
  engine?: "auto" | "model" | "speech";
  offset_seconds?: number;
  max_segment_seconds?: number;
  max_chars?: number;
  project?: string;
};

/** Runs a whole transcription. Called inside the Jobs Durable Object (up to 15 min). */
export async function runTranscription(ctx: Ctx, a: TranscribeArgs): Promise<unknown> {
    const o: TranscribeOptions = {
      languages: a.languages ?? [],
      glossary: a.glossary ?? [],
      context: a.context,
      speakers: a.speakers ?? false,
      keep_fillers: a.keep_fillers ?? false,
      verify: a.verify ?? true,
      quality: a.quality ?? "best",
      model: ctx.user.admin ? a.model : undefined,
      offset_seconds: a.offset_seconds ?? 0,
      max_segment_seconds: a.max_segment_seconds ?? 6,
      max_chars: a.max_chars ?? 42,
    };

    // Get the audio bytes (our storage or a public link) and hand them to Gemini's Files API.
    const key = ownKey(ctx, a.audio);
    let body: ReadableStream, size: number, type: string, name: string;
    if (key) {
      const obj = await ctx.env.FILES.get(key);
      if (!obj) throw new Error("Audio file not found. Upload it first with file_upload_link.");
      body = obj.body;
      size = obj.size;
      type = obj.httpMetadata?.contentType || guessType(key);
      name = key.split("/").pop()!;
    } else {
      const res = await fetch(a.audio);
      if (!res.ok || !res.body) throw new Error(`Could not download the audio (HTTP ${res.status}).`);
      const buf = await res.arrayBuffer();
      body = new Response(buf).body!;
      size = buf.byteLength;
      type = res.headers.get("content-type")?.split(";")[0] || guessType(a.audio);
      name = "audio";
    }
    if (type === "application/octet-stream") type = guessType(name);
    const gfile = await uploadToGemini(ctx, body, size, type, name);

    const t0 = Date.now();
    let tokens = 0;
    let usedModel = "";
    let okRun = false;
    try {
      let segments: Segment[] = [];
      let language = "";
      let model = "";
      let note = "";
      let passes = 1;
      let useModelEngine = a.engine !== "speech";
      if (a.engine === "speech") {
        try {
          const r = await transcribeWithSpeechModel(ctx, gfile, o);
          tokens = r.tokens;
          usedModel = r.model;
          okRun = true;
          segments = r.segments;
          language = r.language;
          model = r.model;
          if (!segments.length && r.text) {
            note = "The speech model returned text without timestamps.";
            return { model, note, text: r.text };
          }
          if (!segments.length) throw new Error("The speech model returned no words.");
        } catch (e) {
          // Never leave the user without a transcript: fall back to the careful general model.
          note = `Speech model failed, used the general model instead. (${String((e as Error).message).slice(0, 200)})`;
          useModelEngine = true;
        }
      }
      if (useModelEngine) {
        const speechCandidate =
          o.quality === "best" && !o.model
            ? transcribeWithSpeechModel(ctx, gfile, o)
                .then((r) => (r.segments.length ? { segments: r.segments, text: r.text, tokens: r.tokens } : null))
                .catch(() => null)
            : undefined;
        const r = await transcribeWithModel(ctx, gfile, o, speechCandidate);
        tokens = r.tokens;
        usedModel = r.model;
        okRun = true;
        segments = r.segments;
        language = r.language;
        model = r.model;
        passes = r.passes;
        note = note || `models: ${r.models_used.join(" + ")}`;
      }
      segments = cleanSegments(segments, o.offset_seconds);
      const srt = toSrt(segments, o.speakers);
      const saved = await putBytes(ctx, `${name.replace(/\.[^.]+$/, "")}.srt`, srt, "application/x-subrip");
      const savedJson = await putBytes(
        ctx,
        `${name.replace(/\.[^.]+$/, "")}.json`,
        JSON.stringify({ language, model, segments }, null, 2),
        "application/json",
      );
      return [
        `model: ${model} · passes: ${passes} · language: ${language} · segments: ${segments.length}`,
        `srt_url: ${saved.url}`,
        `json_url: ${savedJson.url}`,
        note,
        "",
        srt,
      ]
        .filter((l) => l !== "")
        .join("\n");
    } finally {
      ctx.waitUntil(deleteGeminiFile(ctx, gfile.name));
      ctx.waitUntil(
        logTranscription(ctx, {
          project: a.project ?? "general",
          model: usedModel || ctx.env.GEMINI_MODEL || "gemini",
          file: name,
          tokens,
          ok: okRun,
          seconds: Math.round((Date.now() - t0) / 1000),
        }).catch(() => {}),
      );
    }
}
