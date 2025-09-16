"use client";

type CriteriaProps = {
  result: any;
};

export default function Criteria({ result }: CriteriaProps) {
  const criteria = [
    { label: "Sudden volume spike", value: result.sudden_volume_spike },
    { label: "Sudden price spike", value: result.sudden_price_spike },
    { label: "Valuation fundamentals mismatch", value: result.valuation_fundamentals_mismatch },
    { label: "Reverse split", value: result.reverse_split },
    { label: "Dividend announced", value: result.dividend_announced },
    { label: "Promoted stock", value: result.promoted_stock },
    { label: "Dilution/offering filing", value: result.dilution_or_offering },
    { label: "Risky country (China/HK/Malaysia)", value: result.riskyCountry },
    { label: "Fraud evidence posted online", value: result.fraudEvidence }, // ✅ new
  ];

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h3 className="text-lg font-bold mb-2">✅ Criteria</h3>
      <div className="grid grid-cols-2 gap-2">
        {criteria.map((c, idx) => (
          <label key={idx} className="flex items-center space-x-2 text-sm">
            <input type="checkbox" checked={!!c.value} readOnly />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
