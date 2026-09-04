# Working on LifeOS

A client-only React + TypeScript PWA covering six areas — training,
quests, a backlog, a tech tree, a circle and an atlas — scored by one
game model. **No server of ours, and no database of ours.**
Persistence is IndexedDB behind a repository interface. That constraint is
the product, not a limitation — see
[docs/PERSISTENCE.md](docs/PERSISTENCE.md).

The honest qualifier: the map talks to OpenStreetMap. Tiles come from
`tile.openstreetmap.org` on every pan, and the inbox's search asks
Nominatim to turn a name into coordinates. Both are the same third party,
both are opt-in in the sense that they only happen on the map screens, and
neither carries a record — but "no network calls" was never true once
Leaflet was rendering live tiles, and claiming it made the _other_
requests look like a bigger step than they are. Firebase sync, when
configured, is the other one.

## Before you finish anything

```bash
pnpm verify    # typecheck + lint + format:check + test:run + build
```

**Use `pnpm typecheck`, never `npx tsc --noEmit`.** The root `tsconfig.json`
is a solution file of project references, so `tsc --noEmit` against it
can pass while the app is not checked at all — it did, and reported clean
on a call site passing a `ViceId` where an object was required.
`pnpm typecheck` runs `tsc -b`, which builds the referenced projects and
actually looks.

A pre-push hook runs this and refuses the push if it fails. The same
command gates the deploy. If `pnpm verify` is green the change is
shippable; if it is not, it is not — there is no third state.

## Shipping

**Finishing a change here includes pushing it to `main`.** Asked for
directly — _"can we update the skills so this is always the case for
this project at least? Once you're done running, I want to be able to
open the app on my phone, click the reload thing, and see the changes in
effect."_ This paragraph is that standing authorization, and it
deliberately **overrides the global default** of committing only when
asked. The `ship` skill in `.claude/skills/` carries the procedure.

It has to be standing rather than requested each time because of the
shape of this app. There is no staging and no way to look at a branch:
the only build a person can actually use is the one on the phone, and
the only route there is `main` → the Pages deploy → the update banner.
A change that is green on a laptop has reached nobody, so leaving the
push out is not stopping short of the risky part — it is stopping one
step before the change exists.

**It authorizes pushing finished work, not pushing anything.** A red
`pnpm verify`, a half-built change, anything destructive, and anything
touching `firestore.rules` or `VITE_ALLOWED_UIDS` all still stop and
ask. A red gate is the one state that is never shippable, and pushing it
burns the deploy and the phone together.

**A push is not a deploy, and the gap is about three minutes.** The
workflow re-runs `pnpm verify`, builds, publishes, and then fetches the
live URL and greps it for the app shell and the manifest — so a green
run means the site answered rather than that an upload succeeded. Do not
tell anybody a change is on their phone before that run is green.

**The sha is what makes the update banner falsifiable.** Settings shows
the commit of the running build, so "Already the newest" beside a sha
that does not match the one just deployed separates a phone that will
not update from a deploy that never happened. That distinction is the
whole reason the manual check exists, and it is useless if nobody says
which sha was expected.

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

**Strength is RTS, and only RTS.** Four lifts are run by reps at an RPE
with back-off work driven by measured fatigue percentages
(`domain/framework/rts.ts`) — and **only three of them are a total.**

The overhead press is the fourth. It was removed as a main lift because
5/3/1 wanted one and it contributes nothing to a powerlifting total; the
second half is still true, and was never an argument against training it
heavy. `measure.ts` names squat, bench and deadlift explicitly and
`isCompetition` is false on the press, so it gets a top set and back-offs
without entering the score. **Do not compute the total from
`STRENGTH_LIFTS`** — that was safe while the two were the same three
lifts and is exactly the kind of thing that looks like a tidy-up later.

**One bench, and it is the touch-and-go one under its plain name.** Three
bench variations existed to fill three sessions a week; at one session a
week a rotation has nowhere to go. `bench-press` is the tracked lift again
— the slug never moved, because it is written into every filed log — and
the paused and close-grip versions keep `VARIATION_OF` ratios off it so a
lifter picking one by hand gets a suggested load.

The cost is real and belongs on the record: **this number is no longer a
competition bench.** A touch-and-go single is worth more than a paused
one, so the character sheet's bench standard and the total both read a
little high against a meet. `migrateBenchEstimate` has now pointed both
ways for this reason and is documented in the direction it currently
runs.

**The top set is a triple.** `topSetReps` is 3. The top set is a
measurement before it is training — reps at an RPE, read back through the
chart as an implied max — and a triple sits closer to the single the total
is scored on, so less of the chart's error lies between what was lifted
and what it claims you can lift.

It costs the other job the top set was doing, and that cost is not
recorded anywhere on a screen: five reps at RPE 8 is a real hypertrophy
stimulus for the muscles the lift trains, and three is much less. The
back-offs carry that alone now. If the chest or the quads start looking
thin, this is the change to suspect first — the bench and the squat pay
them less than they did.

5/3/1 was removed wholesale — framework, assembler, recipes, splits,
progression, `percent-training-max`, training maxes. It is in the git
history if it is ever wanted back. Do not reintroduce a second framework
without deciding to carry two of everything again.

**A session measures the estimate it is derived from, and until now
nothing could keep the reading.** The report showed "e1RM 353" and the
only route from there to `estimatedMaxes` — which drives every suggested
load in the app — was reading the figure off the screen and typing it
into Settings from memory. `ApplyEstimates` in `SessionReport.tsx` closes
it: **offered, never applied**, with the old and new numbers side by
side, the same stance the file import takes and the one
`adjust-landmarks` was built with. An estimate that moved on its own
after every session would shift the loads for reasons the lifter did not
choose and cannot see.

Unreliable readings are excluded rather than shown with a warning. A set
of fifteen produces a number the formula is not fitted for, and writing
that into the basis for every future load is worse than leaving the basis
alone.

**Changing `DEFAULT_SETTINGS.estimatedMaxes` reaches nobody who has
opened the app.** `settings-store` takes stored maxes wholesale whenever
there are any, so the constant is the fresh-install figure and nothing
more — the same trap `SETTINGS_SCHEMA_VERSION` exists for, and the reason
the apply path above had to exist rather than a bumped default.

**A test about a ratio must state its own numerator.**
`review.test.ts` → "measures strength as a multiple of bodyweight" read
the squat off `DEFAULT_SETTINGS` and asserted 1.515, so it failed the day
that default moved — a true fact about a constant it does not own, and
nothing about the division it exists to check. It states both numbers now.

**A suggested load is never the prescription.** `estimatedMaxes` (in
settings) is the basis for every suggestion, and an estimate is
acceptable _because_ RTS asks for reps at an RPE: get the number wrong
and the lifter corrects it by loading the bar they were going to load
anyway. This was the opposite under 5/3/1, where the percentage _was_
the prescription and an estimate would have silently changed what a cycle
meant — which is why training maxes existed and why they went with it.

**Strength sets are not hypertrophy volume, and this reverses a rule that
stood for a long time.** The fill used to subtract what the competition
lifting had already paid a muscle — `committed` started at the week's
strength spend, `added` at the day's — on the reasoning that not doing so
turns one coherent programme into a powerlifting block with a
bodybuilding routine stapled to it. That reasoning was sound while a top
set was five reps.

Triples broke it. A top set of three plus three back-off triples is
twelve reps at high load: a real strength dose and close to nothing as
hypertrophy, which the accounting still called eight sets. Eight covered
the chest's entire six-set target, so **the week scheduled no chest work
at all** — no dips anywhere, on a split whose first exercise is a bench
press.

They are counted apart now. A muscle's setting is a claim about the
accessory work scheduled _for_ it, and the competition lifting sits on
top: the chest asks for six, gets six of dips, and is benched heavily
twice besides. The cost the old comment named is real and is now the
lifter's to manage by setting a muscle to fewer sessions, rather than the
assembler's to hide.

**`countsAsHypertrophy` is the one predicate, and conditioning is on the
wrong side of it too.** Volume tracking counts `hypertrophy` and
`assistance` slots and nothing else — not warm-ups, not the competition
lifts, not conditioning. The conditioning case is the one that shows why
this is a _role_ check rather than a judgement about set counts: thirty
sets of ten kettlebell swings arrived as **sixty glute sets a week**
against a target of zero, and it only became absurd once the swings were
prescribed as sets rather than as a block of time. Nothing about the work
had changed. A twenty-minute walk was quietly adding two calf sets by the
same route.

Any test comparing delivery against a target uses `hypertrophyVolume`
rather than `weeklyVolume`, or it is measuring two things against a number
that describes one.

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

**The whole volume model is one multiplication.**

```
  weekly sets = sessions a week × sets per session for its level
```

Each muscle carries a `sessionsPerWeek` and a `level`; the levels are four
shared numbers — deload 2, low 3, medium 4, high 5 — and a deload swaps
the level for the deload number while keeping the frequency. Each
competition lift carries a `sessionsPerWeek` of its own.
`domain/volume/levels.ts` and `DEFAULT_LIFT_SESSIONS` in
`domain/priority/tiers.ts`. **Nothing is derived from anything else, and
no number depends on any other muscle.**

Zero sessions is a first-class answer, not a bottom tier. It means the
muscle gets no dedicated work and lives on what the competition lifts pay
it, and it is what most muscles are set to.

**Five sets and three sets are `MAX_SETS_PER_SESSION` and
`minSetsPerSlot`.** With one exercise per muscle per session a level is
choosing how long that single exercise runs, so the high level and the
slot ceiling are the same number by construction. If they drift apart a
level will ask for a slot the fill cannot build.

**What this replaced, so nobody rebuilds it by accident.** Four eras of
increasingly elaborate derivation, each a reasonable fix for the last:
per-muscle RP landmarks (MV/MEV/MAV/MRV, fifteen rows) scaled by a
two-thirds factor for direct-only credit and clamped to what a week could
schedule; a priority _tier_ that chose a position between 0 and 1; that
position lerped through the four landmarks; and the result clamped again
by a frequency the same tier had chosen. Gone with it: `Tier`,
`priorityPosition`, `weeklyTargetFor`, `TIER_FREQUENCY`,
`reachableWeeklySets`, `VolumeLandmarks`, `DEFAULT_LANDMARKS`,
`adjust-landmarks.ts`, and the four position constants.

What is genuinely lost is worth naming because it will look like an
oversight. A landmark is a claim about a **muscle** — side delts recover
faster than quads and can take more — and a level is a claim about a
**session**, shared by everything assigned to it. Per-muscle difference is
now expressed by assigning a different level, which is coarser and is a
decision a person can see and make. If evidence ever justifies real
per-muscle numbers, that is a new field on `MuscleVolume`, not a return to
interpolation.

**The check-in loop went with the landmarks, and it was never wired up.**
`adjust-landmarks.ts` turned check-in history into a proposal to move MAV
— three sessions of evidence, clamped to the band, never applied silently
— and `proposeLandmarks` had no caller outside its own test. It was the
rule nothing could reach that this file warns about elsewhere. If
autoregulated volume comes back, the thing to move is a muscle's level,
and it needs a screen the same day it needs a function.

**Each lift carries its own sessions a week**, `liftSessions` in
settings, two by default. `assignStrengthLifts` places them on the days
whose `carries` matches the lift, choosing the **emptiest** eligible day
each time. Spacing each lift across its own eligible days is the obvious
implementation and is wrong the moment two lifts share a pool: a squat and
a deadlift wanting one session each from the same two lower days both
computed the same index and landed on Tuesday.

**A day holding two lifts runs them in `STRENGTH_LIFTS` order**, so the
squat opens every lower day and the deadlift always follows it. This used
to alternate, and the reason it did has not stopped being true: whichever
lift is second is second after a full top set and its back-offs, every
session, for the whole block, and never gets a day where it is the
priority. The alternation was removed because squat-then-pull was asked
for, and the order of two lifts in a session is a training preference
rather than a correctness property. **The cost is real, unmeasured and
invisible on every screen — if the pull stalls while the squat does not,
suspect this first.** `rp-assemble.test.ts` → "opens every lower day with
the squat" is the record, inverted rather than deleted so that quietly
restoring the alternation has to be said out loud.

**The fatigue allowance equals the load drop, always.** One setting —
`settings.fatiguePercent`, 5 by default and adjustable from 5 to 10 — read
as both. That
equality is what makes the stopping rule sayable: at matched reps and
RPE an implied max is proportional to bar weight, so stopping at a 5%
drop in implied max _is_ the moment the 5%-lighter bar feels like the
top set did. One sentence, no arithmetic, true on every lift. Varying
the allowance by tier (2% to 7%) was coherent and made that sentence false
for every tier but one, which is why the setting is a single number rather
than a pair: two fields would let a lifter set a 5% bar and a 9% target
and there would be no sentence left to say.

**The setting is RTS's published scale and nothing else** — 0 none, 2
minimal, 5 moderate, 7 high, in `FATIGUE_CHOICES`. It was a free integer
from 5 to 10 on the reasoning that a lifter who has run 7% knows something
a general scale cannot. True, and it made the control a slider over
numbers that mean nothing individually: these are four _named amounts of
work_, not samples from a continuum, and "moderate" is a decision a lifter
can make where 5 is a number they can only accept.

`nearestFatigueChoice` snaps a stored value rather than clamping it,
because devices hold 8s and 9s from the old range — a 9 reads as "high"
rather than being dragged to the top of a range it was never on.

**The stopping rule was never wired up, and it printed advice about
itself the whole time.** Reported: _"I hit RPE 8 on back-off set two and
it didn't cap the sets or anything."_ It could not have.
`evaluateFatigue`, `accumulatedFatiguePercent`, `nextBackoffLoad` and
`nextBackoffReps` had **no caller outside their own test** — the entire
live half of RTS. The app planned the slots, wrote "until RPE 8" into
the note, and never read the RPE.

Fifth instance of the pattern this file keeps recording, after
`proposeLandmarks`, `readinessScore` feeding a session adjustment
nothing called, `moveDailyHome` with no control, and the fatigue percent
being decorative for two commits. **A rule that prints advice about
itself is the worst version**, because the lifter believes it is
watching.

`domain/framework/backoff-stop.ts` is the adapter — deliberately not in
`rts.ts`, which works in `PerformedSet` and must not learn what a
`WorkoutLog` is.

**The printed rule and the evaluated rule were not the same rule, and
rounding made them disagree almost every time.** This is the part worth
keeping. The slot says "until RPE 8" from a `stopRpe` baked into its
prescription; the evaluation asked whether the accumulated drop had
reached the target percent. Those agree only when the bar _is_ exactly
the drop — and the bar is rounded to something you can load. Measured on
a real session: 305 drops 5% to 289.75, rounds to **290**, which is
**4.92%** lighter. At matched reps and RPE the implied-max drop equals
the bar drop, so RPE 8 accumulated 4.92% against a 5% target and the
arithmetic said keep going while the screen said stop. The RPE is now
compared to the number that was displayed, read from the record that
displayed it — one rule, one source. It only ever _adds_ a reason to
stop; the arithmetic still owns target-reached and the set cap.

**It reports and offers; it does not act.** The remaining sets are not
cleared automatically — this is a reading of a self-reported RPE, and a
session that deleted work on one tap would be hard to argue with when
the tap was wrong. One button does it, and the sets can still be logged
if the lifter disagrees. They are **skipped, not cleared**: "I chose not
to do this" is a recorded outcome and `pending` means the session was
never finished, which the volume count reads differently.

**The back-off count is derived from the fatigue target, and for a long
time it was not.** Reported from real use: _"back-off sets shouldn't
always display 1–3, they should be the range based on the fatigue
percent set."_ They always did — the count was
`min(maxBackoffSets, STRENGTH_BACKOFF_CAP)` with the cap a flat 3, so
every non-zero target built the same session and the setting decided
only _when to stop_, never what went in the plan.

**The reasoning behind the flat cap was right and incomplete**, which is
why it survived: it said the number should sit where the stopping rule
usually fires, because the slots are materialised and counted as volume
whether or not you reach them. True — and it then fixed that number at
one point on a scale with four. It is the same defect `none` was
already fixed for, arriving further along the same scale.

`plannedBackoffSets` derives it at about `DROP_PER_BACKOFF_PERCENT`
(1.75) lost per set, so 2% plans one, 5% plans three and 7% plans four,
with a floor of one for any non-zero target — rounding a small target to
zero would silently turn it into "top set only", a different choice the
lifter did not make. The constant is an estimate and is named as one;
the stopping rule stays authoritative and fires on the day's readings.

Measured across a working week: **0 / 6 / 18 / 24** back-off sets for
none / minimal / moderate / high, where every non-zero setting used to
give 18. **Moderate is unchanged**, so the shipped default programme
does not move — only choosing a different target does, which is the
whole point.

`STRENGTH_BACKOFF_CAP` is gone. The Plan screen said "At most 3"
whatever the setting was, from the same constant, and now reports the
number your own target plans for.

**None means no back-off slot at all**, not three the stopping rule
immediately cancels. The cap is materialised as slots and counted as
volume, so a plan that is only correct if you skip most of it is not
correct.

**The setting was decorative for two commits and that is the lesson.**
`settings.fatiguePercent` existed, the editor changed it, and
`recipeFromSettings` went on passing `DEFAULT_RTS` — so the control
decided nothing while looking like it worked. A rule nothing can reach is
a rule nobody can trust; a _control_ nothing can reach is worse, because
the lifter believes they changed something. Two tests now assert the
number arrives.
**Frequency is a means to volume, never a goal.** The backfill will not
schedule a muscle already at its weekly target, secondary credit
included. This is the one exception to "every muscle gets the sessions it
asked for", and it is why `rp-assemble.test.ts` → "trains every muscle as
often as its tier asks" exempts a muscle already at target — a second
session for a muscle at its number buys fatigue and no stimulus. Without that guard the two-session floor applied to the front
delts — asking for three sets while the bench press and dips paid them
ten — and put an overhead press on every Friday to satisfy an arithmetic
minimum for a muscle at three times its target. The backfill also orders
by deficit, not by the order muscles happen to appear in `RpDay.muscles`;
that array is grouped by region, and walking it verbatim left the side
delts last in `UPPER` and finishing blocks ten sets short.

**One exercise per muscle per session, three to five sets, or the muscle
is not trained today.** `alreadyCovered` in `pickHypertrophyExercise` keys
on `primaryMuscle` alone. It keyed on muscle _and_ pattern, which let the
compound pass place a row for the upper back and the isolation pass a
shrug, so one muscle's session dose arrived split across two movements and
two ramp-ups. The pattern half is subsumed — two movements for one muscle
are barred whether they share a pattern or not. Day-scoped, because
`placed` is: the _weekly_ repeat penalty still keys on muscle-and-pattern,
and that is what gives the forearms flexion one session and extension the
other.

`minSetsPerSlot` is 3 and `maxSetsPerSlot` is `MAX_DIRECT_SETS_PER_SESSION`.
Those two now describe the same quantity rather than bounding a slot and a
muscle separately, which is what one-exercise-per-muscle makes true — keep
them in step. The floor is the load-bearing half: a one-set slot costs a
warm-up and a machine and delivers almost nothing, and the fill will
happily produce a dozen of them to make a total come out. Below three the
muscle waits for a session that can do it properly.

**There is no session length at all — no minimum and no maximum.** The
minimum went first, and enforcing it had taken three mechanisms: a grace
period letting the frequency backfill overrun, a top-up pass scheduling
muscles already at their target, and a loop lengthening existing slots one
set at a time, all to move a thirty-nine minute session to forty-one.

The ceiling outlived it by a while, as `SESSION_MINUTES_CAP = 70`,
defended as a recovery budget rather than a clock — "one day must not
claim the whole week". That defence stopped holding once a muscle's weekly
target was itself clamped to what its tier's frequency can deliver. **The
target is the recovery budget now**, and the ceiling was a second one laid
on top: a day could satisfy every landmark it was accountable for and be
cut off mid-fill regardless.

What it cost is the reason it is worth a paragraph rather than a line,
because it read as a cap nobody reached right up until the split changed.
Four days with nine tier-2 muscles ran the upper days out of clock at six
accessory slots, so the side delts and the triceps got one session where
their tier asked for two and the traps got nothing at all — a training
decision made by a constant, invisible on every screen and unreachable
from any setting. Removing it took the week from three muscles short to
**zero**, at the price of upper days that run about ninety minutes of
lifting.

**Nothing bounds a day now except the arithmetic that produced its
volume**, and that is genuinely a bound rather than an absence of one: one
exercise per muscle per session, at most five sets, over a muscle list the
split fixes. `estimateDayMinutes` still reports how long a day takes —
reporting is not enforcing — and `SESSION_TOO_LONG_MINUTES` survives as a
line the suite holds the assembler to, not as anything the assembler
consults. If a session comes out too long the answer is fewer muscles at
tier 2 or more days, decisions a person makes and can see, rather than a
constant quietly declining to schedule the last two exercises.

Gone with it: `maxHypertrophySlotsPerDay`, `BACKFILL_TIME_GRACE`,
`BACKFILL_SLOT_GRACE`, `slotMinutes` and `isEasyConditioning`. That last
one is worth knowing about if you go looking for it — it kept the Zone 2
walk out of the accessory budget, because charging twenty minutes of
walking against a recovery allowance it does not consume had once halved
the side delts. With no budget to charge against, it had nothing left to
decide.

A short day is information. A deadlift day with the legs on maintenance
runs fifty minutes because that is what the tiers asked for, and the Plan
screen reports what the week does and does not deliver.

**Zero sessions is zero, and one muscle pays for that.** Quads and
glutes are maintained and fine, because the squat and the deadlift are
scheduled _for_ them and pay well past what maintenance would ask. The
trunk and the grip are maintained and get nothing, which is the intent.

The hamstrings are the case to know about: no competition lift has them as
its primary muscle, and secondary credit is gone, so at tier 3 they
receive **literally nothing** — the Romanian deadlift that used to cover
them was a tier-3 slot and tier 3 no longer has slots. If that is not
wanted, the fix is to move them to tier 2 rather than to reintroduce a
maintenance dose.

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

**Conditioning is programmed but not scored.** It was a mile time nobody
was running, so it sat at Untrained permanently — a fixed zero on a screen
whose job is to show movement. Consistency levelled the session count,
which XP already spends. Nothing measures conditioning, so nothing scores
it; that is the same rule every other area follows.

**Every screen's header comes from `PageHeader` — except Today, which
has none.** It was seventeen copies of one class string, and the
duplication was the smaller half of the problem: a heading over a grey
line is what a settings pane looks like, so every screen in the app
opened the way a form does.

The exception was asked for: _"let's just drop that entire heading
section and just start with the card."_ It holds because every other
title says what the screen is, and **a portrait of you at the top of the
page says it without a word** — so what the header added there was a
noun over an ISO date, above a picture that had already answered. The
level and the date moved into the card and the settings link went with
them. **Do not extend the exception**: a screen that opens on a list
needs to be named, and this one opens on a face.

The page's `h1` had to move with it, and did not for a commit — Today's
headings started at `h2`, leaving somebody navigating by heading no
title for the screen the app opens on. It is the visible `Level N` line
now rather than a hidden "You" beside it: a hidden title is a second
name for the same thing and drifts the moment either changes.

It briefly carried a lit accent rule above the title, and that is gone
again — asked about, within a day, by the person using it. **Decoration
that means nothing has to at least read as structure**, and this did not:
it sat above whatever `leading` put first, which on Today is the
portrait, aligned to the container edge with nothing tying it to the
heading. So it floated in a corner looking like an artifact. The section
rules work because they are _attached_ — a vertical bar directly beside
the words it belongs to — and the accent bar now means "section", once,
everywhere. A page title is the largest thing on its screen and needs no
badge.

`leading` and `action` exist because three screens already needed
them — Today's portrait, Character's settings link, Train's two links —
and a component that could not hold those would have left three headers
hand-rolled and defeated the point.

Two traps came out of migrating them, both worth knowing. A regex of
`^import .*$` matches `import {` — the _first line of a multi-line
import_ — so inserting after it splits the statement. And **a JSX comment
cannot sit inside an attribute expression**: moving a commented block
into `action={…}` is a syntax error, and the note has to move above the
element instead.

**A skeleton reserves the layout; it is not decoration.** Screens
rendered nothing until their query resolved, so opening the app was a
blank page snapping into a full one — and worse than the flicker is that
whatever you were reaching for moved under your thumb as the real content
pushed it down. Verified by the thing that actually matters: Today's
`h1` sits at the same x before and after the portrait loads.

The sweep animates `background-position`, which the compositor handles
without re-laying-out, and the reduced-motion block collapses it to a
flat block — the correct still version, rather than a gradient frozen
mid-sweep.

**The act acknowledgement reports; it does not reward.**
`app/xp-award.ts` and `components/shared/XpAwards.tsx`. Ticking a habit
changed a checkbox and finishing a session navigated away — the XP was
real the whole time and nothing said so at the moment it was earned. The
badge reads its number from `actById` in the registry, so it can never
announce a figure `tallyActs` will not agree with; a component holding
its own copy of "a daily is 15" would drift silently, with the sheet and
the badge both looking authoritative. `registry.test.ts` holds that
coupling.

It fires on an **act**, never on an outcome, which is the line XP itself
is paid along. **Undo pays nothing** — not a negative badge and not a
silent one; it takes the day back and the sheet shows that at the next
read.

**Which act a habit performs comes from the record, not the screen.**
`dailyActFor` in `registry.ts`. A chore pays `base.chore-kept`, upkeep
pays `vitals.upkeep-kept` and a daily pays `dailies.completed` — the same
fifteen points under three names, split by `belongsTo` in `tallyActs`.

This used to be the _caller's_ answer, on the reasoning that the screen
doing the calling was the area. That was true while each screen showed
one home and stopped being true the moment Today began reporting
everything due: a chore ticked there announced "Kept a daily". The XP was
never wrong — `tallyActs` reads `belongsTo` and always did — but the
badge is supposed to say what the registry says. **Reading the same field
in both places is what makes them agree by construction**, where naming
the act at the call site only made them agree by attention.

**Its lifetime is a timer, not `animationend`.** The reduced-motion block
collapses every animation to 0.01ms with `!important`, so a toast that
removed itself when its animation finished would flash and vanish for
exactly the people who asked for less movement. The timer decides when it
goes; the animation only decides how.

**`Empty` is a slot, not an apology.** On a database that is mostly empty
— which every database is for its first weeks — empty states are the
majority of what is on screen, so "this app looks unfinished" and "this
app is new" are the same picture unless that one component separates
them. A dashed edge and a marked centre read as a space with a shape.

**Visual work has to land on what is always on screen, and the first
attempt did not.** A whole pass went into a weight chart, meters and
motion, and the honest report from the person using it was that it looked
the same. It did, and the reason is worth keeping: **almost all of it was
conditional on data.** The chart needs two weigh-ins inside twenty-eight
days, the season bar needs a previous season to beat, the meters replaced
bars that already existed, and a gradient on a six-pixel bar is invisible.
Meanwhile `body` was a flat colour and `.card` was a flat colour with a
hairline border — the two rules that render on every route, untouched.

So the ordering rule: **change the always-visible surfaces first, and the
data-conditional ones after.** Page background, card, navigation,
section heading, primary button. Those five are on screen on an empty
database, and they are what "does it look different" actually means.

**The accent is cool, and the palette is one place.** Asked for as
_"I'm not a fan of the orange in the app, I'm more a cool dark tones
guy."_ `--color-accent-*` went from orange at hue 44 to cyan at 200, and
that one trio reaches the navigation, every meter, the level ring, the
focus outline and the glow behind the page — which is the whole argument
for a token: the change is three lines rather than forty files.

**`--color-cool-500` had to move with it**, from blue at 235 to violet
at 285. It was a blue distinct from an orange accent, and against a cyan
accent it was two shades of one idea — Elite and Intermediate sit beside
each other in the ladder legend and stopped being two badges. Checked on
the legend, which is the one place all five levels appear at once.

**`--glow-warm` is `--glow-accent` now.** A token named for a
temperature that is no longer true is the kind of name this file keeps
warning about; it is named for the token it mixes from instead.

**`.numeric` dropped the monospaced face and kept `tabular-nums`.**
Reported as _"that font is hard to read"_ — and at `text-xs` on a dim
ink a typewriter face costs legibility for nothing. What the class is
_for_ is figures that do not shift width between renders, which the sans
stack does just as well. `--font-mono` still exists as a Tailwind theme
token and nothing uses it.

**There is no light theme, and what was removed had never worked.**
Headings are `text-ink-50` directly rather than through
`--text-primary`, so the semantic tokens flipped and the headings stayed
near-white on white — the deployed sign-in card had an invisible title.
Reported and settled in one line: _"I don't care about light theme, can
we just gut that code."_ Gone are the `prefers-color-scheme: light`
block, the `[data-theme='light']` block, and `light` from the
`color-scheme` meta, which would otherwise have the browser paint form
controls for a theme the app does not have.

**Bringing one back is not putting those blocks back.** The work is
routing every `text-ink-*` in the app through the semantic tokens
first — that is the bug that made them useless, and re-adding the blocks
without it recreates exactly the version that shipped broken.

**`--color-ink-600` did not exist, and twenty call sites were rendering
near-white because of it.** An undefined token compiles to no colour at
all, so `text-ink-600` left the text inheriting `--text-primary` — every
"Nothing measured yet", every "Looking…" and every muted caption across
the atlas, quests, dailies, train and character screens read at full
strength instead of receding.

It survived because **it looked like a design choice rather than a
fault**: a bright caption is perfectly legible, it is only wrong about
its own importance. Nothing could catch it — the class is spelled
correctly, so no linter or typecheck has an opinion, and it renders
without error. It was found by inspecting a _computed_ colour in the
browser while checking something else, which is the only way it could
have been.

The lesson is narrow and worth keeping: **a Tailwind colour class is not
evidence that a colour was applied.** If a shade matters, read it back
off the element.

**The buttons are made of what the cards are made of.** Reported against
the old primary: _"I don't like the style of this button. Let's make all
of these similar to the glassmorphism cards."_ It was a solid saturated
fill with black text — a paint swatch on a page made of panels, and the
one element that looked like it came from a different app.

**`.control-surface` is `.card`'s recipe with the tint left to the
caller**: a vertical gradient, an inset hairline along the top, a shadow
underneath, and a border at the same hue. One class serves every variant
through `--control-tint`, and `--control-fill` is how loud the fill is.

**It is not `backdrop-filter`, and that is the point rather than a
shortcut.** Real glass re-samples what is behind it every frame, which
this file already forbids on anything that scrolls — and these buttons
sit in lists. What makes a surface read as _lit_ is the gradient and the
top edge, not the blur.

**The primary keeps a glow, and it is the only variant that does.** That
is what stops "made of the same stuff as the cards" collapsing into
"indistinguishable from the cards": a card does not glow, and on most
screens this is still the one thing you came to press. `ghost` stays flat
for the opposite reason — giving it a surface would make every icon on a
row read as something to press.

**`text-accent-300` does not exist, and the first version of this shipped
it.** An undefined Tailwind colour compiles to no declaration at all, so
the label inherited `--text-primary` and came out near-white: legible,
plausible, and not the colour anybody chose. **This is the
`--color-ink-600` bug in this same file, reproduced within a day of
reading the note about it** — the scale is 400 / 500 / 600. It was caught
the only way it can be, by reading the _computed_ colour off the element,
which is exactly what that note says to do.

**A long-lived dev tab is not evidence about CSS.** Debugging the above,
a pressed toggle measured as `ink-300` with **no rule setting `color` on
it at all** — which is not a state the code can produce. A hard reload
gave `oklch(0.79 0.11 200)`, the right answer. After enough HMR passes
the stylesheet in the tab had drifted from the one on disk; a surprising
computed value is worth re-checking on a clean load before it is worth
explaining.

**A card reads as a panel through three cheap things**: a vertical
gradient so the surface is not uniform, an inset hairline along the top
so it catches light, and a shadow so it sits above the page. None of them
is `backdrop-filter`, which must stay off the surface that scrolls.

**The sheen and shadow are tokens because they invert.** A highlight is
white on dark and _nothing_ on white, so a hardcoded
`rgba(255,255,255,…)` would draw a bright smear along the top of every
card in the light theme. `--card-sheen` is transparent there.

**`Meter` takes `value` and `of`, and there is no `percent` prop.**
`components/shared/Meter.tsx`. A percentage is where a denominator goes
to hide: a bar at 70% of a threshold this app invented looks exactly like
a bar at 70% of your own last season, and only one of those is a
measurement. Making both numbers required forces every call site to name
what it divides by, which is the question `docs/GAME_MODEL.md` answers.
`of <= 0` draws the track alone — nothing over nothing is not complete.
`BarSeries` takes its scale the same way rather than normalising to the
tallest bar present, which would make a season where nothing happened
look exactly like one where a great deal did.

**The weight chart's corridor is projected, because the target is a
rate.** `projectCorridor` in `domain/vitals/weight.ts`. A rate is not a
range of weights until it is anchored to a starting point and a length of
time, so the band is two lines spreading from the earliest reading shown.
Its limitation is real and stated on the screen: one unrepresentative
first weigh-in shifts the whole corridor. **`phaseVerdict` remains the
judgement** — it reads the smoothed fortnight — and the corridor is
guidance drawn behind the line. `low` and `high` are named by value, not
by which edge of the band produced them: on a cut both edges are negative
and `min` is the lower weight, on a bulk `min` is the upper one, so a
caller assuming otherwise draws one phase inside out.

**A trend chart is scaled to its data; a bar series is anchored at zero.**
A weight chart from zero is a flat line near the top of the box, because
the interesting range is the three pounds it moved. That reasoning is
exactly wrong for a count, which is why the two are separate components
rather than one with a flag.

**Motion is gated once, globally, and never per component.** The
`prefers-reduced-motion: reduce` block in `index.css` collapses every
transition in the app to 0.01ms with `!important`, so a new animated
thing is covered by construction and there is no per-component gate to
forget.

**`backdrop-filter` belongs on fixed surfaces only.** It is among the
most expensive things a mobile browser can be asked for and it costs most
on a surface that moves, because every scrolled frame re-samples what is
behind it. The navigation is fixed and composited once. **It does not go
on cards** — that is where it would be asked for next, and a gym app
would pay for it on every frame of every list.

**`Date.now()` slips past the no-`new Date()` lint rule, and it is the
same defect.** The chart's window was written with it and had to be
changed to take the clock: a window that cannot be held still is a chart
no test can assert about. If a component needs the time, it takes
`useServices().clock.now()`.

**Traits are a projection of XP, not a fourth currency.** The ask was
attributes that "get individually leveled up to make this more
gamified", and the tempting build is a pool per attribute that things
pay into. That is the fourth currency the model has three to avoid —
and worse, most of these have no external standard: strength has
published bodyweight multiples nothing in this app can move, and there
is no such table for how charismatic somebody is. Inventing one is the
thing refused everywhere else.

So each life area belongs to **exactly one** trait, and a trait’s XP
is the sum of what those areas already paid. Same acts, new name. The
partition is what makes rule three hold by construction rather than by
attention: `traits.test.ts` asserts every area has a trait, no area has
two, and **the trait totals sum to the XP total exactly**. Measured on
a plausible few months: 9,375 both ways.

The silent failure that test exists for is an area belonging to no
trait — it would pay XP that appears in the character total and in no
bar, so the bars quietly add up to less than the level above them and
nothing errors. Same shape as a muscle group belonging to no tier,
which typechecked cleanly.

**Eight traits over eleven areas, and six was the target.** Forcing
eleven into the classic six meant bundling things whose only shared
property was needing somewhere to go, which is invented structure
wearing a familiar name. Where a bundle is natural it is made — a house
job, a quest step and an upgrade are all Craft — and where it is not,
the trait stands alone.

**Fortune is fed by one act, and that is a feature.** Finance declares
no acts on purpose: typing in a net worth is a measurement, and paying
for the number going up would be paying for an outcome. So Fortune
moves only when an application is sent. Finance still belongs to the
partition, because an area with no trait is exactly what the guard
catches.

**Each row says what feeds it.** A bar labelled "Charisma" with nothing
under it is a number the app made up; one that says "people you
actually saw" is a count of hangouts logged. Unproven traits keep their
bars and read "Nothing yet" rather than zero — absent, never zero — and
stay on screen because the _set_ is the sheet: eight bars with three
empty says where the time is going, where five bars would only say the
app knows about five things.

**They share the character level curve** rather than getting one each.
A second curve would be a second answer to "what is a level worth", and
the first thing anybody would do is compare a Strength 12 to a
character level 20. Sharing it means a trait level is exactly what it
looks like: the level you would be if this were all you had ever done.

**Called traits, not attributes**, because `character.ts` already
exports an `Attribute` — a lift measured against a published standard.
Two things under one word in one folder is how a reader ends up
believing a bench press and Charisma are the same kind of quantity,
when they are precisely not: one is a ladder, one is a re-presentation
of XP.

**The avatar re-presents the sheet and adds nothing to it.**
`domain/game/avatar.ts`. The temptation in a portrait is to give it a
number of its own — a power rating, a gear score — and that would be a
fourth currency where the model has three on purpose. Every field is
traceable: the level is the XP level, the mainstay is whichever area
has paid the most XP, the gear is upgrades actually bought.

**The ring is the level bar, not a frame around one.** XP into the
current level over what the level costs — a real denominator — so the
decoration and the measurement are the same object. It replaced the bar
that used to sit in the Level card rather than joining it, because
drawing one quantity twice on one screen is how two figures start
disagreeing after somebody edits one.

**XP is the only honest basis for "what am I mostly", and the answer is
a share rather than a word.** It is the one quantity comparable across
areas, which is the whole reason it is a single currency; ladders cannot
answer it, because Advanced on the squat and Advanced at exploration are
anchored to different external standards. `mainstayFrom` names the area
that has paid the most and **what share of everything that is**, and the
card reads "100% of your XP is dailies". Absent before anything has been
done — a share of nothing is not nought per cent.

**There were flavour titles over the top of that and they are gone.**
`AREA_TITLES` gave each area a word — Devotee for dailies, Steward for
the house, Athlete for training — and the winning area's word was the
page heading. Asked for directly: _"I don't really care too much about
the level names like Devotee, could we drop those."_

The half that survived is the half that was a measurement. The card's
own note had always called the share _"the difference between a label
and a claim"_, which was an argument for keeping the share and, read
again, not much of an argument for the label: a word invented here could
only be taken on trust, where a percentage can be checked against the
breakdown under it.

It was also **the only derived heading in the app.** Every other page
title says what the screen is; this one said what you were, which is why
getting it wrong read as the app asserting an identity rather than as a
mislabelled tab. The heading is `You` now, which is what the nav cell
says.

**The wishlist is the other half of an inventory, and it is the gear
shelf only.** The ask: _"gear/cosmetics to track apparel, shoes and
accessories that I would like to purchase."_ The portrait already shows
what you are carrying; `wantedFrom` shows what you mean to.

**That is a deliberate asymmetry with the equipped list above it**, and
worth stating because it looks like an inconsistency. `gearFrom` counts
**both** non-house shelves, because a phone is a thing you carry and
somebody whose purchases are all tech would otherwise have an empty
portrait. A wishlist has no such problem: wanted tech already has a
screen that does it better, with gates, prerequisites and a budget, so
repeating it here would add nothing and would make "gear" mean something
else.

**`isOpen`, not "unbought".** Something cancelled is not something you
want, and that predicate already existed.

**Ordered by the upgrade's own priority, which is deliberately not the
tech tree's ranking.** That one inherits priority from whatever a node
unblocks; recomputing it for a four-row summary would put a second
ordering on the same records.

**Capped at four and silent when empty.** A wishlist that scrolls is a
list, on a screen that is scanned — the overflow is counted rather than
dropped. An empty "Wanted" heading is a prompt to go shopping, which is
not what a character sheet is for.

**Gear needed no new field.** `isOwned` excludes a wishlist and
`isOwnArea` excludes the house, which is the split the Base screen
already makes: a dishwasher upgrades the place you live and a belt
upgrades you. Slots are the upgrade's own `category`.

**The figure grows with the level, in five bands.** Reported as _"is
there a way to make the avatar more engaging instead of simply a blank
figure? Perhaps levelling could upgrade it, since currently levelling is
done simply for the sake of levelling."_ That was a fair account: the
silhouette at level 1 was the silhouette at level 20, so levelling moved
a numeral and an arc and nothing else.

`avatar.build` is `0`-`4` from `BUILD_BANDS` at levels 1, 5, 10, 15 and
20 — wider shoulders, then a mantle, then plates, then an arc above the
head. **It is the level drawn and nothing more**, which is what lets it
exist beside the three-currency rule: a portrait that moved on its own
would be the fourth currency, and this one cannot move unless the level
does. `avatar.test.ts` holds that it never goes backwards and never
indexes past the geometry that exists.

**A number, not a name.** The flavour titles were deleted from this file
for being words the app invented, and a rank called _Ascendant_ would be
the same thing wearing armour. Nothing prints the band; it only decides
how much is drawn.

**The thresholds are the app's own, and that is allowed here.** A ladder
must name a published standard; there is no external table for how much
silhouette a level is worth. It is permitted precisely because it
**measures nothing** — it re-draws a number already earned honestly,
where a ladder makes a claim about you against the world.

**The bands are five different figures now, not five sets of marks on
one.** Reported: _"I was also expecting the avatar progression to be more
dramatic."_ Fair — the drawn version added a mantle, then plates, then an
arc, which on a 120-pixel disc are small changes to an outline that never
changed. `features/character/figures.ts` holds five silhouettes:
plain, hooded, crowned, armoured, winged.

**They are from game-icons.net, CC BY 3.0**, by Lorc and Delapouite. The
licence costs nothing — no account, nothing to renew — and asks for a
credit, which the foot of Settings carries and `README.md` repeats.
`ATTRIBUTION` is a constant beside the paths it is about, so the credit
and the art cannot drift apart.

**Committed as paths, never fetched.** About 6 KB in the bundle, so no
eighth outbound host was added for an icon. Each host here is a decision.

**An icon set is allowed where gear is not**, and the distinction is the
one `avatar.ts` already draws: gear is user-typed titles, so drawing a
belt means guessing what an upgrade depicts. A rank is the app's own
number, and these are five pictures of it.

**Ordered by ink, not by story.** Crowned before armoured reads oddly as
a narrative and correctly as a picture — three orderings were rendered
side by side and the story-ordered one visibly dipped at band 3, because
the crowned bust carries less ink than the armoured one. At 62 pixels
nobody reads a narrative; they read _more_. The figure also takes the
season tint from band 2, which is a second axis of escalation for free.

**What the hand-drawn version got right, kept as a warning.** Its marks
had to sit _on_ the outline — the mantle was first drawn as its own
curve below the shoulders and read as a detached bowl sharing the frame.
That problem disappears with whole figures and would come straight back
the moment anything is layered on top of one.

**The figure is geometric because there is nothing to illustrate
honestly.** Gear is user-typed titles, so drawing a belt on a character
means guessing what an upgrade depicts and guessing wrong on most of
them. Items are named beside the portrait instead. The whole portrait
carries one `aria-label` rather than being `aria-hidden` — level,
season and how far through are information, not ornament. It names
exactly what is drawn: the title was in there too and went with the
titles, and what replaced it on screen is an ordinary sentence beside
the figure, which a screen reader reaches without help.

**A silent area still needs a way in, and that is navigation rather
than a reading.** The rule below is right and it had a hole: the area
cards were the only route to a screen, and a card is not drawn for an
area with nothing to say. Job search had nothing to say until an
application existed, and the only way to the screen that creates one
was the card that would not appear until it did.

The You page carries a short list of the four screens with no tab —
Limits, Vitals, Job search, Tech tree — outside the cards and
repeating none of their numbers. A link makes no claim about standing,
so it can be shown where a card cannot.

**An area with nothing to say says nothing.** `AreaStanding.silent` on the
character sheet, and `insufficient-data` counts as silence — it is the
absence of a judgement rather than a bad one. Treating it as something
said made six untouched areas report news on an empty database.

**The list of area cards is gone, and the two measured ladders moved
under the traits that own them.** Asked for: _"take finance and strength
and put those under their corresponding attributes in the section above,
and cut the rest out."_ The lifts are under **Strength**, the credit
score under **Fortune**, indented behind a rule so a ladder reads as
belonging to the trait rather than as another trait.

**It reads as a smaller change than it is, because only three areas ever
declared a ladder** — a ladder must name an external standard, and there
is no published figure for how good at seeing your friends you ought to
be. Every other card carried an area's name, its XP and its ratings: XP
is what the traits already split, and no rating had been recordable
since the review screen went the day before. So most of what was deleted
was an empty frame.

**The traits are bars alone, and two different things have now been
hung under them and taken off again.** Reported: _"I'm not really a fan.
Let's keep all traits as purely bars to keep it more sleek cause this
looks busy."_

The history is the useful part, because it is one mistake made twice.
First the measured ladders moved under the traits when the area cards
were deleted — the lifts under Strength, the credit score under Fortune.
That left content under two rows of seven, which read as ragged, so
every trait then gained a section listing the areas feeding it. That
fixed the symmetry and **made the panel busier than the raggedness it
cured**: twelve extra rows on a panel of seven, nearly all reading
"Nothing yet" on any database not yet lived in for months.

**This panel is a glance, not a breakdown.** It answers "where has my
time gone" in seven bars, and both attempts to make it also answer "and
which records paid for that" made it worse at the first job without
being good at the second. Anything proposed under a trait row is this
mistake a third time.

**The ladders were not deleted; they went to the screens that own
them** — the lifts to Train (`StrengthStandards`), the money to Finance,
the explored share to the Map. `AreaLadders` in `CharacterParts.tsx` is
the shared lookup, by area id against the sheet, so an area gains a row
by gaining a ladder in the registry. Strength does not go through it:
its total is derived from three ladders rather than being one, so it is
read off the character and drawn with `AttributeRow`.

**That home should stick, and it is better than where they started.** A
reading beside the thing it measures and the controls that move it needs
no explaining, where the same reading under a trait bar needed a rule
about why two currencies were adjacent. The exploration ladder in
particular has now been homeless twice and is finally beside the fog it
is computed from.

**Measured, because the cost of the busy version was measured too.** The
day's first heading sat at 1,309 pixels before any of this, 1,725 with
the area sections, and **941 now** — moving the ladders off took the day
368 pixels closer to the top than it had ever been. The fold on the
traits this file keeps recommending is no longer needed.

**`AreaXpRow` and `AREA_LABELS` were deleted with the sections.** The
label map is worth knowing about if area names ever go back in front of
a reader: the registry says Backlog, Projects, Upgrades, Places and
Social where the app says Codex, Quests, Tech tree, Map and Party, and
the vocabulary rule is that **any string a person reads says what the
screens say**. It is in the git history.

**A trait and a ladder stay different currencies and the screen must not
merge them.** The trait's bar is XP into a level; the ladder is a
reading against a standard the app cannot move. Putting them adjacent
says only that they are about the same part of your life. The visible
consequence, which looks like a bug and is not: on a fresh database
**Strength reads "Nothing yet" directly above a Powerlifting total of
959 lb** — no session has been logged, and the estimated maxes are still
a real measurement.

**`LadderRow` came out of `AreaCard` when that was deleted**, and
Training keeps its `AttributeRow`s rather than using it, because those
say a bodyweight multiple and the load needed for the next level where
the generic row says a value and an anchor.

**The total comes from the character, not the sheet**, and cannot come
from the sheet: it is derived from three ladders rather than being one,
and `measure.ts` deliberately names the three lifts instead of computing
it from `STRENGTH_LIFTS`. That is why the override was needed at all —
`area.ladders` is the three lifts and can never hold the total.

**Dailies is the one area kept out of that list, and the test is not the
one Training was kept out by.** Reported: _"dailies probably doesn't
belong there."_ It does not — this screen already gives the habits the
largest block on it, with the day's list, the counts and the streaks, so
a card underneath saying _Dailies · Kept_ is one area appearing twice
under one word for two different readings.

The rule is **whether the area has its own block on this screen**, not
whether some number is duplicated. Training has none, so it earns a
card. Base keeps its card because what it now reports is nowhere else
here. The rating itself is untouched and still judged in the monthly
review, which is the screen whose job is monthly judgements.

**Base is rated on the house, not on its chores.** Reported in the same
breath: _"base should be more about declutter and projects status vs
recurring tasks."_ It read `Chores kept`, a share of expected days —
which is the _dailies_ rating with another name over it, because a chore
is a recurring task that happens to be filed here. Two areas were
reporting the same shape of month.

`base.clear` is how clear the house is, from `houseStanding` over the
rooms with a reading, and `base.jobs` is steps closed on house jobs.
Both are `increase` rather than a threshold: there is no published
figure for how cleared a house ought to be, and inventing one would be
the scale this model refuses — so what is judged is whether it moved the
right way, which is also the honest shape for a level that goes both
ways over months.

**Steps rather than jobs finished**, because a house job is rarely
finished in the month it was opened and a rating that only moved on
completion would read flat through every month of real work.

**It can be counted at all because `projects.actions-closed-in-month` is
own-area only.** The two filters are complements, so a house job's steps
land in exactly one of them and rule three holds by construction rather
than by attention. `base.chore-share-in-month` went with the rating it
fed — a source nothing declares is weight the spine would go on
computing every month.

The card leads the list because Training is `phase: 0`, so it sits about
where the section did, one heading shallower. Its heading now reads
**Training** rather than _Strength_, since it is the area's own name and
carries the Consistency rating too.

**`domain/game/` is the model for the whole hub, and it is all wired up
now.** [docs/GAME_MODEL.md](docs/GAME_MODEL.md) decided — before any area
arrived — what a number is allowed to mean: three currencies (ladder,
rating, XP), one tech tree, three rules. It stayed deliberately unwired
through every migration, because hooking a new domain to XP while it is
being ported is how an exchange rate gets set by accident, in a commit
whose message is about something else. `application/use-cases/character/
sheet.ts` is where it finally joins up, and it restates nothing: an area
reaches the character sheet by gaining a row in `registry.ts`.

The three rules are tests, not prose: **no ladder is fed by XP** (a ladder
must name an external standard), **no rating is promoted to a ladder** (no
measurement may be claimed by both), and **nothing is counted twice**
(`creditFor` returns one credit or none). `registry.test.ts` fails on each.

**The backlog is the first absorbed app, and it is namespaced for a
reason.** `domain/backlog/` holds a second `Settings` and a second
`priority/`: LifeOS's priority is muscle tiers and capacity, the backlog's is
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

**Two read-modify-writes of one record, fired together, lose one of
them — and the comment saying otherwise was mine.** The stage editor
first sent a rename and a retarget as separate mutations, reasoning
that they are separate operations. They are. Both are also a
read-modify-write of the same campaign record, so the second read the
copy from _before_ the first had saved and wrote the old name back.
Driving it caught the target moving to 30,000 while the new name
silently did not stick; the suite was green throughout.

This is the hazard `serialise` exists for in the backlog hooks,
arriving from the other direction. There the answer is a queue, because
two taps really are two events. Here **one form press is one edit**, so
the answer is `reshapeStage` — one function, one write. Any future edit
that changes two fields of a campaign belongs in one call for the same
reason.

**Three kinds of stage edit, and only one loses anything.** A name is a
label: the stage means what it meant and every lap still happened. A
target changes whether it is _met_ and rewrites nothing — unlike a
habit's cadence, which decides which days were expected and re-reads
every streak. `dropStage` is named apart from the rest because it is
the destructive one, the rule that a call site must not be able to ask
for "change this" and receive "wipe it".

**The laps survive a change of kind, deliberately.** Turning a declared
stage into a measured one leaves its dates inert — the reading decides
from then on — and clearing them would be a destructive edit wearing a
settings change's clothes. "2026-08-31 · Maple Street" is a true record
of a day something happened, and it survives the way a retired habit’s
kept days do. The editor says so before the change rather than after.

**The confirm appears only when there is something to lose.** A stage
nobody has reached carries no record, so asking about it is a dialogue
for its own sake — and asking about everything is how somebody learns
to press through the question without reading it.

**Listings cannot be searched and the neighbourhood can. That split is
the whole feature, and it was tested before anything was built.**
Zillow, Redfin and Realtor.com are all _reachable_ and all send no CORS
header — so is the US Census API, which was the other obvious source.
Overpass answers a browser directly. A house is therefore **typed in**
and its surroundings are **measured**, which is the same arrangement the
job search has: the resume is typed and the boards are read. The screen
says so, because a search box that never finds anything is worse than a
stated limit.

Overpass is the third face of OpenStreetMap, which the map already uses
for tiles and geocoding — the same donated service, not a new host.

**Only the wanted kinds are queried, and the difference was measured.**
All eight around a Manhattan address returned 2,300 elements in **13.4
seconds** and sometimes 504’d; the three defaults took **1.8**. Overpass
reports two concurrent slots, so a screen that read every candidate on
load would be both slow and refused. The result is stored on the
candidate with its `readAt`, because OSM changes over months.

**A 504 answers with an XHTML error page**, so `response.ok` is checked
before `json()` — otherwise a busy query fails with a `SyntaxError`
about an unexpected `<`, which is the least useful message available.

**`Neighbourhood.asked` exists because otherwise a zero is a lie**, and
this was found by reading a real address: `schools: 0` sat beside 543
parks purely because schools had not been queried. Add schools to your
wants afterwards and the score would drop against something nobody had
ever looked for. Scoring now runs over `wanted ∩ asked`, and `unmeasured`
is reported so the screen can offer a re-read rather than showing a
quietly lower number. A kind that _was_ asked for and found nothing
still counts — the distinction is "looked and found none" against "never
looked".

**`asked` is optional because stored records outlive the type that
wrote them.** The first version made it required and
`asked.includes(...)` threw on the one record already in the database,
taking the whole screen down. A reading without it is treated as having
measured nothing, which prompts a re-read rather than scoring counts
whose provenance is unknown.

**Wants, not filters.** Nothing is ever dropped for scoring badly: a
house over budget is a house over budget and you may still want to look
at it. Over budget loses points _in proportion_ — ten percent over is a
conversation and double is not — and being cheaper than the budget earns
nothing extra, or the worst affordable option would outrank the best.

**Nearby counts cap at three.** Three supermarkets is a well-served
address and the thirtieth adds nothing; a raw count would rank a dense
city centre top on every kind, which is a fact about density rather than
about whether the address suits you.

**OSM completeness is uneven, and that is a limitation rather than a
caveat.** A low count means either "nothing there" or "nobody mapped
it", and nothing here can tell which. Two addresses in the same town
compare fairly; one in Manhattan against one in rural Vermont does not.
The screen states it.

**It pays no XP.** Looking at houses is part of the move, and the move
is a campaign — a readout. What it does feed is the campaign’s new
`homes-viewed` requirement, so "Find a new house" can be measured.
**Ruled out counts as seen**, because deciding against one is what
viewing is _for_: a count that only rose on houses you liked would
measure optimism rather than effort.

**Mind is study and practice, and the ask was two things of which only
one was missing.** _"A mental training section where I do a daily study
of design patterns, and maybe pull LeetCode questions in and have that
gain XP."_

The **daily study is a habit and needed nothing new** — a `Daily` filed
to Mind, on a cadence, with a streak. What it needed was a home, so it
pays `mind.habit-kept` instead of crowding Today.

The **log did not exist**. A solved problem has a name, a difficulty
and a language, and two in a morning are two things rather than one day
ticked — the shape of a `WorkoutLog`, not of a habit. That is
`domain/mind/practice.ts`.

**A home, not a group**, and the distinction is the one that sent
supplements and pet care to `Daily.group` instead. A group is a label; a
home decides which screen owns the record _and_ which area pays its XP.
Mind wants both halves, so it earns the full cost — a registry area, two
acts, a branch in `tallyActs`, a line in the "exactly one side" test.

**Its trait is Intellect, joining the backlog there.** Practice is the
other half of what that bar meant: one is what you have read, the other
is what you can do. A ninth trait would have split a thing that is one
thing.

**No ladder, and this is where a count is most tempting.** LeetCode
publishes how many problems exist and every practice site shows a total
solved, so a "1,200 problems" ceiling _looks_ like an external standard.
It is a count of one site’s catalogue, which grows, and nothing about
having solved half of it says you are halfway to anything.

**Two ratings, because one number cannot say what happened.** Six
problems in a Sunday and six over six days are very different months, so
problems-solved and days-practised are both counted. Absent when nothing
has been practised, never zero.

**Difficulty is recorded and does not scale the XP.** Points are flat
per occurrence everywhere here. The rule’s usual justification — that
scaling reintroduces the outcome — is weaker for difficulty, which is a
property of the problem rather than of how it went. It is kept anyway,
because a hard problem paying triple turns a record of practice into a
thing to optimise, and the honest reason to do a hard one is that it is
hard. The screen says so where somebody chooses it.

**Exercism is readable and LeetCode is not, and that was tested.**
Exercism’s `/api/v2` is internal, needs a token and is CORS-blocked from
a browser. Their _content_ is open: every track is a public GitHub
repository whose `config.json` `raw.githubusercontent.com` serves with
no key — **111 practice exercises for TypeScript in one request**.
LeetCode publishes no equivalent and blocks browsers, so a problem from
there is typed in by name. That is all the log needs: what pays XP is
having solved it, not the app having fetched the text.

Two quirks came off the real config rather than a guess. A track lists
**`concept` exercises alongside `practice` ones** — the first are its
syllabus, worked through in order, and offering both would mix a course
into a problem list. And **`deprecated` is a real status**, so offering
one is offering a problem the track has withdrawn. Their 1–10 difficulty
is banded into the three used here rather than carried alongside them,
because two answers to "how hard was it" is one too many.

Unauthenticated GitHub allows **60 requests an hour**, which is ample
for reading a track once and caching it and nowhere near enough to
browse. `staleTime: Infinity` and every refetch off. Seventh outbound
host; each one is a decision, not a precedent.

**An attempt is deleted, not retired**, unlike a habit. A habit’s kept
days _are_ the record and retiring keeps them; a problem logged by
mistake is not a thing that happened, and leaving it would go on paying
XP for it.

**A repeat is reported, never refused.** A kata done a second time from
memory is the point of a kata, so `timesSolved` exists to let the form
say "you logged this in March" rather than to stop anybody logging it.

**A contract is a one-off, and it has exactly one step for a reason
that is not tidiness.** The ask: _"maybe we need contracts or something
to track little one-off things that come up."_ The board is for what you
chose and are working through; a parcel to return does not belong there
wearing the same clothes — the crowding argument that moved house work
to Base.

**A view, not a record type.** `domain/projects/contract.ts` is a
predicate over `Project`: no new store, no new act, no new XP price. It
reuses the board's card and every rule about blockers and homes.

**One step, because a stepless one-off would pay nothing.** XP comes
from `projects.side-action-closed` — 20 points — and _nothing pays for
a project existing or being marked done_. So a contract created empty
earns zero, and a section full of things that pay nothing teaches you
not to use it. The one-off **is** the step; closing it is the act, and
the act is what the model pays for. `addContract` writes the step in
the same call, so a half-built contract cannot be left behind.

The alternative was a new act for "closed a project with no steps",
which would have been a way to earn points by creating and closing empty
records — the farming incentive the act/outcome line exists to prevent.

**Derived, so it moves rather than being wrong.** A quest that grows a
second step stops being a contract, which is honest: the moment
something needs breaking down it is no longer a one-off. `contracts`
and `board` partition what is outstanding, so nothing appears twice and
nothing vanishes — there is a test for that.

**Ticking a contract closes it out, and the shared rule is untouched.**
`deriveStatus` still never completes a project on its own — one with
every step done may still have steps to add, and closing it is a
decision. That holds for every checklist. What yields is the one shape
where it read as ceremony: a contract _is_ its single step, so asking
for a separate "and now mark it complete" over a parcel is a tap for
nothing.

The rule lives in `settleContract`, **named and in the domain, rather
than folded into `deriveStatus`** — the point is that there is no second
answer hidden inside the shared derivation. It is a no-op for anything
without exactly one action, and identity when nothing changes, so
`setActionStatus` applies it unconditionally.

**Reopening is the half that must not be forgotten.** Without it a
mis-tap files the contract as completed forever: `deriveStatus`
short-circuits on a requested `completed`, so nothing else would ever
put it back. `paused` is left alone in both directions — parking
something is a statement about whether you mean to do it at all, and a
tick should not quietly overrule it.

**A test had encoded the old behaviour on a single-action project**, and
it failed the moment this landed — correctly. The rule it protects is
still true, so it now uses a two-step quest, and the one-off case has
tests of its own in both directions.

Verified end to end: a contract created from the section arrived as a
side quest with one pending step, stayed off the board, and closing it
took the all-time XP from 1,675 to **1,695** with a new "Projects · 20
XP" line — which is the whole reason it has a step at all.

**The arc names its own section, and the app supplies no title once
there is one.** Reported: _"I don't like 'The long way round' — I'm not
sure what it even means or where it came from."_ It came from here: a
fixed `Section` title over a card that then repeated the campaign's real
name a size smaller. So the screen led with a heading nobody chose and
buried _Move out of GVR_ inside it.

Each arc is a `Section` of its own now, titled by its `name`, with its
`aim` as the description — a campaign already carries both halves of a
section header, and drawing them as one is what makes that part of the
screen read as being about the arc rather than as a list with one entry.
The only title the app still supplies is **"The arc"** on the empty
state, where there is nothing to name it after. With two arcs there are
two headings and no wrapper, which is right: nothing is _the_ arc.

**The name and the aim are editable, and were not.** `renameArc` and
`useRenameArc` were written, exported, and called by **nothing** — the
same pattern as `removeDaily`, `moveDailyHome` and the rest. That is how
a real arc came to carry the aim _"Step 1: don't absolutely despise your
current neighbourhood"_: a description typed into the box above a
numbered stage list, and then unfixable from any screen. This file
already records the labelling fix for that box at creation; what it
missed was that **a field you can only get wrong once still has to be
correctable**.

Both are labels — the stages, their laps and every date under them are
untouched — which is why the arc editor carries no warning where a
stage's _target_ change does.

**Every stage links to the screen its evidence comes from.**
`EVIDENCE_SCREENS` in `Campaigns.tsx`: house jobs to Base, offers to the
job search, houses seen to Houses, money to Finance. Reported as _"all
the other things that just have manual completions, like house search,
should have sections that we could link to like the other sections"_ — a
stage reading _0 of 5 house jobs finished_ is quoting a number Base
owns, and nothing on the row said so.

**Keyed on the requirement, never on the name.** A stage name is free
text and could say anything; the requirement is the app's own statement
about which records it reads, so a link derived from it cannot point
somewhere the number does not come from. The routes live in the feature
because `domain/campaign` must not know a browser exists.

**A declared stage gets none, and that is the definition rather than a
gap.** It is declared precisely because nothing in the app records it —
there is no screen where "we found a house we liked" is written down, so
a link would have to be invented. _Houses seen_ is the measured version
of house-hunting and does link, so a house-search stage that wants one
is a retarget away in the editor rather than a new field.

**The arc stands in for a main quest you have not picked.** Reported:
_"I'm still seeing no main or side quests assigned despite starting an
arc."_ Nothing was broken — a campaign is deliberately not a `Project`
(see below) — but the slot answered "no main quest active" to somebody
who had just declared what they were working towards, which is the
wrong answer to a fair question.

**A readout, not a quest.** The slot links to where stages are actually
worked. Nothing to activate, nothing to close, and it pays nothing — the
same footing as the arc itself. Making a stage into a `Project` to fill
the slot is the move rule three forbids: closing it would pay XP for
work its own area has already paid for.

**The arc is the headline and the stage is the next step, and that was
inverted.** Reported: _"there should be some sort of designation to say
this is the main quest, and then under it the next thing — in our case
the specific job."_ Right, and the slot said the opposite: it led with
_Fix up the house_ and put _Move out of GVR_ a size smaller underneath,
so the thing being worked towards read as a footnote to one of its own
stages. Every other slot on that screen names the quest and says
"Next: …"; the arc is the quest here, so it does the same.

**It is badged _Main_ now, which reverses the call in the paragraph
above.** It read _Arc_, on the reasoning that a campaign is a readout
rather than a quest. All of that is still true and none of it was the
question being asked: the card sits in the main quest slot, under a
heading reading "one main quest, one side quest", so refusing to call it
the main one left the screen declining to name what it was plainly
showing. What keeps it honest is everything around the badge: the
line below counts **stages**, which is the arc's own word where a quest
has steps; there is no stand-down button, because there is nothing to
stand down; and the link says _arc_ outright.

**The word _Arc_ used to prefix that line and had to go.** It read
`Arc · Fix up the house · stage 1 of 6`, reported as _"that reads weird
— it makes it seem like every stage is an arc, when you add arcs and
each has stages."_ Exactly right: **a middot between two nouns reads as
apposition**, so a label meant to mark the _card_ landed on the _stage_
beside it and renamed it. It is `Fix up the house · stage 1 of 6` now,
and `Stage 2 of 2` when the other line already names the stage.

**The stage sits above the step, which is the order the thing nests.**
Asked for as _"it should read stage and then job, just flip those
lines"_ — an arc holds stages and a stage is met by jobs, so reading the
card downwards now goes arc → stage → the thing to do, rather than
meeting the job before knowing what it is for. The stage line stays the
dimmer of the two: it is context, and the line under it is what you can
act on, which is the hierarchy the side quest's slot already draws.

Nothing was lost, because the prefix was the one honest-marker doing its
job by assertion rather than by construction — the vocabulary, the
missing button and the link all still separate this card from a quest.
**A label that has to announce what something is, next to the thing
itself, is usually describing the wrong noun.**

**The slot bottoms out in something you can actually go and do.**
Reported: _"I think here it should show what the next house fix-up thing
would be, you know."_ The two cards made the gap obvious side by side —
the side quest named _Access IRA_, a thing you can do, while the arc
named _Fix up the house_, which is a category. A slot whose whole job is
"what am I on" should end in a sentence, not a heading.

`STAGE_WORK` maps a stage's requirement to the home whose projects carry
that work — house jobs to Base, offers to the job search — and
`recommendation` over that home already picks the next step, skipping
what is blocked. Same engine the Suggested section runs; no second
answer to "what next".

**One level deeper than `EVIDENCE_SCREENS` and a different question.**
That map covers every measured kind and answers "which screen is this
number kept on". This one answers "whose next _step_ is this stage
waiting on", which only the two project-backed kinds can: a net-worth
stage is waiting on a reading, and naming a step for it would be the app
telling somebody to go and have more money. Declared, money and
houses-seen stages fall back to the stage name — absent, never invented.

**The job's name leads that line, because the step alone says nothing.**
Reported next: _"it just says find the right person, but that literally
applies to all the jobs."_ It does — `HIRED_JOB_STEPS` opens every house
job with the same three, so _Find the right person_ is the next step of
the porch roof, the boiler and the leaking tap identically. The name and
the step read as `Fix the porch roof · Find the right person`, in that
order, so a truncated line keeps the half that distinguishes it.

**`useRecommendation` takes the home, and `undefined` means "do not
ask".** That is not a third home; it is how a caller that only sometimes
has one keeps the hook unconditional, since hooks cannot be called in an
`if`. `ArcSlot` is its own component for the same reason — asking in
`Slot` would query on every side quest too.

**The arc's own card carries a `Main quest` badge to match**, because
the same thing appeared twice on one page with neither half mentioning
the other. Both halves compute it from the same two facts — no main
quest activated, and this is the first arc with something outstanding —
in `Campaigns`, passed down as `isMain`. Two components deciding it
separately is how the badge and the slot start disagreeing. Verified in
both directions: activating a real main quest removes the badge and the
arc slot together.

**An activated quest wins.** The arc is the direction underneath; a
quest you picked is the thing you chose this week. Verified by
activating one and watching the slot swap.

**A campaign is the long arc across areas, and it is not a `Project`.**
The report: _"I want to move eventually, but that depends on fixing up
the house, improving income, finding a new house, saving a deposit,
selling, moving."_ Every input already existed — Base holds the house
work, Jobs the applications, Finance the money — and nothing
represented the arc.

**Reusing `Project` was the obvious move and is barred by rule three.**
A project is the app’s shape for "a thing with steps", but closing its
action pays `projects.main-action-closed` — so a stage closing would
pay XP for work its own area had already paid for. The record types are
separate because the scoring has to be. It is not a second tech tree
either: that is gated progression with money, and `registry.test.ts`
holds that exactly one area spends.

**It pays nothing at all**, and the hooks say so where an `xp-award`
call would otherwise go. Finance already showed that an area which
reports and never pays is not incomplete.

**A stage is measured or declared, and saying which is the honest
part.** House jobs and offers are counted from records already kept;
the money is read off the monthly reading. Nothing in a habit tracker
knows you found a house you liked, so that stage is declared and the
app takes your word. A declared stage is not a lesser one. **A measured
stage cannot be declared done** — ticking past a reading that says
otherwise is the whole reason it is measured.

**Absent, never zero, and the two halves differ.** A _count_ is
genuinely zero when nothing has happened — you can count no finished
house jobs. A _money_ figure is typed in monthly, so its absence means
nobody has said, not that it is nothing: that stage reads `unproven`
and draws no bar, because a bar at nought against a target somebody set
reads as failing.

**Ordered but not gated.** The chain really is a chain, but a screen
that refused to record a later stage would be policing somebody’s life
rather than reporting on it, and things do not happen in the order they
were written. A later stage can be met first; `next` names the earliest
outstanding one and is _highlighted rather than moved_, for the reason
habits sort chronologically rather than current-part-first.

**`done` is a count and `nextPosition` is a position, and a screen
confused them.** Reported: _"why is this showing as stage 2 if we're
only on stage one, fix up the house?"_ The card named the right stage
and then numbered it wrongly, because the number was `done + 1`.

That is the position of `next` **only when the met stages are a prefix
of the list**, and the paragraph above is the promise that they need not
be: tick a declared stage further down and the count moves while the
first outstanding stage stays exactly where it was. One met stage at the
bottom of a six-stage arc made "Fix up the house" read as stage two.

`standingFor` carries `nextPosition` now, computed from the **same
search** that finds `next` — one `findIndex`, so the stage and its
number cannot come apart — and absent exactly when `next` is, so nothing
can read a position for a stage that is not there. A derived number
belongs beside the thing it describes rather than being recomputed from
a different quantity at the call site, which is the same lesson
`slotVolume` and the sync cursor's `pages` array both cost.

**An unlabelled field gets filled in with whatever it looks like it
wants.** Reported from real use: an arc was created with the aim box
holding a _description_ — "initially get out of someplace I despise" —
and then read as the arc's first stage. Nothing turned it into one;
`addCampaign` maps `input.stages` and stores `aim` apart. What was
wrong is that both fields carried a placeholder and an `aria-label` and
nothing else, so the moment you typed into either the screen stopped
saying what it was — and the numbered "Opens with" list sits directly
beneath the aim. Both are labelled visibly now, and the aim's label says
what it is _not_: the finish line for the whole arc, not the first step.

**A stage keeps every lap.** _"Job improvement is interesting because I
can progress through multiple jobs, and that applies to houses too."_ A
tick that stopped meaning anything after the first time would lose the
shape of the arc, so `reached` is a list of dated entries with notes —
"2026-08-31 · Maple Street". Undo takes the **most recent** lap only:
clearing the list would cost the record of the first two, which is the
sort of thing noticed afterwards.

**Evidence is gathered live, never copied.** A stored count is a total
that can be wrong. `keepFor` filters projects by home, which is what
stops a quest counting as house work — the third instance of a leak
that has now bitten `recommendation` and
`projects.actions-closed-in-month`. `latest` is read **per field**, so
somebody who checks their credit score quarterly still gets last
month’s net worth.

`DB_VERSION` went to 13 with a new guarded block, and the collection
registered in all five places — payload, `isEmpty`, `payloadSize`, the
Firestore target, the backup table — plus the tombstone list and the
deletion switch. The `switch-exhaustiveness-check` rule caught that last
one, and `repositories.test.ts` caught the store list. That is the
machinery working: five of the seven were found by the compiler or a
guard rather than by memory.

**A text field does not share a row with two other controls at 375.**
This has now shipped four times, and it is written as a constraint rather
than as a story about one form because the story is what let it recur:

| Where                                                     | The field came out at                          |
| --------------------------------------------------------- | ---------------------------------------------- |
| Quests, add form (name + Side/Main + Add)                 | **177 px**, clipping _"Something you are tr…"_ |
| Codex, filter row (search + status + sort)                | **26 px**                                      |
| Map, filter row (search + kind + sort)                    | **109 px**                                     |
| Map, "The world" heading (title + Trips + waiting + Walk) | the **title** wrapped to "The / world"         |

**The mechanism is always the same**: a `select` takes its intrinsic
width from its longest option — "Currently Using", "Recently Added" — and
a button from its label, so `flex-1` on the field gets the remainder,
and the remainder at 375 is nothing. Two of these were found by
_measuring_ rather than by looking, which is the only thing that finds a
26-pixel box: it does not look broken, it looks like a narrow control.

**The fix is a row of its own for the field**, with the remaining
controls sharing the next row at `flex-1` each. Measured after: 343, then
168 · 168.

**A report of "I can't do X" is not always a broken X.** The quests one
was reported as _"I don't seem to be able to add new side quests"_ and
**the form worked**. A control that cannot finish saying what it is for
reads as disabled, and the loud button beside it reads as the whole form.
The fix is layout, and saying so is more useful than a changelog line
claiming a bug was fixed.

**A report of "I can't do X" is not always a broken X.** Driving it
found a working form nobody could see was a form; the fix is layout, and
saying so is more useful than a changelog line claiming a bug was fixed.

**A step's tick is a box, empty or ticked — never a ✓ that means "press
me".** Reported: _"I added a new side quest, but the steps make it seem
like they're already completed once we add them."_ They did. A pending
step drew a bare check and a closed one drew an **undo arrow**, so a
fresh three-step quest opened looking exactly like a finished checklist,
with _0% done_ directly above it saying the opposite.

The icon was the **affordance** rather than the state — press this to
close it — and nothing on the row reported which state it was in except
a strikethrough that is easy to miss. An empty square reads as
outstanding to everybody, which is why `DailyRow` has drawn one since it
was written; `ActionRow` uses that control now rather than a new one.
Unticking is the same box, for the same reason a daily's is.

**The general rule this is the second instance of: an icon that changes
between two actions cannot also be the record of which state you are
in.** Both readings are available and the wrong one is the first one
anybody takes. Where a control toggles, draw the _state_ and let the
press be implied.

**The quest log is the hub's front page, and two of its rules used to be
the database's job.** `/next` is what `/` redirects to. Cycle detection
(`validateBlockers`) was enforced in the schema as well as in code and is
now the only guard there is; cascade delete is `withoutBlocker`, called by
hand, because a dangling blocker id would otherwise sit in the record,
travel over sync, and come back if a later project reused the id.

**The tech tree is drawn as a tree, and the shelf that shared its name
is called Gadgets.** Asked for as _"instead of the tech tree being one
thing, I want that to be renamed to gadgets and just have the tech tree
be an actual tree with the different list we've made (home, tech, etc)
as literally branches of that tree instead like a video game."_

One word had been doing two jobs: the screen was Tech tree and so was
one of the two shelves on it, so "the tech tree" meant the whole thing
or half of it depending on where you stood. The screen keeps the name
and the branch takes one describing what is on it. `base` stays **Base**
rather than becoming Home, because that is what its own tab says.

**`tree-layout.ts` is pure and lives in the feature, not the domain.**
It is geometry over a graph, so it is testable without a browser — and
positions are presentation, which `domain/upgrades/` has no business
holding an opinion about. Columns are fractional because a parent sits
at the midpoint of its outermost children, which is what makes a tidy
tree look drawn rather than stacked.

**SVG for the connectors, HTML for the nodes.** Lines need arbitrary
endpoints; nodes need wrapping text and a 44-pixel tap target. Drawing
labels inside the SVG would mean reimplementing text wrapping and losing
the target the mobile bar requires.

**It scrolls sideways, and that is the one place in this app where that
is correct** — but it was doing far more of it than the tree needed. A
tree of any width cannot be squeezed into 375 pixels with readable nodes,
so the canvas is as wide as it needs and the container scrolls; the
_page_ must still never scroll sideways, so the overflow is on that
container alone.

**Branches stack down the page rather than side by side.** Reported as
_"I have to scroll all the way over to see it in mobile which isn't a
great experience."_ Columns were handed out in one running sequence
across every branch, so the canvas was as wide as **the sum of all of
them**: measured at **1320 pixels** on eight upgrades across two shelves,
on a 375-pixel screen. You could see 28% of your own tech tree, and the
second branch was entirely off the right edge before you had seen
anything.

Each branch now starts at column 0 in a row band of its own, so the width
is **the widest single branch** rather than the sum — the same eight come
out at **528**. Height grows instead, which is the axis a phone already
scrolls.

It can still overflow, and that is now the case the horizontal scroll is
genuinely for: four siblings at 132 pixels is 528 whatever the screen.
What it no longer does is hide a whole branch before you have seen one.

**The gutter became a gap.** `BRANCH_GUTTER` was empty _columns_ between
branches, because side by side with one column sequence the last node of
Base and the first of Gadgets sat adjacent and a Monitor filed under
Gadgets appeared to hang off Base. Stacking answers that by construction
— they cannot be adjacent sideways any more — and `BRANCH_GAP` is the
empty _row_ that keeps the deepest node of one band off the next band's
label.

**The trunk sits above the first branch, not centred across all of
them.** Side by side the centre was between the branches and every edge
ran down and outwards; stacked, they are all below it, so the centre of
the topmost band is the only position from which the edges do not cross
the bands underneath.

**Two layout tests moved from absolute rows to relative ones.** They
asserted rows 2, 3, 4 for a nesting chain, which was the same thing while
every branch's roots sat on row 2 — and would now be asserting _the order
of the shelves_ while claiming to assert nesting. Two more were added: the
canvas is sized to the widest branch rather than the sum, and a band
cannot overlap the one above it.

**A gutter between branches, found by looking rather than by reasoning.**
Columns are handed out in one running sequence, so the last node of Base
and the first of Gadgets sat adjacent with nothing between them; since a
connector leaves the top of a node, telling which branch something was
on meant tracing a line. On the first tree with content on both
branches a Monitor filed under Gadgets appeared to hang off Base.

**A cross-branch prerequisite is laid out as a root and linked with a
dashed edge.** Gates are global — "the desk before the monitor arm" is
real and crosses branches — so nesting it would drag the arm into Home,
and dropping the link would leave a locked node with nothing explaining
why. A dangling prerequisite degrades to a root for the same reason:
drawn oddly is visible, drawn nowhere is not.

**The pool replaced the device-local budget, and it is derived.**
`domain/upgrades/pool.ts`: every surplus recorded on a finance reading,
minus what the purchased upgrades cost. Asked for as _"at the end of the
month, whatever surplus I have leftover will be added to the pool to
spend of that."_

**A stored balance was the obvious build and the wrong one**, for the
third time in this app after `readCharges` and `tallyActs`: a running
total drifts on a lost write, cannot survive two devices incrementing
it, and hides a mistyped entry forever. Both halves here are records
that already exist and already sync, so the pool is an opinion about
records rather than a record of its own. It also fixes what the budget
box was — a `localStorage` number, so the phone and the laptop
disagreed about what was affordable and neither was inspectable.

**The surplus is typed, never derived from the net-worth series.** Net
worth moves for reasons that are not surplus — a market swing, a
revaluation — so a good month would hand you money you never had to
spend. What is banked is what you decided was spare.

**It is allowed to go negative.** Flooring an overspend at zero would
forget it by the next month, so the pool would refill to the next
surplus rather than starting from the hole. Same reason
`ChargeReading.over` is separate from `available`: the screen may clamp
a bar, the record must not.

**A pool spanning two areas means both mutations have to invalidate.**
`useRecordFinance` cleared `finance` and `character` and left `upgrades`
alone, so banking a surplus left the tree showing the old gates until
something else happened to reload it. Caught by driving the round trip,
not by a test.

**The history row drifted the same way it drifted before.** Adding the
surplus left two months of real readings displaying "Nothing recorded"
while the figure sat in the database — the defect this file already
records as _"a month's row draws every figure it holds, and drew two of
four"_, arriving again by exactly the route it did the first time. The
recording path's walking test passed throughout, because the storing was
correct; what drifted was the **display**, which kept its own
hand-written copy of the list. It is a `Record<keyof NewFinanceReading,
…>` now, so the next field fails the build here too. **A guard on one
end of a field does not guard the other.**

**Finance is the money hub.** Asked for as _"add all the other upgrades
on that page"_ — so it carries the standards, the monthly readings, the
pool and what the pool is going towards, and the tree keeps the picture
and the gates. The list there is a **readout, not a second editor**: a
control would be a second place for the gate rules to be got wrong,
which is why Base's upgrade rows are read-only too.

**Adding to the tree picks its branch.** With one screen per shelf the
screen implied it; with one tree showing every branch there is nothing
to infer it from, and adding a desk only to move it afterwards is the
round trip Base was given its own add form to avoid.

**The tech tree is where `domain/game/` stops being unwired.**
`domain/upgrades/` projects an upgrade onto the model's `TreeNode`, so
`GATE_KINDS` — money and a prerequisite, nothing bought with points — now
constrains live code. Money is integer minor units everywhere; a budget
filter on floating point eventually disagrees with itself. Two of its
rules had a database behind them and no longer do: `wouldCreateCycle`, and
the refusal to delete anything with dependents still attached.

**The morning digest pays no XP, and that is the design rather than a
gap.** A digest is the one thing in the hub that is not a record of
anything you did — reading a headline list is not an act, and paying
for marking items read would create exactly the farming incentive the
act/outcome line exists to prevent. It is a reading surface, like the
map's tiles, and it is deliberately **not a `LifeArea`**: adding one
would break the trait partition and demand acts it should not have.

**Its one action lands somewhere that already scores.** Saving a story
makes an ordinary backlog item, and logging progress there pays, and
finishing it pays, and both feed Intellect. So the path from "this
looks interesting" to XP runs through a record of having actually read
the thing. The card says so on screen.

**Interests rank; they do not gate** — the one place the job scorer’s
shape was deliberately not copied. There a keyword is a _share_ of the
wanted list, so adding one you rarely match lowers every score, which
is documented because it reads as a bug. A digest has no such excuse:
hiding everything off-subject turns it into a filter bubble somebody
configured by accident. **Mutes do gate**, because that is what a mute
is. Nothing computes a score of its own; the fallback is the source’s
own points, which every reader of that site already understands.

**Hacker News through Algolia, not the official Firebase API.** Both
are open to a browser with no key and both were tested. Firebase
returns 500 story _ids_ and then wants a request per story to get
titles — thirty requests for a front page, where Algolia returns it in
one. Lobsters is reachable and sends no CORS header; Exercism is
CORS-blocked outright. That makes six outbound hosts, and **each one is
a decision, not a precedent.**

**Parsing is what keeps the cache small.** A single Algolia hit carries
`_highlightResult` and a `children` array of every comment id on the
story — eighty on the first one looked at. Twelve parsed stories store
in 4.3 KB; the raw hits would be orders of magnitude more. An Ask HN
has a **null `url`**, verified live, so `url` is optional and the
discussion link always exists.

**`once-a-day.ts` is shared by the digest and the job sweep, and it
fixes a bug the sweep shipped with.** That gate kept a marker and no
store, so the second open of a day answered "already swept" carrying
nothing — the card showing thirty leads at eight in the morning
rendered blank at noon, with the day marked so it could not run again.
A morning’s work vanishing with no way back is worse than not having
run it. The result is remembered now.

The day is still marked **before** the work: a source that hangs would
otherwise leave it unset and every reopening that day would retry the
whole list. The two are stored at different moments, which is what
makes a failure (`failed-earlier`) distinguishable from a success that
returned nothing.

**The manual retry that sentence promised did not exist, and a failed
morning was unrecoverable until midnight.** Reported as _"Hacker News
could not be read / DEV could not be read"_. Both endpoints answer a
browser fine — checked from the deployed origin, 200 with CORS on both —
so the failure was real once and then **stuck**.

Two mechanisms held it there, and they arrive at the same dead card by
different routes:

- `forgetToday` was written, exported and **called by nothing**, the
  eighth instance of that shape here. So `failed-earlier` had no way
  out.
- **A total failure is remembered as a success.** `readDigest` catches
  per source and returns the failures as _data_, so the gate stores a
  perfectly good result that happens to be two error lines —
  `remembered`, not `failed-earlier`. The sweep does the same.

Both cards carry a **Try again** now, through `useRetryToday`: forget
the day, invalidate the query, let the gate re-run. That is the decision
rather than the storm the paragraph above describes. The queries stay
`staleTime: Infinity` with every refetch off, because the point was
never that this should retry _by itself_.

**Why one bad moment is likely rather than rare:** both jobs run on the
first open of a day, and a PWA's first open is a **resume from the
background** — precisely when a phone is most likely to have no usable
connection yet.

**The cause was thrown away at the moment it was caught.** The catch
read `void error` under a comment saying it was "kept for the log". It
was not, so every failure this screen has ever reported was
undiagnosable — a 503, a CORS refusal and a phone with no signal all
rendered as the same sentence with nothing behind it. It logs
`digest.source-failed` now. **A comment claiming something is logged is
worth checking, not trusting.**

**A saved story is checked against the Codex, not against component
state.** A story sits on the front page two days running, and state
alone resets on reload — which is exactly when the duplicate gets made.
Same guard `appliedLinks` gives the job leads.

**The save is marked only once the write succeeds**, and the first
version got this wrong in the most instructive way: it invented a
status (`not-started`, which is not one of the six), the domain refused
it correctly, the error went to the log, and the tick turned green over
a record that did not exist. A button that looks like it worked is
worse than one that looks broken.

`articles` joined `CATEGORY_REGISTRY` because a story is genuinely none
of the other ten, and filing one under `books` would make every reading
statistic about books wrong. Its test was split in two: the ported ten
must all still be present — losing one would orphan every item filed
under it — but the registry is allowed to grow, which the old
exact-array assertion forbade for no stated reason.

**The job search lives in settings, and it was component state — which
made it a bug rather than a preference.** Six `useState` calls on the
leads panel held every board slug and every filter, so all of it was
wiped by any navigation. The panel is reached _from_ the applications
above it, so tapping through to one and coming back is the ordinary
path, not an edge case: the search had to be retyped before it could
be run, every time.

It also left **three of the six filters unreachable**. `titleExcludes`,
`keywordExcludes` and the score floor were literals at the one call
site — `[]`, `[]` and `0` — so two exclusion rules the domain
implements and tests could not be set from anywhere, and the floor of
zero meant the scorer ranked the whole board and hid nothing. The
default floor is 40: a posting still scores for being fresh and in the
right place without matching a single term.

It **syncs**, because a board slug is a fact about the search rather
than about the phone. `parseJobSearch` is its own validator for the
reason the settings parse around it is: this arrives from another
device, and a board kind that is not recognised must be dropped rather
than handed to the gateway.

**"Read daily" is a sweep on the first open of a day, and calling it a
schedule would be a lie.** Nothing can run while the app is closed —
no server, and iOS gives a home-screen web app no background fetch,
the same ceiling that stops a daily from ringing. On something opened
every morning that is most of the way to the same thing, and the copy
says "this morning" rather than implying a timer.

**The marker is written before the boards are read, not after.** A
board that hangs would otherwise leave it unset and every reopening
that day would retry the whole list — one slow morning turning into a
request loop against a free API somebody else pays for. A failed sweep
is reported in `failures` with a button beside it, which makes the
retry a decision.

**The marker is per-device and deliberately not synced**, unlike the
search itself. One that travelled would have the phone skip its
morning sweep because the laptop ran one an hour ago, leaving the
phone showing nothing with no way to explain why. Two devices reading
a board each is the cheaper mistake. Same call the upgrade budget and
the program position make.

`useDailySweep` is a query rather than an effect so Today and the Jobs
screen share one answer, with every refetch turned off: the defaults
would re-read three job boards on each window focus, which is the
polling this whole area is written to avoid.

**Approving a lead _is_ applying, and that diverges from the app this
was ported from on purpose.** There, approving files an application in
_Preparing_ and applying is a later stage. Here, creating the
application pays `jobs.application-sent` — thirty XP for an act — so a
record that existed before anything was sent would pay for something
nobody did. One press opens the form and files the application
together, which is the only arrangement in which both stay true. A
shortlist of postings you are _considering_ is a different record and
is not this one.

The window is opened from the click rather than after the write
resolves, because a popup blocker stops anything a promise opens later.

**`Project.link` is the identity of an approved lead.** A sweep is the
only way to see a lead and a sweep re-reads the whole board, so the
same posting comes back every time — without a key, triaging twice
quietly produces two applications to one job. The apply URL is the one
thing about a posting that is unique _and_ stable across a re-read:
ids are per-board and a title repeats across companies.

**The posting travels with the approval**, into `description`, so the
resume match works the moment the application exists. Nothing is
prepended to it — a "from Greenhouse, scored 80" preamble would put
those words into the match, where "greenhouse" and the board slug would
read as requirements.

**Terms are ranked by count discounted by how late they first appear,
and getting there took one wrong answer worth recording.**

Frequency alone rewards boilerplate, because boilerplate repeats. The
usual fix is inverse document frequency and it wants a corpus of
postings, which an app reading one job ad does not have.

**Capitalisation was tried first and measured wrong.** The idea: a
posting capitalises Kubernetes and Terraform mid-sentence while prose
stays lower, so the writer is telling us which words are names. True of
the requirements — and equally true of benefits sections, which are
written in Title Case. On a real posting it promoted "Medical",
"Available" and "Full-time" and made the list _worse_ than frequency.
A good-sounding idea that did not survive contact with a document.

**Position survived it, and the separation was not subtle.** On the
same posting: endpoint at 18% of the way in, macos 19%, fleet 19%,
gitops 21%, telemetry 25% — against insurance at 67%, 401 at 69%,
parental 71%, bonding 72%, privacy 99%. Postings put the job first and
the benefits and legal last, and that is structural rather than lucky.

The weight is `count × (1 − firstAt / total)`. **First rather than
average**, because a requirement named at the top and mentioned again
among the benefits is still a requirement.

Measured before and after on the posting that started it. Before:
`bonding ×6, coverage ×6, through ×6, weeks ×6, fleet ×5, pay ×5`.
After: `fleet ×5, how, build, endpoint, macos, windows`. Every benefits
word left the top twelve, and the phrases went from `bonding only,
parental leave, weeks birthing` to `fleet macos, corporate security,
fleet telemetry`.

Nothing is dropped, only ranked — `dental` still reports its four
mentions, further down. A word list that removed it would be the app
deciding what counts as a skill, which is the line held everywhere else
here.

**A real posting is mostly not the job, and that is a live limitation.**
The match was built against hand-written three-sentence fixtures. The
first genuine posting — 5,400 characters of Ashby ad — produced a gap
list led by `ramp ×10`, `bonding ×6`, `weeks ×6`, `ll ×5`, `100 ×4`.
Three of those were fixable without the list starting to have opinions
about which _skills_ matter:

- **Bare numbers** are never a skill, and repeat enough to sort high.
- **Contraction tails** are not words: the tokeniser splits on the
  apostrophe, so "we'll" leaves `ll` behind.
- **The employer's own name**, passed to `matchResume` as `ignoring`. A
  posting says its company constantly and never requires it of the
  applicant.

What remains is benefits and legal boilerplate — bonding, coverage,
insurance, leave — which is genuinely in the posting and genuinely not
the job. Filtering it by word list would be the app deciding what a
skill is, which is the line this file holds elsewhere. The honest
options are ranking by distinctiveness rather than raw frequency, or
reading only the part of a posting above the benefits section, and
neither is a stopword.

**The app talks to three job boards now, and that was tested before it
was claimed.** Greenhouse, Lever and Ashby publish every open posting
as JSON with no key and no account, and all three answer a browser
request directly. An earlier answer in this project said job discovery
"requires a server or proxy, full stop" — that is true of LinkedIn and
Indeed and false of the public ATS boards, which is what the other app
was already using. **The correction came from running three fetches,
not from thinking harder.**

This makes four outbound hosts: OpenStreetMap for tiles, Nominatim for
geocoding, Firebase when sync is configured, and now the boards. Each
one is a decision, not a precedent.

**Parsing is pure and fetching is not.** `domain/jobs/boards.ts` turns
a board's JSON into postings and touches no network;
`infrastructure/jobs/ats-gateway.ts` is the only thing that fetches.
Every quirk below is therefore testable against a fixture rather than
against the internet on the day the suite runs — and the fixtures are
shapes taken from the live APIs rather than invented.

Three of those quirks were found in the first posting looked at, which
is why they are worth naming:

- **Ashby's own `isRemote` cannot be trusted.** A Ramp posting had
  `workplaceType: "Hybrid"` and `isRemote: true`. Believing the flag
  floods a remote search with office jobs, so `workplaceType` is
  authoritative whenever present and only a blank one falls back to the
  location text.
- **Ashby's compensation tiers hold several kinds of component.** The
  first was `EquityPercentage` with null values and the salary was
  second; taking the first reports somebody’s option grant as their pay.
- **Greenhouse's `content` is entity-encoded**, so it needs decoding
  twice — once to markup, once to words. Stopping after one leaves
  `&lt;p&gt;` for a keyword search to match through. Its `id` is also a
  _number_, and its `absolute_url` points at whatever embedded board the
  company runs, so the apply URL is built from the canonical address
  instead.

**Lever answers 200 for a board that does not exist**, with
`{"ok":false}` rather than a 404 — so the body shape is the only way to
tell a real empty board from a typo.

**Read on demand, never on a timer.** These are free services run for
employers rather than for us, and boards are read one at a time rather
than in parallel. A dozen simultaneous requests from every device that
opens a screen is how a free API stops being free. Same restraint the
geocoder shows towards Nominatim.

**A board that fails is named, and the sweep continues.** A mistyped
slug is the commonest thing that goes wrong, and a sweep that threw on
the first bad one would report nothing and leave somebody blaming the
network.

**Nothing is stored yet, deliberately.** The other app keeps a SQLite
mirror of every posting from every board; approving a lead into a
tracked application is the next piece, and until that exists,
persisting a mirror of three job boards would be storing something
nobody can act on. LifeOS records what you did, not what the internet
contains.

**The lead scorer is ported from Career Command Center, and it is a
port rather than a rewrite.** `domain/jobs/score.ts`. Hard filters drop
a posting outright; what survives earns 0–100 from title hits, keyword
coverage, location fit, published pay and freshness. **No model is
involved and every point is explainable**, which is the property worth
carrying across: a lead scoring 74 can say which points it earned.

Two deliberate departures from the C#, both rules this codebase
already holds:

- **Reasons are data, not a string.** The original built a
  `StringBuilder` of lines like "+50 title matches …". Structured
  reasons let a screen render them and a test assert on points rather
  than prose, and nothing has to parse English back into numbers.
- **The clock is a parameter.** `DateTime.UtcNow` was read inside the
  scorer, which makes freshness untestable and scores the same posting
  differently depending on the day the suite runs.

Money is minor units, like everywhere else: a pay floor is a budget
filter, and a budget filter on floating point eventually disagrees with
itself.

**Keyword score is a _share_ of the wanted list, which is the most
surprising thing in it.** Adding a keyword you rarely match lowers
every score — the list is for ranking, not for widening the net. It has
a test saying so, because it reads as a bug the first time somebody
meets it.

**The wanted-locations list applies to remote roles too.** "Remote
Poland" is still Poland. A bare `remote` term is how somebody opts into
remote-anywhere; `remote us` or `denver` keeps it local. The other
reading — remote means location does not matter — is the one that
quietly fills a board with jobs in the wrong hemisphere.

**A stale req is penalised, never dropped.** Past ninety days it loses
eight points: often filled or evergreen, occasionally still real, so it
falls behind fresher work rather than vanishing.

**Pay is judged only when the board publishes it**, which most do not.
Dropping every posting that stays quiet about money would throw away
the majority of a board to enforce a floor nobody stated.

**The posting lives in `Project.description`, and the match is a word
count.** `domain/jobs/match.ts`. For an application the posting _is_
the description of the thing, so a parallel field would be a second
place for the same text — the reuse that makes a house job a project
rather than a new record.

**It says on the screen that it does not read either document.** It
cannot tell that "orchestration" and "Kubernetes" are about the same
paragraph, and it will not notice five years being asked for. What it
answers is the one question nobody can answer reliably by eye at
eleven at night: which words in this posting appear nowhere in my
resume. A bare percentage with no caveat would read as advice about
whether to apply, which nothing here is entitled to give.

The alternative is a language model, which needs a key, which in a
client-only app is a key anybody can read out of the bundle. This
needs none, runs offline, and gives the same answer every time.

**The tokeniser keeps punctuation inside a token, and that is the whole
difficulty.** The obvious one strips non-letters, which turns `C#` into
`c`, `.NET` into `net` and `Node.js` into two words — on a software
posting that is most of the vocabulary destroyed before the comparison
starts. So `#`, `+` and `.` survive within a run and are trimmed only
from the ends.

**Single characters are dropped, which loses C and R.** Both are real
languages and both are the commonest stray letters in prose; a posting
with a bullet lettered "c)" would otherwise report C as a requirement.
Losing two languages is the cheaper mistake.

**The stopword list was grown against a real posting, twice.** It began
as words with no meaning in any field, and driving it showed "we" and
"need" at the top of a gap list, then "is" and "to" — noise in the
first column somebody reads is how they stop trusting the rest of it.
Two groups were added: the voice a posting is written in ("looking",
"join", "ideal") and how it says a thing is wanted ("required",
"expertise", "familiarity"). The line held throughout is that the list
never decides which _skills_ matter — that would be the app having an
opinion about somebody’s field. `go` is deliberately absent, being a
language.

**Two-word phrases, because "azure functions" is a different
requirement from "azure".** A word match reports Azure covered and
says nothing about the gap — on a posting built out of product names
that is most of what it was asked. Shown above the single words, since
a specific gap inside something you _do_ know is the sharpest thing on
the panel and would be lost among thirty loose words.

Verified against a real posting: `azure` and `openai` read as covered,
`azure openai` is correctly _not_ a gap, and `azure functions` and
`azure devops` are — three phrases sharing a word, told apart.

**Phrases are not in the `share` denominator.** Every phrase is made of
words already counted, so folding them in weighs the same vocabulary
twice and moves the number for a reason nobody could trace back to the
posting.

**A separator has to actually separate, and the first one did not.**
Resume sections were joined with ". " on the assumption a full stop
breaks a pair — but the tokeniser strips a trailing dot on purpose, so
the words stayed adjacent and a phrase could span two bullets that
never touched: "Wrote TypeScript" and "Mentored engineers" invented
"typescript mentored". `segments` breaks on line endings, on commas and
semicolons, and on a full stop **only when whitespace or the end
follows it** — which is what keeps `node.js` and `.NET` whole, the
whole reason the tokeniser tolerates dots. Caught by a test written to
assert it could not happen.

**Trigrams are deliberately absent.** On a posting of this length they
are mostly noise, and the first thing they produce is a longer list to
read — the opposite of the point.

**No stemming, stated as a limit rather than half-solved.**
"microservice" does not match "microservices". Stemming would fix that
and would also match things that are not the same word, and a match
wrong in a way nobody can predict is worse than one that is plainly
literal.

**The resume is structured, because tailoring means choosing parts of
it.** `domain/resume/resume.ts`. A PDF is a picture of a resume; what
an application needs is the thing underneath — which bullets exist,
which went out for a given role, which summary was on top. None of
that is answerable about a file.

**A bullet has an id, and that is the load-bearing decision.** Tailoring
is choosing which bullets go out and in what order, so a bullet must be
referable. The alternative is storing a second copy of the text on the
application, and two copies of a sentence is how the resume and the
record of what was sent start disagreeing after one edit.

**A company holds roles; a role is not a job.** Two roles at one
employer is a promotion and prints under one heading — a flat list of
jobs prints the employer twice and makes a promotion read as
job-hopping, which is the opposite of what it is evidence of. Matching
is on the trimmed, lower-cased name, so "Northwind" and " northwind " are
one employer and nobody has to notice.

**A current role sorts first, and nothing else is sorted.** A resume
leads with the job you are in; the order roles were _typed_ has nothing
to do with it, and prepending each new one put the older role on top —
caught by looking at the screen, not by a test. Sorting by date is what
you reach for and is not available: `from` is free text on purpose,
because a date picker for something a resume prints as a word is a
worse form. "No end date means current" needs no parsing and is right
every time. Two _past_ roles at one employer keep the order they were
added, which is worth stating rather than pretending otherwise.

**Bulk entry is a paste, never a parser.** Bullets arrive one to a line
and are split on newlines, with a leading glyph stripped. Guessing
structure out of arbitrary resume text works on the document it was
written against and quietly mangles the next one — and a mangled resume
is worse than an empty one, because it looks finished.

**Nothing is seeded.** The repository is public, so a name, a phone
number and an address in source are published the moment they are
committed. Every field arrives from the person using the app.

**The job search is absorbed, and phase 0 had already designed it.**
`registry.ts` declared the `jobs` area before there was anything in it
— no ladders, one act, two ratings — and `sheet.test.ts` carried a line
asserting it was _deliberately_ uncounted. Building it was mostly
reading what had been decided.

**No ladder, and the reason is in the registry**: a campaign has stages
and an end, which is not the same as having a ceiling. There is no such
thing as being maximally good at looking for work.

**An application is a `Project`, not a new record.** Name, fixed steps,
a home that decides which screen it appears on — the shape a house job
already is. `belongsTo` and `steps` on `NewProject` were built for
those a day earlier and needed nothing added.

**`jobs.application-sent` pays 30 XP on _creation_, and reaching a
stage pays nothing.** This is the sharpest instance of the act/outcome
line in the app: sending is a thing you decided to do, being given an
interview is a thing that happened to you. Paying for the second is the
streak mistake in a suit. The stages exist so their **dates** are
recorded — `ActionItem.completedAt` is what makes
`jobs.stage-advances-in-month` countable at all, where storing a
"current stage" would say where every application is and never when it
got there.

`APPLICATION_STAGES` is `Screen · Interview · Offer` and **does not
include "Applied"**, because sending is the record existing. Unlike a
house job's steps these are not offered as checkboxes: every
application has all three ahead of it and nobody declines to be
interviewed, so a checkbox would ask a question with one answer.

**`jobs.applications` is the only weekly rating in the app and has no
producer.** `measure.ts` is monthly throughout, because a snapshot is
what gives a direction two points in time. A declared source with
nothing feeding it reads as **absent**, which the spine skips — so it
says nothing rather than something false, and a weekly cadence is a
decision still to be made rather than a gap to be patched.

**`projects.actions-closed-in-month` is own-area only now**, and it was
not before. That rating is about the quest log, so a house job’s steps
had been scoring as quest throughput all along and a screen and an
interview would have joined them — the same leak `recommendation` had,
one layer down. Both were found by driving the app, not by a test.

**The You page links to each area now** (`AREA_ROUTES` in
`CharacterPage.tsx`). It is the screen that says how every area is
going and it had no way to reach any of them. The map lives in the
feature rather than the registry, because `domain/game/` must not know
that a browser exists; it is partial on purpose, since an area with no
screen is a heading rather than a link that goes nowhere.

**Finance is the one area that measures and pays nothing, and it is
the clearest case in the app for that.** Three numbers a month — net
worth, retirement, credit score — read off a statement. Typing your net
worth in is a _measurement_, which the app already refuses to pay for
when it is a bodyweight, and paying for the number going up would be
paying for an outcome. So `acts: []`, deliberately. An area that
measures without paying is not an incomplete area; Vitals ran that way
for most of its life.

**All three figures are ladders now, and two of them were not.** A
ladder must name an external standard, and the credit score always
qualified: FICO publishes its bands, every lender quotes them, and
nothing this app does can move them — so `CREDIT_BANDS` is
`[300, 580, 670, 740, 800]` and the fit to five levels is genuine rather
than arranged.

This file used to say net worth could never join it, because there is no
published figure at which somebody has finished having money. **That is
still true and it was the wrong test.** A powerlifting ladder has no
finish line either — its levels say where a lifter sits among lifters,
and somebody published that. Asked for as _"net worth and savings should
be displayed too, look up reasonable standards for a 32 year old"_, and
the standards exist:

- **Net worth reads as a percentile among households your age**, from
  the 2022 Federal Reserve Survey of Consumer Finances. Descriptive —
  where do I sit. The ladder's thresholds are the published 25th, 50th,
  75th and 90th, so **every place a level changes is a published point**
  and only the position between them is interpolated.
- **Retirement reads against the benchmark for your age**, Fidelity's
  1× salary by 30, 3× by 40, 10× by 67. Normative — am I on track — so
  Advanced is the benchmark met rather than beaten.

**Two standards rather than one, and the tidier option is useless.**
Reading retirement as a percentile too would share a source and a
method; the median household aged 30–34 holds about $12,700 in
retirement accounts, so anybody contributing seriously lands at the top
of that ladder at once and it stops discriminating.

**Both need a fact about you, which is why `settings.birthYear` and
`settings.annualIncomeMinor` exist.** They are the same shape as
`bodyweight`: a standard expressed per person needs the person. Neither
is guessed and neither is defaulted — with the year absent both ladders
report nothing, which is the absent-never-zero rule doing exactly its
job. The fields are on the Finance screen rather than in Settings,
because the sentence that makes them meaningful — _"at 32 the benchmark
is 1.4× your income"_ — is only sayable next to the figures it changes.

**The SCF measures households and one person is not one**, so somebody
living alone reads low against it. Nothing here can correct that, so the
screen states it. `domain/finance/standards.ts` carries both tables and
the reasoning.

**The salary is tracked as a monthly reading, not held in settings.**
Asked for as _"we should track salary"_, and it was the right correction
twice over: a raise happens on a date and belongs in the record with the
rest of the money, and `settings.annualIncomeMinor` — which had shipped
an hour earlier — was a second copy of a number waiting to disagree with
the first. It is gone; the retirement benchmark reads
`latest(finance, 'salaryMinor')`. **A birth year stays in settings**,
because it is not a series: a reading of it would be the same number
written down repeatedly.

**A stage can require a salary**, so the income leg of a moving arc is
measured rather than declared. It is the one money requirement that is a
**rate** rather than a balance — which changes nothing about how it is
read and everything about what a target means.

**A target cannot be automated and the offer of published figures can.**
Asked as _"we probably need to set some sort of target then huh, any way
to automate that."_ Computing one would be the invented scale this model
refuses — nothing here knows what somebody ought to earn. What the stage
editor does instead is offer the **Census Bureau's own breakpoints for
your age** as one tap each, which fill the box rather than setting the
stage: offered, never applied, the stance `ApplyEstimates` and the
config paste both take. Absent without a birth year, and absent outside
the ages the table covers — `salaryReferences` returns nothing rather
than the nearest bracket, because a suggestion is only worth making if
somebody published it about people your age.

**The published income table covers 25-34 only, deliberately.** It is
the one bracket whose three breakpoints came from a single consistent
cut of the survey; mixing a median from one vintage with quartiles from
another to cover more ages would make every figure slightly untrue.
Adding a bracket is adding a row.

**A month's row draws every figure it holds, and drew two of four.**
Reported as _"I thought I recorded all three, but it says I only put
credit score — went to the finance page and it shows a row but I only
see 2."_ The retirement figure had been written correctly every time and
there was no screen that showed it. The figures are labelled now rather
than positional: four numbers separated by dots are four numbers nobody
can tell apart, which is the shape the bug hid in.

**The form opens on what is already recorded**, which is what makes it
an editor — _"any way to edit?"_ There had been no way to see a stored
figure, let alone correct one, so fixing a typo meant remembering what
you had typed. It is keyed on the month, so the fields fill in when the
record loads and reset if the month turns over with the screen open. The
merge rule is unchanged and now visible: **an empty box keeps what it
had** rather than clearing it, because there is no telling "I did not
check" from "I meant zero".

**`NewFinanceReading` is derived from the record and its fields are a
mapped type, because this dropped one silently.** A salary was added to
`FinanceReading`, collected by the form, passed to `recordFinance`, and
written nowhere: the input type still named three fields and the merge
was built with conditional spreads, **which defeat excess-property
checking**. Nothing failed to compile and the suite was green.

Second instance — `addDaily` lost `timesPerDay` by the same route — and
the fix is the same: `Omit<FinanceReading, 'month' | 'updatedAt'>` plus
a `Record<keyof NewFinanceReading, true>` the compiler makes you fill
in. Found by driving the app. There is a test now that walks the
figures rather than naming them, because a hand-written list beside a
list that already exists is what drifted.

**The two ratings those replaced are gone rather than kept alongside**,
because rule two forbids one measurement being claimed as both a ladder
and a rating — and `finance.net-worth-in-month` differed from the new
source only in wording.

**No transactions, and that is the same call the macros made.** A
ledger needs every purchase entered, it is the first thing to fall
behind, and everything derived from a stale one is quietly wrong.

**A month is one row filled in over time, not three rows pretending to
be one.** `recordFinance` merges: the figures arrive on different days —
a statement on the 1st, a score whenever the issuer refreshes it — so
entering one must not blank the others. An empty box leaves a figure
_alone_ rather than clearing it, because there is no telling "I did not
check" from "I meant zero" once written, and only the second corrupts a
series.

**The score is read live and the money figures are read for the month**,
which is the ladder/rating split made concrete. A ladder must not depend
on whether the review was opened, so it takes the most recent score
whenever that was; the ratings need one figure per month in a series.
`latest` works per _field_ rather than per row, because somebody who
checks their score quarterly has months where one figure is present and
the other is not.

**A score outside 300–850 is refused, not clamped.** Quietly rounding a
typo to 850 would put somebody on the top rung of a ladder by accident,
which is the one thing a ladder must never do.

**`DB_VERSION` went to 11 with a new guarded block**, never an edit to
step 10 — a device that has run a step will not run it again, so a store
added there would reach nobody who has already opened the app.

**No area scores itself.** `domain/review/` is the spine and
`from-registry.ts` is the join: a rating declared in
`domain/game/registry.ts` becomes a metric the evaluators judge. Do not add
scoring to a domain — declare the rating and let the spine do it, or there
are two answers to "is this going well" within a release.

**The spine still reads and nothing writes to it any more.** The review
screen was removed and it was the only thing that filed a month, so the
rating half of the model is dormant: declarations stand, `readout` runs,
and it finds whatever was filed before. **If ratings are wanted back,
the missing piece is a screen rather than a rule** — and if they are
decided against for good, the removal is the registry's `ratings`
declarations, `docs/GAME_MODEL.md`'s three-currency claim, and the
sheet's `RatingStanding`, which is a deliberate model change rather
than a tidy-up.

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

**A collection joins sync in five places and the resume was in none of
them.** Not `SyncPayload`, not `isEmpty`, not `payloadSize`, not the
Firestore target, not the backup envelope. It was written to IndexedDB
and read back on the one device that wrote it, while both sync and
export reported success on every run — the honest report of a push that
genuinely contained everything it knew about.

It is also the worst record in the app to lose. Everything else here is
a by-product of using the app and comes back by using it again; the
resume was typed in off a PDF, and nothing regenerates it.

It travels as a **singleton, like the settings blob** — one document
under a fixed id, sent only when its stamp differs from `resumeSynced`,
and merged whole-record last-write-wins by `mergeResume`. Same shape as
`mergeSettings` including the identity return, which is what stops two
devices bouncing the document back and forth forever. There is nothing
to union: a habit’s completions and a backlog progress log are per-day
append-only records where a record-level winner really does lose a day,
and a resume is one document somebody edits, so the later edit is a
correction. Unstamped always loses, the rule tombstones already follow.

In the backup it is a **collection of nought or one**, which fits the
table awkwardly and belongs there anyway: the claim that module makes
is that a thing joins the export, the preview and the import by gaining
one row, and the alternative was a fourth hand-written path for a
single record.

**The Firestore cursor could not advance on the app’s most-written
record, and the comment warning about it was sitting directly above the
bug.** `reached` is the high-water mark of what came back, and it was
computed from a **hand-written second list** of the pages — which had
already drifted once when the atlas was added, was repaired by hand,
and had drifted again: `dailies`, `vices`, `weighIns` and `finance`
were all missing. Nothing was lost, because those records were still in
the payload, so it looked like working sync. What actually happened is
that a device whose only change was habit ticks left the cursor
wherever the last workout had put it, and every subsequent pull re-read
everything after that point, forever.

**The fix is structural rather than four added lines.** `pages` is now
the array `Promise.all` returns, and the named results are destructured
_from it_, so a collection cannot be in one list and not the other. A
hand-maintained copy of a list that already exists will drift; that is
twice now.

**Three times now, and the third one was pushing nothing at all.** The
same defect, one function further down and far worse: `push` was a
hand-written list of ten collections beside a `pull` of twenty-four,
and **twelve were read from the server and written to it by nothing** —
places, trips, dailies, vices, weighIns, finance, campaigns, attempts,
homes, rooms, exploredCells, and `dayReadings`, which has since been
scrapped for reasons of its own.

Not a lost record, a lost **direction**. `isEmpty` and `payloadSize`
knew about all twelve, so a device whose changes that day were a habit
tick, a weigh-in or a night's sleep built a payload correctly reported
as non-empty, ran a sync, uploaded none of it, advanced its watermark
past it, and reported success. Most of the app was one-way, and from
both ends it looked exactly like working sync.

**The guard is the compiler, not a test.** `KEYED_BY` is a mapped type
over `SyncPayload` itself, so a field added to the payload without a
key here fails the build — the `Record<MuscleGroup, …>` mechanism, in
the one file that had no equivalent. Three of the twelve are keyed by a
**date rather than an id** (weighIns and dayReadings by their day,
finance by its month), which is the detail a hand-written list gets
wrong silently: writing them under an `id` they do not carry files
every row under one missing key and leaves a single document per
collection.

**`pushOperations` is pure and exported so it can be tested for real.**
The note above says the rest of this file is a query builder a double
would only assert calls itself — true, and _which records go up, under
what key_ is a decision rather than a call. The test walks the payload's
own fields rather than a list repeated in the test, because a
hand-written copy of a list that already exists is the thing that has
now drifted three times.

**The fog is one document per _device_**, keyed by the client id. Per
cell would make a thousand-cell walk a thousand writes; a single shared
document would be worse than either, because two devices would overwrite
each other's walking and a grow-only set that last-write-wins can erase
is not grow-only. The cost, since it is real: the payload carries the
whole set every time, so that document is rewritten on every exchange
and re-read by the other device on the one after.

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

**The worker and the page answer two different questions, and
`registerType: 'prompt'` answered both with "wait".** "Should the new
version take over as the worker" and "should this page reload right now"
are not the same question. Prompt mode installed a new version and left
it _waiting_ indefinitely for a client to send `SKIP_WAITING` — so a
banner missed once, or answered with "Later", left the old shell serving
forever, and closing the app and opening it again never promotes a
waiting worker. Every restart re-showed the banner and changed nothing.

**The client-side repair for that shipped and could not reach the device
that needed it**, which is the part worth remembering. It lived in the
bundle the stale worker was refusing to serve. **Only a change to the
worker itself reaches a stuck install**, because a browser fetches
`sw.js` from the network directly rather than through the worker it is
replacing — it is the one file that always gets through.

So the registration is `autoUpdate`: the _worker_ activates as soon as it
installs. The _page_ keeps the prompt, through `onNeedReload` — without
that handler the library reloads by itself, which is the mid-session swap
prompt mode existed to prevent. The banner's button is a plain
`window.location.reload()`, because `updateServiceWorker` only does work
in prompt mode and would otherwise look like a button that did nothing.

**`autoUpdate` also forces `clientsClaim`, and the workbox options cannot
turn it off** — setting `clientsClaim: false` there is inert, verified by
reading the generated `sw.js`. That matters because claiming hands the
open page to the new worker while it is still running the _old_ bundle,
so a dynamic import asks for a chunk by a hash the new precache does not
hold and a fresh deploy has removed from the server. `stale-chunk.ts`
closes it: Vite raises `vite:preloadError` for exactly this, and the
handler reloads once. It reads `PerformanceNavigationTiming.type` rather
than storing a flag — a page that is already the product of a reload must
not reload again, and a flag written to survive a reload is persistence,
which belongs behind a port.

**There was already a version line in Settings and it said "Lift".**
`VITE_COMMIT_SHA` and `VITE_APP_VERSION` have been injected by the deploy
all along. The rename missed this one footer, so the single place that
could answer "which build am I on" was labelled with a name the app has
not had for months — worse than nothing, because it reads as a different
app — and it sat below the fold with nothing to press. A `define` was
added to solve that before anybody looked for what existed, and has been
removed again. **Look for the thing before building it** is the standing
rule, and this is the freshest example of what ignoring it costs.

**Settings also carries a manual "Check for updates", and that is
deliberate duplication.** The banner asks, a waiting worker is applied at
launch, and if either fails there has to be something a person can press:
an update path with no manual override cannot be debugged from the far
end of a phone. It answers in words — "Already the newest" is the reply
that was impossible to get before, and it is the one that separates a
device that will not update from a deploy that did not happen.

**The service-worker lifecycle cannot be tested from the agent's
browser.** Registration is refused there ("An unknown error occurred when
fetching the script"), so the install → wait → skip-waiting path is the
one piece of this app that ships on reasoning and a production build
rather than on having been driven. Anything changed here wants testing in
a real browser against `vite preview`.

**A shipped change reaches an installed PWA only when something asks for
it.** `registerType: 'prompt'` decides what happens once a new version is
_found_ and does nothing about finding one; the browser checks on a full
page load, and a PWA on a phone is rarely loaded again — it is resumed
from the background for weeks. So a green deploy could sit undelivered
indefinitely with no banner and nothing visibly wrong, which is what was
behind every "it hasn't updated" in this project's history. `UpdatePrompt`
now calls `registration.update()` whenever the app becomes visible.
Resuming is the right moment: the check is a conditional request for one
small file, and it lands when the user has just come back rather than
mid-set.

**An installed iOS web app reports `best-effort`, and that is the
safest state the platform has.** Safari refuses
`navigator.storage.persist()` outright, so the state alone cannot
separate a tab from a Home Screen app — while iOS deletes an
unvisited site's script-writable storage after about a week and
exempts an installed app from exactly that. So the reading was amber
and the advice was "add the app to your home screen", on a device
where the app was already on the home screen. Advice nobody can act
on, beside a warning nobody can clear, is how a person learns to
ignore the one screen that reports durability.

`StorageStatus` carries `installed` beside the state for that reason,
from `display-mode: standalone` with `navigator.standalone` checked
first. The badge goes neutral rather than good — best-effort is
genuinely what it is — and the sentence names what can still take the
data instead of asking for an install that already happened.

**Home Screen storage is separate from Safari on iOS, which is the
trap worth knowing.** The same origin opened in the browser and
opened from the icon are two IndexedDB stores, so anything entered
before the shortcut existed is not in the installed copy and never
will be. Nothing in the app can merge them; **sync is the only route
across**, which makes Firebase the difference between an annoyance
and a silent loss on iOS specifically.

**iOS 16.4 gave a Home Screen web app Web Push, and the daily still
cannot ring.** The reason narrowed rather than went away: push needs
a server to send from, and scheduling a purely local notification is
available nowhere. The design stands — see the dailies note — but the
blanket claim that iOS gives a PWA no notifications at all is now
too strong.

**Form fields are 16px on coarse pointers, and it is a bug fix.** Mobile
Safari zooms the whole page when a focused input's font is under 16px,
and the viewport meta deliberately sets no `maximum-scale` — suppressing
the zoom that way disables pinch-zoom, which is an accessibility control
and not ours to remove. It does not zoom back out, so one tap on a search
box left the layout scrolled sideways with the heading clipped on one
edge and the navigation clipped on both. It reads as a broken app; the
cause is two pixels of font size.

**That rule lives outside `@layer` on purpose.** Unlayered CSS outranks
every layered rule, and the fields carry Tailwind's `text-sm` from the
utilities layer, which is emitted after `components` — so the same rule
written there loses and the zoom returns. It is not a specificity trick
awaiting a tidy-up; it is the only place it can sit and win.

**The geocoder is on the add form now, and the reason it was not is
worth keeping.** `usePlaceSearch` was complete from the start — debounced,
rate-limited, tested — and reachable from exactly one screen: the inbox,
where it _repairs_ a place saved without a point. So the ordinary path,
the one everybody actually takes (open the map, press Add, type a name),
had no geocoding at all and produced either a pin dropped wherever you
happened to be standing or an entry with no location to go and fix
somewhere else. **A capability reachable from one screen that nobody
starts on is, from the outside, a capability the app does not have** —
the same shape as a rule nothing can trip, and it took a report of "it
doesn't autofill like Google Maps would" to find it.

**Results are biased by `near`, and that is most of what makes it feel
like a map.** "The coffee place" near you and "the coffee place" in
another country are different answers and only one is ever wanted. The
map's own centre is passed in.

**A chosen result beats the GPS fix.** Both answer "where is this" and
only one was chosen deliberately; filing a searched-for restaurant at
your own front door because the device had a fix is the worse of the two
by a wide margin.

**Picking is optional, and must stay optional.** A place with no point is
a deliberate, supported entry — a name you mean to resolve later — so the
suggestions are an offer, not a gate, and a name the geocoder has never
heard of still adds. **The pick is dropped the moment the text changes**,
or "Blue Bottle" edited into "Blue Mountain" would file the second name
at the first one's coordinates.

**The atlas talks to OpenStreetMap, and only to OpenStreetMap.**
Tiles from `tile.openstreetmap.org`, and geocoding from Nominatim in the
inbox's search. Both are rate-limited services run on donations: Nominatim
allows one request a second and forbids bulk use, which is why the search
debounces and why nothing calls it in a loop. Anything else that wants the
network is a new third party and a new decision — this is one
relationship, not a precedent for others.

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

**One section is the whole day, and "Due elsewhere" is gone.** It went
through two reports. The first — _"the due section seems broad, since
dailies and stuff are also considered due"_ — got the name narrowed and
the Codex goals moved out. The second, once the section was empty most
mornings: _"I just see an empty due elsewhere now, that's not really
helpful, why not move everything to where you moved the Codex stuff."*

Right on both counts. A section rendering a heading and an empty state
sat against this screen's own rule — **silent when there is nothing to
say**, which the leads and digest cards already follow — and once the
Codex goals had moved there was no principle keeping the other three
out. The heading is **Today** and it answers one question: what does the
day ask of me, whatever record each row happens to be.

**Overdue and today are the day; soon is a fold.** A trip four days out
is not what today asks, and counting it would make _"N left today"_ say
something it does not mean — the rule that a count and the rows beneath
it are one claim. It folds rather than disappearing, because seeing a
deadline without opening the quest is the entire reason the agenda
exists.

**The dated rows link rather than tick, and that is left visible.** A
habit and a reading goal are answered where they are drawn; a deadline
is answered on the quest, a trip on the map, a person by seeing them. So
those rows are wholly a link and carry no control implying otherwise —
but they are still counted, because a deadline due today is outstanding
today wherever it is answered.

**The section heading is no longer `Dailies`, and the domain still is.**
`domain/dailies` keeps its name; this is a screen word, the same split
Quests keeps over `Project`. The habits are still the largest thing in
the section and still the only thing banded by part of day.

**Today reports what is due everywhere; the other screens own their
lists.** Splitting chores to Base and upkeep to Vitals left Today's
Dailies section meaning "recurring things that are not house chores and
are not body upkeep" — a residue rather than a category — and left the
screen whose whole job is _present tense_ unable to say what the day
actually asks for.

**A screen called Today does not list rows labelled "not today".** Own
dailies used to show in full, on the reasoning that Today is their only
home and therefore also where they are managed. The first half is true
and the second does not follow: a weekday habit sat in Saturday's list
under a "not today" caption, which is a screen arguing with itself, and
it is the same crowding that moved chores to Base — the things the day
asks for buried under the ones it does not.

They are still on the screen, because there is still nowhere else for
them, under an **Other days** heading below everything due. No "all →"
beside it, unlike House and Upkeep: those point at the screen that owns
them, and this _is_ that screen. The count was never wrong — `left`
has always filtered on `dueToday` — which is why this read as a display
quirk rather than as a bug for as long as it did.

**The week has four shapes worth one tap.** `WEEK_SHAPES` — weekdays,
weekends, weeknights, weekend nights. A cadence of "weekdays" was five
taps on a row of single letters, twice over if the evening picker was
meant too, and it is the most common shape a habit has. The letters
stay: a shortcut that replaced them would make anything irregular
impossible, and pressing one only fills them in, so what was chosen is
still visible and still editable.

The nights set the **part of day as well as the days**, which is the
entire difference between "weekdays" and "weeknights" — the same five
days and a claim about which end of them. A shortcut that set only the
days would be the weekdays button under a second name.

**Pressed state is computed from the selection, not remembered from the
tap**, so choosing the five days by hand lights "Weekdays" — the honest
reading of a shortcut. It compares the part too, including when the
shape does not name one: "Weekdays" means those days at any time, so it
must go out once the evening is chosen. Otherwise Weeknights lights two
buttons, and two pressed buttons describing one cadence is worse than
none.

Weeknights is Monday to Friday, so the four shapes are exact
complements. The other reading — a weeknight is the night _before_ a
working day, which makes Sunday one and Friday not — is defensible and
is a different habit, two taps away on the letters.

It aggregates now, **grouped by where each thing lives** rather than
mixed in, because a flat list is what buries the habits somebody chose
under the ones the house and the body simply require. The asymmetry is
deliberate and has a reason: own dailies show in full because Today is
their only home and therefore also where they are managed, while chores
and upkeep appear **only when due or done today**, since anything else
about them belongs on the screen that owns them. The count in the
header is across all three, because "3 left today" is a claim about the
day and not about one section.

**Four homes now, and the fourth is Training.** Carbs before a session,
protein after. They are habits in every respect — cadence, streak,
tick — and what makes them not _dailies_ is that they mean nothing on a
day you do not lift, so on Today they were noise five days out of
seven. Same argument that moved house work to Base and brushing to
Upkeep. They live on Train, appear on Today only when due under a
Training group, and pay `training.habit-kept` at the same fifteen
points every other kept habit is worth.

**The cadence is still weekdays, and that is a limitation rather than a
shortcut.** There is no training calendar to hang them on: the app
stores `daysPerWeek` — a _count_ — and a position in a sequence that
moves only when a session is finished or skipped. Nothing anywhere can
answer "was the 25th a training day", which is exactly what every
`Cadence` kind must answer from the date alone for a streak to be
walkable. A "training day" cadence is therefore not a missing feature,
it is a question the model cannot be asked. The lifter names the days
they lift and the empty state says why.

**Two guard tests caught this being added, which is what they are for.**
`base.test.ts` → "puts every record on exactly one side" failed because
it still only knew three predicates, and `sheet.test.ts` → "has a
counted or deliberately absent entry for every declared act" failed
because `tallyActs` had no line for the new act. That second one is the
valuable one: without it the act would have been declared, awarded on
screen, and counted nowhere.

**A group is a label; a home is a decision.** The report was "pretty
much all of my dailies fall under a certain category", naming
supplements and pet care. The tempting reading is two more
`RecordHome` members, and it is the wrong one: a home decides which
screen owns the record _and_ which area pays its XP, so one costs a
registry area, an act, a branch in `tallyActs`, a screen and a line in
the "exactly one side" test. Nothing about wanting to see supplements
together asks for any of that. `Daily.group` is a string.

Free text rather than a fixed set, because the categories are the
person's rather than the app's — one household has a dog and a
sourdough starter and another has neither. Matched case-insensitively
on the trimmed value, the rule the resume already uses for an employer
name, so `supplements` and `Supplements` are one group.

**Groups are ordered by their earliest habit, never alphabetically**,
and that is the load-bearing choice. The rows are already
chronological because a day is a routine; sorting the group names
would put Teeth above Supplements and have two orderings disagreeing
inside one list. The ungrouped run **last, with no heading** — a
heading over the leftovers is a category called "everything else" that
nobody chose. One unnamed group renders exactly the flat list it
replaced, so adding the capability changes nothing on a screen where
nothing is grouped.

`renameDaily` became **`relabelDaily`** and takes the group too. Both
are labels: the record means what it meant before and every day it was
kept is still a day it was kept. The cadence is still not there, for
the reason it never was — it decides _which days were expected_ and
re-reads every streak the habit ever had.

**A home and a group are one axis on the screen that shows both, and
they were two.** Reported: _"adding a daily to the house category on the
homepage does not group it with the other house items from base, instead
creating a separate house category."_ Exactly what happened. Today drew
its own habits through `byGroup` and then ran a second `DueElsewhere`
pass over House and Training, so a habit somebody labelled **House**
appeared under a House heading in the first pass while the chores sat
under a second House heading in the second — one name, two sections, and
nothing on screen to say why.

`homeOrGroup` is the fix and it is a **display** rule only: a row's
category is `HOME_GROUP_LABELS[belongsTo]` where it has a home and its
group otherwise. Nothing is re-filed. An own-area habit labelled House
is still own-area, still pays `dailies.completed`, and is still managed
on Today — which is the distinction this file draws everywhere, applied
in the one place it had been drawn twice. Reading a typed group as a
_home_ instead would be a string silently deciding which area pays,
which is the line that must not move.

**`byGroup` takes the rule rather than defaulting to one**, the way
`listProjects` takes a required `HomeFilter`, because the wrong answer
is silent in both directions: `homeOrGroup` on Base puts every chore
under one heading called House, and `groupOnly` on Today draws the two
House sections again. `groupOnly` is what Base, Train and Mind pass.

**The picker offers House, and that reverses a rule written here one
pass earlier.** It said House and Training must stay out of the group
chips, because a chip filing by _label_ under a name the app also uses
as a _decision_ is how somebody ends up with a house chore Base has
never heard of. That objection is still correct and the conclusion drawn
from it was wrong.

Reported next: _"with uncategorised dailies, I still can't move them
into the home section with all the other house tasks."_ True, and it is
the same defect as the two House headings arriving from the other side —
**the screen drew a heading the control that picks headings could not
choose.** The only route was an unlabelled icon on the row whose
accessible name said _Base_, which is the area's name and not the word
on the heading, so nothing connected the two.

The fix answers the original objection rather than ignoring it: the chip
does not set a label called House, it **moves the record** — `belongsTo`
— which is what House already means. `relabelDaily` takes the home for
that reason, in **one save** with the title and the group, because three
fields of one record sent as two writes lose one of them.

**Only House is offered as a destination.** It is the one home whose
records are routinely created in the wrong place, which is the whole
report. Training is not: those habits mean nothing on a day you do not
lift, they are created on the screen that knows which days those are,
and a chip here would be a way to make one by accident. A record already
filed to Training still shows its own chip, or the field would draw
nothing pressed under a Training heading — a control disagreeing with
the list it edits.

**Choosing a home clears the group.** `homeOrGroup` puts the home first,
so a group kept alongside one is a label nothing can display and nobody
can correct. The field is labelled **Section**, not Group, because that
is what it now picks and what the headings are called; `Daily.group` is
still `group` in the domain, the screen-word / type-word split this file
already documents for Quests over `Project`.

**_Tidying_ left `GROUP_SUGGESTIONS` in the same breath**, reported in
the same sentence: _"it seems redundant with tidying too."_ It is —
sweeping the kitchen is house work, House is a section, and offering
both invites one household's chores to be split across two headings
meaning the same thing. A group somebody already has called Tidying is
untouched and still offered, since names in use lead the row.

**`DueElsewhere` is gone and the "all →" links went with it.** They were
not dropped for tidiness: a category now appears once per part of the
day it has work in, so House with a morning chore and an evening one
would draw the link twice. `/base` and `/train` are both bottom-nav
tabs, so nothing became unreachable. What that merge buys is that
`left` and the rows beneath it are now built from **one** list — the
count and the rows cannot come apart, which two passes made possible and
which this file already records costing two attempts to get right.

**The day is banded by part, and the categories sit inside the bands.**
_"Group the dailies by morning, afternoon and evening, and then have the
subcategories there."_ `byPartOfDay` in `domain/dailies/groups.ts`,
`DayBands` in `features/today/DailyGroups.tsx`.

**Which axis is outer is the whole of that decision.** A day is read as
a sequence and a category is read as a kind of thing, so the sequence
has to be outermost or the screen answers "what sort of task is this"
before it answers "is this now" — and _now_ is the question a screen
called Today exists for.

A band per part that **has** habits, never one per part: an empty
Afternoon heading claims the afternoon asks something of you, which is
the opposite of what the later-today fold is for. The unbanded habits
come last under **Any time**, not a fourth clock position — an absent
`partOfDay` means the habit belongs to no point in the day rather than
to the end of it. A single band draws no heading at all, the rule one
unnamed group already follows.

**The current band is lit, not moved**, which is the rule the rows
themselves have followed since parts of day arrived: a list that sorts
itself twice a day moves the row you reach for by position.

**Upkeep is called Hygiene.** _"Upkeep doesn't seem like the correct
term, cause upkeep could relate to upkeeping anything — that one is more
hygiene stuff since it's brushing, showers, etc."_ Right, and the word
was a leftover from when this was a **home** covering the body in
general; as a group it has only ever meant brushing, flossing and
washing.

Renaming a label costs nothing the way renaming a home would. What it
costs is a **split**, which is the same defect as the two House
headings arriving by another route: rows stored as _Upkeep_ would sit
beside new ones as _Hygiene_. `fromStoredDaily` reads the old name as
the new one whatever a row's home is — a derivation, not a migration, so
a row converges the next time anything saves it, which a tick does.
Verified by ticking a legacy row and reading `group: 'Hygiene'` back off
IndexedDB.

**The price is stated because it inverts a rule held elsewhere:** nobody
can now have a group genuinely called Upkeep, for house maintenance say,
because the read path renames it. That is the app having an opinion
about somebody's label. It is taken once, deliberately, on the grounds
that every Upkeep group in existence came from this app's own suggestion
list or from the legacy home — and once real data has converged,
`LEGACY_HYGIENE_GROUP` can go. _Teeth_ left `GROUP_SUGGESTIONS` at the
same time, because it and Hygiene were then offering the same habits
under two names.

**A Codex goal carries a cadence, and it is the habits’ `Cadence`.**
"I only read/game on certain days" — without one a reading goal meant
_every_ day, so somebody reading on Tuesdays and Thursdays failed five
days a week. Measured on the same progress log: a Tues/Thurs book
holds a **3-day streak with the cadence and 0 without**, and an off day
stops showing as a gap on the history strip.

`cadenceCovers` was split out of `isExpectedOn` so the backlog asks the
_same_ question rather than reimplementing it — a second answer to "is
this expected today" is a bug with a delay on it. Both humane streak
rules come with it: a day it was not expected does not break the run,
and today does not break it until the day is over. The walk is bounded
rather than a `while`, because `days-of-week: []` is expected on
nothing and would spin forever looking for a day that never comes.

**The board counts what is _due_, not what is tracked.** "2 of 5" on a
Wednesday when three are Tuesday goals reads as being behind while
nothing is outstanding — the defect Today had when it listed habits
that were not due. Not-due goals are still _listed_, because logging on
a day you did not plan to read happens and a row that vanished would
read as lost.

**Today's agenda was the caller that never asked.** `goalCovers` says
in its own comment that it is "the one place the cadence is read, so
every caller — the streak, the board, the day strip — agrees about which
days count". `agendaFor` was a fourth caller and did not: it checked
only whether today's amount had been met, so a Tues/Thurs book was
listed as outstanding **every morning of the week**.

Found from the report _"the due section seems broad, since dailies and
stuff are also considered due"_ — which turned out to be half wording
and half true. A list of things genuinely due had reading goals in it
that were not due at all.

**A comment claiming every caller agrees is worth grepping**, which is
the second time that has paid this month: the digest's `void error`
claimed to be logged and was not. Both were sentences describing a
property nothing enforced.

**A Codex goal is drawn with the dailies now, in a group of its own.**
Asked for as the fix to the same report: _"why not just group 'em with
dailies, just separated."_ It is the right shape — a goal carries the
habits' own `Cadence`, is expected on named days, holds a streak, and is
answered by logging a bit of it. **A daily in every respect except the
record type**, which is exactly why it sat oddly among deadlines and
trips and made that heading claim everything.

`GoalRow` is exported and shared rather than copied: a second row is
where the Codex screen and Today would start disagreeing about what a
plus does. It gets one heading in the shape House and Hygiene already
use, and is **not banded by part of day** — a reading goal names no
time.

**It counts in "N left today", and a met goal folds with the rest.**
The count and the rows beneath it are one claim, which is the rule that
cost two attempts to find. Folded rather than dropped, for the reason
every fold here exists: the minus on that row is the only way back from
a mis-logged page.

**Only what is due today reaches Today; the Codex screen still shows the
rest.** `isDueToday` is the goal's own cadence answer. That split is the
same one the habits make, and the Codex keeps its not-due rows because
logging on a day you did not plan to read happens and a row that
vanished there would read as lost.

**What is left in the agenda is dated rather than cadenced** — a
deadline, a trip, somebody unseen for months. None of those recur, and
`AgendaItem.area` no longer has a `codex` member. Its tests went with it,
and the rule they were protecting did not: it is `getDailyGoalBoard` →
`isDueToday`, tested in `daily-goals.test.ts`, which is where it always
belonged — the agenda had been answering it a second time and badly.

`isPlausibleDailyGoal` validates the cadence now. It arrives from a
backup or another device and `cadenceCovers` reads `days.includes`, so
a `days` that is a string does not degrade — it throws, on a screen
somebody opened to read a book. Ranges are checked too:
`days-of-month: [0]` is expected on no day of any month and would read
as a goal that is simply never due.

**A daily is filed to one of three places, and `RecordHome` was written
to expect the third.** Today owns what you chose, Base owns the house,
and Vitals owns the body — brushing, flossing, washing your hair, filed
under `vitals` and shown as **Upkeep**. It is the Base argument applied
to the other set of chores nobody calls chores: mixed into Today they
crowd out the things somebody actually decided to do. `RECORD_HOMES`
drives `keepFor` and the "exactly one side" test, so a fourth area cannot
leave either passing vacuously — which is precisely what that test did
when the third was added and it still only knew about two.

**Vitals pays XP now, and that is the rule applied rather than bent.**
The note in `registry.ts` said this area measures and never pays, because
every candidate then fell on the wrong side of the act/outcome line: not
drinking is an outcome, and paying for a weigh-in turns a measurement
into a chore with a score. All of that is still true. **Brushing your
teeth is none of it** — it is a thing you did, an act in exactly the
sense a kept daily is one. What was true was that the area held nothing
that qualified; what was never true is that it was barred from holding
anything that does. Same fifteen points, and `tallyActs` splits by
`belongsTo` so no record pays two of them.

That also made `AREA_TITLES.vitals` reachable, where its comment
asserted it never could be — an area that pays nothing can never be the
one that has paid the most. The titles have since gone; the trap the
comment recorded has not, and it is why every "this can never happen"
in that file is written down rather than assumed.

**Preferences move as pasted text, because a file round trip was the
slow part.** The report: _"passing files back and forth is a slow
workflow, same with me seeding job board stuff and everything else when
you already have it."_ `domain/config/document.ts` and the
Configuration panel in Settings — copy out to the clipboard, paste back
in, no file in between.

**It is not the backup and must not become it.** A backup is the whole
database and carries a checksum because a large file can be truncated on
the way to disk. This is three preference blocks small enough to paste,
where a truncation fails to be JSON at all. Reusing the backup envelope
is the trap worth naming: `validateEnvelope` demands `exercises`,
`workouts` and `checkIns` arrays and `parseBackup` demands a verifying
checksum, so a document holding a job search and nothing else is not a
valid backup — and making it one would mean hand-computing a checksum
before a document could be written at all.

**It carries preferences, never records.** A room, a habit and a
campaign stage are things that happened or were decided; they have
screens and history. What is here is the settings whose entire value is
somebody having typed a long list once.

**An absent section is left alone, never cleared**, which is the rule
`recordFinance` already follows and the whole reason a document holding
one section is safe to paste. Verified by driving it: a document with a
job search and home wants and no digest left the digest's interests
exactly as they were.

**A section that is present and is not an object is refused rather than
parsed**, and this is the sharp edge. The three parsers are _total_ —
junk degrades to a default — and for a job search the default is
`EMPTY_JOB_SEARCH`. Passing junk through would be a wipe wearing a
settings change's clothes, which is exactly the destructive/
non-destructive split this file holds elsewhere. For anything it does
accept, the preview says what the section would _become_ in the app's
own words, so a section that genuinely parses to nothing can be seen
before it is taken. **Offered, never applied**, the stance
`ApplyEstimates` and the file import share.

**Boards may be written `greenhouse:stripe`.** `parseJobSearch` wants
`{ provider, token }` because that is what a stored search holds, and
nobody hand-writes that; the screen's own paste box already takes the
readable form, so `parseSources` is reused here. A list of strings, one
newline-separated string, or the stored object form all read — the last
so a copied document round-trips.

**The app is locked to an account list, and being precise about what
that buys is most of the value.** The ask: _"is there a way to lock
access to this app behind only my account?"_ — so `AuthGate` wraps the
whole shell and `decideAccess` checks an **allowlist**, not merely that
somebody is signed in. Signed-in-ness alone admits anybody with a Google
account, which is not what was asked for.

**It protects less than it looks like it does, and the parts it does not
protect were already covered.** The synced data was never exposed:
`firestore.rules` pins every document to one uid and has since sync was
built. The device's own IndexedDB is not protected by this and cannot be
— it belongs to whoever holds the device. And it is **not a lock on the
phone**: a session persists on purpose, so an unlocked device opens
straight through. What it buys is that the app stops being usable by
whoever finds the page, which is the demo posture the ask retires.

**It fails open on a missing account list**, which is a deliberate
inversion of the usual rule for a security control. A gate that failed
closed on an unset variable would brick the app with no way back in, and
there is nothing behind it that failing closed would protect. The
Settings screen states which of the two it is in — a lock nobody can see
is a lock nobody can trust, and "off" is a state somebody can arrive in
without meaning to.

**Refused is its own state, not a return to signed-out.** Sending the
wrong account back to a Sign in button is a loop: the browser hands
Google the session it already has and arrives straight back. So the
refusal screen carries its own sign-out — which it must, because the
gate wraps Settings too and that is where sign-out otherwise lives.

**Checking is its own state as well**, and that decides what every
launch feels like. A persisted session takes a moment to resolve, and
answering "signed out" in the meantime flashes a sign-in screen at
somebody already signed in, on every single launch.

**A build with no Firebase project cannot gate**, because there is no
sign-in to offer — a gate there is a locked door with no key. That is
exactly the local development build, and it must keep working.

**The uid is stated in two places and they can disagree.**
`VITE_ALLOWED_UIDS` and `firestore.rules` name the same account, the
rules file cannot be read from the bundle, and the bundle cannot be read
by Firestore. The symptom of a mismatch is an account that opens the app
and cannot sync.

**The repository went private for an afternoon and came back, and what
it cost is worth knowing before anybody tries it again.** GitHub Pages
does not serve a private repository on a free plan: the site was
unpublished the moment the repo went private, the Pages API answered
404, and `actions/configure-pages` failed the deploy. Verified by asking
the API to re-enable it — _"Your current plan does not support GitHub
Pages for this repository."_ No change to this code could fix it.

So the repository is public again and **the gate is what protects the
app**, which is the arrangement to keep in mind when reading anything
here about a demo. There is no demo any more: the deployed page is gated
by `VITE_ALLOWED_UIDS`, set as a repository variable. Nothing in the
repository is a secret — the Firebase config identifies a project and
authorises nothing, a uid names an account and authorises nothing, and
no personal data has ever been committed. **That last rule is the one to
keep holding**, and it is why the resume fixtures say Northwind.

**Clutter is a level, not a task, and that decides everything else about
it.** The report: _"another aspect of base maintenance is decluttering —
this is ongoing and should be represented by percent of each room and
overall clutter level."_ A house job finishes and closes; a chore recurs
and is done today or not. This is neither. It moves in both directions
over months, which is the shape of a **weigh-in** rather than of a task,
so a room carries a series of readings and everything on the screen is
derived from them. Nothing stores a "current" percentage — a stored
total is a total that can be wrong, and this app already knows what that
costs.

**It goes backwards, and that is the point of tracking it.** A room
cleared in March fills up again by August. A checklist, or a completion
percentage that never fell, would make the one thing worth knowing
invisible.

**It pays no XP, which is the call the weigh-in already got.** Saying a
room is 40% clear is a _measurement_, and paying for the number going up
would be paying for an outcome. The afternoon spent clearing the garage
already has somewhere to be paid — a house job on Base, with steps,
paying `base.action-closed`. The effort scores and the reading reports,
the split Finance and Vitals both run on.

**Unread rooms are left out of the average rather than counted as
zero.** An unmeasured room is not a room full of clutter, and counting it
as nothing would make _adding a room you have not looked at yet_ read as
the house getting worse. The change is averaged over the rooms that have
a _comparison_ for the same reason: a room read for the first time this
week has not held steady. `unread` is reported so the screen can say how
many were left out.

**Comparison starts from the earliest thing known about the window, and
the first version got this wrong in a way the suite could not see.** It
compared only against readings _before_ the window opened — so a garage
read at 90 on the 5th and 32 on the 31st reported **no change at all**
over the month, because there was no reading on the 1st. Useless in
exactly the case the feature exists for, and found by driving it.
`startOfWindow` now takes the reading in force when the window opened,
or failing that the first one taken inside it. Nothing is invented: both
candidates are readings somebody actually took, and what changed is
which counts as "where this started". Still nothing carried forward into
a gap and nothing interpolated.

**Last write wins per day**, like a weigh-in: two readings for one
Tuesday are two opinions about one fact, and the later one is a
correction rather than a second measurement. `recordClear` writes today
only — this is a judgement made by looking at the room, and you cannot
look at last Tuesday's kitchen.

**Five bands, because "62%" is precision nobody has.** The words are the
judgement and the number is there to make two months comparable. It is
**not a ladder** — there is no published standard for how cleared a room
should be, so this sits on the same footing as the weight phase and
deliberately not on that of a strength standard.

`DB_VERSION` went to 16 with a `rooms` store, and the collection
registered in all of the places a collection has to register. The
compiler and the guard tests found most of them, which is that machinery
working as intended.

**The lower days divided, and the customisation is gone.** Asked for as _"only do calf raises on deadlift day and only do kettlebell swings on squat day"_ and _"we probably do not need any of the customize workout stuff, lets gut it — I am trying to make this app and codebase cleaner and more focused."_

**`LOWER` split into `LOWER_SQUAT` and `LOWER_DEADLIFT`**, the way the upper body already had. The calves move to `ONCE` and sit on the deadlift day; the swings sit on the squat day. **Nothing in the week repeats now** — the note calling the calf raise the deliberate exception went with it.

**There is one split, and `daysPerWeek` is gone with the other three.** They were already inconsistent with the design: the two full-body splits put every muscle on every day, which reproduces exactly the repetition the pairing was built to remove, and the five-day week had a third upper day with no pairing of its own. Keeping them meant shipping three arrangements known to be worse than the default.

**`SYNCED_SETTING_KEYS` is down to one member.** Only `excludedExercises` still shapes a programme, which is why three test files had to stop using days-a-week as their vehicle for "a shared setting that travels".

**`reverseAccessoryBlocks` is deleted, and the reason is worth more than the code.** It alternated the accessory order between a region s two sessions so a fixed order did not spend the fresh part of every session on the same muscle — and it only ever did anything where the two days held the _same_ muscles. No region does any more. The guard could never be true again, which made it a live-looking condition over dead code. What replaced it is better: a muscle appears once a week on the day chosen for it, so "which session meets a fresh lifter" is answered by the pairing rather than by flipping a list every other week.

**A test learned that trailing muscles outrank priority order.** "Runs the isolation work in tier order" started failing on Friday because the trunk is trained directly now and `trailingLast` deliberately moves it past everything else. That rule always outranked the ordering; it only became visible once the trunk had work to move.

**The Zone 2 block left the programme, and the swings stayed.** Asked for
as _"let's drop the post workout cardio — I'd like to just merge that
with my dog walks and make em daily. A 30 minute dog walk covers my
cardio and doesn't need tracked in the train app."_

**It is the argument that removed the macros and the sleep row.** A walk
that happens anyway, every day, is not a thing the training screen needs
to schedule; a slot for it is a checkbox you tick for something you were
doing regardless, and the count it produces is a second copy of a fact
kept better elsewhere — in this case, in the dog.

**The swings stay because they are _programmed_.** Ten on the minute with
a 60 lb bell is a dose somebody decided on; a dog walk is a fact about
owning a dog. That is the line, and it is a better one than "hard against
easy": if the walk were prescribed at a pace and a duration nobody would
otherwise hold to, it would belong here too.

**The upper days now carry no conditioning at all**, which is the visible
consequence. `describeDay` reads a day off its finished slots, so nothing
claims otherwise.

**`incline-walk` stays in the catalogue with its plan**, unscheduled, and
that is not the silent-retirement trap the overhead press was. A
conditioning exercise is only ever reached by a split naming its slug —
`running` has sat there unscheduled all along — so the catalogue is the
menu a split picks from rather than a list of things the assembler can
find on its own.

**The cost to name: Stamina is now fed by the swings alone.**
`cardio.session-logged` fires on a completed session containing a
completed conditioning set, so it pays on the two lower days and on
nothing else. **The dog walk pays Discipline, not Stamina**, because it
is an ordinary daily — and wiring it to Stamina would mean a new
`RecordHome`, which is a registry area, an act, a branch in `tallyActs`
and a line in the "exactly one side" test. That is a decision to take
deliberately rather than a side effect of moving a walk, and it is worth
knowing the bar reads lower until somebody takes it.

**The overhead press is out of training, and `STRENGTH_LIFTS` is three
again.** Asked for as _"let's drop overhead press from training since
there's more compounds on that day already"_ — true, the second upper day
opens with dips and pull-ups.

**The second upper day now carries no competition lift at all**, which is
the visible consequence and is fine: three lifts at one session each
across four days leaves one day to the accessory work. `describeDay`
reads the day off its finished slots, so Thursday simply stops naming a
lift.

**The exercise was converted back to `intent: 'hypertrophy'`, not left
behind.** This file already names that trap in so many words — _a
strength-intent exercise no rotation names is scheduled by nothing at
all_, so leaving it would have retired the overhead press from the
catalogue without saying so. It is pickable front-delt work again, which
is where it started. It is not scheduled today because the front delts
are at zero sessions, and that is a setting rather than silent
unreachability.

**Two costs worth stating, because nothing on a screen says them.** The
side delts lose their only heavy work — the press was what paid them
besides three sets of lateral raises — and the front delts now receive
nothing at all from anywhere. Both are one setting away if they start
looking thin.

**Every call site was found by the compiler**, which is the
`Record<StrengthLift, …>` mechanism doing its job: the labels, the
default sessions, the slug map, the variations, the region map and six
test fixtures all failed the build until they were dealt with. The one
test whose _subject_ had gone — a block led by the overhead press —
was deleted rather than repointed, because the rule it covered is still
held by the bench-led case.

**Finance and Train finished it, and the fold meant something different
on each.** Every tab now reads the same way: a page header, then cards
that name themselves, with what is settled behind an eye.

**Finance has no outstanding-versus-done split** — every row is a reading
rather than a task — so the pattern went to the two things that actually
accumulate. **History shows twelve months and folds the rest.** A finance
record only grows, so the screen's longest part is the bit you scroll
past, and a year is the window that makes a trend readable without the
page becoming the archive. Nothing is taken away by hiding an old row,
because there is no control on one.

**`AboutYou` folds because it is a field you fill in once.** A birth year
does not change, and a permanently open form for it sat between the
month's entry and the history — the largest thing on the screen that
nothing ever asks you to do. **Open by default when there is no year
yet**, which is the one moment it is worth seeing: without it two of the
three ladders report nothing at all.

**Train lost a section rather than restyling it.** "Or train without a
program" was a heading over a single button, and the button already says
what it does — so the heading went entirely instead of becoming a
`CardHeading`. **Not every section becomes a card; some were only ever a
label on a control.**

**Settings keeps `Section`, deliberately.** The note on `CardHeading`
says a heading over a lit rule reads as a settings pane, which is why it
replaced `Section` on six screens — and is exactly right on the screen
that _is_ one.

**The Tech tree was the fifth, and it came with a complaint of its own:**
_"the long list of items isn't the best at the end."_ It ended in three
stacked sections — every open node, then everything decided against, then
everything already bought — so a tree used for a year finished on two
lists of things there is nothing left to do about. Owned and dropped fold
together behind the eye, dropped first, because something you may yet
change your mind about is worth meeting before a list of what is already
in the house.

The width half of that report is answered in `tree-layout.ts`; see
**branches stack down the page** above.

**The Map finished the sweep, and the four screens now read the same.**
Asked for as _"now the map page."_

**Places you have been fold behind the eye.** The list is a list of
somewhere to go, and a map used for a year is mostly somewhere you
already went — so what it opened on was the part with nothing left to do
about it. `archived` folds with `visited`, both being decisions already
taken.

**A favourite never folds, however often you have been.** That is what
the flag is for: somewhere you go back to is still somewhere to go. It is
the one place in this sweep where "done" is not simply a status —
verified by favouriting a place and then marking it visited, which leaves
it in the list.

**The fold suspends while a search or a kind is on**, the rule the Codex
version follows.

**"The world" lost Trips and the inbox prompt**, because its heading
carried four things at 375 and the _title_ was what gave way — wrapping
to "The / world". Trips went to the page header, which is the established
home for a related screen (Train carries Plan and History that way,
Quests carries Job search). The inbox prompt went down to Places as a
full-width link, which is where the pile it counts actually is: places
with no point yet are a fact about that list rather than about the fog.
Walk stayed, being the one control that acts on what is drawn under it.

**The Codex got the same treatment, and it is where the pattern paid for
itself.** Asked for as _"now do the same for the codex page."_

**Finished and dropped entries fold behind the eye.** The list defaulted
to every status, so a Codex with two hundred finished games opened on two
hundred rows you were not working through, with the thing you came for
somewhere below them.

**Only while the status filter says "all"**, which is the part worth
knowing. Picking _Completed_ from the dropdown is an explicit request for
exactly those, and folding them away at that point would be the screen
arguing with its own control. The fold is the default view's opinion, not
a rule about the data — and the eye disappears when a filter is on,
because there is then nothing behind it.

**The search box was 26 pixels wide, and this is the second time that
exact bug has shipped.** It shared a flex row with two selects whose
intrinsic width comes from their longest option — "Currently Using" and
"Recently Added" — so `flex-1` on the field got whatever was left. Not
clipped, not cramped: a box too narrow for one character. The quest add
form failed the same way and is written up above as _"three controls do
not fit on one row at 375"_.

**The lesson is that the rule only reached the screen it was found on.**
It was recorded as a fact about the quests form rather than as a
constraint about the layout, so nothing stopped it recurring and nothing
found it — it was found by **measuring**, which is what this file
already says to do instead of extrapolating. Search now has its own row
and the selects share the next at `flex-1` each: 343 and 168 · 168.

**The goals block keeps its empty state where Quests' "Suggested" is
silent**, and the difference is discoverability rather than taste. This
is the only place in the app that says daily goals exist, so a reader who
has never set one has no other route to finding out. It is one line
instead of a dashed panel — the treatment the empty quest slots got.

**Quests got the same treatment, and the differences are where the rule
had to bend.** Asked for as _"now let's do the same cleanup for the
quests page."_

**Finished quests fold behind the eye instead of getting a section of
their own.** A completed quest is a record rather than something to do,
and its card carries the only route to reopening it — so it folds rather
than being dropped, the call the done chores got on Base. The count moved
into the body with the rows it describes: as a `Section` description it
sat above the add form, which put "3 open" two controls away from the
three cards it was about.

**`CardHeading` also heads a run of cards, which Base did not need.**
`ActiveQuests` and every `ProjectCard` draw their own card, so a wrapper
here would be a card inside a card. The heading row is the same either
way, which is the point — two screens should not grow two ideas of what a
block title looks like.

**`Section` survives for the case it was written for, and an arc is
it.** Each campaign is titled by its `name` with its `aim` as the
description; both are the record's own and `CardHeading` deliberately
carries no description. **Only the arc's _empty state_ converted** —
that was a title, a description and an empty state saying one thing three
times.

**Suggested is silent when there is nothing to suggest**, and the guard
had to be `recommendation.data?.actionId` rather than `data !==
undefined`: the recommendation always resolves, and `NextAction` renders
its own "nothing to do next" card inside it. So the first version still
drew a heading over an empty state — the defect it was meant to remove,
surviving one layer down.

**An empty quest slot is one dashed line, not a card with a paragraph.**
Two slots each drew a full card naming the missing quest and telling you
to pick one from the board, which on an empty board made the two largest
things on screen the two that said nothing. The instruction went with the
card: "pick one from the board below" is only read by somebody who can
already see the board, and the cards down there carry the control that
does it.

**Base shows what is pending and folds the rest, and its sections became
cards.** Asked for as _"you're greeted with a long list of every base
related daily task… show only pending items like the home tab does"_ and
_"refactor its looks so it's cleaner like we did with the homepage."_

**The list was three lists pretending to be one.** Chores drew everything
due _or done_ in one block and everything else under a permanent "Not due
today" heading, so a fifteen-chore house rendered fifteen rows whatever
the day asked for — the same clutter Today was fixed for, arriving on the
screen that had not been. Outstanding is drawn; done and not-due sit
behind the eye in the card header, with an `N left today` line that
counts exactly what is on screen. **Folded, never filtered**: a ticked
row is the only route to undo and a not-due row the only route to
renaming or retiring one.

**`CardHeading` replaced four `Section`s**, and the argument is the
home screen's own: a heading over a lit rule over a description, four
times down one screen, is what a settings pane looks like, and each of
those headings named something the card beneath it already said.
`Section` is still right where a heading groups **several** cards; it
was wrong for one card with a title over it, which is what every use on
Base had become. `space-y-8` went to `space-y-4` with them — two rem
was holding apart blocks that had a heading each.

**The upgrade list folds the same way.** What is already in the house and
what was decided against are records rather than things to do; what you
open the card for is what you are saving for. The "Wanted" label went
with them — with the other two behind the eye, that list is the only one
on screen and a heading over it said nothing the card's own name did not.

**`ChoreRow` draws `DailyRow`'s box rather than a `Button`.** The same
record was rendering its tick as two different controls — a full-size
primary button on Base against a 36-pixel bordered box on Today — which
made a chore read as a heavier commitment on one screen than the other
and took the row to nearly twice the height. It is also the rule this
file already holds for `ActionRow`: an icon that changes between two
actions cannot also be the record of which state you are in.

**`EyeIcon` moved to `components/shared/`.** Two screens now reveal what
they are not asking for, and a second hand-drawn eye is where the two
would start disagreeing about which way the stroke goes.

**The page header stays, and that is deliberate.** Today has none because
it opens on a portrait, which says what the screen is without a word;
Base opens on a list of chores, and a list needs naming. The note on
`PageHeader` says not to extend that exception.

**Base is an area that files records rather than storing them.**
`domain/base/base.ts`. A house job is a `Project`, a chore is a `Daily`,
a house upgrade is an `Upgrade` — the app already knows all three shapes,
and a second implementation of "a thing with steps" would be two places
for a bug about steps to live. What Base changes is _where they appear_.

House work has a different rhythm from a quest log: it arrives when
something breaks rather than when you choose it, it is mostly the same
errand each time — find the right person, get them to come — and it never
finishes. Mixed into the quest list it crowds out what somebody actually
chose.

Membership is one optional field, `belongsTo`, and **absent means the
record's own area** — right for every row written before Base existed.
`isBase` and `isOwnArea` are both named, because a screen listing one of
these types has to pick a side and the failure is silent in exactly one
direction: forget to exclude Base and a house job shows in the quest log
_and_ on Base, reading as a duplicate rather than a bug.

**The record is shared with the tech tree; the screens are not.** That
split is the answer to "are these too tightly coupled", and each half has
a reason.

Shared, and it should stay shared: **one wallet** — a dishwasher and a
barbell come out of the same money — **one set of gates**, because two
implementations of money-and-a-prerequisite are two places for the cycle
bug, and **one spender**, because the model allows exactly one area that
spends rather than measures (`registry.test.ts` → "has exactly one tree").
Base having its own tree would be a second spender and is not a thing to
build.

Not shared, and this was wrong for a commit: **creating.** Adding a
dishwasher meant opening a page about barbells, typing it there, and
coming back to move it — the same friction removed from chores an hour
earlier, left in place here on the reasoning that "a second editor would
be a second place for the gate rules to be got wrong". That argument is
true of _editing_ prerequisites and priority and false of typing a name:
`NewUpgrade` requires only a title, and the tree's own add form is one
text box. Base creates with a title and a rough cost; the tree still owns
editing.

**There are two errands, and for a long time only one had a template.**
The report: _"there are also some base projects that I will handle
myself rather than hiring someone."_ Every job opened with
`HIRED_JOB_STEPS` — find the right person, get a quote, book the
appointment — and on a job you do yourself **all three are wrong**:
there is nobody to find, nothing to quote, no appointment. So the shape
had to be un-ticked three times and typed by hand, which is exactly the
friction the template was added to remove, reappearing for half the
jobs. `DIY_JOB_STEPS` is the parallel: work out what it needs, get the
materials, do the work.

**The approach is chosen before the steps are shown.** The two lists
share no step, so a form that offered one and asked you to un-tick your
way to the other would be arguing with itself. Switching re-ticks the
new list rather than keeping the old selection — carrying it across
would leave every box empty and open the job with nothing.

**Deliberately not stored on the record.** A project already carries its
steps, and "Find the right person" against "Work out what it needs" says
which errand this is more plainly than a field would. A stored approach
would be a second answer to a question the actions already answer, and
the rule here is that a field needs something that reads it — nothing
would.

**Both openings are three steps, and that is load-bearing rather than
tidy.** Every closed step pays `base.action-closed`, so an opening with
four would quietly make one approach worth more XP than the other.
Doing it yourself is a decision about the afternoon, not a harder
version of the same act; difficulty is recorded and does not scale the
points anywhere else here either.

**A house job is created on Base, and opens with the errand it usually
is.** Adding one meant going to the Quests page, typing it among the
things you chose to do, and coming back to move it — the same round
trip already removed from chores and from upgrades, and left in place
here. Third instance of one shape, reported by the person using it.

`NewProject` takes `belongsTo` and `steps`, so the job is _born_ filed
and complete. The steps are written in the same save rather than by
three `addAction` calls after it: three sequential writes is three
chances to leave a half-built job behind, which is what `saveAndSettle`
exists to avoid.

`HOUSE_JOB_STEPS` — find the right person, get a quote, book the
appointment. **This module described that errand in prose from the day
it was written and the empty state printed it on screen, and neither
did anything with it**: every job arrived with no steps and the shape
had to be retyped from memory off a sentence you were no longer looking
at. Knowing a pattern and still making somebody type it is worse than
not knowing it.

Offered, not applied: the three are checkboxes, ticked, and any can be
turned off — a boiler service the landlord books skips the first two.
Same stance as `ApplyEstimates`, for the same reason.

**`recommendation` takes a required `HomeFilter` now, and finding out
why is the useful part.** It read `projects.all()` and scored across
every home, so the Quests page suggested a leaking tap as the next
thing to work on — "highest priority active quest" — on the one screen
Base exists to keep house work off. It hid because the board beside it
filters correctly, so the job was absent from the list and present in
the panel above it, which reads as a quirk rather than as the same bug
twice. Making the parameter required rather than defaulted is the rule
`listProjects` already followed, and the compiler found the two call
sites immediately.

**Base passes a budget of `0` and shows no affordability.** Deliberate —
the tech tree owns the budget control, and duplicating it would be two
places to set one number — but worth stating plainly rather than
implying both screens reason about money. They do not; one number is
stored, one screen applies it.

**There were three shelves and there are two: `gear` is gone.** Asked
for directly: _"I don't really have anything in gear that I want right
now and don't foresee typing progress to that — let's get rid of it."_ A
shelf nobody files to is a screen, a route, a wishlist and two sets of
labels earning nothing. The split it existed for — you against your
tools — was never the expensive one; `base` against everything else is,
and that is the one the paragraph below was actually written about.

**Nothing is orphaned, by the rule `shelfOf` already followed.** A
stored `gear` reads as `tech`, so a pair of boots filed there before this
appears in the tech tree rather than matching no shelf and being drawn
by no screen — the silent loss that function exists to prevent. A
derivation, not a migration: the record normalises the next time
anything saves it. The comparison is widened to `string`, because the
value is no longer in the field's own union and the record on disk can
still say it.

**`/gear` is a redirect, not a deletion**, the rule `/next` and
`/character` follow: a PWA shortcut is registered with the operating
system at install time, so an installed copy goes on asking for the old
path. It lands on the tech tree, which is where the records went.

**The wishlist went with the shelf, and the portrait did not.**
`wantedFrom` listed open upgrades on the gear shelf — deliberately that
shelf only, because wanted _tech_ already has a screen doing it better
with gates, prerequisites and a budget. With no shelf it read from
nothing. The **equipped** list is untouched and never depended on it: it
asks `isOwned` and `isOwnArea`, so a bought phone and a bought pair of
boots both still show in the portrait.

**The hero card carries no links now.** Asked for in the same breath —
_"maybe move tech tree out of the initial hero card."_ It is a
**portrait**: who you are and what you are carrying. Two navigation
buttons at the bottom made the first thing on the screen half a menu.
Both screens are one tap away in _Areas_, which is the list that exists
for exactly that and repeats none of the numbers above it.

**Three shelves, because "is this the house or not" was answering two
questions at once.** The report: _"base upgrades should be separate from
the tech tree — I put a MacBook and a monitor on base upgrades but those
are tech, while a desk and a couch are base"_, and with it a third
shelf: _"gear/cosmetics to track apparel, shoes and accessories."_

`domain/upgrades/shelf.ts`. The question a shelf answers is **what does
this upgrade upgrade** — `base` the place you live, `tech` the tools you
work and play with, `gear` you. The app already made the first cut and
made it in one place, so a pair of boots and a graphics card shared a
screen called Tech tree; the split reads as overdue rather than as new.

**Shelves, not areas.** The model allows exactly one area that _spends_
(`registry.test.ts` → "has exactly one tree") and three screens showing
one record type does not make three spenders — the same reason Base has
`hasTree: false`. One record, one wallet, one set of gates.

**Absent means what it always meant.** `shelfOf` reads a stored record
with no shelf as `base` if it was filed to Base and `tech` otherwise,
which is exactly the two-way split that shipped. Nothing migrates,
nothing moves on its own, and the gear shelf starts empty because nobody
has put anything on it. Verified by driving it against records written
before shelves existed.

**`belongsTo` and `shelf` are two answers about one record, kept in step
by having one writer.** `belongsTo` stays the _area_ answer because
`baseContents`, `keepFor` and the "exactly one side" test all read it;
`shelf` is the finer answer only upgrades have. `moveUpgradeToShelf`
sets both in a single save — the `reshapeStage` lesson — and
`addUpgrade` derives the area from the shelf so the two cannot be
_created_ disagreeing. `shelf.test.ts` holds the invariant that
`shelfOf(u) === 'base'` exactly when `isBase(u)`.

**Gates are global; ranking is per shelf.** `shelfTree` ranks the whole
set and narrows afterwards, because a prerequisite may sit on another
shelf — "the desk before the monitor arm" is a real dependency that
crosses them — and filtering first would make a cross-shelf parent read
as missing. What is per shelf is the _order_, so a graphics card cannot
disturb the priority of a pair of boots.

**The Tech tree and Gear screens are one component.** `ShelfPage` takes
a shelf; `/upgrades` and `/gear` are two-line wrappers. Same record,
same gates, same wallet — a second copy of that file is where a gate bug
would outlive its fix. `/upgrades` keeps its path under a label that no
longer covers what it used to, which is the standing rule that routes
outlive labels.

**`apparel` and `accessories` joined `UPGRADE_CATEGORIES`**, because the
gear shelf had nowhere to put what it is for: a pair of boots was
`lifestyle` or `other`. These are also the avatar's slots, so the
portrait could not show them either.

**The portrait still counts both non-house shelves, deliberately.**
`gearFrom` reads `isOwnArea`, so a phone counts as gear alongside a
belt. Narrowing it to the gear shelf would be more precise about the
word and worse on the screen — somebody whose purchases are all tech
would have an empty portrait to make a label read better.

**Cancelled had nowhere honest to be, in two different wrong ways.**
The tech tree filtered its list on `status !== 'purchased'`, so a
dropped upgrade sat among the live ones — and if it was cheap enough it
appeared under _what you can get today_, which is the screen
recommending something you had decided against. Base then went the other
way when its list was split: cancelled matched neither `isOpen` nor
`isOwned` and rendered nowhere at all, which is worse, because the only
control that can un-cancel one lives on its row.

Both screens now end with a short **Dropped** list. `isOpen` is the
filter for the live tree, and `dropped` is its counterpart, with a test
that the three lists account for every upgrade between them.

**The tech tree says what the whole list comes to, against the budget it
already holds.** Two stated numbers subtracted — costs you typed and a
budget you typed — so the shortfall is arithmetic rather than advice.
The unpriced rows are named and the sentence says **"so this is a floor
rather than a total"**, because a figure that folded them in as free
would be understated in the direction that matters.

**The house list is split into what you are saving for and what is
already here.** It was flat — everything on the shelf in one column with
a Wanted or Owned chip to tell them apart — which is fine at three rows
and stops being fine at fifteen. The two answer different questions, and
a badge is a poor substitute for a heading when the second is what you
opened the screen to read.

**The cost replaced the badge on the row.** Under a heading that says
Wanted, a chip saying "Wanted" is noise, and the price is the thing you
want beside a name you are saving for. Silent when there is no estimate
rather than showing a nought.

**The total names its unpriced rows rather than folding them in as
zero**, which is why `wishlistTotal` is a type and not a `reduce` at
the call site. A couch with no estimate is not a free couch, and a total
that pretended otherwise would be understated **in the direction that
matters** — you would be saving towards a figure the list cannot
support. It reads "570.00 across 2 · 1 unpriced".

Cancelled is in neither list. Something decided against is not on a
wishlist, and it is not in the house either.

**Base files upgrades; the tech tree edits them.** `moveUpgradeHome`
was the last of the three move functions with no caller, which is why
that panel could only ever be empty. The row on Base is deliberately
read-only apart from the way back: an upgrade carries a price, a priority
and a prerequisite, and a second editor for those would be a second place
for the gate rules to be got wrong.

The upgrade hooks did **not** have the invalidation bug the daily ones
did — every mutation invalidates the whole `UPGRADES` prefix and
`useUpgradeTree` carries `home` in its key, so one call reloads both
lists and neither can be left showing a row that has moved. Worth
knowing which of the two shapes to copy.

**A chore is created on Base, and for three commits it could not be
created at all.** `moveDailyHome` and `moveUpgradeHome` were written the
day Base was and **nothing ever called either of them** — so the empty
state saying "add one from Today" was advice that could not be followed:
Today made a daily in its own area and no control existed to move it.
That is worse than a missing button, because a missing button is visible;
this was a screen giving instructions the app could not carry out.

`addDaily` takes a `home` now and `AddDaily` is shared by both screens
rather than copied — a chore and a daily are the same record on the same
three cadences, and a second copy of that form is where a cadence bug
would outlive its fix. The move works both ways, because the common case
is a habit added on Today by somebody who only afterwards noticed it was
house work.

**A mutation must invalidate every list its record can appear on.** These
hooks invalidated `['today']` and `['character']` and not `['base']`, so
the first working "add a chore" wrote the row and left the Base screen
saying "No chores yet" — the record in the database and the list that
should show it never told. A daily lives in one of two places and these
hooks serve both.

**Every list that can return both takes a `HomeFilter`, with no default.**
A default would be an opinion the call site did not state. Making it
required turned the compiler into the thing that finds the missed call
sites, which it did immediately for both existing ones.

**Each record pays exactly one area.** `tallyActs` splits by `belongsTo`
before counting, so a Base chore pays `base.chore-kept` and not
`dailies.completed`. Rule three is that nothing is counted twice, and this
is the most direct way there was to break it. `measure.ts` splits the same
way for the monthly rating.

**Base has `hasTree: false`, and that is deliberate.** It shows house
upgrades and the tech tree shows the rest, but that is a question of which
screen a row appears on — a dishwasher and a barbell are the same record
with the same gates. The model's claim is that exactly one area _spends_
rather than measures, and splitting a tree across two screens does not
make a second spender. `registry.test.ts` → "has exactly one tree" caught
this the first time it was written the other way.

**Moving is a move, not a re-create.** `moveProjectHome` and friends
change one field. The common case is a quest log that has quietly filled
with house work, and the leaking tap on it has a month of steps and
history that retyping would throw away. XP already earned stays where it
was paid; the record simply stops paying its old area from the day it
moves.

**The self-rated condition is gone, and it was never wired to a
session.** Five factors on a poor/ok/good scale — sleep, nutrition,
hydration, stress, motivation — fed `readinessScore`, which fed
`sessionAdjustmentFor`, which returned a set multiplier that **nothing
ever called except its own test**. The same shape as `proposeLandmarks`
before it, and the same removal. Every claim this file used to make
about a bad night trimming the session was false of the shipped app.

It was also the wrong shape twice over. Sleep, nutrition and hydration
are quantities, and a quantity rated `ok` has been thrown away before
it was written down — a pool with a unit counts them properly, which is
what water and caffeine already do. Stress and motivation are a mood,
and a mood deciding how much you lift is a second autoregulation
competing with the one that works: **RTS already answers this set by
set**, because reps at an RPE move the load on a bad day without
anybody rating the day first.

**The rule it used to illustrate has not gone anywhere.** "Two readouts
of different kinds are never averaged into one" was written about the
charges and the condition bar; it is now why the limits are a separate
card from the weight trend rather than a second bar on the same one.

**The `conditions` store still exists and is written by nothing.**
Removing it would mean editing migration step 10, which is the one
thing `database.ts` must never do — a device that ran that step keeps
the store, one that has not would never create it, and the two schemas
diverge with nothing able to tell them apart. The rows are also a true
record of days somebody rated, which is the argument that retires a
habit rather than deleting it. It is typed locally in `database.ts` as
`RetiredDayCondition`, because the domain no longer has an opinion
about the shape.

Gone with it: `domain/vitals/condition.ts`, `ConditionRepository`,
`recordCondition`, the backup collection, the sync collection, and
`'conditions'` from `TOMBSTONED_COLLECTIONS`. A tombstone already
written under that name still arrives from another device and is
simply not matched, which is correct — there is no repository left for
it to purge from. `ReadinessFactors` stays, because
`PreWorkoutCheckIn` holds one and the check-in is its own separate
unwired feature.

**A pool refills on a rolling window or at a calendar boundary, and
people genuinely hold both.** `ChargeCycle` in `domain/vitals/charges.ts`.
Coffee is the case the rolling window was built for: two at a time, and
stating it in hours is what stops midnight handing you a third. Beer is
the case that made hours read as nonsense — four a week, which nobody
computes as "one back every forty-two hours". The report was "beers
recharge on the weekly so hours don't make a lot of sense", and it was
right.

**A calendar reset does not weaken the merge rule below — it satisfies
it.** The constraint is that no refill _time_ may be stored, and "how
many spends since Monday" is a pure function of the timestamps and the
clock, exactly like a daily's cadence being a property of the date alone.
Both shapes go through one cutoff and share everything after it.

**The week starts on Monday, and here that is not a style choice.** A
weekly drink allowance has to hold Friday, Saturday and Sunday together;
a Sunday-start week splits the weekend across two allowances, so a
Saturday beer and a Sunday beer land in different weeks.

**Nothing migrates old pools.** A stored `regenHours` is already a
complete, correct statement of a rolling window, so `cycleOf` is the one
place that reads both shapes and every caller goes through it. Rewriting
records would be churn that risks a merge for no gain.

**"+1" and "resets" are different claims.** A rolling pool returns one
charge; a calendar pool returns all of them. Saying "+1 in 3d" under a
weekly allowance with three spent would have somebody expecting one drink
on Monday when they have four.

**One row component, on both screens, and the Vitals page could not
log anything until there was one.** `features/vitals/PoolRow.tsx`. The
row on the management screen was a badge, a pencil and a bin — a reading
with no button beside it — so the section that exists to create and edit
pools was the one place a pool could not be _used_. Reaching for the plus
on a limit found nothing there, which is the same shape as every other
capability in this file that nothing could reach, arriving from the other
direction: the action existed and the screen had no control for it.

Two sets of buttons is how two screens end up disagreeing about what a
spend does, so there is one set.

**The rule decides the row's shape, not a flag naming a screen.** With a
`rule` — the limit written out, "3 a day, on 2 days a week" — the row
stacks into four bands: name and figure, gauge, detail, controls.
Without one it stays a single line. That is not a stylistic pairing:
three buttons and a row of pips leave about two hundred pixels for the
words, so the rule wrapped four times in a monospaced face while the
buttons sat in open space — and stacking it _unconditionally_ took
Today's card from a glance to a full screen and pushed the dailies below
the fold. The screen that states the rule is the screen being worked on;
Today is scanned. A measured pool stacks either way, because a bar and a
row of quick amounts have never fitted on a line.

**The monospaced face is for the figure, never the sentence.** It was on
the whole detail line, which made a clause about days of the week both
wider and harder to read for the sake of two numerals inside it.

**The pips are `aria-hidden`, so the count has to be in text.** They are
a picture of a number and not the number. A row showing "1 a day" in
place of "0 of 1" left a screen reader the limit with no idea where you
stood against it — which is what happened the first time the rule was
added, because it _replaced_ the state rather than joining it.

**Retiring lives in the editor, not on the row.** It is the one thing you
do to a pool once, and a bin sitting permanently beside a plus pressed
daily is a mis-tap waiting to happen — the more so once the row carries
buttons meant to be pressed.

**The add form folds away.** It stood open at the foot of the section: a
name box, a direction toggle, a unit field, quick amounts, a size, a
period and a day limit, permanently on a screen whose job the rest of the
time is to show four rows and let you press plus. The unit field was the
giveaway — a box asking what you measure kush in, under a list of pools
that already know. A form you open is also a form you finish; one left
open has no moment where it is submitted, so it reads as furniture.

**Editing a pool had no screen for three commits.** `editVice` existed
from the day pools did and nothing called it — the third time in this app
a working capability was invisible because nothing reached it. It became
load-bearing the moment cycles arrived: without it the only way to put an
existing beer pool on a weekly allowance was to retire it and start
again, discarding every spend it had recorded.

**A charge can carry an amount, and the amount lives inside the entry
string.** An entry is `2026-08-30T15:45:34.045Z` for one, or
`…Z#95` for ninety-five of whatever the pool measures. That is not a
trick awaiting an object array: **the merge is a union over strings**, so
two devices logging the same drink produce the same entry and it
collapses, while two different drinks stay two. The amount is part of
what happened — "95mg at 08:00" is one event — so putting it in the
identity is correct, and an array of objects would need a merge rule
written from scratch to say the same thing. A bare timestamp reads as
one, so nothing on a device needed migrating.

**A pool can limit the days as well as the amount, and neither number
can stand in for the other.** `daysLimit` in `domain/vitals/charges.ts`.
"Four a week" permits four on one night; "three a day" permits
twenty-one. Moderating drink is usually both at once — a few on a couple
of nights — and saying it takes two numbers because it is two decisions.
The two run on independent periods: an amount per day with days per week
is the common pairing, and an amount per week on at most two days works
unchanged.

**A day limit is a count _or_ named days, because those are two rules.**
`DaysLimit` in `domain/vitals/charges.ts`. "At most two days a week"
leaves the choice to the day it arrives on; "Friday and Saturday" is
decided once, in advance, and a count cannot express it — any two days
permits Monday and Tuesday. Spelled `days-of-week` and Sunday-indexed to
match `Cadence`, because `Date.getDay()` is what reads both.

**`openToday` is the one question both shapes answer**, and it is what
`available` folds against. A count is open while days remain or the day
has already started; named days are open on the named days and shut on
the others however few have been used. The card asked
`used >= allowed` before this — the _count_ rule — so a weekend-only pool
on a Tuesday read as fine while being shut, with none of its days used.

**An empty day picker is undecided, not "shut every day".**
`saneDaysLimit` returns `undefined` for it, because a limit that can
never be satisfied is the worst of the states it could be in.

**`todayCounts` is the load-bearing part.** A day already started does
not cost a second one, so a pool with both days spent is still open on
one of those days and shut on any other. Without it the third drink on a
Friday you had already begun would read as breaking the limit, which is
the kind of wrongness that makes somebody stop logging.

**The stricter constraint wins in `available`**, because "can I have one"
is answered by both. Out of days on a fresh day reports nothing available
even when that day's own amount is untouched — and **spending is still
never refused**, so logging it anyway records the day overrun as `3 of 2
days used` rather than hiding it.

**Distinct days, not entries.** Three drinks on one Friday is one
drinking day, which is the entire reason this is counted separately from
the amount.

**The pools have their own screen, and it is not Vitals.**
`features/limits/LimitsPage.tsx`, at `/limits`. Vitals measures the
body — what the scale says, what phase you are in, how the day felt,
what upkeep was kept — and a pool is none of that. It is a rule you set
and then spend against, closer to a quest than to a weigh-in: nothing in
it is a reading taken _of_ you. Sharing one screen also made that screen
the longest in the app and gave it a heading covering five unrelated
things.

Today carries a card for each, because Today is where the spending
happens and this is where the deciding does — the same line Settings and
the tech tree sit on relative to You. **A link rather than a ninth tab**,
which was measured rather than argued: every nav cell clears 44px, so
nine need 396 and a 375-pixel phone has 375.

The domain did not move and should not. `domain/vitals/charges.ts`,
`ViceRepository`, the `vices` store and the sync field all stay where
they are — those are addresses, and this is the same screen-word /
type-word split the file already documents for Quests over `Project`
and Codex over `backlog`.

**Its sections are "Staying under" and "Reaching for"**, not "Limits"
and "Targets": the page is already called Limits, and a section under it
repeating the word says nothing. Those are also the words the add form's
own direction toggle uses, so the heading and the control that produces
it agree.

**Limits and targets get their own sections, because a heading that has
to say "or the opposite" is covering two things.** One list read
"A limit to stay under or a target to reach", which is what a description
becomes when water is filed among the things being rationed. They are
read for different questions — what is left, versus how far there is to
go — so they are separate on the Vitals screen and grouped on Today's
card, the same way the dailies are grouped by home.

On the card the group heading appears **only when both kinds are
present**: one group alone is not ambiguous about which it is, and a
label on an unambiguous list is noise.

**Direction and unit are on the form now.** They were reachable only
through a _suggestion_, so anything made by hand was a counting limit
whatever it was for — water existed as a target only because a preset
row said so. Same defect as the geocoder and `moveDailyHome`: a
capability the data model had and no screen could reach.

**`Vice` is now the wrong name for the type and is staying.** It holds
water. The store key, the branded id and the sync payload field all say
`vices`, and those are **addresses rather than labels** — renaming one
opens a fresh empty store beside the old rather than migrating anything.
The screens say Limits and Targets, which is the same split this file
already documents for Quests over `Project` and Codex over `backlog`.

**A pool says where it stands in one word, and the thing that seemed to
break the metaphor is what makes it work.** The ask: _"I want limits to
be more gamified — buffs, rechargeable potions or something. But one of
them is literally the act of going out, so I'm not sure how to reconcile
that."_

Going out is not a limit, it is a **target**, and `direction` has
carried that since water was added. So both halves already exist: a
limit is a flask you are draining and would rather not empty, a target
is one you are filling and want to. `poolStanding` names the state in
the vocabulary each direction deserves — Untouched / Holding / Spent /
Over against Not yet / Part way / Reached.

**No new quantity, which is what keeps this honest.** Every state is
read off a `ChargeReading` already on the screen as a number; this only
says what that number means at a glance. It is a re-presentation, the
same footing `describeClear` sits on, and not a fourth currency — a word
that can be wrong is worse than a number that is plain, which is why the
number stays on the row beside the word. The avatar's calling was the
other example here and is gone, for a related reason: its word had no
number beside it.

**A target is never Over, however much is logged.** Reporting a fourth
glass of water as exceeding something would be scolding somebody for
drinking enough, which is exactly why `over` is a limit's word. Driven:
a target logged past its capacity still reads Reached.

**Spent is neutral and only Over is warned about.** Reaching an
allowance you set for yourself is the plan working, not a failure. A
tone that treated the two the same would make the one day worth
noticing look like every other day.

The add form's placeholder follows the direction now. One form serves
both and it went on asking _"what are you limiting?"_ under a Reach
button — the confusion this distinction exists to prevent, printed on
the control that makes it.

**A pool is a limit or a target, and only a limit can be exceeded.**
Caffeine is spent down and going past 400mg is worth seeing; water is
filled up, and reporting "500 over" for a fourth glass would be scolding
somebody for drinking enough. The arithmetic is identical and only the
sentiment differs, which is why it is a flag on one mechanism rather than
two mechanisms. Absent means limit — every pool written before this was
one.

**Name the substance, not the vessel.** A Coffee pool counting cups sat
beside a Caffeine pool counting milligrams, and the cups measured the
wrong thing: a cold brew and an espresso are one coffee each and roughly
three times apart in the quantity anybody means to keep down. Two pools
for one substance is two numbers to keep in step, one of which is not the
answer. Coffee is gone from the suggestions and lives on as a _preset_ —
which is the one place a vessel belongs, because there it is a number
rather than a name.

Beer went the same way and became **Alcohol, counted in standard
drinks**. It stays a count rather than gaining a unit: four is small
enough to read as pips, and a standard drink already is the unit.

**Converting a count pool to a measured one cannot be done from the
history.** Coffee-counts do not become caffeine-milligrams, because
nothing recorded whether each cup was an espresso or a cold brew, and
inventing a size for every past entry would be fabricating the record.
Retiring the old pool and starting the new one is the honest move — the
old one keeps what it truly held.

**A measured pool must be loggable without presets, and for three
commits it was not.** `MeasuredPool` offered the preset buttons and
nothing else, so a pool that gained a unit any way other than arriving
with one — which is every pool edited into being measured — drew a bar
and gave no way to fill it.

The answer was a typed amount beside the presets, and that is **gone
again**: a box you type into is the largest, loudest control on a row
whose job is to be pressed once, and a number is a thing you have to
compose rather than choose — on a card meant to be used mid-conversation
holding a drink. A pool with no quick amounts gets **a bare plus that
logs one unit** instead, which covers the same gap and is what a pool of
hits wanted anyway.

What that costs is real: an amount with no chip for it now needs a chip
made first. That is one trip to the editor against a text field on every
row forever, and the chips get better with use — the list ends up being
what you actually drink.

**An empty amount box means one, and the plus was doing nothing at
all.** `Number('')` is 0, so the submit fell through its `amount <= 0`
guard and returned — and on a measured pool with no quick amounts, that
plus is the only control on the row. A button that looks pressable, is
not disabled, and has no effect is the worst of the three states it can
be in: a disabled one says why, and a working one works.

One _unit_ in the pool's own terms — one hit, one millilitre, one
milligram. It is the least surprising reading of a plus, it makes a
preset-less pool tappable at all, and every spend is one tap from undo.

**The control band is laid out by kind: logging left, reversing
right.** A preset, the amount field, its plus and undo shared one
wrapping flex row, so "Pre-workout", "mg", "+" and a minus came out as
four interchangeable chips — a shortcut, a text field and two different
reversals, all looking like the same thing. The quick amounts get a line
of their own; the field and its plus sit below them; undo and the pencil
are pushed to the right, because neither is more of what a plus is.

**The unit is a label beside the field, not the placeholder inside it.**
As a placeholder it made an empty box read as a chip saying "mg", which
is most of why the field did not look like a field. Moved out, it names
what the number is, and the placeholder can say the thing worth saying
instead: a dimmed "1", which is exactly what an empty box logs.

**Undo does not wear a minus on a measured pool.** A minus beside a plus
reads as "one less", and undo removes the _last entry_ — which may have
been a 160 mg energy drink. On a counting pool the two readings coincide
and the minus is honest, so it stays there.

**Quick amounts are editable too, and replaced wholesale rather than
merged.** The editor shows the entire list, so merging would make a
removed row reappear — the one thing a list editor must not do. An empty
list clears the field rather than storing `[]`: the card reads
`presets ?? []` either way, and a stored empty array is a state every
future reader has to have explained.

They are shown **only for a measured pool**, because that is the only
place they are used — a counting pool's row is pips and a plus, with
nowhere to put a "Coffee" button. And a half-typed row is dropped on
save: a name with no number is somebody mid-thought, not a preset, and
saving it would put a nameless button on the card.

**The unit and the direction are editable, and the entries are not
rewritten.** They were fixed at creation, so a pool labelled wrongly
could only be retired and rebuilt — throwing away everything it had
recorded to correct a word. Not converting the history is the deliberate
half: relabelling drinks as shots is the same one-each record under a
better word, and drinks to milligrams is not, and **only the person
knows which of the two it is**. The editor says the entries keep their
numbers rather than guessing.

**Clearing a unit has to remove it, not leave it behind.** `editVice`
drops `unit` from the spread before rebuilding, the same as `daysLimit`.
A stored unit still draws a bar, so one surviving a clear would keep
rendering a pool the person had just turned back into a count.

**A unit is not cosmetic.** A double espresso and a cold brew are one
coffee each and very different amounts of caffeine, which is the whole
reason `capacity` had to stop being a count. Pools with a unit get a bar
and their numbers written out; pools without keep the pips, because pips
cannot show four hundred.

**Water is Upkeep too, and it used to be a measured target.** It was
3,000 ml with buttons for 250, 500 and a litre: an accurate account of a
day's drinking, and a running total nobody keeps. A gallon is a thing
you either finished or did not — which is a _daily_ here, one tap, with a
streak, and the streak is the question actually being asked over a week.

The mechanism fitting is what made it tempting. A pool with a capacity of
one and no unit would have worked and would have been a habit wearing a
pool's clothes: a plus, a single pip, and no streak at the end of it.
Same call [[supplements]] got, for the same reason.

**Removing a suggestion reaches nobody who already took it.** A Water
pool already on a device stays a 3,000 ml bar — it is a record, not a
default — so the way across is to retire it and tap the Upkeep
suggestion. This is the trap `SETTINGS_SCHEMA_VERSION` exists for,
appearing again in the one place a migration would be _wrong_: silently
deleting a pool holding weeks of readings, to replace it with a habit
that has no history, is worse than leaving it.

**Upkeep has suggestions now, and it was the only list without them.**
You typed every row, and it is the list whose contents are the least
personal — everybody's is roughly water, brushing, flossing and hair.
Offered by _name not already used_, the same rule the pools follow, so
taking one does not take the rest away.

**A day that is not today can be ticked now, and until it could not,
nothing could correct a forgotten one.** Reported from real use: a
habit asked for three times a day sat at **2 of 3 on yesterday**, and
there was no way anywhere in the app to finish it. `keepToday` only ever
did today, so a third feed forgotten at eleven at night was gone.

It is also the **only repair** for a completion misfiled by the timezone
bug this app shipped five times. Nothing rewrites stored entries — the
offset an entry was written at was never recorded, so there is no way to
know by how much it is wrong — and the honest fix is a person saying
"that day was done" and the app believing them.

**A backfilled tick is stamped midnight of the day it belongs to**, not
the time it was typed. `complete` is called with no `at`, because a late
tick knows which day it was and does not know what time of that day —
stamping "now" would file a Tuesday completion with Thursday’s clock.

**The future is refused.** Ticking tomorrow is not forgetfulness, it is
a claim about something that has not happened, and a streak built on it
would be the one number here that means nothing. The past is allowed
without limit. XP follows automatically and lands correctly, because
`tallyActs` dates a completion by the day it is filed under — so a day
ticked late pays into the season it belonged to.

**The cadence is editable now, and the reason it was not still holds.**
It re-reads every streak the habit has ever had: a habit kept every
weekday for a year becomes a broken run the moment it is told it was an
every-day habit all along. It exists because the alternative was worse —
a habit on the wrong cadence could only be retired and typed again, and
that throws away the run of days, which is a habit’s whole value. So it
sits **behind a press inside the label form**, with the warning stated
before the change rather than after: every day kept stays kept, and only
which days were _expected_ moves.

**Limits are no longer the first thing on the day.** "Can we not have
limits at the very top" — and the old argument for them leading was
sound and beside the point: they are the most present-tense thing on the
screen, and spending a charge happens at an arbitrary moment. Both true.
A limit is still a _readout you consult before spending_, and the
checkbox is what you opened the app for. The band runs actions then
readouts, which restores at this level the ordering the screen as a
whole gave up when the progression moved above it.

**A daily renames now, and only the title.** `renameDaily`. A name was
fixed at creation, so a habit named wrongly — or named before it meant
what it means now — could only be retired and typed again, and that
throws away the streak. Worse than the same trap on a pool: a pool's
value is a list of spends, and a habit's value _is_ the run of days.

**The cadence and the times a day are deliberately not in that form**,
and it is not squeamishness about a bigger one. A title is a label — the
record means exactly what it meant before — where a cadence decides
_which days were expected_ and re-reads every streak the habit has ever
had. A habit kept every weekday for a year becomes a broken run the
moment it is told it was an every-day habit all along. That is a real
operation somebody may want, and it has to say out loud what it does to
the history rather than arriving as a second field on a rename box.

**The title is the control, not a fourth icon button.** The rows already
carry a tick, a streak, a move and a retire; at 375 there is no room for
another, and the name is the only thing on a row that is not already
something you press. The pencil beside it is what says so, because a
phone has no hover to reveal it with. Editing replaces the whole row
rather than swapping the title column for a field — after the tick,
streak and two buttons there are about a hundred and eighty pixels left,
which does not hold a text field and its two buttons.

Shared by Today, Base and Upkeep the way `AddDaily` is: the same record
on three screens, and a second copy of the form is where a rename that
trims differently would live.

**Renaming pays no XP**, like undo and like retiring. Correcting a label
is not a thing done.

**Supplements are Upkeep, not a pool.** Creatine is a thing you take once
a day and either did or did not — a daily with a streak, which is exactly
what Upkeep holds. Building a third mechanism for it would have been a
counting pool wearing a habit's clothes.

**Sleep, calories and macros were scrapped, and the reason is worth
more than the feature was.** Reported: _"what am I really getting from
double tracking this info? Now there's a separate process involved."_

The area held one row a day — sleep hours, calories, protein, carbs,
fat — typed off Cal AI's screen, plus `macroTargets` deriving protein
and a fat floor from bodyweight and a `dailyCalories` figure somebody
typed into settings. All of it is gone: `day-reading.ts`,
`day-standing.ts`, `macros.ts`, the `days` use case, the Vitals boxes,
the Macros card, the cut line, `Condition` on Today, and
`settings.dailyCalories`.

**The test it failed is not "did anybody use it" but "who owns this
number".** Cal AI counts the macros and Apple Health holds the sleep, so
a row here was a **second copy of a figure kept properly somewhere
else** — and a second copy is a thing that can disagree with the first,
silently, with no way to tell which is right. That is the same argument
this file already makes against a food log and against a transaction
ledger, arriving at a feature that had got past it by being small.

**An automated import does not answer it, which is what settled this.**
The removal was decided _while_ a working import was on the branch — an
Apple Shortcut reading Health nightly and a paste panel that previewed
every figure before writing it. It worked, and it was still a second
process to keep running in order to hold a second copy of numbers that
were already fine where they were. **Cheap synchronisation is not a
reason to duplicate**, and the honest cost of a feature includes the
machinery that keeps it fed.

What that leaves in Vitals is what the app itself measures: the scale,
the phase, the corridor, and the pools. **A web app cannot read
HealthKit** — no web API, in Safari or anywhere — so any future version
of this is an outside process again, and the question above has to be
answered before the mechanism is.

**Nothing was migrated and nothing was deleted.** The `dayReadings`
store is still in `database.ts`, typed locally as `RetiredDayRow`
beside `conditions`, written by nothing. Removing it would mean editing
a migration step, which is the one thing that file must never do — and
the rows are a true record of days somebody measured. This was scrapped
"for now", so throwing the history away would make coming back cost more
than leaving it did. It is out of the sync payload, the tombstone list
and the backup envelope; a tombstone arriving under that name from
another device is simply not matched, which is correct.

**A charge comes back exactly `regenHours` after the spend that consumed
it**, so three coffees at eight in the morning on a twelve-hour timer are
all three back at eight in the evening. The alternative — a token bucket
refilling at one per `regenHours`, which is what most games actually do
with charge abilities — is what somebody will propose, and it cannot be
built here: **a bucket has to remember when it last refilled, and a
remembered refill time is device state with no correct merge.** Deriving
the reading from the spend list has no such state, so `readCharges` is
pure and two devices that have seen the same spends agree whatever order
those arrived in. The mechanic was chosen to fit the merge, which is the
right way round.

That makes `spent` a **union over the string**, like a daily's
completions and for a sharper reason: `readCharges` counts _entries_, so
a record-level winner would not merely lose a row — it would hand back a
charge that was genuinely spent.

**Spending is never refused, and going over is recorded rather than
clamped.** An app that refused would be asking to be lied to, and a log
you lie to is worth nothing. `ChargeReading.over` is separate from
`available` so the bar can clamp at empty while the record does not —
otherwise the one day worth noticing looks exactly like a day at the
limit.

**That rule is why a pool shut for today folds rather than
disappearing.** Reported: _"alcohol only applies on certain days, but
it's still cluttering up the screen on days where I don't have charges
available."_ Fair — a card headed _what you have left today_ was giving
a full band to a pool whose own caption read "not today", plus a plus
and an undo, on a screen that is scanned rather than read.

Filtering it out is the obvious fix and is the one thing that must not
happen: a Tuesday drink would become unloggable, which is the same
mistake with a tidier screen. It goes behind a lid on **Today only**,
counted in the summary, one tap from the same controls — the treatment
the day's done and not-due habits already get. Driven: with the row
folded, opening the lid and pressing the plus still records the spend.

The Limits screen is untouched. That is where pools are managed, and a
list you manage has to show everything in it.

**Weigh-ins and conditions are keyed by the day, and are last-write-wins
rather than unioned.** Two devices holding a row for one day are two
opinions about **one fact**, so the later answer wins outright; a second
reading is a correction, not an addition. That is the opposite of
`spent` and of `done`, and the difference is the whole reason both rules
are written down.

**The scale went too, and Vitals went with it.** Reported: _"no need to
track weight either, same reason. Doesn't make sense to have a vitals
section and the upkeep tasks should move somewhere else."_

Gone: `domain/vitals/weight.ts`, the `weighIns` store's repository, the
`WeighIn` record everywhere it travelled, `settings.phase` and
`settings.phaseRate`, the trend, the projected corridor, the Vitals
screen, its card on Today, and the `vitals.phase-held` rating with the
`vitals.weeks-in-band` source that fed it — a rating whose source
nothing produces reads as absent forever, which is worse than not
declaring it.

**`settings.bodyweight` stays, and the distinction is the whole point.**
It is one figure somebody states, not a series: `resolve.ts` needs it to
load a bodyweight-plus set, and the strength ladders are multiples of it.
Removing the tracking did not remove the number, because the number was
never the tracking.

**The area survives under a different name, and the id did not move.**
`area: 'vitals'` is an **address** — it is written into `belongsTo` on
every upkeep habit ever filed — so renaming it would orphan those
records rather than relabel them. `name` is a label and is now
`Upkeep`, which is what is left under that id: the body's chores and the
body's limits. It still pays `vitals.upkeep-kept` and still feeds
Vitality.

**Upkeep moved to Today, and it was already half there.** The obvious
build was a new home or a new screen, and the reply was _"there's
already an upkeep section on the You page though"_ — correct.
`DueElsewhere` had rendered an Upkeep group all along, and Vitals was
only ever where those habits were **added and edited**. So the section
moved to `features/today/Upkeep.tsx` and `DueElsewhere` dropped its
Upkeep group, because one screen must not draw the same record twice.

**The full list had to come with it, not just the due ones.** That group
showed only what was due, on the reasoning that anything else about
these belonged on the screen that owned them. There is no such screen
now, so a weekly hair wash on a Tuesday would have been invisible and
impossible to retire.

**What must not be done here is folding them into Today's own dailies.**
That looks tidier and would re-file them from `UPKEEP` to no home,
paying `dailies.completed` instead of `vitals.upkeep-kept` — which
empties the **Vitality** trait permanently, since `vitals` is its only
area and the limits rating pays no XP. **A home decides which area
scores a record; a screen is only where you touch it**, and this is the
case that shows the two are not the same question.

**`/vitals` is a redirect to `/today`, not a deleted route**, the rule
`/next` and `/character` already follow: a PWA shortcut is registered
with the operating system at install time.

**The `weighIns` store stays in `database.ts`**, typed locally as
`RetiredDayRow` beside `conditions` and `dayReadings`. Three retired
stores now, all for one reason: removing one means editing a migration
step, which is the thing that file must never do.

**A test moved rather than being deleted with its example.**
`synchronise.test.ts` → "lets the later weigh-in for a day replace the
earlier one" was the record that a date-keyed row is last-write-wins
rather than unioned. The rule outlived the weigh-in: finance is keyed by
its month on identical reasoning, so the test is written against that
now. **Deleting a rule's only test because the record it used went away
is how a rule stops being enforced without anybody deciding to stop
enforcing it.**

**Vitals pays no XP at all, and it is the first area that measures
without paying.** Every candidate falls on the wrong side of the act/
outcome line: not drinking is an _outcome_, so paying for it is the
streak mistake in a new costume, and the only real _act_ was spending a
charge, where paying XP for logging a beer is perverse. Weighing in was
the other one, and stepping on a scale is a measurement rather than a
thing done — the reasoning that kept it unpaid is the same one that has
now removed it altogether. An area with no acts is not an incomplete
area, and this one has since gained `vitals.upkeep-kept` anyway.

**Still no ladder.** Nobody publishes how much coffee a person ought
to drink or how often they ought to floss. Bodyweight was the tempting
case and the argument against it is kept as the general one: BMI and
body-fat brackets are published, and every one of them is a claim about
_health_ rather than about the thing measured — a lifter deliberately at
15% on a bulk is not worse at anything. Moot now the series has gone.

**The navigation is eight, and the eighth was measured rather than
argued about.**
Character became "You" and the tech tree moved to a link, because seven
cells on a 375-pixel screen are 53.6 pixels wide and "Character" measured
53 — exactly the width, nothing left for padding.

That note then warned that at eight cells "every label but Map is at
risk", which was an extrapolation and **wrong**. Measured with a real
eighth cell: 46.9 pixels each at 375, the widest label ("Quests") is 37.1,
nothing clips and nothing overflows. Eight is fine.

Where it does break is **320 pixels**, an iPhone SE 1st-gen width: the
44-pixel tap-target minimum refuses to shrink further, so 8 × 44 = 352
overflows a 320 viewport and the last tab is clipped by 32. That cannot be
fixed by narrowing cells — 44 is the accessibility floor and the mobile
bar below says every control clears it — so a ninth tab, or support for
320, needs a horizontally scrolling nav instead.

**Measure before adding a ninth**, and measure it rather than reasoning
about it: this paragraph is what an unmeasured warning costs.

Settings and the tech tree are links from You, which is the hub. That is
the line worth keeping: **a tab is somewhere you act, a link on the hub
is somewhere you decide.** History hangs off Train, Trips and the inbox
off the Map. The monthly review was the third of those links and the
screen is gone; see below.

**The screens and the code use different words, on purpose.** Quests over
`Project`, Codex over `backlog`, Tech tree over `upgrades`, Map over
`domain/atlas`. The presented vocabulary is the game model's; the type
names are the ones the files were written under, and renaming forty of
them buys nothing a reader of this paragraph does not already have. What
must match is any string a _person_ reads — several of those live in
`domain/projects/`, which emits its own refusals, and they say quest.

**Routes outlive the labels on them.** `/next` still resolves, as a
redirect to `/quests`, because a PWA shortcut is registered with the
operating system at install time: an installed copy goes on asking for the
old path long after the manifest stops mentioning it. `/backlog` and
`/upgrades` keep their paths under the Codex and Tech tree labels for the
same reason. `/map` is the one that came back into agreement — it was
always `/map`, and "Atlas" was the label that disagreed with it.

**This was called Lift, and the rename went all the way down.** The
database, the `localStorage` prefix and `BACKUP_MAGIC` all say `lifeos`.
Those are _addresses_, not labels: changing one opens a fresh empty one
beside the old rather than migrating anything, so it was a deliberate
factory reset taken at the only moment it was free — before there was data
worth keeping. Doing it later would have meant a migration, or a database
called `lift` inside an app called LifeOS forever. `LiftTracker` in the
archaeology is a different repository and keeps its name.

**A quest is main or side, and "active" is derived from a stamp.**
`domain/projects/active.ts`. `activatedAt` rather than an `isActive`
boolean, because two devices each activating a different quest while apart
would both set a boolean and last-write-wins has no tie-break — a
timestamp always has a greatest element, so `activeQuest` picks one
deterministically however many stamps survive a merge. The write still
clears the others; the derivation is what makes it safe when that clearing
does not survive the trip. Absent `kind` means side, read through
`kindOf`.

**A closed action records the kind it was closed as.**
`ActionItem.completedAsKind`, written once at completion and never
recomputed. Main quest steps pay 40 XP and side ones 20, and the kind is a
label a person can change — so reading the quest's _current_ kind would
mean promoting a side quest silently repriced everything already done
against it, and demoting one would make XP go **down**. A record of effort
must never shrink. Same principle as a `WorkoutLog` embedding its own
prescription: a log describes itself. Verified by demoting a main quest in
the store and watching the total stay at 75.

**The recommendation is an advisor now, not the answer.**
`getRecommendation` and the whole priority engine are unchanged and still
run — what moved is what they are _for_. The Quests page leads with the
two quests you chose and offers the scoring underneath as a suggestion of
what to activate. Do not restore it to the top of the page: the engine can
say which quest scores highest and can never know which one you mean to be
working on.

**Dailies are the one area where the screen and the code agree.** Quests
sit over `Project`, Codex over `backlog`, Tech tree over `upgrades` — and
`domain/dailies/` is called dailies on both sides, because the MMO word
for a recurring quest and the type name happened to be the same word. Do
not "fix" the label to Habits for plainness; the agreement is worth more
than the plainness, and it is the only one there is.

The wrinkle it carries, stated so nobody treats it as a bug: a
days-of-week cadence means a "daily" can happen weekly. Every MMO with
dailies has the same thing and nobody is confused by it.

**A habit can name parts of the day, and it is deliberately coarse.**
`partsOfDay` in `domain/dailies/daily.ts` — morning, afternoon, evening,
or none. A stored "07:00" would be precision with no consumer: nothing
can ring (see below), so a time could order a list and do nothing else,
which three named parts do just as well without inviting somebody to
expect an alarm.

What it is for is reading a day as a routine — the house is opened at one
end and closed at the other, and an alphabetical list says nothing about
which comes first.

**It is a list, and naming two parts is what says it happens twice.**
Reported: _"some stuff, like brushing my teeth, is done twice a day, but
I'd like it morning and evening — that doesn't seem to be supported
right now since it's one row."_ It was `timesPerDay: 2` and a single
`partOfDay`, which states the number and says nothing about when, and
drew **one row that could not be in two places**.

So naming parts does two things at once, and the form says so: the habit
is drawn once per part, and the parts **are** the times-a-day answer.
`timesPerDay` is ignored entirely when there are any, and the control
for it is hidden — two fields answering "how many times a day" is the
trap the fatigue allowance already records, where the loser sits there
looking authoritative. What that costs is "twice in the morning", which
is not expressible any more; it is rare enough to be the right thing to
give up for one number with one meaning.

**`partsOf` is the only reader, because two shapes are stored.** Every
record on every device was written with the single `partOfDay`, which
reads back as a list of one — a derivation rather than a migration, the
rule `shelfOf` follows, normalising the next time anything saves it. The
list is deduplicated and re-sorted on read too, since a `partsOfDay`
naming morning twice would otherwise mean "twice in the morning" by the
rule above and draw two identical rows in one band.

**A completion of a named part is `<day>#<part>`**, so the first ten
characters are still the day and `timesDoneOn` needs no special case.
The shape was chosen for **idempotency**: two devices ticking the same
morning write the same string and `unionDone` folds them — the property
a once-a-day habit's bare day key has and a multi-times habit's
timestamp deliberately does not. Here it is both available and correct,
because the morning brushing is one event however many devices saw it,
where the dog's second feed genuinely is not the first.

**The unit of the Today list became an occurrence rather than a
record.** Outstanding, later, done — every one of those is asked of a
row, so keeping the morning folds the morning row away and leaves the
evening one asking. Asking the record would have one tick turn both
rows green. A habit naming no parts has exactly one occurrence with no
part, so the ordinary case goes through no special branch, and
`byGroup`/`byPartOfDay` take occurrences for the same reason. The React
key is `${id}#${part}` — two rows from one id sharing a key is the case
React warns about and then renders wrongly.

**`complete` with no part fills the earliest outstanding one.** The
history strip is the caller that has none: a fortnight of nine-pixel
squares cannot say which half of a day was missed, and pressing twice
fills both. Earliest rather than latest because the strip repairs a
forgotten day, and a half-done day is far more often the morning kept
and the evening missed than the reverse.

**`uncomplete` cannot sort the strings.** `#afternoon` sorts before
`#evening` sorts before `#morning`, so the alphabet would take back the
morning and report the evening as still kept. The order of the day is
the only thing that answers it, and `partsOf` already holds it.

**Editing when in the day lives with the cadence, not with the name.**
Reported: _"existing dailies, particularly the ones from home, don't
seem to be able to update the time of day — they're all at any time."_
They could not: `partOfDay` was settable on the add form and **nowhere
else**, so a house chore filed before anybody thought about it read "Any
time" forever. Another instance of the capability the model had and no
screen could reach, which this file keeps recording.

It belongs behind the cadence warning rather than in the rename form
because it is **not a label**: naming morning and evening changes how
many completions a day needs, so it re-reads every streak the habit has
ever had. A title and a group change nothing about the record's
meaning; this does.

**`bestStreakFor` asked `done.includes(day)` and that was a bug.** The
membership test only ever matched a bare day key — the shape a
_once-a-day_ habit stores — so a habit done several times a day reported
a best streak of **0** however long it had been kept, and parted habits
would have joined it. It asks `isDoneOn` now, which is the predicate
that already knows all three shapes. A second implementation of "was
this day done" is a bug with a delay on it.

**Later today folds away, and that is the version of "guide me" that
does not move anything.** The report: _"can we not surface tasks until
it's time for them, so I'm not combing through stuff that isn't
applicable in the moment."_ The obvious answer is to sort the current
part to the top, which is exactly what the paragraph below argues
against and for a reason that has not stopped being true.

Hiding gets what was asked for without that cost: nothing is reordered,
a later part is simply not drawn yet, and one press shows it. The count
in the header still covers the whole day, because "3 left today" is a
claim about the day rather than about this section.

**Only what is still to do gets hidden — and that now covers what is
done as well, which reverses the paragraph this sentence used to be.**
The old rule: a habit finished early stays on the list, because hiding
something already done invites doing it twice and it is evidence rather
than a task. Reported against: _"the homepage is cluttered with
everything that gets checked off and stuff for other days."_

Both halves were on screen permanently — every ticked row, and an
"Other days" block for habits not due — so a fifteen-habit routine drew
fifteen rows whatever the day actually asked for, and **the evidence of
what was finished was what buried what was not.** They fold away now:
`components/shared/Fold.tsx`, one lid each for "N done today" and "N on
other days", on the dailies and on upkeep. Earlier parts of the day
still stay put — a morning pill forgotten at noon is exactly what the
screen is for.

**Folded, never filtered, and that is the load-bearing half.** A done
row is the only route to **undo**, and a not-due row is the only route
to renaming or retiring one. Dropping either from the screen would take
a working control away in order to tidy a list, which is the shape of
mistake this file keeps recording under "a capability nothing can
reach". The summary carries its count, so the lid says what is under it
before it is lifted.

**Upkeep created half of this and inherited the rest.** Moving its full
list onto Today meant every chore rendered whatever the day asked,
captioned "Not due today" — the clutter arrived with that move rather
than being found in it.

**The Dailies section is the day across every home, and getting there
took two wrong shapes.** Reported against the first: _"I have two left
but have to scroll all the way down to find em."_ The header counted
every home — "2 left today" — while the section drew own habits, House
and Training only, with upkeep in a section three blocks below. So the
number was right, the rows were off-screen, and the list directly under
the count was **empty**.

**A count and the rows beneath it have to be the same claim.** That is
the rule this cost, and it is worth more than either arrangement: the
count may describe the day rather than the section only when the section
shows the day. Upkeep is a group in the list again — House, Training,
Upkeep — and `ELSEWHERE_GROUPS` makes `to` optional, because House and
Training point at the screens that manage them and **upkeep has no link,
since this is that screen**.

**Upkeep comes from `useUpkeep`, not from `useDueElsewhere`.** That hook
keeps only what is due or done _today_, and Today is where an upkeep
habit is renamed and retired — so the other-days fold needs the ones
that are neither. It is dropped from `elsewhere` in the same breath or
every upkeep row is counted and drawn twice, which is the bug the
previous shape shipped with.

**Upkeep is a `group` label now, not a home.** Asked for directly:
_"drop upkeep as a home, use group labels instead."_ `UPKEEP` and
`isUpkeep` are gone, `RECORD_HOMES` is back to four, and
`vitals.upkeep-kept` went with them — a kept chore pays
`dailies.completed`, which is the same fifteen points under the one name
it always deserved. **The act was a second name for one thing**, and the
distinction this codebase keeps drawing is why it could go: a group is a
label, a home decides which area pays. Upkeep only ever needed the
label.

**A trait died with it, and letting it live would have been worse.**
Vitality's only area was `vitals`, which now pays nothing at all —
brushing pays Discipline, and the limits measure without paying. The
sheet keeps _unproven_ bars on purpose, because "eight bars with three
empty says where the time is going"; a bar **no act in the app can ever
move** is a different thing, and it would have sat at "Nothing yet"
forever while the XP it described appeared under Discipline. So Vitality
is deleted and `vitals` joins Discipline, whose blurb now says "and
limits held". The partition still has to be total — `traits.test.ts`
asserts every area has exactly one trait — so `vitals` needed _a_ trait
whether or not it pays.

**The legacy rows are the part that would have gone wrong quietly.** A
`belongsTo: 'vitals'` daily matches no `RecordHome` this build knows
**and** is not own-area, so it is filtered off every screen while
sitting in the database: nothing errors, nothing is deleted, and the
habit is simply gone. `fromStoredDaily` in the repository reads one as
an own habit in the `Upkeep` group, and `StoredDaily` in `database.ts`
widens `belongsTo` to `string` so the stored shape can say something
this build does not have a name for.

**A derivation, not a migration**, the rule `shelfOf` already follows:
nothing is rewritten on read, and a row normalises the next time
anything saves it, because callers hand back what they were given.
Driven end to end — ticking a legacy chore wrote it back with
`belongsTo` absent and `group: 'Upkeep'`, and paid "Kept a daily". That
also keeps it safe across sync, where a device still on the old build
goes on reading its own copy the way it always did.

**An existing `group` wins.** Somebody who had already labelled a chore
"Teeth" meant that, and overwriting it would be the read path having an
opinion about their filing.

**`UPKEEP_GROUP` is the one group name the app itself writes**, and it
leads `GROUP_SUGGESTIONS`. Every other group is the person's, which is
why that list is offers rather than a union.

**The Upkeep section is gone, and its one real job moved into the add
form.** Reduced to a `Section` holding an Add button and four chips, it
read as furniture: _"do we even need the upkeep section under dailies,
it seems redundant."_ Fair about the section — and the capability under
it was not redundant at all, because **nothing else in the app could
file a habit to upkeep**. Today's Add filed to your own area, Base's to
the house, and `moveDailyHome` only toggles between an area and Today.
Deleting the section without moving that would have made upkeep a home
you could own habits in and never create one in.

`AddDaily` takes an optional `Filing`: the homes it may file to, the
one-tap suggestions for each, and the titles already used. **Today is
the only screen that passes one**, because it is the only screen that
owns two homes; Base and Train own exactly one each and keep passing a
fixed `home`, so nothing about them changed. House and Training are
deliberately _not_ offered in the chips — those screens have an Add of
their own, and a second route to the same record is a second place for
it to go wrong.

**The suggestions moved with it and are filtered by the chosen home**,
so they appear when Upkeep is selected and not otherwise. They still
offer by _name not already used_ rather than gating on an empty list,
for the reason recorded when they were written: adding the first must
not take the other three away. They submit on their own rather than
filling the field — a suggestion whose whole value is saving a tap
should not cost two.

**`home?: RecordHome | undefined` is written out rather than left as
`?`.** Under `exactOptionalPropertyTypes` an absent key and one holding
`undefined` are different types, and "your own area" **is** an explicit
undefined here rather than an omission — which is what `belongsTo` means
everywhere else. Written as `?` alone the build refuses the `Yours`
chip.

**`DailyRow` moves a habit the way it is not currently filed**, and this
was a latent bug that only bit once upkeep joined the list. The button
was Base unconditionally: harmless while the row drew own habits and
House rows, where "move to Base" is merely useless. With upkeep in the
day list it put a toothbrushing habit one tap from becoming a house
chore with no way back on that screen. An own habit offers Base;
anything already filed elsewhere offers the way back to Today.

**One screen must not draw a record twice, and the first attempt did.**
Today's done fold was built from own dailies plus everything
`useDueElsewhere` returned, which includes upkeep — so a ticked Floss
appeared in the Dailies fold _and_ in Upkeep's. `otherHomes` excludes
`UPKEEP` from what the section **draws**, while `left` still reads the
whole of `elsewhere`, because "3 left today" is a claim about the day
rather than about one section. Found by driving it with six habits in
three homes; the suite was green throughout.

**`DueElsewhere` takes its rows rather than fetching them.** It called
`useDueElsewhere` while its caller called it too — one answer read
twice — and the caller has to split done from outstanding anyway, so
the split has to happen in one place or the fold and the list would
disagree about what is left.

**Sorted chronologically, never "the current part first."** Putting now
at the top is the more obviously clever rule and is worse to live with:
the list would reorder itself twice a day, so the row you reach for by
position moves, and a glance at breakfast and a glance at bedtime
disagree about where anything is. The current part is _lit_ instead,
which says the same thing and moves nothing. A habit with no part sorts
last, because it belongs to no point in the day rather than to the start.

**It never decides whether something counts as done.** Time of day is the
most obvious excuse to start breaking a streak early — a morning habit
undone at noon _looks_ missed — and that would undo the humane rule this
file already sets out: today does not break a streak until the day is
over. `daily.test.ts` holds it.

**A daily cannot ring, and the design is built around that.** iOS gives
a PWA no way to schedule a local notification, and Web Push needs a
server this app does not have. So `domain/dailies/` earns its place by
being the first thing on the home screen rather than by finding you.
Anything proposed here that assumes an alarm is proposing a server.

**A streak has two humane rules and both are load-bearing.** A day the
habit was not expected on does not break it — otherwise every cadence
but every-day reads as a streak of one forever. And **today does not
break it until the day is over**: opening the app on Tuesday morning to
be told a twelve-day run is finished, because you have not yet done the
thing you are about to do, is the single most discouraging thing a habit
tracker can do. `streakFor` has tests for both.

**A day key is local, and mixing it with a UTC date shipped five
times.** `toDayKey` reads `getFullYear`/`getMonth`/`getDate`, so it is
the day the person is standing in. `toISOString().slice(0, 10)` is the
UTC date. West of Greenwich those disagree for the last hours of every
evening, and every place the two met was a bug:

- A habit asked for three times a day **could not be finished after
  about seven in the evening**. `complete` stamped `at.toISOString()`,
  so the entry carried tomorrow’s date, `timesDoneOn` did not count it,
  and the row stuck at 2 of 3 — while the write succeeded and the XP was
  paid, which is what made it look like the tick was working.
- `vitals.days-within-limits` counted an evening drink against the
  wrong day, **and counted entries rather than amounts**, so a 400 mg
  caffeine ceiling needed four hundred separate coffees to register as
  breached.
- A trip flipped from upcoming to past several hours early.
- The weight chart’s window boundary dropped its oldest reading.

`complete` now writes `${day}T${localTime}` with **no `Z`** — the first
ten characters are the day key by construction, which is the only
contract `timesDoneOn` has, and a `Z` would be a claim about an offset
the string does not carry. `amountSpentOn` in `charges.ts` is the same
answer for pools: it parses the entry and converts, because a spend
_is_ a real instant and `#95` on the end means `new Date` on it yields
Invalid Date.

**Nothing rewrites entries already stored.** An evening completion
filed under tomorrow is wrong by a day and there is no way to know by
how much — the offset it was written at was never recorded, and
assuming the current one would corrupt anything logged while
travelling. They stay as they are and read as a completion on the
following day, which is what the record actually says.

**The suite runs in `America/New_York` now, and that is the real fix.**
In UTC a local day key and a UTC date prefix are the same ten
characters, so every assertion about this passed while the app was
wrong for half of every day for anyone in the Americas. Moving the
suite cost nothing — all 1,227 tests passed unchanged on the first run
— which is the measure of how little it was covering. A lint rule bans
`.toISOString().slice(0, 10)` so the next one fails the build instead.
The ten-character slice only: a longer one is a timestamp for a
filename, where UTC is right and nothing compares it to anything.

`shiftDay` is the one deliberate exception and carries a disable
comment. It is calendar arithmetic on a key rather than a reading of a
clock — `parseDay` builds midnight UTC and `keyOf` formats one back, so
a day is exactly 86,400,000 ms. Reading it locally would be the bug.

**`done` holds two shapes and `timesDoneOn` is the only thing that
reads it.** A habit expected several times a day — feeding a dog morning,
afternoon and evening — could not be recorded at all, because a set of
day keys has nowhere to put "twice". `timesPerDay` sits on the `Daily`
rather than inside `Cadence`, since the two are orthogonal: the cadence
answers _which days_ and this answers _how many on one of them_.

**A once-a-day habit still stores a bare day key, and that idempotency is
load-bearing.** Two devices ticking the same Tuesday write the same
string, the union collapses it, and `daysKept` — which counts _entries_ —
pays fifteen XP once rather than twice. Switching everything to
timestamps would have quietly doubled the XP of every habit synced from
two devices.

**A multi-times habit stores one timestamp per completion**, because
there is nothing to collapse: the evening feed is not a duplicate of the
morning one. Each entry is one completion and pays once, which is the
existing rule rather than a new one — three feeds is 45 XP, verified.
Both shapes are read by comparing the first ten characters, so nothing
needed migrating.

**`isDoneOn` means done _enough times_.** Streaks follow from that
unchanged: a day counts once it is full, and a part-done today still does
not break the run, which is the humane rule already written down.

**The view was computing `done.includes(today)` itself** rather than
calling `isDoneOn` — the same answer while every habit was once a day,
and wrong the moment one asked for three. A second implementation of a
domain predicate is a bug with a delay on it.

**A create that takes four positional parameters will silently drop the
fifth.** `addDaily` grew `home` and then `timesPerDay`, and the screen
passed the latter inside a spread — `...(howMany > 1 ? { timesPerDay } : {})`
— which **defeats excess-property checking**, so a value the form
collected went nowhere and nothing failed to compile. It takes a
`NewDaily` object now, like `addUpgrade` and `addVice`, which puts the
compiler back in charge of noticing.

**Completions are a set of day keys, merged by union.** `unionDone` in
`domain/sync/payload.ts`, beside `unionProgress` for the same reason:
tick Tuesday on the phone and Wednesday on the desktop with neither
having heard from the other, and a record-level winner keeps one — which
on a streak reads as a day missed and a run broken that never was. There
is no amount to take a maximum of, unlike the backlog, because a day is
either done or it is not.

**`isEmpty` and `payloadSize` have to know about every collection.**
Adding `dailies` to the payload without adding it to `isEmpty` meant a
push containing _only_ habit ticks was discarded as empty — so a device
whose sole change that day was keeping a habit synced nothing at all.
Caught by the union test, which never saw a batch reach the server.

**XP is paid per completion, never per streak.** A streak is an outcome
— it is what happened to have worked — and paying a currency from it
would break the rule against feeding XP from outcomes in the one area
where the temptation is strongest.

**Habits retire rather than delete.** `retiredAt` makes them expected on
no day, so they leave the list and their kept days survive. Eighty days
of a habit you have finished with is a thing that happened.

**That rule was right and it was also the only door, which made it a
trap.** Reported: _"I seem to not be able to delete dailies."_ You could
not. `removeDaily` and `useRemoveDaily` were written, exported and
tested, and **called by nothing anywhere in the app** — the seventh
instance of the pattern this file keeps recording, after
`proposeLandmarks`, `readinessScore`, `moveDailyHome`, the fatigue
percent, the stopping rule and the geocoder. So a habit typed with a
typo, added twice, or thought better of an hour later could only be
_retired_: kept forever, invisible on every screen, and travelling over
sync for good.

**The verb now follows what there is to lose, and the row says which it
is doing.** A habit with no kept days is a record of _nothing_ and the
button deletes; one that has been kept is a record of something and the
button retires. That is not a new rule — it is the one `attempts`
already states, where a problem logged by mistake is deleted because it
is not a thing that happened, while a habit's kept days _are_ the
record. Same predicate, applied where it had never been.

**Permanent deletion for a habit with history lives in the editor, not
on the row.** The more destructive thing sits further from the control
pressed daily, which is the reason a pool's retire is in its editor
too — and on a row already carrying a tick, a rename, a move and a
retire there is nothing left to spend at 375 pixels.

**It says the XP will go, because that is the part nobody expects.**
`tallyActs` counts completions, so removing them takes back what they
paid: a habit kept eighty times is 1,200 XP, and the character level can
fall. This is the one place in the app where **a record of effort
shrinks**, and it is allowed only because deleting is exactly the
request to un-record it — the alternative, retiring, keeps both and only
stops asking. Measured end to end: a habit with three kept days took the
all-time total from **45 XP to 0**, which is what the warning promised.

**A deletion writes a tombstone**, so it is a fact rather than an
absence and the record does not come back from the other device on the
next exchange. Verified: `dailies:<id>` in the store after the press.

**What is still missing, named rather than implied: a retired habit
cannot be brought back.** `dailiesToday` drops anything with `retiredAt`
before anything else sees it, so there is no screen that lists one and
nothing to press. Deleting the never-kept rows removes most of the
pressure — that is where the accidents are — but a habit retired by
mistake is still unreachable, and un-retiring needs a screen the day it
needs a function.
**Today and You are one screen, and that reverses the rule below.**
The paragraph that follows is kept rather than deleted, because it is
the argument this decision was made _against_ and it may well be right
again.

The reversal was asked for directly: _the character progression is the
main thing and should be shown first._ It was flagged first — that
ordering had been reversed once already, for a stated reason — and then
made, which is the right way round for a decision about somebody’s own
app.

**Two bands now, and it was three.** The sheet card — portrait, season,
traits and the ladders under them — then the day: dailies, quests,
limits, leads and the digest. The third band was "where you stand", a
list of one card per area, and it is gone: what was worth reading in it
is in the card at the top, and the rest could no longer say anything.
The only thing left below the day is navigation — the screens with no
tab, and the ladder legend.

**The cost is exactly what the old rule predicted.** The dailies now sit
below three blocks of readout where they sat below two, so opening the
app shows a level before it shows a checkbox. If ticking habits starts
feeling like a chore buried under a scoreboard, this ordering is the
thing to suspect, and moving the standing band above the day is a
two-line change.

**It also fixed the 320-pixel overflow this file warned about.** Eight
cells needed 352 against an iPhone SE’s 320 and clipped the last tab by
32; seven need 308. Measured after the merge: at 320 the nav overflows
by **0 pixels**, seven cells at 46 each, the last tab ending exactly at
the edge. The freed seat is deliberately left empty — the eight
screens without a tab are all things you decide rather than do daily.

**The route stayed `/today` under the label "You"**, and `/character`
redirects to it. A PWA shortcut is registered with the operating system
at install time, so an installed copy goes on asking for the path it was
installed with — the same reason `/next` still resolves.

`CharacterPage` is gone; its parts moved to `CharacterParts.tsx` and its
constants to `sheet-constants.ts`, because a module exporting both
components and values breaks fast refresh and the lint rule says so.

**The hub opens as a character sheet, not as a form.** Reported:
_"simply rendering 'You' followed by a date underneath feels very
barebones and non-gamified"_, and it was — a noun over an ISO date is
what a settings pane opens with, on the screen the app opens to.

**There is no header on this screen at all now**, and the whole of that
report is answered by what replaced it rather than by a better heading.
The title went through three values in three days — the calling
(_Devotee_), then `You`, then nothing — which is itself the finding:
**a heading was never what was wrong with that screen.** The portrait,
the ring, the season and the traits were what fixed it, and they are all
still there. `SheetCard` is the whole first band.

**Intellect is Intelligence**, a label change only — the trait id stays
`intellect`, because nothing user-visible reads it and an id is an
address.

**Limits are Buffs: Potions you spend, Rations that keep you up.** Asked
for as _"can we rename limits to make them buffs, to make it feel more
like gamified potions that recharge on cooldown instead of something I'm
limiting myself on."_ The mechanism is untouched and so is the honesty —
going over is still the thing worth seeing and `poolStanding` still says
**Over**. What changed is the frame: a flask with charges that come back
is what a daily allowance actually is.

**The names stayed the substances and the icons do the gamifying.** A
suggestion is offered by _name not already used_, so renaming Caffeine
to something flavourful would stop matching the pool already on the
device and offer a second one beside the first. Any pool can be renamed
in its own editor, which is where a name somebody chose belongs.

**Water is back as a target, reversing the note that removed it.** That
note said a gallon is a thing you either finished or did not, so it
belonged in Upkeep as a habit with a streak rather than as a pool with a
running total nobody keeps. What changed is that a target now _feeds
something_: the health bar reads daily targets met, so a ration is the
thing the bar is made of. 128 oz with a **Gallon jug** preset, plus
Fruit and Vegetables at two servings a day. Nothing migrates; if the
habit and the pool both exist they are two records of one intention and
the pool is the one that moves the bar.

**The health bar is a rolling seven-day reading, never a stored level.**
`domain/vitals/vitality.ts`. A bar that decayed on a timer needs
somewhere to keep how full it was, and device state with no correct
merge is the trap `readCharges` was written to avoid. Reading the last
week means it **drains by itself for free**: a day you hit ages out, so
stopping makes it fall with nothing ticking.

**Its numbers are the app's own and that is said out loud.** Seven days,
and a day over a limit cancels a day of hitting a target. It is allowed
for the same reason the avatar's build bands are — it _measures nothing
about the world_, only pools you set against targets you chose.

**The bar starts full and depletes**, asked for as _"it should really
start full, and deplete with the things replacing them."_ The arithmetic
is written that way now — full, less what was missed and what went over
— rather than as a score climbing from nothing. They are the same
number, and only one of them reads the way the bar behaves.

**Targets and limits share one window, and getting that wrong made a
perfect day read as empty.** Reported: _"hit my water and veggie/fruit
goals and my health bar is empty still."_ Reproduced exactly before
changing anything: **met 3, over 7, possible 3**.

The cause is worth keeping because it is a shape rather than a typo.
Targets only counted days since _they_ were created, which is right; the
limits were judged across the whole seven days, which is not. A caffeine
pool running for months could therefore spend a week of overruns against
a single day of hitting everything — and the restoratives are always the
newer records, so this was going to happen to everybody who set them up.

**A day with nothing to measure is now skipped whole.** A day before you
were keeping any restorative is not a day you failed, and it cannot
drain a bar that was not being kept. The two halves ask the same
question of the same days, or neither does. An overrun on a day that
_was_ being kept still costs — there is a test for each direction.

**Today does not drain it until the day is over.** Reported as _"health seems to drain awfully quickly — hasn't been a day yet and already down to 33. I should at least be able to go through today at 100, and if I don't hit my goals by end of day, then it starts draining the next day."_ Exactly right, and the arithmetic was doing it deliberately: today sat in the window like any other day, so at nine in the morning three untouched targets read as three misses. On a first day — when the pools were created today and today is therefore the only day in the window — one target of three is 33%, a bar that opens two-thirds empty because the day has not happened yet.

It is the humane rule streaks already follow, applied to the other place it belongs: a run is not broken by a day you have yet to live. An unmet target today is **not yet missed**, so the bar starts full and falls tomorrow for whatever today did not do. Nothing is forgiven, only deferred.

**An overrun is judged today, and the asymmetry is the point.** Missing a target is a thing that has not happened yet and may still; going over a limit has already happened and cannot be taken back. A bar that deferred both would let a heavy night read as a perfect day right up to midnight. Driven: untouched reads 100%, and five energy drinks against a 400 mg ceiling take it to 67% on the spot.

**Today counts toward `met` rather than being left out of the denominator.** Dropping it instead makes a fresh morning `possible: 0` — an absent reading, which draws the "set up your restoratives" empty state at somebody who just did.

**A day before the pool existed is not a day you missed**, and this was
found by looking rather than by reasoning. Three rations set up and all
three hit on the first afternoon read **14% in red**: six of the seven
days counted against pools that did not exist yet. A bar calling a
perfect day a failure is worse than no bar. The denominator now counts
only days the pool has existed for — absent-never-zero applied to the
window — and the same reading is 100%.

**A weekly target is left out of the denominator entirely** rather than
counted as missed. Three of seven days is not a third of a weekly goal
in any sense the bar could use, and being unmeasurable is not being
failed. A weekly _limit_ is judged through `readCharges` at the end of
each day, so going past four drinks on Friday reads as over on Saturday
too — the pool's own rule rather than a second opinion.

**The pool icons are real game-icons.net art, and getting there took
three states worth recording.** They shipped first as ten shapes drawn
here **carrying a false CC BY credit to Lorc and Delapouite** — caught
and corrected before the deploy, because a licence note is a claim about
provenance and one written from memory is a claim about nothing. The
honest version credited nobody and looked it: reported back as the icons
all being much of a muchness, and the carrot read as a dagger.

They are now the genuine article, fetched from game-icons.net and
committed as paths — the route `figures.ts` took, which is what the
corrected comment had already pointed at. **`ATTRIBUTION` widened from
"Figures" to "Figures and icons"**, which is accurate rather than
convenient: same two artists, same licence, and it would have been an
under-credit the day these landed.

**The section headers came off the home screen entirely.** Reported:
_"can we remove the headers on the home page like today what the day
asks of you? It makes the app feel less gamified and breaks up the
flow."_

They were a label over an accent rule over a description, four times
down one screen, and **each named something the card beneath it already
said**: a list of checkboxes is the day, two slots reading "no main
quest active" are the quests, and the Buffs card carries its own name
and its own link. The rules were doing separating that `space-y-8` was
already doing.

This is the argument the page header lost to a portrait — _a screen that
opens on a face does not need to be told it is about you_ — carried one
level down. What is left is cards, which is what a game screen is.

**The season label moved inside its card rather than going with the
rest.** What that line says — which chapter of the year this is — is not
recoverable from a list of challenges, and the rule this file already
holds is that the name travels with the measurement. So it is the
`ChallengePass` card's first line now, above a rule, with the days left
beside it.

**Two spans became `h2`s, and they look identical.** Dropping the
sections took every landmark off the screen bar the level, so somebody
navigating by heading had one stop for the whole page. The cards already
name themselves; making those names headings gives the structure back
without putting a rule and a caption back on screen. Verified: H1 Level,
H2 Buffs, H2 Autumn 2026.

**A JSX comment cannot be a bare sibling inside a `&&` expression**
either — the same trap this file records for attribute expressions, one
shape along. It has to sit above the conditional.

**The two fold lids became one control in the header.** Reported:
_"get rid of the done today and habits on other days lines, it breaks up
the flow of the cards."_ They did — two summary rows sitting between
cards, each announcing a list nobody had asked to see.

**The rows themselves could not simply go**, which is why this is a move
rather than a deletion: a ticked habit's row is the only route to
**undo**, and a not-due habit's is the only route to renaming or
retiring it. Dropping them would take working controls away in order to
tidy a list, which is the shape of mistake this file keeps recording.
So the disclosure is an eye beside **Add** and the lines are gone.

**Hidden when there is nothing behind it**, rather than shown disabled —
a control that cannot do anything is worse than one that is not there.
Not persisted either: it is a glance at what is already done rather than
a preference, and the day should reset it.

**"N left today" is unchanged and still counts only what is
outstanding**, which is the rule that cost two attempts to find: the
count and the rows beneath it are one claim. Revealing the rest does not
move it, because a done habit is not left to do.

**The morning digest moved to Mind.** Asked for as _"let's move the this
morning hacker news stuff to the other mental training page."_ It fits —
Mind is study and practice, and a front page of things worth reading is
the study half arriving from outside — and it sits at the **foot**,
because what the screen is for is the practice log and the digest is a
reading surface that pays nothing.

**The cost is when it fetches.** The digest reads on the first open of a
day and that gate fires when the component mounts: on Today it ran when
the app did, and on Mind it runs the first time Mind is opened. A
morning without visiting the screen is simply a morning it has not swept
yet — the same shape as the job sweep, and why both remember their
result rather than re-running.

**The rename missed the card on Today, which is where it is read
most.** Reported with a screenshot: _"why do I still see limits."_ The
`/limits` page had been renamed twice by then and `LimitsCard` had not —
its section heading, its own header, its two group labels and its fold
all still said Limits and Targets. **A screen is renamed where the thing
is used, not only where it is managed**, and this app puts those in two
places on purpose.

**Every existing pool drew the same icon, which is worse than none.**
Also reported from that screenshot: _"a repeated icon next to each
thing."_ Exactly so — no pool written before the `icon` field has one,
so `poolIcon` handed them all the fallback flask and two different
substances wore one picture.

`poolIcon` takes the **name** now and guesses from it when nothing was
chosen: caffeine reads as a mug, THC as a leaf, water as a droplet. **A
guess is only ever the fallback** — an explicitly chosen icon always
wins, so this can never overrule a decision somebody made. It is a
derivation rather than a migration, the rule `shelfOf` already follows:
nothing is written, and a pool that never opens the picker still looks
like itself.

**"Rations" became "Restoratives", and the reason is the one that
started this whole rename.** Reported: _"I don't like rations as a name,
makes it seem like something I have limited of."_ Exactly right — a
ration is by definition an amount you are _issued_, which is the
scarcity signal water and vegetables must not carry. It is the same trap
"Limits" had one rename earlier, walked into while fixing it.

**The pair now reads Potions / Restoratives**: one you spend and one
that puts health back, and neither word implies a rule you are keeping.
The section name, the direction toggle, the add button, the empty state
and the health bar's own link all say it — the lesson from the previous
pass, where only the headings changed.

**"Limits" survived the first rename in every place that was not a
heading.** Reported as _"it's still framed as limits when I want it
framed like rechargeable buffs."_ The page title and the two section
names had changed and the working copy had not: "New limit", "Stay
under", "What are you limiting?", "Nothing limited yet". A rename that
only reaches the headings is a rename of the table of contents — the
controls are where somebody actually reads the words.

**The shipped Kush suggestion is gone**, on request. What ships as a
suggestion is the app guessing at somebody's life, and a guess nobody
wanted is worse than an empty list. The two left are the ones with a
_number_ worth shipping — a published caffeine ceiling, a standard-drink
count — rather than substances the app assumes you use.

**The health bar was invisible and that was my absent-never-zero rule
misapplied.** It returned nothing when no ration existed, on the
reasoning that a bar at nought reads as dying. True of the _bar_, and it
made the whole feature undiscoverable: nothing had been set up and
nothing said so. It draws a flat track and a **Set rations** link now —
no percentage claimed, no colour claimed, and a way in. **Absent is the
right answer for a number and the wrong one for a control.**

**Craft became Crafting, and it is things you built.** Asked for as
_"can we make craft into crafting and it shouldn't be any dailies or
housework, just the diy stuff I work on myself or Legos from my codex."_
It was quests, the house and the tech tree; it is now one area, split
off two others rather than being a new place to log things.

- **Lego is a Codex category**, counted in **bags** — the unit a set
  arrives in and the one you stop at, where pieces would be precise and
  useless. It is the one category that is not something you consume,
  which is why it feeds Crafting rather than Intellect.
- **House jobs you do yourself.** A DIY job's closed steps pay Crafting;
  a hired job's still pay Base. Getting a plumber in is a thing you did
  and worth the points, and it is not crafting.

**Nothing pays twice.** `tallyActs` takes Lego items out of the backlog
acts and DIY jobs out of `base.action-closed` before counting — the same
split `belongsTo` already makes for a chore, which is rule three holding
by construction. The crafting acts use the **same rates** as the acts
they are split from (5 a progress day, 40 a finish, 20 a step), so
moving a record between areas never changes what it is worth.

**`Project.approach` is stored now, and that reverses a decision
recorded in this file.** The old note said the approach must not be
stored: a project carries its steps, and "Find the right person" against
"Work out what it needs" says which errand it is more plainly than a
field would — and a field needs something that reads it.

Something reads it now. Which errand a job was became a **scoring**
question rather than a display one, and the steps cannot answer it: they
are free text the moment anybody edits one, and a job whose steps were
retyped would silently stop paying. **Absent means neither**, which is
the honest reading of every job filed before the field existed — there
is no telling from a step list what somebody meant, and guessing would
hand XP out on a string match. Those keep paying Base.

**`projects`, `base` and `upgrades` joined `UNCLAIMED_AREAS`.** Quests,
housework and buying things pay the level and have no bar, which the
traits-as-a-selection change made expressible.

Driven: a finished Lego build paid **Crafting 45** (a progress day at 5
and a finish at 40) and the Codex nothing, while a book in progress paid
**Intellect 5** — 50 total against a level reading of 50/100.

**Four traits, no header, no blurbs — and traits stopped being a
partition.** Asked for as _"drop the traits header and description …
drop the descriptions on traits and drop discipline, fortune and
wayfaring completely. Add stamina as a trait that gets boosted from
cardio work."_

**This is the model change on the page, so it goes first.** Every area
used to belong to exactly one trait, which is what made the bars sum to
the XP total exactly and rule three hold by construction. Dropping three
traits left six areas — habits, limits, challenges, job search, finance,
exploration — with no honest home among the survivors. Forcing them in
would have made Craft a catch-all holding half the app, which is the
invented structure this file has refused since the traits were written.

**So the bars now add up to less than the level above them.** That is
the exact symptom the old guard existed to catch. What makes it a
decision rather than the bug: `UNCLAIMED_AREAS` names the six, and
`traits.test.ts` asserts that list _exactly_, so an area added tomorrow
with no trait still fails the build until somebody says which it is. The
sum test changed from "splits the XP total exactly" to "sums to the XP
of the areas it claims, and falls short of the total" — the
double-counting half is still guarded; only the totality claim moved.

**The caption had to go with the header, not just because it was asked
for.** "Your XP, split by what earned it" stopped being true the moment
this became a selection: it is _some_ of your XP now, and a caption
saying otherwise would be the one wrong thing on the card.

**Stamina needed its own area, and that is the whole mechanism.** A
trait re-presents the XP of the areas it claims and an area feeds
exactly one trait — so conditioning could not stay inside `training` and
feed a second bar. `cardio` is a `LifeArea` with one act,
`cardio.session-logged`. Nothing about how conditioning is planned or
logged changed; its sets still pay `training.working-set-logged`. What
changed is which bar the doing of it shows under.

**Counted from `hasConditioning`, which asks whether, not how much.**
A completed session containing a conditioning entry with at least one
_completed_ set. **The slot is not enough** — every session of the
shipped programme schedules conditioning, so counting the slot would pay
Stamina on every lifting day whether or not anybody walked anywhere.
That is the case `conditioning.test.ts` exists for.

**30 points against a session's 50**, because conditioning usually rides
along with a lifting session rather than replacing it — it fires on a
day that has often already paid for the session and its sets. Matching
50 would make Stamina climb fastest on heavy days, which is the reading
backwards. Flat, so a twenty-minute walk and a brutal interval session
are worth the same: paying by duration would make the easy Zone 2 work
the programme leans on the least valuable thing in it.

Driven with three seeded sessions — lifting only, lift plus a completed
walk, and a walk that was skipped. Strength 165 (3 × 50 + 3 sets × 5),
Stamina 30, total 195 against a level-2 reading of 95/300. **The skipped
session paid Strength and not Stamina**, which is the whole point.

**"Earned this season" and the ladder legend are both gone, and Today
now ends on the challenges.** Asked for as _"let's actually entirely get
rid of the 'xp earned this season' section, along with the last 'the
ladder' section."_

**The season card holds one reading now, so the rule inside it went
too.** A rule says "these are two different readings" and there is one:
the heading names a chapter of the year and what is under it is what you
have taken that chapter up on. `SeasonBand.tsx` is deleted. The XP is
not lost — it is the ring and the level at the top of the screen, over
all of your time rather than this quarter of it.

**What the legend cost is worth naming.** Untrained through Elite now
have no explanation anywhere on screen. They are still anchored — the
thresholds are in `domain/game/character.ts` and every ladder row states
the load or figure its next rung needs — but the sentence saying the
scale is not the app's to move lives only in the code. **If a rung ever
reads as arbitrary, that sentence goes on Train**, beside the badges it
explains, rather than back on the home page where it was a key to
symbols that appear elsewhere.

**Four `SeasonProgress` fields are now computed and read by nothing** —
`xp`, `target`, `elapsed` and `months`; only `label` and `daysLeft`
survive, for the section heading. That is the shape this file already
condemns once, where `SeasonProgress.areas` was deleted "because a field
nothing reads is a tally computed on every render", and `useSeasonProgress`
runs `tallyActs` **twice** — this season and last — for numbers nothing
draws.

It is left in deliberately rather than trimmed in the same breath.
Removing `xp` takes the previous-season comparison and the windowed
tally with it, and with them `season-progress.test.ts` → "sums the
seasons to the all-time total" and "excludes an act with no date from
the all-time total too" — the guard that keeps all-time equal to the sum
of its seasons. **That is a measurement to stop taking, not a section to
delete**, and it is a separate decision from this one.

**The stray-links block is gone entirely, and each screen found a
parent instead.** Reported as _"it just felt random having those as
stray links while everything else fit nicely into a gamified layout"_ —
which is exactly right about what it was: a row of chips whose members
shared only the absence of a tab, which is a fact about the navigation
rather than about the person.

- **Resume and Mind hang off Job search**, in its header. _"Resume
  should be navigable from the improve income/job search stuff, and mind
  is really training for job interviews so it should probably go to
  there."_ The resume is the document these applications are matched
  against, so the link sits where the matching happens.
- **Job search hangs off Quests**, in its header, and that link is what
  makes the two above safe. An arc stage does link to Jobs — but only
  once an `offers` stage exists, and the leads card is silent when
  nothing is out. **Two conditionals deep is how a screen becomes
  unreachable**, which is what the block existed to prevent. A tab is
  unconditional, so the chain is rooted there.
- **Houses hangs off the arc's house-search stage**, which already
  worked: `EVIDENCE_SCREENS` maps `homes-viewed` to `/houses`. Nothing
  was built for it; it was verified by seeding a real arc and clicking
  through, because it is now the _only_ route.

**A header action is the established place for a related screen** —
Train has carried Plan and History that way for a long time. What makes
these different from the block is that each is _about_ the screen it
sits on.

**`AREA_LINKS` is deleted, and the note where it stood says not to
bring it back.** The right fix for a routeless screen is to find the
screen it belongs to. Its members were only ever united by a gap in the
navigation.

**The verification caught nothing and the method still mattered.** The
first pass at checking the Houses link reported it missing — the link
renders as "Houses →" and the test matched "Houses" exactly. The app was
right and the check was wrong, which is worth recording because the
opposite conclusion was one keystroke away: a route deleted on the
strength of a bad assertion.

**Social is gone, and the navigation is eight tabs.** Asked for as
_"let's clean up the areas section, seems unnecessary … tech tree and
finances should be its own tab, let's replace the party section … I'm
not interested in tracking social for now so let's drop charisma and
related stuff."_

**Eight cells, measured rather than reasoned about.** 47 pixels each at
375, the widest label ("Finance") 41 — nothing clips. At **320** the bar
is 352 against 320 and the last tab is cut by 32, exactly the figure
this file predicted; the 44-pixel target is an accessibility floor and
does not shrink, so 320 would need a scrolling bar. Taken deliberately.

**"Tech" rather than "Tech tree"**, because nine characters measure past
the 47 available. The screen keeps its full name. Same trade "You" made
for "Character".

**The Areas block became "More", and shrank from seven chips to three.**
Four had grown a better route — Finance and the tree are tabs, Job
search is reached from a main quest's stage and the leads card, Limits
from its own card's "Set up". **The three left are there because
deleting the block outright would have orphaned them**: `/mind` and
`/resume` were linked from _nowhere_ else, and `/houses` only from a
campaign stage that has to exist first. Checked by grep before deleting,
which is the whole reason that list exists. It is named "More" rather
than "Areas" because it no longer describes areas — calling them areas
invites the next area onto a list that is trying to empty.

**Charisma is the second trait deleted, and for the opposite reason to
Vitality.** Vitality went because no act could ever fill it; Charisma
went because the person stopped wanting the thing measured. The area,
its act, its rating, the screen, the tab and the agenda's overdue rows
all went with it.

**The records were deleted, and the store was not.** A new migration
step at `DB_VERSION` 19 clears `friends`; the store stays because
removing it means editing the step that creates it, which is the one
thing `database.ts` must never do. Fourth retired store, typed locally
as `RetiredRow`. It also had to leave the sync payload, both targets,
the backup collection and the tombstone list — otherwise another device
would push the people straight back and the deletion would not stick.

**`/party` is a redirect, not a deleted route**, the rule `/next`,
`/character`, `/vitals` and `/gear` already follow: a PWA shortcut is
registered with the operating system at install time.

**One guard got stronger.** `sheet.test.ts` → "has a counted or
deliberately absent entry for every declared act" used to permit
`social.hangout-logged`, the one act the registry declared that
`tallyActs` could not count. It asserts `[]` now: every declared act is
actually wired. A second test asserting hangouts stay uncounted was
deleted rather than kept, because with the act gone it passed for the
wrong reason — a test that cannot fail is worse than no test.

**Four review tests moved rather than being deleted with their
example.** They used social as the _vehicle_ for testing the spine —
what a draft opens on, what a save re-reads, and the source-vs-metric
key bug this file calls "silent and total". Deleting a rule's tests
because the example went away is how a rule stops being enforced without
anybody deciding to. They run on `upgrades.owned-share` now.

**Seasonal challenges, and a pass that fills against a real
denominator.** Asked for as _"what if we added seasonal 'challenges'
that would be worth extra xp, and completing them would be working
through a 'battle pass'. Think more like completing holidays stuff and
events related to that time."_ `domain/challenges/challenge.ts`.

**A literal battle pass was the one part that could not be built, and
the reason is written in this repository already.** `season.ts` refuses
numbered tiers at thresholds the app picks, in nearly those words, as
"a scale the app can move". So the pass counts **challenges done over
challenges that exist** — nine this season, four finished. That is a
denominator taken from a list rather than a number chosen here, which is
what lets a progress bar mean something. It was flagged before building
rather than after.

**A challenge is an act, which is why it may pay at all.** Carving a
pumpkin is a thing you decided to do and then did. Flat XP, like
everything else: difficulty deliberately does not scale it, the rule the
practice log holds, because paying more for a harder one turns a season
into something to optimise.

**Completion is never gated by the window.** A Halloween challenge
ticked in January is odd and is still a thing you did. Refusing it would
be the app policing a calendar, which is the call campaign stages
already made in being ordered but not gated.

**The catalogue ships and is editable, which is the only arrangement
that survives both objections.** A shipped list makes the app assert
what your year contains; an empty one makes a feature nobody fills. So
every shipped challenge can be removed and any number of your own added.
The list is northern-hemisphere and largely American, stated in the file
as a limit rather than hidden.

**Windows are `MM-DD` and the year comes from the season.** The
catalogue describes Halloween, not Halloween 2026, so one row serves
every year without a migration each December. A shipped row is placed by
matching its month against the season's own `YYYY-MM` months — which is
what makes **Winter** fall out with no special case, since it is named
for the year it ends in and contains the previous December. A window
closing in an earlier month has run into the next year.

**A shipped instance is addressed `<slug>:<year>`.** A bare slug would
mean carving a pumpkin once marked every future Halloween done.

**Removal is `hiddenAt`, never a delete.** The catalogue lives in the
bundle, so deleting a mark would put the challenge straight back on the
next release. A completion already recorded is left underneath and goes
on counting: removing a challenge says you do not want to see it, and it
cannot unmake an afternoon you spent.

**One stored shape covers all three edits** — a completion, a removal
and a challenge of your own are all "something said about a challenge
id". That is what keeps an editable shipped list to one store rather
than two.

**`challenges` is a `LifeArea` under Discipline, and that assignment is
the weakest link.** It has to be an area to pay XP, and every area needs
exactly one trait. A seasonal challenge is explicitly _not_ an ordinary
day, which is what the rest of Discipline is about — the thread is
deliberateness, and it was the closest of seven rather than an obvious
one. Craft is things built, Charisma is people seen, and a trait of its
own would be an eighth bar fed by one act. **If challenges grow past a
seasonal list, revisit this first.**

**`SheetDeps` gained the repository, `MeasureDeps` did not.** Nothing in
the monthly readout measures challenges, and widening the spine's
interface would make every evaluator and test double carry a repository
none of them ask about.

**The store joined in every place a collection has to**, and the
machinery found most of them: the compiler caught the payload, both sync
targets, the backup collection map and four test harnesses;
`repositories.test.ts` caught the store list; `traits.test.ts` caught the
missing trait; the `FIGURES`-style guards caught the rest. `DB_VERSION`
went to 18 with a new guarded block.

**The pass and the season's XP are one card, with a rule between.**
Asked for as _"let's group together the season challenges and progress
into one card so that it's a distinct season section."_ They were two
cards under one heading, which drew the boundary in the wrong place —
the same merge `SheetCard` already made of the portrait, the season and
the traits.

`ChallengePass` renders a **band rather than a card** for that reason:
the card belongs to the caller, which is what lets it place the rule
between the two rather than each band guessing what follows it. The rule
is there because these genuinely are two readings — what you have taken
up this season, and what the season has earned. The sheet card omits one
between the portrait and its season for the opposite reason: those are
one quantity over two windows.

Driven end to end: ticking one took the pass to 1/5, the season to 40,
the level to 40/100 and Discipline to 40 xp **in one render** — then add,
hide and untick each behaved, and the denominator held at 5 across a
hide and an add.

**The season sits below the day, and this is its third position in as
many passes.** Asked for as _"I'd move season info underneath traits and
today."_ It was a section of its own, then a band merged into the
portrait's row, and it is now a `Section` of its own again — beneath
Today, above the Areas list and the ladder legend.

The reason it settles here is one the earlier moves did not have: **a
season is the slowest thing on this screen.** It changes four times a
year where everything above it changes today, and the ordering this
screen has always argued about — work first, readout last — puts the
slowest readout at the bottom rather than in the first thing seen each
morning. It sits above Areas and the legend because those two are
navigation and reference rather than readings.

**Both halves moved, and that is the rule worth keeping from three
attempts.** The name went with the measurement rather than staying in
the portrait column: a label at the top and its bar two screens down is
one quantity drawn in two places, which is the split the sheet card was
assembled to close. Wherever it goes next, the name and the reading
travel together.

Measured: Today's first heading is at **783 pixels**, from 941 after the
ladders left and 1,309 before any of it.

The paragraph below is the arrangement this replaced, kept because it is
the argument that will be made again.

**The season sat in the avatar's own row, and the rule between
them is gone.** Asked for as _"can we move the season progress up into
the row with the avatar and clean it up a bit."_ The season names itself
in the column beside the portrait — label on one line, days left on the
next — and its bar runs full width underneath, which is the only place a
meter fits: the column beside a 120-pixel figure is about 200 wide at
375 and loses another 40 to the settings link.

**No rule between the two, and still one before the traits.** A rule
says these are separate readings; the level and the season are one
quantity over two windows. The traits keep theirs because they are that
same quantity split a third way, which is a change of kind rather than
of scale.

**Three things went in the clean-up and one is a rule worth knowing.**
The "By month" caption — three bars labelled Sep, Oct and Nov under a
season already write that sentence. The paragraph explaining that the
target is last season's own figure rather than a curve the app made up —
true, in `domain/game/season.ts`, and printing it every morning is the
narration being moved away from. And **the date**, which the header had
left behind: the season line says where you are in time at the scale
this card works on, and a screen opened daily does not need telling what
day it is.

**"Autumn 2026 · 90 days left" wrapped after the middot**, leaving _days
left_ alone on a line. That is the second mid-phrase break this column
has produced — the first was "45 / 100 XP into the level" — so the rule
it earns is plain: **a joined phrase does not go in that column**, it
stacks or it goes full width.

**The season and the traits are bands of that card, not sections after
it.** Asked for in the same breath: _"merge in the season and attributes
stuff into the first card."_ They merge cleanly because they are one
reading at three resolutions — the level is XP over all of it, the
season is XP over this chapter, the traits are the same XP split eight
ways. Three headings and 2rem of air between them had been claiming
three separate questions.

**The share went with them.** _"Let's get rid of the info like 100
percent of xp from dailies."_ It was the evidence for the calling and
outlived it by a day. What it said is not lost and is better said by
what is now under it: the season band names **where this season's XP
came from, area by area**, and the traits split the whole of it — both
show the arithmetic where the percentage reduced it to one figure.
`mainstayFrom` is deleted rather than left exported, because a
derivation nothing calls is the trap this file keeps recording.

**Four things came off that card in the pass after it**, and each one
had an argument for existing that is worth knowing before anybody
rebuilds it.

The **XP rule's fold** — "45 XP all time — what counts?" over a
paragraph saying XP is paid for doing a thing and never for it having
worked. This file argued that deleting it would be worse than folding
it, because that sentence is what stops XP being read as a measure of
how well anything went. The answer is that a rule is worth meeting once:
it is still in `docs/GAME_MODEL.md` and `registry.ts`.

**The number stayed at the time and has since gone too**, on _"let's get
rid of the phrase into the level and XP all time — I'm trying to move
away from the app explaining everything, rather than it just being self
explanatory like in a game."_ The card reads `45 / 100 XP` under the
level and nothing else: a level, a fraction and a ring filled to the
same fraction is a thing every game has already taught, where the two
removed phrases were the app narrating its own model.

**The all-time total went with its words rather than losing them**, and
that is the part worth keeping: "45" under a level bar reads as the
level bar again, so the phrase naming it was the whole of what made it a
second quantity. Deleting a measurement is still a larger step than
deleting an explanation — this one is a line in `PortraitBand` if the
number is missed.

The **gear**: _"no need to track or show upgrades in that card."_
Nothing about upgrades changed and the tech tree still owns them.
`gearFrom` is deleted, which takes `upgrades` out of `buildAvatar` — so
a portrait no longer loads a whole store — and leaves every field on the
avatar a reading of XP or the calendar.

The season's **"Where it came from"**, which listed each area that had
earned anything this season. The traits band directly beneath says the
same split over the whole of your history, so what was lost is a
comparison rather than a fact. `SeasonProgress.areas` went with it,
because a field nothing reads is a tally computed on every render.

And the **review link**, covered above.

**The cost is depth, and it is measured rather than guessed.** The
day's first heading sits about 1,250 pixels down — a screen and a half
on a phone. That is the cost this page's own note predicted when the
progression moved above the checkboxes, arriving in full. If ticking a
habit starts to feel buried, **fold the traits** rather than restoring
a section heading: they are eight rows with a blurb each and by far the
tallest thing in the card.

**Nothing is drawn twice, and one commit got that wrong.** The
`Section title="Level N"` wrapper is gone, because the header names the
level and the ring's badge shows it. The progress into the level was in
the subtitle for one commit — directly above a card already saying "75 /
900 XP into the level" — which is the duplication this component exists
to reduce rather than add to. Caught by looking at the screen. There is
no compact ring in `leading` either, for the same reason: the portrait
is 120 pixels below it and its ring _is_ the XP bar.

**The XP rule folds away rather than being deleted.** Reported as
_"the blurb underneath the avatar might be overkill, explaining
everything"_ — fair, since it is a rule and a rule is worth reading once
rather than every morning. Deleting it would be worse: it is the
sentence that stops XP being read as a measure of how well anything
went, and somebody meeting the number for the first time still needs it.
A `details` keeps the number out and the sentence one tap away.

**Today is present tense, You is standing.** That line decides where a
thing goes. Dailies, the active quests, what is due and the season all
describe now, so they live on Today; levels, ladders and ratings describe
where you have got to, so they live on You. The season was on You first
and was wrong there — a season is a chapter you are _in_.

**The monthly review screen is gone**, asked for as _"I don't really
need a monthly review page or link since we can view trends on the home
tab."_ Its link sat beside the season, on the reasoning that both answer
"how is this stretch going" and that a link nobody passed was the only
prompt to file one. That reasoning was right and the conclusion it
supported has been overtaken.

**What that costs is not the screen, and it has to be said plainly: it
is the ratings.** Filing a month was the only thing that ever wrote a
`MonthlySnapshot`, and a rating is a **direction**, which needs two
points in time. With nothing recording them, every area's rating is
absent from here on. The area cards that displayed them have since been
removed too, which is the tidier end state: the rating half of the model
is dormant and nothing on screen implies otherwise. Months already filed
still read — `readout` is untouched — so this is a stop
rather than a deletion.

**`measureAll` is live and must stay**, which is the part that would be
easy to get wrong when tidying: the sheet's **ladders** read it. Only
the recording half went dark. The write use cases — `draftReview`,
`saveReview`, `saveMetric`, `retireMetric` — are deliberately kept
despite having no caller in the app, because they are how
`review.test.ts` constructs a recorded month in order to test `readout`,
which is live code. Deleting them would delete that coverage, and
restoring the screen would then be a rewrite rather than a route.

**Custom metrics can no longer be created**, for the same reason:
`saveMetric` had no other door. Existing ones still read.

Within Today the order is work first, readout last: the season sits below
everything actionable, because a progress bar above the checkboxes makes
the first thing you see each morning a score rather than a task.

**The season and the review are two different questions.** The season
(`domain/game/season.ts`, `use-cases/character/season-progress.ts`) is
live progress through Winter, Spring, Summer or Autumn, and needs no
stored anything — every act carries a date, so it is derived from records
that already exist. The monthly review is retrospective: it _records_
values so a rating can judge a **direction**, and a direction needs two
points in time, which is the only reason snapshots exist at all. Naming
the review "Season review" was wrong on both counts and is undone.

**The season bar fills against last season, not a tier curve.** A battle
pass normally has a hundred tiers at thresholds somebody invented, which
is precisely the "scale the app can move" the game model refuses
everywhere else. Your own previous season is external to the season being
measured and moves only because you moved it. A first season has nothing
to beat and says so rather than filling a bar against zero.

**An act with no date counts in no window at all, the all-time one
included.** `tallyActs` takes an optional `Within` so one implementation
serves all-time, a season and a month — and the strictness is what keeps
all-time equal to the sum of the seasons. Counting an undated act once in
the total and never in a season would put two numbers on one screen that
quietly disagree. Every operation that performs an act stamps it, so this
only excludes records that were already malformed.

**Seasons are meteorological and northern.** Dec–Feb, Mar–May, Jun–Aug,
Sep–Nov, so they sit on month boundaries the existing keys already use;
the astronomical ones start at solstices and would cut months in half.
Winter is named for the year it **ends** in, so December 2025 and January
2026 are both Winter 2026 — the one case in here worth a test, and it has
several.

**A shipped change to a default reaches nobody who has already opened the
app, and `SETTINGS_SCHEMA_VERSION` is the way out.** Settings are
persisted on first run, so **the store cannot tell a value the lifter
chose from a default it saved on their behalf.** `completeLiftSessions`
and `completeMuscleVolumes` correctly refuse to overwrite either — which
meant the overhead press shipped and nobody saw it, because every stored
copy had `bench: 2` and no `press` key. The programme on the device went
on using numbers from the version it was installed under, and the only
way out was a button on the Settings screen nobody knew to press.

The version was stored and never read, deciding nothing. It now gates
`liftSessionsOf` in `settings-store.ts`: a copy older than schema 2 is
re-seeded wholesale rather than completed, because completing it produces
neither the old programme nor the new one — the bench keeps both upper
days and the press has nowhere to go.

**Bump it for a change of _meaning_, not for every change of value.** It
overwrites a real choice, once, for anyone who had deliberately set the
bench to twice a week; that is the price of not being able to tell that
apart from a default. A default that merely moves is still surfaced by the
divergence card rather than forced.

**A field added to `AppSettings` must be added to the parse.**
`infrastructure/storage/settings-store.ts` builds its result field by
field rather than spreading, which is what makes an unknown blob safe —
and what makes a new field silently vanish on the way back in. This has
now caught two fields: `updatedAt`, which meant settings were stamped on
every write and never synced, and `exploredRegionKm2`, which meant the
exploration ladder read "nothing measured" against a number sitting in
storage the whole time.

**Logging progress is serialised per item, by hand.** `serialise` in
`features/backlog/hooks.ts`. It is a read-modify-write, so two in flight
at once count two taps as one. React Query's `scope` does exactly this job
and was tried first: it queues correctly and then does not drain when an
observer unmounts mid-queue — which a hot reload does — leaving the row
permanently dead with no error anywhere. Four lines of promise chain has
no such failure mode.
**Upper, lower, upper, lower — and no borrowing.** `RpDay.muscles`,
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
**The deload keeps the muscle's frequency and shrinks the session, and
getting there took three fixes and one reversal.** `setsPerSession.deload`
is 2, so a muscle trained twice a week gets two sets on each of those two
days.

The frequency backfill does not run on a deload at all. It places at the
slot floor regardless of the target, so it was putting three sets on both
upper days and the biceps came out at six in the deload and six in the
peak week. Frequency is a means to volume, and on the one week where the
goal is _less_ volume a floor that only ever adds has no business firing.

`floorFor` caps the slot floor at what the settings say a session holds,
because a floor above the ask schedules nothing — a flat three against a
two-set deload delivered zero.

**And the third fix had to be undone when the model changed under it,
which is the part worth remembering.** `shareOwed` briefly forced the
deload to a single session. That was right while a deload target was a
weekly _total_ of two sets: spreading two over two days asks for one each,
under any floor, and scheduled nothing. The deload is now stated per
session, so the frequency is already accounted for — and the override
survived long enough to deliver the whole week in one sitting: four sets
on Monday and none on Thursday, for a setting that reads "two sets per
session". A fix that encodes the shape of the model it was written against
outlives its reason silently.

**A muscle's numbers depend on that muscle and nothing else.** Two
settings multiplied makes this nearly impossible to break, which is
exactly when the warning is worth keeping: there used to be a
`spreadFactor` scaling every target by how crowded the top tier was —
sound reasoning ("prioritising everything prioritises nothing"),
catastrophic as an implementation. Every target depended on every other
muscle's placement, so moving the biceps out of tier 1 silently raised the
side delts from 22 to 24, and a lifter could not state a mental map
without the app renegotiating it. The idea returns as a reasonable
suggestion rather than as a bug. **Do not reintroduce a cross-muscle term
here.**

**"You cannot prioritise everything" is a capacity report, not a
multiplier.** It lives on the Plan screen: the settings state the ask, and
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

**Nothing scales today's session from a self-report, and the rule behind
that survives the thing that broke it.** A readiness check used to claim
it trimmed a session and never did — it is gone. What must stay true is
the second half: a bad night is not evidence about **intent**, so
nothing may write back to a muscle's sessions or level. Those are the
lifter's statement of what they mean to do. The load is autoregulated
set by set by RTS instead, which is a reading rather than a rating.

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

**The grip and the trunk go last.** `TRAILING_MUSCLES` — forearms and
core — sort after every other lift and before the conditioning. Both are
prime movers in work they are not the point of: the forearms hold every
row, chin-up and deadlift, and the trunk braces every squat and press. A
session that curls the wrists first arrives at its pulling with a grip
that gives out before the lats do.

Applied **after** the alternating reversal rather than inside the sort,
because the reversal would otherwise flip them to the front on every
second session — the exact arrangement this prevents, arriving by a route
that looks like variety. And reinserted at the last accessory position
rather than appended, or a kettlebell swing ends up ahead of a wrist curl
and "finishes with conditioning" is quietly undone.

Worth knowing where they land: **the forearms are on upper days and the
core is on lower ones** (`LOWER` in `rp-splits.ts`), so the rule shows up
as a wrist curl closing an upper session and ab work closing a lower one.
Both are at zero sessions by default, so neither is scheduled until
somebody turns them on.

**The session preview groups consecutive runs, and must never group
by role.** `inSections` in `domain/programs/program.ts`, used by the Train
screen's next-session card. Splitting the warm-up into a row per movement
took that card from nine rows to sixteen, a third of them the same five
things every session, so it reads as sections now — Warm-up, Strength,
Compounds, Isolation, Conditioning — with the warm-up folded.

Grouping by role would look identical almost always and would be **a
fourth opinion about session order**, competing with `inSessionOrder`,
`reverseAccessoryBlocks` and `trailingLast`. The last one is where it
breaks: it moves the grip and trunk work to the end of the accessory
block _past slots of another role_, and a by-role pass would quietly pull
a wrist curl back above the isolation it was deliberately placed after.
Consecutive runs cannot reorder anything, at the price of a heading that
can repeat — which is honest rather than a defect.

The headings are deliberately not `SLOT_ROLE_LABELS`: that map answers
"what kind of work is this row" for a badge and therefore collapses
`hypertrophy` and `assistance` into one word, which is exactly the split
a heading needs. Only the warm-up folds, because it is the one part that
is the same every session and asks for no decision.

**The accessories run backwards on alternate sessions of a region.**
Compounds still precede isolation — each block is reversed within itself,
never across the boundary — so what changes is which muscle meets a fresh
lifter. A fixed order spends the fresh part of every session on the same
muscle for a whole block: the row opened both upper days and the lateral
raise closed both, every week.

The cost is the mirror of the rule it bends, and it is why this
alternates rather than applying to every day. Compounds are ordered
heaviest-first so the work that most needs a fresh lifter gets one, and on
the reversed day the heaviest compound goes last — each arrangement is had
half the time. The parity is counted per _region_ rather than from the day
index, for the reason the exercise rotation had to be: the two upper days
of a four-day split are indices 0 and 2, both even.

**Names are derived, never written.** `describeDay` reads a day's `label`
and `focus` off its finished slots; `describeBlock` reads the block's name
and description off the tiers. A hardcoded "Monday — press and pull" is a
claim that goes stale the moment a tier moves. The `focus` line separates
direct work from what the day only pays incidentally, ranked by share of
each muscle's weekly target — merging the two named an upper day after
the core, because pull-ups pay it a fraction and its target is small
enough for that fraction to win. The heading is **which half of the body, and which time
through** — "Thursday — Upper 2", from `RpDay.focusName`; the muscles are
the sentence under it. It named the kinds of work present until every day
carried all three, at which point four identical headings distinguished
nothing. **Every muscle with direct work is named**, uncapped: a reader
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

**A variation shares its `pattern` with the movement it varies.** The
underhand barbell row is `horizontal-pull` like the overhand one, and the
chin-up is `vertical-pull` like the pull-up. The weekly repeat penalty
keys on `primaryMuscle|pattern`, so giving a variation its own pattern
would let the week schedule both and count the muscle trained twice under
two names — which is the bug that key exists to stop. Sharing it makes
them one movement the rotation alternates between.

**A lift rotates through variations; the competition version is always
first.** `STRENGTH_VARIATIONS` in `domain/exercises/catalogue.ts`. The
bench runs **paused, touch-and-go**, the squat **low bar, high bar**, the
deadlift **sumo, conventional**.

**A day holding two competition lifts runs one comp and one variation,
and the competing lift goes first.** Two maximal efforts in one session is
one thing avoided; a top set taken _after_ another lift's top set and
back-offs is the other — a top set is a reading before it is training, and
that one reads low for a reason that has nothing to do with strength.
**Lower 1 is low bar then conventional, Lower 2 is sumo then high bar.**

That is why a paired day takes its variation index from its position in
the pair rather than from the lift's own session ordinal: the lift that
opens is competing and takes index 0. A lift alone on its day still walks
the rotation in order — which is what makes dropping a lift to one session
a week cost the variations rather than the lift the total is measured on.

**The within-day order has been three things, and the third answers the
objection the second one recorded.** It alternated by day; then it was
fixed to squat-first, with a note that whichever lift is second is second
every session for a whole block, making the deadlift permanently the tired
lift. Ordering by which lift is competing today alternates on its own,
because that alternates — so neither lift is always second and neither is
always the one being measured. `rp-assemble.test.ts` → "opens a paired day
with the lift that is competing".

**A rotation shorter than the frequency repeats.** `strengthSlugFor` takes
the index modulo the rotation length, so a single entry is a deliberate
way to say "always the competition version" rather than an omission. The
squat was written that way for a while and the deadlift before it.

Adding a variation is adding a row here, and three more things: converting
that exercise to `intent: 'strength'` with `loadBasis: 'estimated-1rm'`,
which takes it out of the hypertrophy pool; adding a `VARIATION_OF` ratio
so the first session has a load to suggest; and checking what the
hypertrophy pool just lost. **Removing one is the same list backwards**,
and the backwards direction is the one that goes wrong quietly: a
strength-intent exercise no rotation names is scheduled by nothing at all,
so leaving it converted retires it from the catalogue without saying so.
The high bar squat made that round trip — into the rotation when the squat
had two entries, back to hypertrophy when it did not — and two
`VARIATION_OF` ratios outlived their rotations before anyone noticed
(close-grip bench, high bar squat), each deriving a max nothing loads.

Which variation a session gets is picked by the lift's session ordinal —
not by the day. Index 0 is the competition version so that dropping a lift
a tier, which buys fewer sessions, costs the variations rather than the
lift the total is measured on.

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

**Strength is double progression now, and RTS is gone.** _"Just do a
double progression for everything. No RPE or anything… Straight 3 sets
on anything."_ `domain/programs/progression.ts`.

**The whole method is two sentences.** Work in a rep range for three
sets; when every set reaches the top of it, put the next increment on
the bar. Strength runs 3–5, hypertrophy compounds 10–15, isolations
15–30, and every slot is three straight sets at one load.

**Nothing stores a working weight.** The load is derived from the last
session that trained the exercise, the way the programme itself is
derived from settings — so there is no "current weight" record to drift,
to lose, or to reconcile between two devices. `startWorkout` reads it,
because `resolve` is pure and reads no repository, and hands it to
resolution through `AthleteState.working` beside the estimated maxes.

**A slot with no history resolves to open**, which is the design rather
than a gap: the app does not know what you lift until you have lifted
it, and a number guessed from an estimate is a prescription nobody
chose. You type it once and it carries.

**Increments are 5 upper and 10 lower, derived rather than written on
every exercise.** Fifty entries would each need a number and forty-eight
would say five; `loadStep` overrides it where a movement differs. Lower
means **compound and lower** — a calf raise is a lower-body isolation
and ten pounds a session on one is a jump nobody makes.

**What the trade costs, recorded because it is real.** RTS moved the
load _within_ the session from a reading taken on the day, so a bad
night lightened the bar without anybody deciding to. Double progression
cannot: the bar is what it was until the reps say otherwise, and a bad
day is a day you miss the top of the range. In exchange the method is
sayable in two sentences and nothing is self-reported.

**The competition lift is one slot, not two.** The top-set/back-off pair
existed because they were different kinds of set — a measurement and the
work derived from it. Three straight sets at one load are one kind of
thing, and splitting them would put a lift on the session screen twice
for one trip to the rack.

**`rpe` and `rts-backoff` stay in the prescription union and must not be
tidied away.** Nothing prescribes them any more, but **a log describes
itself**: every `WorkoutLog` embeds the prescription it was performed
under, so sessions filed while RTS ran still hold `rpe` sets. Removing
the variants would not delete those records, it would make them
unreadable — the same reason the retired IndexedDB stores are still
declared.

**Gone with it**: `framework/rts.ts`, `backoff-stop.ts`,
`replan-backoffs.ts`, `RtsExplainer`, the back-off re-plan in
`log-set`, the live stopping-rule card in `SessionPlayer`,
`settings.fatiguePercent` and its editor, and `recipe.rts`. Eight tests
went with their subject; two were kept and re-pointed at what survives —
the frequency rule and the resolution shape.

**The training redesign is under way, and this is the first stage of
it.** Asked for as _"let's begin redesigning the training… just do a
double progression for everything. No RPE. Strength 3-5, hypertrophy
compounds 10-15, isolations 15-30. Straight 3 sets on anything"_, plus a
list of exercises to drop.

**What has landed: the catalogue cuts and the compound range.** Ten
entries are gone — the underhand barbell row, the chin-up, the upright
row, the EZ bar rear delt raise, the feet-elevated push-up, and all five
forearm movements — and compounds run 10–15 rather than 5–8.

**What has not, and why it is one piece rather than three.** Double
progression, three straight sets and the removal of RPE cannot land
separately: without RTS a strength slot has no load, and a percentage
would be the "the percentage _is_ the prescription" trap this file
records 5/3/1 being removed for. The load has to come from what you
lifted last time, which means the working load reaches `resolve` through
the athlete rather than being assembled — a change spanning
`prescription.ts`, `resolve.ts`, `AthleteState`, the assembler and two
large test files that encode RTS throughout. Shipping half of it would
leave a programme that prescribes nothing.

**The decisions are made and recorded here so the next pass does not
re-litigate them**: increments are per lift (5 lb upper, 10 lb lower,
5 lb isolation, a field on the exercise); the first session of an
exercise is **open** — you type what you did, and history carries it
from then on; and the customisation goes almost entirely — muscle
volumes, per-lift sessions, the fatigue setting, weeks-before-deload and
the priority tiers, leaving days-a-week, rounding, estimated maxes and
exclusions.

**The customisation is gone, which was the third and last stage.** Four
fields left `AppSettings` — `muscleVolumes`, `liftSessions`,
`setsPerSession` and `weeksBeforeDeload` — with the tier editor, the
Priorities section of Settings, the divergence card and
`liftSessionsOf`. What is left of the programme's inputs is **days a
week, rounding, the estimated maxes and the exclusions**: the things
that are about the person rather than about the programme.

**`defaultRpRecipe` already held every one of them as a default**, so
this was mostly a matter of no longer overriding them.
`recipeFromSettings` passes three fields where it passed seven, and the
constants it falls through to are the same numbers the app had been
shipping. **The programme did not change shape** — verified by driving
it, which still builds the same four days.

**The screens that read those settings now read the constants.**
`explainVolume` takes its three inputs with defaults rather than
arguments, because the tests still vary them and that is the whole
reason it is pure; the Plan and Program pages call it with none. The
history page's weekly target reads `DEFAULT_MUSCLE_VOLUMES` directly.

**A stored blob keeps the four fields and nothing reads them**, which is
deliberate rather than an omission. The parse builds field by field, so
an unknown key falls out on its own — no migration, no rewrite, and a
device that has run this build still holds the old values under their
old names. Reinstating any of them is a line in the parse rather than a
recovery.

**`SETTINGS_SCHEMA_VERSION` is now written and read by nothing**, and is
kept anyway. `liftSessions` was its only reader. The gap it exists for
has not closed — settings are persisted on first run, so the store still
cannot tell a value the lifter chose from a default it saved on their
behalf — and the next setting whose meaning changes needs a version
already sitting in every stored blob to compare against. Deleting it
would mean the devices that matter had no version on the day one was
wanted. The tests for the re-seeding it used to do went with the field;
the mechanism did not.

**The list of settings that travel is down to two.**
`SYNCED_SETTING_KEYS` lost four members, and `synced.test.ts` → "sends
the settings the program is derived from" checks `daysPerWeek` and
`excludedExercises` rather than a list of five. That list shrinking _is_
the change: the programme is not derived from the others any more, so
sending one would be syncing a setting nothing reads.

**A first strength session opens at 85% of the estimated max, and this
reverses the note above it.** That note said a slot with no history
resolves to open, full stop, because "a number guessed from an estimate
is a prescription nobody chose". Driving it showed what that costs: a
fresh install has four estimated maxes on the Standards card and offered
a blank bar for the bench, on a figure the lifter had typed themselves.

`firstSessionLoad` in `start-workout.ts`. **Strength slots only**, and
that restriction is the load-bearing half rather than a matter of which
lifts happen to carry an estimate: a share of a one-rep max only means
anything against a rep count. 85% is about a five-rep load, which is the
strength range and is nowhere near a set of twenty. Turning an estimate
into a load for an arbitrary range needs the RPE chart, which is exactly
what went with RTS — so an accessory stays open and says, honestly, that
the app does not know what you curl.

It holds for **one session**. The moment something is logged the log is
the source, which is what stops an estimate edited months later silently
rewriting a load somebody has been progressing by hand. There is a test
in each direction.

**The RPE field is gone from the logging form**, which is a removal
rather than a tidy-up. It was the third number on the row, plus a line
of coaching before the set and a reading after it — all of which was
true of RTS and none of which is true of double progression, where the
load descends from the _reps_. A logged RPE reached no rule, no
suggestion and no screen. `SetResult.rpe` went with the form that fed
it; `LoggedSet.actualRpe` stays, because sessions filed under RTS carry
real readings and history still shows them.

**The badge on a strength set reads "Working" and the record still says
`'Top set'`.** That string is written into every log ever filed and is
how `previousSetFor` tells a heavy set from a lighter one when comparing
against an RTS-era session, so changing it would make a new set read
against the wrong old one. The label is a different question: with no
back-offs, "Top set" names a position in a pair that does not exist.
`VARIANT_LABELS` in `program.ts` is that one mapping — **the value is
an address and the label says what the set is.**

**Four pieces of copy described the framework that went, and finding
them took driving rather than grepping.** Each read as an ordinary
sentence and each was false:

- The accessory slot's own note said _"Last set to failure; the rest at
  one rep in reserve"_ — printed on every accessory in the app,
  describing a rule nothing applied. **A note is not decoration**: it is
  the only place the session screen says what to do with the set. It
  states the range and the increment now, from the same numbers that
  built the slot.
- Settings' maxes editor said _"RTS decides the real weight by feel"_.
- The Train card said _"cut the back-offs short and the accessories grow
  to cover it"_.
- The session report said volume counted _"secondary work at half"_,
  which stopped being true when fractional credit was removed long
  before any of this.

**Plan's "Change any of it" card is "Why there is nothing to change".**
It described tiers and landmarks — wrong since the landmarks went — over
a link to a Settings section that no longer exists. It is kept rather
than deleted because the page is called Plan and a plan you cannot
change raises the question; answering it once is better than leaving
somebody to search Settings for something that is not there.

**Verified by driving the whole loop, which is the only thing that could
have.** A bench opened at 200 from a 238 estimate, three sets of five
were logged, the session filed, and the same lift **opened at 205 the
next week** — the +5 upper step, read out of the log. That round trip is
the entire redesign and no single test exercises it end to end.

**One exercise a week, and the two upper days stopped being the same
day.** Reported as _"I'm noticing redundancy in the exercises — don't
repeat dips or lateral raises on both upper days… barbell calf raise is
the only exercise we should repeat twice in the week."_ Dips, lateral
raises, rows, pull-ups and rear delt raises were all appearing twice.

**The cause is one line of arithmetic, not a bug in the picker.** One
exercise per muscle per session, times a muscle listed on both upper
days, is two slots — and the chest's hypertrophy pool holds exactly one
movement. So it filled both with dips. The rotation the picker does have
was working the whole time: the arms have four and two options and were
correctly getting a different movement each session.

**Two changes that have to move together.** `DEFAULT_MUSCLE_VOLUMES`
splits into `ONCE` (chest, side delts, rear delts, lats, upper back) at
one session at the **high** level and `TWICE` (biceps, triceps, calves)
at two at low. The level moving is the load-bearing half: a level is
choosing how long that single exercise runs, so halving the sessions and
leaving it alone would have halved the week. **Five sets in one session
against six across two** — very nearly the same volume, in one movement
instead of the same movement twice.

**And `UPPER` divides into `UPPER_1` and `UPPER_2` in `rp-splits.ts`**,
because setting a muscle to one session decides _how often_ and not
_which day_. The fill places the neediest muscle first, so left to
itself it would have put all five on Monday and left Thursday with the
arms.

**A muscle's accessory work sits opposite the lift that already trains
it**, which is the reason given with the report — _"since there's
overlap"_ — and is what makes this a pairing rather than two arbitrary
piles. The chest is benched on Monday so dips are on Thursday; the side
delts are pressed on Thursday so lateral raises are on Monday. The row
goes against the horizontal press and the pull-up against the vertical
one, which settles a question the report left open. Rear delt work goes
on the day without the row, asked for directly, because a row pays them
on the way past.

**Which day carries which lift is derived, and that is the seam.**
`assignStrengthLifts` places the bench and the press; these lists assume
the bench lands on `UPPER_1`, which it does because lifts are placed in
`STRENGTH_LIFTS` order onto the emptiest eligible day and the session
counts are now constants. If that ever inverts, the week still holds one
of each exercise and every one of them is on the wrong day —
**a no-repeats assertion passes just as happily either way**, which is
why there are two tests: "uses each exercise once in a week, apart from
the calf raise" and "pairs each muscle against the lift that does not
already train it". Both were checked against the reported bug by
reproducing it, and the first names the offender —
`dips on Monday — Upper 1 and Thursday — Upper 2`.

**The accessory reversal is conditional now, and this is a regression it
would otherwise have shipped.** `reverseAccessoryBlocks` exists so a
fixed order does not spend the fresh part of every session on the same
muscle for a whole block. That argument needs two sessions holding the
**same** work: reversing the second of two sessions holding _different_
work rotates nothing, because each day's order is then fixed for the
whole block anyway — while still paying the cost, which is that one day
permanently runs its compounds lightest-first and its isolation in
reverse priority order. Thursday started running rear delt raises ahead
of the arms, every week. It now fires only when the region's second
session is accountable for the same muscle list as its first, which
keeps it live for the lower days.

**A frequency setting can now ask for more sessions than the split has
days to give.** Side delts at two get one, because only `UPPER_1` lists
them. That is the deliberate cost of the pairing and it is why
`rp-assemble.test.ts` → "trains a muscle as often as its own setting
asks" runs on the **biceps** rather than the side delts — the arms are on
both upper days precisely because their pools hold several movements, so
twice is two exercises rather than one done twice.

**The block renamed itself and that was a third-time correction to one
sentence.** `describeBlock`'s focus was "the muscles in tier 1", then
"the muscles getting the most weekly sets" — better, and still wrong by
one set: the arms and calves came out at six against everything else's
five, so the Train header read **"Triceps, biceps and calves · Squat and
deadlift strength"**. Nobody had emphasised anything. `FOCUS_MARGIN` is
3 — one slot's work, the smallest amount of "more" this model can
express. **One set of daylight is arithmetic; three is a decision.**

**`domain/priority/divergence.ts` is deleted, and it is my own dead code
from the commit before.** It powered the Settings card naming settings
that had drifted from the shipped defaults, and that card went with the
volume customisation — so `musclesDivergeFrom` and `liftsDivergeFrom`
had no caller anywhere. The problem it solved no longer exists either:
the values are constants in the bundle now, identical on every device by
construction, so there is nothing left to diverge.

Driven end to end. Monday: bench, barbell row ×5, dumbbell curl,
French press, lateral raise ×5. Thursday: overhead press, pull-up ×5,
dips ×5, EZ bar curl, skullcrusher, rear delt raise ×5. Tuesday and
Friday: barbell calf raise. **Every target met exactly** — 6/6 for the
three at twice a week, 5/5 for the five at once — and no exercise twice
in the week but the calf raise.

**Three sets everywhere, one lift a day, abs on the lower days, and the
treadmill on all four.** A single round of reports, each of which moved
something the round before had just settled.

**`ONCE` went back to `low`, reversing the note above it.** Those five
muscles were raised to the `high` level when they dropped to one session
a week, to keep the weekly volume where it had been. Reported back as
_"I'm seeing some exercises still run as 5 sets"_ — fair, because the
whole method is _straight 3 sets on anything_, and preserving a number by
breaking the one rule the programme is built on was the wrong trade. The
chest now gets three direct sets a week on top of being benched heavily.

**One competition lift a day.** _"Let's drop the second strength movement
on lower days."_ `DEFAULT_LIFT_SESSIONS` is 1 across the board, so the
squat opens Tuesday and the deadlift opens Friday with nothing following
either. **The cost lands on the variations, which is how the rotation was
designed to fail**: `strengthSlugFor` indexes by the lift's session
ordinal and index 0 is always the competition version, so a lift trained
once a week never reaches index 1. The high bar squat and the
conventional deadlift are no longer scheduled at all. The number the
total is scored on keeps getting trained; the variety around it goes.

**The trunk is trained directly**, ab wheel on one lower day and hanging
leg raise on the other — it has exactly two movements and uses both, so
it joins `TWICE` without repeating an exercise. The lower days had the
room the moment they stopped carrying two competition lifts each.

**Conditioning is a treadmill block on every day, after the swings on
the lower ones**, and the swings are **one checkbox** rather than fifteen
rows. `asSets` is deleted: it materialised a thirty-minute EMOM as thirty
sets of ten so the session screen could log each one, and the reply was
_"no need to track that specific part, just a checkbox like we have now,
I have a separate EMOM app."_ An app that already runs the minute is a
better clock than a list of tick-boxes, and mirroring its output here is
a second copy of a count kept properly somewhere else — the argument that
removed the macros and the sleep row. The protocol is in the note, where
it is read before starting.

**Adding the walk to the lower days exposed two bugs, both found by
looking at the week rather than by a test.**

**The fill's "already paid today" seed counted conditioning.** It asked
`role !== 'strength'`, which is the same answer as `countsAsHypertrophy`
for everything except a conditioning slot — and `incline-walk` is
`primaryMuscle: 'calves'`. So a thirty-minute walk paid the calves a set
they had not done: Friday saw two owed where three is the floor, refused
the slot, and the week delivered **3 of 6 calf sets** with nothing on
screen saying why. This file already records that exact bug — swings
arriving as glute sets, a walk adding two calf sets — and already names
`countsAsHypertrophy` as the one predicate that settles it. The tracking
was fixed to use it and **this seed was left phrased its own way**. A
rule with two implementations is a bug with a delay on it.

**And `trailingLast` put the trunk work at the top of the day.** It
reinserted trailing muscles at "the last accessory position", found by
scanning for the last hypertrophy slot — which answers 0 when there are
none. Friday's only accessory was the leg raise, so the day opened on it
with the deadlift underneath: the one thing `inSessionOrder` exists to
prevent. It is found from the first _conditioning_ slot now, which gives
the same answer whenever another accessory is present and the right one
when it is not. It could not have shown up before, because the trunk and
the grip were at zero sessions and a day with trailing work and nothing
else could not be built.

**`describeBlock`'s focus is the level now, and that is a third
correction to one sentence.** It was "the muscles in tier 1", then "the
muscles getting the most weekly sets" — a real improvement at the time,
argued as _a lifter who trains their side delts three times a week has
emphasised them whether or not they ever opened a tier list_. **That
argument died when frequency stopped being a choice.** The split decides
it: four of nine muscles landed at six weekly sets against five at three,
and the block named itself **"Triceps, biceps, calves and core"** — true
about set counts, useless as a name. A level is still a decision, and it
is the one that says "train this harder", so the focus reads
`setsPerSessionFor` and a week where every muscle shares a level is
General. **A margin and then a share were both tried first and neither
separated the cases** — 1 of 2 muscles is a focus and 4 of 9 is not, so
no count ratio works; the discriminator was never the count.

**Four tests moved to their own recipe rather than being deleted.** The
paired-day rules — one competition version and one variation, the
competing lift first — are still live code any recipe with two sessions
for a lift reaches, so `pairedBlock()` builds a week that has one. The
shipped default no longer does, which is not the same as the rule being
gone.

Driven end to end. Monday: bench, row, curl, French press, lateral
raise, 30 min walk. Tuesday: low bar squat, calf raise, ab wheel, 15 min
swings, 30 min walk. Thursday: press, pull-up, dips, EZ curl,
skullcrusher, rear delt raise, 30 min walk. Friday: sumo deadlift, calf
raise, hanging leg raise, 15 min swings, 30 min walk. **Every target met
exactly** — 6/6 for the four at twice a week, 3/3 for the five at once —
every slot three sets, and no exercise twice in the week but the calf
raise.

**Dropping the forearms made the repeat penalty's pattern key inert**,
which is measured rather than assumed: after the cut **no muscle has
more than one hypertrophy pattern**, so `primaryMuscle|pattern` keys the
same as `primaryMuscle` alone everywhere. It stays because it costs
nothing and goes live again the moment two patterns share a muscle. The
two forearm tests that were its only coverage went with the exercises,
and are in the git history.

**`repRange` now has no entries**, the feet-elevated push-up having been
its only one. The field stays as the escape hatch it was written to be.

**Two rep ranges, chosen by the movement, and one exception.** Compounds
run 5–10 and isolations 15–30 — `COMPOUND_REPS` and `ISOLATION_REPS` in
`domain/assembly/rp-assemble.ts`. Every exercise used to hold a
`defaultRepRange`: fifteen or so hand-set pairs whose differences nobody
could account for and which drifted as the catalogue grew.

`repRange` is that field back with a much narrower remit — **an exception
for a movement the rule gets wrong, not a place to tune every exercise.**
There are no entries left: the feet-elevated push-up was the only one and
it went with the catalogue cuts. The field stays as the escape hatch it
was written to be — **an exception for a movement the rule gets wrong,
not a place to tune every exercise.** **If a third or fourth entry
appears, the rule is what needs changing.**

Both have moved more than once. The compounds were 5–8, then 10–15, and
are 5–10; the isolations were 12–20, then 15–30, briefly 10–30, and are
15–30 again. What the current pair says is that a compound is a
strength-adjacent movement done for reps and an isolation is a long set —
and that the bottom of each range is where the load lives, which is why
the compounds came back down after the accessory volume was cut to three
sets a week. The isolation floor went back up because ten reps of a
lateral raise is a compound's rep count on an isolation's implement.

**Every hypertrophy slot used to end in a set to failure, and none does
now.** Three straight sets in a range, and the range is what says when to
stop — double progression has no proximity-to-failure term at all. What
follows is why `safeToFail` went before that, kept because the reasoning
outlived its subject.

`safeToFail` is gone with the exceptions it encoded. It marked twelve
exercises for three different reasons and the third was the strongest:
**failure is not a clean event on every movement.** On a lateral raise, a
shrug or a calf raise there is always another rep if you cheat the form,
so "to failure" resolves to "until your technique goes" rather than to a
definite point — and an instruction that resolves differently every week
is worse than one rep in reserve every week. Dips and pull-ups are the
contrast: you either complete the rep or you do not.

The 15–30 range defuses most of the safety half of that argument — a
thirty-rep French press is a light implement and a long set. It does not
defuse a compound hinge at 5–8, and a Romanian deadlift or a good morning
taken to failure is the slot to look at first if this proves too broad.
The full reasoning is preserved in `hypertrophySets` rather than deleted
with the flag.

**A set is one set, for the muscle it is programmed for.** No fractions,
in either direction: not scaled by reps or proximity to failure, and not
paid out at half to secondary movers. Both existed, both were defensible,
and between them one set of dumbbell bench landed as 0.6 chest, 0.3
triceps and 0.3 front delts — three numbers arrived at by two
multiplications nobody could see and nobody could check against a
training log.

What it costs is real: a heavy triple counts the same as a set of ten, and
a bench press pays the triceps nothing. Both errors are now visible on the
Plan screen as work that has to be scheduled, rather than hidden in a
coefficient. That is the trade — a model you can audit by counting rows in
a session, over one that was more nearly right and opaque.

**The landmarks had to follow, and then stopped being a table at all.**
Published landmarks are _total_ volume: every source producing them counts
secondary involvement, so keeping them while crediting only direct work
asked the week to schedule that whole total directly — measured at eight
muscles short by twenty-seven sets. A `DIRECT_ONLY` factor of two thirds
brought it back, and `PUBLISHED_LANDMARKS` was kept beside it as the
citation.

All of that is gone with the flat table. It is recorded here because the
correction was right, and anyone reintroducing per-muscle landmarks has to
make it again: **a published figure is total volume and this app counts
direct sets**, so the two are not interchangeable and copying a table
across will silently ask for half again as much work as it looks like.

**`FREE_RIR` and `hypertrophyCredit` are gone**, and the note that used to
be here explained why RPE-scaling mattered. It did. It also could not be
checked by a person holding a training log, which turned out to matter
more.

**The forearms are trained both ways or not at all, and the shipped week
picks "not at all".** Flexion and extension are different movements and
one session cannot be both, so a forearm target that fits in a single
session lets the fill train one direction and call the muscle done. That
used to be handled by a structural MEV — `TWO_SESSION_MUSCLES` floored it
above what a session holds — which the flat landmark table removed along
with every other per-muscle number.

It does not currently matter, because the forearms are set to zero
sessions and get nothing, and the pulls are strapped so no lift pays them
either. It starts mattering the moment anyone turns them on: at two
sessions they get two slots, and nothing now forces those to be different
directions except the repeat penalty below.
`rp-assemble.test.ts` → "trains the forearms both ways rather than twice
the same way" builds that promotion itself and is the only thing watching.

**The repeat penalty only sees movements it has been told about.** A
reverse curl is pronated-grip elbow flexion — the wrist extensors hold the
bar every rep — and it was catalogued as `pattern: 'isolation'`, so it
collided with nothing. The week scheduled a reverse wrist curl _and_ a
reverse curl, two extensor slots, and reported the forearm target as met
with the flexors untrained. Exactly the bug the wrist patterns were
introduced to fix; that one exercise had not been named. Adding a forearm
or grip exercise means giving it `wrist-flexion` or `wrist-extension`.

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

**The rotation counts a muscle's own sessions, not the day's index.**
`args.directDays[muscle] % pool.length`. Counting by day index looks
equivalent and is not: on a four-day split the two upper days are indices
0 and 2, both even, so `index % 2` was zero on both and **every
two-option pool handed out the same exercise twice a week**. The triceps
have exactly two and got the French press on Monday and again on Thursday.
It hid for a long time because the muscles with four options varied
normally, so the rotation looked like it worked everywhere. A per-muscle
counter has no parity to collide with. `rp-assemble.test.ts` → "does not
repeat an exercise across a muscle's sessions when it has a choice".

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

The forearm landmarks were raised with it at the time, from MEV 2 to
MEV 6 — a landmark set against a source that no longer exists is a target
the week meets on paper with two sets of curls. The flat table has since
removed every per-muscle landmark, so that correction now lives only as a
reason to be careful: **strapping a lift silently removes a muscle's only
source of work**, and nothing in the landmark numbers records which
muscles depend on which lifts.

**A warm-up is one row per thing you do.** The lower routine was a single
"Foam Rolling" slot whose note listed seven areas. Accurate, and unusable
where it matters: the session screen ticks off _slots_, so seven areas
inside one are seven things you remember or skip together. Six rows now,
one per area, and the lats and upper back moved to the upper routine
because that is the day they are about to be worked.

**Conditioning is prescribed as a clock or as sets, whichever it actually
is.** `ConditioningPlan.asSets` in `rp-assemble.ts`. An incline walk is
twenty minutes with nothing to count; thirty minutes of swings is sets of
ten on the minute with a named bell, and a single timed row would give the
lifter one thing to tick at the end of half an hour.

**The unit is the interval, not the rest.** `intervalSeconds`, with the
set count and the rest both derived from it. Storing the rest instead
makes the same protocol cost more the heavier the set gets — thirty sets
of ten with a minute's rest is forty-five minutes, not thirty — so the
stated duration and the set count drift apart. That is exactly what
happened the first time, and the day estimate said 83 minutes for a
68-minute session.

**A set is costed by its reps, and a timed set by its duration.**
`setSeconds` in `domain/programs/program.ts`, at `SECONDS_PER_REP` = 3
with a fifteen-second floor. Counting a twenty-minute walk as one
thirty-second set made conditioning free to the planner, which then
stacked a run onto the longest day of the week and still believed it fit.

The per-rep part is newer and has the same shape of cause. It was a flat
`SECONDS_PER_SET = 30`, defended on the grounds that rest dominates —
true while every set was eight to twelve reps, and false the moment
isolations went to 15–30 and the competition lifts to triples. A flat cost
prices a thirty-rep lateral raise the same as a three-rep squat, and the
upper days were being reported at 81 minutes while genuinely running 88.
**A constant that encodes the shape of the programme it was written
against goes wrong silently when the programme changes.**

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
satisfied a target a shrug was then scheduled to fill. Traps used to carry a low MEV
because nearly everything paid them — every deadlift, row and heavy carry
loads them isometrically, and naming that credit was the point of the
split.

That credit is now zero, and the landmark that recorded it is gone too.
The shipped week delivered 7.5 trap sets incidentally against a
maintenance ask of 2; removing fractional credit for secondary movers took
the 7.5 to 0. The traps are tier 3 and ask for nothing, so the two
cancel — but the split is still worth having, because a row and a shrug
train almost nothing in common and one satisfying the other's target was
the original bug.

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
