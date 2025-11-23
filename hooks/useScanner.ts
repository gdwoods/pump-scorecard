import { useState, useEffect, useMemo, useCallback } from "react";
import { saveScanToHistory, getHistory, HISTORY_STORAGE_KEY } from "@/lib/history";
import { tickerCache, getTickerCacheKey, isCacheValid, getCachedData, setCachedData } from "@/lib/cache";
import { InsiderTransaction } from "@/utils/fetchInsiderTransactions";

export interface ScanResult {
    ticker: string;
    companyName: string;
    lastPrice: number | null;
    marketCap: number | null;
    sharesOutstanding: number | null;
    floatShares: number | null;
    avgVolume: number | null;
    latestVolume: number | null;
    shortFloat: number | null;
    insiderOwnership: number | null;
    institutionalOwnership: number | null;
    exchange: string;
    country: string;
    countrySource: string;
    splits: any[];
    high52Week: number | null;
    low52Week: number | null;
    companyProfile: any;
    history: any[];
    intraday: any[];
    filings: any[];
    promotions: any[];
    fraudImages: any[];
    droppinessScore: number;
    droppinessDetail: any[];
    droppinessVerdict: string;
    borrowData: any;
    weightedRiskScore: number;
    summaryVerdict: "Low risk" | "Moderate risk" | "High risk";
    summaryText: string;
    sudden_volume_spike: boolean;
    sudden_price_spike: boolean;
    dilution_offering: boolean;
    promoted_stock: boolean;
    fraud_evidence: boolean;
    risky_country: boolean;
    hasOptions: boolean;
    news: any[];
    recentPromotions?: any[];
    olderPromotions?: any[];
    sentiment: {
        score: number;
        bullish: number;
        bearish: number;
        messages: any[];
    } | null;
    insiderTransactions: InsiderTransaction[];
}

export function useScanner() {
    const [ticker, setTicker] = useState("");
    const [result, setResult] = useState<ScanResult | null>(null);
    const [manualFlags, setManualFlags] = useState<Record<string, boolean>>({});
    const [scoreLog, setScoreLog] = useState<{ label: string; value: number; color?: string; actualValue?: string | number }[]>([]);
    const [adjustedScore, setAdjustedScore] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

    // ---------------------
    // SCAN FUNCTION
    // ---------------------
    const scan = useCallback(async (tickerToScan?: string) => {
        const targetTicker = tickerToScan || ticker;
        if (!targetTicker) return;

        const cacheKey = getTickerCacheKey(targetTicker);

        // Check cache first
        if (isCacheValid(tickerCache, cacheKey)) {
            const cachedData = getCachedData(tickerCache, cacheKey);
            if (cachedData) {
                console.log('🚀 Using cached data for', targetTicker);
                setResult(cachedData as ScanResult);
                setManualFlags({});
                setTicker(""); // Clear input after successful cached scan
                return;
            }
        }

        setIsLoading(true);
        setResult(null); // Clear previous result to show skeleton
        try {
            console.log('🌐 Fetching fresh data for', targetTicker);
            const res = await fetch(`/api/scan/${targetTicker}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
            const json: ScanResult = await res.json();

            // ✅ Add human-readable droppiness commentary
            if (json.droppinessDetail?.length > 0) {
                const lastSpike = json.droppinessDetail.at(-1);
                if (lastSpike) {
                    json.summaryText += lastSpike.retraced
                        ? " The most recent spike faded quickly."
                        : " The most recent spike held up.";
                }
            }

            // ✅ Add verdict
            if (json.droppinessScore === 0 && !json.droppinessDetail?.length) {
                json.droppinessVerdict =
                    "No qualifying spikes were detected in the last 18 months — the stock has not shown pump-like behavior recently.";
            } else if (json.droppinessScore >= 70) {
                json.droppinessVerdict =
                    "Spikes usually fade quickly — most large moves retraced within a few sessions.";
            } else if (json.droppinessScore < 40) {
                json.droppinessVerdict =
                    "Spikes often hold — many large moves remained elevated after the initial run-up.";
            } else {
                json.droppinessVerdict =
                    "Mixed behavior — some spikes retraced quickly, while others held their gains.";
            }

            // ✅ Split promotions into recent vs older
            if (Array.isArray(json.promotions)) {
                const now = Date.now();
                const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
                json.recentPromotions = json.promotions.filter((p: { date: string }) => {
                    const dateMs = new Date(p.date).getTime();
                    return now - dateMs < THIRTY_DAYS;
                });
                json.olderPromotions = json.promotions.filter((p: { date: string }) => {
                    const dateMs = new Date(p.date).getTime();
                    return now - dateMs >= THIRTY_DAYS;
                });
            }

            setResult(json);
            setManualFlags({});

            // Cache the result
            setCachedData(tickerCache, cacheKey, json);

            // Save to history
            saveScanToHistory({
                ticker: targetTicker.toUpperCase(),
                score: json.weightedRiskScore || 0,
                baseScore: json.weightedRiskScore || 0,
                adjustedScore: json.weightedRiskScore || 0, // Will be updated by useEffect
                verdict: json.summaryVerdict as "Low risk" | "Moderate risk" | "High risk",
                summary: json.summaryText,
                factors: [], // Will be populated by useEffect
                marketCap: json.marketCap ?? undefined,
                price: json.lastPrice ?? undefined,
                volume: json.latestVolume ?? undefined,
                droppinessScore: json.droppinessScore,
                fraudEvidence: json.fraud_evidence,
                promotions: json.promoted_stock,
                riskyCountry: json.risky_country,
            });

            // Trigger history refresh
            setHistoryRefreshTrigger(prev => prev + 1);

            // Clear input after successful scan
            setTicker("");
        } catch (err) {
            console.error("❌ Scan error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [ticker]);

    // ---------------------
    // DEBOUNCED SEARCH
    // ---------------------
    const debouncedScan = useMemo(
        () => {
            let timeoutId: NodeJS.Timeout;
            return (tickerVal: string) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    if (tickerVal.trim()) {
                        // We need to pass the ticker value directly to scan because state update might not have happened yet
                        // But scan uses 'ticker' state by default. 
                        // Let's modify scan to accept an optional argument.
                        scan(tickerVal);
                    }
                }, 500); // 500ms delay
            };
        },
        [scan]
    );

    // ---------------------
    // TOGGLE MANUAL FLAG
    // ---------------------
    const toggleManualFlag = (key: string) => {
        setManualFlags((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // ---------------------
    // SCORE CALCULATION
    // ---------------------
    useEffect(() => {
        if (!result) return;

        let score = result?.weightedRiskScore ?? 0;
        const log: { label: string; value: number; color?: string; actualValue?: string | number; explanation?: string }[] = [];

        // --- Base model (only once)
        log.push({
            label: "Base model risk",
            value: score,
            color: "text-gray-400 italic",
            explanation: "Initial risk assessment based on volume spikes, price action, and SEC filings."
        });

        // --- Auto fundamentals
        if (result?.marketCap && result.marketCap < 50_000_000) {
            score += 10;
            const marketCapFormatted = result.marketCap >= 1_000_000
                ? `$${(result.marketCap / 1_000_000).toFixed(1)}M`
                : `$${(result.marketCap / 1_000).toFixed(0)}K`;
            log.push({
                label: "Microcap (<$50M)",
                value: 10,
                color: "text-red-400",
                actualValue: marketCapFormatted,
                explanation: "Microcap stocks are easier to manipulate due to low liquidity and lower regulatory scrutiny."
            });
        }

        if (result?.shortFloat && result.shortFloat > 20) {
            score += 10;
            log.push({
                label: "High short float (>20%)",
                value: 10,
                color: "text-red-400",
                actualValue: `${result.shortFloat.toFixed(1)}%`,
                explanation: "High short interest can fuel a short squeeze, a common tactic in pump-and-dump schemes."
            });
        }

        if (result?.insiderOwnership && result.insiderOwnership > 50) {
            score += 5;
            log.push({
                label: "High insider ownership (>50%)",
                value: 5,
                color: "text-red-400",
                actualValue: `${result.insiderOwnership.toFixed(1)}%`,
                explanation: "Concentrated ownership makes it easier for insiders to control supply and execute a pump."
            });
        }

        // --- Droppiness behavior
        if (result?.droppinessScore !== undefined && result.droppinessScore < 40) {
            score += 10;
            log.push({
                label: "Spikes hold (risky behavior)",
                value: 10,
                color: "text-red-400",
                actualValue: `${result.droppinessScore.toFixed(0)}`,
                explanation: "History shows price spikes tend to sustain, which can trap shorts before a dump."
            });
        } else if (result?.droppinessScore !== undefined && result.droppinessScore > 70) {
            score -= 5;
            log.push({
                label: "Spikes fade quickly (less risky)",
                value: -5,
                color: "text-green-400",
                actualValue: `${result.droppinessScore.toFixed(0)}`,
                explanation: "History shows price spikes usually retrace quickly, suggesting less organized support."
            });
        }

        // --- Promotions (<30 days)
        if (result?.recentPromotions && result.recentPromotions.length > 0) {
            score += 15;
            log.push({
                label: "Recent promotion (<30d)",
                value: 15,
                color: "text-red-400",
                actualValue: `${result.recentPromotions.length} found`,
                explanation: "Active paid stock promotion is the strongest signal of a pump-and-dump scheme."
            });
        }

        // --- Social Sentiment
        if (result?.sentiment && result.sentiment.score > 60) {
            score += 10;
            log.push({
                label: "High Bullish Sentiment",
                value: 10,
                color: "text-red-400",
                actualValue: `${result.sentiment.score} / 100`,
                explanation: "Unusually high bullish sentiment on social media can indicate a coordinated pumping effort."
            });
        }

        // --- Manual flags
        if (manualFlags.pumpSuspicion) {
            score += 15;
            log.push({
                label: "Pump suspicion (manual)",
                value: 15,
                color: "text-red-400",
                explanation: "User-flagged suspicion of pump activity."
            });
        }

        if (manualFlags.thinFloat) {
            score += 10;
            log.push({
                label: "Thin float (manual)",
                value: 10,
                color: "text-red-400",
                explanation: "User-flagged thin float (low supply available for trading)."
            });
        }

        if (manualFlags.insiders) {
            score += 10;
            log.push({
                label: "Shady insiders (manual)",
                value: 10,
                color: "text-red-400",
                explanation: "User-flagged suspicious insider activity or history."
            });
        }

        if (manualFlags.other) {
            score += 5;
            log.push({
                label: "Other red flag (manual)",
                value: 5,
                color: "text-red-400",
                explanation: "User-flagged miscellaneous risk factor."
            });
        }

        // --- Clamp to 0–100
        score = Math.max(0, Math.min(score, 100));

        // ✅ Add only one summary line
        log.push({
            label: "Final adjusted score",
            value: score,
            color: "text-gray-300 font-semibold",
            explanation: "The final risk score (0-100) after all adjustments."
        });

        setAdjustedScore(score);
        setScoreLog(log);

        // Update the most recent scan in history with final adjusted score and factors
        if (result && log.length > 0) {
            try {
                const history = getHistory();
                const mostRecentScan = history.find(scan =>
                    scan.ticker.toUpperCase() === (result.ticker || "").toUpperCase() &&
                    Date.now() - scan.timestamp < 30000 // Within last 30 seconds
                );

                if (mostRecentScan) {
                    mostRecentScan.adjustedScore = score;
                    mostRecentScan.factors = log;
                    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
                }
            } catch (error) {
                console.error('Failed to update scan history:', error);
            }
        }
    }, [result, manualFlags]);

    return {
        ticker,
        setTicker,
        result,
        manualFlags,
        scoreLog,
        adjustedScore,
        isLoading,
        historyRefreshTrigger,
        scan,
        debouncedScan,
        toggleManualFlag
    };
}
