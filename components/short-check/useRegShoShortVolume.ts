"use client";

import { useEffect, useState } from "react";
import type { RegShoShortVolumePayload } from "@/lib/fast/regShoShortVolume";

export function useRegShoShortVolume(ticker: string) {
  const [payload, setPayload] = useState<RegShoShortVolumePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) {
      setPayload(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setPayload(null);
    setLoading(true);
    setError(null);
    fetch(`/api/regsho-short-volume?ticker=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | (RegShoShortVolumePayload & { error?: string })
          | null;
        if (!res.ok) {
          throw new Error(data?.error || `Short volume unavailable (${res.status})`);
        }
        if (!data || !data.status || !Array.isArray(data.days)) {
          throw new Error("Short volume response was empty");
        }
        return data;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Short volume unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return { payload, loading, error };
}
