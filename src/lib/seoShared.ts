import type { ChapterDraft } from "./chapters";

/** What the AI route returns, and what the screen saves with the video. Not a "use client" file. */
export interface TitleOption {
  title: string;
  /** e.g. "Curiosity", "How-to", "List" */
  style: string;
}

export interface SeoSuggestions {
  titles: TitleOption[];
  description: string;
  tags: string[];
  hashtags: string[];
  /** short punchy lines for the thumbnail */
  thumbnailTexts: string[];
  chapters: ChapterDraft[];
  mock: boolean;
}

export interface ThumbSettings {
  shot: number;
  text: string;
  layout: "left" | "center" | "bar";
  color: "yellow" | "white" | "red";
  highlightLast: boolean;
}

export interface SeoData {
  title: string;
  titleOptions: TitleOption[];
  description: string;
  tags: string[];
  hashtags: string[];
  thumbnailTexts: string[];
  chapters: ChapterDraft[];
  thumb?: ThumbSettings;
  /** time the saved thumbnail file was written (0 = none) */
  thumbSavedAt?: number;
  /** the description exactly as it will be posted (text, chapters, hashtags), saved when the step is approved */
  finalDescription?: string;
  /** hash of the script these were written from, to notice later edits */
  scriptHash: string;
  mock?: boolean;
}

export const TITLE_MAX = 100;
export const TITLE_GOOD = 70;
export const TAGS_MAX_CHARS = 500;
export const DESCRIPTION_MAX = 5000;

/** YouTube rejects < and > in titles, descriptions and tags. Used on text as it is typed. */
export const noAngles = (s: string) => s.replace(/[<>]/g, "");

/** For text that arrives whole (from the AI): drop HTML-looking tags entirely, then any stray < or >. */
export const stripMarkup = (s: string) => s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "");

/** The description as it will be posted: text, then chapters, then hashtags. */
export function finalDescription(description: string, chapterText: string, hashtags: string[]): string {
  const tags = hashtags.length ? hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ") : "";
  return [description.trim(), chapterText.trim() && `Chapters:\n${chapterText.trim()}`, tags].filter(Boolean).join("\n\n");
}

export const tagChars = (tags: string[]) => tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
