"use client";

import { Button } from "@/components/ui/button";

interface ScoringGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScoringGuideModal({ isOpen, onClose }: ScoringGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              📊 How Short Check Scoring Works
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="space-y-6 text-sm text-gray-700 dark:text-gray-300">
            <div>
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">
                Overview
              </h3>
              <p>
                Short Check calculates a rating from 0-100% by analyzing multiple factors that indicate 
                a stock's vulnerability to short selling. Higher scores indicate better short setup opportunities. 
                The rating is based on a maximum possible score that varies depending on data availability.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">
                Scoring Categories
              </h3>
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-3">
                  <strong>Droppiness (-8 to +12):</strong> Measures how quickly price spikes fade after major moves. 
                  High droppiness (70+) = spikes fade quickly = favorable for shorting (+12). 
                  Low droppiness (&lt;40) = spikes hold = risky (-8).
                </div>
                
                <div className="border-l-4 border-red-500 pl-3">
                  <strong>Overall Risk (0-10):</strong> Combines multiple risk indicators including cash position, 
                  dilution mechanisms, and market structure. High risk = +10.
                </div>
                
                <div className="border-l-4 border-orange-500 pl-3">
                  <strong>Cash Need (0-25):</strong> Companies with &lt;3 months runway and high burn rates score higher. 
                  Extreme cash need = +25.
                </div>
                
                <div className="border-l-4 border-orange-500 pl-3">
                  <strong>Cash Runway (-10 to +15):</strong> Short runway (&lt;6 months) scores +15. 
                  Positive cash flow = penalty (-10).
                </div>
                
                <div className="border-l-4 border-red-500 pl-3">
                  <strong>Offering Ability (-30 to +25):</strong> Active dilution tools (ATM, S-1, Equity Line) score +25. 
                  No dilution capability can score -30 when combined with low overhead supply.
                </div>
                
                <div className="border-l-4 border-yellow-500 pl-3">
                  <strong>Institutional Ownership (-5 to +5):</strong> Low ownership (&lt;10%) scores +5. 
                  High ownership (≥75%) scores -5 and triggers walk-away flag.
                </div>
                
                <div className="border-l-4 border-orange-500 pl-3">
                  <strong>Float (-10 to +10):</strong> Very low float (&lt;500K) scores +10. 
                  Large float (&gt;20M) scores 0. Can be negative with green offering.
                </div>
                
                <div className="border-l-4 border-orange-500 pl-3">
                  <strong>Short Interest (-5 to +15):</strong> Very low short interest (&lt;3%) scores +15. 
                  Extremely high (&gt;30%) scores -5.
                </div>
                
                <div className="border-l-4 border-yellow-500 pl-3">
                  <strong>Historical Dilution (0-10):</strong> Significant O/S increases over 3 years score higher. 
                  High dilution history = +10.
                </div>
                
                <div className="border-l-4 border-yellow-500 pl-3">
                  <strong>Debt/Cash Ratio (0-10):</strong> High debt relative to cash scores higher. 
                  Debt &gt;2x cash = +10.
                </div>
                
                <div className="border-l-4 border-orange-500 pl-3">
                  <strong>Price Spike (0-10):</strong> Recent spikes ≥20% score +10. 
                  No spike = 0.
                </div>
                
                <div className="border-l-4 border-blue-500 pl-3">
                  <strong>News Catalyst (-10 to +15):</strong> Recent bullish news (within 7 days) scores 0 and triggers walk-away. 
                  Dilution filings score +10. No significant news = +15.
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">
                Rating Categories
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <strong>High-Priority Short Candidate (70-100%):</strong> Strong setup with multiple risk factors aligned.
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  <strong>Moderate Short Candidate (40-69%):</strong> Good setup with notable risk factors.
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <strong>Speculative Short Candidate (20-39%):</strong> Some risk factors present but less compelling.
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <strong>No-Trade (&lt;20%):</strong> Not a good short setup based on available factors.
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">
                Walk-Away Flags
              </h3>
              <p>
                Certain conditions automatically set the rating to 0% (No-Trade), regardless of other factors:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Cash runway ≥24 months</li>
                <li>Positive cash flow</li>
                <li>Institutional ownership ≥75%</li>
                <li>Strong positive news catalyst (recent bullish news)</li>
                <li>Market cap &gt;$100M with adequate runway</li>
                <li>Green Offering + Green Overhead Supply</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">
                Important Notes
              </h3>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Scores can be negative for some categories (e.g., Offering Ability, Cash Runway)</li>
                <li>Maximum possible score adjusts based on data availability (typically 150-162)</li>
                <li>The final rating is a percentage: (Total Score / Max Possible Score) × 100</li>
                <li>Click the ℹ️ icon next to each category in the breakdown for specific explanations</li>
                <li>Droppiness data loads asynchronously and will update the score when available</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={onClose}>Got it</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

