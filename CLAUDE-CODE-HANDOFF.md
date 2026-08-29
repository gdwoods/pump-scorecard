# Claude Code handoff — Short Check

Stable baseline locked before Short Check improvements. Use this to resume work or roll back production.

## Stable refs (2026-08-29) — current

| Layer | Value |
|---|---|
| Commit | `247ef57b95d0ee1ac36afe9b95a9530d21cd763c` |
| Tag | `rollback/short-check-stable-2026-08-29` |
| Branch | `main` |
| Repo | `gdwoods/pump-scorecard` |
| Production URL | https://short-check.vercel.app |
| Vercel project | `short-check` (`prj_nzbd4LWAUNuh1MeZdMczziIv7WmM`) |
| Team / scope | `garth-woods-projects` (`team_w7AcbLx9ONVFNVQai2kY0uDO`) |
| Production deploy | `dpl_6VLGzuL3AmLSncMZrEr4oNNFKDY7` |

## Stable refs (2026-07-26) — prior

| Layer | Value |
|---|---|
| Commit | `2493af103972f9052cdb7e5630f5bf58328ef213` |
| Tag | `rollback/short-check-stable-2026-07-26` |
| Production deploy | `dpl_F63aWDycLoQ29NWvz4GFUT1SqLTM` |

Local `.vercel/project.json` links to `short-check`. On this NAS volume, `core.filemode` is `false` to avoid executable-bit noise.

## Rollback

```bash
# Code restore to current tagged commit
git fetch --tags
git checkout rollback/short-check-stable-2026-08-29

# Instant production restore (same build, no rebuild)
npx vercel promote dpl_6VLGzuL3AmLSncMZrEr4oNNFKDY7 --scope garth-woods-projects
```

Prior baseline (July):

```bash
git checkout rollback/short-check-stable-2026-07-26
npx vercel promote dpl_F63aWDycLoQ29NWvz4GFUT1SqLTM --scope garth-woods-projects
```

## Task status

- **Task A (scorer P1 fixes)** — done (`npx tsx scripts/verify-task-a.ts`)
- **Task B (`/api/fast/[ticker]`)** — done (`npx tsx scripts/verify-task-b.ts`)
- **Baby-shelf handoff** — done (`BABY-SHELF-HANDOFF.md` items closed Aug 2026)
- **Entry log calibration** — `docs/framework/entry-log-calibration.md` +
  `npx tsx scripts/calibrate-from-entry-log.ts`

Governing docs:

- [docs/framework/START-HERE.md](docs/framework/START-HERE.md)
- [docs/framework/TASK-A-B-HANDOFF.md](docs/framework/TASK-A-B-HANDOFF.md)
- [docs/framework/Short-Selling-Framework-3.0.md](docs/framework/Short-Selling-Framework-3.0.md)
- [docs/framework/fast-verdict-endpoint-spec.md](docs/framework/fast-verdict-endpoint-spec.md)
- [docs/framework/fast-verdict-spec-addendum.md](docs/framework/fast-verdict-spec-addendum.md)
- [docs/framework/entry-log-calibration.md](docs/framework/entry-log-calibration.md)

## Production smoke test (2026-08-29)

| Check | Result |
|---|---|
| `GET /api/fast/DFNS?fmt=json` | ✅ 200, ~535ms, `verdict: NO_TRADE`, `dataCompleteness: 1` |
| Droppiness KV | ⚠️ `UNVERIFIED` / `not_cached` for DFNS and AAPL |
| Baby shelf on Fast path | ⚠️ `capacityQuarters: null` (burn not on ticker-only path) |
| Cron `/api/cron/droppiness` | ✅ 401 without `CRON_SECRET` (expected) |

**KV droppiness not caching** — likely causes:

1. `KV_REST_API_REDIS_URL` missing embedded auth and no `KV_REST_API_TOKEN` set
2. Cron runs once/day (06:00 UTC) and processes only 2 tickers/run (`MAX_TICKERS_PER_RUN`)
3. First cold universe needs several days to warm

**Mitigations:** set `DROPPINESS_WATCHLIST=DFNS,...` in Vercel; confirm KV writes in
cron logs; Fast Scan `/api/scan/{ticker}` still computes droppiness live on each scan.

## Deploy map (post-cleanup)

Keep: **`short-check`**, **`ask-edgar-dashboards`**. Deleted duplicates: `pump-scorecard`, `pump-scorecard-1r6z`.

## Working rules

- Branch off up-to-date `main`; short-lived feature branches; delete after merge
- Do not force-push `main`
- Prefer tagging new baselines with `rollback/...` when starting another large change set
- AskEdgar / dilution-monitor code lives in the separate `ask-edgar-dashboards` project

## Next work

- **Fast Scan** (widely used): burn enrichment on ticker-only path, droppiness KV
  reliability, then re-enable `SHOW_FAST_VERDICT_UI`
- Monthly entry-log calibration → tune `lib/config/thresholds.ts`
- Optional: denser cron via external scheduler or Pro (Hobby = once/day)
- Optional env: `DROPPINESS_WATCHLIST=TICK1,TICK2` seeds nightly refresh universe
