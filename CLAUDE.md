# Working on Lift

A client-only React + TypeScript PWA for building strength programs and
tracking workouts. **No server, no database, no network calls.**
Persistence is IndexedDB behind a repository interface. That constraint is
the product, not a limitation — see
[docs/PERSISTENCE.md](docs/PERSISTENCE.md).

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

**The program is never the log.** A `ProgramTemplate` stores intent; a
`WorkoutLog` stores what happened; a `ProgramInstance` holds a frozen
`templateSnapshot` of the template it started from. Never write a result
back into a template. All three predecessor apps collapsed these, and
that single decision is why editing a program corrupted history in every
one of them.

**Resolution is pure.** `domain/resolution/resolve.ts` turns a
prescription into a number with no I/O and no clock. Keep it that way; it
is where nearly all the tests live.

**Strength is RTS, and only RTS.** The three lifts are run by reps at an
RPE, with back-off work driven by measured fatigue percentages
(`domain/framework/rts.ts`). The overhead press is **not** a strength
lift — it was a main lift under 5/3/1 only because that framework wanted
a fourth one, and it contributes nothing to a total. It is hypertrophy
work in the 3–6 range.

5/3/1 was removed wholesale — framework, assembler, recipes, splits,
progression, `percent-training-max`, training maxes. It is in the git
history if it is ever wanted back. Do not reintroduce a second framework
without deciding to carry two of everything again.

**A suggested load is never the prescription.** `estimatedMaxes` (in
settings) is the basis for every suggestion, and an estimate is
acceptable *because* RTS asks for reps at an RPE: get the number wrong
and the lifter corrects it by loading the bar they were going to load
anyway. This was the opposite under 5/3/1, where the percentage *was*
the prescription and an estimate would have silently changed what a cycle
meant — which is why training maxes existed and why they went with it.

**Assistance subtracts what the framework spent.** `domain/assembly/`
counts the volume the strength work already contributed before filling
anything. Removing that subtraction turns one coherent program into a
powerlifting block with a bodybuilding routine stapled to it.

**Landmarks stay ordered.** `MV ≤ MEV ≤ MAV ≤ MRV`, always. Check-ins
move MAV only, within bounds, and only with three sessions of evidence.
MEV never moves from a soreness rating.

**Readiness scales today, not the landmarks.** Sleep and stress adjust
one session. They must never produce a landmark proposal.

**`pending` is a real set outcome.** A set that has not been performed is
not a completed set with no numbers in it. Volume accounting depends on
the distinction.

**Seeding and wiping are separate named operations.** `seedIfEmpty`
cannot overwrite; `clearAllStores` always does. Never merge them behind a
flag — one wrong boolean would be somebody's training history.

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

**Never edit an existing IndexedDB migration step.** Bump `DB_VERSION`
and add a new guarded block. A device that already ran a step will not
run it again, so editing one leaves two devices with different schemas
and no way to tell.

**Exercise ids are slugs, not UUIDs** (`bench-press`). They are stable
across devices and readable in an export file. Do not "fix" this.

**The built-in programs are not privileged.** Every one is produced by
`assembleProgram` from an ordinary recipe. If a built-in ever needs a
special code path, the builder cannot express it either — fix the
builder, not the built-in.

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
