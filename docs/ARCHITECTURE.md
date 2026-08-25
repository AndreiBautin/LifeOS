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

- **No server, no API, no auth.** Single user, single device, by design.
- **No state-management library beyond context.** Server-ish state is
  TanStack Query's; the rest is component state. Redux would be ceremony.
- **No chart library.** The one chart that matters — weekly volume
  against the landmark band — is a `div` with three zones, and it answers
  "under, in, or over" faster than a plotted series would.
- **No error-reporting SaaS.** It would mean shipping a lifter's data to
  a vendor for information the app does not need.
