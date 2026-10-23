"use client";

import { Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ACCENTS, useAccent, useTheme } from "@/components/ThemeProvider";

export default function SettingsPage() {
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();

  return (
    <>
      <PageHeader title="Settings" subtitle="Make the studio yours." />

      <section className="glass p-5 md:p-7" aria-labelledby="appearance-h">
        <h2 id="appearance-h" className="mb-4 text-lg font-bold">
          Appearance
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:max-w-md" role="radiogroup" aria-label="Theme">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className="glass glass-hover flex items-center gap-2.5 p-4 text-sm font-semibold capitalize"
              style={theme === t ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
            >
              {t === "dark" ? <Moon size={16} /> : <Sun size={16} />}
              {t}
            </button>
          ))}
        </div>

        <h3 className="mb-1 mt-8 text-sm font-bold">Accent colour</h3>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Used for buttons, highlights and the background glow.</p>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={accent === a.id}
              onClick={() => setAccent(a.id)}
              className="flex flex-col items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]"
            >
              <span
                className="size-9 rounded-full transition-transform hover:scale-110"
                style={{
                  background: a.color,
                  boxShadow: accent === a.id ? `0 0 0 3px var(--bg), 0 0 0 5px ${a.color}` : "none",
                }}
              />
              {a.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
