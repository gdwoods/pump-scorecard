import riskWeightsDefault from "@/config/riskWeights.json";

export async function loadRiskWeights() {
  try {
    // Try to load dynamically in dev or serverless
    const response = await fetch("/config/riskWeights.json");
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    return riskWeightsDefault;
  } catch (err) {
    console.error("⚠️ Failed to load riskWeights.json, using defaults:", err);
    return riskWeightsDefault;
  }
}
