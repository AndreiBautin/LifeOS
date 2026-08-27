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

**Incidental credit is spent once.** The fill budgets **compounds before
isolation** (two passes over the same muscles, the first restricted to
`isCompound`), and `shareOwed` subtracts what the day has already paid a
muscle from that day's share **in full**, not diluted across the sessions
that follow.

Both halves are needed and the bug they fix is invisible from the totals.
Monday sized six curl sets against an unpaid biceps target and _then_
placed chin-ups for the lats, which paid the biceps another two and a
half: the day delivered 8.5 against a fair share of 5.7, the week
delivered 21 against a target of 17, and Wednesday — the crowded day —
got the two sets that were left. It reads as a scheduling quirk and is
actually the same credit being spent twice.

**That subtraction starts from the day's strength work, not from zero.**
`added` is seeded with the volume of `existingSlots` — the competition
lifting is the largest thing in the session, and a Monday bench pays the
chest about six credited sets before any accessory is chosen. Seeding it
empty told the fill the chest was untouched, so it added a full share on
top, and the muscles sorted below it got whatever minutes were left. The
rear delts were the visible casualty: 7.5 against a target of 11, fixed
to exactly 11 by this one line.

**A session's share is the remainder divided by the sessions left, not
`target / frequency`.** The fixed share is the cleaner-sounding rule and
is worse, which is recorded here because it will be proposed again: it
spreads the _plan_ evenly and cannot absorb an error, so a day that
over-delivers leaves the whole overshoot on the last session — biceps
7.5 / 5.5 / 3 against 5.5 / 6 / 5.5 for the remainder rule. What matters
is that sessions-left is a **count of days that train the muscle**, not a
measure of how long any of them ran: two sessions with the same muscles
get the same share whether one finished in forty minutes and the other
in eighty.

The backfill has a slot grace of **one**, not just a time grace. A
two-set frequency slot costs four minutes, so a day with time left will
take four or five of them and arrive at thirteen exercises of two sets —
inside the minute budget, and the shape splitting the volume was meant to
avoid.

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

**`domain/game/` is the model for the whole hub, and nothing imports it
yet.** Lift is being promoted to the app every other life-tracking app is
absorbed into, and [docs/GAME_MODEL.md](docs/GAME_MODEL.md) decides — before
any of them arrive — what a number is allowed to mean: three currencies
(ladder, rating, XP), one tech tree, three rules. `character.ts` is the
part of it that is wired up; `ladder.ts`, `rating.ts`, `xp.ts`, `tree.ts`,
`credit.ts` and `registry.ts` are not, deliberately. Hooking a new domain
to XP during its migration is how the exchange rate gets set by accident,
in a commit whose message is about something else.

The three rules are tests, not prose: **no ladder is fed by XP** (a ladder
must name an external standard), **no rating is promoted to a ladder** (no
measurement may be claimed by both), and **nothing is counted twice**
(`creditFor` returns one credit or none). `registry.test.ts` fails on each.

**The backlog is the first absorbed app, and it is namespaced for a
reason.** `domain/backlog/` holds a second `Settings` and a second
`priority/`: Lift's priority is muscle tiers and capacity, the backlog's is
how much you want to get to a book. The directory is what keeps them
apart, and `BacklogSettings` / `BacklogItemId` are named for their area for
the same reason. Its `updatedAt` is optional and written by the repository,
not by `createItem` — the domain deliberately leaves it undefined.

**A progress log is unioned by day, and it is the only merged record in
the app.** `unionProgress` in `domain/sync/payload.ts`. Everything else is
whole-record last-write-wins, which is right for a workout — you log sets
on the phone and read them at the desk — and wrong for a backlog: a chapter
on the phone on Monday and an episode on the laptop on Tuesday, with
neither device having heard from the other, loses Monday entirely. Do not
"simplify" this back to a record-level winner; `synchronise.test.ts` fails
in two places if you do.

**The quest log is the hub's front page, and two of its rules used to be
the database's job.** `/next` is what `/` redirects to. Cycle detection
(`validateBlockers`) was enforced in the schema as well as in code and is
now the only guard there is; cascade delete is `withoutBlocker`, called by
hand, because a dangling blocker id would otherwise sit in the record,
travel over sync, and come back if a later project reused the id.

**The tech tree is where `domain/game/` stops being unwired.**
`domain/upgrades/` projects an upgrade onto the model's `TreeNode`, so
`GATE_KINDS` — money and a prerequisite, nothing bought with points — now
constrains live code. Money is integer minor units everywhere; a budget
filter on floating point eventually disagrees with itself. Two of its
rules had a database behind them and no longer do: `wouldCreateCycle`, and
the refusal to delete anything with dependents still attached.

**No area scores itself.** `domain/review/` is the spine and
`from-registry.ts` is the join: a rating declared in
`domain/game/registry.ts` becomes a metric the evaluators judge. Do not add
scoring to a domain — declare the rating and let the spine do it, or there
are two answers to "is this going well" within a release.

**A measured value is stored under its metric id, not its source id.** The
two names are separate on purpose — a source produces a number, a metric
judges it — and `seriesFor` looks up by metric. Storing it the other way is
silent and total: every measured area reads as never recorded while the
snapshot sits there full of numbers. That shipped once and was caught by
driving the app, not by a test; there is one now.

**Absent, never zero, everywhere in the review.** A source with nothing to
count reports nothing, `seriesFor` skips unrecorded months, `blend` ignores
what had nothing to say. A zero turns an honest blank into an accusation,
and it compounds — one fabricated reading makes the next month's trend a
lie too.

**The fog is a grow-only set, and that is the only reason it can sync.**
`unionCells` in `domain/sync/payload.ts`, one row per geohash cell in
`exploredCells`. It carries no stamp and no tombstone because neither
question arises — two copies merge by union, and you cannot un-walk
ground. It is the one collection exempt from `acceptableFrom`. Do not
"simplify" it back to a blob: as one record under one stamp, the device
that walked less recently has its morning erased, and no version of
last-write-wins fixes that.

**A vague fix reveals nothing.** `revealCell` refuses anything worse than
100 m, and the gate is irreversible in one direction only: fog cleared by
a bad reading cannot be put back, for the same reason there is no
tombstone. Do not relax it to make the map feel more responsive indoors.

**The atlas makes no network calls, and the gap is deliberate.**
Map's inbox is built around a Nominatim search that turns "Kiln, London"
into coordinates. That is a third-party request, and this hub's stated
identity is that it makes none — so `features/atlas/InboxPage.tsx` ships
the local half only: paste a link, a `geo:` URI or a pair of numbers, or
say you are standing there. If a geocoder is ever added it is a decision
about what this app is, not a feature to slip in behind a search box.

**The exploration ladder's denominator comes from a person, not the app.**
`exploredRegionKm2` in settings. The ladder is only a ladder because a
named region has a real boundary, and nothing in the app knows which
region is meant — so with none set, `places.explored-share` is _absent_
rather than zero. Absent readings are skipped by the spine on purpose; a
zero would be the claim that a month's exploration came to nothing.

**A rule nothing can reach is a rule nobody can trust.** Both the quest
log's cycle guard and the tree's were briefly unreachable from the UI —
the domain refused correctly and no screen could ask it to. Adding a
domain rule means adding the control that can trip it, or the guard is
decoration with a test attached.

**The bottom navigation is full at six.** Adding an area means taking one
out, not adding a seventh — History moved to a link on the Train page for
exactly that reason. Phase 7 owns the proper rethink; until then, a new
area displaces something rather than squeezing in beside it.

**Logging progress is serialised per item, by hand.** `serialise` in
`features/backlog/hooks.ts`. It is a read-modify-write, so two in flight
at once count two taps as one. React Query's `scope` does exactly this job
and was tried first: it queues correctly and then does not drain when an
observer unmounts mid-queue — which a hot reload does — leaving the row
permanently dead with no error anywhere. Four lines of promise chain has
no such failure mode.
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

Two more say something about the _record_ rather than the training, and
they are the pair most easily confused. **Deleting** answers "this
session did not happen" and deliberately **moves nothing** — removing a
record is a claim about the record, and rewinding the program from there
would make one destructive action into two, the second invisible.
**Reopening** answers "it is not over yet", and therefore **must** move
the program: the session is still running, so the position finishing
advanced past is simply wrong, and left forward the lifter finishes
today a second time and lands two days on.

`reopenWorkout` restores the position **from the log**, not by inverting
`nextPosition`. A `WorkoutLog` records where it sat, so there is a right
answer to read; a subtly wrong inverse would only surface on the last
day of a block. It refuses four cases rather than resolving them —
nothing left pending, another session already open, a later session
already filed, no such workout — because each of those is a different
request wearing a resumption's clothes.

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

**A lift rotates through variations; the competition version is always
first.** `STRENGTH_VARIATIONS` in `domain/exercises/catalogue.ts`. The
bench runs **paused, touch-and-go, close-grip** across its three sessions,
picked by the lift's session ordinal — not by the day. Index 0 is the
competition version so that dropping the bench a tier, which buys fewer
sessions, costs the variations rather than the lift the total is measured
on.

**The paused bench is the competition lift**, because a raw meet bench is
judged on a pause and a touch-and-go single measures something else.
`bench-press` is therefore the _touch-and-go_ variation despite its slug,
which is the one genuinely confusing thing here — the slug is kept
because it is written into every existing log, and renaming ids to match
a change of meaning is how history stops resolving.

This is a rotation, **not** an anchor, and the distinction is the reason
`RpDay.anchors` is not coming back: nothing is pinned to a _day_. The day
asks for the bench and gets whichever version the tiers' session count
implies.

The variations are separate exercises with their own slugs, their own
`estimatedMaxes` entry and their own history, because a close-grip bench
is a lift with its own maximum rather than a bench done differently.
`withDerivedMaxes` fills an unmeasured variation from its parent (95% and
90%) so the first session has a suggestion; **anything measured always
wins** — a derived value that overrode a real one would be the training
max mistake in a new costume. It is applied where the athlete is
assembled, never inside `resolve`, so resolution stays a function of the
numbers it is handed.

The cost, stated plainly: only `paused-bench-press` is `isCompetition`,
so the character sheet's bench standard and the total now move on one
session a week rather than three. That is correct — the other two days
are not measuring the lift being scored — but it is a real change to how
fast that number responds.

`migrateBenchEstimate` moved the old `bench-press` estimate onto the
paused bench at 95%, because a number stored under that slug was pressed
without a pause whatever the exercise was called at the time; copying it
across would have credited a paused max nobody had lifted. It is
idempotent and never overwrites an existing paused estimate, so a
correction sticks. **A settings migration that silently changes a
strength score is the failure to avoid here** — this one is discounted,
tested in both directions, and visible as an 11 lb drop in the total.

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

**A repeat is penalised across the week, not just against yesterday —
and the repeat is the _movement_, not the exercise id.** Keyed on
`primaryMuscle|pattern`, the same key the day-level check uses. Four
wrist exercises are two movements, so an id-level penalty cheerfully
scheduled a barbell wrist curl and then a dumbbell wrist curl and called
the forearms trained: twice into flexion, extensors untouched. Naming
`wrist-flexion` and `wrist-extension` as patterns is what makes "once
each way" fall out of the rule rather than needing a special case.

It is a soft sort, never a filter: side delts have two hypertrophy
options and calves have one, so banning a repeat would drop the muscle
from the day instead.

**Straps mean the pulls stop paying the forearms.** `STRAPPED` in
`domain/exercises/catalogue.ts` strips `forearms` from the secondary
list of every strapped pull as the catalogue is built. The forearm work
in a heavy pull is _grip_; in straps it is gone, while the lat and
hamstring credit is untouched. Leaving it in had the app believe a
strapped deadlift trained the forearms — twelve credited sets against a
target of six, and nothing direct ever scheduled.

A list rather than a setting on purpose: this is one lifter's garage,
the catalogue is how content is delivered, and a boolean would mean a
settings field, a sync key, a screen and a migration to express
something that is one line to reverse. The kettlebell swing is not on
it — nobody straps a swing — and neither are the curls, whose forearm
involvement is wrist and elbow work rather than grip.

**The forearm landmarks were raised with it**, from MEV 2 to MEV 6. They
were low for the reason the traps' are: nearly everything paid them.
A landmark set against a source that no longer exists is a target the
week meets on paper with two sets of curls — and at MEV 2 there was only
ever room for one direct session, which cannot be both directions.

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

**Traps are their own muscle, split out of the upper back.** One
group was covering two regions: a barbell row and a barbell shrug were
both `upper-back` while training almost nothing in common, so rowing
satisfied a target a shrug was then scheduled to fill. Traps carry a low
MEV because nearly everything pays them — every deadlift, row and heavy
carry loads them isometrically, and naming that credit is the point of
the split. The shipped week now delivers 7.5 trap sets against a
maintenance ask of 2, entirely incidentally, and schedules no shrug.

The trap that came with it: `MUSCLE_GROUP_LABELS` and
`DEFAULT_LANDMARKS` are `Record<MuscleGroup, …>` so a new group fails the
build until both are filled, but **tiers are an array** and a new group
silently belongs to no tier. Typecheck passed with traps untiered.
`tiers.test.ts` → "places every muscle group in exactly one tier" is the
guard, and `completeTiers` drops an unknown muscle into the bottom tier
when reading settings saved before it existed.

**A deletion is a fact, not an absence.** `domain/sync/tombstone.ts`.
Removing a row leaves nothing behind, and nothing is indistinguishable
from "never existed" — so any merge reads it as a record the other copy
knows about and puts it back. This was reachable before any sync existed:
export a backup, delete a session, import in merge mode, and it returned,
counted as an _addition_, because that is genuinely what the merge
thought it was doing. `repositories.remove` now writes a tombstone, and
`acceptable()` in the backup service filters incoming records through
them.

The comparison is against the record's own `updatedAt`, not absolute, so
a deletion is a statement about the record as it stood rather than a
claim on every future version. A record with **no** `updatedAt` loses to
any tombstone: it cannot prove it is newer, and assuming otherwise
resurrects exactly what the tombstone was added to prevent.

**`save` stamps, `restoreMany` does not.** Two names, because they are
two operations. `save` sets `updatedAt` to now; `restoreMany` writes
records exactly as given, and is what the import path uses. Stamping on
restore would make every incoming record the newest thing in the
database, which is the one comparison a merge depends on. Stamping lives
in the repository rather than in callers: five paths write a workout, and
a rule living in any of them is a rule the sixth will miss.

**Position is deliberately not synced and not backed up.** It is absent
from the backup envelope, and that was decided before any of this. It is
also the only record with no correct last-write-wins answer — two devices
both advancing a single cursor cannot be reconciled by timestamp — so
leaving it device-local is what makes every _other_ record safely
mergeable. Deriving it from history instead does not work: skipping
advances the position and deliberately writes nothing, so the log cannot
reconstruct it.

**Never edit an existing IndexedDB migration step.** Bump `DB_VERSION`
and add a new guarded block. A device that already ran a step will not
run it again, so editing one leaves two devices with different schemas
and no way to tell.

**Bump the version and write the step in the same edit.** The trap has a
sharper edge than it reads: with `pnpm dev` running and a browser open,
saving a `DB_VERSION` bump _before_ the `if (oldVersion < n)` block exists
means the tab reloads, opens the database at the new version, and runs no
new step. The version is now spent — that device is at version _n_ with
the store missing, and adding the block afterwards cannot reach it,
because it already ran _n_. It cost a development database here, which was
empty; on a real device it would cost a repair migration in the chain
forever.

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
