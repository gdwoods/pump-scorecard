# Short Selling Framework 3.0

**Replaces:** Framework 2.1 (Dec 2025) and The "Grinder" Warning — both retired.
**Companion:** Halted Stocks Playbook (Marc's 3-entry system), maintained separately.
**Account basis:** $40,000.
**Revised:** July 2026.

---

## 0. How to use this document

**This document contains no screening thresholds.** Market cap ceilings, cash
runway limits, ownership caps, droppiness cutoffs — all of it lives in
`lib/config/thresholds.ts` and is enforced by `/api/fast/[ticker]`. The document
names gates; the config sets numbers.

That separation exists because version 2.1 stated four different market-cap
ceilings across four sections. A threshold maintained in prose *and* in code will
drift, and you will unconsciously use whichever is convenient.

Risk and sizing numbers **are** in this document, because they are execution rules
that exist nowhere in the code.

---

## 1. Precedence

Three systems can speak. When they disagree, this order settles it.

| Rank | Authority | Owns |
|---|---|---|
| 1 | **Vetoes** (§2) | Absolute. Nothing overrides a veto. |
| 2 | **Fast endpoint walk-aways** | Deterministic kills. Score cannot appeal them. |
| 3 | **This document** | Process, execution, risk, management. |
| 4 | **Short Check score** | Informs. Never authorizes. |
| 5 | **LLM judgment** (Gem / Catalyst Reader) | Advisory on the survivors only. |

Two rules that make this real:

**A score is not permission.** A 92% rating means "no disqualifier found," not
"take it." Nothing in this stack is allowed to output "take this trade" — that
decision is yours and it happens after everything above has declined to kill it.

**Override is asymmetric.** You may always decline a trade the system likes. You
may **never** take a trade the system vetoes. If you believe a veto is wrong, log
it, skip the trade, and change the rule afterward with evidence. Not during.

---

## 2. The veto set

Run these first. Any hit ends the analysis. There is no smaller-size version of a
vetoed trade.

### V1 — Droppiness failure
Droppiness below the config floor, with a valid sample. Spikes on this name have
historically *held*. Your entire edge is the opposite pattern.

If fewer than three spikes exist in the window, droppiness is **UNVERIFIED**, not
neutral — absence of evidence is not evidence. Unverified caps your conviction; it
does not clear the gate.

### V2 — Grinder
A controlled 45° climb rather than a vertical spike. Diagnostic signs:

- No volatility halts despite a 50–100% move
- Price rides VWAP or the 9-EMA and bounces off it every touch
- Pullbacks come on *disappearing* volume; rallies come on *rising* volume
- Barbed-wire 1-minute candles — overlapping, wicky, no clean range bars
- Absorption at a round number: hits $3.00, pulls back 5¢, hits it again, pulls
  back 3¢, hits it again

Three or more = veto. Grinders don't crash, they fade — shorting one is death by a
thousand cuts.

Underneath a Grinder is usually an ATM drip (a banker selling into strength while
supporting dips so they can sell more, higher) or an algorithm buying every dip to
harvest short stops.

**Only exception:** a high-volume crack. Price must break *below* VWAP on
significant volume, then retest VWAP from below and *fail*. Until the trend is
undeniably broken, the trend is your enemy.

### V3 — Real catalyst
A fundamental repricing, not hype. FDA approval to market and sell. A binding
acquisition. A signed contract with hard near-term figures. Financing large enough
to remove bankruptcy risk outright.

The distinction from fluff is frequently one word — *approval* vs *acceptance*,
*definitive agreement* vs *letter of intent*, *$12M contract* vs *up to $12M*.
Route the document through the Catalyst Reader and use its category.

Solvency news is the one most often misread. A dying biotech that raises $200M has
repriced from dead to alive; the dilution is real and irrelevant.

### V4 — Float trap
High institutional ownership plus genuine news. The float is locked up, there is
nothing to borrow, and every buy order chases price higher because no institution
is selling. The "grind" you'd see is a supply shock.

### V5 — Squeeze geometry
Thin float combined with weak offering ability. This is the configuration that
kills the strategy, and it is now the *normal* case rather than the exception —
the mid-2026 reverse-split wave has made sub-2M floats routine in this universe.

Low offering ability is **bad news, not neutral.** The entire thesis is that they
dilute into the pump. A company that cannot print shares cannot cap the move.

Verify with the baby shelf calculation (§3.3) rather than trusting a badge.

### V6 — Square consolidation
Gap up 50%+ followed by two hours of strictly sideways, non-flagging price action.
That is a base, not a top. It's building for the next leg.

### V7 — Multi-day runner
Up big yesterday, or up big across the prior three sessions. You want today's spike
to be a surprise. Anticipated moves have committed buyers; surprises don't.

---

## 3. Gate sequence

Vetoes clear. Now screen.

### 3.1 Order of operations

```
Telegram alert → ticker
      ↓
/api/fast/[ticker]            <1.5s — vetoes + walk-aways, deterministic
      ↓ REVIEW
Catalyst Reader (if news)     is the catalyst real?
      ↓
Screening Gem                 Grinder read, conviction, sizing
      ↓
Entry log → trade
```

**Never invert this.** The LLM is the slowest and least reliable component; it goes
last, on survivors only. Putting judgment before arithmetic is how a 90-second
decision becomes a 20-minute rationalization.

### 3.2 What the fast endpoint checks

Named here, valued in config: today's move, prior-day and three-day context,
volume anomaly, droppiness, float rotation, market cap, institutional ownership,
cash runway, borrow availability, catalyst class, filings dated today, and derived
offering ability.

### 3.3 Dilution capacity — the baby shelf test

The binding constraint on nearly every name in this universe, and computable from
three numbers.

Form S-3, General Instruction I.B.6: an issuer with public float under $75M may
sell no more than **one-third of public float** in primary offerings per trailing
twelve months.

```
publicFloatValue  = float × price
capacity          = publicFloatValue / 3
capacityQuarters  = (capacity − trailing 12mo takedowns) / quarterly burn
```

*Implementation note:* Short Check and Fast Scan both compute
`capacityQuarters` as `capacity / quarterlyBurn` today — trailing-12-month
takedowns are not subtracted because no reliable takedown-history source is
wired yet. Treat the takedown term as aspirational until that data exists.

Worked example — DFNS, July 2026:

```
0.93M shares × $6.49        =  $6.04M public float
$6.04M / 3                  =  $2.01M annual shelf capacity
quarterly burn                 $4.93M
                            ────────────
capacity ÷ burn             ≈  0.41 quarters (~37 days of operations)
```

Their entire annual shelf capacity funds under six weeks. That is *why* the badge
reads LOW, and it converts V5 from a heuristic into a mechanism.

**Limit:** the cap applies to S-3 primary offerings only. S-1 registrations and
PIPEs remain available — slower, and requiring willing counterparties, but
available. Low capacity means *slow to dilute*, not *unable to dilute*.

### 3.4 Preferred characteristics

Not gates — tiebreakers among candidates that already cleared:

- Chinese or Hong Kong domicile listed on a US exchange
- NASDAQ or ARCA (never OTC; never ETFs or SPACs)
- Crypto/AI/narrative treasury raise as the catalyst
- A 424B5 or EFFECT filed today — they're pricing into your pump
- Prior-day close *down* into today's spike

---

## 4. Execution

### 4.1 Prerequisites — both required before any entry

1. Price has hit or exceeded the Current Monthly Pivot.
2. RSI has gone overbought on the 1m or 5m.

You are waiting for overextension *first*. No prerequisites, no trade — regardless
of how good the screen looked.

### 4.2 Triggers — wait for one

| Trigger | Signal |
|---|---|
| **MACD cross** | Green crosses below red on CM_Ult_MACD. Preferred. |
| **RSI reversal** | Drops back below 70 from overbought. |
| **VWAP cross** | Price crosses below VWAP. |
| **Fat Tony turn** | Blue → sandy yellow. |

Let it run as high as it will, wait for the turn, then take the trigger.

### 4.3 Volume and timing

Minimum shares/minute per config in the minutes before entry — below it, liquidity
won't be there when you need to exit.

| Window (ET) | Status |
|---|---|
| 04:00–09:30 | Tradeable |
| 09:30–11:00 | Tradeable |
| 11:00–14:30 | Tradeable, thinner |
| **14:30–15:30** | **No trades** — power hour, unpredictable |
| 15:30–16:00 | Tradeable |
| 16:00–20:00 | Tradeable |

Afternoon entries after ~13:30 are structurally safer: volume fades, failed
reclaims and lower highs read more clearly, violent reclaims are less likely.

Holding a position from yesterday? No new entries before 15:00.

---

## 5. Risk

### 5.1 The principle that matters most

**The stop is not your risk control. The size is.**

A 40% stop assumes you can transact at your price. On a halting sub-1M-float name
you cannot — the stock can reopen well above your stop and the order fills wherever
the book is. The stop is the number you *act* on. The position size is the number
that *protects* you.

Size so that a 100% adverse gap is survivable, not merely a 40% one.

### 5.2 Sizing — $40,000 account

| Item | Value |
|---|---|
| Per entry | 1.5% = **$600** |
| Hard stop | 40% against |
| Planned loss per entry | $240 = **0.6% of account** |
| Loss if it doubles through the stop | $600 = **1.5% of account** — survivable |

Share counts at $600:

| Price | Shares |
|---|---|
| $0.50 | 1,200 |
| $1.00 | 600 |
| $2.00 | 300 |
| $6.50 | 92 |

The gap-survivability property is the whole argument for small clips. It is why
the position size, not the stop, is doing the real work.

### 5.3 Portfolio limits

*Provisional — revise once the entry log has data.*

| Limit | Value | Meaning |
|---|---|---|
| Max concurrent positions | **3** | Distinct tickers |
| Max aggregate short exposure | **6% = $2,400** | Marked at current market value |
| Daily stop-trading loss | **2% = $800** | ≈ 3.3 full stops. Then done for the day. |

**Aggregate is measured at current market value, not cost.** A position moving
against you consumes more of the budget automatically — which correctly stops you
opening new risk while bleeding.

**Adds and concurrency compete for the same budget.** A single name pyramided to 6%
fills the book: no new positions until it's reduced. That's intentional. Choose
depth or breadth, not both.

**Correlation.** Three microcaps pumping on one narrative are not three
independent 0.6% risks — they're one 1.8% risk with a shared catalyst. Count a
shared narrative as a single position against the concurrency limit.

### 5.4 Adding to winners

Add only into a position moving your way. Never into a loser — that rule was
deleted in v2.0 and stays deleted.

- Total position across all adds capped by the 6% aggregate limit
- If the original entry stops out, close the entire position — the thesis broke
- The goal is pyramiding winners, not averaging into losers

### 5.5 Halt-up protocol

New in 3.0. This is the acute failure mode and it previously had no procedure.

**First halt up while short:**
- Do not add. Do not average up. The move is accelerating, not fading.
- You cannot exit during the halt — accept that and prepare.
- Decide your reopen action *before* the reopen.
- If it reopens above your stop, you are already past your risk limit. Cover at
  market. Do not negotiate with it.

**Second halt up:** the thesis is broken regardless of fundamentals. Cover.

**Never** hold through a third. Multi-halt names are how small losses become
account events.

### 5.6 Borrow

Distinguish two things that get conflated:

**Availability is critical.** No borrow, no trade — trivially. A forced buy-in mid-
position is unmanageable, and hard-to-borrow names can become unshortable exactly
when you most want to add.

**Cost is mostly noise at this size.** A $600 position at 100% annualized runs
~$1.64/day; even 300% is ~$5/day. Borrow fee should not drive decisions on
$600 clips — I over-weighted this earlier and it doesn't survive the arithmetic.
It becomes material only on larger size or multi-week holds.

---

## 6. Trade management

### 6.1 Targets

Current Monthly Pivot → Ghost Pivot → 200 SMA (1m/5m). Scale roughly a third at
each; let the last third run or close it at the third target.

### 6.2 Take profit early when

- Another name is spiking and taking the tape's attention
- New highs in after-hours
- Volume rising rather than fading
- Higher lows forming

20–30% banked beats 50% watched round-tripping to flat.

### 6.3 Overnight

Prefer flat by the close. Acceptable to hold when the trade is working with room,
or is slightly offside with the setup intact.

Do not hold overnight when: new daily highs printed in after-hours, the catalyst
sits in a trending sector (crypto, AI, defense, quantum, space, nuclear), or
after-hours volume is heavy. If holding and it makes new highs after-hours, release
part of the position in premarket.

### 6.4 Multi-day runners

Stayed elevated all session, volume held up, closed near highs, trending topic.
Exit before the close. These run three to five days and are not shorts.

---

## 7. The entry log

**This is the only mechanism by which this framework improves.** Without it, "has
the market changed?" is answerable only from memory, which is the least reliable
instrument you own.

Log at entry, every trade, no exceptions:

```
timestamp · ticker · entry price · shares · $ size
droppiness score · spike count
float · float rotation · market cap · inst own
offering ability (derived) · baby shelf capacity ÷ burn
borrow available · fee
catalyst category (Catalyst Reader) · news age at entry
runner class · prior-day % · 3-day %
trigger used · time of day
Short Check rating · which gates were UNVERIFIED
```

Then at exit: outcome, hold time, exit reason, and whether you followed the rules.

**Review monthly.** Regress outcome against droppiness score and calibrate the
config cutoffs against your actual P&L. Those numbers are currently guesses; after
a quarter of logged trades they don't have to be.

---

## 8. Post-mortem

When a trade loses, classify it honestly into exactly one bucket:

1. **Bad setup selection** — a gate failed and you took it anyway. Name the gate.
2. **Good setup, bad timing** — gates passed, entry was early or late.
3. **Good trade, bad management** — thesis worked, you mishandled the exit.
4. **Unavoidable** — rare. Be extremely skeptical of this bucket; most trades
   filed here belong in 1.

If you hit the daily stop: stop trading. Recovery is 0.6%-per-trade arithmetic —
roughly one to two good trades — and it does not require a hero trade today.
Review your five best trades from the last three months and only take setups that
look like those.

---

## 9. Definitions

**Droppiness** — the tendency to spike sharply and give it back within hours.
Computed as a recency-weighted, Bayesian-shrunk retracement rate over 18 months.
The #1 factor, and now a hard veto.

**Current Monthly Pivot (CMP)** — pivot from the current month's high, low, close.

**Ghost Pivot (GP)** — forward-looking pivot from current-month data, representing
where next month's pivot lands. Price is magnetically drawn to it. Below the GP is
a buy setup, not a short.

**Missed Monthly Pivot (MMP)** — a prior month's pivot price never touched. Acts as
magnetic resistance. Either wait for the tag, keep your stop above it, or size so
that reaching it doesn't hurt.

**Baby shelf** — S-3 General Instruction I.B.6. Under $75M public float, primary
offerings capped at one-third of float per twelve months.

**Grinder** — controlled 45° climb with VWAP support and manufactured reclaims.
Veto.

**Backside / Frontside** — the reversal phase, and the initial pump. Never short
the frontside.

---

## 10. Changes from 2.1

- Grinder and Losing Archetype content promoted from appendix to §2 vetoes
- Droppiness converted from prose gate to enforced hard veto
- All screening thresholds moved to config; four conflicting market-cap ceilings
  resolved to one
- Squeeze geometry (V5) added — thin float × weak offering ability
- Baby shelf calculation added as the dilution-capacity mechanism
- Halt-up protocol added (§5.5) — previously undefined
- Gap risk reframed: size, not stop, is the risk control (§5.1)
- Portfolio limits added (§5.3) — concurrency, aggregate, daily stop, correlation
- Entry log made mandatory (§7)
- Borrow split into availability (critical) vs cost (immaterial at this size)
- Halted-stocks system split into a companion document
- Cut: triplicate chart-indicator lists, the ~50-question AI prompt bank, v1.0
  history
