# Start Here — Short Selling Stack

Status as of 29 Aug 2026. Read this before the other files.

---

## What exists, and what doesn't

| File | What it is | Status |
|---|---|---|
| `Short-Selling-Framework-3.0.md` | The governing document | ✅ **Live** — read it |
| `catalyst-reader-PASTE.md` | Chrome sidebar skill | ✅ **Live** — paste and use |
| `framework-v3-recommendations.md` | Why 3.0 changed | 📖 Reference |
| `fast-verdict-endpoint-spec.md` | `/api/fast/[ticker]` design | ✅ **Built** — see `lib/fast/` |
| `fast-verdict-spec-addendum.md` | News + dilution amendments | ✅ **Built** |
| `TASK-A-B-HANDOFF.md` | Scorer + Fast endpoint build spec | ✅ **Complete** — see checkboxes |
| `entry-log-calibration.md` | Monthly threshold review | ✅ **Live** — run calibration script |
| `short-screen-gem-prompt-v2.md` | Screening Gem instructions | ⚠️ Superseded in part — see §4 |
| `catalyst-reader-prompt-v2.md` | Annotated version of the skill | 📖 Reference only |

**`lib/config/thresholds.ts` exists** — single source of truth for screening numbers.
Tune via monthly entry-log review (`docs/framework/entry-log-calibration.md`).

---

## This week — in this order

### 1. Start the entry log. Today. Before anything else.

Zero code. A spreadsheet is fine.

Nothing else in this stack can be calibrated without it. The droppiness cutoffs,
the portfolio limits, the threshold table — all currently guesses, and they stay
guesses until there's data. It's also the step most likely to get skipped, because
it produces no benefit for about a quarter and then produces all of them at once.

Fields are in Framework 3.0 §7. If that feels like too many, log these six and
expand later:

```
date · ticker · droppiness score · float · catalyst category · outcome
```

### 2. Paste the Catalyst Reader into your Chrome skill

`catalyst-reader-PASTE.md`, select all, paste. Works immediately.

Prefix "I'm short" or "I'm flat" when you invoke it — the verdict's action line
changes depending on which.

### ~~3–5. Short Check P1 patches + fast endpoint~~ ✅ Shipped (Aug 2026)

- Task A scorer fixes, `lib/config/thresholds.ts`, droppiness veto, borrow walk-away — **on `main`**
- `/api/fast/[ticker]` + Fast Scan + Watchlist — **on `main`**
- Verdict stack on Short Check (Fast Verdict + fundamental context + walk-aways) — **on `main`**
- Capital Pressure enhancements, AI thesis cache, deprecated `weightedRiskScore` — **on `main`**

See [`TASK-A-B-HANDOFF.md`](TASK-A-B-HANDOFF.md) and [`README.md`](../../README.md).

### Next optional work

- Entry-log calibration (#5 in improvement list) — tooling exists; log still empty
- PDF/copy alignment with verdict stack section names
- Remove `weightedRiskScore` from API entirely
- Watchlist v2 (persist, sort)

---

## What a trade looks like right now

```
Telegram alert → ticker
      ↓
Fast Scan or /api/fast           <2s Framework 3.0 verdict + flags
      ↓
Short Check (screenshot)         ~10-20s Short Rating % + verdict stack
      ↓
Framework 3.0 §2 vetoes          run MANUALLY for V2, V5, V6, V7 — app enforces
      ↓                           fast walk-aways W3–W10 + Short Check walk-aways
Catalyst Reader (Chrome)         if there's news. Live and working.
      ↓
Entry log → trade
```

**The manual §2 veto pass still does real work** for rules not yet encoded in the app.
Keep §2 open in a tab.

Ideal path once entry log has data:

```
ticker → /api/fast → REVIEW → Short Check (if DT) → Catalyst Reader → log → trade
          <1.5s              only if needed
```

---

## The one thing not to lose

The stack has three layers and they are not interchangeable:

- **Arithmetic** kills candidates. Fast, deterministic, no judgment.
- **Judgment** assesses the survivors. Slow, fallible, advisory.
- **You** decide. Nothing in here outputs "take this trade."

Every failure mode this design guards against is some version of running those in
the wrong order — asking the LLM first, letting a score authorize an entry, or
overriding a veto because the setup "looks right."

---

## Still open

- **Halted Stocks Playbook** — referenced by 3.0 as a companion, not yet extracted
  from 2.1.
- **Portfolio limits** (3 / 6% / $800) — provisional. Revise from the log.
- **Screening Gem prompt** — written before the tiered architecture; it still
  re-derives screening the endpoint should own. Trim it to Tier 3: Grinder read,
  conviction, sizing.
- **Config thresholds** — my defaults. Yours to override once the log has an
  opinion.
