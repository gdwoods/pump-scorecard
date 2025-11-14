"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import ShortCheckUpload from "@/components/short-check/ShortCheckUpload";
import ShortCheckResults from "@/components/short-check/ShortCheckResults";
import DroppinessCard from "@/components/DroppinessCard";
import CombinedPumpRiskCard from "@/components/short-check/CombinedPumpRiskCard";
import Chart from "@/components/Chart";
import DroppinessScatter from "@/components/DroppinessChart";
import Fundamentals from "@/components/Fundamentals";
import Promotions from "@/components/Promotions";
import SecFilings from "@/components/SecFilings";
import NewsSection from "@/components/NewsSection";
import FraudEvidence from "@/components/FraudEvidence";
import BorrowDeskCard from "@/components/BorrowDeskCard";
import HistoryCard from "@/components/HistoryCard";
import PerformanceMonitor from "@/components/PerformanceMonitor";
import { ShortCheckResult, calculateShortRating } from "@/lib/shortCheckScoring";
import { ExtractedData } from "@/lib/shortCheckTypes";
import { saveScanToHistory } from "@/lib/history";

export default function ShortCheckPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ShortCheckResult | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string>("");
  const [pumpScorecardData, setPumpScorecardData] = useState<any>(null);
  const [manualFlags, setManualFlags] = useState<Record<string, boolean>>({});
  const [loadingPumpData, setLoadingPumpData] = useState(false);
  const [hasAnalyzedTicker, setHasAnalyzedTicker] = useState(false);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleUpload = async (file: File) => {
    console.log("Starting upload, file:", file.name, file.size, file.type);
    setIsLoading(true);
    setError(null);
    setResult(null);
    setExtractedData(null);
    setPumpScorecardData(null); // Reset pump data for new upload

    try {
      const formData = new FormData();
      formData.append("image", file);
      console.log("Sending request to /api/short-check");

      const response = await fetch("/api/short-check", {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", response.status, response.ok);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        console.error("API error:", errorData);
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log("Received data:", data);
      
      // Always set extracted data (even if partial) so manual entry can be pre-populated
      setExtractedData(data.extractedData || null);
      
      // Handle OCR failure gracefully - show manual entry with error message
      if (!data.success || data.error) {
        setError(data.error || "OCR processing failed. Please use manual entry below.");
        // Don't set result - let user use manual entry
        return;
      }
      
      // Show results if we got them (even with partial data)
      if (data.result) {
        setResult(data.result);
        if (data.extractedData?.ticker) {
          setTicker(data.extractedData.ticker);
        }
      } else {
        // If no result but we have extracted data, show manual entry option
        setError("OCR extracted some data but couldn't calculate a complete rating. Please review and use manual entry to complete.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async (data: ExtractedData) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/short-check", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ extractedData: data }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to calculate rating");
      }

      const responseData = await response.json();
      setExtractedData(responseData.extractedData);
      setResult(responseData.result);
      if (responseData.extractedData?.ticker) {
        setTicker(responseData.extractedData.ticker);
      }
    } catch (err) {
      console.error("Manual submit error:", err);
      setError(err instanceof Error ? err.message : "Failed to calculate rating");
    } finally {
      setIsLoading(false);
    }
  };

  // Save Short Check results to history when available
  // Use a ref to prevent duplicate saves in the same render cycle
  const historySavedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (ticker && result && extractedData) {
      // Create a key to identify this specific result to prevent duplicate saves
      const scanKey = `${ticker}-${result.rating.toFixed(1)}`;
      
      // Only save if we haven't saved this exact rating for this ticker in this session
      if (historySavedRef.current === scanKey) {
        return;
      }

      // Map Short Check result to history format
      const breakdown = result.scoreBreakdown;
      const factors = [
        { label: "Droppiness", value: breakdown.droppiness },
        { label: "Overall Risk", value: breakdown.overallRisk },
        { label: "Cash Need", value: breakdown.cashNeed },
        { label: "Offering Ability", value: breakdown.offeringAbility },
        { label: "Short Interest", value: breakdown.shortInterest },
        { label: "Historical Dilution", value: breakdown.historicalDilution },
        { label: "News Catalyst", value: breakdown.newsCatalyst },
        { label: "Float", value: breakdown.float },
        { label: "Price Spike", value: breakdown.priceSpike },
        { label: "Debt/Cash Ratio", value: breakdown.debtToCash },
        { label: "Institutional Ownership", value: breakdown.institutionalOwnership },
        { label: "Cash Runway", value: breakdown.cashRunway },
      ].filter(f => f.value !== 0);

      // Map category to verdict format
      const verdictMap: Record<string, 'Low risk' | 'Moderate risk' | 'High risk'> = {
        'No-Trade': 'Low risk',
        'Speculative Short Candidate': 'Moderate risk',
        'Moderate Short Candidate': 'Moderate risk',
        'High-Priority Short Candidate': 'High risk',
      };

      saveScanToHistory({
        ticker: ticker.toUpperCase(),
        score: result.rating,
        baseScore: result.rating,
        adjustedScore: result.rating,
        verdict: verdictMap[result.category] || 'Moderate risk',
        summary: `Short Check rating: ${result.rating.toFixed(1)}% - ${result.category}`,
        factors: factors,
        marketCap: extractedData.marketCap,
        price: undefined, // Price not available from DT screenshot extraction
        volume: undefined,
        droppinessScore: pumpScorecardData?.droppinessScore,
        fraudEvidence: pumpScorecardData?.fraudImages?.length > 0,
        promotions: (pumpScorecardData?.recentPromotions?.length || 0) > 0 || (pumpScorecardData?.olderPromotions?.length || 0) > 0,
        riskyCountry: undefined,
      });

      historySavedRef.current = scanKey;
      // Trigger history refresh
      setHistoryRefreshTrigger(prev => prev + 1);
    }
  }, [ticker, result, extractedData, pumpScorecardData]);

  // Fetch Pump Scorecard data when ticker is available
  // Also recalculate Short Check score when droppiness becomes available
  useEffect(() => {
    if (ticker && result && !loadingPumpData && !pumpScorecardData) {
      // Only fetch if we don't already have the data and aren't currently loading
      console.log('Fetching Pump Scorecard data for ticker:', ticker);
      setLoadingPumpData(true);
      fetch(`/api/scan/${ticker}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          console.log('Pump Scorecard data received:', Object.keys(data));
          setPumpScorecardData(data);
          
          // Recalculate Short Check score with droppiness if available
          if (extractedData && data.droppinessScore !== undefined) {
            console.log('Recalculating Short Check score with droppiness:', data.droppinessScore);
            const updatedResult = calculateShortRating(extractedData, data.droppinessScore);
            setResult(updatedResult);
          }
        })
        .catch((err) => {
          console.error("Failed to load Pump Scorecard data:", err);
          // Set error state so user knows something failed
          // If it's a 404, the ticker might be invalid - show a helpful message
          if (err.message?.includes('404') || err.message?.includes('not found')) {
            console.warn(`Ticker "${ticker}" may be invalid or not found`);
          }
        })
        .finally(() => {
          setLoadingPumpData(false);
        });
    }
    // Only re-run when ticker or result changes, not when extractedData changes
    // extractedData is set once from OCR and shouldn't trigger re-fetches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, result]);

  const toggleManualFlag = (key: string) => {
    setManualFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
              Short Check
            </h1>
            <p className="text-sm md:text-base text-gray-600 dark:text-gray-400 mt-1">
              Analyze dilution tracker screenshots for short trade opportunities
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            {(result || ticker || pumpScorecardData) && (
              <button
                onClick={() => {
                  setResult(null);
                  setExtractedData(null);
                  setTicker("");
                  setError(null);
                  setPumpScorecardData(null);
                  setManualFlags({});
                  setHasAnalyzedTicker(false);
                  // Scroll to top to show upload component
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                📄 Analyze Another Screenshot
              </button>
            )}
            <button
              onClick={() =>
                document.documentElement.classList.toggle("dark")
              }
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              🌓 Toggle Dark Mode
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <strong className="text-yellow-800 dark:text-yellow-300 block mb-1">OCR Unavailable</strong>
                <p className="text-yellow-700 dark:text-yellow-400 text-sm">{error}</p>
                <p className="text-yellow-700 dark:text-yellow-400 text-sm mt-2">
                  <strong>Tip:</strong> Click "Or enter data manually" below to input the data from your screenshot.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Component - Primary method */}
        {!result && (
          <>
            <ShortCheckUpload
              onUpload={handleUpload}
              isLoading={isLoading}
              extractedData={extractedData || undefined}
              onManualSubmit={handleManualSubmit}
            />
            
            {/* Divider with "OR" text */}
            <div className="relative flex items-center py-4">
              <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
              <span className="px-4 text-sm font-medium text-gray-500 dark:text-gray-400">OR</span>
              <div className="flex-1 border-t border-gray-300 dark:border-gray-600"></div>
            </div>

            {/* Ticker Input for Quick Analysis - Alternative method */}
            {!hasAnalyzedTicker && (
              <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Quick Ticker Analysis</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <strong>Don't have a screenshot?</strong> Enter a ticker symbol to view Droppiness and Pump Risk analysis without uploading an image.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 italic">
                      This option provides comprehensive market analysis but does not include Short Check scoring (which requires dilution tracker data from a screenshot).
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && ticker.trim()) {
                          setHasAnalyzedTicker(true);
                          setLoadingPumpData(true);
                          fetch(`/api/scan/${ticker}`)
                            .then((res) => res.json())
                            .then((data) => {
                              setPumpScorecardData(data);
                            })
                            .catch((err) => {
                              console.error("Failed to load Pump Scorecard data:", err);
                            })
                            .finally(() => {
                              setLoadingPumpData(false);
                            });
                        }
                      }}
                      placeholder="Enter ticker (e.g., AAPL)"
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      onClick={() => {
                        if (ticker.trim()) {
                          setHasAnalyzedTicker(true);
                          setLoadingPumpData(true);
                          fetch(`/api/scan/${ticker}`)
                            .then((res) => res.json())
                            .then((data) => {
                              setPumpScorecardData(data);
                            })
                            .catch((err) => {
                              console.error("Failed to load Pump Scorecard data:", err);
                            })
                            .finally(() => {
                              setLoadingPumpData(false);
                            });
                        }
                      }}
                      disabled={!ticker.trim()}
                      className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Analyze
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Short Check Results - Only show if we have a result */}
        {result && (
          <ShortCheckResults 
            result={result} 
            ticker={ticker} 
            extractedData={extractedData || undefined}
            pumpScorecardData={pumpScorecardData}
            onTickerChange={(newTicker) => {
              setTicker(newTicker);
              setHasAnalyzedTicker(true);
              setLoadingPumpData(true);
              fetch(`/api/scan/${newTicker}`)
                .then((res) => res.json())
                .then((data) => {
                  setPumpScorecardData(data);
                })
                .catch((err) => {
                  console.error("Failed to load Pump Scorecard data:", err);
                })
                .finally(() => {
                  setLoadingPumpData(false);
                });
            }}
          />
        )}

        {/* Droppiness Card - Show when we have ticker (with or without Short Check result) */}
        {ticker && pumpScorecardData?.droppinessScore !== undefined && (
          <DroppinessCard
            ticker={ticker.toUpperCase()}
            score={pumpScorecardData.droppinessScore}
            detail={pumpScorecardData.droppinessDetail || []}
            verdict={pumpScorecardData.droppinessVerdict || "No verdict available"}
          />
        )}

        {/* Droppiness Scatter Plot - Full Width */}
        {ticker && pumpScorecardData && !loadingPumpData && (
          <DroppinessScatter detail={pumpScorecardData.droppinessDetail || []} ticker={ticker} />
        )}

        {/* Additional Pump Scorecard Cards - Show when we have ticker data */}
        {ticker && pumpScorecardData && !loadingPumpData && (
          <>
            {/* Score Breakdown and Fundamentals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Fundamentals result={pumpScorecardData} />
              <SecFilings ticker={ticker} filings={pumpScorecardData.filings} />
            </div>

            {/* Price and Volume Chart - Full Width */}
            <Chart result={pumpScorecardData} />
          </>
        )}

        {/* Combined Pump Risk Card - Show when we have ticker (after charts) */}
        {ticker && (
          <>
            {loadingPumpData ? (
              <Card className="p-6 bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Loading Pump Risk analysis...
                </p>
              </Card>
            ) : (
              <CombinedPumpRiskCard
                ticker={ticker}
                pumpScorecardData={pumpScorecardData}
                manualFlags={manualFlags}
                toggleManualFlag={toggleManualFlag}
              />
            )}
          </>
        )}

        {/* Additional Pump Scorecard Cards - Show when we have ticker data */}
        {ticker && pumpScorecardData && !loadingPumpData && (
          <>

            {/* Promotions, Fraud Evidence, and News */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Promotions
                ticker={ticker}
                recentPromotions={pumpScorecardData.recentPromotions || []}
                olderPromotions={pumpScorecardData.olderPromotions || []}
              />
              <FraudEvidence
                ticker={ticker}
                fraudImages={pumpScorecardData.fraudImages || []}
              />
              <NewsSection ticker={ticker} items={pumpScorecardData.news || []} />
            </div>

            {/* Borrow Desk Card */}
            {pumpScorecardData.borrowData && (
              <BorrowDeskCard
                ticker={ticker.toUpperCase()}
                borrowData={pumpScorecardData.borrowData}
              />
            )}
          </>
        )}

        {/* History Card - Show when we have ticker (works independently of Pump Scorecard data) */}
        {ticker && (
          <HistoryCard ticker={ticker} refreshTrigger={historyRefreshTrigger} />
        )}

        {/* Performance Monitor */}
        <PerformanceMonitor />

        {/* Reset Button - Show when we have results or ticker analysis */}
        {(result || ticker || pumpScorecardData) && (
            <div className="text-center space-y-2">
              <button
                onClick={() => {
                  setResult(null);
                  setExtractedData(null);
                  setTicker("");
                  setError(null);
                  setPumpScorecardData(null);
                  setManualFlags({});
                  setHasAnalyzedTicker(false);
                  // Scroll to top to show upload component
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                Analyze Another Screenshot
              </button>
            </div>
        )}
      </div>
    </div>
  );
}
