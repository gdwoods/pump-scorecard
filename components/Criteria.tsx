"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/Card";

type CriteriaProps = {
  result: any;
};

const autoCriteriaList = [
  { key: "sudden_volume_spike", label: "sudden volume spike" },
  { key: "sudden_price_spike", label: "sudden price spike" },
  { key: "valuation_fundamentals_mismatch", label: "valuation fundamentals mismatch" },
  { key: "reverse_split", label: "reverse split" },
  { key: "dividend_announced", label: "dividend announced" },
  { key: "promoted_stock", label: "promoted stock" },
  { key: "dilution_or_offering", label: "dilution/offering filing" },
  { key: "riskyCountry", label: "risky country (China/HK/Malaysia)" },
];

const manualCriteriaList = [
  { key: "impersonated_advisors", label: "impersonated advisors" },
  { key: "guaranteed_returns", label: "guaranteed returns" },
  { key: "regulatory_alerts", label: "regulatory alerts" },
];

export default function Criteria({ result }: CriteriaProps) {
  return (
    <Card>
      <CardContent>
        <h3 className="text-lg font-bold">✅ Auto Criteria</h3>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {autoCriteriaList.map(({ key, label }) => (
            <label key={key}>
              <input type="checkbox" checked={!!result[key]} readOnly /> {label}
            </label>
          ))}
        </div>

        <h3 className="text-lg font-bold">✍️ Manual Criteria</h3>
        <div className="grid grid-cols-2 gap-2">
          {manualCriteriaList.map(({ key, label }) => (
            <label key={key}>
              <input type="checkbox" checked={!!result[key]} readOnly /> {label}
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
