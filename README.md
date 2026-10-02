# LifeOS

A gamified workout tracker. Double progression that moves the bar for
you, deloads that adjust themselves, and a character that levels
**Strength**, **Stamina** and **Mobility** from the sessions you log.

**▶ [Open the demo](https://andreibautin.github.io/LifeOS/)** — no
sign-up, no account, nothing to install. It fills itself with generated
data the first time you open it. Everything stays in your browser.

It was a thirteen-area life hub once — a reading log, a map, a tech tree,
a house, money, quests. Each of those turned out to be done better by an
app that already does it, and the one thing nothing else did was the
lifting, so that is what this is now.

## The insight that makes it click

**Every number on screen is declared in one registry — ladders, ratings,
acts — and everything else is derived from that.** Strength, conditioning
and the warm-up are three areas, each feeding one trait, and all three are
counted off the same workout log.

There are exactly three kinds of number, and mixing them up is what
makes most trackers meaningless:

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Ladder** | Where you stand against a standard **outside the app**              |
| **Rating** | A monthly judgement about a **direction** — is this getting better? |
| **XP**     | Paid for **showing up**, and never for it having worked             |

Three rules hold between them, and they are tests rather than prose:

1. **No ladder is fed by XP.** A ladder must name a published standard —
   a squat, bench, deadlift and total against bodyweight multiples. If
   nothing outside the app anchors it, it is not a ladder, which is why
   conditioning and mobility have none.
2. **No rating is promoted to a ladder.** No measurement may be claimed
   by both.
3. **Nothing is counted twice.** Every act pays exactly one area.

The consequence that surprises people: **an area with nothing to say
says nothing.** No zeroes, no "0%", no empty progress bars — absent, and
the screen is honest about it. A level nobody earned is worse than an
obvious gap.

### Acts, not outcomes

XP is paid for a thing you _did_ and never for a thing that _happened_.

Finishing a session pays, and so does each working set, the conditioning
and the warm-up — whether they were _done_, never how heavy or how fast.
The number on the bar going up pays nothing: that is a measurement, and
it already has a ladder.

This is the line every gamified tracker crosses, and crossing it is what
turns them into things to optimise rather than things to use.

## What is worth looking at in the code

- **[`domain/game/registry.ts`](src/domain/game/registry.ts)** — the
  whole model, declared. An area joins the character sheet by gaining a
  row here.
- **[`domain/assembly/rp-assemble.ts`](src/domain/assembly/rp-assemble.ts)**
  — the training week, filled to per-muscle volume targets after
  subtracting what the strength work already spent.
- **[`domain/programs/progression.ts`](src/domain/programs/progression.ts)**
  — double progression: work a rep range, and when every set reaches the
  top of it, the next session's load goes up.
- **[`domain/sync/tombstone.ts`](src/domain/sync/tombstone.ts)** — why
  a deletion is recorded rather than simply performed: without it,
  importing an older backup quietly brings deleted records back.

## Architecture

Four layers, dependencies pointing inward only, **enforced by ESLint
rather than by convention** — breaking it fails the build with a message
explaining why.

```
features/  →  application/  →  domain/  ←  infrastructure/
```

| Layer             | May import         | Never imports                                     |
| ----------------- | ------------------ | ------------------------------------------------- |
| `domain/`         | nothing but itself | React, browser APIs, any library, any other layer |
| `application/`    | `domain/`          | `infrastructure/`, `features/`, React             |
| `infrastructure/` | `domain/`          | `features/`, `app/`, React                        |
| `features/`       | anything           | —                                                 |

`domain/` is pure — no React, no browser, no libraries — so set
resolution, volume accounting and the scoring model are all plain
functions that can be tested by calling them. Anything concrete is taken
as a parameter and wired in one file,
[`src/app/di.ts`](src/app/di.ts).

**The idea the model turns on: a prescription is not a number, it is a
rule for producing one.** "Five sets of 3–5, at whatever you last
worked at" is resolved against your own history when the session opens,
never stored in the programme. The programme itself is derived from
settings rather than stored — which is what makes it impossible for
editing a programme to rewrite history, the structural flaw in all three
apps this replaces.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for one request
traced end to end, naming real files.

## The demo

The deployed build is a demo build. It uses a separate storage namespace
(`lifeos.demo`), fills empty storage on first open, and **refuses to
overwrite anything already there**.

The fixture is generated code in this repository — there is no export
step from a personal device anywhere in the pipeline, so there is no path
by which real data could reach it. A test scans the fixture's own source
for emails, phone numbers, credentials and links.

Full detail, including how to reset it:
**[docs/DEMO_DATA.md](docs/DEMO_DATA.md)**.

## Your data

**No account, no server of ours, and no database of ours.** Everything
is in IndexedDB on the device. That constraint is the product rather
than a limitation, and it has consequences worth knowing:

- **Clearing cookies usually destroys it.** In every mainstream browser
  that control is really "cookies and other site data".
- **Nothing transfers on its own** unless you connect sync (below).
- **Export is what survives all of it**, and import is how data moves
  by hand.

### Syncing a phone and a desktop

Optional, free, and through a **private GitHub repository of your own**.
Settings → Sync across devices takes the repository and a fine-grained
token scoped to it. The app then keeps one backup file there: on launch,
on every page change (at most every fifteen seconds) and on returning to
the app, it reads the file, merges it in — **the newer edit wins**, and
a deletion on one device removes the record on the other — and writes
back only if something changed.

It reuses the backup format rather than inventing a sync protocol, so
the same envelope, checksum and tombstones that make an export safe to
import make a sync safe to merge. The token stays in that browser's
storage and is never in a backup or the synced file.

GitHub, when you connect sync, is the only host the app talks to.

### The sample data, and starting fresh

The deployed site fills itself with four months of a made-up lifter's
sessions on first open, so every screen has something to show. **Settings → Start fresh** deletes
it and leaves an empty app that is yours; **Load sample data** puts it
back into an empty one. A banner on the home screen says which you are
looking at until you dismiss it.

There was Firebase sync once, and it was removed: a second database kept
in step with this one was more machinery than one person on two devices
needs. The GitHub file above does the same job with no server and no
vendor beyond the one hosting the code.

The full account — install, uninstall, update, storage cleanup, and what
the app does about each — is in
**[docs/PERSISTENCE.md](docs/PERSISTENCE.md)**.

## Running it

```bash
pnpm install
pnpm dev
```

```bash
pnpm verify
```

`verify` is typecheck, lint, format check, tests and build. A pre-push
hook runs it and refuses the push if it fails; the same command gates the
deploy. **If it is green the change is shippable, and if it is not it is
not** — there is no third state.

The demo configuration, which is what deploys:

```bash
VITE_DEMO_MODE=true pnpm build && pnpm preview
```

## On a desktop

The same app, installed rather than wrapped. Open the site in Edge or
Chrome and choose **Install** — it opens in its own window, gets a
Start-menu entry, and pins to the taskbar.

There is no Electron build and there should not be. The manifest already
declares `display: standalone`, so an install is a real application
window; a wrapper would add a second thing to build, sign and update in
exchange for nothing this does not already do.

The layout widens at 1024px and again at 1280px, so a wide window is not
a phone layout stranded in the middle of a monitor.

## Tech, and why

- **React 19 + TypeScript** in strict mode with
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — this app
  indexes into weeks, days, slots and sets constantly.
- **Vite + `vite-plugin-pwa`** for the build and a Workbox service
  worker.
- **IndexedDB via `idb`** rather than `localStorage`: training history is
  unbounded, and "what did I lift last time" needs to be an index scan.
- **TanStack Query** with `staleTime: Infinity` — there is no server of
  ours, so nothing goes stale on its own.
- **Tailwind v4 + Radix** for styling and accessible primitives.
- **Vitest + fake-indexeddb** so tests exercise real database semantics,
  migrations included.

Roughly **1,480 tests** across 122 files, run on every push.

## Documentation

|                                                                         |                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                                 | Layers, the prescription model, a request traced end to end |
| [GAME_MODEL.md](docs/GAME_MODEL.md)                                     | The three currencies and the three rules, in full           |
| [DEMO_DATA.md](docs/DEMO_DATA.md)                                       | What the deployed fixture contains, and what keeps it safe  |
| [PERSISTENCE.md](docs/PERSISTENCE.md)                                   | Where data lives and what destroys it                       |
| [SECURITY.md](docs/SECURITY.md)                                         | Threat model for an app with no server                      |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                                     | Hosting, CI/CD, and the base-path trap                      |
| [TESTING.md](docs/TESTING.md)                                           | Strategy, and what is deliberately **not** tested           |
| [PRODUCTIONIZATION_ASSESSMENT.md](docs/PRODUCTIONIZATION_ASSESSMENT.md) | The honest audit this was hardened against                  |
| [INTERVIEW_GUIDE.md](docs/INTERVIEW_GUIDE.md)                           | What is worth talking about here, and what not to claim     |
| [REPOSITORY_ARCHAEOLOGY.md](docs/REPOSITORY_ARCHAEOLOGY.md)             | The eight apps this replaces, and what survived             |

## Origins

Consolidated twice.

First from three training repositories — StrengthFlow, LiftTracker and
ProgramBuilder — which shared one structural flaw: **the programme and
the workout log were the same database rows**, so editing a programme
rewrote history. The good ideas were kept; the implementations were not.

Then from five more — a backlog, a project manager, an upgrade planner, a
dashboard and a map — which lived here as areas of a life hub until the
app narrowed back to training. Their repositories are archived; the
history is in this one.

**This was called Lift.** The rename went all the way down — the
database, the `localStorage` prefix and the magic string at the top of
every backup file. Those are _addresses_, not labels: renaming one opens
a fresh empty one beside the old rather than migrating anything, so it
was a deliberate factory reset taken at the only moment it was free.

## Credits

The character figures are from
[game-icons.net](https://game-icons.net), by **Lorc** and
**Delapouite**, under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are
committed as SVG paths — in
[`src/features/character/figures.ts`](src/features/character/figures.ts)
— rather than fetched, so the app adds no outbound host for them. The
same credit is shown in the app at the foot of Settings.
