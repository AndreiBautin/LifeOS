# LifeOS

Six things worth tracking, in one app, scored by one model.

It started as a strength-training app and still has the deepest roots
there — RTS autoregulation runs the three competition lifts, your split
decides how the week is laid out, and hypertrophy volume is filled to
weekly targets after subtracting what the strength work already spent.
Five more areas were absorbed into it: a backlog, a quest log of
projects, a tech tree of things to save up for, a circle of people worth
seeing, and a map with fog that clears as you walk.

**The insight that makes it click:** the areas are not separate apps
sharing a shell. Each declares what it has — ladders, ratings, acts — in
one registry, and everything else is derived from that. A ladder is
anchored to something external and says where you stand. A rating is a
monthly judgement about a direction. XP is paid for showing up and never
for it having worked. An area with nothing to say says nothing, because a
level nobody earned is worse than an obvious gap.

**No account, no server of ours, and no database of ours.** Everything is
in IndexedDB on the device. Two third parties are reached, both only from
the screens that need them: OpenStreetMap for map tiles and for turning a
place name into coordinates, and Firebase for syncing two devices when
you configure it. Neither is something this project runs.

## What it does

**Follow a program.** One exercise fills the screen. Each set shows what
was prescribed and what you did last time, prefilled, so logging is a tap
and two numbers. A rest timer runs off the wall clock, so a phone in your
pocket does not under-report four minutes as ninety seconds.

**Build a block.** Set what you are prioritising, how long a session
should run, and how long a block should be. The result is an ordinary
editable program — every rep, set, exercise, rest period and RPE target
can be changed. The programs that ship are built by the same machinery,
so nothing is a locked preset.

**Composition, not presets.** Built-ins are all the same three layers
arranged differently:

| Layer                   | Supplies                                                                                     | Driven by                 |
| ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| **Strength** — RTS      | Squat, bench, deadlift: a top set at reps × RPE, back-off work sized by measured fatigue     | How the top set felt      |
| **Split** — 2 to 6 days | Day count, which lift lands where, which muscles each day covers                             | Average session length    |
| **Hypertrophy** — RP    | Everything else, filled to per-muscle weekly targets, ramped across the block, cut on deload | MEV / MAV / MRV landmarks |

The third layer measures what the first two spent. A bench day already
carries chest sets, so it gets fewer chest accessories; its rear delts
have had none, so they get their full share.

**Prioritisation, not ramping.** Tiers decide where inside each landmark
band a muscle's target sits — and the app knows the difference between a
concentrated top tier, which can be pushed near the ceiling because the
rest of the body subsidises it, and a top tier holding half the body,
which cannot.

**Autoregulation that remembers.** Check-ins are recorded, not acted on
blindly. Three consistent sessions of evidence before a volume landmark
moves, always inside the recoverable band, always shown to you first.

## Your data

It lives in IndexedDB on this device and nowhere else. That is the
product, not a limitation — but it has consequences worth knowing before
you rely on it:

- **Clearing cookies usually destroys it.** In every mainstream browser
  the control is really "cookies and other site data".
- **Nothing transfers** to a new phone or a different browser.
- **Export is the only thing that survives all of it.** The app will ask
  you to, after a fortnight or ten sessions. It carries everything — all
  six areas, the monthly reviews, and the ground you have walked — not
  just the training half.

The full account — what happens on install, on uninstall, on update, on
storage cleanup, and what the app does about each — is in
**[docs/PERSISTENCE.md](docs/PERSISTENCE.md)**.

### Syncing two devices

Optional, off unless configured, and off by default. Configure a Firebase
project and a phone and a desktop can share one history; configure
nothing and the app is exactly what it was — local, offline, and
unaware a network exists.

1. Create a Firebase project, enable **Google** as a sign-in provider,
   and create a **Firestore** database.
2. Copy the four values into `.env.local` (see `.env.example`).
3. Publish `firestore.rules`. **Do not skip this** — a Firestore left on
   the default test rules is readable by anyone who finds the project id.
4. Settings → Sync → sign in, then **Sync now** on each device.

Three things worth knowing before relying on it:

- **Nothing syncs on its own.** There is no background loop and no timer,
  deliberately: a sync that fires while a set is being logged is a
  surprise in the middle of a working set. You press the button.
- **The Firebase config in the bundle is public**, and that is not a
  leak. A web config identifies a project; it authorises nothing. Access
  is decided entirely by `firestore.rules`, which pins every document to
  the account that owns it.
- **Your position in the block does not sync.** It is the one record two
  devices cannot reconcile by comparing timestamps — both advance the
  same cursor and neither is wrong — so each device keeps its own. Train
  on the phone and it stays right there.

### Locking the app to one account

Optional, and off unless configured. Set `VITE_ALLOWED_UIDS` to your
Firebase account id and the app refuses anybody else — a sign-in screen
in front of every route, and a refusal screen for an account that is not
on the list.

Be clear about what it does and does not buy:

- **It does not protect the synced data.** `firestore.rules` already
  pins every document to one account and always has. That file, not this
  variable, is what stands between the data and the internet.
- **It does not protect the device.** IndexedDB belongs to whoever holds
  the phone, and a gate drawn in JavaScript does not change that.
- **It is not a lock on the phone either.** A session persists on
  purpose, so an unlocked device opens straight through rather than
  asking every morning.
- **What it does buy** is that the app stops being usable by whoever
  finds the page. Before it, opening the deployed page gave anybody a
  complete working application against their own storage.

It **fails open** on an empty value. A gate that bricked the app for want
of a variable would be worse than no gate, and there is nothing behind it
that failing closed would protect. The Settings screen says which state
the build is in rather than leaving it to be guessed.

The deployed build sets it, so **there is no public demo any more** —
opening the page gets a sign-in screen. That is the trade for keeping
the repository public, which it has to be: GitHub Pages does not serve
a private repository on a free plan, and making this one private
unpublished the site until it was made public again.

## Running it

Double-click `start-app.bat`, or:

```bash
pnpm install
pnpm dev
```

```bash
pnpm verify
```

`verify` is typecheck, lint, format check, tests and build. A pre-push
hook runs it and refuses the push if it fails; the same command gates the
deploy. If it is green the change is shippable, and if it is not it is
not — there is no third state.

## On a desktop

It is the same app, installed rather than wrapped. Open the deployed site
in Edge or Chrome, then **Install LifeOS** — the icon in the address bar,
or the browser menu. It opens in its own window with no browser chrome,
gets a Start-menu entry, and can be pinned to the taskbar from there.

There is no Electron build and there should not be. The manifest already
declares `display: standalone`, so an install is a real application
window; a wrapper would add a second thing to build, sign and update in
exchange for nothing this does not already do.

**The two copies share data through Firestore, not through a filesystem.**
Each device keeps its own IndexedDB and they exchange in the background —
see [docs/PERSISTENCE.md](docs/PERSISTENCE.md). Sign in with the same
account on both, or they will not find each other. Nothing is served from
one machine to the other, so there is no port to open and no VPN.

The layout is capped at 672px and centred, so a wide window is the phone
layout in the middle of the screen rather than a stretched one.

## Architecture

Four layers, dependencies pointing inward only, enforced by ESLint rather
than by convention:

```
features/  →  application/  →  domain/  ←  infrastructure/
```

`domain/` is pure — no React, no browser, no libraries. Set resolution,
fatigue mathematics and volume accounting are all plain functions, which
is why an RTS back-off can be tested by calling it.

The idea the model turns on: **a prescription is not a number, it is a
rule for producing one.** `5 reps at RPE 8` and `10–15 at RPE 9` are the
same kind of thing, and the number is worked out against your current
estimate when the session opens — never stored in the program. See
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Tech, and why

- **React 19 + TypeScript** in strict mode with `exactOptionalPropertyTypes`
  and `noUncheckedIndexedAccess` — this app indexes into weeks, days,
  slots and sets constantly.
- **Vite + `vite-plugin-pwa`** for the build and a Workbox service worker.
- **IndexedDB via `idb`** rather than localStorage: training history is
  unbounded, and "what did I lift last time" needs to be an index scan.
- **TanStack Query** with `staleTime: Infinity` — there is no server, so
  nothing goes stale.
- **Tailwind v4 + Radix** for styling and accessible primitives.
- **Vitest + fake-indexeddb** so tests exercise real database semantics,
  migrations included.

## Documentation

|                                                             |                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                     | Layers, the prescription model, a request traced end to end |
| [PERSISTENCE.md](docs/PERSISTENCE.md)                       | Where data lives and what destroys it                       |
| [REPOSITORY_ARCHAEOLOGY.md](docs/REPOSITORY_ARCHAEOLOGY.md) | The three apps this replaces, and what survived             |
| [TESTING.md](docs/TESTING.md)                               | Strategy, and what is deliberately not tested               |
| [SECURITY.md](docs/SECURITY.md)                             | Threat model for an app with no server                      |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                         | Hosting, CI/CD, and the base-path trap                      |

## Origins

**This was called Lift**, and lived at `andreibautin.github.io/Lift/`.
The name stopped describing it once five other apps were absorbed.

The rename went all the way down — the database, the `localStorage`
prefix and the magic string at the top of every backup file all say
`lifeos` now. Those are _addresses_, not labels: renaming one does not
migrate anything, it opens a fresh empty one beside the old. So this was a
factory reset, done deliberately at the only moment it was free, rather
than a migration written later or a database called `lift` living inside
an app called LifeOS forever.

If you had the old app installed, reinstall from the new URL. It will come
up empty.

Consolidated twice.

First from three training repositories — StrengthFlow, LiftTracker and
ProgramBuilder — which shared one structural flaw: the program and the
workout log were the same database rows, so editing a program rewrote
history. The good ideas were kept, the implementations were not.

Then from five more, each now archived and pointing here:

| Was                                                                | Is                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| [Backlogs](https://github.com/AndreiBautin/Backlogs)               | The backlog, with its daily goals and progress log        |
| [ProjectManager](https://github.com/AndreiBautin/ProjectManager)   | Projects — scoring, blockers, and what to do next         |
| [upgrade-planner](https://github.com/AndreiBautin/upgrade-planner) | The tech tree, gated on money and prerequisites           |
| [Dashboard](https://github.com/AndreiBautin/Dashboard)             | Not an area — the scoring spine every area plugs into     |
| [Map](https://github.com/AndreiBautin/Map)                         | The atlas: places, trips, and fog that clears as you walk |

One repository deliberately did **not** move.
[career-command-center](https://github.com/AndreiBautin/career-command-center)
polls ATS boards over the network and drives a real browser to fill in
application forms — a server and a robot, neither of which a client-only
PWA can be. Absorbing its tracker while losing those was a worse trade
than leaving it whole.

An earlier version of this app ran 5/3/1 as its default framework. It was
removed once RTS became the only way strength is run — carrying two
frameworks meant two assemblers, two recipe vocabularies and two
progression models for a methodology no longer in use. It is in the git
history.

## Credits

The character figures and the buff icons are from
[game-icons.net](https://game-icons.net), by **Lorc** and
**Delapouite**, used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are
committed as SVG paths — five figures in
`src/features/character/figures.ts` and ten icons in
`src/features/limits/pool-icons.ts` — rather than fetched, so the app
adds no outbound host for them; the same credit is shown in the app at
the foot of Settings.
