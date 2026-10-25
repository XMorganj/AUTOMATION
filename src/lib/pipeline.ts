export type StepId =
  | "idea"
  | "script"
  | "factcheck"
  | "prompts"
  | "images"
  | "motion"
  | "voice"
  | "render"
  | "seo"
  | "upload";

export type StepStatus = "not_started" | "in_progress" | "ready" | "approved";

export interface StepDef {
  id: StepId;
  label: string;
  blurb: string;
}

export const STEPS: StepDef[] = [
  { id: "idea", label: "Idea", blurb: "Pick the topic and length for this video." },
  { id: "script", label: "Script", blurb: "Write and refine the narration script." },
  { id: "factcheck", label: "Fact check", blurb: "Verify every claim in the script before it goes public." },
  { id: "prompts", label: "Image prompts", blurb: "One consistent-style image prompt per shot." },
  { id: "images", label: "Images", blurb: "Generate or drop in the images for each shot." },
  { id: "motion", label: "Motion", blurb: "Every shot already moves. Change any shot, or approve." },
  { id: "voice", label: "Voiceover", blurb: "Choose a voice and background music." },
  { id: "render", label: "Render", blurb: "Quality, frame rate and captions, then render." },
  { id: "seo", label: "Title & SEO", blurb: "Titles, description with chapters, tags and thumbnail." },
  { id: "upload", label: "Upload", blurb: "Publish now or schedule it on your channel." },
];

export const STEP_IDS = STEPS.map((s) => s.id);

export const LENGTH_OPTIONS = [3, 5, 8, 10, 12, 15, 20] as const;

/** Narration pace ≈ 145 words/min; one shot (about 15 words) every ~6 seconds. */
export const WORDS_PER_MIN = 145;
export const WORDS_PER_SHOT = 15;

export function lengthStats(minutes: number) {
  const words = Math.round(minutes * WORDS_PER_MIN);
  return { words, images: Math.round(words / WORDS_PER_SHOT) };
}

/** The ten steps grouped into four stages, for the pipeline board. */
export const STAGES: { id: string; label: string; steps: StepId[] }[] = [
  { id: "write", label: "Write", steps: ["idea", "script", "factcheck"] },
  { id: "visuals", label: "Visuals", steps: ["prompts", "images", "motion"] },
  { id: "sound", label: "Sound & render", steps: ["voice", "render"] },
  { id: "ship", label: "Ship", steps: ["seo", "upload"] },
];
