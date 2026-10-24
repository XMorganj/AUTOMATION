"use client";

import { useMemo, useState } from "react";
import { Check, Pause, Play, Search } from "lucide-react";
import { DEFAULT_SETTINGS, PRESETS, type VoiceChoice, type VoiceConfig, type VoiceInfo } from "@/lib/voice";

const PAGE = 24;

interface Player {
  playing: string | null;
  toggle: (id: string, src: string) => void;
}

export function VoicePicker({
  config,
  choice,
  onChange,
  player,
  disabled,
}: {
  config: VoiceConfig;
  choice: VoiceChoice | undefined;
  onChange: (c: VoiceChoice) => void;
  player: Player;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const [manualId, setManualId] = useState("");

  const categories = useMemo(() => ["all", ...Array.from(new Set(config.voices.map((v) => v.category)))], [config.voices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return config.voices.filter((v) => {
      if (category !== "all" && v.category !== category) return false;
      if (!q) return true;
      return [v.name, v.description, v.labels.gender, v.labels.accent, v.labels.age, v.labels.useCase].some((t) => t?.toLowerCase().includes(q));
    });
  }, [config.voices, query, category]);

  // a saved model that this account no longer offers (or the demo model after adding a key) falls back to the first one
  const modelId = config.models.some((m) => m.id === choice?.modelId) ? choice!.modelId : (config.models[0]?.id ?? "");
  const base = { ...DEFAULT_SETTINGS, ...choice };

  function select(id: string, name: string) {
    onChange({ ...DEFAULT_SETTINGS, ...choice, voiceId: id, voiceName: name, modelId });
  }

  function patch(p: Partial<VoiceChoice>) {
    if (!choice) return;
    onChange({ ...choice, modelId, ...p });
  }

  const activePreset = PRESETS.find(
    (p) =>
      p.settings.stability === base.stability &&
      p.settings.similarity === base.similarity &&
      p.settings.style === base.style &&
      p.settings.speed === base.speed &&
      p.settings.boost === base.boost,
  )?.id;

  const model = config.models.find((m) => m.id === modelId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Voice</h3>

        {config.voices.length > 6 && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                className="input !pl-10"
                placeholder="Search voices (e.g. deep, British, storyteller)"
                aria-label="Search voices"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Voice category">
              {categories.map((c) => (
                <button
                  key={c}
                  className="pill capitalize"
                  data-active={category === c}
                  aria-pressed={category === c}
                  onClick={() => {
                    setCategory(c);
                    setShown(PAGE);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {config.voicesError && (
          <p className="mb-3 text-sm" style={{ color: "var(--warn)" }}>
            {config.voicesError}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {config.voices.length === 0 ? "No voices to show. Paste a voice ID below to use one from your ElevenLabs account." : "No voices match that search."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, shown).map((v) => (
              <VoiceCard
                key={v.id}
                voice={v}
                selected={choice?.voiceId === v.id}
                playing={player.playing === `preview:${v.id}`}
                disabled={disabled}
                onPreview={() => v.previewUrl && player.toggle(`preview:${v.id}`, v.previewUrl)}
                onSelect={() => select(v.id, v.name)}
              />
            ))}
          </ul>
        )}
        {filtered.length > shown && (
          <button className="btn mt-3" onClick={() => setShown((s) => s + PAGE)}>
            Show more voices ({filtered.length - shown} more)
          </button>
        )}

        {config.configured && (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const id = manualId.trim();
              if (/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
                select(id, config.voices.find((v) => v.id === id)?.name ?? `Voice ${id.slice(0, 6)}…`);
                setManualId("");
              }
            }}
          >
            <label htmlFor="manual-voice" className="sr-only">
              Voice ID
            </label>
            <input
              id="manual-voice"
              className="input"
              placeholder="Or paste a voice ID from your ElevenLabs account"
              value={manualId}
              maxLength={64}
              onChange={(e) => setManualId(e.target.value)}
            />
            <button className="btn shrink-0 justify-center" type="submit" disabled={disabled || !/^[A-Za-z0-9_-]{6,64}$/.test(manualId.trim())}>
              Use this voice
            </button>
          </form>
        )}
      </div>

      {choice && (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="model" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                Model
              </label>
              <select id="model" className="input" value={modelId} disabled={disabled} onChange={(e) => patch({ modelId: e.target.value })}>
                {config.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.costKnown && m.costFactor !== 1 && m.costFactor > 0 ? ` (${m.costFactor}× credits)` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                {modelId === "eleven_multilingual_v2"
                  ? "ElevenLabs describes this as the most stable choice for long narration."
                  : modelId === "eleven_flash_v2_5"
                    ? "Faster and about half the price per character. A little less nuance."
                    : model && model.id !== "demo"
                      ? "Check a short test before you generate the whole video."
                      : ""}
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]">Delivery</h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Delivery presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="pill"
                    data-active={activePreset === p.id}
                    aria-pressed={activePreset === p.id}
                    title={p.hint}
                    disabled={disabled}
                    onClick={() => patch(p.settings)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {!activePreset && <p className="mt-1.5 text-xs text-[var(--text-muted)]">Custom settings</p>}
            </div>
          </div>

          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Slider id="stability" label="Stability" hint="Lower is more expressive, higher is more even" value={base.stability} min={0} max={1} step={0.05} disabled={disabled} onChange={(v) => patch({ stability: v })} />
            <Slider id="similarity" label="Similarity" hint="How closely it sticks to the original voice" value={base.similarity} min={0} max={1} step={0.05} disabled={disabled} onChange={(v) => patch({ similarity: v })} />
            <Slider id="style" label="Style" hint="Exaggeration. Keep low for long videos" value={base.style} min={0} max={1} step={0.05} disabled={disabled} onChange={(v) => patch({ style: v })} />
            <Slider id="speed" label="Speed" hint="1.00 is normal" value={base.speed} min={0.7} max={1.2} step={0.01} disabled={disabled} onChange={(v) => patch({ speed: v })} format={(v) => v.toFixed(2) + "×"} />
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={base.boost} disabled={disabled} onChange={(e) => patch({ boost: e.target.checked })} className="size-4 accent-[var(--accent)]" />
            Speaker boost <span className="text-xs text-[var(--text-muted)]">(clearer, slightly slower)</span>
          </label>
        </>
      )}
    </div>
  );
}

function VoiceCard({
  voice,
  selected,
  playing,
  disabled,
  onPreview,
  onSelect,
}: {
  voice: VoiceInfo;
  selected: boolean;
  playing: boolean;
  disabled: boolean;
  onPreview: () => void;
  onSelect: () => void;
}) {
  const chips = [voice.labels.gender, voice.labels.accent, voice.labels.age, voice.labels.useCase].filter(Boolean) as string[];
  return (
    <li
      className="glass flex flex-col gap-2 p-4"
      style={{ borderRadius: 16, ...(selected ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : {}) }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{voice.name}</div>
          {chips.length > 0 && <div className="mt-0.5 truncate text-[11px] capitalize text-[var(--text-muted)]">{chips.join(" · ")}</div>}
        </div>
        {selected && <Check size={16} style={{ color: "var(--accent)" }} className="shrink-0" aria-label="Selected" />}
      </div>
      {voice.description && <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{voice.description}</p>}
      <div className="mt-auto flex gap-2 pt-1">
        {voice.previewUrl && (
          <button className="btn !px-3 !py-1.5 !text-xs" onClick={onPreview} aria-label={`${playing ? "Pause" : "Play"} preview of ${voice.name}`}>
            {playing ? <Pause size={12} /> : <Play size={12} />} Preview
          </button>
        )}
        <button className="btn !px-3 !py-1.5 !text-xs" onClick={onSelect} disabled={disabled} aria-pressed={selected}>
          {selected ? "Selected" : "Use this voice"}
        </button>
      </div>
    </li>
  );
}

function Slider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  format,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        <span className="text-xs tabular-nums text-[var(--text-muted)]">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <p className="text-[11px] text-[var(--text-faint)]">{hint}</p>
    </div>
  );
}
