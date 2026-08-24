# Lift

Build strength programs and track the workouts that follow them.

One app where the programming and the logging are the same system: 5/3/1
sets the main work, your split decides how the week is laid out, and
assistance is filled to weekly volume targets — after subtracting what
the main and supplemental work already spent.

**It works entirely offline. There is no account, no server, and your
data never leaves your device.**

## What it does

**Follow a program.** One exercise fills the screen. Each set shows what
was prescribed and what you did last time, prefilled, so logging is a tap
and two numbers. A rest timer runs off the wall clock, so a phone in your
pocket does not under-report four minutes as ninety seconds.

**Build a program.** Pick a framework, a split, and how much assistance
volume to fill in. The result is an ordinary editable program — every
percentage, rep, set, exercise, rest period and progression rule can be
changed. The programs that ship are built by the same machinery, so
nothing is a locked preset.

**Composition, not presets.** Six built-ins ship, and they are all the
same three layers arranged differently:

| Layer                          | Supplies                                                                                                                                            | Driven by                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Framework** — 5/3/1          | The main lift: TM percentages, 5s/3s/5-3-1/deload weeks, AMRAP sets, Boring But Big or First/Second Set Last supplemental, per-cycle TM progression | Training maxes            |
| **Split** — 2 to 6 days        | Day count, which of the four lifts lands where, which muscles each day covers                                                                       | Your choice               |
| **Assistance** — RP principles | Everything after the main work, filled to per-muscle weekly targets, ramped across the cycle, cut on the deload                                     | MEV / MAV / MRV landmarks |

The third layer measures what the first two spent. A bench day under BBB
already carries eight chest sets, so it gets no chest accessories; its
rear delts have had none, so they get their full share.

**Autoregulation that remembers.** Check-ins are recorded, not acted on
blindly. Three consistent sessions of evidence before a volume landmark
moves, always inside the recoverable band, always shown to you first.

**Working up to a new max, two ways.** Continuously, from every cycle's
AMRAP set; and explicitly, via a peaking block that tapers and finishes
on a tested single, from which the training maxes are re-derived.

## Your data

It lives in IndexedDB on this device and nowhere else. That is the
product, not a limitation — but it has consequences worth knowing before
you rely on it:

- **Clearing cookies usually destroys it.** In every mainstream browser
  the control is really "cookies and other site data".
- **Nothing transfers** to a new phone or a different browser.
- **Export is the only thing that survives all of it.** The app will ask
  you to, after a fortnight or ten sessions.

The full account — what happens on install, on uninstall, on update, on
storage cleanup, and what the app does about each — is in
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
deploy. If it is green the change is shippable, and if it is not it is
not — there is no third state.

## Architecture

Four layers, dependencies pointing inward only, enforced by ESLint rather
than by convention:

```
features/  →  application/  →  domain/  ←  infrastructure/
```

`domain/` is pure — no React, no browser, no libraries. Set resolution,
progression rules and volume mathematics are all plain functions, which
is why a 5/3/1 percentage can be tested by calling it.

The idea the model turns on: **a prescription is not a number, it is a
rule for producing one.** `85% of a training max for 5+` and `RPE 8 for
10–15` are the same kind of thing, which is what lets one builder express
both. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

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

Consolidated from three earlier repositories — StrengthFlow, LiftTracker
and ProgramBuilder — none of which contained any 5/3/1, and all three of
which shared one structural flaw: the program and the workout log were
the same database rows, so editing a program rewrote history. The good
ideas were kept, the implementations were not.
