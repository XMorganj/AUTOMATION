# Automation Studio

A studio that takes a YouTube video from idea to published: idea → script → fact check → image prompts → images → motion → voiceover → render → title & SEO → upload.

## Run it

```bash
npm install
cp .env.example .env.local   # set BASIC_AUTH_USER / BASIC_AUTH_PASSWORD, plus ANTHROPIC_API_KEY and ELEVENLABS_API_KEY for the real thing
npm run dev                  # http://localhost:3000
```

## Status

| Area | State |
| --- | --- |
| App shell, dark/light theme, accent colours | Done |
| Home (action cards, continue where you left off) | Done |
| Video pipeline stepper + saved state | Done (stored in the browser for now) |
| 1. Idea (length, theme, 5 AI ideas, approve) | Done |
| 2. Script (write, edit, ask for changes, approve) | Done |
| 3. Fact check (flagged claims, apply fix to script) | Done |
| 4. Image prompts (art style presets, batched prompts, copy-all) | Done |
| 5. Images (drop images, ZIP or folder; matched to shots; replace, remove) | Done |
| 6. Motion (per-shot zoom/pan, live preview, intensity, shuffle) | Done |
| 7. Voiceover (ElevenLabs voices, models, delivery presets, per-shot redo, credit estimate, background music) | Done |
| 8. Render (FFmpeg: zoom/pan motion, word-by-word captions, music ducking, 720p/1080p/4K, 24/30 fps) | Done |
| 9. Title & SEO (5 title options, description, tags, hashtags, exact chapter timestamps, thumbnail maker, checklist) | Done |
| 10. Upload | Next |
| Publish, Shorts, Calendar, Channels, YouTube | Next |

## Needs

- Node 20+ and **FFmpeg** (with libx264 and libass, which standard builds have) on your PATH for the Render step. Check with `ffmpeg -version`. Set `FFMPEG_PATH` / `FFPROBE_PATH` if it lives elsewhere.
- Captions use the font named in `CAPTION_FONT` (default Poppins). If it isn't installed, your system falls back to a default font.

## Notes

- Video text (ideas, script, prompts) lives in your browser's `localStorage`. Images live on disk in `./data/videos/<id>/images/`. Set `STUDIO_DATA_DIR` to keep them somewhere else.
- The whole app sits behind a password (`src/proxy.ts`, HTTP Basic). Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`; with neither set, the app refuses to serve. `BASIC_AUTH_DISABLED=true` turns the gate off for local use only. There is no default password.
- Generated media is written to disk (`STUDIO_DATA_DIR`), so host it somewhere with a persistent disk. Serverless hosts with a read-only or temporary filesystem will not keep images or narration.
- Motion is defined once in `src/lib/motion.ts` and used by both the preview and (later) the render, so what you preview is what you get.
- Name image files with their shot number (001.png, 002.png …) to land them on the right shot. Other names are matched in name order.
- The writing steps use a local Ollama model by default (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`); set `DEFAULT_AI_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY` to use Claude instead. Ollama's default context window is small and silently drops the end of long scripts, so the app asks for `OLLAMA_NUM_CTX` (16384) tokens. If Claude is chosen with no key, the routes return clearly-labelled placeholder content.
- The fact check uses the AI's own knowledge, not live web sources. Confirm dates, numbers, quotes and scripture against a real source before publishing.
- `ANTHROPIC_BASE_URL` can point the Claude calls at a proxy or a test server.
- When you edit the script after a later step was made, that step shows an "out of date" notice.
- Without `ELEVENLABS_API_KEY` the Voiceover step runs in demo mode: silent placeholder audio with realistic timing, so the rest of the pipeline can be tried.
- Narration is made one shot at a time, so redoing a single shot is cheap and each shot has an exact duration. Word-level timings from ElevenLabs are saved for the captions in the Render step.
- Generating narration spends ElevenLabs characters, so the app shows the character count and your remaining balance and asks first.
- Rendering makes one clip per shot (zoom/pan with the same easing as the preview, captions burned in), then joins them without re-encoding and mixes narration + music. Only one render runs at a time, and a new render never replaces your last good video until it finishes. The finished file is in `data/videos/<id>/render/video.mp4`.
- The Render screen marks a finished video "out of date" if you change the settings, motion, images, narration or music after rendering.
- Chapter timestamps come from the narration lengths using the same frame maths as the renderer, so they match the finished video. YouTube needs at least 3 chapters, the first at 0:00, each 10 seconds or longer; chapters that break that are merged or dropped.
- The thumbnail is drawn in your browser (1280×720 JPEG under 2 MB) and saved to `data/videos/<id>/thumbnail.jpg` for the Upload step. YouTube rejects `<` and `>` in titles, descriptions and tags, so those are removed.
