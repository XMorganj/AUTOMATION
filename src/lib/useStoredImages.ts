"use client";

import { useCallback, useEffect, useState } from "react";

export interface StoredImg {
  n: number;
  ext: string;
  size: number;
  mtime: number;
}

/** Images live on the server's disk (too big for browser storage), and the server's list is the source of truth. */
export function useStoredImages(videoId: string) {
  const [images, setImages] = useState<Record<number, StoredImg>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    // `cancelled` stops an older, slower response from overwriting a newer one
    let cancelled = false;
    fetch(`/api/images/${videoId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as { images: StoredImg[] };
      })
      .then((data) => {
        if (cancelled) return;
        setImages(Object.fromEntries(data.images.map((i) => [i.n, i])));
        setLoadError(null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Couldn't read the saved images. Check that the app is still running.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, tick]);

  return { images, loaded, loadError, refresh };
}
