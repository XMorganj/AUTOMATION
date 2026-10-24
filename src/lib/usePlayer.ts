"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** One shared audio player, so starting a new clip always stops the previous one. `id` says which clip is playing. */
export function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const current = useRef<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    audio.current?.pause();
    current.current = null;
    setPlaying(null);
  }, []);

  const toggle = useCallback(
    (id: string, src: string) => {
      setError(null);
      if (current.current === id) {
        stop();
        return;
      }
      if (!audio.current) {
        const a = new Audio();
        a.addEventListener("ended", () => {
          current.current = null;
          setPlaying(null);
        });
        a.addEventListener("error", () => {
          current.current = null;
          setPlaying(null);
          setError("Couldn't play that audio.");
        });
        audio.current = a;
      }
      const a = audio.current;
      a.pause();
      a.src = src;
      current.current = id;
      setPlaying(id);
      a.play().catch(() => {
        // an interrupted play() (user clicked something else) is normal; only report if this clip is still the current one
        if (current.current === id) {
          current.current = null;
          setPlaying(null);
          setError("Couldn't play that audio.");
        }
      });
    },
    [stop],
  );

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  return { playing, error, toggle, stop };
}
