import { calculateShortRating } from "../lib/shortCheckScoring";
import { normalizeShareCount } from "../lib/normalizeShares";
import { T } from "../lib/config/thresholds";

const base = {
  ticker: "TEST",
  confidence: 1,
  newsStatus: "none" as const,
  recentNews: "None",
  borrowAvailable: true,
  hasActualDebtData: true,
  debt: 1e6,
  priceSpikePct: 40,
  outstandingShares3YearsAgo: 10e6,
};

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

assert(normalizeShareCount(5) === 5_000_000, "normalize millions");

const high = calculateShortRating(
  {
    ...base,
    cashRunway: 3,
    quarterlyBurnRate: -2e6,
    cashOnHand: 2e6,
    atmShelfStatus: "ATM Active",
    outstandingShares: 50e6,
    float: 40e6,
    institutionalOwnership: 5,
    shortInterest: 2,
    marketCap: 30e6,
  },
  { score: 80, spikeCount: 5 }
);
assert(high.rating <= 100, "rating <= 100: " + high.rating);
assert(
  high.category === "High-Priority Short Candidate",
  "high category: " +
    high.category +
    " rating=" +
    high.rating +
    " flags=" +
    high.walkAwayFlags.join("|") +
    " completeness=" +
    high.dataCompleteness
);

const qure = calculateShortRating(
  {
    ...base,
    ticker: "QURE",
    cashRunway: 4,
    quarterlyBurnRate: -2e6,
    cashOnHand: 3e6,
    atmShelfStatus: "ATM Active",
    outstandingShares: 50e6,
    float: 40e6,
    institutionalOwnership: 5,
    shortInterest: 2,
    marketCap: 30e6,
  },
  { score: 0, spikeCount: 4 }
);
assert(qure.category === "No-Trade", "QURE no-trade: " + qure.category);
assert(
  qure.walkAwayFlags.some((f) => f.includes("Droppiness")),
  "QURE droppiness flag"
);

const unverified = calculateShortRating(
  {
    ...base,
    cashRunway: 3,
    quarterlyBurnRate: -2e6,
    cashOnHand: 2e6,
    atmShelfStatus: "ATM Active",
    outstandingShares: 50e6,
    float: 40e6,
    institutionalOwnership: 5,
    shortInterest: 2,
    marketCap: 30e6,
  },
  { score: 80, spikeCount: 2 }
);
assert(unverified.droppinessStatus === "UNVERIFIED", "unverified status");
assert(
  unverified.category !== "High-Priority Short Candidate",
  "capped category: " + unverified.category
);

const trap = calculateShortRating(
  {
    ...base,
    float: 0.9,
    atmShelfStatus: "dt:Green",
    cashRunway: 4,
    quarterlyBurnRate: -2e6,
    cashOnHand: 3e6,
    outstandingShares: 5,
    institutionalOwnership: 5,
    shortInterest: 2,
    marketCap: 10e6,
  },
  { score: 80, spikeCount: 5 }
);
assert(
  trap.walkAwayFlags.some((f) => f.includes("TRAP_RISK")),
  "trap risk: " + trap.walkAwayFlags.join("; ")
);

const borrow = calculateShortRating(
  {
    ...base,
    borrowAvailable: false,
    cashRunway: 3,
    quarterlyBurnRate: -2e6,
    cashOnHand: 2e6,
    atmShelfStatus: "ATM Active",
    float: 40e6,
    outstandingShares: 50e6,
    institutionalOwnership: 5,
    shortInterest: 2,
    marketCap: 30e6,
  },
  { score: 80, spikeCount: 5 }
);
assert(borrow.walkAwayFlags.includes("Borrow unavailable"), "borrow flag");

const missing = calculateShortRating({ ticker: "MISS", confidence: 1 });
assert(missing.scoreBreakdown.newsCatalyst === 0, "missing news = 0");
assert(
  missing.dataCompleteness < T.dataQuality.minCompleteness,
  "low completeness"
);

const scalp = calculateShortRating(
  {
    ...base,
    cashRunway: 2,
    quarterlyBurnRate: -2e6,
    cashOnHand: 1e6,
    priceSpikePct: 150,
    marketCap: 80e6,
    atmShelfStatus: "ATM Active",
    float: 5e6,
    institutionalOwnership: 5,
    shortInterest: 2,
  },
  { score: 80, spikeCount: 5 }
);
assert(scalp.category === "No-Trade", "no scalp override");

console.log(failed === 0 ? "\nALL ASSERTIONS PASSED" : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
