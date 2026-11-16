---
name: "naxsh-media"
description: "Use whenever the user wants a transcript or subtitles (\"ترانسکریپت\", \"سەبتایتڵ\", \"SRT\") of a video or audio, including inside the motion-graphics-gpt-design workflow. Transcription goes through the naxsh-media MCP tools (transcribe, transcribe_result): precise Kurdish/Arabic/Persian with timestamps. Not for images or designs."
---

# Naxsh media: transcription only

The `naxsh-media` MCP server is used ONLY for transcription (Google Gemini). Always reply in the language the user writes in; keep messages short.

**Designs and images are NOT made with this server (user rule).** Never call `image_generate`, `image_edit`, `design_options`, `design_frames` or `style_save` unless the user explicitly asks for them in that message. For video edits and motion graphics, follow `motion-graphics-gpt-design` exactly as written: the user designs in ChatGPT with the prompts Claude writes. The only change: if the user sends no SRT, make the transcript with this server (below).

## Files
- Local file → `file_upload_link(filename)` → run the returned `curl` command from the file's folder → use the returned `file_id`.
- A file already online → `file_import_url(url)`.
- Results come back as links. Download them with `curl -sSL -o transcript.srt '<url>'`.
- If curl cannot reach the server host, the cloud environment's network blocks it: tell the user to add the server's host to the environment's allowed hosts.

## Transcription (`transcribe`)
Accuracy matters more than speed. ALWAYS use the `transcribe` tool; never transcribe with another tool, a local model (Whisper) or by guessing.
1. Extract the audio: `ffmpeg -i video.mp4 -vn -ac 1 -ar 16000 -c:a flac audio.flac`.
2. `transcribe` starts a background job and returns a `job_id` at once. Then call `transcribe_result(job_id)` again and again (each call waits ~40 s) until it returns the SRT. Best quality takes about 2–3 minutes per minute of audio; that is normal. Tell the user once that it is working, then keep polling; never give up or switch to another method while the status is `running`.
3. Up to ~4 min of audio: send it as one file. Longer: split at silences into chunks of 3–4 min (`silencedetect`, then `-ss/-to`), start a job for every chunk with `offset_seconds` = chunk start, poll each job, then join the SRTs in order (renumber).
4. Always pass `languages` (`ckb` Sorani, `kmr` Kurmanji, `ar`, `fa`, `en`; several if mixed), a `glossary` of names/brands/places/terms written EXACTLY as they must appear on screen (in Kurdish script if the subtitles are Kurdish, e.g. «لارۆش»; Latin only if that is wanted), and a short `context`.
5. Keep the default `quality: "best"`: two models transcribe independently, Google's speech recognizer adds timing, and a final editor pass listens again and decides every disputed word. Use `quality: "standard"` only if the user asks for speed.
6. `speakers: true` only if there is more than one speaker.
7. Show the result to the user as it came back. Do NOT rewrite, "improve" or re-phrase the transcript yourself; you cannot hear the audio. Only point out words that look doubtful and ask.
8. Save as `transcript.srt` in the project folder and send it.
