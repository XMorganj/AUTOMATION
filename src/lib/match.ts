/**
 * Decide which dropped file belongs to which shot.
 *
 * 1. By number: every file has a number in its name (001.png, shot_12.jpg), all numbers are different,
 *    and all of them are real shots. This also lets you re-drop just a few images to replace those shots.
 * 2. Otherwise by order: files are sorted by name (natural order, so 2 comes before 10) and given to
 *    shots 1, 2, 3 ... Gemini and Flow often download files with random names, so this is the common case.
 *
 * Both rules are all-or-nothing on purpose. A random file name like "image_8f3a2c91.png" contains digits,
 * and treating those as a shot number would put pictures in the wrong place.
 */

export type MatchMode = "number" | "order";

export interface MatchResult<T> {
  mode: MatchMode;
  /** shot number → file */
  assignments: Map<number, T>;
  /** files that could not be given a shot */
  skipped: T[];
  warnings: string[];
}

const baseName = (name: string) => name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");

/** The shot number a file name asks for, or null if the name doesn't clearly contain one. */
export function numberFromName(name: string): number | null {
  const groups = baseName(name).match(/\d+/g);
  if (!groups) return null;
  if (groups.length === 1) return parseInt(groups[0], 10);
  // several numbers (a date, an id): trust only a single zero-padded group such as 007
  const padded = groups.filter((g) => g.length === 3 && g.startsWith("0"));
  return padded.length === 1 ? parseInt(padded[0], 10) : null;
}

export function matchFiles<T>(files: { name: string; ref: T }[], shotCount: number): MatchResult<T> {
  const warnings: string[] = [];

  // --- by number ---
  const nums = files.map((f) => numberFromName(f.name));
  const allNumbered = files.length > 0 && nums.every((n) => n !== null);
  if (allNumbered) {
    const valid = (nums as number[]).every((n) => n >= 1 && n <= shotCount);
    const unique = new Set(nums).size === nums.length;
    if (valid && unique) {
      const assignments = new Map<number, T>();
      files.forEach((f, i) => assignments.set(nums[i] as number, f.ref));
      return { mode: "number", assignments, skipped: [], warnings };
    }
    if (!valid) warnings.push(`Some file numbers don't match a shot (there are ${shotCount} shots), so files were matched in name order instead.`);
    else warnings.push("Two files had the same number, so files were matched in name order instead.");
  }

  // --- by order ---
  const sorted = [...files].sort((a, b) =>
    baseName(a.name).localeCompare(baseName(b.name), undefined, { numeric: true, sensitivity: "base" }),
  );
  const assignments = new Map<number, T>();
  const skipped: T[] = [];
  sorted.forEach((f, i) => {
    if (i < shotCount) assignments.set(i + 1, f.ref);
    else skipped.push(f.ref);
  });
  if (skipped.length) {
    warnings.push(`${skipped.length} extra image${skipped.length > 1 ? "s were" : " was"} left out because there are only ${shotCount} shots.`);
  }
  if (!allNumbered) {
    warnings.push("The file names don't carry shot numbers, so images were matched to shots in name order. Check the grid.");
  }
  return { mode: "order", assignments, skipped, warnings };
}
