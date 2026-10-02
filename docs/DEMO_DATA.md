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
demo, logs a session of their own and comes back a week later still has
it.

That refusal is a tested property rather than a convention.

## What is in it

About seventeen weeks of the shipped routine — the A and B days, Monday
to Saturday — so a reviewer sees somebody four months into a programme
rather than an app installed last week.

| Card                   | What the fixture gives it                                                       |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Next session**       | A session to start, with loads carried from the history                         |
| **Strength standards** | Each competition lift's estimated max against bodyweight                        |
| **Strength trend**     | A line that climbs the way double progression climbs                            |
| **Training grid**      | Seventeen weeks of working sets, with gaps where sessions were skipped          |
| **History**            | Seventeen weeks of sessions, roughly one in thirteen skipped, and a note on top |

A history with no missed day is not a history anybody believes, so a
few are skipped on purpose; most sessions open on a warm-up and a few do
not, for the same reason.

**Each competition lift ends where the Standards card says it is.** The
final five-rep loads estimate the sample's own `estimatedMaxes`, so the
strength chart's last point and the standard beside it agree. They
disagreed by seventy pounds on the squat the first time this was
generated.

The only setting the fixture writes is `sampleData: 'loaded'`, merged
into what is there rather than replacing it — overwriting the blob to
set one field would make the demo silently responsible for every other
one. That flag is what puts the dismissible note at the top of the
page.

### Dates are offsets, never absolutes

Every date is computed from the moment of seeding. A fixture pinned to
absolute timestamps rots: opened a year after it was written it shows an
empty "this month" and a history that stopped long ago.

It is still deterministic — for a given `now`, the output is
byte-identical, ids included, which is what makes it testable. The
weekday in a session's title is read off its date rather than written
beside it, because a hardcoded "Friday" is right on the day it is typed
and wrong every day after.

### Written as records rather than driven

The rule elsewhere in this codebase is that a fixture should go through
the app's own use cases, so a fixture that compiles is one the app could
have produced. **The workout history cannot**, and the file says so in
place. `startWorkout` opens the session the calendar holds _today_, so a
loop of start-then-finish yields sessions all dated today. There is no way to ask those use
cases for a session that happened last week, because from the app's
point of view there never is one.

What that gives up is bought back with the real exercise slugs, the real
prescription shape and the real slot roles.

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

- **Sync.** It needs a token for the lifter's own private GitHub
  repository, which a visitor does not have and the demo must not ship.
  Moving data on the demo is export and import.
