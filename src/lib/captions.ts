import type { WordTiming } from "./voiceShared";

export type CaptionStyle = "karaoke" | "pop" | "off";

const cs = (sec: number) => Math.max(0, Math.round(sec * 100));

function stamp(sec: number): string {
  const total = cs(sec);
  const h = Math.floor(total / 360000);
  const m = Math.floor((total % 360000) / 6000);
  const s = Math.floor((total % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(total % 100).padStart(2, "0")}`;
}

/** Words go into ASS text, where { } and \ mean something. Strip them, and flatten whitespace. */
const clean = (w: string) => w.replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();

interface Line {
  words: WordTiming[];
}

/** Group words into on-screen lines: short, ending at sentence ends or long pauses. */
export function groupLines(words: WordTiming[], maxWords = 6, maxChars = 36): Line[] {
  const lines: Line[] = [];
  let cur: WordTiming[] = [];
  const chars = () => cur.reduce((n, w) => n + w.w.length + 1, 0);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const next = words[i + 1];
    const endsSentence = /[.!?…]["')\]]*$/.test(w.w);
    const endsClause = /[,;:—–]["')\]]*$/.test(w.w);
    const pause = next ? next.s - w.e > 0.6 : true;
    if (!next || endsSentence || pause || cur.length >= maxWords || chars() >= maxChars || (endsClause && cur.length >= 3)) {
      lines.push({ words: cur });
      cur = [];
    }
  }
  return lines;
}

const HEADER = (font: string) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${font},74,&H0000D7FF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,2,2,120,120,96,1
Style: Pop,${font},120,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,2,120,120,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

/**
 * Captions for one shot as an ASS file. Times are relative to the start of the shot's clip.
 *  - karaoke: a few words at a time, each turning gold as it is spoken
 *  - pop: one big word at a time
 * Returns "" when there is nothing to show.
 */
export function buildAss(words: WordTiming[], style: CaptionStyle, font = "Poppins", shotSeconds = Infinity): string {
  if (style === "off") return "";
  const ws = words.map((w) => ({ ...w, w: clean(w.w) })).filter((w) => w.w && Number.isFinite(w.s) && Number.isFinite(w.e));
  if (ws.length === 0) return "";
  const safeFont = font.replace(/[,\n\r]/g, "").slice(0, 60) || "Poppins";
  const out: string[] = [HEADER(safeFont)];
  const cap = (t: number) => Math.min(t, shotSeconds);

  if (style === "karaoke") {
    const lines = groupLines(ws);
    lines.forEach((line, i) => {
      const first = line.words[0];
      const last = line.words[line.words.length - 1];
      const nextStart = lines[i + 1]?.words[0].s;
      const end = cap(Math.min(last.e + 0.4, nextStart ?? Infinity));
      const text = line.words
        .map((w, j) => {
          const until = line.words[j + 1]?.s ?? w.e;
          return `{\\k${Math.max(1, cs(until - w.s))}}${w.w}`;
        })
        .join(" ");
      out.push(`Dialogue: 0,${stamp(first.s)},${stamp(Math.max(end, first.s + 0.1))},Karaoke,,0,0,0,,${text}`);
    });
  } else {
    ws.forEach((w, i) => {
      const nextStart = ws[i + 1]?.s;
      const end = cap(nextStart !== undefined && nextStart - w.e < 0.4 ? nextStart : w.e + 0.15);
      const pop = "{\\t(0,90,\\fscx112\\fscy112)\\t(90,180,\\fscx100\\fscy100)}";
      out.push(`Dialogue: 0,${stamp(w.s)},${stamp(Math.max(end, w.s + 0.08))},Pop,,0,0,0,,${pop}${w.w.toUpperCase()}`);
    });
  }
  return out.join("\n") + "\n";
}
