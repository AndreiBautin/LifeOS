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
a fourth one, and it contributes nothing to a total. It is a hypertrophy
compound and runs 5–8 like every other one.

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

**Priority buys strength frequency too, not a bigger fatigue
allowance.** `strengthSessionsFor` — tier 1 three sessions a week, tier 2
two, tier 3 one — and `assignStrengthLifts` places them on the days whose
`carries` matches the lift, choosing the **emptiest** eligible day each
time. Spacing each lift across its own eligible days is the obvious
implementation and is wrong the moment two lifts share a pool: a squat
and a deadlift wanting one session each from the same two lower days both
computed the same index and landed on Tuesday.

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

**Published RTS guidance stops at 7%** — the scale is 0 none, 2 minimal, 5
moderate, 7 high — and the setting goes to 10 because a lifter who has run
7% and recovers from it knows something a general scale cannot. Above 7 is
extrapolation and the editor says so rather than presenting the whole
range as equally supported.
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

**An area with nothing to say says nothing.** `AreaStanding.silent` on the
character sheet, and `insufficient-data` counts as silence — it is the
absence of a judgement rather than a bad one. Treating it as something
said made six untouched areas report news on an empty database.

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

**The navigation is seven, and the labels paid for the seventh.**
Character became "You" and the tech tree moved to a link, because seven
cells on a 375-pixel screen are 53 pixels wide and "Character" measures
53 — exactly the width, nothing left for padding. The longest remaining
label is 38. Measure before adding an eighth: at 46 pixels a cell, every
label but "Map" is at risk.

Settings, the tech tree and the monthly review are links from You, which
is the hub. That is the line worth keeping: **a tab is somewhere you act,
a link on the hub is somewhere you decide.** History hangs off Train,
Trips and the inbox off the Map.

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
**Today is present tense, You is standing.** That line decides where a
thing goes. Dailies, the active quests, what is due and the season all
describe now, so they live on Today; levels, ladders and ratings describe
where you have got to, so they live on You. The season was on You first
and was wrong there — a season is a chapter you are _in_.

The monthly review's link sits with the season for the same reason: both
answer "how is this stretch going", and a link buried on a screen opened
weekly was the only prompt to do a thing that wants doing monthly. It says
`File 2026-08` or `2026-08 filed` rather than "Review" — a link that
cannot tell you whether there is anything to do is a link you stop
noticing.

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

**Readiness scales today, not the settings.** Sleep and stress adjust one
session. They must never write back to a muscle's sessions or level —
those are the lifter's statement of intent, and a bad night is not
evidence about intent.

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

**A lift rotates through variations; the competition version is always
first.** `STRENGTH_VARIATIONS` in `domain/exercises/catalogue.ts`. The
bench runs **paused, touch-and-go** across its two sessions and the squat
runs **low bar, high bar** across its two. The close grip left with the
third bench day: a rotation longer than the frequency never reaches its
own end, so the entry was describing a session that does not happen. The deadlift has
one entry on purpose: `strengthSlugFor` takes the ordinal modulo the
rotation length, so a lift whose rotation is shorter than its frequency
repeats rather than running off the end, and pulling sumo on both lower
days is the intent rather than an omission. Adding a variation is adding a
row here — but it is also converting that exercise to `intent: 'strength'`
with `loadBasis: 'estimated-1rm'`, which takes it out of the hypertrophy
pool, and adding a `VARIATION_OF` ratio so the first session has a load to
suggest.

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

**Two rep ranges, chosen by the movement.** Compounds run 5–8, isolations
15–30, and no exercise carries its own. `COMPOUND_REPS` and
`ISOLATION_REPS` in `domain/assembly/rp-assemble.ts`. Every exercise used
to hold a `defaultRepRange` — fifteen or so hand-set pairs whose
differences nobody could account for and which drifted as the catalogue
grew. The field is gone rather than ignored.

Worth being concrete about what it did, because "adjusted the rep ranges"
undersells it: this is roughly two and a half times the reps and
substantially less load on **every isolation slot in the program**. A
12–20 lateral raise is now 15–30 with the dumbbell that implies.

**Every hypertrophy slot ends in a set to failure.** No exceptions, and
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
