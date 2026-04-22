"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

const TV_SCRIPT = "https://s3.tradingview.com/tv.js";

let tvScriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TV_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("TradingView script failed"))
      );
      return;
    }
    const s = document.createElement("script");
    s.src = TV_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("TradingView script failed"));
    document.head.appendChild(s);
  });
  return tvScriptPromise;
}

function exchangeToTvPrefix(exchange: string | null | undefined): string {
  const u = (exchange || "").toUpperCase();
  if (u.includes("NASDAQ") || u === "NCM" || u === "NGM" || u === "NMS")
    return "NASDAQ";
  if (u.includes("NYSE") && !u.includes("ARCA")) return "NYSE";
  if (
    u.includes("AMEX") ||
    u.includes("NYSE ARCA") ||
    u === "ARCA" ||
    u.includes("NYSEAM")
  )
    return "AMEX";
  if (u.includes("OTC") || u.includes("PINK")) return "OTC";
  return "AMEX";
}

type Props = {
  ticker: string;
  exchangeHint?: string | null;
  height?: number;
};

export default function TradingViewChartEmbed({
  ticker,
  exchangeHint,
  height = 400,
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const containerId = `tv_dm_${reactId}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);

  useEffect(() => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadTradingViewScript();
        if (cancelled || !wrapRef.current) return;
        const TV = window.TradingView;
        if (!TV?.widget) return;

        wrapRef.current.innerHTML = "";
        const inner = document.createElement("div");
        inner.id = containerId;
        inner.style.width = "100%";
        inner.style.height = `${height}px`;
        wrapRef.current.appendChild(inner);

        const prefix = exchangeToTvPrefix(exchangeHint);
        widgetRef.current = new TV.widget({
          autosize: false,
          symbol: `${prefix}:${sym}`,
          interval: "5",
          timezone: "America/New_York",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#161b22",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerId,
          height,
          width: "100%",
        });
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
      try {
        widgetRef.current?.remove?.();
      } catch {
        /* ignore */
      }
      widgetRef.current = null;
      if (wrapRef.current) wrapRef.current.innerHTML = "";
    };
  }, [ticker, exchangeHint, height, containerId]);

  return (
    <div
      ref={wrapRef}
      className="w-full rounded border overflow-hidden bg-[#131722]"
      style={{ borderColor: "#30363d", minHeight: height }}
    />
  );
}
