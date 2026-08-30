/**
 * @deprecated Legacy Pump Scorecard headline heuristic. Do not use for new UI or
 * trading decisions — prefer Fast Verdict, Short Check rating, and Capital Pressure.
 * Kept on `/api/scan` for backward compatibility only.
 */
export type LegacyRiskInputs = {
  suddenVolumeSpike: boolean;
  suddenPriceSpike: boolean;
  dilutionOffering: boolean;
  riskyCountry: boolean;
};

export type LegacyRiskResult = {
  /** @deprecated */
  weightedRiskScore: number;
  /** @deprecated */
  summaryVerdict: "Low risk" | "Moderate risk" | "High risk";
  /** @deprecated */
  summaryText: string;
};

export function computeLegacyWeightedRiskScore(
  inputs: LegacyRiskInputs
): LegacyRiskResult {
  let weightedRiskScore = 0;
  if (inputs.suddenVolumeSpike) weightedRiskScore += 20;
  if (inputs.suddenPriceSpike) weightedRiskScore += 20;
  if (inputs.dilutionOffering) weightedRiskScore += 20;
  if (inputs.riskyCountry) weightedRiskScore += 15;
  if (weightedRiskScore < 0) weightedRiskScore = 0;

  let summaryVerdict: LegacyRiskResult["summaryVerdict"] = "Low risk";
  if (weightedRiskScore >= 70) summaryVerdict = "High risk";
  else if (weightedRiskScore >= 40) summaryVerdict = "Moderate risk";

  const summaryText =
    summaryVerdict === "Low risk"
      ? "Legacy scan: few automatic pump-style flags detected."
      : summaryVerdict === "Moderate risk"
        ? "Legacy scan: some automatic flags — use Short Check / Fast Verdict for decisions."
        : "Legacy scan: multiple automatic flags — still prefer Framework 3.0 screens.";

  return { weightedRiskScore, summaryVerdict, summaryText };
}
