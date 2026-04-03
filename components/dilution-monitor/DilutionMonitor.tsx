"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import AskEdgarWebModal from "@/components/dilution-monitor/AskEdgarWebModal";
import { isAskEdgarWebUrl } from "@/lib/askEdgarWeb";
import type { StockSplitRow } from "@/lib/stockSplits";

type GainerRow = {
  ticker: string;
  changePct: number | null;
  price: number | null;
  volume: number | null;
  askEdgar: { overallOfferingRisk: string | null } | null;
};

type TopGainersJson = {
  gainers?: GainerRow[];
  count?: number;
  source?: string;
};

type DetailJson = {
  ticker: string;
  dilution: Record<string, unknown> | null;
  floatData: Record<string, unknown> | null;
  newsFeed: Record<string, unknown>[];
  chartAnalysis: Record<string, unknown> | null;
  stockPrice: number | null;
  inPlay: {
    warrants: Record<string, unknown>[];
    convertibles: Record<string, unknown>[];
  };
  offerings: Record<string, unknown>[];
  error?: string;
  meta?: { rateLimited?: boolean; authError?: boolean };
};

const BG = "#0d1117";
const CARD = "#161b22";
const ROW = "#1b2128";
const BORDER = "#30363d";
const ACCENT = "#58a6ff";
const FG = "#e6edf3";

/** Match server: cache successful detail per ticker for 30 minutes in this session. */
const DETAIL_CLIENT_TTL_MS = 30 * 60 * 1000;

function detailJsonCacheable(j: DetailJson): boolean {
  return !j.meta?.rateLimited && !j.meta?.authError;
}

const HISTORY_FROM_COLOR: Record<string, string> = {
  green: "Strong",
  yellow: "Semi-Strong",
  orange: "Mixed",
  red: "Fader",
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function splitAdjustmentLabel(t: string | null): string {
  if (!t) return "Split";
  switch (t.toLowerCase()) {
    case "forward_split":
      return "Forward split";
    case "reverse_split":
      return "Reverse split";
    case "stock_dividend":
      return "Stock dividend";
    default:
      return t.replace(/_/g, " ");
  }
}

function riskBadgeClass(level: string): string {
  const u = level.toLowerCase();
  if (u.includes("high")) return "bg-[#da3633] text-white";
  if (u.includes("medium") || u.includes("moderate"))
    return "bg-[#d29922] text-[#0d1117]";
  if (u.includes("low")) return "bg-[#238636] text-white";
  return "bg-[#484f58] text-white";
}

function fmtM(n: unknown): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtVol(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
}

function newsHeadline(item: Record<string, unknown>): string {
  const t = str(item.title).trim();
  if (t) return t;
  const s = str(item.summary).trim();
  if (s.startsWith("HEADLINE:")) {
    return s.split("HEADLINE:")[1]?.split("\n")[0]?.trim() || s;
  }
  if (s) return s.slice(0, 200);
  return str(item.form_type) || "Item";
}

function newsDate(item: Record<string, unknown>): string {
  const raw = str(item.created_at || item.filed_at || item._displayDate);
  return raw.replace("T", " ").slice(0, 16);
}

function stripeColor(formType: string): string {
  if (formType === "news") return "#1f8fb3";
  if (formType === "8-K" || formType === "6-K") return "#a85c14";
  if (formType === "grok") return "#7b3fa0";
  return "#484f58";
}

function stripeLabel(formType: string): string {
  if (formType === "grok") return "GROK";
  if (formType === "news") return "NEWS";
  return formType.toUpperCase() || "—";
}

function historyLabel(chart: Record<string, unknown> | null): string {
  if (!chart) return "N/A";
  const r = str(chart.rating).toLowerCase();
  if (HISTORY_FROM_COLOR[r]) return HISTORY_FROM_COLOR[r];
  const alt = str(chart.rating_label || chart.history_rating);
  if (alt) return alt;
  return str(chart.rating) || "N/A";
}

function historyBadgeClass(chart: Record<string, unknown> | null): string {
  const r = str(chart?.rating).toLowerCase();
  if (r === "green") return "bg-[#238636] text-white";
  if (r === "yellow") return "bg-[#d29922] text-[#0d1117]";
  if (r === "orange") return "bg-[#a85c14] text-white";
  if (r === "red") return "bg-[#da3633] text-white";
  const lbl = historyLabel(chart).toLowerCase();
  if (lbl.includes("strong") && !lbl.includes("semi")) return "bg-[#238636] text-white";
  if (lbl.includes("semi")) return "bg-[#d29922] text-[#0d1117]";
  if (lbl.includes("mixed")) return "bg-[#a85c14] text-white";
  if (lbl.includes("weak")) return "bg-[#d29922] text-[#0d1117]";
  if (lbl.includes("fader")) return "bg-[#da3633] text-white";
  return "bg-[#484f58] text-white";
}

function renderOfferingDesc(desc: unknown): ReactNode {
  if (desc == null) return null;
  if (typeof desc === "string") {
    return desc.split("\n").map((line, i) => (
      <p key={i} className="text-sm text-[#e6edf3] font-mono">
        {line}
      </p>
    ));
  }
  if (typeof desc === "object" && !Array.isArray(desc)) {
    const o = desc as Record<string, unknown>;
    return (
      <ul className="text-sm font-mono space-y-1 text-[#e6edf3]">
        {Object.entries(o).map(([k, v]) => (
          <li key={k}>
            <span className="text-[#8b949e]">{k}:</span> {str(v)}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export default function DilutionMonitor() {
  const [gainers, setGainers] = useState<GainerRow[]>([]);
  const [gainersSource, setGainersSource] = useState<string>("");
  const [gainersLoading, setGainersLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [detail, setDetail] = useState<DetailJson | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [sublineByTicker, setSublineByTicker] = useState<Record<string, string>>(
    {}
  );
  const [aeModalUrl, setAeModalUrl] = useState<string | null>(null);
  const detailClientCache = useRef(
    new Map<string, { expires: number; detail: DetailJson }>()
  );
  const [splits, setSplits] = useState<StockSplitRow[] | null>(null);
  const [splitsLoading, setSplitsLoading] = useState(false);
  const [splitsErr, setSplitsErr] = useState<string | null>(null);

  const openAskEdgarOrExternal = useCallback((href: string) => {
    const h = href.trim();
    if (!h) return;
    if (isAskEdgarWebUrl(h)) setAeModalUrl(h);
    else window.open(h, "_blank", "noopener,noreferrer");
  }, []);

  const loadGainers = useCallback(async () => {
    setGainersLoading(true);
    try {
      const res = await fetch("/api/top-gainers", { cache: "no-store" });
      const j = (await res.json()) as TopGainersJson & { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load gainers");
      setGainers(j.gainers || []);
      setGainersSource(j.source || "");
    } catch (e) {
      setGainers([]);
      console.error(e);
    } finally {
      setGainersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGainers();
  }, [loadGainers]);

  useEffect(() => {
    if (!gainers.length) return;
    setSelected((s) => s ?? gainers[0].ticker);
  }, [gainers]);

  const symForDetail =
    (selected?.trim() && selected.trim().toUpperCase()) ||
    (gainers[0]?.ticker?.trim() && gainers[0].ticker.trim().toUpperCase()) ||
    null;

  const loadDetail = useCallback(async (sym: string) => {
    const t = sym.trim().toUpperCase();
    if (!t) return;
    const now = Date.now();
    const cached = detailClientCache.current.get(t);
    if (cached && cached.expires > now) {
      setDetailErr(null);
      setDetailLoading(false);
      setDetail(cached.detail);
      const f = cached.detail.floatData;
      if (f) {
        const fl = fmtM(f.float_shares ?? f.float ?? f.Float);
        const os = fmtM(f.outstanding_shares ?? f.os ?? f.shares_outstanding);
        const mc = fmtM(f.market_cap_final ?? f.market_cap ?? f.marketCap);
        const sector = str(f.sector || f.Sector || "").trim();
        const country = str(f.country || f.Country || "US").trim();
        const parts = [fl && os ? `${fl}/${os}` : fl || os, mc, sector, country].filter(
          Boolean
        );
        if (parts.length)
          setSublineByTicker((prev) => ({
            ...prev,
            [t]: parts.join(" | "),
          }));
      }
      return;
    }

    setDetailLoading(true);
    setDetailErr(null);
    try {
      const res = await fetch(`/api/ask-edgar/detail/${encodeURIComponent(t)}`);
      const j = (await res.json()) as DetailJson & { error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (detailJsonCacheable(j)) {
        detailClientCache.current.set(t, {
          expires: now + DETAIL_CLIENT_TTL_MS,
          detail: j,
        });
      }
      setDetail(j);
      const f = j.floatData;
      if (f) {
        const fl = fmtM(f.float_shares ?? f.float ?? f.Float);
        const os = fmtM(f.outstanding_shares ?? f.os ?? f.shares_outstanding);
        const mc = fmtM(f.market_cap_final ?? f.market_cap ?? f.marketCap);
        const sector = str(f.sector || f.Sector || "").trim();
        const country = str(f.country || f.Country || "US").trim();
        const parts = [fl && os ? `${fl}/${os}` : fl || os, mc, sector, country].filter(
          Boolean
        );
        if (parts.length)
          setSublineByTicker((prev) => ({
            ...prev,
            [t]: parts.join(" | "),
          }));
      }
    } catch (e) {
      setDetail(null);
      setDetailErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!symForDetail) return;
    void loadDetail(symForDetail);
  }, [symForDetail, loadDetail]);

  const goManual = () => {
    const t = manual.trim().toUpperCase();
    if (!t || !/^[A-Z]{1,6}$/.test(t)) return;
    setSelected(t);
    if (!gainers.some((g) => g.ticker === t)) {
      setGainers((prev) => [
        {
          ticker: t,
          changePct: null,
          price: null,
          volume: null,
          askEdgar: null,
        },
        ...prev.filter((g) => g.ticker !== t),
      ]);
    }
  };

  const dilution = detail?.dilution;
  const floatData = detail?.floatData;
  const dilUrl = `https://app.askedgar.io/ticker/${selected}/dilution`;

  const headerSub = useMemo(() => {
    if (!floatData && !dilution) return "";
    const fl = fmtM(floatData?.float_shares ?? floatData?.float ?? dilution?.float_shares);
    const os = fmtM(
      floatData?.outstanding_shares ?? floatData?.os ?? dilution?.outstanding_shares
    );
    const mc = fmtM(
      floatData?.market_cap_final ?? floatData?.market_cap ?? dilution?.market_cap_final
    );
    const sector = str(floatData?.sector || dilution?.sector).trim();
    const country = str(floatData?.country || dilution?.country || "US").trim();
    const a = fl && os ? `Float/OS: ${fl}/${os}` : "";
    const b = mc ? `MC: ${mc}` : "";
    const c = [sector, country].filter(Boolean).join(" | ");
    return [a, b, c].filter(Boolean).join(" | ");
  }, [floatData, dilution]);

  const badgeItems: [string, string][] = dilution
    ? [
        ["Overall Risk", str(dilution.overall_offering_risk || "N/A")],
        ["Offering", str(dilution.offering_ability || "N/A")],
        ["Dilution", str(dilution.dilution || "N/A")],
        ["Frequency", str(dilution.offering_frequency || "N/A")],
        ["Cash Need", str(dilution.cash_need || "N/A")],
        ["Warrants", str(dilution.warrant_exercise || "N/A")],
      ]
    : [];

  const hasWarrants = (detail?.inPlay?.warrants?.length ?? 0) > 0;
  const hasConvertibles = (detail?.inPlay?.convertibles?.length ?? 0) > 0;
  const hasDetailRail =
    Boolean(dilution) ||
    dilution?.offering_ability_desc != null ||
    hasWarrants ||
    hasConvertibles ||
    (detail?.offerings?.length ?? 0) > 0;

  useEffect(() => {
    if (!symForDetail || !hasDetailRail) {
      setSplits(null);
      setSplitsErr(null);
      setSplitsLoading(false);
      return;
    }
    const ac = new AbortController();
    setSplitsLoading(true);
    setSplitsErr(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/stock-splits/${encodeURIComponent(symForDetail)}`,
          { signal: ac.signal }
        );
        const j = (await res.json()) as { splits?: StockSplitRow[]; error?: string };
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        if (!ac.signal.aborted) setSplits(j.splits ?? []);
      } catch (e) {
        if (ac.signal.aborted) return;
        setSplits([]);
        setSplitsErr(e instanceof Error ? e.message : "Could not load splits");
      } finally {
        if (!ac.signal.aborted) setSplitsLoading(false);
      }
    })();
    return () => ac.abort();
  }, [symForDetail, hasDetailRail]);

  return (
    <div
      className="min-h-screen font-sans text-[15px]"
      style={{ backgroundColor: BG, color: FG }}
    >
      <AskEdgarWebModal url={aeModalUrl} onClose={() => setAeModalUrl(null)} />
      {/* Top bar */}
      <header
        className="flex flex-wrap items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: BORDER, backgroundColor: CARD }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-sm font-mono text-[#8b949e] shrink-0">TICKER:</span>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && goManual()}
            placeholder="SYM"
            className="w-24 px-2 py-1 rounded border bg-[#0d1117] text-[#e6edf3] border-[#30363d] font-mono text-sm"
          />
          <button
            type="button"
            onClick={goManual}
            className="px-3 py-1 rounded text-sm font-semibold text-[#0d1117]"
            style={{ backgroundColor: ACCENT }}
          >
            GO
          </button>
        </div>
        <h1
          className="text-lg font-semibold tracking-tight flex-1 text-center min-w-[200px]"
          style={{ color: ACCENT }}
        >
          Dilution Monitor
        </h1>
        <div className="flex items-center gap-2 justify-end flex-1 min-w-[200px]">
          <Link
            href="/top-gainers"
            className="text-xs font-mono px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-[#58a6ff]"
          >
            Classic table
          </Link>
          <Link
            href="/"
            className="text-xs font-mono px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-[#58a6ff]"
          >
            Home
          </Link>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-56px)]">
        {/* Left: top gainers */}
        <aside
          className="w-full lg:w-[320px] lg:min-w-[280px] lg:max-w-[380px] border-b lg:border-b-0 lg:border-r flex flex-col shrink-0"
          style={{ borderColor: BORDER, backgroundColor: BG }}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b"
            style={{ borderColor: BORDER }}
          >
            <span className="font-semibold text-sm tracking-wide" style={{ color: ACCENT }}>
              TOP GAINERS
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadGainers()}
                className="text-[#8b949e] hover:text-[#58a6ff] text-lg leading-none"
                title="Refresh"
              >
                ↻
              </button>
              <span className="text-xs font-mono text-[#8b949e]">
                {gainersLoading ? "…" : gainers.length}
              </span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-2 max-h-[40vh] lg:max-h-none lg:h-[calc(100vh-56px-40px)]">
            {gainersLoading && (
              <p className="text-sm text-[#8b949e] px-2">Loading…</p>
            )}
            {!gainersLoading && gainers.length === 0 && (
              <p className="text-sm text-[#8b949e] px-2">No gainers.</p>
            )}
            {gainers.map((g) => {
              const active = g.ticker === selected;
              const risk = g.askEdgar?.overallOfferingRisk || "";
              return (
                <button
                  key={g.ticker}
                  type="button"
                  onClick={() => setSelected(g.ticker)}
                  className="w-full text-left rounded border p-2 transition-colors"
                  style={{
                    backgroundColor: active ? ROW : CARD,
                    borderColor: active ? ACCENT : BORDER,
                    boxShadow: active ? `inset 3px 0 0 ${ACCENT}` : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold" style={{ color: ACCENT }}>
                      {g.ticker}
                    </span>
                    {risk ? (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${riskBadgeClass(risk)}`}
                      >
                        {risk}
                      </span>
                    ) : (
                      <span className="text-xs text-[#484f58]">—</span>
                    )}
                    <span className="font-mono text-emerald-400 text-sm ml-auto">
                      {g.changePct != null
                        ? `${g.changePct >= 0 ? "+" : ""}${g.changePct.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-mono text-[#8b949e] mt-1">
                    <span>{fmtPrice(g.price)}</span>
                    <span>Vol {fmtVol(g.volume)}</span>
                  </div>
                  {sublineByTicker[g.ticker] && (
                    <div className="text-[10px] font-mono text-[#6e7681] mt-1 truncate">
                      {sublineByTicker[g.ticker]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {gainersSource && (
            <p className="text-[10px] text-[#484f58] px-3 py-1 border-t" style={{ borderColor: BORDER }}>
              Movers: {gainersSource}
            </p>
          )}
        </aside>

        {/* Right: detail */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-5 xl:p-6 min-w-0">
          {!selected && (
            <p className="text-[#8b949e]">Select a ticker or type one and press GO.</p>
          )}
          {selected && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                <div>
                  <button
                    type="button"
                    onClick={() => openAskEdgarOrExternal(dilUrl)}
                    className="text-3xl font-bold hover:underline text-left block"
                    style={{ color: ACCENT }}
                  >
                    {selected}
                  </button>
                  {headerSub && (
                    <p className="text-sm font-mono text-[#8b949e] mt-2">{headerSub}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded ${historyBadgeClass(detail?.chartAnalysis || null)}`}
                  >
                    HISTORY: {historyLabel(detail?.chartAnalysis || null)}
                  </span>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded ${riskBadgeClass(str(dilution?.overall_offering_risk || "N/A"))}`}
                  >
                    RISK: {str(dilution?.overall_offering_risk || "N/A")}
                  </span>
                </div>
              </div>

              {detailLoading && (
                <p className="text-[#8b949e] mb-4">Loading Ask Edgar…</p>
              )}
              {detailErr && (
                <p className="text-[#f85149] mb-4 text-sm">{detailErr}</p>
              )}
              {detail?.meta?.rateLimited && (
                <p
                  className="text-[#d29922] mb-4 text-sm rounded border px-3 py-2"
                  style={{ borderColor: BORDER, backgroundColor: ROW }}
                >
                  Ask Edgar returned rate limiting (HTTP 429) on one or more requests. Wait a
                  minute and refresh or switch ticker. The dilution monitor loads several API
                  endpoints per symbol.
                </p>
              )}
              {detail?.meta?.authError && !detail?.meta?.rateLimited && (
                <p className="text-[#f85149] mb-4 text-sm">
                  Ask Edgar rejected the API key (401/403). Check{" "}
                  <code className="text-xs">ASKEDGAR_API_KEY</code> in Vercel for this project.
                </p>
              )}

              <div
                className={
                  hasDetailRail
                    ? "grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8 xl:items-start"
                    : "grid grid-cols-1 gap-6"
                }
              >
                <div className="min-w-0 space-y-6">
                  {/* News feed */}
                  <section>
                    <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                      News &amp; filings
                    </h2>
                    <div
                      className={
                        hasDetailRail
                          ? "grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-1"
                          : "grid grid-cols-1 gap-2 md:grid-cols-2"
                      }
                    >
                  {(detail?.newsFeed || []).map((item, idx) => {
                    const ft = str(item.form_type) || "news";
                    const h = newsHeadline(item);
                    const d = newsDate(item);
                    const url = str(item.url || item.document_url);
                    const long = ft === "grok" && h.length > 240 ? `${h.slice(0, 237)}…` : h;
                    const href = (url || dilUrl).trim() || dilUrl;
                    const useModal = isAskEdgarWebUrl(href);
                    const inner = (
                      <>
                        <div
                          className="w-14 shrink-0 flex items-center justify-center text-[10px] font-bold text-white px-1"
                          style={{ backgroundColor: stripeColor(ft) }}
                        >
                          {stripeLabel(ft)}
                        </div>
                        <div className="p-3 min-w-0 flex-1">
                          {d && (
                            <div className="text-xs font-mono text-[#8b949e] mb-1">{d}</div>
                          )}
                          <div className="text-sm text-[#e6edf3] leading-snug">{long}</div>
                        </div>
                      </>
                    );
                    if (useModal) {
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => openAskEdgarOrExternal(href)}
                          className="flex rounded border overflow-hidden hover:opacity-95 w-full text-left cursor-pointer"
                          style={{ borderColor: BORDER, backgroundColor: ROW }}
                        >
                          {inner}
                        </button>
                      );
                    }
                    return (
                      <a
                        key={idx}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex rounded border overflow-hidden hover:opacity-95"
                        style={{ borderColor: BORDER, backgroundColor: ROW }}
                      >
                        {inner}
                      </a>
                    );
                  })}
                  {!detailLoading && (detail?.newsFeed?.length ?? 0) === 0 && (
                    <p
                      className={`text-sm text-[#8b949e] ${hasDetailRail ? "md:col-span-2 xl:col-span-1" : "md:col-span-2"}`}
                    >
                      No recent items.
                    </p>
                  )}
                    </div>
                  </section>

                  {dilution?.mgmt_commentary && (
                    <section>
                      <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                        Management commentary
                      </h2>
                      <div
                        className="rounded border p-4 text-sm text-[#e6edf3] whitespace-pre-wrap"
                        style={{ borderColor: BORDER, backgroundColor: CARD }}
                      >
                        {str(dilution.mgmt_commentary)}
                      </div>
                    </section>
                  )}
                </div>

                {hasDetailRail && (
                  <div className="min-w-0 space-y-6">
              {/* Risk grid */}
              {dilution && (
                <section>
                  <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                    Risk metrics
                  </h2>
                  <button
                    type="button"
                    onClick={() => openAskEdgarOrExternal(dilUrl)}
                    className="grid grid-cols-2 gap-2 sm:gap-3 w-full text-left cursor-pointer"
                  >
                    {badgeItems.map(([label, level]) => (
                      <div
                        key={label}
                        className="rounded border p-2.5 sm:p-3"
                        style={{ borderColor: BORDER, backgroundColor: CARD }}
                      >
                        <div className="text-[10px] sm:text-xs text-[#8b949e] font-mono mb-1.5 sm:mb-2">
                          {label}
                        </div>
                        <div
                          className={`inline-block text-xs font-bold px-2 py-1 rounded ${riskBadgeClass(level)}`}
                        >
                          {level}
                        </div>
                      </div>
                    ))}
                  </button>
                </section>
              )}

              {/* Offering ability */}
              {dilution?.offering_ability_desc != null && (
                <section>
                  <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                    Offering ability
                  </h2>
                  <div
                    className="rounded border p-4 font-mono"
                    style={{ borderColor: BORDER, backgroundColor: CARD }}
                  >
                    {renderOfferingDesc(dilution.offering_ability_desc)}
                  </div>
                </section>
              )}

              {/* In play */}
              {((detail?.inPlay?.warrants?.length ?? 0) > 0 ||
                (detail?.inPlay?.convertibles?.length ?? 0) > 0) && (
                <section>
                  <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                    In play dilution
                  </h2>
                  <div
                    className={
                      hasWarrants && hasConvertibles
                        ? "grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-3"
                        : "space-y-3"
                    }
                  >
                    {hasWarrants && (
                      <div className="min-w-0">
                        <p className="text-xs text-[#d29922] font-mono font-bold mb-2">
                          WARRANTS
                        </p>
                        <div className="space-y-3">
                          {detail!.inPlay.warrants.map((w, i) => (
                            <div
                              key={i}
                              className="rounded border p-3 text-sm font-mono"
                              style={{ borderColor: BORDER, backgroundColor: CARD }}
                            >
                              <div className="text-[#e6edf3]">{str(w.details)}</div>
                              <div className="text-[#8b949e] mt-2 space-y-1">
                                <div>
                                  Remaining:{" "}
                                  <span className="text-emerald-400">
                                    {fmtM(w.warrants_remaining)}
                                  </span>{" "}
                                  · Strike:{" "}
                                  <span className="text-orange-300">
                                    ${str(w.warrants_exercise_price)}
                                  </span>
                                </div>
                                <div className="text-xs">Filed: {str(w.filed_at)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasConvertibles && (
                      <div className="min-w-0">
                        <p className="text-xs text-[#d29922] font-mono font-bold mb-2">
                          CONVERTIBLES
                        </p>
                        <div className="space-y-3">
                          {detail!.inPlay.convertibles.map((c, i) => (
                            <div
                              key={i}
                              className="rounded border p-3 text-sm font-mono"
                              style={{ borderColor: BORDER, backgroundColor: CARD }}
                            >
                              <div className="text-[#e6edf3]">{str(c.details)}</div>
                              <div className="text-[#8b949e] mt-2 text-xs">
                                Conv: ${str(c.conversion_price)} · Shares:{" "}
                                {fmtM(c.underlying_shares_remaining)} · {str(c.filed_at)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Recent offerings */}
              {(detail?.offerings?.length ?? 0) > 0 && (
                <section>
                  <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                    Recent offerings
                  </h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-mono">
                    {detail!.offerings.slice(0, 5).map((o, i) => (
                      <li
                        key={i}
                        className="border rounded p-2 min-w-0"
                        style={{ borderColor: BORDER, backgroundColor: CARD }}
                      >
                        {str(o.type || o.offering_type)} — {str(o.date || o.filed_at)} —{" "}
                        {str(o.summary || o.details).slice(0, 160)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h2 className="text-sm font-semibold mb-3" style={{ color: ACCENT }}>
                  Stock splits
                </h2>
                {splitsLoading && (
                  <p className="text-sm text-[#8b949e]">Loading…</p>
                )}
                {splitsErr && !splitsLoading && (
                  <p className="text-sm text-[#f85149]">{splitsErr}</p>
                )}
                {!splitsLoading && !splitsErr && (splits?.length ?? 0) === 0 && (
                  <p className="text-sm text-[#8b949e]">
                    No split events in the last three years.
                  </p>
                )}
                {(splits?.length ?? 0) > 0 && (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-mono">
                    {splits!.map((s, i) => (
                      <li
                        key={`${s.executionDate}-${s.ratioLabel}-${i}`}
                        className="border rounded p-2 min-w-0"
                        style={{ borderColor: BORDER, backgroundColor: CARD }}
                      >
                        <span className="text-[#e6edf3]">
                          {splitAdjustmentLabel(s.adjustmentType)}
                        </span>
                        <span className="text-[#8b949e]"> · {s.ratioLabel}</span>
                        <div className="text-xs text-[#8b949e] mt-1 tabular-nums">
                          {s.executionDate}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
