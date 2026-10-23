# Automation Studio

A studio that takes a YouTube video from idea to published: idea → script → fact check → image prompts → images → motion → voiceover → render → title & SEO → upload.

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for real AI ideas
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
| 7–10 Voiceover, Render, Title & SEO, Upload | Next |
| Publish, Shorts, Calendar, Channels, YouTube | Next |

## Notes

- Video text (ideas, script, prompts) lives in your browser's `localStorage`. Images live on disk in `./data/videos/<id>/images/`. Set `STUDIO_DATA_DIR` to keep them somewhere else.
- Run this on your own computer. The image routes have no login, so don't expose the app to the internet as it is.
- Motion is defined once in `src/lib/motion.ts` and used by both the preview and (later) the render, so what you preview is what you get.
- Name image files with their shot number (001.png, 002.png …) to land them on the right shot. Other names are matched in name order.
- With no `ANTHROPIC_API_KEY`, every AI route returns clearly-labelled placeholder content so you can click through the app.
- The fact check uses the AI's own knowledge, not live web sources. Confirm dates, numbers, quotes and scripture against a real source before publishing.
- `ANTHROPIC_BASE_URL` can point the app at a proxy or a test server. It defaults to the official API.
- When you edit the script after a later step was made, that step shows an "out of date" notice.
