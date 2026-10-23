/** Helpers shared by the browser and the server. No imports from server-only modules. */

export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Small, fast, non-cryptographic hash. Used only to notice that a script changed. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Split narration into shots: whole sentences grouped so each shot lands as close to `target` words as possible.
 * A sentence is never cut in half, so one long sentence becomes one long shot.
 */
export function splitShots(script: string, target = 15): string[] {
  const text = script.replace(/\r/g, "").trim();
  if (!text) return [];

  const sentences = text.match(/[^.!?\n]+[.!?]+["')\]]*|[^.!?\n]+/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const shots: string[] = [];
  let cur: string[] = [];
  let words = 0;

  for (const s of sentences) {
    const sw = countWords(s);
    // Close the current shot first if adding this sentence would land further from the target than stopping now.
    if (cur.length && Math.abs(words + sw - target) > Math.abs(words - target)) {
      shots.push(cur.join(" "));
      cur = [];
      words = 0;
    }
    cur.push(s);
    words += sw;
  }
  if (cur.length) {
    // fold a tiny tail into the previous shot instead of making a shot out of three words
    if (words < 6 && shots.length) shots[shots.length - 1] += " " + cur.join(" ");
    else shots.push(cur.join(" "));
  }
  return shots;
}
