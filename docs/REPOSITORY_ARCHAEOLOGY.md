# What came before

Lift consolidates three earlier repositories. This is the record of what
each actually was, what was worth keeping, and what was not — written
before any code here was, so the decisions below can be checked against
the evidence rather than taken on trust.

## The three

|             | ProgramBuilder                     | LiftTracker                                          | StrengthFlow                                |
| ----------- | ---------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Last commit | Mar 2024                           | May 2024                                             | **Feb 2025**                                |
| Commits     | 2                                  | 49                                                   | 205                                         |
| Stack       | Blazor Server, EF Core, SQL Server | Blazor Server, EF Core, SQL Server, ASP.NET Identity | React 18 (CRA), Mantine, Firebase/Firestore |
| App code    | ~1.4K LOC                          | ~3.5K LOC                                            | ~3.4K LOC                                   |
| Tests       | 1 stub                             | 3 generator unit tests                               | CRA default only                            |

Two lineages, not three apps. **ProgramBuilder → LiftTracker** is one
continuous .NET line — identical class names (`MacroCycle`, `MesoCycle`,
`TrainingPhase`, `RepRangeType`), identical use-case names
(`GenerateMicroCycleUseCase`), the second extending the first.
**StrengthFlow** is a later, unrelated rewrite that discarded the
periodization engine entirely.

### Three things that were not as expected

1. **ProgramBuilder is not the deep program builder; it is the abandoned
   first prototype.** Two commits, one of them `.gitignore`. Everything
   Renaissance-Periodization-flavoured lives in **LiftTracker**.
2. **StrengthFlow is the newest, not the oldest.**
3. **There is no 5/3/1 anywhere in any of them.** Grepping all three for
   `531`, `training max`, `wendler`, `BBB`, `amrap`, `deload` and
   `percent` returns nothing. Every app was RPE- and rep-range-driven,
   with no training max, no percentage prescription and no AMRAP set. The
   only 1RM code anywhere is StrengthFlow's Epley estimate, used solely
   to draw a chart.

## What each one actually was

### LiftTracker — an automatic RP-style periodization generator

Pick a split (PPL or Upper/Lower) and a goal, and it generates an entire
multi-month macrocycle up front: hypertrophy blocks → strength → peaking,
each of N mesocycles × 4 microcycles × 4–6 sessions × ~6 exercises. Every
set row exists in the database before you lift.

**Kept:**

- The periodization hierarchy — Macro → Block(phase) → Meso → Micro →
  Session → SessionExercise → Set.
- Volume ramp and deload in code: hypertrophy weeks ran 3 → 4 → 5 → 2
  sets with RPE climbing 7 → 8 → 9 then dropping to 5. That is
  accumulate-then-deload, implemented. It is preserved here as
  `targetSetsForWeek` and `rpeForWeek`, derived from each muscle's own
  landmarks rather than applied uniformly, and editable.
- **Exercise selection by taxonomy, not by name** — `MuscleGroup ×
EquipmentType × IsCompound × IsCompetition`. This is what makes
  automatic substitution possible, and it survives as `ExerciseQuery`.
- Rep ranges attached to the exercise's _role_ in the session rather than
  to the exercise. Correct instinct; now `SlotRole`.
- **Set-at-a-time logging with the previous cycle's same set as the input
  placeholder.** Genuinely good — it makes progressive overload the path
  of least resistance.
- `IsSkipped` distinct from `IsComplete`.
- Forty seeded exercises, all still present.

**Discarded:**

- The split hardcoded to weekdays: `case Monday: return GeneratePush(1, …)`.
  A rotating four-day cycle — which is what 5/3/1 runs — was
  inexpressible, and a missed Tuesday corrupted the schedule.
- Every exercise slot in every session as a hardcoded literal list.
- Nothing editable. It generated, and you obeyed.
- `new LiftTrackerContextBuilder(Configuration).Build()` inside Razor
  render loops.
- The program being the log.

### StrengthFlow — a logger with volume analytics and an autoregulation loop

**Kept:**

- **The check-in loop.** Pre-workout per-muscle recovery plus
  sleep/hydration/nutrition/mood; post-workout per-muscle workload. The
  most distinctive idea across all three apps, and the closest any of
  them came to actual RP autoregulation. **Redesigned rather than
  ported** — see below.
- Per-muscle volume analytics.
- Estimated 1RM over time.
- The in-progress session held locally for crash recovery — the seed of
  the offline-first idea.
- The post-session "matched or beat last time" report, which was the best
  single sentence either app produced.

**Discarded:**

- Firebase entirely. `firestore.rules` was the starter rule — world
  readable and writable, expired 2024-07-10.
- `HabitTracker.js`, `GoalSetting.js`, `PersonalBests.js`: hardcoded mock
  arrays feeding charts. No data source, no logic.
- `isAuthenticated = true` hardcoded, so the login screen was decorative.
- `alert()` as the notification system.
- Both `react-dnd` and the deprecated `react-beautiful-dnd`, installed
  together.

**Why the check-in loop was rebuilt rather than ported:** it wrote every
answer straight into a per-muscle counter with `increment(±1)`. No record
of the answer survived, there was no floor or ceiling, no undo, and the
counter had no relationship to what the program actually prescribed.
Answer "not recovered" often enough and a muscle's volume walked to zero.
The idea is sound; the mechanism made it unusable. See
[ARCHITECTURE.md](ARCHITECTURE.md#autoregulation).

### ProgramBuilder — LiftTracker's predecessor

Almost entirely superseded. Three things in it were **better** than what
replaced them, and those are the parts that survive:

- `Set` carried `PlannedReps` / `PlannedLoad` / `PlannedRpe` alongside the
  actuals. LiftTracker dropped planned reps and load, keeping only
  `TargetRpe` — which is precisely why it could not express 5/3/1, where
  the prescription _is_ a load.
- `MuscleGroup.WeeklyVolume`: a per-muscle weekly set target. The embryo
  of MEV/MAV/MRV.
- A finer muscle taxonomy, splitting the deltoid heads out. Lift splits
  both the delts _and_ the posterior chain, because volume landmarks are
  per-muscle and hamstrings and glutes do not share a recovery budget.

## The flaw all three shared

**The program and the log were the same rows.** Consequences: a program
could not be edited without corrupting history, could not be re-run,
planned could not be compared to actual, and a template could not exist
at all.

Separating `ProgramTemplate` from `WorkoutLog` is the single highest-value
change in this project and a prerequisite for everything else.

## Everything genuinely new

Because it existed nowhere in the source material:

- The whole 5/3/1 framework — training maxes, percentage prescriptions,
  AMRAP sets, deload weeks, supplemental variants, per-cycle training-max
  progression with a conditional reset on a missed AMRAP.
- Splits as data rather than as two `switch` statements.
- Volume accounting _across_ the framework and the assistance layer,
  which is what makes them compose.
- Rest timers, wake lock, offline operation, install, update flow.
- Export, import, integrity checking, backup reminders.
- Progression as data and as a previewable proposal.
- A test suite.
