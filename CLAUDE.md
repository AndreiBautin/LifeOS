# Working on Lift

A client-only React + TypeScript PWA for building strength programs and
tracking workouts. **No server, no database, no network calls.**
Persistence is IndexedDB behind a repository interface. That constraint is
the product, not a limitation — see
[docs/PERSISTENCE.md](docs/PERSISTENCE.md).

## Before you finish anything

```bash
pnpm verify    # typecheck + lint + format:check + test:run + build
```

A pre-push hook runs this and refuses the push if it fails. The same
command gates the deploy. If `pnpm verify` is green the change is
shippable; if it is not, it is not — there is no third state.

## The layer rule

Dependencies point **inward only**, enforced by ESLint
(`no-restricted-imports` in `eslint.config.js`), so breaking it fails the
build with a message explaining why.

```
features/  →  application/  →  domain/  ←  infrastructure/
```

| Layer               | May import         | Never imports                                     |
| ------------------- | ------------------ | ------------------------------------------------- |
| `domain/`           | nothing but itself | React, browser APIs, any library, any other layer |
| `application/`      | `domain/`          | `infrastructure/`, `features/`, React             |
| `infrastructure/`   | `domain/`          | `features/`, `app/`, React                        |
| `features/`, `app/` | anything           | —                                                 |

If a use-case needs something concrete — a repository, a clock, an id
generator — **take it as a parameter** and wire it in `src/app/di.ts`.
That file is the only place allowed to name a concrete implementation.

## Load-bearing invariants

These are each enforced by a lint rule or a test. They are listed here so
you know _why_ before you meet the error.

**The program is never the log.** A `ProgramTemplate` stores intent and a
`WorkoutLog` stores what happened. Never write a result back into a
template. All three predecessor apps collapsed these, and that single
decision is why editing a program corrupted history in every one of them.
Here it cannot happen at all: the template is derived rather than stored,
so there is nothing to write back into.

**Resolution is pure.** `domain/resolution/resolve.ts` turns a
prescription into a number with no I/O and no clock. Keep it that way; it
is where nearly all the tests live.

**Strength is RTS, and only RTS.** The three lifts are run by reps at an
RPE, with back-off work driven by measured fatigue percentages
(`domain/framework/rts.ts`). The overhead press is **not** a strength
lift — it was a main lift under 5/3/1 only because that framework wanted
a fourth one, and it contributes nothing to a total. It is hypertrophy
work in the 3–6 range.

5/3/1 was removed wholesale — framework, assembler, recipes, splits,
progression, `percent-training-max`, training maxes. It is in the git
history if it is ever wanted back. Do not reintroduce a second framework
without deciding to carry two of everything again.

**A suggested load is never the prescription.** `estimatedMaxes` (in
settings) is the basis for every suggestion, and an estimate is
acceptable _because_ RTS asks for reps at an RPE: get the number wrong
and the lifter corrects it by loading the bar they were going to load
anyway. This was the opposite under 5/3/1, where the percentage _was_
the prescription and an estimate would have silently changed what a cycle
meant — which is why training maxes existed and why they went with it.

**Assistance subtracts what the framework spent.** `domain/assembly/`
counts the volume the strength work already contributed before filling
anything. Removing that subtraction turns one coherent program into a
powerlifting block with a bodybuilding routine stapled to it.

**Priority decides frequency; volume decides how much per session.**
`domain/volume/frequency.ts`. Tier 1 is trained on every day accountable
for it, tier 2 on two thirds of them, tier 3 once. `setsPerSession` then
divides the weekly target across those sessions and caps it at
`MAX_DIRECT_SETS_PER_SESSION`.

It used to be the other way round — divide the target by the ceiling and
take the answer — which produced a frequency table nobody could predict
from their own tier list: forearms on two sessions, lats on three, so a
tier-1 muscle was trained less often than a tier-2 one. Correct
arithmetic, unquotable rule. **Frequency counts direct work only**
(`trainedDirectly`); half credit is right for volume and wrong here.

**Priority buys strength frequency too, not a bigger fatigue
allowance.** `strengthSessionsFor` — tier 1 three sessions a week, tier 2
two, tier 3 one — and `assignStrengthLifts` places them on the days whose
`carries` matches the lift, choosing the **emptiest** eligible day each
time. Spacing each lift across its own eligible days is the obvious
implementation and is wrong the moment two lifts share a pool: a squat
and a deadlift wanting one session each from the same two lower days both
computed the same index and landed on Tuesday.

**The fatigue allowance equals the load drop, always.** Both 5%. That
equality is what makes the stopping rule sayable: at matched reps and
RPE an implied max is proportional to bar weight, so stopping at a 5%
drop in implied max _is_ the moment the 5%-lighter bar feels like the
top set did. One sentence, no arithmetic, true on every lift. Varying
the allowance by tier (2% to 7%) was coherent and made that sentence
false for every tier but one.
**Frequency is a means to volume, never a goal.** The backfill will not
schedule a muscle already at its weekly target, secondary credit
included. Without that guard the two-session floor applied to the front
delts — asking for three sets while the bench press and dips paid them
ten — and put an overhead press on every Friday to satisfy an arithmetic
minimum for a muscle at three times its target. The backfill also orders
by deficit, not by the order muscles happen to appear in `RpDay.muscles`;
that array is grouped by region, and walking it verbatim left the side
delts last in `UPPER` and finishing blocks ten sets short.

**There is no minimum session length.** Deliberately, after there was.
Enforcing one took three mechanisms in the assembler — a grace period
letting the frequency backfill overrun, a top-up pass scheduling muscles
already at their target, and a loop lengthening existing slots one set at
a time — all to move a thirty-nine minute session to forty-one. Each had
to be reasoned about again every time anything else moved.

A short day is information. A deadlift day with the legs on maintenance
runs twenty-five minutes because that is what the tiers asked for, and
the Plan screen already reports what the week does and does not deliver.
The ceiling stays — without it one day claims the whole week — but it is
`SESSION_MINUTES_CAP` in `domain/assembly/rp-assemble.ts`, not a setting.
As a setting it read as a dial for how long you wanted to train, which it
never was: raising it does not lengthen a session, it only stops the
first day being held back from spending the last day's budget.

**Every working week is identical.** `weeklyTargetForWeek` returns the
target the priority asked for, and MV on the deload. There is no ramp.

There was: week one opened near MEV, the target climbed across the block,
and the last working week touched MRV. That is defensible periodisation
and it cost more than it paid. Every measurement of the program had to
name a week to mean anything, every screen showing volume had to pick
one, and the Program page carried a tab per week that differed only by a
gradient nobody had asked to see. What the ramp was for is autoregulated
instead — RTS moves the loads set by set, the check-ins move the
landmarks on evidence.

The consequence the UI depends on: the Program page shows **one** working
week and the deload, and says that is the whole block. If the weeks ever
diverge again that screen becomes a lie, which is what
`rp-assemble.test.ts` → "gives every working week the same volume" is
guarding.

**The character sheet scores strength only.** Conditioning was a mile
time nobody was running, so it sat at Untrained permanently — a fixed
zero on a screen whose job is to show movement. Consistency levelled the
session count, which XP already spends. Conditioning is still
_programmed_; it is not scored, because nothing measures it.
**Upper, lower, upper, lower, upper — and no borrowing.** `RpDay.muscles`,
one list, one fill pass. Two earlier attempts at balancing the week are
in the git history and both were wrong: listing the arms on every day
(heavy pulls followed by upright rows) and an `overflowMuscles` list a
leg day picked up once its own work was done (better ordering, same
output). A deadlift day briefly owned the back as well, which was
coherent while the lats were prioritised and stopped being so when they
were not. What does not fit is reported on the Plan screen rather than
tucked into whichever session had a gap.

**A lift trained more than once a week needs .** RTS
autoregulates the _load_ on a third bench session — you are tired, the
weight that feels like RPE 8 is lighter, nobody prescribes that. It does
not autoregulate the **fatigue allowance**, because that is a decision,
not a reading: left at the same value it asks for a full session of
fatigue three times a week and a twelve-set chest target came out at
eighteen. A day spends of it.
The cap moves with the allowance too — the app materialises the cap as
slots and counts them as volume, so a plan that is only correct if you
stop early is not correct.
**A muscle's target depends on its own tier and nothing else.**
`priorityPosition` maps rank onto a position between
`BOTTOM_TIER_POSITION` and `TOP_TIER_POSITION` and stops there. There
used to be a `spreadFactor` scaling the whole mapping by how crowded the
top tier was — sound reasoning ("prioritising everything prioritises
nothing"), catastrophic as an implementation. Every target depended on
every other muscle's placement, so moving the biceps out of tier 1
silently raised the side delts from 22 to 24 and pushed them past what
the week could deliver. A lifter could not state a mental map without the
app renegotiating it. **Do not reintroduce a cross-muscle term here.**

**"You cannot prioritise everything" is a capacity report, not a
multiplier.** It lives on the Plan screen: the tiers state the ask, and
the page lists any muscle the hardest week of the built program leaves
short. Measured off the assembler's output rather than modelled, so it
cannot drift from what the program does — and **counted per muscle, never
in aggregate**, because every set pays two or three muscles and the
delivered total therefore exceeds the asked total even when individual
muscles are starved.

**A jump is the only non-training way to move the position.**
`jumpToWeek`. Everything else advances by finishing or skipping, which
is right — the position records what happened. But a lifter arriving
mid-block would otherwise skip fifteen sessions to line the app up.

**Landmarks stay ordered.** `MV ≤ MEV ≤ MAV ≤ MRV`, always. Check-ins
move MAV only, within bounds, and only with three sessions of evidence.
MEV never moves from a soreness rating.

**Readiness scales today, not the landmarks.** Sleep and stress adjust
one session. They must never produce a landmark proposal.

**The program is derived, never stored.** `deriveProgram(settings,
library)` in `application/use-cases/programs/current-program.ts`. Only the
_position_ persists. Storing the program produced the same bug four times
— a change reaching the code and not the copy on the device — and each
fix patched one delivery route while leaving the others open: additive
sync, then content refresh, then retirement, then re-snapshotting. All of
it is gone. There is no library, no built-in program, no instance, no
frozen snapshot, and nothing to press to pick up a change.

**Derivation must be deterministic.** Same settings in, byte-identical
program out, slot ids included. A workout in progress refers to its day
by position and its sets by index; a program that differed between reads
would make every one of those a guess. That is why assembly takes an id
generator as a parameter — `current-program.ts` passes a counter, not
`crypto.randomUUID`.

**A log describes itself.** A `WorkoutLog` embeds the prescription,
planned load and planned reps of every set. That is what made the frozen
snapshot unnecessary: history never needed the template to interpret it.
Do not "normalise" this by referencing a program instead.

**A position is clamped, not reset.** The program can get shorter under a
lifter — five days a week to three. `clampPosition` pulls them back
inside it. Resetting to week one instead would cost them a block.

**Skipping, abandoning and finishing are three different things.**
Finishing advances the program and files a log. Skipping advances it and
writes _nothing_ — a day trained elsewhere did not happen here.
Abandoning does not advance it at all: with nothing logged the record is
deleted, and with sets logged it is kept as `abandoned`. Every one of the
alternatives puts an empty workout in the history, where it counts as a
training day and drags every frequency and volume figure down. Finishing
and skipping share `nextPosition` so they cannot drift.

**Choosing is not ordering.** The fill picks exercises by which muscle
is owed the most, which is right for deciding _what_ is in a session and
wrong for deciding _when_. `inSessionOrder` is a separate pass:
warm-ups, the competition lift, compounds heaviest-first, isolation,
conditioning. Without it a day opened with a maximal deadlift, went to a
calf raise, and came back to a squat.

**Names are derived, never written.** `describeDay` reads a day's `label`
and `focus` off its finished slots; `describeBlock` reads the block's name
and description off the tiers. A hardcoded "Monday — press and pull" is a
claim that goes stale the moment a tier moves. The `focus` line separates
direct work from what the day only pays incidentally, ranked by share of
each muscle's weekly target — merging the two named an upper day after
the core, because pull-ups pay it a fraction and its target is small
enough for that fraction to win. The _kind_ of work — strength,
hypertrophy, conditioning — is the heading; the muscles are the sentence
under it. **Every muscle with direct work is named**, uncapped: a reader
who can see a curl in the session and no biceps in the description has
found a bug whatever the arithmetic said.

**Every slot has a category and a sub-category.** Strength splits into
`Top set` and `Back-off`, hypertrophy into `Compound` and `Isolation`,
warm-ups into `Upper` and `Lower`, conditioning into its intensity
domain — `Zone 2` or `HIIT`. **Two conditioning domains, not three**:
LISS and Zone 2 are the same work under two names, so the incline walk
and the easy run share a label. What separates those two is systemic
cost, which the exercise already carries. The sub-category lives on
`Slot.variant` and is copied onto `LogEntry.variant` at start, not
derived from the role — a warm-up's body half and a strength slot's
position in the pair cannot be read off `role` at all. The roles stay
`hypertrophy` and `assistance` because they are written into every stored
log, but both _label_ as "Hypertrophy".

**The competition lift is two slots, not one.** They were merged once on
the reasoning that it is one exercise in one trip to the rack — true, and
it hid what makes this RTS: the top set is a _measurement_ everything
below derives from, and the back-off count is discovered rather than
planned. As one six-set row it read exactly like a percentage
prescription. They stay adjacent because `inSessionOrder` is a stable
sort and both rank the same. **`previousSetFor` must take the variant**:
matching on the exercise alone hands the first back-off the previous
session's _top set_ as its "last time".

**A heavy hypertrophy set is not taken to failure.** `safeToFail` covers
"you would be pinned under it"; `HEAVY_HYPERTROPHY_REPS` covers the other
case — failing a top-heavy triple costs what a max costs. The overhead
press carried both the note "one rep in reserve, not a max" and a last
set at RPE 10.

**A set is credited by its reps _and_ by how close to failure it ends.**
`hypertrophyCredit(reps, rpe)` in `domain/volume/accounting.ts`. Reps
came first: counting a top-set single as one hard set let the
competition lifts overshoot a maintained muscle on their own. RPE came
second, for the same reason one level up — fifteen bench sets at RPE 8
covered a twelve-set chest target, so the assembler concluded the chest
needed no direct work at all.

**`FREE_RIR` is why this does not rescale everything.** The landmarks
are published in _hard sets_, and a hard set there means one taken to
about a rep short — so RPE 9 keeps full credit and discounting starts
past it. Without that the unit every target is expressed in changes
silently and every number in the app shifts underneath it; the first
attempt did exactly that and put six muscles under target at once.

**Credit has one implementation.** `attributeWeek` asks `slotVolume`
rather than repeating the arithmetic. It used to carry a copy — same
shape, same constants — and the copies drifted the moment RPE entered
the calculation, so the program was built against one number while the
breakdown explaining it printed another.

**A repeat is penalised across the week, not just against yesterday.**
The same upright row kept appearing on Tuesday and Thursday. It is a soft
sort, never a filter: side delts have two hypertrophy options and calves
have one, so banning a repeat would drop the muscle from the day instead.

**A timed set is costed by its duration.** `setSeconds` in
`domain/programs/program.ts`. Counting a twenty-minute walk as one
thirty-second set made conditioning free to the planner, which then
stacked a run onto the longest day of the week and still believed it fit.

**Exclusions are absolute.** A lifter who cannot do an exercise means it
everywhere — warm-ups and conditioning included, not only the hypertrophy
picker.

**No day is pinned to an exercise.** `RpDay` used to carry `anchors`, a
list of slugs a day was built around: Monday to an overhead press,
pull-ups, lateral raises and curls, Friday to dips and rows. It existed
to make a generated block continue the session a lifter had actually
trained, which was worth having while history was being imported.

It is gone, and the reason it had to go is the reason everything else
here is derived: an anchor is a transcript, not a derivation. The pinned
exercises went on being scheduled after the tiers that justified them had
moved, and an overhead press outlived the front delts falling to
maintenance. **Do not reintroduce a slug list on a day.** If a movement
pattern is worth guaranteeing, guarantee the _pattern_ and let the picker
choose — and know that a muscle whose target is zero will receive no
direct work at all, which is the model behaving correctly.

**`pending` is a real set outcome.** A set that has not been performed is
not a completed set with no numbers in it. Volume accounting depends on
the distinction.

**The exercise library is derived too.** `resolveLibrary` in
`domain/exercises/library.ts`, called from the exercise repository. The
catalogue is read at every use; the store holds only a lifter's own
exercises and _retired built-ins_, which come back archived so old logs
still resolve. This replaced three delivery mechanisms — seed on first
run, additive sync, hand-written retirement list — which between them
still could not deliver an edit to an exercise that already existed. A
device went on showing "Pull-Ups" and a 12–20 lateral raise long after
the catalogue said otherwise. **Editing the catalogue is now the whole
delivery.** Do not reintroduce a store-of-record for shipped content.

**No `console` outside the logger.** No `localStorage` outside
`infrastructure/storage/`. No `indexedDB` outside `infrastructure/db/`.
No bare `new Date()` — take a `Clock`. Each is a lint rule with a
message.

## Where new code goes

A feature is usually a slice through the layers, inner first:

1. **`domain/`** — the rule, as a pure function, with `x.test.ts` beside it.
2. **`application/use-cases/<area>/`** — takes dependencies as a
   parameter. Load → apply the rule → save.
3. **`app/di.ts`** — register it on `AppServices` if it needs a new port.
4. **`features/<area>/hooks.ts`** — a TanStack Query hook resolving
   services from `useServices()`.
5. **`features/<area>/`** — the component.

## Traps

**Adding a load or rep variant** means adding to the union in
`domain/programs/prescription.ts`. `switch-exhaustiveness-check` will
then fail the build at every consumer until each is handled. That is
working as intended — silently falling through to a default is how a
prescription becomes a wrong number.

**Never edit an existing IndexedDB migration step.** Bump `DB_VERSION`
and add a new guarded block. A device that already ran a step will not
run it again, so editing one leaves two devices with different schemas
and no way to tell.

**Exercise ids are slugs, not UUIDs** (`bench-press`). They are stable
across devices and readable in an export file. Do not "fix" this.

**Icons are generated**, not hand-placed: `node scripts/generate-icons.mjs`.
CI fails if `public/icons` and the script disagree.

**The rest timer derives from an absolute timestamp.** Do not rewrite it
as a countdown; a locked phone suspends the tab and the timer would
under-report.

## Mobile UX bar

Used one-handed, in a gym, with chalky hands, between sets.

- Every control clears 44px (`.tap-target`).
- Numeric inputs use `inputMode="decimal"` and no spinners.
- Nothing important sits at the top of the screen; navigation is at the
  bottom, where a thumb reaches.
- A set is logged in one tap plus two prefilled numbers.
