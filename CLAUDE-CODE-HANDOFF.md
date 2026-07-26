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

To put `main` back on the stable commit (only if intentional): reset/revert to the tag, then push and let Vercel redeploy — or promote the deploy above for an immediate alias switch.

## Deploy map (post-cleanup)

Keep:

- **`short-check`** — public Short Check / pump-scorecard app (`short-check.vercel.app`)
- **`ask-edgar-dashboards`** — private Ask Edgar dilution / top-gainers dashboards

Deleted (do not recreate as duplicates of this repo):

- `pump-scorecard`
- `pump-scorecard-1r6z`

Old `pump-scorecard*.vercel.app` URLs 404 after delete; production is **https://short-check.vercel.app**.

## Working rules

- Branch off up-to-date `main`; use short-lived feature branches; delete after merge
- Do not force-push `main`
- Prefer tagging new baselines with `rollback/...` when starting another large change set
- AskEdgar / dilution-monitor code lives in the separate `ask-edgar-dashboards` project, not this repo

## Archive

- Company-activities work preserved at tag `archive/feature-company-activities` (local branch removed; remote was already gone)

## Next work

Improvements to the Short Check app (`app/short-check/`, related API routes and components). Start from current `main` after pulling; roll back to the tag/deploy above if needed.
