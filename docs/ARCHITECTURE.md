# Architecture

A client-only React + TypeScript PWA: a gamified workout tracker. **No
server of ours and no database of ours** — records live in IndexedDB in
the visitor's own browser, behind a repository interface.

The one outbound host is GitHub, and only when the lifter has turned
sync on with a token of their own. The app used to talk to OpenStreetMap
as well, for map tiles and geocoding; the map went when the app narrowed
to training, and the host went with it. **Each host was a decision, not
a precedent.**

The app is **one page with no navigation** (`features/today/HomePage.tsx`):
the character sheet, the next session, the standards, the trend, the
activity grid and the history, top to bottom — or the session player
while a workout is open. Program and Settings are links from it, each
with a Back link. Every route a removed screen once had redirects to `/today` (`src/app/router.tsx`),
because an installed PWA goes on asking for the paths it was installed
with.

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
   │  start a workout, log a set, finish, score it     │
   └───────────────────────┬───────────────────────────┘
                           │
   ┌───────────────────────▼───────────────────────────┐
   │  domain/                          ◄───────────────┼── infrastructure/
   │  pure. no React, no browser, no libraries         │   IndexedDB, storage,
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
sentences: work in a rep range for five straight sets, and when every
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

**The shipped week is a written routine**: Push, Pull and Legs A
Monday to Wednesday, the B days Thursday to Saturday (`PPL_SPLIT` in
`domain/splits/rp-splits.ts`). A day
with a `routine` is built exactly as listed — five straight sets per
exercise, the competition lifts at the strength range — and skips the
generator below entirely. The generator is still live for any day
without a routine, and `FULL_BODY_SPLIT` is kept so its tests have a
week to run against.

For a generated day, two layers stack, and the second is told what the
first spent:

1. **The split** — the days, each opening on its competition lifts
   (`carries`). A muscle's accessory work sits on the day whose main lift
   does _not_ already train it.
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

Starting Thursday's session (Push B) and logging the first set of the bench:

1. **`features/train/NextSessionCard.tsx`**, on the one page, renders the next day and calls
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
   on all fifty exercises. Five sets of 5 at 185 becomes **190** (topped is
   judged against the sets that session asked for, so older three-set
   sessions still progress).
6. **`domain/resolution/resolve.ts`** — also pure — turns
   `working × range(3,5)` into that number, rounded by
   **`domain/units/weight.ts`** to the gym's increment. With no history
   at all, a _strength_ slot falls back to 85% of the estimated max
   (about a five-rep load) and everything else resolves to **open**,
   which says honestly that the app does not know what you curl.
7. The resolved numbers are copied into a new `WorkoutLog` as
   `plannedLoad`, so an estimate revised next month does not
   retroactively alter what this session says it asked for.
8. **`infrastructure/db/repositories.ts`** writes it to IndexedDB,
   wired once in `src/app/di.ts`.
9. The lifter taps the set. **`SetRow.tsx`** opens prefilled with 190 × 5.
10. **`application/use-cases/training/log-set.ts`** writes `actualLoad`,
    `actualReps` and `completedAt` beside the planned values.
11. On finish, **`finish-workout.ts`** computes the report, then advances
    the position by one day — _on completion, not on the calendar_, so a
    missed Thursday costs nothing. The next read of the character sheet
    counts the session, its working sets, and — if a warm-up or
    conditioning row was done — the Mobility and Stamina acts.

Step 5 is the whole redesign, and no single test exercises it end to end:
a bench opened at 200 from a 238 estimate, three sets of five were
logged, the session filed, and **the same lift opened at 205 the next
week**. That round trip was verified by driving the app.

## Where the records live

In this browser. `bootstrap()` in `src/app/di.ts` opens the IndexedDB
database and wires the repositories to it; settings and the programme
position are `localStorage`.

**Optional sync is a backup file in a private GitHub repository.**
`infrastructure/sync/github-sync.ts` runs one round: read the file
(`github-file.ts`), merge it with `mergeNewer` (`infrastructure/backup/sync-merge.ts`) —
newer `updatedAt` wins and tombstones travel both ways — and write back only
when `recordsFingerprint` says the records differ. A refused write means
the other device got there first, so the round starts again from a fresh
read. `features/sync/useGitHubSync.ts` runs rounds on launch, page
change and visibility, one at a time and at most every fifteen seconds.
The import's own merge stays file-wins, because "restore this backup"
and "take turns with another device" are different requests.

**There was optional Firebase sync, and it was removed deliberately.**
Firestore became the source of truth when configured, with Google
sign-in and an account allowlist in front of it. It worked, and it
meant a second storage path, a sign-in gate, access rules and an
emulator suite — for a public demo that never used any of it. A cloud
database worth adding would be the real store with proper accounts,
not a copy kept in step with this one. It is in the git history.

**The sample data is filled, never replaced.** A demo build seeds an
empty database on first open; Settings offers **Start fresh** (wipe,
after a confirmation) and **Load sample data** (only when empty) as two
separately named operations. Starting fresh records
`sampleData: 'cleared'` so an empty database is not refilled on the next
open.

**A deletion is a fact, not an absence.** Removing a row leaves nothing
behind, and nothing is indistinguishable from "never existed" — so
merging in an older backup reads it as a record the file knows about and
puts it back. `repositories.remove` writes a tombstone for that reason,
and the backup import filters incoming records through them.

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

There are three areas — training, conditioning (`cardio`) and mobility —
and four acts: a finished session and a logged working set pay training,
a finished session with completed conditioning pays conditioning, and a
finished session with a completed warm-up pays mobility.
`countActs` in `sheet.ts` is the one place they are counted.

**Traits are a projection of that same XP, not a fourth currency.**
Strength, Stamina and Mobility each claim exactly one area, so the bars
partition the XP and sum to the level above them. `UNCLAIMED_AREAS` is
empty and kept, so an area added tomorrow with no trait still fails the
build until somebody says which it is.

**The rating half of the model is dormant.** The monthly review screen
was removed and it was the only thing that filed a month, so `readout`
still reads whatever was filed before and nothing new arrives. If ratings
are wanted back, **the missing piece is a screen rather than a rule**.
`measureAll` is live and must stay — the sheet's ladders read it.

An area with no measurement, no recorded rating and no acts is
**silent** and renders nothing at all. `insufficient-data` counts as
silence: it is the absence of a judgement, not a bad one.

## The demo build

`VITE_DEMO_MODE=true` moves the database name and every storage key to a
`lifeos.demo` prefix and runs `seedDemoData` before the first render,
only into empty storage. It is what deploys. See
[DEMO_DATA.md](DEMO_DATA.md).

The seeder lives in `application/use-cases/demo/`: seventeen weeks of
sessions and one settings flag. The sessions are written as records
rather than driven through `startWorkout` and `finishWorkout`, which can
only ever produce a session dated today — the file says why in place,
and `parity.test.ts` holds the fixture to the properties the landing
page depends on.

## Technology, and why

| Choice                      | Why                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **React 19 + TS**           | Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — this app indexes into weeks, days, slots and sets constantly |
| **Vite**                    | Fast, and `vite-plugin-pwa` gives Workbox without hand-writing a service worker                                                             |
| **IndexedDB via `idb`**     | ~1 KB promise wrapper. The repository port is already the seam; a heavier ORM behind it earns nothing                                       |
| **TanStack Query**          | Caching and invalidation with `staleTime: Infinity` — there is no server of ours, so nothing goes stale on its own                          |
| **Tailwind v4 + Radix**     | Utility styling with accessible primitives where behaviour matters                                                                          |
| **Vitest + fake-indexeddb** | Real database semantics in tests, including migrations, without a browser                                                                   |

## What is deliberately absent

- **No accounts at all.** Nothing to sign in to, so nothing to breach.
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
- **Sync is whole-file and turn-taking.** Two devices editing the same
  record between syncs keep the later edit; nothing merges field by
  field, and a change reaches the other device on its next round rather
  than live.
- **The service worker is partly verified and partly not**, and the
  claim that used to sit here — that registration is refused in an
  agent's browser — is no longer true. Measured against the live site:
  one registration, `activated`, controlling the page, and the
  "new version is ready" banner has been seen firing after a deploy.
  What is **still unverified** is offline serving from the precache, and
  the full install → wait → skip-waiting sequence across two versions.
