# Demo data

The deployed build is a demo build. It signs into nothing, stores
nothing outside the browser it is opened in, and fills itself with a
generated fixture the first time it is opened.

This document says what is in that fixture, why, and — the part that
matters most — what stops it ever containing anything real.

## The three barriers

The guarantee is **structural**, not a matter of being careful. Any one
of these would mostly work; all three together mean there is no sequence
of mistakes that publishes personal data.

### 1. Generated, never captured

[`src/application/use-cases/demo/seed.ts`](../src/application/use-cases/demo/seed.ts)
is the entire fixture, written out as code in a public repository. There
is **no export step from a personal device anywhere in the pipeline** —
no script that reads a backup, no fixture file produced by a build, no
"anonymise my data" pass. There is therefore no path along which real
records could arrive, however badly something else goes wrong.

The risk this leaves is somebody pasting a real record in while
debugging and forgetting. `seed.test.ts` reads its own source and scans
it for email addresses, phone numbers, credential shapes and links out,
so that mistake fails the build rather than shipping.

### 2. A namespace the demo cannot leave

`VITE_DEMO_MODE=true` moves the IndexedDB database name and every
`localStorage` key to a `lifeos.demo` prefix, in
[`src/config/storage-keys.ts`](../src/config/storage-keys.ts). Both
derive from one constant, so they cannot drift apart.

The consequence worth stating: opening the demo in the same browser as a
personal build gives you **two separate databases**. They cannot see
each other and cannot overwrite each other.

An ESLint rule forbids touching `localStorage` outside
`infrastructure/storage/`, which is what stops a key being spelled
inline somewhere and escaping the prefix.

### 3. Fill, never overwrite

`seedDemoData` counts what is already stored and **refuses if anything
is there**, returning `{ seeded: false, reason: 'already-has-data' }`.

It is named for filling and there is deliberately **no flag** that makes
it overwrite — the rule this codebase holds for destructive operations
everywhere else, which is that a call site must not be able to ask for
"fill if empty" and receive "wipe and replace". Somebody who opens the
demo, adds a few things of their own and comes back a week later still
has them.

That refusal is a tested property rather than a convention.

## What is in it

Enough that every screen has something to draw, and no more. The shape
of the dataset is chosen so a reviewer understands the app in about ten
seconds per screen.

| Screen        | What the fixture gives it                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **You**       | Level 2, four trait bars with two proven, a season's challenges, four buff pools mid-day                                                                                                   |
| **Train**     | Three finished sessions across a week, so history, volume and the Strength ladder all report                                                                                               |
| **Quests**    | A main quest, a side quest, a one-off contract, and one finished                                                                                                                           |
| **Codex**     | Eleven entries covering every status, two with a run of progress days                                                                                                                      |
| **Map**       | Seven places, three visited — which is what clears the fog — and one with no point yet                                                                                                     |
| **Base**      | Four rooms read for clutter and one never read, plus house jobs at different stages                                                                                                        |
| **Finance**   | Three months of readings, so every trend has two points to compare                                                                                                                         |
| **Tech tree** | A prerequisite chain, something owned, something dropped, something out of reach                                                                                                           |
| **Goals**     | A relocation plan across six workstreams, a dependency crossing two of them, a confirmed and a refuted hypothesis, and one item linked to a real quest so completing the quest unblocks it |

### The edge cases it deliberately includes

An empty app demonstrates nothing, and so does a uniformly tidy one.
Four states are in the fixture on purpose because they are the ones a
screenshot never shows:

- **A record with only its required fields.** `Dune`, in the Codex, with
  no priority, no progress and no dates.
- **A value long enough to wrap.** One Codex title exists purely to prove
  the row wraps rather than clipping at 375px.
- **A place with no coordinates.** The name-only capture the map's inbox
  exists to resolve — without one, that screen has nothing to
  demonstrate.
- **A room nobody has read.** Which is left _out_ of the house average
  rather than counted as zero, and the screen says so.

### Dates are offsets, never absolutes

Every date is computed from the moment of seeding. A fixture pinned to
absolute timestamps rots: opened a year after it was written it shows
dead streaks, an empty "this month" and a season that ended long ago.

It is still deterministic — for a given `now`, the output is
byte-identical, ids included, which is what makes it testable.

### One thing is written as records rather than driven

Everything else in the fixture goes through the app's own use cases —
`addProject`, `addPlace`, `recordClear` and the rest — so a fixture that
compiles is a fixture the app could have produced, and every invariant
those functions enforce holds in the demo too.

The **workout history is the exception**, and it says so in place.
`startWorkout` opens _today's_ programme day and `finishWorkout`
advances the block position from wherever it currently stands, so a loop
of start-then-finish yields three sessions all dated today with the
programme three days further on than the history claims. There is no way
to ask those use cases for a session that happened last week, because
from the app's point of view there never is one.

What that gives up is bought back with the real exercise slugs, the real
prescription shape and the real slot roles — and by the tests, which
assert the properties the screens depend on rather than the records.

## Running it

```bash
VITE_DEMO_MODE=true pnpm build
pnpm preview
```

Or set the flag in a local env file; [`.env.demo`](../.env.demo) is the
committed configuration the deploy uses.

**Resetting** is two buttons in Settings, and they are deliberately two.
**Start fresh** deletes every record after a confirmation that offers the
export first; **Load sample data** is only offered once the app is empty,
and `seedDemoData` refuses a database with anything in it regardless.
There is no single "reset the demo" control, because that would be a
wipe-and-replace living one tap from an ordinary screen — the shape this
codebase refuses everywhere else.

Starting fresh records `sampleData: 'cleared'` in settings, which is what
stops the first-open seed from refilling an empty database on the next
visit. Deleting the `lifeos.demo` database from the browser's own
site-data controls clears that too and brings the sample back.

## Credentials

**There are none, and that is the design.** There is no server, no
account and no sign-in: a reviewer clicking the link is inside the app
immediately, and nothing a visitor does can reach anything but their own
browser.

## What the demo cannot show

Stated rather than hidden, because a reviewer will notice:

- **The map's geocoder.** It reaches Nominatim, which is a live service
  run on donations; the demo does not call it on load. Typing a name
  into the map's search still works.
- **Anything requiring a second device.** Moving data is export and
  import; there is no sync.
