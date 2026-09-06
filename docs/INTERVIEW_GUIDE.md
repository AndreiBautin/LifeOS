# Interview guide

What this project is worth talking about, and how to talk about it.

It is written for the person who built it. Nothing here is a script —
the useful version of every answer below is the one you can defend when
somebody pushes back on it, which means the _reasoning_ is the thing to
carry rather than the sentences.

**▶ [The demo](https://andreibautin.github.io/LifeOS/)** · no sign-up,
populated on open.

---

## The thirty-second version

> It is a gamified productivity system — thirteen areas of one life
> scored by a single model. Client-only React and TypeScript, deployed
> as an installable PWA, with optional Firestore sync.
>
> The interesting part is not the features, it is that the areas are not
> separate apps sharing a shell. Each one _declares_ what it has in a
> registry — ladders, ratings, acts — and the character sheet, the
> scoring and the XP are all derived from those declarations. An area
> joins by gaining a row.

If they only ask one follow-up it will be "what's a ladder", so have the
three currencies ready. If they ask two, the second is "why not a
backend".

---

## The three currencies

This is the strongest thing in the project and the answer to "tell me
about a design decision you're proud of".

|            |                                                        |
| ---------- | ------------------------------------------------------ |
| **Ladder** | Where you stand against a standard **outside the app** |
| **Rating** | A monthly judgement about a **direction**              |
| **XP**     | Paid for **showing up**, never for it having worked    |

Three rules hold between them, and they are **tests, not documentation**
(`registry.test.ts`): no ladder is fed by XP, no rating is promoted to a
ladder, nothing is counted twice.

**Why it matters, in one example.** A powerlifting total is a ladder
because published bodyweight multiples exist and nothing this app does
can move them. A credit score is a ladder because FICO publishes its
bands. Net worth is a ladder because the Federal Reserve publishes
percentiles by age. _How good you are at seeing your friends_ is not a
ladder, because nobody published a figure for it — so that area never
had one, and inventing one would have been the app asserting something
it cannot know.

**The line most trackers cross.** XP is paid for a thing you _did_ and
never for a thing that _happened_. Sending a job application pays;
getting the interview does not. Logging a workout pays; the number going
up does not. Typing in your net worth pays nothing at all — that is a
measurement, and paying for it going up is paying for an outcome.

If somebody says "isn't that just semantics", the answer is that it
decides what the app is for. Pay for outcomes and it becomes a thing to
optimise; pay for acts and it stays a record of what you did.

**The consequence people find surprising: absent, never zero.** An area
with nothing to say renders nothing at all. No "0%", no empty bar. A
level nobody earned is worse than an obvious gap, and one fabricated
reading makes the next month's trend a lie too.

---

## Architecture

Four layers, dependencies inward only, **enforced by ESLint zones**
rather than by convention — breaking it fails the build with a message
explaining why.

```
features/  →  application/  →  domain/  ←  infrastructure/
```

`domain/` is pure: no React, no browser APIs, no libraries. That is
checked, not hoped for.

**Have an opinion ready on whether this is over-engineered**, because
somebody will ask. The honest answer:

> Layered architecture is wrong for a CRUD form and right for a domain
> with real rules. The test I use is whether I can name what the domain
> layer would contain. Here it is set resolution, double progression,
> volume accounting, merge semantics and the whole scoring model —
> several thousand lines of logic with no I/O in it, and it is where
> nearly all the tests live. If I couldn't name that, I'd have used
> fewer layers.

**The concrete payoff**, if they want one: the entire scoring model can
be tested by calling functions. No render, no database, no clock —
`domain/` takes the clock and the id generator as parameters, so a test
can hold time still.

---

## The design decision to lead with

**A prescription is not a number, it is a rule for producing one.**

The three apps this replaced all stored the programme and the log as the
same database rows. Generating a programme wrote `Set` rows; logging a
workout mutated those same rows. So the programme _was_ the log — editing
a programme corrupted history, a completed cycle could not be repeated,
and planned-versus-actual could not be compared because only one of the
two survived.

Here:

- The **programme is derived, never stored**. Only your _position_ in it
  persists.
- A **`WorkoutLog` describes itself** — it embeds the prescription,
  planned load and planned reps of every set.

That second property is what made the frozen-snapshot machinery
unnecessary. History never needed the template to interpret it.

**The bug it prevents is one I hit four times before getting here**: a
change reaching the code and not the copy on the device. Every fix
patched one delivery route and left the others open — seed on first run,
then additive sync, then a content refresh, then re-snapshotting. Making
it derived deleted all four.

---

## The story about being wrong

Interviewers ask for a mistake. Give a real one with a real mechanism.
There are several; pick by what they seem to care about.

### "A capability nothing calls"

Eight times in this project I wrote a rule, exported it, tested it — and
wired it to no screen. `proposeLandmarks`, `readinessScore`,
`removeDaily`, `moveDailyHome`, the geocoder on the add form, the RTS
stopping rule.

**The worst version prints advice about itself.** The training screen
wrote "until RPE 8" into every set note, and the function that evaluated
RPE 8 had no caller outside its own test. The app planned the slots,
printed the rule, and never read the RPE. The user believed it was
watching.

The lesson I actually apply now: **a domain rule ships with the control
that can trip it, or it is decoration with a test attached.**

### "The tests were green the whole time"

Almost everything expensive in this project was found by _driving the
app_, not by the suite:

- A field silently dropped by a **conditional spread**, which defeats
  excess-property checking. Collected by the form, passed to the use
  case, written nowhere, nothing failed to compile. Twice. Both are now
  `Record<keyof …>` mapped types the compiler makes you fill in.
- A **Tailwind colour class that does not exist** compiles to no
  declaration at all, so twenty call sites rendered near-white. Legible,
  plausible, and not the colour anybody chose. No linter has an opinion.
  It can only be caught by reading the _computed_ colour off the element.
- **A hand-written second copy of a list that already exists** drifted
  three separate times — the sync cursor, the push collection list, a
  history row. The third one meant twelve collections were read from the
  server and written to it by nothing: most of the app was one-way, and
  from both ends it looked exactly like working sync.

The pattern, and the thing I changed: **derive the list rather than
restate it, and make the compiler the guard.** `KEYED_BY` is a mapped
type over the sync payload itself, so a field added without a key fails
the build.

### "The demo found four bugs the suite couldn't"

Good if they ask about testing strategy. Building the demo fixture was
the first time those paths were exercised together, and it turned up:
XP reading zero because `tallyActs` counts a completion _date_ and not a
_status_; a counted target drawing what was left rather than what was
done; and the tech tree drawing a cancelled upgrade as the thing you can
act on. All with a green suite.

---

## Questions you will get, and the honest answers

### "Why no backend?"

> The constraint is the product. It is a personal-data app, and
> everything lives in IndexedDB on the device, which means there is no
> account to breach and no database of mine holding anybody's records.
>
> The honest qualifier is that it is not _no network_ — the map pulls
> tiles from OpenStreetMap, the geocoder asks Nominatim, and sync is
> Firestore when you configure it. Three outbound hosts, each one a
> decision rather than a precedent.

### "How does sync work without a server?"

> Firestore is the source of truth when configured, and a `bootstrap`
> function picks between it and IndexedDB once, at startup — so the app
> still runs with no account and no network, which is what a fork and
> the demo both get.
>
> The interesting part is the merge rules, which live in `domain/sync/`
> rather than in the database. Most records are whole-record
> last-write-wins, which is right for a workout. Three are not: a
> progress log is unioned by day, because a chapter read on the phone on
> Monday and an episode on the laptop on Tuesday loses Monday under a
> record-level winner. And the map's fog is a grow-only set with no
> stamp and no tombstone, because you cannot un-walk ground.

**Have the tombstone answer ready** if they push on deletion: removing a
row leaves nothing behind, and nothing is indistinguishable from "never
existed", so any merge reads it as a record the other copy knows about
and puts it back. That was reachable before sync existed — export, delete
a session, import, and it returned, counted as an _addition_.

### "How do you know the deployed demo has no real data in it?"

Three barriers, and the point is that they are **structural rather than
careful**:

1. **Generated, never captured.** The fixture is code in the repository.
   There is no export step from a personal device anywhere in the
   pipeline, so there is no path along which real records could arrive.
2. **A namespace it cannot leave.** The demo build moves the database
   name and every storage key to a `lifeos.demo` prefix, both derived
   from one constant.
3. **Fill, never overwrite.** Seeding refuses if anything is already
   stored, and there is deliberately no flag that makes it overwrite.

Plus a test that reads the fixture's own source and scans it for emails,
phone numbers, credential shapes and links.

### "What would you do differently?"

Pick one and mean it:

> **I would have written the demo fixture much earlier.** It found four
> real bugs in an afternoon, and every one of them was a path no test
> exercised end to end. A fixture is a cheap integration test that also
> happens to be the product demo.

Or:

> **I would not have shipped rules I could not reach from a screen.** I
> did it eight times. The habit I have now is that a rule and its control
> land in the same change.

### "This is a personal app — how would it change for a team?"

> The layer boundaries and the repository ports are already the seam, so
> the storage swap is real work but bounded — I did exactly that when
> Firestore became the source of truth, and it did not touch `domain/`
> at all.
>
> What genuinely changes is that the merge rules stop being enough.
> Last-write-wins is defensible for one person across two devices and
> indefensible for two people editing at once. That is CRDTs or a
> server, and I would want a server.

### "What's still broken?"

Answer this one plainly — a candidate who names their own open defects
reads better than one who says nothing is wrong.

> Every card treats `data === undefined` as loading, so a genuinely
> failed read draws a skeleton forever rather than an error. That was
> nearly impossible when storage was local and is a real network-shaped
> failure now. It is written down in `ARCHITECTURE.md` under "Known, and
> open".
>
> Tombstones are vestigial under Firestore. Settings and the map's fog
> do not travel between devices. And the service-worker lifecycle is the
> one thing here that ships on reasoning rather than on having been
> driven, because registration is refused in the automation environment.

---

## Numbers, if asked

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| TypeScript   | ~72,000 lines across 391 files                                      |
| Tests        | 1,405 across 119 files, plus three Firestore-emulator suites        |
| Domain layer | 111 files, zero React and zero browser APIs                         |
| Verification | one command — typecheck, lint, format, test, build                  |
| Gate         | pre-push hook and CI run the same command; the deploy depends on it |

**Do not lead with these.** Line count is not an achievement and
everybody knows it. They are here in case somebody asks about scale.

---

## What to show, in order

1. **The demo**, on a phone if you have one — it is a PWA and installs.
2. **`domain/game/registry.ts`** — the whole model, declared in one file.
3. **`registry.test.ts`** — the three rules, as tests.
4. **`docs/ARCHITECTURE.md`** — one request traced end to end, naming
   real files.
5. **`CLAUDE.md`** — if they are the kind of person who will like it.
   It is a decision log: every load-bearing invariant, why it exists, and
   what it cost to learn. Some people will find it extraordinary and some
   will find it excessive. Read the room.

---

## What not to claim

Being caught overstating is worse than any gap, and every one of these is
checkable in about a minute:

- **Not "no network calls".** Three outbound hosts, listed above.
- **Not "fully tested".** Say what is deliberately untested and why —
  `docs/TESTING.md` has that section, and it is the part that reads as
  judgement rather than as a gap.
- **Not "the fog is tested".** The parts that can be wrong on their own
  are. Whether it clears correctly on a walk has a "done when" no suite
  can satisfy: verified by walking, outdoors, and that is still
  outstanding.
- **Not "it syncs live everywhere".** The deployed demo does not sync at
  all — it passes no Firebase config, deliberately.
