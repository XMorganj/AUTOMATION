import { STEPS } from "@/lib/pipeline";
import type { Video } from "@/lib/videos";

const TONE = {
  approved: "var(--good)",
  ready: "var(--accent)",
  in_progress: "var(--warn)",
  not_started: "var(--border-strong)",
} as const;

/** Ten blocks, one per step, coloured by status. Reads at a glance how far a video has got. */
export function RunStrip({ video, height = 8 }: { video: Video; height?: number }) {
  const done = STEPS.filter((s) => video.steps[s.id] === "approved").length;
  return (
    <div
      role="img"
      aria-label={`${done} of ${STEPS.length} steps approved`}
      className="flex gap-[3px]"
    >
      {STEPS.map((s) => {
        const st = video.steps[s.id];
        return (
          <span
            key={s.id}
            title={`${s.label}: ${st.replace("_", " ")}`}
            style={{
              flex: 1,
              height,
              borderRadius: 2,
              background: TONE[st],
              opacity: st === "not_started" ? 0.45 : 1,
              outline: video.currentStep === s.id ? "2px solid var(--text)" : "none",
              outlineOffset: 1,
            }}
          />
        );
      })}
    </div>
  );
}
