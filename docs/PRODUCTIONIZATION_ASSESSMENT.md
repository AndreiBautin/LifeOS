# Productionization assessment

Written before any change, against `daa98e8`. Baseline: **1,382 tests in
117 files, all passing**; `pnpm verify` green; 387 source files; a
793 KB JS bundle (239 KB gzipped); worktree clean.

## What this app is

A client-only React + TypeScript PWA that scores six areas of a life —
training, quests, a reading backlog, a tech tree, a map and a set of
habits-turned-limits — through one game model: three currencies, one
tech tree, three rules that are enforced as tests rather than described
in prose.

## The honest verdict

**The code is good and does not need a rewrite.** Saying so plainly
matters, because the rest of this document is a list of problems and
would otherwise read as a case for one.

- The layering is real and **enforced by ESLint**, not by convention:
  `features → application → domain ← infrastructure`, with
  `no-restricted-imports` zones carrying messages that explain the
  reasoning.
- The domain is pure. Resolution, scoring and assembly take a clock and
  an id generator as parameters, which is why 1,382 tests run in
  seconds with no mocking framework.
- The composition root is a single file (`src/app/di.ts`) and is the only
  place allowed to name a concrete implementation.
- `CLAUDE.md` is an unusually good record of _why_ — it documents traps
  and reversed decisions, including the ones that were wrong.

What it lacks is not architecture. It is everything between "works for
its author" and "an employer can click a link."

## Weaknesses

| #   | Finding                                                                                                                                                                                                                                                                                                      | Impact                                                                        | Severity    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------- |
| 1   | **The deployed app cannot be used by a visitor.** It requires a Google sign-in and `VITE_ALLOWED_UIDS` admits exactly one account.                                                                                                                                                                           | A portfolio link leads to a wall. The entire deployment demonstrates nothing. | **Blocker** |
| 2   | **No demo data exists.** `IS_DEMO` is exported and read by nothing; nothing seeds anything.                                                                                                                                                                                                                  | Even past the wall, a reviewer sees an empty app.                             | **Blocker** |
| 3   | Records live in one person's Firestore project.                                                                                                                                                                                                                                                              | A demo cannot share it, and should not.                                       | High        |
| 4   | Every card treats `data === undefined` as loading.                                                                                                                                                                                                                                                           | A failed read is indistinguishable from a slow one and waits forever.         | High        |
| 5   | No `docs/DEMO_DATA.md`, no `docs/INTERVIEW_GUIDE.md`.                                                                                                                                                                                                                                                        | The two documents this exercise exists to produce.                            | Medium      |
| 6   | Three retired IndexedDB stores are vestigial, and stay — removing one means editing a migration step, which is the thing `database.ts` must never do. **Tombstones were listed here too and that was wrong**: they are live on both paths, and the Firestore half that was genuinely missing is now written. | Dead weight a reviewer will ask about.                                        | Low         |
| 7   | 793 KB bundle, one chunk over 500 KB.                                                                                                                                                                                                                                                                        | Fine for a PWA; worth being able to explain.                                  | Low         |

## Security

The threat model is short because the app is structurally small: **no
server of ours, no API of ours.** That removes CSRF, SSRF, injection and
most of the standard list by construction rather than by mitigation —
which is a stronger claim than a checklist of N/A rows.

What remains, and its current state:

- **Firestore rules** pin every document to one uid and name it
  explicitly. Verified against the emulator in this repository's own
  test suite: an account the rules do not name is refused.
- **The Firebase web config is public by design** — it identifies a
  project and authorises nothing. It is correctly in `VITE_`-prefixed
  variables.
- **CI already runs** a dependency audit and a secret scan over full
  history.
- **No personal data has ever been committed.** The resume fixtures say
  "Northwind" deliberately.

**The one live concern is #3 above**: the deployment points at a real
personal Firestore project. Nothing leaks — the rules refuse everyone
else — but a portfolio deployment should not be pointed at it at all.

## Recommended architecture

**The deployed build becomes the demo build, and this is a configuration
change rather than a rewrite.**

`bootstrap()` already branches on whether a Firebase project is
configured: with one it builds Firestore-backed repositories, with none
it builds the local IndexedDB ones. A build with no `VITE_FIREBASE_*`
variables is therefore already a working, offline, account-free
application — which is exactly what a portfolio demo should be.

That single fact resolves findings 1 and 3 together:

- No sign-in wall, because there is no account to sign in to.
- No personal data, because there is no shared database to reach.
- No new hosting, no new secret, no new account.

`VITE_DEMO_MODE` already switches the storage prefix to `lifeos.demo`,
so the demo and any local personal data cannot collide. **That is barrier
two of three from the demo-data strategy, already built and already
tested.** What is missing is a fixture and a seeder.

## Deployment

Already on GitHub Pages via a workflow that builds, verifies, publishes,
then **fetches the live URL and greps it** — a genuine smoke test rather
than a green upload step. Nothing here needs replacing. The change is to
what the workflow builds, not where it puts it.

## Risks

1. **A demo that drifts from the app.** A fixture that stops exercising a
   screen shows an empty box to precisely the wrong audience. Phase 8's
   parity test is the answer and is not optional here.
2. **The author's own data.** Switching the deployment to demo mode
   leaves their records in Firestore, reachable only by re-pointing a
   build. That is a deliberate trade and belongs in the README.
3. **Fixtures pinned to absolute dates rot.** Everything must be an
   offset from seed time.

## Order of work

1. Demo fixture and seeder, with the three barriers (Phase 3).
2. Point the deployment at the demo build (Phases 4–5).
3. Parity test so the fixture cannot hollow out (Phase 8).
4. `DEMO_DATA.md`, README rewrite, `INTERVIEW_GUIDE.md` (Phases 10–11).
5. Verify against the live URL (Phase 12).

Findings 4, 6 and 7 are named and deliberately not addressed first: they
are real, none of them blocks a reviewer, and a demo that exists beats a
tidier codebase nobody can open.

---

## Round 2 — reassessed at `170a1a0`

Everything above was executed. The demo build deploys, the fixture is
generated and namespace-isolated, `parity.test.ts` guards it, and both
`INTERVIEW_GUIDE.md` and `DEMO_DATA.md` exist. Baseline for this round:
**1,482 tests in 122 files, all passing**; `pnpm verify` green; 402
source files; worktree clean. A substantial feature — complex
multi-branch goals, linked to real quests — shipped since Round 1 and is
live in the demo.

This round is not a rebuild. It is what three days of real work between
sessions costs a productionized repo if nobody re-checks it: nothing here
was ever fixed once and then re-broken by hand. Two things drifted
silently and one thing was never wired up.

### Findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Impact                                                                              | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| 1   | **The CI workflow was manually disabled** (`state: disabled_manually` via the Actions API), with no comment or marker anywhere explaining why or that it was temporary — unlike Dependabot, which was paused by a file rename that says exactly that. Every push since it was turned off, including the Goals feature, deployed on the strength of the pre-push hook and the deploy workflow's own `verify` job alone. Those cover typecheck/lint/format/test/build; they do **not** cover the demo-configuration build check, the icon-generator drift check, the dependency audit, or the secret scan — all four are CI-only. | A regression in any of those four would have shipped to the live demo undetected.   | **High** |
| 2   | **No branch protection on `main`** (`GET .../protection` returned 404). Nothing stopped a force-push or a branch deletion, and nothing required the CI checks to pass before a merge from anywhere but this machine's own hook.                                                                                                                                                                                                                                                                                                                                                                                                 | The gate depended entirely on one machine's git hooks being installed and honoured. | Medium   |
| 3   | **Three documents had gone stale against the Goals feature**: `DEMO_DATA.md`'s per-screen table had no Goals row despite the fixture demonstrating it in the deployed app right now; `INTERVIEW_GUIDE.md` had no second design-decision story to reach for beyond the training model; both it and the README quoted test/file counts from before the feature shipped.                                                                                                                                                                                                                                                           | A reviewer opening the live demo sees a screen none of the documentation mentions.  | Medium   |
| 4   | Dependabot was paused "for consolidation" during the Goals work and the pause outlived the reason for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Routine dependency updates silently stopped.                                        | Low      |

None of these are code defects — `pnpm verify` was green throughout, and the app itself was never at risk. They are the specific failure mode Phase 8 exists to close: a machine-checked gate that quietly stops being checked reads, from the outside, exactly like one that is still working.

### What was fixed this round

- CI re-enabled via the Actions API, then triggered manually against
  current `main` and watched to completion — typecheck, lint, format,
  test, build, the demo-configuration build, the icon-generator check,
  the dependency audit and the secret scan **all green on today's code**,
  not assumed from the workflow file.
- Branch protection added to `main`: the two CI status checks required
  (**not** the Deploy checks, which do not run on PRs and would
  deadlock); no required review (solo maintainer — requiring one
  deadlocks every PR the maintainer opens); admins not enforced, so the
  direct-push escape hatch survives with the local hook still guarding
  it; force-push and branch deletion blocked.
- Dependabot restored (the rename back to `dependabot.yml` was the
  documented restoration path, not a new decision).
- `DEMO_DATA.md`, `INTERVIEW_GUIDE.md`, `TESTING.md` and the README
  updated: a Goals row in the demo-data table, a second design-decision
  story (`Campaign`/`Project`/`Goal`, why neither existing shape fit, the
  dependency-graph reuse, the quest-link trade-off), and current
  test/file/line counts everywhere they were quoted.
- Verified live: the deployed demo at `170a1a0` renders the Goals card
  on Today, the goal detail page, and Settings' build sha matches the
  commit actually pushed — checked against the running site, not
  inferred from the deploy log.

### What is unchanged and still true

Findings 4, 6 and 7 from Round 1 (the failed-read banner's remaining
scope, the three vestigial IndexedDB stores, the >500 KB chunk) are
still accurate as originally stated and still not worth interrupting a
reviewer over. The Firebase-SDK bundling fix from between rounds
(`ec4f7e5`) was re-verified this round by reading the live site's actual
network requests rather than the build's file listing: the 535 KB chunk
exists in the output and is never fetched by the demo, confirmed both
locally and against the deployed URL.

### Order of work for next time

The lesson worth keeping, not just the fixes: **a disabled GitHub Actions
workflow produces no error, no notification, and no diff** — it is a
server-side setting, invisible to `git status`, `git log`, and a config
file read. The only way to catch it is to ask the platform directly
(`gh api .../actions/workflows`), which is now worth doing at the start
of any future productionization pass on this repo, before trusting a
green history of individual runs.
