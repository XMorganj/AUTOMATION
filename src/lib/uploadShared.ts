/** Types and limits shared by the upload routes and the Upload screen. Not a "use client" file. */

export type Privacy = "private" | "unlisted" | "public";

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "22", label: "People & Blogs" },
  { id: "27", label: "Education" },
  { id: "24", label: "Entertainment" },
  { id: "28", label: "Science & Technology" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "19", label: "Travel & Events" },
  { id: "10", label: "Music" },
  { id: "20", label: "Gaming" },
  { id: "23", label: "Comedy" },
  { id: "17", label: "Sports" },
  { id: "29", label: "Nonprofits & Activism" },
];

export interface UploadOptions {
  privacy: Privacy;
  /** ISO time to go public. Only with privacy "private". */
  publishAt?: string;
  categoryId: string;
  madeForKids: boolean;
  /** tells YouTube the video contains AI-made or altered content */
  aiDisclosure: boolean;
}

export const DEFAULT_UPLOAD_OPTIONS: UploadOptions = {
  privacy: "private",
  categoryId: "22",
  madeForKids: false,
  aiDisclosure: true,
};

export interface UploadRequest {
  title: string;
  description: string;
  tags: string[];
  options: UploadOptions;
  /** upload again even though this video was already uploaded */
  again?: boolean;
}

export type UploadStatus = "running" | "done" | "failed" | "canceled";

export interface UploadJob {
  id: string;
  status: UploadStatus;
  phase: string;
  sent: number;
  total: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** whether Press Upload again will carry on from where it stopped */
  resumable?: boolean;
  youtubeId?: string;
  /** what YouTube says the video is now (it can differ from what was asked for) */
  privacy?: string;
  thumbnail?: "set" | "skipped" | "failed";
  thumbnailError?: string;
  options: UploadOptions;
  title: string;
}

export interface UploadState {
  configured: boolean;
  connected: boolean;
  channel: { id: string; title: string } | null;
  job: UploadJob | null;
  video: { exists: boolean; bytes: number };
  thumbnail: { exists: boolean; bytes: number };
}

export interface YoutubeStatus {
  configured: boolean;
  connected: boolean;
  channel: { id: string; title: string } | null;
  redirectUri: string;
}

export const TITLE_LIMIT = 100;
export const DESCRIPTION_BYTES = 5000;
export const TAG_CHARS = 500;

export function describeBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}
