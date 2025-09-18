"use client";

interface Props {
  result: any;
  manualFlags: Record<string, boolean>;
  toggleManualFlag: (key: string) => void;
}

export default function Criteria({ result, manualFlags, toggleManualFlag }: Props) {
  // Auto-detected criteria from backend
  const autoCriteria = [
    ["Sudden volume spike", result?.sudden_volume_spike],
    ["Sudden price spike", result?.sudden_price_spike],
    ["Valuation mismatch", result?.valuation_fundamentals_mismatch],
    ["Reverse split", result?.reverse_split],
    ["Dilution/offering filing", result?.dilution_offering],
    ["Promoted stock", result?.promoted_stock],
    ["Fraud evidence posted online", result?.fraud_evidence],
    ["Risky country (China/HK/Malaysia)", result?.risky_country],
  ];

  // Manual user-selected criteria
  const manualCriteria = [
    ["Pump suspicion", "pumpSuspicion"],
    ["Thin float risk", "thinFloat"],
    ["Shady insiders", "insiders"],
    ["Other red flag", "other"],
  ];

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h2 className="text-lg font-semibold mb-3">✅ Criteria</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {autoCriteria.map(([label, val], idx) => (
          <label key={idx} className="flex items-center space-x-2">
            <input type="checkbox" checked={!!val} readOnly disabled />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <h3 className="text-md font-semibold mt-4 mb-2">📝 Manual Checks</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {manualCriteria.map(([label, key]) => (
          <label key={key} className="flex items-center space-x-2">
      <input
  type="checkbox"
  checked={!!manualFlags[key]}   // 👈 force boolean
  onChange={() => toggleManualFlag(key)}
/>

            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
