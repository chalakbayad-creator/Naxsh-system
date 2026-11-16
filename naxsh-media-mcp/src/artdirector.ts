import type { Ctx } from "./env";

/**
 * In ChatGPT, the chat model (GPT-5.x) looks at the image, plans the design itself and
 * writes a long, detailed prompt for the image tool. A bare API call skips that step, so
 * GPT Image falls back to a generic look. This module restores it: a GPT chat model
 * (through Kie.ai) acts as the art director and writes the image prompts. GPT makes every
 * design decision; Claude only passes the brief.
 */

const RESPONSES_URL = "https://api.kie.ai/codex/v1/responses";
const CHAT52_URL = "https://api.kie.ai/gpt-5-2/v1/chat/completions";

export interface Direction {
  name: string;
  prompt: string;
}

function modelList(ctx: Ctx): string[] {
  return (ctx.env.ART_DIRECTOR_MODELS || "gpt-5.6-sol,gpt-5.5,gpt-5.4")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pull the text out of an OpenAI Responses / Chat Completions answer (JSON or SSE). */
function extractText(raw: string): string {
  const tryJson = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const fromObj = (j: any): string => {
    if (!j) return "";
    if (typeof j.output_text === "string") return j.output_text;
    if (Array.isArray(j.output))
      return j.output
        .flatMap((o: any) => (o.content ?? []).map((c: any) => (typeof c.text === "string" ? c.text : "")))
        .join("");
    if (j.choices?.[0]?.message?.content) return String(j.choices[0].message.content);
    if (j.data) return fromObj(j.data);
    return "";
  };
  const j = tryJson(raw);
  if (j) return fromObj(j);
  // Server-sent events: collect deltas, or take the final response object.
  let text = "";
  let final = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const d = tryJson(line.slice(5).trim());
    if (!d) continue;
    if (typeof d.delta === "string" && /output_text/.test(d.type ?? "")) text += d.delta;
    if (d.response && /completed/.test(d.type ?? "")) final = fromObj(d.response);
    if (d.choices?.[0]?.delta?.content) text += d.choices[0].delta.content;
  }
  return final || text;
}

async function callGpt(ctx: Ctx, system: string, user: string, images: string[]): Promise<{ text: string; model: string }> {
  const headers = { authorization: `Bearer ${ctx.env.KIE_API_KEY}`, "content-type": "application/json" };
  const errors: string[] = [];
  for (const model of modelList(ctx)) {
    const body = {
      model,
      stream: false,
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        {
          role: "user",
          content: [{ type: "input_text", text: user }, ...images.map((u) => ({ type: "input_image", image_url: u }))],
        },
      ],
    };
    try {
      const res = await fetch(RESPONSES_URL, { method: "POST", headers, body: JSON.stringify(body) });
      const raw = await res.text();
      const text = extractText(raw);
      if (res.ok && text.trim()) return { text, model };
      errors.push(`${model}: HTTP ${res.status} ${raw.slice(0, 200)}`);
    } catch (e) {
      errors.push(`${model}: ${(e as Error).message}`);
    }
  }
  // Last resort: GPT-5.2 through the chat-completions route.
  try {
    const res = await fetch(CHAT52_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: [{ type: "text", text: user }, ...images.map((u) => ({ type: "image_url", image_url: { url: u } }))] },
        ],
      }),
    });
    const raw = await res.text();
    const text = extractText(raw);
    if (res.ok && text.trim()) return { text, model: "gpt-5.2" };
    errors.push(`gpt-5.2: HTTP ${res.status} ${raw.slice(0, 200)}`);
  } catch (e) {
    errors.push(`gpt-5.2: ${(e as Error).message}`);
  }
  throw new Error(`No GPT chat model answered:\n${errors.join("\n")}`);
}

function parseDirections(text: string): Direction[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error(`Art director gave no JSON: ${text.slice(0, 300)}`);
  const arr = JSON.parse(m[0]);
  return (Array.isArray(arr) ? arr : [])
    .map((d: any) => ({ name: String(d.name ?? d.title ?? "").slice(0, 80), prompt: String(d.prompt ?? d.image_prompt ?? "") }))
    .filter((d: Direction) => d.prompt.length > 40);
}

const SYSTEM = `You are ChatGPT working as a world-class senior motion-graphics and social-media designer. You design premium, modern, eye-catching frames for short vertical videos (Reels/TikTok) — the kind top agencies make, never generic clip-art or template looks.
You receive a frame from the video and the brief. You decide EVERYTHING about the design yourself: style, colours, typography look, layout, effects, depth, how the photo is treated.
For each design you write the full prompt you would send to your image tool (GPT Image) to render it on top of the provided frame: long, concrete and visual (composition and where each element sits, exact on-screen text in quotes, typography look, materials, lighting, depth, effects, colour palette, finish quality).
Keep the person's identity, face, body and pose. Write on-screen text exactly as given in the brief (Kurdish, right-to-left).
Answer with JSON only.`;

/** Ask GPT for `count` completely different design directions for one frame. */
export async function designDirections(ctx: Ctx, frameUrl: string, brief: string, count: number): Promise<{ directions: Direction[]; model: string }> {
  const user = `${brief}

Create ${count} design directions for this frame that are COMPLETELY different from each other (different concept, palette, typography look, layout, effects, mood) — each one premium and agency-quality.
Return a JSON array of ${count} objects: [{"name": "short name", "prompt": "the full image prompt"}].`;
  const r = await callGpt(ctx, SYSTEM, user, [frameUrl]);
  const directions = parseDirections(r.text).slice(0, count);
  if (!directions.length) throw new Error("Art director returned no usable directions.");
  return { directions, model: r.model };
}

/** Ask GPT to write the prompt for one more frame in the chosen style (shown as reference images). */
export async function designFramePrompt(ctx: Ctx, frameUrl: string, styleRefs: string[], brief: string): Promise<{ prompt: string; model: string }> {
  const user = `${brief}

The FIRST image is the new frame to design. The other image(s) are the APPROVED design(s) of this same video: the new frame must belong to the same design system (same palette, typography look, materials, effects, mood and finish) but with its own new composition that fits this frame's content — not a copy-paste of the approved layout.
Return a JSON array with ONE object: [{"name": "frame", "prompt": "the full image prompt"}].`;
  const r = await callGpt(ctx, SYSTEM, user, [frameUrl, ...styleRefs.slice(-4)]);
  const d = parseDirections(r.text)[0];
  if (!d) throw new Error("Art director returned no prompt.");
  return { prompt: d.prompt, model: r.model };
}
