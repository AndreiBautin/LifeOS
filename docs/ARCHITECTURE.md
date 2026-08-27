# Architecture

A client-only React + TypeScript PWA. No server, no database, no network
calls at runtime. Persistence is IndexedDB behind a repository interface.

## The layers

Dependencies point **inward only**. This is enforced by ESLint
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
   │  start a workout, log a set, finish, build a plan │
   └───────────────────────┬───────────────────────────┘
                           │
   ┌───────────────────────▼───────────────────────────┐
   │  domain/                          ◄───────────────┼── infrastructure/
   │  pure. no React, no browser, no libraries         │   IndexedDB, backup,
   │  prescriptions, resolution, progression, volume   │   settings, seed
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

## The idea the whole model turns on

**A prescription is not a number.** It is a rule for producing one.

```
LoadSource = percent-e1rm | bodyweight | absolute | rpe | open

RepTarget  = fixed | range | amrap | time
```

That pair is what lets one builder express RTS strength work and
Renaissance-Periodization hypertrophy volume in the same template:

| Prescription                     | Reads as             |
| -------------------------------- | -------------------- |
| `rpe(8) × fixed(5)`              | RTS top set, 5 @ 8   |
| `rpe(9) × range(3, 6)`           | Hypertrophy at 1 RIR |
| `rpe(10) × range(10, 15)`        | Last set, to failure |
| `bodyweight(+25) × range(6, 12)` | Weighted chins       |

There is no `percent-training-max`. It existed for 5/3/1, where the
percentage _was_ the prescription and resolving it against an estimate
would have silently changed what a cycle meant. It went with the
framework.

**Resolution** turns a prescription into a number, on demand, against the
lifter's state _right now_:

```ts
resolveSet(prescription, { athlete, exerciseId, roundingIncrement }): ResolvedSet
```

Pure. No I/O, no clock, no database. It is where almost all the tests
live, and it is why updating an estimated max changes tomorrow's
suggestion without rewriting yesterday's record.

## The three layers of a program

A program is composed, not picked. Three layers stack, and the third
subtracts what the first two spent:

1. **Strength** — the three competition lifts, run by RTS: a top set at
   reps × RPE, then back-off work sized by measured fatigue percentages
   (`domain/framework/rts.ts`).
2. **Split** — how many days, which lift lands where, which muscles each
   day is accountable for (`domain/splits/rp-splits.ts`). The day count
   follows session length rather than preference.
3. **Hypertrophy volume** — fills each day up to its share of every
   muscle's weekly target, _after subtracting what layers 1 and 2 already
   spent_ (`domain/assembly/`, `domain/volume/`). Where inside each
   landmark band that target sits is decided by the muscle's tier
   (`domain/priority/tiers.ts`).

Step 3 is what makes this one program rather than a powerlifting block
with an unrelated bodybuilding routine bolted on. A bench day has already
spent chest sets before accessories are considered, so it receives fewer;
the same day's rear delts have spent none, so they get their full share.

`assembleRpProgram(recipe, id, deps)` emits an ordinary, fully editable
`ProgramTemplate`. Every built-in program goes through it. Nothing
downstream knows a program was assembled — which is the test that the
builder is genuinely general.

## Program versus log

The single most important structural rule, and the one all three source
repositories broke.

- A **`ProgramTemplate`** is a plan. It stores intent, never a result.
- A **`ProgramInstance`** is a run of a plan. It embeds a frozen
  `templateSnapshot`, so editing the template afterwards changes what
  _future_ runs prescribe and leaves this one exactly as it was.
- A **`WorkoutLog`** is what happened. It holds planned and actual side by
  side and is **never written back into the template**.

In LiftTracker, generating a program wrote every `Set` row to the
database and logging a workout mutated those same rows. The program _was_
the log: editing a program corrupted history, a cycle could not be
repeated, and planned-versus-actual could not be compared because only
one of the two survived.

## A request, traced end to end

Starting a session and logging the top set:

1. **`features/train/TrainPage.tsx`** renders the next day and calls
   `useStartWorkout()`.
2. **`features/train/hooks.ts`** resolves `AppServices` from context and
   calls the use-case.
3. **`application/use-cases/training/start-workout.ts`** finds the active
   `ProgramInstance`, locates the day at its position, and for each slot
   calls…
4. **`domain/resolution/resolve.ts`** — pure — which reads the estimated
   max out of `AthleteState`, works back from the RPE chart, and rounds
   via **`domain/units/weight.ts`** to the gym's increment. `RPE 9` for
   3–6 reps against a 152 lb estimate becomes `125 lb`. The suggestion is
   a convenience: the set is `3–6 @ RPE 9` whether or not a number can be
   produced, so a missing estimate costs a suggestion and nothing else.
5. The resolved numbers are copied into a new `WorkoutLog` as
   `plannedLoad`, so an estimate revised next month does not
   retroactively alter what this session says it asked for.
6. **`infrastructure/db/repositories.ts`** writes it, deriving the
   `exerciseIds` index field on the way in.
7. The lifter taps the set. **`SetRow.tsx`** opens prefilled with 125 × 6.
8. **`application/use-cases/training/log-set.ts`** writes `actualLoad`,
   `actualReps`, `actualRpe` and `completedAt` beside the planned values.
9. On finish, **`finish-workout.ts`** computes the report, then advances
   the instance by one day — _on completion, not on the calendar_, so a
   missed Tuesday costs nothing.

## The backlog, and what a second domain changed

LifeOS is becoming the hub that every other life-tracking app is absorbed
into — [docs/GAME_MODEL.md](GAME_MODEL.md) decides what a number is
allowed to mean across all of them, and the backlog is the first to land.

It occupies the same four layers as training and touches nothing in it:
`domain/backlog/` holds the rules, `application/use-cases/backlog/` the
operations, an `items` object store at `DB_VERSION 4` the records, and
`features/backlog/` one screen.

Two decisions are worth knowing before reading that code.

**A progress log is the one thing merged rather than replaced.** Every
other record in this app wins or loses whole, which is right for a workout
and wrong for a backlog — see `unionProgress` in `domain/sync/payload.ts`
and the section below.

**`domain/backlog/` is namespaced because two domains collide.** Both apps
had a `Settings` and a `priority/`; LifeOS's priority is muscle tiers and
capacity, the backlog's is how much you want to get to something. The
directory is what keeps the two apart, and `BacklogSettings` and
`BacklogItemId` are named for their area for the same reason.

## The quest log, and the two things a database was doing for it

The second absorbed app, at `/next` — which is also where the hub opens,
because "what should I do right now, and what is the exact next step" is
the most valuable thing on a screen you open every morning.

`domain/projects/priority.ts` is the engine, ported whole with its tests.
`domain/projects/blocking.ts` is what used to be a service over SQLite,
and the two halves of it worth knowing about are the ones the database was
quietly providing:

**Cycle detection is now the only guard.** It was enforced in the schema
_and_ in the code; only the code half survives IndexedDB, so
`validateBlockers` is the whole of it.

**Cascade delete is written by hand.** `withoutBlocker` strips a deleted
project out of everyone waiting on it. Without it the reference sits in
each dependent's record, travels over sync, and comes back to life if a
later project is ever created with the same id.

Actions are embedded in the project record rather than stored beside it —
they are always read with it and never queried alone. Blockers are a list
of ids on the project rather than a join table, because the whole graph is
a few dozen records in memory whenever anything asks a question about it.

## The tech tree, and the one place the game model is wired up

The third absorbed app, at `/upgrades`, and the first domain that uses
`domain/game/` rather than sitting beside it. `domain/upgrades/` projects
an upgrade onto the model's `TreeNode` and lets `gatesFor` decide what
stands in the way — so `GATE_KINDS` being exactly `['money',
'prerequisite']` is now a constraint on live code rather than a note.

Its engine inherits priority _up_ the prerequisite chain: a dull desk that
stands between you and the monitor arm sorts as high as the arm does,
because buying it is the first step. Ranking is therefore a property of the
whole graph, which is why the store has no priority index — there is
nothing on a record to index.

Two rules had a database behind them and now do not. **Cycle detection**
(`wouldCreateCycle`) was belt to the schema's braces. **Refusing to delete
something with dependents** was enforced by `DeleteBehavior.Restrict` on
the self-referencing key; the app refuses rather than silently detaching,
because "unlink these first" is a decision about a tree somebody built.

Money is integer minor units throughout. JavaScript has no decimal type,
and a budget filter on binary floating point eventually disagrees with
itself about what is affordable.

## The scoring spine — the piece the other areas plug into

Dashboard is not an area. It is the machinery by which areas are scored,
and absorbing it is what stopped five of them scoring themselves.

`domain/review/` holds the shape: **area → metric → evaluator**, all data
rather than enums. `from-registry.ts` is the join — every rating declared
in `domain/game/registry.ts` becomes a metric this spine judges, with
nothing restated, so the registry stays the single declaration and adding a
tracked area is a row.

Two kinds of metric live in one list, differing only in where the number
comes from. **Measured** ones name a `source`, and
`application/use-cases/review/measure.ts` is the one place those names turn
into numbers — the only file that knows about every area at once, which is
deliberate: the alternative is five files that each have to remember to
agree with the registry. **Entered** ones are typed in at the monthly
review, because nothing here can know a credit score.

Three rules run through all of it:

**Absent, never zero.** A source with nothing to count reports nothing;
`seriesFor` skips months a metric was not recorded in; `blend` leaves out
what had nothing to say. A zero turns every honest blank into an
accusation.

**Areas are blended, not metrics.** Otherwise an area with nine tracked
numbers outvotes one with a single important one, which says how much you
happen to measure rather than how things are going.

**Cadence is part of the model.** A monthly rating renders its last
judgement; it does not acquire a streak because the page was opened. That
is why the review is reached from the character sheet rather than from the
navigation — a screen you open ten minutes a month has not earned a tab.

## The atlas, and the one thing it will not do

Places, trips and the fog live in `domain/atlas/`, which is the only
domain in the hub that returns `Result<T, E>` where everything else
throws. That was deliberate on absorption: rewriting fifteen thousand
lines to match would have been a large change with no behavioural payoff,
so `Result` stays inside `domain/atlas/` and is unwrapped once, at
`application/use-cases/atlas/atlas.ts`. Everything above that boundary
sees `{ error }` — the same shape the quest log and the tech tree use.

The fog is the part worth understanding. Ground is stored as geohash
cells at precision 7 (~153 m), and it is a **grow-only set**: no stamp, no
tombstone, merged between devices by union. That is not an optimisation,
it is the only merge that can be correct, because there is no such thing
as un-walking ground — last-write-wins would let the device that walked
less recently erase a morning. It is the single collection exempt from
`acceptableFrom`. The same asymmetry is why `revealCell` refuses any fix
worse than 100 m: fog cleared by a bad reading cannot be put back.

A visited place's ground is **derived** from the place rather than stored
beside it, so editing or un-visiting one stays correct with no second copy
to drift.

Three ways in, and none of them touches the network. Type one; paste a
list of names (`ParseBulkCapture`); or share a link from a maps app into
`/map/share` (`ParseSharedLocation`, which reads Google, Apple, OSM,
`geo:` and bare coordinates). Names saved without a point pile up on
purpose — demanding a coordinate per line would turn a thirty-second
capture into an evening — and `/map/inbox` is where that pile gets
cleared, either from a pasted link or from a single position reading.

The fourth way in **does** leave the device: searching by name asks
Nominatim, at `nominatim.openstreetmap.org`. That is worth stating
plainly rather than burying, and worth stating accurately — the map has
been fetching tiles from the same organisation on every pan since Leaflet
was wired up, so this is a wider use of an existing relationship rather
than a new one. It is rate-limited to one request a second and run on
donations: the query debounces at 500 ms, the adapter enforces the floor
again, and results cache for five minutes.

The same honesty governs the exploration ladder. Its `places.explored-share`
source divides walked area by the area of the region being explored — and
nothing in the app knows which region is meant, so that number is typed
into settings. Until it is, the ladder reads _absent_ rather than zero.

## The character sheet — where the model is actually read

`application/use-cases/character/sheet.ts` is the join the game model was
written for. `domain/game/registry.ts` declares what each area has;
this turns those declarations into one readout, restating nothing. An area
appears on the sheet by gaining a row in the registry, and a test asserts
the two lists match — an absorbed area that silently stops appearing is
the failure worth guarding.

The three currencies read from three different places, and that is the
whole point of having three:

| Currency   | Read from                  | Why not the others                                                               |
| ---------- | -------------------------- | -------------------------------------------------------------------------------- |
| **Ladder** | live measurement           | Anchored externally; its answer must not depend on whether you opened the review |
| **Rating** | what the review _recorded_ | A monthly judgement that shifted every time a page opened would not be monthly   |
| **XP**     | a tally of acts            | Paid for doing, never for it having worked — an outcome already moved a ladder   |

The XP tally is **derived from the records**, never stored as a counter.
A counter cannot survive two devices — both increment it, last-write-wins
throws one away — and cannot survive a restore either. Counting visited
places cannot drift from the places.

One act is deliberately uncounted. `social.hangout-logged` needs a list of
hangouts and the friend record keeps only `lastHangout`, a single date
ratcheted forward. A friends-with-a-date count would stop growing after
the first coffee and read as a social life that happened once, so it earns
zero XP until hangouts are stored as events.

An area with no measurement, no recorded rating and no acts is **silent**
and renders nothing at all. `insufficient-data` counts as silence — it is
the absence of a judgement, not a bad one.

## Autoregulation

Check-ins are **recorded events**, and adjusting a volume landmark is a
separate, bounded, explained **proposal** derived from them.

StrengthFlow had the right idea and the wrong mechanism: it wrote every
answer straight into a per-muscle counter with `increment(±1)`. No record
of the answer survived, there was no floor or ceiling, and no undo.
Answer "not recovered" often enough and a muscle's volume walked to zero
with nothing to say why.

Here (`domain/autoregulation/`):

- Three consistent sessions of evidence before anything moves.
- Signals are **averaged**, so a muscle trained twice as often does not
  move twice as fast.
- Adjustments move **MAV** and are clamped so `MV ≤ MEV ≤ MAV ≤ MRV`
  always holds. MEV never moves from a soreness rating — that is not what
  a soreness rating measures.
- Lifestyle factors (sleep, nutrition, stress) scale **today's session
  only** and produce no landmark proposal at all. A bad night is not
  evidence that weekly tolerance changed.

## Technology, and why

| Choice                      | Why                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **React 19 + TS**           | Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — this app indexes into weeks, days, slots and sets constantly |
| **Vite**                    | Fast, and `vite-plugin-pwa` gives Workbox without hand-writing a service worker                                                             |
| **IndexedDB via `idb`**     | ~1 KB promise wrapper. The repository port is already the seam; a heavier ORM behind it earns nothing                                       |
| **TanStack Query**          | Caching and invalidation with `staleTime: Infinity` — there is no server, so nothing goes stale                                             |
| **Tailwind v4 + Radix**     | Utility styling with accessible primitives where behaviour matters                                                                          |
| **Vitest + fake-indexeddb** | Real database semantics in tests, including migrations, without a browser                                                                   |

## What is deliberately absent

- **No server, no API, no auth of ours.** Single user, single device, by
  design. Two third parties are reached, both only from the screens that
  need them: OpenStreetMap for map tiles and geocoding, and Firebase for
  sync when it is configured. Neither is a service this project runs.
- **No state-management library beyond context.** Server-ish state is
  TanStack Query's; the rest is component state. Redux would be ceremony.
- **No chart library.** The one chart that matters — weekly volume
  against the landmark band — is a `div` with three zones, and it answers
  "under, in, or over" faster than a plotted series would.
- **No error-reporting SaaS.** It would mean shipping a lifter's data to
  a vendor for information the app does not need.
