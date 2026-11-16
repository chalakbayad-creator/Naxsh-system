export interface Env {
  /** Storage: uploaded files, generated images, transcripts, saved styles, usage counters.
   *  Either an R2 bucket binding, or built at runtime from the STORE KV namespace. */
  FILES: R2Bucket;
  /** KV namespace used when no R2 bucket is bound (free accounts). */
  STORE?: KVNamespace;

  // ---- Secrets (set with `npx wrangler secret put NAME`) ----
  /** Kie.ai API key. */
  KIE_API_KEY: string;
  /** Google AI Studio (Gemini API) key. */
  GEMINI_API_KEY: string;
  /** Who may use the server: "name:token,name2:token2". Tokens should be long random strings. */
  ACCESS_TOKENS: string;
  /** Random secret used to sign one-time upload links. */
  SIGNING_SECRET: string;

  // ---- Plain settings (wrangler.jsonc "vars") ----
  /** Users with no daily limits, e.g. "akar". */
  ADMIN_USERS?: string;
  DAILY_IMAGE_LIMIT?: string;
  DAILY_TRANSCRIBE_LIMIT?: string;
  /** Default GPT Image version: "2.5-sunburst" | "2.5-flare" | "2.0". */
  DEFAULT_IMAGE_MODEL?: string;
  /** General Gemini model used for careful transcription (Kurdish, Arabic, Persian...). */
  GEMINI_MODEL?: string;
  /** Google's dedicated speech-to-text model. */
  GEMINI_TRANSCRIBE_MODEL?: string;
  /** Largest upload in MB. */
  MAX_UPLOAD_MB?: string;
}

export interface User {
  name: string;
  admin: boolean;
}

export interface Ctx {
  env: Env;
  user: User;
  /** Public origin of this Worker, e.g. https://naxsh-media-mcp.example.workers.dev */
  origin: string;
  waitUntil: (p: Promise<unknown>) => void;
}
