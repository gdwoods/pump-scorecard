# Claude Code handoff — Short Check

Stable baseline locked before Short Check improvements. Use this to resume work or roll back production.

## Stable refs (2026-07-26)

| Layer | Value |
|---|---|
| Commit | `2493af103972f9052cdb7e5630f5bf58328ef213` |
| Tag | `rollback/short-check-stable-2026-07-26` |
| Branch | `main` |
| Repo | `gdwoods/pump-scorecard` |
| Production URL | https://short-check.vercel.app |
| Vercel project | `short-check` (`prj_nzbd4LWAUNuh1MeZdMczziIv7WmM`) |
| Team / scope | `garth-woods-projects` (`team_w7AcbLx9ONVFNVQai2kY0uDO`) |
| Production deploy | `dpl_F63aWDycLoQ29NWvz4GFUT1SqLTM` |

Local `.vercel/project.json` links to `short-check`. On this NAS volume, `core.filemode` is `false` to avoid executable-bit noise.

## Rollback

```bash
# Code restore to tagged commit
git fetch --tags
git checkout rollback/short-check-stable-2026-07-26

# Instant production restore (same build, no rebuild)
npx vercel promote dpl_F63aWDycLoQ29NWvz4GFUT1SqLTM --scope garth-woods-projects
```

## Task status

- **Task A (scorer P1 fixes)** — done (working tree; verify: `npx tsx scripts/verify-task-a.ts`)
- **Task B (`/api/fast/[ticker]`)** — implemented:
  - `GET /api/fast/[TICKER]?fmt=json|text` (Edge runtime)
  - Modules under `lib/fast/`
  - Droppiness returns `UNVERIFIED` / `not_cached` (KV cron later)
  - Verify: `npx tsx scripts/verify-task-b.ts`

Governing docs (from Claude Code session):

- [docs/framework/START-HERE.md](docs/framework/START-HERE.md)
- [docs/framework/TASK-A-B-HANDOFF.md](docs/framework/TASK-A-B-HANDOFF.md)
- [docs/framework/Short-Selling-Framework-3.0.md](docs/framework/Short-Selling-Framework-3.0.md)
- [docs/framework/fast-verdict-endpoint-spec.md](docs/framework/fast-verdict-endpoint-spec.md)
- [docs/framework/fast-verdict-spec-addendum.md](docs/framework/fast-verdict-spec-addendum.md)

## Deploy map (post-cleanup)

Keep: **`short-check`**, **`ask-edgar-dashboards`**. Deleted duplicates: `pump-scorecard`, `pump-scorecard-1r6z`.

## Working rules

- Branch off up-to-date `main`; short-lived feature branches; delete after merge
- Do not force-push `main`
- Prefer tagging new baselines with `rollback/...` when starting another large change set
- AskEdgar / dilution-monitor code lives in the separate `ask-edgar-dashboards` project

## Next work

- Droppiness KV + nightly cron + fast-path read: live on main
- Nightly cron also ingests Polygon top gainers into `drop:universe`
- Short Check Fast verdict card overlays scan droppiness + DT offering tags when present
- Entry log: already in use
- Optional: denser schedules via external cron or Pro (Hobby Vercel cron = once/day)
- Wire RSS → KV: implemented; `CRON_SECRET` set on Production/Preview
- KV: only `KV_REST_API_REDIS_URL` is configured (no separate token env) — Redis URL must embed auth for writes to work
- Optional env: `DROPPINESS_WATCHLIST=TICK1,TICK2` seeds the nightly refresh universe
