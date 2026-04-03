"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * One-shot: if URL has ?ticker=SYM, run scan for SYM (used from Top Gainers links).
 */
export default function PumpScorecardUrlBootstrap({
  onRun,
}: {
  onRun: (symbol: string) => void | Promise<void>;
}) {
  const params = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const raw = params.get("ticker")?.trim().toUpperCase() ?? "";
    if (!raw || !/^[A-Z]{1,5}$/.test(raw)) return;
    done.current = true;
    void onRun(raw);
  }, [params, onRun]);

  return null;
}
