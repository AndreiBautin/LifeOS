# Architecture

A client-only React + TypeScript PWA. **No server of ours and no
database of ours** — records live in IndexedDB, or in Firestore when a
project is configured, always behind a repository interface.

That qualifier matters and is stated up front rather than buried: this
document used to open "no network calls at runtime", which was never
true once Leaflet was rendering live tiles. Three third parties are
reachable, each only from the screens that need them — OpenStreetMap for
map tiles, Nominatim for turning a name into coordinates, and Firebase
for sync. **Each was a decision, not a precedent.**

## The layers

Dependencies point **inward only**, enforced by ESLint
(`no-restricted-imports` in `eslint.config.js`), so breaking it fails the
build with a message explaining why — not by convention.

```
   ┌───────────────────────────────────────────────────┐
   │  features/  ·  app/  ·  components/               │  React
   │  screens, hooks, the composition root             │
   └───────────────────────┬───────────────────────────┘
                           │
   ┌───────────────────────▼───────────────────────────┐
   │  application/                                     │  use-cases
   │  start a workout, log a set, finish, score a life │
   └───────────────────────┬───────────────────────────┘
                           │
   ┌───────────────────────▼───────────────────────────┐
   │  domain/                          ◄───────────────┼── infrastructure/
   │  pure. no React, no browser, no libraries         │   IndexedDB, Firestore,
   │  prescriptions, resolution, progression, scoring  │   backup, settings
   └───────────────────────────────────────────────────┘
```

| Layer               | May import         | Never imports                                     |
| ------------------- | ------------------ | ------------------------------------------------- |
| `domain/`           | nothing but itself | React, browser APIs, any library, any other layer |
| `application/`      | `domain/`          | `infrastructure/`, `features/`, React             |
| `infrastructure/`   | `domain/`          | `features/`, `app/`, React                        |
| `features/`, `app/` | anything           | —                                                 |

If a use-case needs something concrete — a repository, a clock, an id
generator — it **takes it as a parameter**. `src/app/di.ts` is the only
file allowed to name a concrete implementation.

Three more rules are lint rules rather than habits: no `console` outside
the logger, no `localStorage` outside `infrastructure/storage/`, no bare
`new Date()` anywhere (take a `Clock`).

## The idea the whole model turns on

**A prescription is not a number.** It is a rule for producing one.

```
LoadSource = percent-e1rm | bodyweight | absolute | working | rpe | rts-backoff | open

RepTarget  = fixed | range | amrap | time
```

The programme is **double progression**, and the whole method is two
sentences: work in a rep range for three straight sets, and when every
set reaches the top of it, put the next increment on the bar.

| Prescription                     | Reads as                        |
| -------------------------------- | ------------------------------- |
| `working × range(3, 5)`          | A competition lift              |
| `working × range(5, 10)`         | An accessory compound           |
| `working × range(15, 30)`        | An isolation                    |
| `bodyweight(+25) × range(6, 12)` | Weighted chins                  |
| `percent-e1rm(85) × range(3, 5)` | The first session of a new lift |

**`working` carries no number of its own**, which is the point. The load
is a fact about your history rather than about the plan, so it is
resolved against `AthleteState.working` — built from the logged sessions
when the workout starts — and a slot that has never been trained
resolves to **open**: you type what you did, and it carries from then on.

`rpe` and `rts-backoff` are still in the union and must not be tidied
away. Nothing prescribes them any more, but **a log describes itself**:
every `WorkoutLog` embeds the prescription it was performed under, so
sessions filed while RTS ran still hold `rpe` sets. Removing the
variants would not delete those records, it would make them unreadable.

**Resolution** turns a prescription into a number, on demand:

```ts
resolveSet(prescription, { athlete, exerciseId, roundingIncrement }): ResolvedSet
```

Pure. No I/O, no clock, no database. It is where almost all the tests
live, and it is why the working load is read by the _caller_ and handed
in rather than looked up here.

## How a week is built

The programme is **derived, never stored**. `deriveProgram(settings,
library)` in `application/use-cases/programs/current-program.ts` returns
a `ProgramTemplate`; only the _position_ in it persists.

Storing the programme produced the same bug four times — a change
reaching the code and not the copy on the device — and each fix patched
one delivery route while leaving the others open. There is no library, no
built-in programme, no instance, no frozen snapshot, and nothing to press
to pick up a change.

Derivation is **deterministic**: same settings in, byte-identical
programme out, slot ids included. A workout in progress refers to its day
by position and its sets by index, so a programme that differed between
reads would make every one of those a guess. That is why assembly takes
an id generator as a parameter and `current-program.ts` passes a counter
rather than `crypto.randomUUID`.

Two layers stack, and the second is told what the first spent:

1. **The split** — three full-body days, Monday, Wednesday and Friday,
   each opening on one competition lift (`domain/splits/rp-splits.ts`).
   A muscle's accessory work sits on the day whose main lift does _not_
   already train it: chest on Monday because it is benched on Wednesday,
   upper back on Wednesday because it is deadlifted on Friday.
2. **Hypertrophy volume** — fills each day to its share of every
   muscle's weekly target (`domain/assembly/rp-assemble.ts`,
   `domain/volume/`). The whole volume model is one multiplication:
   `weekly sets = sessions a week × sets per session for its level`.

**Strength sets are not hypertrophy volume**, and that reverses an
earlier rule worth knowing about. The fill used to subtract what the
competition lifting had already paid a muscle. Triples broke it: a top
set of three plus back-off triples is a real strength dose and close to
nothing as hypertrophy, which the accounting still called eight sets —
and eight covered the chest's entire target, so the week scheduled no
chest work at all. They are counted apart now.

`assembleRpProgram(recipe, id, deps)` emits an ordinary
`ProgramTemplate`. Nothing downstream knows a programme was assembled,
which is the test that the builder is genuinely general.

## Programme versus log

The single most important structural rule, and the one all three source
repositories broke.

- A **`ProgramTemplate`** is a plan. It stores intent, never a result —
  and here it is derived rather than stored, so there is nothing to write
  back into.
- A **`WorkoutLog`** is what happened. It embeds the prescription,
  planned load and planned reps of every set, and is **never written back
  into the template**.

In LiftTracker, generating a programme wrote every `Set` row to the
database and logging a workout mutated those same rows. The programme
_was_ the log: editing a programme corrupted history, a cycle could not
be repeated, and planned-versus-actual could not be compared because only
one of the two survived.

A log describing itself is also what made the frozen snapshot
unnecessary. **Do not "normalise" this by referencing a programme
instead.**

## A request, traced end to end

Starting Wednesday's session and logging the first set of the bench:

1. **`features/train/TrainPage.tsx`** renders the next day and calls
   `useStartWorkout()`.
2. **`features/train/hooks.ts`** resolves `AppServices` from context and
   calls the use-case.
3. **`application/use-cases/training/start-workout.ts`** reads the stored
   position, clamps it inside the derived programme (`clampPosition` —
   the programme can get shorter under a lifter), and finds the day.
4. It then builds `working` from history: for each exercise in _this
   day only_, `workingLoads` asks
   `deps.workouts.forExercise(id, …)` and `lastPerformance` reads the
   heaviest completed working set. The whole catalogue would be fifty
   queries for a six-exercise day.
5. **`domain/programs/progression.ts`** — pure — decides the next load.
   `topped(last, range)` asks whether every set reached the top of the
   range; if so `nextLoad` adds `stepFor(exercise)`, which is **5 lb
   upper and 10 lb lower**, derived from the movement rather than written
   on all fifty exercises. Three sets of 5 at 185 becomes **190**.
6. **`domain/resolution/resolve.ts`** — also pure — turns
   `working × range(3,5)` into that number, rounded by
   **`domain/units/weight.ts`** to the gym's increment. With no history
   at all, a _strength_ slot falls back to 85% of the estimated max
   (about a five-rep load) and everything else resolves to **open**,
   which says honestly that the app does not know what you curl.
7. The resolved numbers are copied into a new `WorkoutLog` as
   `plannedLoad`, so an estimate revised next month does not
   retroactively alter what this session says it asked for.
8. **`infrastructure/firestore/repositories.ts`** writes it — or
   `infrastructure/db/repositories.ts` when no Firebase project is
   configured. `src/app/di.ts` picks between them once, at boot.
9. The lifter taps the set. **`SetRow.tsx`** opens prefilled with 190 × 5.
10. **`application/use-cases/training/log-set.ts`** writes `actualLoad`,
    `actualReps` and `completedAt` beside the planned values.
11. On finish, **`finish-workout.ts`** computes the report, then advances
    the position by one day — _on completion, not on the calendar_, so a
    missed Wednesday costs nothing.

Step 5 is the whole redesign, and no single test exercises it end to end:
a bench opened at 200 from a 238 estimate, three sets of five were
logged, the session filed, and **the same lift opened at 205 the next
week**. That round trip was verified by driving the app.

## Where the records live

`bootstrap()` in `src/app/di.ts` picks the store **once**, on whether a
Firebase project is configured:

| Configured                       | Not configured               |
| -------------------------------- | ---------------------------- |
| Firestore is the source of truth | IndexedDB, exactly as before |

The unconfigured path is kept on purpose — the app has to be runnable
with no account and no network, which is what a fork, a fresh clone and
the deployed demo all get.

**Device state stays local either way.** The programme position is the
one record with no correct last-write-wins answer — two devices both
advancing one cursor cannot be reconciled by timestamp — and the settings
hold preferences two machines legitimately disagree about. Neither
belongs in a shared store.

The account arrives _after_ the repositories exist, which is why they
read an `AccountHolder` per call rather than taking a uid: `bootstrap`
runs before sign-in resolves. `AuthGate` sets it **during render, not in
an effect** — effects run after the commit, so every screen below would
mount and fire its queries against an empty holder, throw, and sit at
`data === undefined`, which is the same state a card draws a skeleton
for. The whole app came up as placeholders on a device that had signed
in perfectly well. `AuthGate.test.tsx` is the first component test here
and exists for exactly that.

`watchRecords` is one `onSnapshot` per collection, and a snapshot
carrying `hasPendingWrites` or `fromCache` is skipped — otherwise saving
would invalidate the query that just wrote, refetch, and do it again.

## What sync still has to get right

Most records are whole-record last-write-wins, which is correct for a
workout: you log sets on the phone and read them at the desk. Three are
not, and `domain/sync/payload.ts` says why:

- **A progress log is unioned by day.** A chapter on the phone on Monday
  and an episode on the laptop on Tuesday, with neither device having
  heard from the other, loses Monday entirely under a record-level
  winner.
- **A pool's spends are unioned over the string.** `readCharges` counts
  _entries_, so a record-level winner would not merely lose a row — it
  would hand back a charge that was genuinely spent.
- **The fog is a grow-only set.** No stamp and no tombstone, because
  neither question arises: two copies merge by union and you cannot
  un-walk ground.

**A deletion is a fact, not an absence.** Removing a row leaves nothing
behind, and nothing is indistinguishable from "never existed" — so any
merge reads it as a record the other copy knows about and puts it back.
`repositories.remove` writes a tombstone for that reason. (With Firestore
as the source of truth there is one authoritative copy and no tombstone
is written; the machinery is still declared, because the backup envelope
and the backlog transfer both carry them.)

## The scoring spine

`domain/game/registry.ts` declares what each area has — ladders, ratings,
acts — and `application/use-cases/character/sheet.ts` turns those
declarations into one readout, restating nothing. **An area appears on
the character sheet by gaining a row in the registry.**

The three currencies read from three different places, and that is the
whole point of having three:

| Currency   | Read from        | Why not the others                                                             |
| ---------- | ---------------- | ------------------------------------------------------------------------------ |
| **Ladder** | live measurement | Anchored externally; its answer must not depend on whether a review was opened |
| **Rating** | a recorded month | A judgement about a direction, which needs two points in time                  |
| **XP**     | a tally of acts  | Paid for doing, never for it having worked — an outcome already moved a ladder |

Three rules hold between them, and they are **tests rather than prose**
(`registry.test.ts`): no ladder is fed by XP, no rating is promoted to a
ladder, and nothing is counted twice.

The XP tally is **derived from the records**, never stored as a counter.
A counter cannot survive two devices — both increment it,
last-write-wins throws one away — and cannot survive a restore either.

**Traits are a projection of that same XP, not a fourth currency.** Each
area belongs to at most one trait, so the bars can never double-count.
Six areas belong to none, listed exactly in `UNCLAIMED_AREAS` — so an
area added tomorrow with no trait still fails the build until somebody
says which it is.

**The rating half of the model is dormant.** The monthly review screen
was removed and it was the only thing that filed a month, so `readout`
still reads whatever was filed before and nothing new arrives. If ratings
are wanted back, **the missing piece is a screen rather than a rule**.
`measureAll` is live and must stay — the sheet's ladders read it.

An area with no measurement, no recorded rating and no acts is
**silent** and renders nothing at all. `insufficient-data` counts as
silence: it is the absence of a judgement, not a bad one.

## The atlas, and the one boundary that differs

Places, trips and the fog live in `domain/atlas/`, the only domain here
that returns `Result<T, E>` where everything else throws. That was
deliberate on absorption: rewriting fifteen thousand lines to match would
have been a large change with no behavioural payoff, so `Result` stays
inside `domain/atlas/` and is unwrapped once, at
`application/use-cases/atlas/atlas.ts`. Everything above sees
`{ error }` — the shape the quest log and the tech tree already use.

Ground is stored as geohash cells at precision 7 (~153 m). A visited
place's ground is **derived** from the place rather than stored beside
it, so editing or un-visiting one stays correct with no second copy to
drift. `revealCell` refuses any fix worse than 100 m, because fog cleared
by a bad reading cannot be put back.

Searching by name asks **Nominatim**, which is rate-limited to one
request a second and run on donations: the query debounces at 500 ms, the
adapter enforces the floor again, and results cache for five minutes.

The exploration ladder divides walked area by the area of the region
being explored — and nothing in the app knows which region is meant, so
that number is typed into settings. Until it is, the ladder reads
**absent** rather than zero.

## The demo build

`VITE_DEMO_MODE=true` moves the database name and every storage key to a
`lifeos.demo` prefix and runs `seedDemoData` before the first render,
only into empty storage. It is what deploys. See
[DEMO_DATA.md](DEMO_DATA.md).

The seeder lives in `application/use-cases/demo/` and drives the app's
own use cases rather than writing records, so a fixture that compiles is
a fixture the app could have produced. The workout history is the one
exception, and it says why in place.

## Technology, and why

| Choice                      | Why                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **React 19 + TS**           | Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — this app indexes into weeks, days, slots and sets constantly |
| **Vite**                    | Fast, and `vite-plugin-pwa` gives Workbox without hand-writing a service worker                                                             |
| **IndexedDB via `idb`**     | ~1 KB promise wrapper. The repository port is already the seam; a heavier ORM behind it earns nothing                                       |
| **Firestore**               | Optional, for sync only. The merge rules live in `domain/sync/`, not in the database                                                        |
| **TanStack Query**          | Caching and invalidation with `staleTime: Infinity` — there is no server of ours, so nothing goes stale on its own                          |
| **Tailwind v4 + Radix**     | Utility styling with accessible primitives where behaviour matters                                                                          |
| **Vitest + fake-indexeddb** | Real database semantics in tests, including migrations, without a browser — and the Firestore emulator for the access rules                 |

## What is deliberately absent

- **No auth of ours.** Sign-in is Google through Firebase, and only when
  sync is configured. `firestore.rules` pins every document to one uid.
- **No state-management library beyond context.** Server-ish state is
  TanStack Query's; the rest is component state. Redux would be ceremony.
- **No chart library.** The charts that matter are a handful of `div`s
  and one small SVG, and they answer their question faster than a plotted
  series would.
- **No error-reporting SaaS.** It would mean shipping a user's data to a
  vendor for information the app does not need.
- **No Electron wrapper.** The manifest declares `display: standalone`,
  so a browser install is already a real application window.

## Known, and open

Stated here rather than discovered:

- **A failed read still draws a skeleton, and now says so.** Every card
  treats `data === undefined` as loading, which is also the state an
  errored query sits in under `retry: false`.
  `features/errors/ReadFailure` is one banner over the whole shell
  rather than eighty-nine changed call sites: the cards keep their
  skeletons, and a skeleton beside a banner saying a read failed is no
  longer a lie. Teaching each card to tell the two apart is still the
  thorough fix.
- **Tombstones are vestigial** under Firestore, and still declared.
- **Settings and the fog do not travel between devices.**
- **The service-worker lifecycle cannot be tested from an agent's
  browser** — registration is refused there — so the install → wait →
  activate path ships on reasoning and a production build.
