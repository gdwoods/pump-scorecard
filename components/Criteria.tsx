"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";

export default function Criteria({
  result,
  onManualChange,
}: {
  result: any;
  onManualChange: (manual: any) => void;
}) {
  const [manual, setManual] = useState({
    impersonated_advisors: result.impersonated_advisors || false,
    guaranteed_returns: result.guaranteed_returns || false,
    regulatory_alerts: result.regulatory_alerts || false,
  });

  // Notify parent whenever manual flags change
  useEffect(() => {
    onManualChange(manual);
  }, [manual]);

  const autoCriteria = [
    { label: "Sudden volume spike", key: "sudden_volume_spike" },
    { label: "Sudden price spike", key: "sudden_price_spike" },
    { label: "Valuation fundamentals mismatch", key: "valuation_fundamentals_mismatch" },
    { label: "Reverse split", key: "reverse_split" },
    { label: "Dividend announced", key: "dividend_announced" },
    { label: "Promoted stock", key: "promoted_stock" },
    { label: "Dilution/offering filing", key: "dilution_or_offering" },
    { label: "Risky country (China/HK/Malaysia)", key: "riskyCountry" },
    { label: "Fraud evidence posted online", key: "fraudEvidence" },
  ];

  const manualCriteria = [
    { label: "Impersonated advisors", key: "impersonated_advisors" },
    { label: "Guaranteed returns", key: "guaranteed_returns" },
    { label: "Regulatory alerts", key: "regulatory_alerts" },
  ];

  function toggleManual(key: keyof typeof manual) {
    setManual((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <Card>
      <CardContent>
        <h2 className="text-lg font-semibold mb-3">✅ Criteria</h2>

        {/* Auto criteria */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
          {autoCriteria.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!result[c.key]}
                readOnly
                className="w-4 h-4"
              />
              {c.label}
            </label>
          ))}
        </div>

        {/* Manual flags */}
        <h3 className="text-md font-semibold mb-2">✍️ Manual Flags</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {manualCriteria.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={manual[c.key as keyof typeof manual]}
                onChange={() => toggleManual(c.key as keyof typeof manual)}
                className="w-4 h-4"
              />
              {c.label}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
