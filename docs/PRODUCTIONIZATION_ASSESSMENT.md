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

| #   | Finding                                                                                                                            | Impact                                                                        | Severity    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------- |
| 1   | **The deployed app cannot be used by a visitor.** It requires a Google sign-in and `VITE_ALLOWED_UIDS` admits exactly one account. | A portfolio link leads to a wall. The entire deployment demonstrates nothing. | **Blocker** |
| 2   | **No demo data exists.** `IS_DEMO` is exported and read by nothing; nothing seeds anything.                                        | Even past the wall, a reviewer sees an empty app.                             | **Blocker** |
| 3   | Records live in one person's Firestore project.                                                                                    | A demo cannot share it, and should not.                                       | High        |
| 4   | Every card treats `data === undefined` as loading.                                                                                 | A failed read is indistinguishable from a slow one and waits forever.         | High        |
| 5   | No `docs/DEMO_DATA.md`, no `docs/INTERVIEW_GUIDE.md`.                                                                              | The two documents this exercise exists to produce.                            | Medium      |
| 6   | Tombstones, the backup envelope's tombstone carriage, and three retired IndexedDB stores are vestigial.                            | Dead weight a reviewer will ask about.                                        | Low         |
| 7   | 793 KB bundle, one chunk over 500 KB.                                                                                              | Fine for a PWA; worth being able to explain.                                  | Low         |

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
