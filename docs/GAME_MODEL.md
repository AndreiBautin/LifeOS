# The game model

LifeOS is a gamified workout tracker. Three areas — lifting,
conditioning and the warm-up — report progress on one screen, and this
document decides what a number is allowed to mean there.

It was written first, when the app was meant to become a hub that a
dozen other life-tracking apps would be absorbed into, because the
alternative was that each absorption invented its own scoring on the way
in. The hub has since narrowed back to training. The rules held through
both directions, which is the argument for having written them down
before anything needed them.

The code is in `src/domain/game/`, and
`application/use-cases/character/sheet.ts` is where it joins the records.
An area reaches the character sheet by gaining a row in `registry.ts`.

## The one paragraph version

**Acts earn XP, and measurements move ladders and ratings.** Three
currencies, and nothing is paid in two of them for one event.

## Three currencies

They are not three flavours of the same thing. They answer three
different questions.

|        | **Ladder**                                 | **Rating**                                | **XP**              |
| ------ | ------------------------------------------ | ----------------------------------------- | ------------------- |
| Shape  | Bounded, `Untrained → Elite`               | `Improved / Regressed / Stagnant`         | Unbounded, one pool |
| Asks   | "How good am I at this?"                   | "Is this moving?"                         | "Did I show up?"    |
| Fed by | A measurement against a published standard | A measurement against a threshold you set | Acts, and only acts |
| File   | `ladder.ts`                                | `rating.ts`                               | `xp.ts`             |

### Ladder — for the few things with a real top

Anchored to a standard the app did not invent. The principle is stated
in `character.ts`: **a scale the app can move is a scale that means
nothing.** Strength qualifies because "Advanced" means something to a
coach who has never seen this app.

`Ladder` therefore requires an `anchor` naming that standard, and
`registry.test.ts` fails if one is blank. There are four: the squat, the
bench, the deadlift and the total, each as a multiple of bodyweight.

### Rating — for everything else

No ceiling exists, so the judgement is direction of travel against a
threshold you set. There is one: training consistency, sessions a month
against twelve.

The vocabulary is five directions (`increase`, `decrease`, `stay-above`,
`stay-below`, `stay-within-range`) mapping onto four flat outcomes
(`improved`, `regressed`, `stagnant`, `insufficient-data`). A `Rating`
carries **no level and no progress fraction**. That absence is the type
doing the work — see rule two.

### XP — for showing up

One pool, fed by _acts_: finishing a session, logging a working set.
Never by outcomes — getting stronger already moved a ladder.

`points` is flat per occurrence. Scaling XP by how well an act went
reintroduces the outcome through the back door: a session worth more
because the bar was heavier is a strength ladder paying into the pool.

The pool is derived from a **tally of acts**, not stored as a running
total. Two devices both incrementing one counter cannot be reconciled by
timestamp — the same reason the program is derived rather than stored.

## The three rules

**1 · No ladder is fed by XP.** Showing up cannot make you stronger on
paper than you are. `readLadder(ladder, value)` takes a measurement and
nothing else — there is no parameter through which XP could arrive.

**2 · No rating is promoted to a ladder.** If a metric has no real
ceiling, it does not get a level. The rule's teeth are in
`registry.test.ts` → _never scores one measurement as both a ladder and a
rating_: promotion happens when both claim the same source, and it
happens silently.

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

Cadence is a field on `Rating`, not a decision a component makes. A
monthly rating rendered on a daily surface shows its last judgement. It
does not acquire a streak because the page was opened.

## Every area, and how it is scored

Read off `registry.ts`. **Three areas**, and the table is the whole
model.

| Area             | Ladders                       | Ratings     | Acts                                          |
| ---------------- | ----------------------------- | ----------- | --------------------------------------------- |
| **Training**     | Squat, bench, deadlift, total | Consistency | Session finished (50), working set logged (5) |
| **Conditioning** | —                             | —           | Conditioning done in a finished session (30)  |
| **Mobility**     | —                             | —           | Warm-up done in a finished session (20)       |

The acts are counted in `countActs` in
`application/use-cases/character/sheet.ts`.

**Conditioning and mobility are their own areas rather than shares of
training**, because a trait re-presents the XP of the areas it claims and
an area feeds exactly one trait. Their sets still pay
`training.working-set-logged`; what changed is which bar the _doing_ of
them shows under.

**Both pay per session, never per row.** Six warm-up rows paying six
times would make the cheapest part of a session the best-paid, so each
fires once on a finished session containing at least one such set
actually completed. **The slot is not enough** — every session schedules
a warm-up, so counting the slot would pay for work nobody did.

**Conditioning pays 30 against a session's 50**, because it usually rides
along with a lifting session rather than replacing it. Matching 50 would
make Stamina climb fastest on heavy days, which is the reading backwards.

## Traits, and why they are not a fourth currency

Each area belongs to **exactly one** trait, and a trait's XP is the sum
of what those areas already paid. Same acts, new name.

| Trait        | Fed by       |
| ------------ | ------------ |
| **Strength** | Training     |
| **Stamina**  | Conditioning |
| **Mobility** | Mobility     |

**The partition is what makes rule three hold by construction rather
than by attention**, and `traits.test.ts` asserts it: every area claimed,
no area claimed twice, and the trait totals sum to the XP total exactly.

There was a long stretch when this was not true. The app held a dozen
areas, three traits were dropped, and six areas belonged to no trait — so
the bars added up to less than the level above them, deliberately.
`UNCLAIMED_AREAS` named them and the test asserted that list exactly. It
is **empty now and kept**, so an area added tomorrow with no trait still
fails the build until somebody says which it is.

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

**A ladder, a rating and a trait bar must not look alike.** Someone
reading the character sheet should be able to tell, without being told,
which numbers have a real top and which are a re-presentation of effort.
The visible consequence, which looks like a bug and is not: on a fresh
database **Strength reads "Nothing yet" beside a real powerlifting
total** — no session has been logged, and the estimated maxes are still a
measurement.

That is also why `Meter` takes `value` and `of` and has no `percent`
prop. A percentage is where a denominator goes to hide: a bar at 70% of a
threshold this app invented looks exactly like a bar at 70% of a
published standard, and only one of those is a measurement.
