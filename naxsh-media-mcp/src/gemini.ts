import type { Ctx } from "./env";

const API = "https://generativelanguage.googleapis.com";

export interface Segment {
  start: number; // seconds
  end: number; // seconds
  speaker?: string;
  text: string;
}

export interface TranscribeOptions {
  /** Main languages, e.g. ["ckb"], ["ar"], ["fa"], ["ckb","ar"]. Helps the model choose script and spelling. */
  languages: string[];
  /** Names, brands, places and terms that appear in the audio, spelled the way they should be written. */
  glossary: string[];
  /** Free text about the recording (topic, speakers, accent). */
  context?: string;
  speakers: boolean;
  /** Keep fillers (ئەم، ئا، يعني...) and false starts. */
  keep_fillers: boolean;
  /** Second listening pass that corrects the first draft. */
  verify: boolean;
  /** Add this many seconds to every timestamp (when the audio is one chunk of a longer file). */
  offset_seconds: number;
  max_segment_seconds: number;
  max_chars: number;
  /** "best" = several models + an editor pass (default); "standard" = one model + review. */
  quality?: "best" | "standard";
  /** Force one Gemini model (admin testing). */
  model?: string;
}

const LANG_NAMES: Record<string, string> = {
  ckb: "Central Kurdish (Sorani)",
  ku: "Kurdish",
  kmr: "Northern Kurdish (Kurmanji)",
  ar: "Arabic",
  fa: "Persian (Farsi)",
  en: "English",
  tr: "Turkish",
};

// ---------------- Files API (resumable upload) ----------------

export async function uploadToGemini(
  ctx: Ctx,
  body: ReadableStream,
  size: number,
  mimeType: string,
  displayName: string,
): Promise<{ name: string; uri: string; mimeType: string }> {
  const key = ctx.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set on the server.");
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 120) } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(`Gemini upload start failed: HTTP ${start.status} ${(await start.text()).slice(0, 300)}`);

  const { readable, writable } = new FixedLengthStream(size);
  const pump = body.pipeTo(writable);
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "content-length": String(size),
    },
    body: readable,
  });
  await pump.catch(() => {});
  const j: any = await up.json().catch(() => ({}));
  if (!up.ok || !j?.file?.uri) throw new Error(`Gemini upload failed: HTTP ${up.status} ${JSON.stringify(j).slice(0, 300)}`);

  // Audio/video must be processed before it can be used.
  let file = j.file;
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(`${API}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key } });
    file = await g.json();
  }
  if (file.state === "FAILED") throw new Error("Gemini could not process this file (state FAILED).");
  return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mimeType };
}

export async function deleteGeminiFile(ctx: Ctx, name: string) {
  await fetch(`${API}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": ctx.env.GEMINI_API_KEY } }).catch(() => {});
}

/** Preferred model, then fallbacks (GEMINI_FALLBACK_MODELS, comma-separated). */
function modelChain(ctx: Ctx): string[] {
  const list = [
    ctx.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
    ...(ctx.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-3.5-flash,gemini-2.5-flash").split(","),
  ];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

/** Errors where another model may still work: quota (429), no access (403/404), overload (500/503). */
function isSkippable(e: unknown): boolean {
  const m = String((e as Error)?.message ?? "");
  return /HTTP (429|403|404|500|503)\b/.test(m) || /quota|RESOURCE_EXHAUSTED|not found|UNAVAILABLE|overloaded/i.test(m);
}

/**
 * Streams the answer (Server-Sent Events) so long transcriptions do not hit a gateway
 * timeout, then returns it in the normal generateContent shape.
 */
async function generate(ctx: Ctx, model: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "x-goog-api-key": ctx.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const j: any = await res.json().catch(() => ({}));
    throw new Error(`Gemini (${model}) error HTTP ${res.status}: ${JSON.stringify(j?.error ?? j).slice(0, 400)}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let text = "";
  let usage: any;
  let finish: string | undefined;
  const handle = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let j: any;
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.error) throw new Error(`Gemini (${model}) error: ${JSON.stringify(j.error).slice(0, 400)}`);
    const c = j.candidates?.[0];
    for (const p of c?.content?.parts ?? []) if (typeof p.text === "string" && !p.thought) text += p.text;
    if (c?.finishReason) finish = c.finishReason;
    if (j.usageMetadata) usage = j.usageMetadata;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      handle(buf.slice(0, i).replace(/\r$/, ""));
      buf = buf.slice(i + 1);
    }
  }
  if (buf) handle(buf);
  if (!text && finish && finish !== "STOP") throw new Error(`Gemini (${model}) stopped without text (${finish}).`);
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: finish }], usageMetadata: usage };
}

function textOf(resp: any): string {
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p: any) => typeof p.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("");
}

// ---------------- Engine 1: general Gemini model with a strict transcription brief ----------------

function systemPrompt(o: TranscribeOptions): string {
  const langs = o.languages.length ? o.languages.map((l) => LANG_NAMES[l] ?? l).join(", ") : "detect automatically";
  return `You are a professional subtitle transcriber for Kurdish (Sorani and Kurmanji), Arabic and Persian, with perfect hearing and native knowledge of each language's spelling.

MAIN LANGUAGE(S) OF THIS RECORDING: ${langs}.

ACCURACY RULES
1. Transcribe EXACTLY what is said, word for word, in the language it is spoken. NEVER translate, summarize, paraphrase, "improve" grammar, or change dialect words into standard ones.
2. Code-switching: when a speaker uses an Arabic, Persian, English or Turkish word or sentence inside Kurdish (or the other way round), write that word in its own language's normal spelling, exactly as said. English words in Latin letters.
3. ${o.keep_fillers ? "Keep fillers, hesitations, repetitions and false starts exactly as spoken." : "Drop pure fillers (ئەم، ئا، اِم، يعني used as a filler) and stutters, but never drop a real word."}
4. If a word is truly not understandable, write [؟] in its place. Never invent words to fill a gap.
5. Numbers: write years, prices, phone numbers and quantities as digits; write other numbers the way they are commonly written in that language.
6. Use the GLOSSARY spelling for every name and term in it whenever it is spoken.

SPELLING RULES (very important)
- Central Kurdish (Sorani): standard Kurdish Arabic-script alphabet. Use ک (never ك), ی (never ي or ى), ە for the e vowel (never ة or a final ه meant as e), ێ ۆ ڕ ڵ ڤ گ چ پ ژ where they belong; ھ/ه only for the consonant h; و for u, وو for û and ی for î. Use zero-width non-joiner (U+200C) where standard (e.g. after a final ە in compounds). No Arabic diacritics.
- Northern Kurdish (Kurmanji): Latin Hawar alphabet (ç ê î ş û x), unless the glossary or context asks for Arabic script.
- Arabic: standard Arabic orthography (ة ي ك ى أ إ ء as correct); dialect words as pronounced; no diacritics except where needed to avoid confusion.
- Persian: Persian letters ی and ک (never ي ك), ZWNJ in می‌، نمی‌، ها‌ and compound words; no diacritics.

TIMING RULES (subtitles)
- Timestamps are seconds from the start of this audio file, with millisecond precision (e.g. 12.345). Listen for the exact moment the first word starts and the last word ends.
- One segment = one natural phrase, split at pauses and sentence ends. Each segment at most ${o.max_segment_seconds} seconds and at most ${o.max_chars} characters.
- Segments are in order and never overlap; end > start. Silence and music are not segments.
${o.speakers ? "- speaker: label each segment with a consistent speaker id (S1, S2, ...). The same voice always gets the same id." : "- speaker: always \"S1\"."}

OUTPUT: only JSON matching the schema. "language" is the main language code you heard (ckb, kmr, ar, fa, en, ...).`;
}

function userPrompt(o: TranscribeOptions): string {
  const lines: string[] = [];
  if (o.context) lines.push(`CONTEXT: ${o.context}`);
  if (o.glossary.length) lines.push(`GLOSSARY (exact spelling): ${o.glossary.join(" | ")}`);
  lines.push("Transcribe the whole audio from the very first word to the very last word.");
  return lines.join("\n");
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    language: { type: "STRING" },
    segments: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          start: { type: "NUMBER" },
          end: { type: "NUMBER" },
          speaker: { type: "STRING" },
          text: { type: "STRING" },
        },
        required: ["start", "end", "speaker", "text"],
        propertyOrdering: ["start", "end", "speaker", "text"],
      },
    },
  },
  required: ["language", "segments"],
  propertyOrdering: ["language", "segments"],
};

function parseSegments(raw: string): { language: string; segments: Segment[] } {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const j = JSON.parse(s);
  const segs: Segment[] = (j.segments ?? [])
    .map((x: any) => ({ start: Number(x.start), end: Number(x.end), speaker: x.speaker, text: String(x.text ?? "").trim() }))
    .filter((x: Segment) => x.text && Number.isFinite(x.start) && Number.isFinite(x.end));
  return { language: j.language ?? "", segments: segs };
}

/** Calls the first model in `models` that accepts the request. */
async function callFirst(ctx: Ctx, models: string[], body: unknown): Promise<{ resp: any; model: string }> {
  const tried: string[] = [];
  for (const m of models) {
    try {
      return { resp: await generate(ctx, m, body), model: m };
    } catch (e) {
      tried.push(`${m}: ${String((e as Error).message).slice(0, 160)}`);
      if (!isSkippable(e)) throw e;
    }
  }
  throw new Error(`No Gemini model accepted the request:\n${tried.join("\n")}`);
}

const toks = (r: any) => Number(r?.usageMetadata?.totalTokenCount ?? 0);
const textLen = (segs: Segment[]) => segs.reduce((n, s) => n + s.text.length, 0);

/**
 * Careful transcription with a general Gemini model.
 * - standard: one transcription + one listening review pass.
 * - best (default): two different models transcribe independently, Google's speech model adds
 *   word timings, then a final pass listens to the audio again and decides every word where
 *   the candidates disagree (like a human editor comparing several drafts).
 */
export async function transcribeWithModel(
  ctx: Ctx,
  file: { uri: string; mimeType: string },
  o: TranscribeOptions,
  speechCandidate?: Promise<{ segments: Segment[]; text: string; tokens: number } | null>,
): Promise<{ language: string; segments: Segment[]; model: string; passes: number; tokens: number; models_used: string[] }> {
  const audioPart = { file_data: { mime_type: file.mimeType, file_uri: file.uri } };
  const config = { response_mime_type: "application/json", response_schema: SCHEMA, max_output_tokens: 65536 };
  const system = { parts: [{ text: systemPrompt(o) }] };
  const chain = o.model ? [o.model] : modelChain(ctx);
  const draftBody = { system_instruction: system, contents: [{ role: "user", parts: [audioPart, { text: userPrompt(o) }] }], generation_config: config };

  // Draft A from the strongest model that works.
  const a = await callFirst(ctx, chain, draftBody);
  let tokens = toks(a.resp);
  const draftA = parseSegments(textOf(a.resp));
  const used = [a.model];

  if (o.quality !== "best") {
    let result = draftA;
    let passes = 1;
    if (o.verify && result.segments.length) {
      const review = `Here is a DRAFT transcript of this audio (JSON). Listen to the WHOLE audio again, very carefully, and return the corrected transcript in the same JSON schema.
Fix: misheard or missing words, words that were translated or "corrected" instead of written as spoken, wrong spelling/alphabet per the spelling rules, wrong speaker labels, and timestamps that do not match when the words are actually spoken. Do not shorten the transcript. If the draft is already correct, return it unchanged.

DRAFT:
${JSON.stringify(result)}`;
      try {
        const fixed = await generate(ctx, a.model, { ...draftBody, contents: [{ role: "user", parts: [audioPart, { text: userPrompt(o) }, { text: review }] }] });
        tokens += toks(fixed);
        const r2 = parseSegments(textOf(fixed));
        if (r2.segments.length && textLen(r2.segments) >= textLen(result.segments) * 0.8) {
          result = r2;
          passes = 2;
        }
      } catch {
        /* keep the draft */
      }
    }
    return { ...result, model: a.model, passes, tokens, models_used: used };
  }

  // Draft B from a different model (independent errors), plus the speech model's timings.
  const rest = chain.slice(chain.indexOf(a.model) + 1);
  const [b, speech] = await Promise.all([
    rest.length ? callFirst(ctx, rest, draftBody).catch(() => null) : Promise.resolve(null),
    speechCandidate ?? Promise.resolve(null),
  ]);
  const candidates: { label: string; source: string; segments: Segment[] }[] = [{ label: "A", source: a.model, segments: draftA.segments }];
  if (b) {
    tokens += toks(b.resp);
    try {
      const d = parseSegments(textOf(b.resp));
      if (d.segments.length) {
        candidates.push({ label: "B", source: b.model, segments: d.segments });
        used.push(b.model);
      }
    } catch {
      /* ignore a broken candidate */
    }
  }
  if (speech?.segments.length) {
    tokens += speech.tokens;
    candidates.push({ label: candidates.length === 1 ? "B" : "C", source: "speech recognizer (precise word timing, weaker spelling)", segments: speech.segments });
    used.push("speech");
  }

  const fmt = (segs: Segment[]) => segs.map((s) => `[${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text}`).join("\n");
  const merge = `You are the final editor. Below are ${candidates.length} independent transcripts of THIS audio, made by different systems. They contain mistakes, and some may contain invented sentences.

${candidates.map((c) => `### Candidate ${c.label} (${c.source})\n${fmt(c.segments)}`).join("\n\n")}

Your job: listen to the WHOLE audio yourself, slowly, word by word, and write the one correct transcript.
- Where the candidates agree and the audio confirms it, keep it.
- Where they disagree, decide ONLY by what you hear. Never pick a phrase because it sounds more fluent or more formal; the speaker's own words win.
- If every candidate is wrong somewhere, write what is actually said.
- Make sure nothing at the start or the end of the audio is missing, and nothing is added that is not spoken.
- Timing: the speech recognizer's timings (if present) are precise; use them to place segment starts/ends.
- Follow all spelling and timing rules. Return the full transcript in the JSON schema.`;

  let final = draftA;
  let passes = candidates.length;
  try {
    const m = await callFirst(ctx, [a.model, ...rest], {
      ...draftBody,
      contents: [{ role: "user", parts: [audioPart, { text: userPrompt(o) }, { text: merge }] }],
    });
    tokens += toks(m.resp);
    const r = parseSegments(textOf(m.resp));
    const longest = Math.max(...candidates.map((c) => textLen(c.segments)));
    if (r.segments.length && textLen(r.segments) >= longest * 0.75) {
      final = r;
      passes += 1;
    }
  } catch {
    /* keep draft A */
  }
  return { ...final, model: a.model, passes, tokens, models_used: used };
}

// ---------------- Engine 2: Google's dedicated speech model (gemini-3.5-transcribe) ----------------

/**
 * Uses the dedicated transcription model with verbatim mode, word timestamps and speaker
 * diarization. Google lists 85+ languages; Kurdish is not confirmed, so the default engine
 * for Kurdish is the general model above. The response format of this model is new, so the
 * parser accepts the shapes Google has documented and falls back to plain text.
 */
export async function transcribeWithSpeechModel(
  ctx: Ctx,
  file: { uri: string; mimeType: string },
  o: TranscribeOptions,
): Promise<{ language: string; segments: Segment[]; model: string; text: string; tokens: number }> {
  const model = ctx.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe";
  const transcription_config: Record<string, unknown> = {
    mode: {
      type: "verbatim",
      timestamp_granularities: ["word"],
      ...(o.speakers ? { diarization_mode: "speaker" } : {}),
    },
  };
  if (o.languages.length) transcription_config.language_codes = o.languages;
  if (o.glossary.length) transcription_config.custom_vocabulary = o.glossary;

  // This model is served through the Interactions API (POST /v1beta/interactions), which
  // takes snake_case fields. Two input shapes are tried, since the docs show both.
  const key = ctx.env.GEMINI_API_KEY;
  const errors: string[] = [];
  const inputs = [
    [{ type: "audio", uri: file.uri, mime_type: file.mimeType }],
    [{ role: "user", content: [{ type: "audio", uri: file.uri, mime_type: file.mimeType }] }],
  ];
  let resp: any = null;
  for (const input of inputs) {
    const res = await fetch(`${API}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ model, input, generation_config: { transcription_config } }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (res.ok) {
      resp = j;
      break;
    }
    errors.push(`HTTP ${res.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  }
  if (!resp) throw new Error(`Speech model (${model}) refused the request:\n${errors.join("\n")}`);

  // Collect word items and text wherever they appear in the response.
  const words: { start: number; end: number; speaker?: string; word: string }[] = [];
  const texts: string[] = [];
  const walk = (v: any, speaker?: string) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, speaker));
    if (!v || typeof v !== "object") return;
    const spk = v.speaker ?? v.speaker_label ?? v.speakerLabel ?? speaker;
    const start = v.start_offset ?? v.startOffset ?? v.start_time ?? v.startTime;
    const w = v.word ?? (start !== undefined ? v.text : undefined);
    if (w !== undefined && start !== undefined) {
      words.push({
        start: secs(start),
        end: secs(v.end_offset ?? v.endOffset ?? v.end_time ?? v.endTime ?? start),
        speaker: spk,
        word: String(w),
      });
      return;
    }
    if (typeof v.text === "string" && v.type !== "audio") texts.push(v.text);
    for (const k of Object.keys(v)) if (typeof v[k] === "object") walk(v[k], spk);
  };
  walk(resp.steps ?? resp.outputs ?? resp.output ?? resp);
  const text = texts.join("\n").trim();
  const segments = words.length ? groupWords(words, o) : [];
  const tokens = Number(resp?.usage?.total_tokens ?? resp?.usage_metadata?.total_token_count ?? resp?.usageMetadata?.totalTokenCount ?? 0);
  return { language: o.languages[0] ?? "", segments, model, text, tokens };
}

function secs(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v.replace(/s$/, ""));
  if (v && typeof v === "object") {
    const o = v as any;
    return Number(o.seconds ?? 0) + Number(o.nanos ?? 0) / 1e9;
  }
  return NaN;
}

function groupWords(words: { start: number; end: number; speaker?: string; word: string }[], o: TranscribeOptions): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  words = [...words].filter((w) => Number.isFinite(w.start)).sort((x, y) => x.start - y.start);
  for (const w of words) {
    if (!Number.isFinite(w.start) || !w.word) continue;
    const breakHere =
      !cur ||
      w.speaker !== cur.speaker ||
      w.start - cur.end > 0.6 ||
      w.end - cur.start > o.max_segment_seconds ||
      cur.text.length + 1 + w.word.length > o.max_chars ||
      /[.!?؟。]$/.test(cur.text);
    if (breakHere) {
      if (cur) out.push(cur);
      cur = { start: w.start, end: w.end, speaker: w.speaker, text: w.word };
    } else {
      cur!.text += " " + w.word;
      cur!.end = w.end;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ---------------- helpers ----------------

export function cleanSegments(segs: Segment[], offset: number): Segment[] {
  const out: Segment[] = [];
  let prevEnd = 0;
  for (const s of [...segs].sort((a, b) => a.start - b.start)) {
    let start = Math.max(s.start, prevEnd);
    let end = Math.max(s.end, start + 0.3);
    out.push({ ...s, start: start + offset, end: end + offset });
    prevEnd = end;
  }
  return out;
}

function ts(t: number, sep = ","): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

export function toSrt(segs: Segment[], withSpeakers: boolean): string {
  return segs
    .map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end)}\n${withSpeakers && s.speaker ? `[${s.speaker}] ` : ""}${s.text}\n`)
    .join("\n");
}

export async function listModels(ctx: Ctx): Promise<string[]> {
  const res = await fetch(`${API}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": ctx.env.GEMINI_API_KEY } });
  const j: any = await res.json().catch(() => ({}));
  return (j.models ?? []).map((m: any) => String(m.name).replace(/^models\//, ""));
}
