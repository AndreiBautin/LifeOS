# Interview guide

What this project is worth talking about, and how to talk about it.

It is written for the person who built it. Nothing here is a script —
the useful version of every answer below is the one you can defend when
somebody pushes back on it, which means the _reasoning_ is the thing to
carry rather than the sentences.

**▶ [The demo](https://andreibautin.github.io/LiftOS/)** · no sign-up,
populated on open.

---

## The thirty-second version

> It is a workout tracker. It builds the week, tells you what to load
> from what you lifted last time, and moves the bar up when you have
> earned it. Client-only React and TypeScript, deployed as an
> installable PWA, and everything lives in the visitor's own browser.
>
> The interesting part is that a prescription is not a number — it is a
> rule resolved against your own history when the session opens — and
> the programme is derived from settings rather than stored, so editing
> it can never rewrite what you already logged.

If they only ask one follow-up it will be "what does derived mean", so
have the programme-versus-log story ready. If they ask two, the second
is "why not a backend".

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
> week assembly and volume accounting, merge semantics and the strength
> standards — logic with no I/O in it, and it is where nearly all the tests
> live. If I couldn't name that, I'd have used fewer layers.

**The concrete payoff**, if they want one: the whole of the programming
can be tested by calling functions. No render, no database, no clock —
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

## A second one, if they want more

**Narrowing the app was a harder engineering problem than growing it.**
It held a backlog, a map with fog of war, a tech tree, finance, quests
and a game layer of XP, levels and traits — and became a workout
tracker. Deleting the code was the easy part; the interesting questions were what a deletion must not break.

> - **Installed copies keep asking for old paths.** A PWA shortcut is
>   registered with the operating system at install time, so every
>   removed route redirects to `/today` rather than 404ing.
> - **A database store cannot be removed.** Removing one means editing
>   the migration step that created it, and a device that already ran
>   that step will not run it again — two devices end up with different
>   schemas and no way to tell. So a new step at `DB_VERSION` 24 clears
>   the rows and the stores stay, and another at 25 did the same for the
>   monthly review's stores when the game layer went.
> - **Old backups must still restore.** A file taken before the narrowing
>   carries a dozen sections this build has no repository for. They are
>   ignored rather than refused, and there is a test that imports the
>   training out of one.

---

## The story about being wrong

Interviewers ask for a mistake. Give a real one with a real mechanism.
There are several; pick by what they seem to care about.

### "A capability nothing calls"

Eight times in this project I wrote a rule, exported it, tested it — and
wired it to no screen. `proposeLandmarks`, `readinessScore`, the RTS
stopping rule among them.

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
  case, written nowhere, nothing failed to compile. Twice. Both became
  `Record<keyof …>` mapped types the compiler makes you fill in.
- A **Tailwind colour class that does not exist** compiles to no
  declaration at all, so twenty call sites rendered near-white. Legible,
  plausible, and not the colour anybody chose. No linter has an opinion.
  It can only be caught by reading the _computed_ colour off the element.
- **A hand-written second copy of a list that already exists** drifted
  three separate times in a sync layer since removed. One of them meant
  twelve collections were read from the server and written to it by
  nothing, and from both ends it looked exactly like working sync.

The pattern, and the thing I changed: **derive the list rather than
restate it, and make the compiler the guard** — a `Record<keyof …>`
the compiler makes you fill in, so a field added without an entry fails
the build.

### "The demo found bugs the suite couldn't"

Good if they ask about testing strategy. Building the demo fixture was
the first time several paths were exercised together, and it turned up
— back when the app still had XP — a level reading zero because the
tally counted a completion _date_ and not a _status_, all with a green
suite. A later fixture's strength chart
disagreed with the Standards card beside it by seventy pounds, because
the generated history and the sample's estimated maxes had been written
separately.

---

## Questions you will get, and the honest answers

### "Why no backend?"

> The constraint is the product. It is a personal-data app, and
> everything lives in IndexedDB on the device, which means there is no
> account to breach and no database of mine holding anybody's records.
>
> The one outbound host is GitHub, and only if you turn sync on with a
> token of your own.

### "How does it work across two devices, then?"

> One backup file in a private GitHub repository the lifter owns. Each
> device reads it, merges — newer `updatedAt` wins, deletions travel as
> tombstones — and writes back only if the records actually changed,
> throttled to every fifteen seconds. It is turn-taking rather than live,
> which suits one person training on one device at a time.
>
> It replaced Firestore behind a Google sign-in. That worked, and it was
> a second storage path, a sign-in gate and access rules for a public
> demo that never used any of it. If this needed the cloud I would make a
> real database the one source of truth with proper accounts, not keep
> two copies in step. Neither swap touched `domain/` — the repository
> ports were the seam.

**Have the tombstone answer ready** if they push on deletion: removing a
row leaves nothing behind, and nothing is indistinguishable from "never
existed", so merging in an older copy reads it as a record the file
knows about and puts it back — counted as an _addition_. A tombstone is
what the merge filters against.

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

> **I would have written the demo fixture much earlier.** It found real
> bugs in an afternoon, and every one of them was a path no test
> exercised end to end. A fixture is a cheap integration test that also
> happens to be the product demo.

Or:

> **I would not have shipped rules I could not reach from a screen.** I
> did it eight times. The habit I have now is that a rule and its control
> land in the same change.

Or, honestly:

> **I would have scoped it to training from the start.** A dozen areas
> and a game layer taught me a lot about keeping numbers honest, and
> most of them were better served by apps that already do that one thing
> well.

### "Your resume is all .NET, Azure and RAG — why show me a React app with none of that?"

Expect this one. Answer it directly rather than defending the stack
choice.

> The stack is deliberately not the point. The day job is enterprise
> .NET and Azure, and this was built outside it specifically so it is
> evidence of my own judgment rather than a restatement of employer
> work I can't show you anyway. What I'd want you to look at is not
> "does he know React" — it's the layer boundaries enforced by lint
> rather than convention, the decision to keep double progression pure
> and derive the programme rather than store it, the demo-data
> discipline, and `CLAUDE.md`, which is months of documented trade-offs
> and a couple of times I was wrong and fixed it. That's the same
> judgment I'd bring to an Azure RAG pipeline; I just didn't have an
> Azure RAG pipeline of my own to build it on.
>
> If the role is close enough to the RAG platform at 3Cloud, I'd rather
> walk through that verbally — the async Service Bus replacement and
> the telemetry-driven stabilization are the more directly relevant
> story, I just can't hand you a link to click through it.

### "This is a personal app — how would it change for a team?"

> The layer boundaries and the repository ports are already the seam, so
> the storage swap is real work but bounded — I did it once, adding
> Firestore behind the ports and later removing it, and neither
> direction touched `domain/`.
>
> What genuinely changes is concurrency: two people editing at once
> needs a server that owns the data, and I would want one.

### "What's still broken?"

Answer this one plainly — a candidate who names their own open defects
reads better than one who says nothing is wrong.

> Every card treats `data === undefined` as loading, which is also the
> state an errored query sits in — so a failed read used to draw a
> skeleton forever. There is a banner over the shell now that says a
> read failed and offers a retry, which is one component rather than
> dozens of changed call sites. Teaching each card to tell an error from
> loading is still the thorough version.
>
> Sync is whole-file and turn-taking, not live. And the service worker is
> only partly verified: it registers, activates and controls the page on
> the live site, and the update banner has been seen firing, but offline
> serving from the precache has not been driven.

---

## Numbers, if asked

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| TypeScript   | ~27,000 lines across about 150 files, after the narrowing           |
| Tests        | about 360 cases in 37 files, one run with no services needed        |
| Domain layer | zero React and zero browser APIs, checked by lint                   |
| Verification | one command — typecheck, lint, format, test, build                  |
| Gate         | pre-push hook and CI run the same command; the deploy depends on it |

**Do not lead with these.** Line count is not an achievement and
everybody knows it. They are here in case somebody asks about scale —
and the drop from more than twice that is itself a better talking point
than the number.

---

## What to show, in order

1. **The demo**, on a phone if you have one — it is a PWA and installs.
2. **`domain/programs/progression.ts`** — double progression in two
   sentences of code: work a rep range, and when every set reaches the
   top of it, the next session's load goes up.
3. **`application/use-cases/programs/current-program.ts`** — the
   programme, derived from settings on every read and never stored.
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

- **Not "no network calls".** GitHub, when sync is on.
- **Not "fully tested".** Say what is deliberately untested and why —
  `docs/TESTING.md` has that section, and it is the part that reads as
  judgement rather than as a gap.
- **Not "the progression is tested end to end".** Each side of it is; no
  single test carries a load from one session into the next through the
  real repositories. That round trip was verified by driving the app.
- **Not "it syncs live".** It syncs a file, in turns, on launch, page
  change and visibility.
