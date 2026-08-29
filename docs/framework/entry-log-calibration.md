# Entry log calibration

Framework 3.0 §7: the entry log is how threshold guesses become evidence.
`lib/config/thresholds.ts` values (`droppiness.walkAway`, `babyShelf.criticalQuarters`,
etc.) should change only after a monthly review of logged trades.

## Setup (one time)

1. Copy the template:
   ```bash
   cp data/entry-log.template.csv data/entry-log.csv
   ```
2. `data/entry-log.csv` is gitignored — your P&L stays local.
3. Each row = one trade (entry fields at minimum; exit `outcome_pnl_pct` when closed).

### Minimum columns

| Column | Purpose |
|--------|---------|
| `date` | Entry date |
| `ticker` | Symbol |
| `droppiness_score` | Score at entry (0–100) |
| `spike_count` | Spikes in lookback |
| `outcome_pnl_pct` | Exit P&L % (negative = loss on short) |
| `bypassed_walkaway` | `y` if you traded despite a veto |

Expand to the full §7 field list as you go. Aliases are accepted — see
`scripts/calibrate-from-entry-log.ts`.

## Monthly review

```bash
npx tsx scripts/calibrate-from-entry-log.ts
# or: npx tsx scripts/calibrate-from-entry-log.ts ~/Downloads/entry-log-export.csv
```

The script prints win rate and average P&L by:

- Droppiness veto zone (`< 40` with `≥ 3` spikes)
- UNVERIFIED zone (`< 3` spikes)
- Baby-shelf critical (`capacity_quarters < 1`)
- Short Check rating bands

### When to change `T.*`

| Signal | Action |
|--------|--------|
| Losses cluster in bypassed-walkaway rows | Vetoes are working — keep thresholds |
| Wins cluster in droppiness veto zone (without bypass flag) | Consider raising `walkAway` or tightening spike rule |
| Wins cluster below `criticalQuarters` | Consider lowering `babyShelf.criticalQuarters` |
| Fewer than ~15 trades | Log more — do not tune yet |

After changing a threshold, note the date and hypothesis in this file or a commit
message. Re-run verify scripts (`verify-task-a.ts`, `verify-task-b.ts`).

## Example run

```bash
npx tsx scripts/calibrate-from-entry-log.ts data/entry-log.example.csv
```

Synthetic rows only — replace with your real export before making decisions.
