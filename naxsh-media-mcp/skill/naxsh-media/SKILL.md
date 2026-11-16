---
name: "naxsh-media"
description: "Use whenever the naxsh-media MCP tools are connected (transcribe, image_generate, image_edit, style_save...) and the user wants a transcript or subtitles (\"ترانسکریپت\", \"سەبتایتڵ\"), wants images or designs generated or edited (\"وێنە دروست بکە\", \"دیزاین\", \"ئیدیت\"), or runs the motion-graphics-gpt-design / design-element-extraction-prompt workflow without ChatGPT. Covers uploading local files, precise Kurdish/Arabic/Persian transcription, and keeping one style across many API generations."
---

# Naxsh media tools (MCP)

The `naxsh-media` MCP server gives Claude two paid services: **Google Gemini** for precise transcription and **GPT Image (via Kie.ai)** for image generation and editing. Every call costs money: never generate "just to try"; write the prompt carefully first. Always reply in the language the user writes in (Kurdish Sorani, Persian, Arabic, English...); keep messages short.

## Files
- Local file → `file_upload_link(filename)` → run the returned `curl` command from the file's folder → use the returned `file_id`.
- A file already online → `file_import_url(url)`.
- Results come back as links. Download them (`curl -sSL -o name.png '<url>'`), **look at them with Read**, then send them to the user (SendUserFile).
- If curl cannot reach the server host, the cloud environment's network blocks it: tell the user to add the server's host to the environment's allowed hosts.

## Transcription (`transcribe`)
Accuracy matters more than speed. ALWAYS use the `transcribe` tool; never transcribe with another tool, a local model (Whisper) or by guessing.
1. Extract the audio: `ffmpeg -i video.mp4 -vn -ac 1 -ar 16000 -c:a flac audio.flac`.
2. Up to ~3 min: send it as one file. Longer: split at silences into chunks of 2–3 min (`silencedetect`, then `-ss/-to`), transcribe each with `offset_seconds` = chunk start, and join the SRTs (renumber). Short chunks give the best words and timing, and each call stays within the tool time limit (~2 min per 1 min of audio in best mode).
3. Always pass `languages` (`ckb` Sorani, `kmr` Kurmanji, `ar`, `fa`, `en`; several if mixed), a `glossary` of names/brands/places/terms written EXACTLY as they must appear on screen (in Kurdish script if the subtitles are Kurdish, e.g. «لارۆش»; Latin only if that is wanted), and a short `context`.
4. Keep the default `quality: "best"`: two models transcribe independently, Google's speech recognizer adds timing, and a final editor pass listens again and decides every disputed word. Use `quality: "standard"` only if the user asks for speed.
5. `speakers: true` only if there is more than one speaker.
6. Show the result to the user as it came back. Do NOT rewrite, "improve" or re-phrase the transcript yourself; you cannot hear the audio. Only point out words that look doubtful and ask.
7. Save as `transcript.srt` in the project folder and send it.

## Why style drifts with an API, and how to keep it
In a ChatGPT chat, earlier images stay in the conversation, so the model sees the approved look. **Each API call starts from nothing.** The fix: send the approved designs as **reference images** on every call.
- After the user approves the first design of a project: `style_save(name, add_refs=[approved design], notes=...)`. In `notes`, write the measurable style: main hex colours (sample them from the image with PIL), glass opacity, glow colour, corner style, icon style, type look. Keep notes short and factual.
- Every later `image_generate` / `image_edit` for that project passes `style=<name>`. The server puts the base image first, then the saved references, and adds a STYLE LOCK block.
- Each newly approved design: `style_save(name, add_refs=[it])` (max 15; when full, the oldest reference is dropped).
- A rejected design never goes into the style.
- To change one thing in a design, use `image_edit` with that design as `images[0]` + `style` + a precise instruction of only what changes ("keep everything else exactly").
- Never mix two projects' styles.

## Motion-graphics workflow without ChatGPT
Follow `motion-graphics-gpt-design` exactly, with these replacements:
- **Transcript:** if the user sent no SRT, make it with `transcribe` (above) and show it to the user for a quick check before planning.
- **Step 2 (designs):** instead of giving the user prompts for ChatGPT, run them yourself. Frame 1: `image_edit(images=[key frame 1], prompt = the General prompt (2A) + the Frame 1 prompt (2B), aspect_ratio = the frame's ratio, resolution "2K")`. Show the design; on approval `style_save(project, add_refs=[design1])`. Frames 2…N: `image_edit(images=[key frame n], style=project, prompt = 2B for that frame + one line: "Follow exactly the design system of the reference designs.")`. Show each one; add each approved design to the style.
- **Step 3 (check):** unchanged (the API may also alter the photo: measure and report as the skill says).
- **Step 4 (elements):** use `design-element-extraction-prompt` to write the extraction prompt, then run it yourself: `image_edit(images=[approved design], prompt=<main prompt>, background="transparent")`. If the result has a fake checkerboard or the model rejects `transparent`, run the black version (B1) with `image_edit(images=[approved design])`, then the white version (B2) as `image_edit(images=[B1 result], prompt=<B2 prompt>)`, and use `matte.py`. Verify every asset as the skill says.
- Steps 5+ unchanged.

## Costs and limits
`status` shows today's usage and limits. If a limit is reached, tell the user; do not retry. If a generation fails, read the error and fix the cause before trying again (one retry at most).
