import type { SeoSuggestions, TitleOption } from "./seoShared";
import { DESCRIPTION_MAX, stripMarkup } from "./seoShared";

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
export const oneLine = (s: string) => stripMarkup(s).replace(/\s+/g, " ").trim();

/** Clean whatever the AI returned into a safe, correctly shaped result. Never trusts lengths, types or shot numbers. */
export function sanitize(raw: unknown, shotNumbers: number[]): Omit<SeoSuggestions, "mock"> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);

  const seen = new Set<string>();
  const titles: TitleOption[] = [];
  for (const t of list(r.titles)) {
    const o = typeof t === "string" ? { title: t, style: "" } : ((t ?? {}) as Record<string, unknown>);
    const title = oneLine(str(o.title, 300)).slice(0, 100).trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    titles.push({ title, style: oneLine(str(o.style, 30)) });
    if (titles.length === 5) break;
  }

  const description = stripMarkup(str(r.description, DESCRIPTION_MAX * 2).replace(/\r/g, "")).trim().slice(0, DESCRIPTION_MAX);

  const tagSeen = new Set<string>();
  const tags: string[] = [];
  let chars = 0;
  for (const t of list(r.tags)) {
    const tag = oneLine(str(t, 80)).replace(/^#/, "").replace(/,/g, " ").trim().slice(0, 40);
    if (!tag || tagSeen.has(tag.toLowerCase())) continue;
    const cost = tag.length + (tag.includes(" ") ? 2 : 0) + 1;
    if (chars + cost > 480 || tags.length >= 30) break;
    tagSeen.add(tag.toLowerCase());
    tags.push(tag);
    chars += cost;
  }

  const hashtags = list(r.hashtags)
    .map((h) => oneLine(str(h, 40)).replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter(Boolean)
    .slice(0, 3);

  const thumbnailTexts = list(r.thumbnailTexts)
    .map((t) => oneLine(str(t, 60)).split(" ").slice(0, 5).join(" "))
    .filter(Boolean)
    .slice(0, 5);

  const valid = new Set(shotNumbers);
  const chapters: { shot: number; title: string }[] = [];
  for (const c of list(r.chapters)) {
    const o = (c ?? {}) as Record<string, unknown>;
    const shot = typeof o.shot === "number" ? Math.trunc(o.shot) : Number.parseInt(String(o.shot), 10);
    const title = oneLine(str(o.title, 120)).slice(0, 60);
    if (!valid.has(shot) || !title) continue;
    chapters.push({ shot, title });
  }
  chapters.sort((a, b) => a.shot - b.shot);

  return { titles, description, tags, hashtags, thumbnailTexts, chapters };
}
