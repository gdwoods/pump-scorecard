import React, { useRef, useState } from "react";
// ... other imports
import Criteria from "@/components/Criteria";
import RiskPill from "@/components/RiskPill";
import { Card, CardContent } from "@/components/ui/Card";

export default function Page() {
  const [ticker, setTicker] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [manualCriteria, setManualCriteria] = useState<Record<string, boolean>>({});
  const reportRef = useRef<HTMLDivElement>(null);

  const scan = async () => {
    if (!ticker.trim()) return;
    const res = await fetch(`/api/scan/${ticker}`, { cache: "no-store" });
    const json = await res.json();
    setResult(json);
    setManualCriteria({}); // reset manual on new scan
  };

  // 🔥 Adjusted risk scores with manual criteria
  const adjustedFlatScore = (() => {
    if (!result) return 0;
    const autoScore = result.flatRiskScore ?? 0;
    const manualCount = Object.values(manualCriteria).filter(Boolean).length;
    // each manual criteria adds 10% risk
    return Math.min(100, autoScore + manualCount * 10);
  })();

  const adjustedWeightedScore = (() => {
    if (!result) return 0;
    const base = result.weightedRiskScore ?? 0;
    const manualCount = Object.values(manualCriteria).filter(Boolean).length;
    return Math.min(100, base + manualCount * 10);
  })();

  return (
    <div className="p-6 space-y-6">
      {/* Header ... */}

      {result && (
        <div ref={reportRef} className="space-y-6">
          <Card>
            <CardContent>
              <h2 className="text-xl font-bold">
                {result.companyName || "Unknown"} ({result.ticker})
              </h2>
              <p>
                Last price: $
                {result.last_price ? result.last_price.toFixed(2) : "N/A"} | Volume:{" "}
                {result.latest_volume ? result.latest_volume.toLocaleString() : "N/A"}
              </p>
              <p>
                Flat Risk Score: <RiskPill score={adjustedFlatScore} />
              </p>
              <p>
                Weighted Risk Score: <RiskPill score={adjustedWeightedScore} />
              </p>
            </CardContent>
          </Card>

          {/* Combined Verdict + Summary */}
          <Card>
            <CardContent>
              <h3 className="text-lg font-bold">🧠 Final Verdict</h3>
              <p>{result.summaryVerdict}</p>
              <p className="text-sm text-gray-700 mt-2">{result.summaryText}</p>
            </CardContent>
          </Card>

          {/* Criteria */}
          <Criteria result={result} onManualChange={setManualCriteria} />

          {/* Other Sections */}
          {/* Fundamentals, Chart, Promotions, SecFilings... */}
        </div>
      )}
    </div>
  );
}
