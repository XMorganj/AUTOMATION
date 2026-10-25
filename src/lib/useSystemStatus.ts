"use client";

import { useEffect, useState } from "react";

export interface SystemStatus {
  ai: { provider: "anthropic" | "ollama"; ready: boolean };
  voice: { ready: boolean };
  render: { ready: boolean };
  upload: { ready: boolean };
}

let cache: SystemStatus | null = null;

/** Which parts of this deployment are set up. null until the first answer arrives. */
export function useSystemStatus(): SystemStatus | null {
  const [s, setS] = useState<SystemStatus | null>(cache);
  useEffect(() => {
    if (cache) return;
    let live = true;
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SystemStatus | null) => {
        if (j && live) {
          cache = j;
          setS(j);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return s;
}
