# Testing

Run with `pnpm test` (watch) or `pnpm test:run` (once). `pnpm verify`
runs them alongside typecheck, lint, format and build.

**1,482 tests across 122 files**, all passing. The Firestore emulator
suites are separate — see below.

## The strategy

Coverage is not the target. Chasing a number produces tests written to
raise it, which are exactly the tests that do not catch bugs. What is
tested is what would be **silently wrong** rather than loudly broken.

That distinction matters unusually much here. If a refactor moved an
accessory from a 15–30 rep range to 5–10, nothing would error. No type
would complain, no screen would break, no integration test would notice.
The app would keep working and would simply prescribe the wrong training,
for months, to somebody who trusted it.

So the values that carry meaning are asserted **literally rather than
recomputed** — the rep ranges, the load increments, the rounding, and the
prescription of every set the assembler emits. Writing the numbers out
means a change to either the rule or the arithmetic shows up as a diff in
the expected values, which is the whole point.

**A test about a ratio must state its own numerator.**
`review.test.ts` → "measures strength as a multiple of bodyweight" once
read the squat off `DEFAULT_SETTINGS` and asserted the quotient, so it
failed the day that default moved — a true fact about a constant it did
not own, and nothing about the division it existed to check. It states
both numbers now.

The legacy 5/3/1 import decoder is tested against the **real export
file** rather than a synthetic fixture. Its decoding table was derived
from that file, so a hand-written sample would only prove the parser
agrees with the assumptions used to write it. The file carries
independent ground truth — the training maxes each cycle records — and
that is what the assertions check.

## By layer

| Layer             | How                                      | What it protects                                                                                                                                               |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/`         | Pure unit tests, table-driven            | The programming itself: rep ranges, load steps, rounding, volume arithmetic, the scoring rules, merge semantics                                                |
| `application/`    | Against a real (fake-indexeddb) database | Behaviours spanning layers: history becoming a suggested load, a logged set landing in the log rather than the programme, advancing on completion or on a skip |
| `infrastructure/` | Against a real (fake-indexeddb) database | Schema, indexes, migrations, export/import round-trip                                                                                                          |
| Firestore         | Against the **emulator**                 | The access rules, batching, the live listener — run separately, needs a JDK 21+                                                                                |

Application tests use a real database rather than mocks on purpose. The
bugs worth catching there are integration bugs; a mocked repository would
assert that the code calls what the test expected it to call, which is a
tautology.

**The suite runs in `America/New_York`**, and that is a real fix rather
than a setting. In UTC a local day key and a UTC date prefix are the same
ten characters, so every assertion about dates passed while the app was
wrong for half of every day for anybody in the Americas. Moving the suite
cost nothing — all tests passed unchanged on the first run — which is the
measure of how little it was covering. A lint rule now bans
`.toISOString().slice(0, 10)` so the next one fails the build instead.

## The properties worth naming

These are the assertions that would be most expensive to get wrong.

**A round-trip through a backup is identity.** Export, wipe, import,
export again — byte-identical, and unchanged across a second round trip.
A truncated file is refused, and so is one from a newer version rather
than being guessed at: the realistic corruption is a half-written file,
which parses as valid JSON right up to the cut.

**A deletion survives a restore.** Delete a session after a backup was
taken, import the backup, and the session stays deleted. Without the
tombstone the merge reads the absence as a record it does not know about
and puts it back — which is genuinely what the merge thought it was
doing.

**Every working week has the same volume.** There is no ramp, by
decision, and the Program screen shows one working week and says that is
the whole block. If the weeks ever diverge that screen becomes a lie.

**No muscle gets more than one session's worth in a day**, and none
overshoots its own weekly target by more than a session. Landing a
muscle's whole allocation in one sitting satisfies the total and still
trains it badly, and nothing about the set count reveals it.

**Every muscle is trained as often as its own setting asks** — with one
exemption, for a muscle already at its weekly target including incidental
credit. Frequency is a means to volume and never a goal: a second session
for a muscle at its number buys fatigue and no stimulus.

**No exercise appears twice in a week**, apart from the calf raise. That
test names the offender in its message, because a bare count passes just
as happily when every exercise is on the wrong day.

**Each muscle's accessory work sits opposite the lift that trains it.**
The pairing is the whole reason the split is shaped as it is, and a
no-repeats assertion cannot see it.

**Assembly is deterministic.** The same recipe produces a byte-identical
programme twice, slot ids included. A workout in progress refers to its
day by position and its sets by index, so a programme that differed
between reads would make every one of those a guess.

**A skipped set carries no numbers.** Log a set, then skip it; the
actuals must be cleared. A skipped set retaining a load reads as
performed work to the volume totals.

**Warm-ups count no volume**, and neither does conditioning.
`countsAsHypertrophy` is the one predicate — thirty sets of ten
kettlebell swings once arrived as sixty glute sets a week against a
target of zero, and it only became absurd once the swings were prescribed
as sets rather than as a block of time.

**Every declared act is actually counted.** `sheet.test.ts` asserts the
list of declared-but-uncounted acts is **empty**. Without it an act can be
declared, awarded on screen, and counted nowhere.

**The trait bars never double-count.** Every area belongs to at most one
trait, no area belongs to two, and the trait totals plus the explicitly
unclaimed areas sum to the XP total exactly. An area belonging to no
trait would pay XP that appears in the character total and in no bar, and
nothing would error.

**The demo fixture contains nothing personal.** `seed.test.ts` reads its
own source and scans it for emails, phone numbers, credential shapes and
links out. The risk is not a typo — it is somebody pasting a real record
in while debugging and forgetting.

**Seeding cannot overwrite.** Seed, seed again, and the second call
refuses with `already-has-data`. A demo build opened by somebody who has
since entered their own records must not lose them.

**The demo fixture still exercises every screen.** `parity.test.ts`
asserts obligations as _properties_ — more than one trait proved, both
shelves of the tech tree populated, the map holding places _and_ cleared
ground — rather than as a list of fixture titles, so editing it stays
free and hollowing it out does not. This is the failure unique to having
a demo: a feature works perfectly against real data and renders an empty
box on the deployed site, nothing errors, the feature's own tests keep
passing, and the person who notices is the employer.

**The account reaches the repositories before any child renders.**
`AuthGate.test.tsx`, the one component test here, and it earns its place
by failing for the right reason: move the assignment back into a
`useEffect` and it goes red. That was a real bug — every screen mounted
against an empty holder, every query threw, and with `retry: false` sat
at `data === undefined`, which is the same state a card draws a skeleton
for. The whole app came up as placeholders on a device that had signed in
perfectly well.

## Deliberately not tested

Naming these is the point of the section.

- **Component rendering, almost entirely.** The screens are thin — they
  resolve a hook and lay out what it returns. A render test would mostly
  assert that Tailwind classes are present, which is a test of the test.
  `AuthGate` is the exception because what is under test there is the
  _order of two things in one render_, which nothing else can express.
- **A Tailwind colour class is not evidence a colour was applied.** An
  undefined token compiles to no declaration at all, so `text-ink-600`
  once left twenty call sites rendering near-white — legible, plausible,
  and not the colour anybody chose. No linter or typecheck has an opinion
  and it renders without error. The only way to catch it is to read the
  _computed_ colour off the element in a browser, which is what found it
  both times.
- **The service worker.** Registration is refused in an agent's browser
  ("An unknown error occurred when fetching the script"), so the install
  → wait → activate path is the one piece of this app that ships on
  reasoning and a production build. Anything changed there wants testing
  in a real browser against `vite preview`.
- **The rest timer's wall-clock behaviour, and the wake lock.** Both
  depend on tab suspension, which jsdom cannot simulate. The timer's
  correctness comes from its design — derived from an absolute timestamp
  rather than counted down — and the design is visible in the code.
- **`navigator.storage.persist()` being granted.** The browser decides.
  The app requests it, reports what it actually got, and assumes nothing.
- **Every exercise in the catalogue.** It is data; asserting that a
  barbell bench press is a barbell bench press catches nothing. What _is_
  tested is that every exercise a programme references exists in the
  library — the failure that would render a blank row.
- **The serialised progress chain in the backlog.** It exists because of
  a race between two in-flight writes, and a test that fakes the timing
  of that race is a test of the fake. It was checked by driving the
  running app — three rapid taps landing as three.
- **The map itself, and the fog as it clears on a walk.** Leaflet is a
  dependency and jsdom has no layout, so what a unit test could assert
  about `LeafletMapAdapter` is that it called a library. The parts that
  can be wrong on their own — the geohash cells, the 100 m accuracy gate,
  the union merge, the derivation of a visited place's ground — are all
  tested away from the map. The rest has a "done when" no suite can
  satisfy: **verified by walking**, on a phone, outdoors. That is still
  outstanding, and no green suite here should be read as evidence of it.
- **The share target as the operating system delivers it.** The parse is
  tested hard, because that is where the interesting mistakes live — a
  short link with no readable point, a `geo:0,0?q=` placeholder taken
  literally. What is _not_ tested is that Android's share sheet fills
  `title`, `text` and `url` the way this app expects. That is a claim
  about somebody else's software.
- **The double-progression round trip, end to end.** No single test
  carries a load from one session into the next through the real
  repositories. It was verified by driving the app — a bench opened at
  200 from a 238 estimate, three sets of five logged, the session filed,
  and the same lift opened at **205** the next week. Worth knowing that
  the arithmetic on each side is tested and the seam between them is not.

## What the suite has repeatedly failed to catch

Recorded because the pattern is more useful than any individual bug, and
every entry was found by **driving the app** while the suite was green:

- **A capability nothing calls.** `proposeLandmarks`, `readinessScore`,
  `moveDailyHome`, `removeDaily`, `renameArc`, `forgetToday`, the geocoder
  on the add form, the RTS stopping rule. Each was written, exported,
  tested — and reachable from no screen. A rule that prints advice about
  itself is the worst version, because the user believes it is watching.
- **A field dropped by a conditional spread**, which defeats
  excess-property checking. `addDaily` lost `timesPerDay` and
  `recordFinance` lost `salaryMinor` by exactly that route: collected by
  the form, passed to the use case, written nowhere, and nothing failed to
  compile. Both are now `Record<keyof …>` mapped types the compiler makes
  you fill in.
- **A hand-written second copy of a list that already exists.** The sync
  cursor's pages, then `push`'s collection list, then the finance history
  row. Three times. The fix each time was structural — derive the list
  rather than restate it.
- **A stale sentence.** Four pieces of copy described RTS after it was
  removed, including one on every accessory slot in the app. A comment
  claiming something is logged is worth grepping, not trusting.
