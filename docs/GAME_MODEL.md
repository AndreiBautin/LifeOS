# The game model

LifeOS is becoming the hub that every other life-tracking app is absorbed
into. Seven areas will eventually report progress on one screen. This
document decides — before any of them arrive — what a number is allowed to
mean here.

It lands first because the alternative is that each absorption invents its
own scoring on the way in, and by the seventh there are six incompatible
notions of progress to reconcile after they have all shipped.

The code is in `src/domain/game/`. It compiles, it is tested, and **nothing
imports it yet**. That is deliberate: hooking a backlog streak to XP during
a migration is how an exchange rate gets set by accident, in a commit whose
message is about something else.

## The one paragraph version

**Acts earn XP, outcomes move ladders and ratings, and the tree is what it
is all for.** Three currencies that measure, one structure that spends.

## Three currencies

They are not three flavours of the same thing. They answer three different
questions, and the reason there are three is that seven life areas do not
all measure the same kind of quantity.

|        | **Ladder**                                 | **Rating**                                | **XP**              |
| ------ | ------------------------------------------ | ----------------------------------------- | ------------------- |
| Shape  | Bounded, `Untrained → Elite`               | `Improved / Regressed / Stagnant`         | Unbounded, one pool |
| Asks   | "How good am I at this?"                   | "Is this area moving?"                    | "Did I show up?"    |
| Fed by | A measurement against a published standard | A measurement against a threshold you set | Acts, and only acts |
| File   | `ladder.ts`                                | `rating.ts`                               | `xp.ts`             |

### Ladder — for the few things with a real top

Anchored to a standard the app did not invent. LifeOS already states the
principle in `character.ts`: **a scale the app can move is a scale that
means nothing.** Strength qualifies because "Advanced" means something to
a coach who has never seen this app.

`Ladder` therefore requires an `anchor` naming that standard, and
`registry.test.ts` fails if one is blank.

Almost nothing else qualifies. There are exactly two ladders in the plan:
strength, which exists, and exploration coverage against a named region
boundary, which is the weakest anchor here and is labelled as such in
`registry.ts` — the ceiling is real, the rungs below it are chosen.

### Rating — for everything else

No ceiling exists, so the judgement is direction of travel against a
threshold you set. Backlog health, project throughput, savings rate,
social contact, applications sent.

The vocabulary is Dashboard's, unchanged: five directions
(`increase`, `decrease`, `stay-above`, `stay-below`, `stay-within-range`)
mapping onto four flat outcomes (`improved`, `regressed`, `stagnant`,
`insufficient-data`). Phase 4 ports its evaluators straight onto these
names, and a translation layer between two spellings of the same enum is
where an off-by-one would live.

A `Rating` carries **no level and no progress fraction**. That absence is
the type doing the work — see rule two.

### XP — for showing up

One pool, fed by _acts_: logging a session, closing an action, marking a
place visited. Never by outcomes — getting stronger already moved a
ladder.

`points` is flat per occurrence. Scaling XP by how well an act went
reintroduces the outcome through the back door: a session worth more
because the bar was heavier is a strength ladder paying into the pool.

The pool is derived from a **tally of acts**, not stored as a running
total. Two devices both incrementing one counter cannot be reconciled by
timestamp — the same reason the program is derived and the position is not
synced.

## And one thing that is not a currency

**Upgrades is a tech tree, and a tech tree spends rather than measures.**
Its `RecommendationEngine` already returns `UnlocksUpgradeId` and
`UnlocksTitle` — skill-tree vocabulary sitting in a purchase planner.

What makes it honest, where an invented tree would not be, is that both
gates are externally real: **money you actually have**, and **a physical
prerequisite that genuinely holds**. You cannot mount the arm before you
own the desk.

`GATE_KINDS` is `['money', 'prerequisite']` and `tree.test.ts` asserts it.
Nothing here is bought with points, and nothing awards points for buying —
the node is what the tree was for.

## The three rules

**1 · No ladder is fed by XP.** Already LifeOS's rule for strength; now the
system's. Showing up cannot make you stronger on paper than you are.
`readLadder(ladder, value)` takes a measurement and nothing else — there is
no parameter through which XP could arrive.

**2 · No rating is promoted to a ladder.** If a metric has no real
ceiling, it does not get a level. "Level 12 Reader" is invented; "backlog
age is up two months" is true. The rule's teeth are in
`registry.test.ts` → _never scores one measurement as both a ladder and a
rating_: promotion happens when both claim the same source, and it happens
silently.

**3 · Nothing is counted twice.** An act earns XP. Its result moves a
ladder or a rating. Never both for one event. `creditFor` returns **one**
credit or none — there is no shape in which it returns two.

### The edge that will be got wrong

Finishing a session earns XP, and training consistency is a rating fed by
how many sessions a month contained. That is not a double count, and the
distinction is worth stating because it is subtle:

- The **act** — "a session was finished" — pays XP once, when it happens.
- The **measurement** — "eleven sessions in August" — is a separate event,
  a fact about the world, and it moves the rating.

Two events, one credit each. What rule three forbids is one event
producing both, which is why `creditFor` cannot express it.

## Cadence is part of the model

Dashboard was deliberately built as a ten-minutes-a-month app: no streaks,
no notifications, no guilt mechanics. Absorbing it into something opened
daily is exactly the circumstance in which that stance is lost by degrees.

So cadence is a field on `Rating`, not a decision a component makes. A
monthly rating rendered on a daily surface shows its last judgement. It
does not acquire a streak because the page was opened.

This is also why the rating _type_ is what protects Dashboard's original
stance: a rating has no streak and no level by construction. Absorbing the
code never required gamifying the interaction — and "this area is judged on
direction, at a monthly cadence" is a rule about how a page renders, which
never needed a separate repository to hold.

## Every area, and how it is scored

Read off `registry.ts`. **Thirteen areas**, and the table is the whole
model — an area joins the character sheet by gaining a row there.

| Area             | Ladders                       | Ratings                              | Acts                                     | Tree |
| ---------------- | ----------------------------- | ------------------------------------ | ---------------------------------------- | ---- |
| **Training**     | Squat, bench, deadlift, total | Consistency                          | Session finished, working set logged     | —    |
| **Conditioning** | —                             | —                                    | Session with conditioning completed      | —    |
| **Crafting**     | —                             | —                                    | Build progress, build finished, DIY step | —    |
| **Backlog**      | —                             | Backlog age                          | Progress logged, item finished           | —    |
| **Projects**     | —                             | Throughput                           | Main step closed, side step closed       | —    |
| **Upgrades**     | —                             | Purchase progress                    | —                                        | ✓    |
| **Base**         | —                             | Clear, house jobs                    | Step on a house job                      | —    |
| **Upkeep**       | —                             | Kept inside the limits               | —                                        | —    |
| **Places**       | Exploration coverage          | —                                    | Place visited                            | —    |
| **Job search**   | —                             | Applications sent, stage progression | Application sent                         | —    |
| **Finance**      | Credit, net worth, retirement | —                                    | —                                        | —    |
| **Challenges**   | —                             | —                                    | Challenge completed                      | —    |
| **Mind**         | —                             | Problems solved, days practised      | Problem solved                           | —    |

Several things this table says by omission.

**Exactly one area has a tree**, and `registry.test.ts` asserts it. The
model allows one area that _spends_ rather than measures. Base shows
house upgrades and the tech tree shows the rest, but that is a question
of which screen a row appears on — a dishwasher and a barbell are the
same record with the same gates, so splitting the picture across two
screens does not make a second spender.

**Upgrades has no acts.** Buying a node is not paid in XP and does not
earn XP. The gates are real money and real prerequisites, and the reward
for reaching a node is the node.

**Finance measures and pays nothing**, which is the clearest case in the
app for the act/outcome line. Three numbers a month, read off a
statement. Typing your net worth in is a _measurement_ — which the model
already refuses to pay for when it is a bodyweight — and paying for the
number going up would be paying for an outcome. So `acts: []`,
deliberately. **An area that measures without paying is not an incomplete
area.**

**Upkeep is the other one.** Its limits are judged and nothing in it
pays: not drinking is an outcome, and the only real _act_ was spending a
charge, where paying XP for logging a beer is perverse.

**Job search has no ladder.** A campaign has stages and an end, which is
not the same as having a ceiling — there is no such thing as being
maximally good at looking for work.

**Mind has no ladder either, and it is where a count is most tempting.**
Every practice site publishes a total solved, so a "1,200 problems"
ceiling _looks_ like an external standard. It is a count of one site's
catalogue, which grows, and nothing about having solved half of it says
you are halfway to anything.

**Conditioning is its own area rather than a share of training**, because
a trait re-presents the XP of the areas it claims and an area feeds
exactly one trait. Its sets still pay `training.working-set-logged`; what
changed is which bar the _doing_ of it shows under.

**Crafting is split off two other areas rather than being a new place to
log things.** Lego builds come out of the backlog and DIY house jobs out
of Base, and `tallyActs` removes each from its original count before
counting — so rule three holds by construction. The rates are the same on
both sides, so moving a record between areas never changes what it is
worth.

## Traits, and why they are not a fourth currency

Each area belongs to **at most one** trait, and a trait's XP is the sum of
what those areas already paid. Same acts, new name. The partition is what
makes rule three hold by construction rather than by attention.

| Trait            | Fed by        |
| ---------------- | ------------- |
| **Strength**     | Training      |
| **Stamina**      | Conditioning  |
| **Intelligence** | Backlog, Mind |
| **Crafting**     | Crafting      |

**Eight areas belong to no trait**, named exactly in `UNCLAIMED_AREAS`:
places, projects, upgrades, base, jobs, upkeep, finance, challenges. So
**the bars add up to less than the level above them**, which is precisely
the symptom the original guard existed to catch. What makes it a decision
rather than the bug: that list is asserted exactly, so an area added
tomorrow with no trait still fails the build until somebody says which it
is. The sum test checks the trait totals plus the unclaimed areas equal
the XP total.

Two traits have been deleted, for opposite reasons worth keeping.
**Vitality** went because no act in the app could ever fill it — a bar
nothing can move is worse than an absent one. **Charisma** went because
the person stopped wanting the thing measured, and the area, its act, its
rating and its screen went with it.

They share the character level curve rather than getting one each. A
second curve would be a second answer to "what is a level worth", and the
first thing anybody would do is compare a Strength 12 to a character
level 20. Sharing it means a trait level is exactly what it looks like:
the level you would be if this were all you had ever done.

## Where the rating half stands

**Dormant, and the screen is what is missing rather than the rule.** The
monthly review was removed and it was the only thing that filed a month,
so a rating — which is a _direction_, and needs two points in time — has
nothing new to read. Declarations stand, `readout` still runs, and it
finds whatever was filed before.

`measureAll` is live and must stay: the character sheet's **ladders**
read it. Only the recording half went dark.

If ratings are wanted back, the missing piece is a screen. If they are
decided against for good, the removal is the registry's `ratings`
declarations, this document's three-currency claim, and the sheet's
`RatingStanding` — a deliberate model change rather than a tidy-up.

## The visual discipline

**A ladder, a rating and a tree node must not look alike.**

If exploration coverage renders as a progress bar and backlog health
renders as the same progress bar, the distinction this document draws is
invisible to the only person who uses the app — and an invisible
distinction is one that quietly stops being maintained.

Someone reading the character sheet should be able to tell, without being
told, which numbers have a real top, which are judged on direction, and
which are things they are working toward.

That is also why `Meter` takes `value` and `of` and has no `percent`
prop. A percentage is where a denominator goes to hide: a bar at 70% of a
threshold this app invented looks exactly like a bar at 70% of your own
last season, and only one of those is a measurement.
