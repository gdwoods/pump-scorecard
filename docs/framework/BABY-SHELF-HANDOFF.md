# Handoff — baby-shelf capacity (Short Check)

**Repo:** `/Volumes/Projects/pump-scorecard`
**Branch:** `feature/baby-shelf-short-check` (PR #16)
**For:** Cursor, opened on the repo root.

Attach alongside:
- `Short-Selling-Framework-3.0.md` — §3.3, the governing spec for this feature
- PR #16 review (already on the branch) — the blocker this handoff's first
  commit fixes; the open items below are the smaller notes from that same review

---

## Context

Two commits landed on this branch:

- `66ef588` — computes Framework 3.0 §3.3 "baby shelf" dilution capacity
  (Form S-3 Instr. I.B.6) from float/price/burn instead of trusting the
  DT-scraped Offering Ability badge alone. New file `lib/babyShelf.ts` is a
  thin adapter over the pre-existing `lib/fast/babyShelf.ts::computeBabyShelf()`
  (Fast Scan already had this math — reused rather than duplicated).
- `97ccbf9` — fixes the blocker PR #16 review caught: `ExtractedData.currentPrice`
  was never populated in real Short Check flows (OCR parses a price only to
  compute `priceSpikePct` and discards the dollar figure; manual entry had no
  price field at all), so the baby-shelf math above never actually ran. Adds
  `utils/fetchCurrentPrice.ts` (mirrors the existing `fetchDebtCashFromYahoo`
  fallback convention) and wires it into both `app/api/short-check/route.ts`
  handlers as a fallback when no price is already present.

Both verified against `npx tsc --noEmit` (no new errors) and
`scripts/verify-task-a.ts` / `scripts/verify-task-b.ts` (both pass unchanged)
before committing.

Four smaller items from that same PR #16 review are still open — none are
blockers, but flagging them here since your review is what surfaced three of
them.

---

## 1. Add a verify fixture for the currentPrice fallback

You offered to do this yourself in the PR #16 review ("I can patch price
derivation and add a verify fixture next if you want") — the price patch above
covers the first half, this is the remainder.

Nothing currently exercises the fallback logic in
`app/api/short-check/route.ts` directly (it's a live Yahoo call, not unit-level
like `verify-task-a.ts`/`verify-task-b.ts`). Worth covering:

- `extractedData.currentPrice === undefined` + a ticker → fallback fires,
  `currentPrice` and `currentPriceSource: 'yahoo-finance'` get set
- `extractedData.currentPrice` already present (OCR or manual) → fallback is
  skipped, `currentPriceSource` stays unset
- Yahoo fetch throws or returns no price → request still succeeds, scoring
  proceeds without `currentPrice` (same "continue with partial data" pattern
  the debt/cash and news fetches already use)

A mocked `yahooFinance.quote` (same shape `utils/fetchDebtCash.ts` and
`utils/fetchCurrentPrice.ts` already call) is enough — no live network needed.

## 2. Offering Ability score is still badge-only — confirm that's intentional

`lib/shortCheckScoring.ts`'s `scoreOfferingAbility()` (line 282) computes the
-30..+25 walk-away matrix score from `getOfferingColor()`, which reads the
DT-scraped `atmShelfStatus` badge (or a `dt:` tag override) — never the
computed `babyShelf` value from `computeBabyShelfCapacity()`.

The computed capacity currently only reaches:
- `checkWalkAwayFlags()` (line ~919) — a *separate* hard flag when
  `capacityQuarters < T.babyShelf.criticalQuarters`
- Display text (line 910, 1177) — appended to the TRAP_RISK message and the
  Offering Ability badge text

So a name can score well on the badge-derived matrix while the computed
capacity is critical — the walk-away flag catches that case today, but the
-30..+25 score itself doesn't reflect it. That may be exactly right (badge
reflects what DT actually observed — ATM/shelf effectiveness, not just
capacity math; the flag is the intentional override), but it's worth a
second pair of eyes given you're the one who'll extend this next. If it's
intentional, a one-line comment above `scoreOfferingAbility()` saying so would
close the loop for the next person reading it.

## 3. Fast Scan vs Short Check baby-shelf threshold divergence

You noted this in the PR review as "OK if documented" — it isn't documented
yet.

- Fast Scan (`lib/fast/babyShelf.ts:48`): `capacityQuarters < 0.3` → LOW,
  hardcoded literal, not read from `lib/config/thresholds.ts`
- Short Check (`lib/config/thresholds.ts`, `babyShelf.criticalQuarters: 1`,
  added in `66ef588`): `capacityQuarters < 1` → walk-away flag

Both are real, deliberately different thresholds for different jobs (Fast
Scan's LOW/MEDIUM/HIGH offering-ability classification vs. Short Check's hard
walk-away flag), so unifying them isn't obviously right. But
`lib/config/thresholds.ts` states "No numeric screening threshold may appear
as a literal elsewhere" — `lib/fast/babyShelf.ts:48` and `:44`
(`capacityQuarters > 1` for HIGH) are both literals today. Either move them
into `T` with a comment explaining why they differ from Short Check's `1`, or
leave them and add a comment at the literals themselves — whichever you
think fits Fast Scan's existing conventions better, since I didn't touch that
file.

## 4. Framework doc arithmetic — DFNS worked example

`docs/framework/Short-Selling-Framework-3.0.md:165-172`, the §3.3 worked
example:

```
0.93M shares × $6.49        =  $6.04M public float
$6.04M / 3                  =  $2.01M annual shelf capacity
quarterly burn                 $4.93M
                            ────────────
capacity ÷ burn             ≈  12 days of operations
```

$2.01M / $4.93M ≈ 0.41 quarters ≈ **37 days**, not 12. (0.41 × 91.25 ≈ 37.4.)
Confirmed against the doc's own stated inputs — this is prose, not a code
bug; `computeBabyShelfCapacity()`/`computeBabyShelf()` compute the right
number given the same inputs. Worth fixing the doc so the worked example
matches its own numbers, since it's the reference for anyone extending this
math the way `66ef588` did.

Separately, worth a look while in that section: the formula block just above
the worked example (line 161) is
`capacityQuarters = (capacity − trailing 12mo takedowns) / quarterly burn`,
but neither the worked example nor `computeBabyShelf()` in
`lib/fast/babyShelf.ts` subtracts trailing-12-month takedowns anywhere — the
implementation is `capacity / quarterlyBurn` with no takedown term. That may
be a deliberate simplification (no reliable takedown-history data source
today), but if so it's worth a line in the doc saying that's a known gap
rather than an oversight.

---

## Verify before pushing

```bash
npx tsc --noEmit                       # expect only pre-existing unrelated errors
npx tsx scripts/verify-task-a.ts       # must pass
npx tsx scripts/verify-task-b.ts       # must pass
```
