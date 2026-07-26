# Spec Addendum — News Catalysts & Dilution Capacity

Amends `/api/fast/[ticker]` spec §4, §5, §7. Both of your challenges were correct;
the original spec was wrong on the first and silent on the second.

---

# Part A — News is the catalyst, filings are the confirmation

## A1. You're right about the causality

The typical microcap pump sequence:

```
07:00–08:30 ET   PR hits the wire (GlobeNewswire / ACCESSWIRE / PRNewswire)
07:05–09:30      premarket spike
     later       424B5 — they price an offering into the strength
    or never     no 8-K at all
```

**Most pump PRs never generate an 8-K.** Items 7.01 (Reg FD) and 8.01 (Other
Events) are voluntary for ordinary press releases. "Announces strategic
partnership," "receives order valued at up to $12M," "signs MOU" — none of that
requires a filing. So EDGAR-only catalyst detection misses the majority of what
actually moves these stocks, and misses it at exactly the moment you need it.

The 424B5 point from the original spec still stands — but it's a **confirmation**
that arrives after your entry window, not a detection mechanism. I had the two
roles conflated.

## A2. The general news endpoint is not adequate — measured

Queried `/v2/reference/news` for DFNS. Three articles returned, most recent
2026-04-16. **Neither July spike appears.** The feed is sparse-to-empty on
microcaps, which is precisely the universe you trade.

Also returned: an August 2021 GlobeNewswire item about *LGL Systems Acquisition
Corp / IronNet Cybersecurity* — a different company that previously held the DFNS
ticker. **Ticker recycling contaminates news history**, and on a name that's been
through a reverse merger it can be a large fraction of the results.

## A3. Source hierarchy

| Source | Latency | Microcap coverage | Notes |
|---|---|---|---|
| **Benzinga real-time** (`/benzinga/v2/news`) | seconds | good | Timestamped, full text, ticker-filtered. **403 on your current plan** — priced upgrade |
| Wire RSS direct (GlobeNewswire, ACCESSWIRE, Business Wire, PRNewswire) | seconds–1 min | very good | Free. Per-company feeds. Most microcap PRs originate here |
| Finnhub `company-news` | minutes | moderate | You already have the key |
| `/v2/reference/news` | hours–never | **poor** | Demonstrated above. Not viable as primary |
| Yahoo RSS | minutes–hours | poor | Already flagged |

**Recommendation:** wire RSS as primary — it's free, it's where the PRs actually
originate, and it beats every aggregator because it *is* the source. Poll the four
majors during premarket, filter by ticker, cache in KV. Benzinga is the paid
shortcut if you'd rather buy than build; price it against how many trades a missed
catalyst costs you.

Add `newsAgeMinutes` to the response. A catalyst 8 minutes old and one 8 hours old
are different trades.

## A4. Weasel-word classifier — encode your own distinctions

Your framework already draws the right lines and states them precisely:

> *"must be a real contract, not a letter of intent, or memorandum of understanding"*
> *"must be approval with immediate commercialization potential, not 'acceptance' or other fluffy PR terms"*

Those are **keyword-detectable distinctions**, which means the classification that
matters most runs in microseconds with no LLM. Two-list design — a hard term is
only fatal if no weasel term appears in the same headline:

```ts
const FATAL = [            // real repricing — do not short
  "fda approval","fda approves","receives approval","definitive agreement",
  "awarded contract","acquisition of","to be acquired","merger agreement",
  "revenue increased","earnings beat","raises guidance","phase 3 met",
];

const WEASEL = [           // fluff — ideal to short
  "acceptance","accepted for filing","letter of intent","loi","mou",
  "memorandum of understanding","non-binding","term sheet","up to $",
  "potential value","intends to","plans to","exploring","evaluating",
  "in discussions","strategic review","announces plans","signs agreement to explore",
];

const IDEAL = [            // your documented favourites
  "bitcoin treasury","crypto treasury","digital asset treasury",
  "private placement","registered direct","strategic investment",
  "ai partnership","quantum","blockchain initiative",
];
```

```
FATAL ∧ ¬WEASEL          → NO_TRADE          (real catalyst)
FATAL ∧ WEASEL           → REVIEW + flag     ("approval" + "acceptance" = fluff)
IDEAL                    → REVIEW + confirm
no news, move ≥30%       → REVIEW + "unexplained"
```

"Announces FDA **acceptance** of filing" and "receives FDA **approval**" differ by
one word and invert the trade. That's worth a string match.

**Caveat on DFNS specifically:** the April article reports Q1 revenue of $4.2M and
reaffirmed FY guidance of $26M. That's an operating business with real revenue —
which trips your own "major revenue/contract" disqualifier. Note also that the DT
screenshot's business description (Nukkleus, fintech/blockchain) is **stale and
wrong** for this company. The news feed carried the true story; the screenshot
didn't. That's an argument for news being load-bearing rather than supplementary.

---

# Part B — Dilution capacity without the DT screenshot

## B1. Honest answer: you lose fidelity, but the binding constraint is computable

DT's Offering Ability badge synthesizes effective shelf capacity, ATM status,
equity lines, warrants, convertibles, and baby-shelf eligibility. It's doing real
work and you can't fully reconstruct it in 1.5 seconds.

But the *dominant* constraint in your universe is a formula.

## B2. The baby shelf rule — the number that matters

Form S-3, General Instruction **I.B.6**: an issuer with public float under **$75M**
may sell no more than **one-third of public float** in primary offerings during any
trailing 12 months.

Effectively every name you trade is under $75M. So:

```
publicFloatValue   = float × price
babyShelfCapacity  = publicFloatValue / 3          (if publicFloatValue < 75e6)
trailing12moUsed   = Σ 424B5 takedowns, last 12 months
remainingCapacity  = babyShelfCapacity − trailing12moUsed
capacityQuarters   = remainingCapacity / quarterlyBurn
```

### Worked on DFNS

```
float × price          0.93M × $6.49        = $6.04M public float
under $75M → baby shelf applies
capacity               $6.04M / 3            = $2.01M  per 12 months
quarterly burn                                 $4.93M
                                             ─────────
capacity ÷ burn                              ≈ 12 days of runway
```

**Their entire annual shelf capacity funds about twelve days of operations.**

That is exactly why DT prints `Offering Ability: LOW` — and it's derived from three
numbers you already fetch, with no screenshot. It also converts W9 from a heuristic
into a mechanism: they cannot dilute their way out, the float is 0.93M shares, and
if a defense narrative catches a bid there is nothing to cap it.

**Important limit:** baby shelf caps *S-3 primary* offerings only. It does not
block an S-1 registered offering, or a PIPE/Reg D placement with later resale
registration. Both are slower and require willing counterparties, but they're
available. So low shelf capacity means *slow to dilute*, not *cannot dilute*.

## B3. What else is derivable from EDGAR

| DT component | Derivation | Cost |
|---|---|---|
| Baby shelf capacity | formula above | free — already have inputs |
| Effective shelf | S-3 filing + subsequent `EFFECT` | in submissions JSON |
| ATM program active | full-text search "At-The-Market Offering Agreement" / "ATM Sales Agreement" | `efts.sec.gov/LATEST/search-index`, ~500–1500ms |
| Equity line | counterparty names — White Lion, Lincoln Park, Yorkville, Tumim, Keystone | same full-text search |
| Recent takedowns | count 424B5 filings, trailing 12mo | in submissions JSON |
| Warrants / converts | 10-Q/10-K parsing | **too slow — this is what you lose** |

Derived badge:

```
HIGH    effective S-3 + ATM agreement detected + remaining capacity > 1 quarter burn
MEDIUM  shelf filed, not effective — or capacity 0.3–1 quarter burn
LOW     no effective shelf, or capacity < 0.3 quarter burn      ← DFNS
```

## B4. The resolution

**You don't need DT to say no. You need DT to say yes.**

Of the nine walk-aways, seven need no DT data at all — today's move, runner class,
borrow, droppiness, institutional ownership, market cap, and data completeness. W8
(runway) comes from the balance sheet. Only W9 needed offering ability, and B2
supplies it.

Since the fast path is designed never to bless a trade, it doesn't need the
component DT is best at. Keep the screenshot for Tier 3 — when you're actually
sizing, its badge synthesis is better than anything derived here, and by then the
extra seconds are free.

---

# Amendments to the spec

**§4 Tier 2** — add two calls, both in the existing parallel batch:

| # | Source | Call | Timeout |
|---|---|---|---|
| 7 | Wire RSS (cached poller) | KV read `news:{ticker}` | 200ms |
| 8 | SEC full-text | `efts.sec.gov/LATEST/search-index?q="at-the-market"&ciks={cik}` | 1200ms |

**§5** — retitle to *Filing classification (confirmation layer)* and add the note
that filings lag the PR.

**§6 Derived metrics** — add `babyShelfCapacity`, `capacityQuarters`,
`derivedOfferingAbility`, `newsClass`, `newsAgeMinutes`.

**§7 Walk-aways** — insert as new W3, ahead of the runner check (a real catalyst
kills the trade regardless of how clean the setup looks):

| # | Condition | Verdict |
|---|---|---|
| W3 | `newsClass === "FATAL"` (hard term, no weasel term) | `NO_TRADE` — real catalyst |

Rewrite W9 to use the derived value:

| # | Condition | Verdict |
|---|---|---|
| W9 | `float < 2e6` **and** `derivedOfferingAbility !== "HIGH"` | `NO_TRADE` — squeeze geometry |

**§8 Response schema** — extend:

```ts
news: {
  class: "FATAL" | "IDEAL" | "NEUTRAL" | "NONE";
  headline: string | null;
  ageMinutes: number | null;
  source: string | null;
  matchedTerms: { fatal: string[]; weasel: string[]; ideal: string[] };
  tickerRecycleWarning: boolean;      // pre-reverse-merger contamination
};
dilution: {
  publicFloatValue: number | null;
  babyShelfCapacity: number | null;
  capacityQuarters: number | null;
  derivedOfferingAbility: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  atmDetected: boolean | null;
  equityLineCounterparty: string | null;
};
```

**§10 Failure modes** — add:

- **Ticker recycling.** Filter news to items dated after the company's most recent
  reverse merger or name change. Demonstrated: 2021 LGL/IronNet items returned
  under DFNS. Set `tickerRecycleWarning` when publisher items predate the current
  entity.
- **Stale DT descriptions.** DT showed a Nukkleus fintech blurb for a defense
  company with $4.2M quarterly revenue. Never let the screenshot's narrative
  override live news.

---

# Revised build order

1. Config + types *(unchanged)*
2. **Wire RSS poller + KV cache** — moved up. This is now the highest-value single
   component, and it's free.
3. Weasel-word classifier + unit tests on real headlines.
4. Baby shelf calculation — three numbers you already fetch, and it recovers most
   of what the screenshot was providing.
5. Tier 2 fetchers, derived metrics, runner classification.
6. Walk-away chain with revised W3/W9.
7. Droppiness cache + nightly cron.
8. `fmt=text` → Gem.

Items 2–4 are new, and together they close both gaps you identified.
