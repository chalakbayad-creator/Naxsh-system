---
name: "naxsh-media"
description: "Use whenever the naxsh-media MCP tools are connected (transcribe, image_generate, image_edit, style_save...) and the user wants a transcript or subtitles (\"ترانسکریپت\", \"سەبتایتڵ\"), wants images or designs generated or edited (\"وێنە دروست بکە\", \"دیزاین\", \"ئیدیت\"), or edits a video / adds motion graphics (\"ئیدیت\", \"مۆشن گرافیک\"): 5 GPT style options on one frame, the user picks one, then all other frames in that style at once. Covers uploading local files, precise Kurdish/Arabic/Persian transcription, and keeping one style across many API generations."
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
2. `transcribe` starts a background job and returns a `job_id` at once. Then call `transcribe_result(job_id)` again and again (each call waits ~40 s) until it returns the SRT. Best quality takes about 2–3 minutes per minute of audio; that is normal. Tell the user once that it is working, then keep polling; never give up or switch to another method while the status is `running`.
3. Up to ~4 min of audio: send it as one file. Longer: split at silences into chunks of 3–4 min (`silencedetect`, then `-ss/-to`), start a job for every chunk with `offset_seconds` = chunk start, poll each job, then join the SRTs in order (renumber).
4. Always pass `languages` (`ckb` Sorani, `kmr` Kurmanji, `ar`, `fa`, `en`; several if mixed), a `glossary` of names/brands/places/terms written EXACTLY as they must appear on screen (in Kurdish script if the subtitles are Kurdish, e.g. «لارۆش»; Latin only if that is wanted), and a short `context`.
5. Keep the default `quality: "best"`: two models transcribe independently, Google's speech recognizer adds timing, and a final editor pass listens again and decides every disputed word. Use `quality: "standard"` only if the user asks for speed.
6. `speakers: true` only if there is more than one speaker.
7. Show the result to the user as it came back. Do NOT rewrite, "improve" or re-phrase the transcript yourself; you cannot hear the audio. Only point out words that look doubtful and ask.
8. Save as `transcript.srt` in the project folder and send it.

## The design is GPT's decision, never Claude's (user rule)
GPT chooses every style, colour, font look, layout and element. Claude never describes, suggests or steers a style in any prompt, never writes style notes, and never "improves" a design. Claude only passes the frame, the content (keyword, goal, message, timing) and the fixed rules of `motion-graphics-gpt-design`. The only exception is a change the user asks for in their own words: pass it on as they said it.

## Why style drifts with an API, and how to keep it
In a ChatGPT chat, earlier images stay in the conversation, so the model sees the approved look. **Each API call starts from nothing.** The fix: send the chosen design as a **reference image** on every call.
- `style_save(name, add_refs=[chosen design])` with NO `notes` (the image alone carries the style; Claude does not describe it).
- Every later `image_edit` for that project passes `style=<name>`. The server attaches the references and a STYLE LOCK: same design system, but a NEW composition for each frame (not copy-paste).
- Each newly approved design: `style_save(name, add_refs=[it])` (max 15).
- A rejected design never goes into the style. Never mix two projects' styles.
- To change one thing in a design: `image_edit(images=[that design], style=project, prompt=<the user's change, in their words> + "Keep everything else exactly as it is.")`.

## Running several images at once
Start each job with `wait_seconds: 0` (returns a `task_id` at once), then call `image_result` for each task until all are done. Download every image with curl and look at each one before sending.

## Motion-graphics workflow without ChatGPT
Follow `motion-graphics-gpt-design` exactly (analysis, scenes, key frames, the 2A/2B prompts with NO design description, checks, extraction, animation), with these replacements:

**Transcript:** if the user sent no SRT, make it with `transcribe` (above) and show it for a quick check before planning.

**Step 2A: five style options on ONE frame (always, for every new video).**
1. Pick the most representative key frame (usually frame 1) and upload it.
2. Make 5 designs of that frame, ONE AFTER ANOTHER, each with `image_edit(images=[key frame], prompt = 2A general prompt + that frame's 2B prompt, aspect_ratio = frame ratio, resolution "2K", project=<video name>, avoid_images=[all options made so far])`. Option 1 has no `avoid_images`; option 2 avoids option 1; option 5 avoids options 1–4. The server tells GPT to choose a completely different style of its own each time. Do NOT add any style words.
3. Look at all 5. If two clearly share the same style, remake the later one once (same call, both in `avoid_images`).
4. Send all 5 together in one message (SendUserFile), numbered 1–5, with no style descriptions or recommendations from Claude. Ask: "کام ستایلە؟" and wait.
5. The chosen option → `style_save(<video name>, add_refs=[chosen design])`.

**Step 2B: all remaining frames together.**
1. Start one `image_edit` per remaining frame at once (`wait_seconds: 0`): `images=[key frame n]`, `style=<video name>`, `prompt` = that frame's 2B prompt only, same aspect ratio and resolution, `project=<video name>`. The chosen design is the style reference; each frame gets its own new layout in the same style.
2. Poll every task with `image_result` until all are done. Check each against its key frame (Step 3 of the motion skill). Remake a frame only if it broke a fixed rule (changed the photo, wrong text, clearly another style), at most once.
3. Send ALL frames together in one message, in order, with one short line per frame (frame number and time). Ask the user to approve or tell what to change.
4. Changes: only the frames and only the things the user names, with the user's own words (see "To change one thing" above). Send the changed frames back together. When the user approves, add every approved frame to the style and continue.

**Step 3 (check):** unchanged (the API may also alter the photo: measure and report as the skill says).

**Step 4 (elements):** use `design-element-extraction-prompt` to write the extraction prompt, then run it yourself: `image_edit(images=[approved design], prompt=<main prompt>, background="transparent")`. If the result has a fake checkerboard or the model rejects `transparent`, run the black version (B1) with `image_edit(images=[approved design])`, then the white version (B2) as `image_edit(images=[B1 result], prompt=<B2 prompt>)`, and use `matte.py`. Run the frames' extractions in parallel too. Verify every asset as the skill says.

Steps 5+ unchanged.

## Costs and limits
`status` shows today's usage and limits. If a limit is reached, tell the user; do not retry. If a generation fails, read the error and fix the cause before trying again (one retry at most).
