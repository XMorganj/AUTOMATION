"use client";

import { useCallback, useEffect, useState } from "react";
import type { AudioMeta, MusicInfo, VoiceConfig } from "./voiceShared";

export * from "./voiceShared";

/* ---------- loading hooks ---------- */

type ConfigState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; config: VoiceConfig };

export function useVoiceConfig() {
  const [state, setState] = useState<ConfigState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(tick === 0 ? "/api/voices" : "/api/voices?refresh=1", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (VoiceConfig & { error?: string }) | null;
        if (!res.ok || !data) throw new Error(data?.error || `Couldn't load voices (${res.status}).`);
        return data;
      })
      .then((config) => !cancelled && setState({ status: "ready", config }))
      .catch((e) => !cancelled && setState({ status: "error", message: e instanceof Error ? e.message : "Couldn't load voices." }));
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { state, reload };
}

export function useShotAudio(videoId: string) {
  const [meta, setMeta] = useState<Record<number, AudioMeta>>({});
  const [music, setMusic] = useState<MusicInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/voiceover/${videoId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { shots: AudioMeta[]; music: MusicInfo | null };
      })
      .then((data) => {
        if (cancelled) return;
        setMeta(Object.fromEntries(data.shots.map((m) => [m.n, m])));
        setMusic(data.music);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [videoId, tick]);

  return { meta, music, loaded, refresh };
}
