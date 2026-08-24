# Testing

Run with `pnpm test` (watch) or `pnpm test:run` (once). `pnpm verify`
runs them alongside typecheck, lint, format and build.

## The strategy

Coverage is not the target. Chasing a number produces tests written to
raise it, which are exactly the tests that do not catch bugs. What is
tested is what would be **silently wrong** rather than loudly broken.

That distinction matters unusually much here. If a refactor changed 85%
to 80% in the 5/3/1 scheme, nothing would error. No type would complain,
no screen would break, no integration test would notice. The app would
keep working and would simply prescribe the wrong training, for months,
to somebody who trusted it.

So the percentages are asserted literally, week by week:

```ts
it.each([
  [0, 'Week 1 — 5s', [65, 75, 85], [5, 5, 5]],
  [1, 'Week 2 — 3s', [70, 80, 90], [3, 3, 3]],
  [2, 'Week 3 — 5/3/1', [75, 85, 95], [5, 3, 1]],
  [3, 'Week 4 — Deload', [40, 50, 60], [5, 5, 5]],
])
```

And so are the loads they resolve to against a 315 lb training max —
205/235/270, 220/250/285, 235/270/300, 125/160/190 — written out rather
than computed, so a change to either the percentages or the rounding
shows up as a diff in the expected values.

## By layer

| Layer             | How                                      | What it protects                                                                                                                                                |
| ----------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/`         | Pure unit tests, table-driven            | The programming itself: percentages, rounding, rep targets, volume mathematics, progression conditions, landmark bounds                                         |
| `application/`    | Against a real (fake-indexeddb) database | Behaviours that span layers: a training max becoming a prescription, a logged set landing in the log rather than the program, a program advancing on completion |
| `infrastructure/` | Against a real (fake-indexeddb) database | Schema, indexes, migrations, seeding, export/import round-trip                                                                                                  |

Application tests use a real database rather than mocks on purpose. The
bugs worth catching there are integration bugs; a mocked repository would
assert that the code calls what the test expected it to call, which is a
tautology.

## The properties worth naming

These are the assertions that would be most expensive to get wrong.

**A round-trip through a backup is identity.** Export, wipe, import,
export again — byte-identical. With no server, this property is the only
thing standing between a lifter and losing years of training to a new
phone.

**Seeding cannot overwrite.** Seed, edit a built-in exercise, seed twice
more, confirm the edit survived. A seed that can overwrite is one wrong
call away from deleting a training history.

**A truncated backup is refused.** The realistic corruption is a
half-written file, which parses as valid JSON right up to the cut. The
test lops records off, re-serialises, and asserts the import is rejected
with an explanation.

**No muscle exceeds its maximum recoverable volume.** Asserted across
every week of an assembled program, for every muscle. This is the
invariant that makes the three composed layers one program rather than
three programs stacked.

**Assistance subtracts what the framework spent.** A bench day under
Boring But Big receives no chest accessories, and the same day's rear
delts do receive work. If this breaks, the app quietly doubles chest
volume and nothing else notices.

**Landmarks stay ordered under sustained pressure.** Twenty rounds of
"too much" applied in a loop, then `MV ≤ MEV ≤ MAV ≤ MRV` still holds.
This is the exact failure StrengthFlow had, where an unbounded counter
could walk a muscle's volume to zero.

**Readiness never moves a landmark.** Ten check-ins reporting poor sleep
produce no landmark proposal at all. A bad night is a reason to cut
today, not evidence that weekly tolerance changed — conflating the two is
what made the original implementation unusable.

**A skipped set carries no numbers.** Log a set, then skip it; the
actuals must be cleared. A skipped set retaining a load reads as
performed work to the volume totals.

**Assembly is deterministic.** The same recipe produces a byte-identical
program twice. A lifter's program must not change under them when they
reopen the builder.

## Deliberately not tested

Naming these is the point of the section.

- **Component rendering.** The screens are thin — they resolve a hook and
  lay out what it returns. A render test would mostly assert that
  Tailwind classes are present, which is a test of the test.
- **The service worker.** Workbox is a dependency, not our code. What is
  ours — that IndexedDB survives an update — is a property of not
  touching it, and there is no meaningful assertion for "we did nothing".
- **The wake lock, and the rest timer's wall-clock behaviour.** Both
  depend on tab suspension, which jsdom cannot simulate. The timer's
  correctness comes from its design — derived from an absolute timestamp
  rather than counted down — and the design is visible in the code.
- **`navigator.storage.persist()` being granted.** The browser decides.
  The app requests it, reports what it actually got, and assumes nothing.
- **Every exercise in the catalogue.** It is data; asserting that a
  barbell bench press is a barbell bench press catches nothing. What _is_
  tested is that every exercise a built-in program references exists in
  the library — the failure that would render a blank row.
