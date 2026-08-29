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

### 3. Write the config file

Twenty lines, unblocks everything downstream. Both Short Check and the future
endpoint read from it, and it's what makes 3.0 internally coherent. Draft is in
`fast-verdict-endpoint-spec.md` §2.

### 4. Patch Short Check — the P1 fixes

Small changes to code that already exists. Highest safety return per hour of work
in the whole stack.

1. **Droppiness veto.** Score below the config floor with ≥3 spikes forces
   No-Trade. This closes the hole where a stock whose spikes *hold* rates 88%.
2. **Spike count surfaced.** Fewer than 3 spikes ⇒ `UNVERIFIED`, never `neutral`.
   Zero spikes currently scores 50 and reads as a coin flip.
3. **Data-completeness multiplier.** A failed news fetch currently earns +15 — the
   maximum. Print `n/12 components populated`; below 70% force WATCH.
4. **Borrow scored.** You already fetch iBorrowDesk and discard it. Availability
   should be a walk-away.
5. **Float penalty extended.** The Green-Offering adjustment stops at the 1M band;
   run it through 5M.

### 5. Then the builds

Wire RSS poller → fast endpoint. Both specced, neither started. Build order is in
the addendum.

---

## What a trade looks like right now

Degraded, but workable:

```
Telegram alert → ticker
      ↓
Short Check (screenshot)         ~10-20s, and it can still say yes to a
      ↓                           low-droppiness name until you patch it
Framework 3.0 §2 vetoes          run these MANUALLY — the app doesn't
      ↓                           enforce V2, V5, V6, or V7 yet
Catalyst Reader (Chrome)         if there's news. Live and working.
      ↓
Entry log → trade
```

**The manual veto pass is doing real work in this configuration.** Until the
endpoint exists, you are the walk-away logic. Keep §2 open in a tab.

And what it looks like once built:

```
ticker → /api/fast → REVIEW → Catalyst Reader → Gem → log → trade
          <1.5s              only if news       only if needed
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
