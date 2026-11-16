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

async function generate(ctx: Ctx, model: string, body: unknown): Promise<any> {
  const res = await fetch(`${API}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": ctx.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini (${model}) error HTTP ${res.status}: ${JSON.stringify(j?.error ?? j).slice(0, 400)}`);
  return j;
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

export async function transcribeWithModel(
  ctx: Ctx,
  file: { uri: string; mimeType: string },
  o: TranscribeOptions,
): Promise<{ language: string; segments: Segment[]; model: string; passes: number }> {
  const model = ctx.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
  const audioPart = { file_data: { mime_type: file.mimeType, file_uri: file.uri } };
  const config = { response_mime_type: "application/json", response_schema: SCHEMA, max_output_tokens: 65536 };

  const draftResp = await generate(ctx, model, {
    system_instruction: { parts: [{ text: systemPrompt(o) }] },
    contents: [{ role: "user", parts: [audioPart, { text: userPrompt(o) }] }],
    generation_config: config,
  });
  let result = parseSegments(textOf(draftResp));
  let passes = 1;

  if (o.verify && result.segments.length) {
    const review = `Here is a DRAFT transcript of this audio (JSON). Listen to the WHOLE audio again, very carefully, and return the corrected transcript in the same JSON schema.
Fix: misheard or missing words, words that were translated or "corrected" instead of written as spoken, wrong spelling/alphabet per the spelling rules, wrong speaker labels, and timestamps that do not match when the words are actually spoken. Do not shorten the transcript. If the draft is already correct, return it unchanged.

DRAFT:
${JSON.stringify(result)}`;
    try {
      const fixed = await generate(ctx, model, {
        system_instruction: { parts: [{ text: systemPrompt(o) }] },
        contents: [{ role: "user", parts: [audioPart, { text: userPrompt(o) }, { text: review }] }],
        generation_config: config,
      });
      const r2 = parseSegments(textOf(fixed));
      // Guard against a review pass that drops most of the text.
      const len = (r: typeof result) => r.segments.reduce((n, s) => n + s.text.length, 0);
      if (r2.segments.length && len(r2) >= len(result) * 0.8) {
        result = r2;
        passes = 2;
      }
    } catch {
      /* keep the draft */
    }
  }
  return { ...result, model, passes };
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
): Promise<{ language: string; segments: Segment[]; model: string; text: string }> {
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

  const resp = await generate(ctx, model, {
    contents: [{ role: "user", parts: [{ file_data: { mime_type: file.mimeType, file_uri: file.uri } }] }],
    generation_config: { transcription_config },
  });

  const parts: any[] = resp?.candidates?.[0]?.content?.parts ?? [];
  const words: { start: number; end: number; speaker?: string; word: string }[] = [];
  for (const p of parts) {
    const at = p.audioTranscription ?? p.audio_transcription ?? p.transcription;
    const list: any[] = at?.words ?? p.words ?? [];
    for (const w of list) {
      words.push({
        start: secs(w.startOffset ?? w.start_offset ?? w.start),
        end: secs(w.endOffset ?? w.end_offset ?? w.end),
        speaker: w.speakerLabel ?? w.speaker_label ?? at?.speakerLabel ?? p.speakerLabel,
        word: String(w.word ?? w.text ?? ""),
      });
    }
  }
  const text = textOf(resp);
  const segments = words.length ? groupWords(words, o) : [];
  return { language: o.languages[0] ?? "", segments, model, text };
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
