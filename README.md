# LifeOS

A gamified productivity system: thirteen areas of one life, in one app,
scored by one model.

**▶ [Open the demo](https://andreibautin.github.io/LifeOS/)** — no
sign-up, no account, nothing to install. It fills itself with generated
data the first time you open it. Everything stays in your browser.

Training, quests, a reading and playing log, a house, a tech tree of
things to save up for, money, a map with fog that clears as you walk, a
practice log, a seasonal challenge pass. Each pays into one currency and
one character sheet.

## The insight that makes it click

The areas are not separate apps sharing a shell. **Each declares what it
has — ladders, ratings, acts — in one registry, and everything else is
derived from that.**

There are exactly three kinds of number, and mixing them up is what
makes most trackers meaningless:

|            |                                                                     |
| ---------- | ------------------------------------------------------------------- |
| **Ladder** | Where you stand against a standard **outside the app**              |
| **Rating** | A monthly judgement about a **direction** — is this getting better? |
| **XP**     | Paid for **showing up**, and never for it having worked             |

Three rules hold between them, and they are tests rather than prose:

1. **No ladder is fed by XP.** A ladder must name a published standard —
   a powerlifting total against bodyweight multiples, a credit score
   against FICO's own bands, net worth against the Federal Reserve's
   percentiles. If nothing outside the app anchors it, it is not a
   ladder. There is no published figure for how good at seeing your
   friends you ought to be, so that area never had one.
2. **No rating is promoted to a ladder.** No measurement may be claimed
   by both.
3. **Nothing is counted twice.** Every record pays exactly one area.

The consequence that surprises people: **an area with nothing to say
says nothing.** No zeroes, no "0%", no empty progress bars — absent, and
the screen is honest about it. A level nobody earned is worse than an
obvious gap.

### Acts, not outcomes

XP is paid for a thing you _did_ and never for a thing that _happened_.

Sending a job application pays; being given an interview does not.
Logging a workout pays; the number going up does not. Ticking a habit
pays; a thirty-day streak pays nothing extra. Typing in your net worth
pays nothing at all — that is a measurement, and paying for the number
rising would be paying for an outcome.

This is the line every gamified tracker crosses, and crossing it is what
turns them into things to optimise rather than things to use.

## What is worth looking at in the code

- **[`domain/game/registry.ts`](src/domain/game/registry.ts)** — the
  whole model, declared. An area joins the character sheet by gaining a
  row here.
- **[`domain/assembly/rp-assemble.ts`](src/domain/assembly/rp-assemble.ts)**
  — the training week, filled to per-muscle volume targets after
  subtracting what the strength work already spent.
- **[`domain/sync/payload.ts`](src/domain/sync/payload.ts)** — merge
  rules. Most records are whole-record last-write-wins; three are not,
  and the comments say why a record-level winner loses a day of habits.
- **[`features/upgrades/tree-layout.ts`](src/features/upgrades/tree-layout.ts)**
  — pure graph layout, in the feature rather than the domain, because
  positions are presentation.
- **[`CLAUDE.md`](CLAUDE.md)** — the decision log. Every load-bearing
  invariant, why it exists, and what it cost to learn. It is long
  because the app is, and it is the most useful thing here for
  understanding _why_ rather than _what_.

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
rule for producing one.** "Three sets of 3–5, at whatever you last
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
- **Nothing transfers** to a new phone or a different browser on its own.
- **Export, or configured sync, is what survives all of it.**

Three third parties are reachable, each only from the screens that need
them: OpenStreetMap for map tiles, Nominatim for turning a place name
into coordinates, and Firebase for syncing two devices when you
configure one. **Each was a decision, not a precedent.**

The full account — install, uninstall, update, storage cleanup, and what
the app does about each — is in
**[docs/PERSISTENCE.md](docs/PERSISTENCE.md)**.

### Syncing two devices

Optional, and off unless configured. With a Firebase project, a phone
and a desktop share one history; with none, the app is exactly what it
was — local, offline, and unaware a network exists.

1. Create a Firebase project, enable **Google** sign-in, create a
   **Firestore** database.
2. Copy the four values into `.env.local` (see `.env.example`).
3. Publish `firestore.rules`. **Do not skip this** — a Firestore on the
   default test rules is readable by anyone who finds the project id.

Worth knowing:

- **It runs itself, and refuses while a workout is open.** A sync that
  fires mid-set is a surprise in the middle of a working set. A beacon
  document makes remote changes arrive within a second or two; a
  five-minute poll is the safety net behind it.
- **The Firebase config in the bundle is public, and that is not a
  leak.** A web config identifies a project; it authorises nothing.
  Access is decided entirely by `firestore.rules`, which pins every
  document to the account that owns it.
- **Your position in the training block does not sync.** It is the one
  record two devices cannot reconcile by timestamp — both advance the
  same cursor and neither is wrong — so each device keeps its own.

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

### The Firestore emulator

```bash
pnpm emulator
```

Needs a **JDK 21 or newer** on `PATH` — `firebase-tools` refuses
anything older and the error names the version rather than the cause. On
Windows: `winget install EclipseAdoptium.Temurin.21.JDK`.

It loads [firestore.rules](firestore.rules), so a test runs against the
same access rules the deployed app would: an unauthenticated write is
denied there exactly as it would be in production.

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
- **Firestore**, optionally, for sync only. The merge rules live in
  `domain/sync/`, not in the database.
- **Tailwind v4 + Radix** for styling and accessible primitives.
- **Vitest + fake-indexeddb** so tests exercise real database semantics,
  migrations included, and **the Firestore emulator** so the access
  rules are exercised too.

Roughly **1,400 tests** across 119 files, run on every push.

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
| [REPOSITORY_ARCHAEOLOGY.md](docs/REPOSITORY_ARCHAEOLOGY.md)             | The eight apps this replaces, and what survived             |

## Origins

Consolidated twice.

First from three training repositories — StrengthFlow, LiftTracker and
ProgramBuilder — which shared one structural flaw: **the programme and
the workout log were the same database rows**, so editing a programme
rewrote history. The good ideas were kept; the implementations were not.

Then from five more, each now archived and pointing here:

| Was                                                                | Is                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| [Backlogs](https://github.com/AndreiBautin/Backlogs)               | The Codex, with its daily goals and progress log          |
| [ProjectManager](https://github.com/AndreiBautin/ProjectManager)   | Quests — scoring, blockers, and what to do next           |
| [upgrade-planner](https://github.com/AndreiBautin/upgrade-planner) | The tech tree, gated on money and prerequisites           |
| [Dashboard](https://github.com/AndreiBautin/Dashboard)             | Not an area — the scoring spine every area plugs into     |
| [Map](https://github.com/AndreiBautin/Map)                         | The atlas: places, trips, and fog that clears as you walk |

**This was called Lift.** The rename went all the way down — the
database, the `localStorage` prefix and the magic string at the top of
every backup file. Those are _addresses_, not labels: renaming one opens
a fresh empty one beside the old rather than migrating anything, so it
was a deliberate factory reset taken at the only moment it was free.

## Credits

The character figures and the buff icons are from
[game-icons.net](https://game-icons.net), by **Lorc** and
**Delapouite**, under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are
committed as SVG paths — in
[`src/features/character/figures.ts`](src/features/character/figures.ts)
and [`src/features/limits/pool-icons.ts`](src/features/limits/pool-icons.ts)
— rather than fetched, so the app adds no outbound host for them. The
same credit is shown in the app at the foot of Settings.
