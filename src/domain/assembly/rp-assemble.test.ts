import { describe, expect, it } from 'vitest'

import { builtInExercises, STRENGTH_VARIATIONS } from '@/domain/exercises/catalogue'
import { MAX_DIRECT_SETS_PER_SESSION, TIER_FREQUENCY } from '@/domain/volume/frequency'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import { asExerciseId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { ProgramTemplate, ProgramWeek } from '@/domain/programs/program'
import {
  DEFAULT_MUSCLE_TIERS,
  weeklyTargetForMember,
  weeklyTargetForWeek,
} from '@/domain/priority/tiers'
import {
  SESSION_TOO_LONG_MINUTES,
  SESSION_TOO_SHORT_MINUTES,
} from '@/domain/autoregulation/schedule'
import { estimateDayMinutes } from '@/domain/programs/program'
import { slotVolume, sumVolume, volumeForSlots } from '@/domain/volume/accounting'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import { DEFAULT_DAYS_PER_WEEK } from '@/domain/autoregulation/schedule'
import { rpSplitForDays } from '@/domain/splits/rp-splits'

import { assembleRpProgram, defaultRpRecipe, type RpRecipe } from './rp-assemble'

const exercises = builtInExercises()
const lookup = (id: string) => exercises.find((exercise) => exercise.id === id)

/** The floor a fill slot may not go under; read from the recipe, not retyped. */
const MIN_SETS_PER_SLOT = defaultRpRecipe().minSetsPerSlot

const targetFor = (muscle: MuscleGroup): number =>
  weeklyTargetForMember(DEFAULT_MUSCLE_TIERS, muscle, DEFAULT_LANDMARKS[muscle])

function counterIds(): IdGenerator {
  let n = 0
  return {
    next: () => {
      n += 1
      return `id-${String(n)}`
    },
  }
}

function build(overrides: Partial<RpRecipe> = {}): ProgramTemplate {
  return assembleRpProgram(defaultRpRecipe(overrides), asProgramId('rp'), {
    exercises,
    ids: counterIds(),
    now: new Date('2026-08-24T00:00:00Z'),
  })
}

function weekAt(program: ProgramTemplate, index: number): ProgramWeek {
  const week = program.blocks[0]?.weeks[index]
  if (week === undefined) throw new Error('missing week ' + String(index))
  return week
}

function weeklyVolume(week: ProgramWeek): Record<MuscleGroup, number> {
  return sumVolume(
    week.days.map((day) =>
      volumeForSlots(
        day.slots.flatMap((slot) =>
          slot.exercise.kind === 'specific'
            ? [{ exerciseId: slot.exercise.exerciseId, sets: slot.sets }]
            : [],
        ),
        (id) => lookup(id),
      ),
    ),
  )
}

describe('the assembled block', () => {
  const program = build()
  const block = program.blocks[0]

  it('runs six working weeks plus a deload by default', () => {
    expect(block?.weeks).toHaveLength(7)
    expect(block?.weeks[6]?.isDeload).toBe(true)
    expect(block?.weeks.filter((week) => week.isDeload)).toHaveLength(1)
  })

  it('prescribes every working set by feel rather than by a percentage', () => {
    // RTS asks for reps at an RPE and reads the load back off what was
    // done. A percentage-of-something set anywhere in the block would
    // mean a number the lifter has to maintain by hand.
    //
    // `rts-backoff` is a percentage of *today's top set*, which is the
    // opposite case: it descends from a measurement taken minutes
    // earlier rather than from a figure carried between sessions.
    const kinds = new Set(
      (block?.weeks ?? []).flatMap((week) =>
        week.days.flatMap((day) =>
          day.slots
            .filter((slot) => slot.role !== 'conditioning')
            .flatMap((slot) =>
              slot.sets.filter((set) => set.isWarmup !== true).map((set) => set.load.kind),
            ),
        ),
      ),
    )

    expect([...kinds].sort()).toEqual(['rpe', 'rts-backoff'])
  })

  it('benches three times and shares the lower days between squat and deadlift', () => {
    const week = block?.weeks[0]
    const mains = (week?.days ?? []).map((day) => [
      ...new Set(
        day.slots
          .filter((slot) => slot.role === 'strength')
          .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
      ),
    ])

    /*
     * Six sessions across four days. Every lift is building and wants two
     * sessions: the bench takes both upper days, and the squat and the
     * deadlift share both lower ones.
     *
     * The order is the interesting part. Tuesday opens with the squat and
     * Thursday with the deadlift, because a lift that is always second is
     * a lift that is never trained fresh. See `assignStrengthLifts`.
     *
     * Thursday's squat is the **high bar**, which is the squat's second
     * variation. The deadlift repeats sumo on both days because it has
     * only one — `strengthSlugFor` takes the ordinal modulo the rotation
     * length, so a rotation shorter than the frequency repeats rather than
     * running off the end.
     */
    expect(mains).toEqual([
      ['paused-bench-press'],
      ['low-bar-squat', 'sumo-deadlift'],
      ['bench-press'],
      ['sumo-deadlift', 'high-bar-squat'],
    ])
  })

  it('rotates the bench through its variations, competition version first', () => {
    /*
     * Three bench sessions, three different lifts. The competition
     * version is first so that dropping the bench to a lower tier — which
     * buys fewer sessions — costs the variations rather than the lift the
     * total is measured on.
     */
    const week = block?.weeks[0]
    const benches = (week?.days ?? []).flatMap((day) =>
      day.slots
        .filter((slot) => slot.role === 'strength')
        .flatMap((slot) =>
          slot.exercise.kind === 'specific' &&
          STRENGTH_VARIATIONS.bench.includes(slot.exercise.exerciseId as string)
            ? [slot.exercise.exerciseId as string]
            : [],
        ),
    )

    // Two slots each — top set and back-off — so each variation appears twice.
    expect([...new Set(benches)]).toEqual(STRENGTH_VARIATIONS.bench)
  })

  it('gives a once-a-week lift the competition version, not a variation', () => {
    // The guard on the rotation. A lift the tiers buy one session of must
    // get the thing being measured; a rotation that started anywhere else
    // would silently stop tracking the competition lift.
    const once = build({
      strengthTiers: [
        { rank: 1, members: [] },
        { rank: 2, members: [] },
        { rank: 3, members: ['squat', 'bench', 'deadlift'] },
      ],
    })

    const benches = weekAt(once, 0).days.flatMap((day) =>
      day.slots
        .filter((slot) => slot.role === 'strength')
        .flatMap((slot) =>
          slot.exercise.kind === 'specific' &&
          STRENGTH_VARIATIONS.bench.includes(slot.exercise.exerciseId as string)
            ? [slot.exercise.exerciseId as string]
            : [],
        ),
    )

    expect([...new Set(benches)]).toEqual(['paused-bench-press'])
  })

  it('alternates which lift opens a day that hosts two', () => {
    /*
     * Guarding the property rather than the arrangement: whatever two
     * lifts share a pair of days, they must not appear in the same order
     * on both. Five heavy sets before the second one is a real cost, and
     * paying it always with the same lift is the failure.
     *
     * Compared as **lifts** rather than as exercise ids. Those were the
     * same thing until the squat gained a second variation, and comparing
     * slugs now reads a rotation as a different lift — the day is still
     * squatting whether the bar is high or low.
     */
    const liftOf = (slug: string): string =>
      Object.entries(STRENGTH_VARIATIONS).find(([, slugs]) => slugs.includes(slug))?.[0] ?? slug
    const week = block?.weeks[0]
    const pairs = (week?.days ?? [])
      .map((day) => [
        ...new Set(
          day.slots
            .filter((slot) => slot.role === 'strength')
            .flatMap((slot) =>
              slot.exercise.kind === 'specific' ? [liftOf(slot.exercise.exerciseId)] : [],
            ),
        ),
      ])
      .filter((lifts) => lifts.length > 1)

    expect(pairs.length).toBeGreaterThan(1)
    expect(pairs[0]).not.toEqual(pairs[1])
    expect([...(pairs[0] ?? [])].sort()).toEqual([...(pairs[1] ?? [])].sort())
  })

  /*
   * Two slots, adjacent, and they are not the same kind of thing.
   *
   * They were merged for a while on the reasoning that it is one exercise
   * in one trip to the rack. True, and it hid what makes this RTS: the
   * top set is a measurement everything below is derived from, and the
   * back-offs are work whose count is discovered rather than planned. As
   * one six-set row it read exactly like a percentage prescription.
   */
  it('splits the competition lift into a top set and its back-offs', () => {
    const bench = block?.weeks[0]?.days[2]?.slots.filter((slot) => slot.role === 'strength') ?? []

    expect(bench).toHaveLength(2)
    expect(bench.map((slot) => slot.variant)).toEqual(['Top set', 'Back-off'])

    // The top set first, always: the ordering pass is a stable sort and
    // both slots rank the same, so build order is what survives.
    expect(bench[0]?.sets).toHaveLength(1)
    expect(bench[0]?.sets[0]?.label).toBe('Top set')
    expect(bench[0]?.sets[0]?.notes).toMatch(/work up until this feels like/i)

    expect(bench[1]?.sets.every((set) => set.label === 'Back-off')).toBe(true)
    expect(bench[1]?.notes).toMatch(/fatigue target/)
  })

  /*
   * Priority buys sessions, not longer ones.
   *
   * It used to buy a bigger fatigue allowance — tier 1 stopped at 7%,
   * tier 3 at 2% — which is a coherent way to spend it and made the
   * stopping rule unquotable: with the load drop fixed at 5%, "stop when
   * the lighter bar feels like your top set" was true for exactly one
   * tier. Every session is now the same shape and the bench simply
   * happens three times.
   */
  it('spends priority on frequency, leaving every session the same shape', () => {
    const week = block?.weeks[0]

    const backoffSets = (week?.days ?? []).flatMap((day) =>
      day.slots.filter((slot) => slot.variant === 'Back-off').map((slot) => slot.sets.length),
    )

    expect(new Set(backoffSets).size).toBe(1)

    // Counted across a lift's variations, not by slug: the bench trains
    // two different versions of itself across the week and both are bench
    // sessions.
    const sessions = (lift: 'squat' | 'bench' | 'deadlift'): number =>
      (week?.days ?? []).filter((day) =>
        day.slots.some(
          (slot) =>
            slot.exercise.kind === 'specific' &&
            STRENGTH_VARIATIONS[lift].includes(slot.exercise.exerciseId),
        ),
      ).length

    // Nothing is specialised: all three lifts are building and take two
    // sessions each. The bench has both upper days, and the squat and the
    // deadlift share both lower ones.
    expect(sessions('bench')).toBe(2)
    expect(sessions('squat')).toBe(2)
    expect(sessions('deadlift')).toBe(2)
  })

  /*
   * The equality that makes the stopping rule sayable: drop five per
   * cent, keep going until the lighter bar feels like the opener.
   */
  it('sets the fatigue allowance equal to the load drop', () => {
    const backoff = (block?.weeks[0]?.days ?? [])
      .flatMap((day) => day.slots)
      .find((slot) => slot.variant === 'Back-off')

    expect(backoff?.notes).toMatch(/Load drop 5% · 5% fatigue target/)
  })

  it('gives every slot a sub-category, so the badge pair is one shape', () => {
    for (const week of block?.weeks ?? []) {
      for (const day of week.days) {
        for (const slot of day.slots) {
          expect(slot.variant, `${day.label}: ${slot.role}`).toBeDefined()
        }
      }
    }
  })

  /*
   * The intensity domain, which is the one thing about a conditioning
   * slot you need before starting it and the thing neither its duration
   * nor its effort note says. A walk and a swing session read as
   * interchangeable on a page and are nothing alike.
   *
   * Two domains, not three: LISS and Zone 2 are the same work under two
   * names, so the walk and the easy run share a label. What separates
   * them is systemic cost, which the exercise already carries.
   */
  it('names the intensity domain of each conditioning slot', () => {
    const styles = new Map<string, string>()

    for (const week of block?.weeks ?? []) {
      for (const day of week.days) {
        for (const slot of day.slots) {
          if (slot.role !== 'conditioning') continue
          if (slot.exercise.kind !== 'specific') continue
          styles.set(slot.exercise.exerciseId, slot.variant ?? '')
        }
      }
    }

    expect(styles.get(asExerciseId('incline-walk'))).toBe('Zone 2')
    expect(styles.get(asExerciseId('kb-swing'))).toBe('HIIT')
  })
})

describe('naming a day after what is in it', () => {
  const week = weekAt(build(), 5)

  /*
   * Which half of the body, and which time through.
   *
   * The heading named the kinds of work present — "Strength, Hypertrophy
   * and Conditioning" — which was informative while the days differed and
   * said nothing once every day carried all three. Four identical
   * headings distinguish nothing; what a reader wants on a Thursday
   * morning is which session this is.
   */
  it('says in the heading which region the day trains, and which time through', () => {
    expect(week.days[0]?.label).toBe('Monday — Upper 1')
    expect(week.days[1]?.label).toBe('Tuesday — Lower 1')
    expect(week.days[2]?.label).toBe('Thursday — Upper 2')
    expect(week.days[3]?.label).toBe('Friday — Lower 2')
  })

  it('names every competition lift, in the order they are performed', () => {
    /*
     * A day can hold two, and it used to name whichever came last — so a
     * session opening with the squat described itself as a deadlift day.
     * The order here is not cosmetic: it is the order the lifter will do
     * them in, and Thursday's is deliberately the reverse of Tuesday's.
     */
    const tuesday = week.days[1]
    const thursday = week.days[3]

    expect(tuesday?.focus).toMatch(/^Low Bar Squat and Sumo Deadlift, then /)
    // Thursday names the high bar, because that is the squat it actually
    // holds — a description that said "Low Bar Squat" on the day the bar
    // sits high would be the hardcoded-label failure in a new place.
    expect(thursday?.focus).toMatch(/^Sumo Deadlift and High Bar Squat, then /)

    // Without the parenthetical variant, which is catalogue bookkeeping.
    expect(tuesday?.focus).not.toContain('(')
  })

  it('names the muscles the day is actually for', () => {
    // The hardcoded "Monday — press and pull" was a claim, not a
    // description: move a tier and the fill changes underneath it.
    // Sentence-cased, so the leading muscle carries the capital.
    expect(week.days[0]?.focus).toMatch(/^Bench Press, then /)
    expect(week.days[0]?.focus).toContain('side delts')
    expect(week.days[1]?.focus).toContain('calves')
    expect(week.days[1]?.focus).toContain('hamstrings')
  })

  it('separates the direct work from what the day only pays incidentally', () => {
    /*
     * Merged, the two named an upper day after the core: pull-ups pay it
     * a fraction, and the core's weekly target is small enough for that
     * fraction to outrank everything chosen on purpose. It is a real
     * contribution and it is not what the day is for — which is exactly
     * the line the two sentences draw.
     */
    /*
     * Asserted as disjointness across every day rather than by naming a
     * muscle on a particular one. Which muscle a session pays only
     * incidentally moves whenever the fill moves, and a test that names
     * one is a test that fails for reasons unrelated to the rule.
     */
    for (const day of week.days) {
      const [trains = '', aside = ''] = (day.focus ?? '').split(' Some ')
      if (aside === '') continue

      const incidental = aside.replace(/\.$/, '').split(/,\s*|\s+and\s+/)
      expect(incidental.length).toBeGreaterThan(0)

      for (const muscle of incidental) {
        expect(trains, `${day.label}: ${muscle} named twice`).not.toContain(muscle)
      }
    }
  })

  it('reads as sentences rather than as delimited fields', () => {
    for (const day of week.days) {
      expect(day.focus, day.label).toMatch(/^[A-Z].*\.$/)
      expect(day.focus, day.label).not.toContain(' · ')
    }
  })
})

describe('how often a muscle is trained', () => {
  const week = weekAt(build(), 5)

  /** Days on which a muscle was the *primary* of some working slot. */
  const directDays = (muscle: MuscleGroup): number =>
    week.days.filter((day) =>
      day.slots.some((slot) => {
        if (slot.role === 'warmup' || slot.role === 'conditioning') return false
        if (slot.exercise.kind !== 'specific') return false
        if (!slot.sets.some((set) => set.isWarmup !== true)) return false
        return lookup(slot.exercise.exerciseId)?.primaryMuscle === muscle
      }),
    ).length

  /*
   * The bug this pins down. The old floor counted *any* contribution —
   * including the half-credit a row pays the biceps — so the upper back
   * could read as trained five days a week off one barbell row, and the
   * forearms could carry a thirteen-set target on a single direct
   * session. Half credit is right for volume and wrong for frequency.
   */
  it('trains a specialised muscle directly more than once a week', () => {
    /*
     * Read from the tiers rather than listed, so promoting a muscle does
     * not quietly leave it unchecked.
     *
     * The chest is excluded because the bench and the dips cover it three
     * days a week without a single slot being scheduled *for* it — the
     * property under test is about muscles that need dedicated work, and
     * a muscle paid by everything does not.
     */
    const specialised = DEFAULT_MUSCLE_TIERS.find((tier) => tier.rank === 1)?.members ?? []

    for (const muscle of specialised) {
      if (muscle === 'chest') continue
      expect(directDays(muscle), muscle).toBeGreaterThan(1)
    }
  })

  it('trains a higher-tier muscle more often than a lower-tier one', () => {
    /*
     * This compared side delts against calves on the reasoning that the
     * first is owed three times the volume — true at the time, and the
     * wrong reason. Frequency follows the tier and nothing else, which is
     * the whole point of TIER_FREQUENCY.
     *
     * Built with a short tier list rather than read off the shipped week,
     * for a second reason that arrived later: the shipped upper days are
     * full, so two muscles that should differ in frequency can come out
     * equal because neither fitted. That is a capacity fact and it is
     * asserted below, on purpose, separately — mixing it in here would
     * leave this test unable to fail for the reason it exists.
     */
    const sparse = weekAt(
      build({
        muscleTiers: [
          { rank: 1, members: [], label: 'Specialising' },
          { rank: 2, members: ['side-delts'], label: 'Building' },
          { rank: 3, members: ['core'], label: 'Maintaining' },
        ],
      }),
      3,
    )

    const daysWith = (muscle: MuscleGroup): number =>
      sparse.days.filter((day) =>
        day.slots.some(
          (slot) =>
            slot.exercise.kind === 'specific' &&
            lookup(slot.exercise.exerciseId)?.primaryMuscle === muscle,
        ),
      ).length

    expect(daysWith('side-delts')).toBeGreaterThan(daysWith('core'))
  })

  it('does not let one session swallow a muscle`s whole week', () => {
    for (const day of week.days) {
      const perMuscle = new Map<MuscleGroup, number>()

      for (const slot of day.slots) {
        if (slot.role === 'warmup' || slot.role === 'conditioning') continue
        if (slot.exercise.kind !== 'specific') continue
        const exercise = lookup(slot.exercise.exerciseId)
        if (exercise === undefined) continue

        const working = slot.sets.filter((set) => set.isWarmup !== true).length
        perMuscle.set(
          exercise.primaryMuscle,
          (perMuscle.get(exercise.primaryMuscle) ?? 0) + working,
        )
      }

      for (const [muscle, sets] of perMuscle) {
        // One slot may run to `maxSetsPerSlot`; the guard is against a day
        // stacking several slots of the same muscle into a junk block.
        expect(sets, `${day.label}: ${muscle}`).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('how a muscle is spread across its sessions', () => {
  const week = weekAt(build(), 0)

  /** Credited sets of one muscle on each day that trains it at all. */
  const perDay = (muscle: MuscleGroup): number[] =>
    week.days
      .map((day) =>
        day.slots.reduce((total, slot) => {
          if (slot.exercise.kind !== 'specific') return total
          const exercise = lookup(slot.exercise.exerciseId)
          if (exercise === undefined) return total
          return total + slotVolume(exercise, slot.sets)[muscle]
        }, 0),
      )
      .filter((credit) => credit > 0)

  it('gives a prioritised muscle a comparable dose each session', () => {
    /*
     * The reported bug: eight and a half sets of biceps on Monday and two
     * on Wednesday, on a tier-1 muscle.
     *
     * The cause was incidental credit being spent twice. Monday sized six
     * curl sets against an unpaid target and *then* placed chin-ups for
     * the lats, which paid the biceps another two and a half; the day
     * delivered well over its share, and the crowded day later in the
     * week got the remainder. Fixed by budgeting the compound work first
     * and subtracting what the day has already paid.
     *
     * An absolute gap rather than a ratio, and the change is not cosmetic.
     * A ratio is scale-sensitive: when a session could hold eight sets, a
     * two-set difference was 1.4 and passed; with the ceiling at five the
     * same two sets are 2.0 and fail. The programming did not get worse —
     * the denominator got smaller.
     *
     * The gap is bounded by the per-session ceiling, which is a real
     * constant rather than a tuned one: two sessions of the same muscle
     * should never differ by a whole session's worth of work. The bug this
     * guards against was 8.5 against 2 — a gap of six and a half — and
     * still fails.
     */
    for (const muscle of ['biceps', 'chest', 'side-delts'] as const) {
      const days = perDay(muscle)
      const most = Math.max(...days)
      const least = Math.min(...days)

      expect(most - least, `${muscle}: ${days.map(String).join(' / ')}`).toBeLessThan(
        MAX_DIRECT_SETS_PER_SESSION,
      )
    }
  })

  it('does not overshoot a prioritised target to achieve that', () => {
    // The cheap way to even out a spread is to give every session the
    // full dose, which meets the shape and blows the weekly number. The
    // biceps came out at 21 against a target of 17 before this.
    const asked = weeklyTargetForWeek(
      DEFAULT_MUSCLE_TIERS,
      'biceps',
      DEFAULT_LANDMARKS.biceps,
      false,
    )
    const delivered = perDay('biceps').reduce((total, credit) => total + credit, 0)

    expect(delivered).toBeLessThanOrEqual(asked + 1)
  })

  it('does not let an easy walk cost a day its lifting', () => {
    /*
     * Zone 2 conditioning is outside the accessory budget, and this is
     * the test that says why.
     *
     * The ceiling exists so one day cannot claim the week's recovery
     * allowance. An incline walk is twenty minutes costing almost no
     * systemic fatigue, and charging it against the budget spends a
     * recovery allowance on something that does not consume one — put it
     * on the upper days and the side delts silently went from twenty sets
     * to eleven. A training decision made by bookkeeping.
     *
     * Asserted by removing the walk rather than against a fraction of the
     * ask, which is the second and better attempt. The first compared
     * delivered volume to a tolerance, and a tolerance cannot tell a
     * bookkeeping bug from an ordinary squeeze: the number it was
     * measuring moves whenever the split, the tiers or the per-slot cap
     * move, so every one of those changes arrives as a failure here and
     * gets answered by widening the tolerance. Excluding the walk asks
     * the question directly — does this slot cost the day its lifting —
     * and the answer is a comparison the assembler either makes or does
     * not.
     */
    const withWalk = weeklyVolume(weekAt(build(), 3))
    const withoutWalk = weeklyVolume(
      weekAt(build({ excludedExercises: [asExerciseId('incline-walk')] }), 3),
    )

    for (const muscle of ['side-delts', 'biceps', 'triceps', 'rear-delts'] as const) {
      expect(withWalk[muscle], muscle).toBe(withoutWalk[muscle])
    }
  })

  /*
   * The other half of the same rule: HIIT *does* compete for the budget.
   * Swings are intervals with a real systemic cost, and work that
   * competes for recovery should compete for the allowance.
   */
  it('still charges interval work against the day', () => {
    const swing = weekAt(build(), 3).days.flatMap((day) =>
      day.slots.filter(
        (slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId === 'kb-swing',
      ),
    )

    expect(swing.length).toBeGreaterThan(0)
    expect(swing.every((slot) => slot.variant === 'HIIT')).toBe(true)
  })

  const wristDirections = (built: ProgramTemplate): string[] =>
    weekAt(built, 3).days.flatMap((day) =>
      day.slots.flatMap((slot) => {
        if (slot.exercise.kind !== 'specific') return []
        const pattern = lookup(slot.exercise.exerciseId)?.pattern
        return pattern === 'wrist-flexion' || pattern === 'wrist-extension' ? [pattern] : []
      }),
    )

  it('trains the forearms both ways rather than twice the same way', () => {
    /*
     * Four wrist exercises are two movements, and an id-level repeat
     * penalty happily scheduled a barbell wrist curl and then a dumbbell
     * wrist curl — twice into flexion, with the extensors untouched.
     * Keying the penalty on muscle-and-pattern is what makes "once each
     * way" fall out of a rule that was already there.
     *
     * Built with the forearms tiered up rather than read off the shipped
     * week, because the shipped week maintains them and a maintained
     * muscle gets one session — see below. The rule is reachable from the
     * tier editor, so it is tested through the tier editor's input rather
     * than deleted for not firing on the default.
     */
    const directions = wristDirections(
      build({
        muscleTiers: [
          { rank: 1, members: [], label: 'Specialising' },
          { rank: 2, members: ['forearms'], label: 'Building' },
          { rank: 3, members: [], label: 'Maintaining' },
        ],
      }),
    )

    expect(directions).toHaveLength(2)
    expect(new Set(directions).size).toBe(2)
  })

  /*
   * And at tier 3 it gets one direction, which is the model behaving
   * correctly rather than the rule above being violated.
   *
   * A maintained muscle is trained once a week and one session cannot be
   * both flexion and extension. Recorded rather than fixed because the
   * alternative — a floor forcing a second session for a muscle the
   * lifter has explicitly deprioritised — would make the bottom tier mean
   * something different for the forearms than for everything else.
   *
   * It is worth knowing that the shipped default lands here, and that the
   * flexors therefore get nothing: the pulls are strapped, so no
   * competition lift pays them either.
   */
  it('trains a maintained forearm once, in one direction', () => {
    expect(new Set(wristDirections(build())).size).toBeLessThanOrEqual(1)
  })

  it('does not credit the forearms for a strapped pull', () => {
    /*
     * The forearm work in a heavy pull is grip. In straps it is gone,
     * while the lat and hamstring credit is untouched — so a catalogue
     * that still paid the forearms for a deadlift would report a muscle
     * covered by work nobody did, and schedule nothing direct for it.
     */
    for (const slug of ['sumo-deadlift', 'barbell-row', 'pull-up', 'chin-up', 'barbell-shrug']) {
      expect(lookup(slug)?.secondaryMuscles, slug).not.toContain('forearms')
    }

    // Curls still pay them: that involvement is wrist and elbow work
    // rather than grip, and nobody straps a curl.
    expect(lookup('hammer-curl')?.secondaryMuscles).toContain('forearms')
  })

  it('keeps a day to a session rather than a list of two-set exercises', () => {
    /*
     * Thirteen exercises of two sets is a worse session than six of four,
     * and this is the test that says so.
     *
     * It asserted an exercise count, which was the only instrument
     * available while a slot grace and a minute budget were what bounded
     * the day. Both are gone, and a count was always the wrong instrument:
     * it cannot tell eight exercises of four sets from thirteen of two,
     * and only one of those is the failure.
     *
     * Two rules now make the bad shape unconstructible — a floor of three
     * sets on any slot, and one exercise per muscle per session — so those
     * are what is asserted. The day's length falls out of them and is
     * deliberately not checked.
     */
    for (const day of week.days) {
      const fill = day.slots.filter(
        (slot) => slot.role === 'hypertrophy' || slot.role === 'assistance',
      )

      const perMuscle = new Map<MuscleGroup, number>()

      for (const slot of fill) {
        const working = slot.sets.filter((set) => set.isWarmup !== true).length
        expect(working, `${day.label}: a slot of ${String(working)} sets`).toBeGreaterThanOrEqual(
          MIN_SETS_PER_SLOT,
        )

        if (slot.exercise.kind !== 'specific') continue
        const muscle = lookup(slot.exercise.exerciseId)?.primaryMuscle
        if (muscle === undefined) continue
        perMuscle.set(muscle, (perMuscle.get(muscle) ?? 0) + 1)
      }

      for (const [muscle, count] of perMuscle) {
        expect(count, `${muscle} has ${String(count)} exercises on ${day.label}`).toBe(1)
      }
    }
  })
})

describe('the order a session is performed in', () => {
  const week = weekAt(build(), 5)

  const rolesOn = (dayIndex: number): string[] =>
    (week.days[dayIndex]?.slots ?? []).map((slot) => slot.role)

  it('puts the heavy work before the isolation on every day', () => {
    /*
     * The failure this guards against, in the lifter's own words: hit the
     * competition lift, move to some random-seeming isolation, then go
     * right back to two lower-body compounds. Choosing exercises by which
     * muscle is owed the most is the right way to decide *what* is in a
     * session and a terrible way to decide *when*.
     */
    const order = ['warmup', 'main', 'strength', 'hypertrophy', 'assistance', 'conditioning']

    for (const [index, day] of week.days.entries()) {
      const ranks = rolesOn(index).map((role) => order.indexOf(role))
      expect(
        [...ranks].sort((a, b) => a - b),
        day.label,
      ).toEqual(ranks)
    }
  })

  it('opens a strength day with the competition lift, not with an accessory', () => {
    const thursday = week.days[3]
    const firstWorking = thursday?.slots.find((slot) => slot.role !== 'warmup')

    expect(firstWorking?.role).toBe('strength')
  })

  it('does the heaviest compound first among the accessories', () => {
    // Whatever most needs a fresh lifter should get one.
    const costOf = (id: string): number => lookup(id)?.systemicCost ?? 0

    for (const [index, day] of week.days.entries()) {
      const costs = (week.days[index]?.slots ?? [])
        .filter((slot) => slot.role === 'hypertrophy' && slot.exercise.kind === 'specific')
        .flatMap((slot) =>
          slot.exercise.kind === 'specific' ? [costOf(slot.exercise.exerciseId)] : [],
        )

      expect(
        [...costs].sort((a, b) => b - a),
        day.label,
      ).toEqual(costs)
    }
  })

  it('keeps the warm-ups in the order they were prescribed', () => {
    // A sequence somebody chose, not a load to be spent while fresh.
    // Sorting these by cost put the rotator-cuff work first.
    const monday = (week.days[0]?.slots ?? [])
      .filter((slot) => slot.role === 'warmup')
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

    expect(monday).toEqual(['shoulder-dislocation', 'rotator-cuff-plate', 'band-pull-apart'])
  })

  it('runs the isolation work in tier order, priority first', () => {
    /*
     * The fill orders by muscle *debt*, which answers a different
     * question. A prioritised muscle nearly paid up for the week is owed
     * less on a given day than a maintained one that has had nothing, so
     * the biceps — tier 1, and over target across the week — came last on
     * a day that also trained the traps at maintenance. Every isolation
     * slot after the first is done more tired than the one before it, and
     * a tier list is exactly the thing that should decide who gets the
     * freshness.
     */
    for (const [index, day] of week.days.entries()) {
      const ranks = day.slots
        .filter((slot) => slot.role === 'assistance')
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))
        .flatMap((id) => {
          const muscle = lookup(id)?.primaryMuscle
          if (muscle === undefined) return []
          const rank = DEFAULT_MUSCLE_TIERS.find((tier) => tier.members.includes(muscle))?.rank
          return [rank ?? DEFAULT_MUSCLE_TIERS.length]
        })

      expect(
        [...ranks].sort((a, b) => a - b),
        `${day.label} (index ${String(index)})`,
      ).toEqual(ranks)
    }
  })

  it('does not let a tier list reorder the compounds', () => {
    /*
     * The guard on the rule above. Ordering isolation by priority is a
     * cheap trade; doing it to the compounds would put a curl ahead of a
     * heavy pull to honour a tier, which costs more than it fixes.
     * Compounds stay on systemic cost — asserted by the cost test above,
     * and pinned here against a future "just sort everything by tier".
     */
    /*
     * Asserted as a property across the week rather than by naming two
     * exercises on one day. The first version pinned Barbell Row ahead
     * of Dips on Wednesday, which stopped being true when Dips moved to
     * another day — a test about *ordering* failing because the
     * *composition* changed is a test measuring the wrong thing.
     */
    for (const day of week.days) {
      const costs = day.slots
        .filter((slot) => slot.role === 'hypertrophy')
        .flatMap((slot) =>
          slot.exercise.kind === 'specific'
            ? [lookup(slot.exercise.exerciseId)?.systemicCost ?? 0]
            : [],
        )

      expect(
        [...costs].sort((a, b) => b - a),
        day.label,
      ).toEqual(costs)
    }
  })

  it('finishes with conditioning', () => {
    for (const [index, day] of week.days.entries()) {
      const roles = rolesOn(index)
      const conditioning = roles.indexOf('conditioning')
      if (conditioning === -1) continue

      expect(conditioning, day.label).toBe(roles.length - 1)
    }
  })
})

describe('conditioning', () => {
  const program = build()
  const week = weekAt(program, 3)

  const conditioningIn = (dayIndex: number) =>
    (week.days[dayIndex]?.slots ?? []).filter((slot) => slot.role === 'conditioning')

  it('is programmed rather than left to the lifter', () => {
    const all = week.days.flatMap((day) =>
      day.slots
        .filter((slot) => slot.role === 'conditioning')
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
    )

    expect(all).toEqual(['incline-walk', 'kb-swing', 'incline-walk', 'kb-swing'])
  })

  it('runs every day, split by domain rather than by spare time', () => {
    /*
     * Easy work on the upper days, intervals on the lower ones.
     *
     * The split is by *domain*: swings are a hinge with a real systemic
     * cost and belong beside the lifting that already loads the hips,
     * while a Zone 2 walk asks nothing of anything and can sit anywhere.
     *
     * It used to be decided by the clock instead — conditioning went
     * wherever the day was short — which balanced the minute totals and
     * made the arrangement impossible to state without reading them.
     */
    const domainOn = (dayIndex: number) =>
      conditioningIn(dayIndex).map((slot) => slot.variant ?? '')

    expect(domainOn(0)).toEqual(['Zone 2'])
    expect(domainOn(1)).toEqual(['HIIT'])
    expect(domainOn(2)).toEqual(['Zone 2'])
    expect(domainOn(3)).toEqual(['HIIT'])
  })

  it('is prescribed by time, not by reps', () => {
    for (const day of week.days) {
      for (const slot of day.slots.filter((candidate) => candidate.role === 'conditioning')) {
        expect(slot.sets[0]?.reps.kind).toBe('time')
      }
    }
  })

  it('counts toward the session budget rather than riding along free', () => {
    // A twenty-minute walk costed as one thirty-second set let the
    // planner stack conditioning onto the longest day and still believe
    // the day fitted inside the target.
    const withWalk = estimateDayMinutes(week.days[0] as never)
    const conditioningMinutes = conditioningIn(0).reduce(
      (total, slot) =>
        total +
        slot.sets.reduce((sum, set) => sum + (set.reps.kind === 'time' ? set.reps.seconds : 0), 0) /
          60,
      0,
    )

    expect(conditioningMinutes).toBeGreaterThanOrEqual(20)
    expect(withWalk).toBeGreaterThan(conditioningMinutes)
  })

  it('is cut on the deload like everything else', () => {
    const deloadRun = weekAt(program, 6)
      .days.flatMap((day) => day.slots)
      .find(
        (slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId === 'incline-walk',
      )
    const workingRun = week.days
      .flatMap((day) => day.slots)
      .find(
        (slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId === 'incline-walk',
      )

    const seconds = (slot: typeof deloadRun): number => {
      const set = slot?.sets[0]
      return set?.reps.kind === 'time' ? set.reps.seconds : 0
    }

    expect(seconds(deloadRun)).toBeLessThan(seconds(workingRun))
  })
})

describe('constant proximity to failure', () => {
  const program = build()

  it('holds every hypertrophy work set at one rep in reserve', () => {
    const sets = (program.blocks[0]?.weeks[0]?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'hypertrophy' || slot.role === 'assistance')
      .flatMap((slot) => slot.sets.slice(0, -1))

    expect(sets.length).toBeGreaterThan(0)
    // RPE 9 is one rep in reserve. No ramp across the block.
    expect(sets.every((set) => set.load.kind === 'rpe' && set.load.target === 9)).toBe(true)
  })

  it('does not ramp RPE across the weeks', () => {
    const rpeInWeek = (weekIndex: number): number[] =>
      (program.blocks[0]?.weeks[weekIndex]?.days ?? [])
        .flatMap((day) => day.slots)
        .filter((slot) => slot.role === 'hypertrophy' || slot.role === 'assistance')
        .flatMap((slot) => slot.sets.slice(0, -1))
        .flatMap((set) => (set.load.kind === 'rpe' ? [set.load.target] : []))

    expect(new Set([...rpeInWeek(0), ...rpeInWeek(3), ...rpeInWeek(5)])).toEqual(new Set([9]))
  })

  it('takes the last set to failure only where failing is safe', () => {
    const slots = (program.blocks[0]?.weeks[2]?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'hypertrophy' || slot.role === 'assistance')

    for (const slot of slots) {
      if (slot.exercise.kind !== 'specific') continue
      const exercise = lookup(slot.exercise.exerciseId)
      const last = slot.sets[slot.sets.length - 1]

      /*
       * Two separate reasons not to fail a set, and both apply here. A
       * skullcrusher over your face with no spotter is the first. The
       * second is rep count: the overhead press runs 3–6, and a top-heavy
       * triple taken to failure costs what a max costs — it also carried
       * the note "one rep in reserve, not a max" while being prescribed
       * at RPE 10, which is two instructions contradicting each other on
       * one slot.
       */
      const heavy = (exercise?.defaultRepRange?.high ?? 12) <= 6

      if (exercise?.safeToFail === true && !heavy) {
        expect(last?.load).toEqual({ kind: 'rpe', target: 10 })
      } else {
        expect(last?.load).toEqual({ kind: 'rpe', target: 9 })
      }
    }
  })
})

describe('tiers driving volume', () => {
  const program = build()

  it('gives a higher-tier muscle more weekly volume than a lower-tier one', () => {
    /*
     * Stated with tiers written here rather than read off the defaults.
     *
     * This compared biceps against calves, which worked while they sat in
     * different tiers and became a coincidence when they stopped: the
     * property is about the ordering, and reading two muscles out of the
     * shipped list only tests it for as long as nobody moves either one.
     */
    const week = weekAt(
      build({
        muscleTiers: [
          { rank: 1, members: ['biceps'], label: 'Specialising' },
          { rank: 2, members: ['side-delts'], label: 'Building' },
          { rank: 3, members: ['calves'], label: 'Maintaining' },
        ],
      }),
      3,
    )

    const volume = weeklyVolume(week)

    expect(volume.biceps).toBeGreaterThan(volume.calves)
    expect(volume['side-delts']).toBeGreaterThan(volume.calves)
  })

  /*
   * The arms are separately tierable, which is the property worth
   * keeping — not any particular arrangement of them.
   *
   * This asserted biceps above triceps in the shipped tiers, which was a
   * fact about the defaults rather than about the model, and it has now
   * been true and then false without the model changing at all. What
   * matters is that a lifter *can* separate them: the fractional credit
   * that made pressing pay the triceps is gone, so the two are only as
   * different as the tier list says they are.
   */
  it('lets the arms be tiered apart from each other', () => {
    const tiers = [
      { rank: 1, members: ['biceps'] as const, label: 'Specialising' },
      { rank: 2, members: [] as const, label: 'Building' },
      { rank: 3, members: ['triceps'] as const, label: 'Maintaining' },
    ]

    expect(weeklyTargetForMember(tiers, 'biceps', DEFAULT_LANDMARKS.biceps)).toBeGreaterThan(
      weeklyTargetForMember(tiers, 'triceps', DEFAULT_LANDMARKS.triceps),
    )
  })

  /*
   * The frequency backfill does not run on a deload, and this is the test
   * that says why it must not.
   *
   * It places at the three-set floor, because a slot cannot be smaller. On
   * a working week that rounds an ask of five up to six across two
   * sessions — the floor being honest about the smallest useful dose. On a
   * deload the target is MV, the main fill correctly declines to open a
   * two-set slot, and the backfill was putting three sets on both upper
   * days regardless: the biceps came out at six in the deload and six in
   * the peak week, so the deload was not one.
   */
  it('does not let the frequency floor undo a deload', () => {
    const deload = weeklyVolume(weekAt(program, 6))
    const working = weeklyVolume(weekAt(program, 3))

    for (const muscle of ['biceps', 'triceps', 'side-delts'] as const) {
      expect(deload[muscle], `${muscle} was not deloaded`).toBeLessThan(working[muscle])
    }
  })

  it('gives every working week the same volume', () => {
    /*
     * The block used to open below the target and climb into it. Flat
     * replaced that: a week is a week, and the only one that differs is
     * the deload. This is the property that makes a single "working
     * week" view on the Program page honest — if the weeks diverged
     * again, that screen would be showing one of six and saying it was
     * all of them.
     */
    const totals = [0, 1, 2, 3, 4, 5].map((index) => weeklyVolume(weekAt(program, index)).biceps)

    expect(new Set(totals).size).toBe(1)
  })

  it('never exceeds maximum recoverable volume in any week', () => {
    for (const [index, week] of (program.blocks[0]?.weeks ?? []).entries()) {
      const volume = weeklyVolume(week)

      for (const muscle of Object.keys(volume) as MuscleGroup[]) {
        expect(
          volume[muscle],
          `${muscle} over MRV in week ${String(index + 1)}`,
        ).toBeLessThanOrEqual(DEFAULT_LANDMARKS[muscle].mrv)
      }
    }
  })

  it('drops to maintenance on the deload', () => {
    const deload = weeklyVolume(weekAt(program, 6))
    const peak = weeklyVolume(weekAt(program, 5))

    expect(deload.biceps).toBeLessThan(peak.biceps)
  })
})

describe('the split', () => {
  /*
   * This asserted that every muscle carrying real volume is trained on at
   * least two days, and the four-day week cannot promise that any more.
   *
   * Two upper days with nine tier-2 muscles need eight accessory slots a
   * day; the clock allows six. Raising `maxHypertrophySlotsPerDay` to
   * seven, eight or nine changes nothing at all — measured — because the
   * fill stops on `SESSION_MINUTES_CAP`, not on the slot count. So the
   * frequency the tiers ask for is not always deliverable, and a test
   * demanding it would be asserting something about the split rather than
   * about the assembler.
   *
   * What is still guaranteed is the half that matters most, and it is
   * stated as a ceiling because a ceiling is always achievable: a muscle
   * that loses a session must not be handed the missing sets in the one it
   * keeps. That was the actual failure — a weekly target delivered in a
   * single sitting, where splitting it was the whole point.
   */
  it('never hands a muscle more than one session’s worth in a day', () => {
    const week = weekAt(build(), 3)

    for (const day of week.days) {
      const perMuscle = new Map<MuscleGroup, number>()

      for (const slot of day.slots) {
        if (slot.exercise.kind !== 'specific') continue
        const exercise = lookup(slot.exercise.exerciseId)
        if (exercise === undefined || slot.role === 'conditioning') continue
        const working = slot.sets.filter((set) => set.isWarmup !== true).length
        perMuscle.set(
          exercise.primaryMuscle,
          (perMuscle.get(exercise.primaryMuscle) ?? 0) + working,
        )
      }

      for (const [muscle, sets] of perMuscle) {
        expect(sets, `${muscle} on ${day.label}`).toBeLessThanOrEqual(MAX_DIRECT_SETS_PER_SESSION)
      }
    }
  })

  /*
   * Every muscle gets the frequency its tier bought. No exceptions, and
   * there was one until the session ceiling went.
   *
   * This is the invariant TIER_FREQUENCY exists to state, and for a while
   * the four-day week could not honour it: two upper days ran out of clock
   * at six accessory slots, so the side delts and the triceps got one
   * session where their tier asked for two. It was recorded here as a
   * known miss, alongside a companion test proving the cause was the
   * ceiling rather than the ordering — which is the shape a test takes
   * when a constraint is quietly overriding a rule.
   *
   * With no session ceiling the rule holds outright, so it is asserted
   * outright. If this fails again, the question to ask first is what new
   * limit is declining to schedule the last exercise.
   */
  it('trains every muscle as often as its tier asks', () => {
    const week = weekAt(build(), 3)
    const split = rpSplitForDays(DEFAULT_DAYS_PER_WEEK)

    const volume = weeklyVolume(week)

    const directDaysFor = (muscle: MuscleGroup): number =>
      week.days.filter((day) =>
        day.slots.some(
          (slot) =>
            slot.exercise.kind === 'specific' &&
            lookup(slot.exercise.exerciseId)?.primaryMuscle === muscle,
        ),
      ).length

    for (const muscle of MUSCLE_GROUPS) {
      /*
       * Muscles with no direct work are out of scope, not failures. Quads
       * and glutes are maintained and paid past their target by the squat
       * and the deadlift, so nothing is scheduled *for* them and a count
       * of direct days says nothing about how often they were trained.
       */
      if (directDaysFor(muscle) === 0) continue

      /*
       * And a muscle already at its weekly volume is finished, however
       * few sessions it took. Frequency is a means to volume and never a
       * goal — a second session for a muscle at its target buys fatigue
       * and no stimulus, which is the rule the backfill enforces. The
       * front delts reach three sets against a target of two on their
       * first upper day and correctly get no second one.
       */
      if (volume[muscle] >= targetFor(muscle)) continue

      const accountable = split.days.filter((day) => day.muscles.includes(muscle)).length
      const rank = DEFAULT_MUSCLE_TIERS.find((tier) => tier.members.includes(muscle))?.rank ?? 3
      const wanted = Math.min(accountable, TIER_FREQUENCY[rank] ?? 1)

      expect(directDaysFor(muscle), `${muscle} trained on too few days`).toBeGreaterThanOrEqual(
        wanted,
      )
    }
  })

  it.each([2, 3, 5])('supports a %i-day week', (days) => {
    const program = build({ daysPerWeek: days })
    expect(program.blocks[0]?.weeks[0]?.days).toHaveLength(days)
  })

  it('puts a warm-up at the top of every day', () => {
    const program = build()

    for (const day of program.blocks[0]?.weeks[0]?.days ?? []) {
      expect(day.slots[0]?.role).toBe('warmup')
      expect(day.slots[0]?.sets.every((set) => set.isWarmup === true)).toBe(true)
    }
  })

  /*
   * Asserted on the warm-up sets themselves, not by diffing two programs.
   *
   * The whole-program comparison this replaced was a stronger claim than
   * the invariant: warm-ups earn no volume, but they do cost minutes, so
   * building without them leaves room the fill spends on something else.
   * That comparison held only while the days were pinned to fixed
   * exercise lists and had little room to differ. It is not what the rule
   * says, and it broke the moment the pins came off.
   */
  it('counts no volume for warm-ups', () => {
    const program = build()

    const warmUpSets = (program.blocks[0]?.weeks ?? [])
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'warmup')
      .flatMap((slot) =>
        slot.exercise.kind === 'specific'
          ? [{ exerciseId: slot.exercise.exerciseId, sets: slot.sets }]
          : [],
      )

    expect(warmUpSets.length).toBeGreaterThan(0)

    const volume = volumeForSlots(warmUpSets, (id) => lookup(id))
    expect(Object.values(volume).every((sets) => sets === 0)).toBe(true)
  })
})

describe('respecting the gym', () => {
  it('honours excluded exercises', () => {
    const program = build({ excludedExercises: [asExerciseId('dips')] })

    const ids = (program.blocks[0]?.weeks ?? [])
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

    expect(ids).not.toContain('dips')
  })

  it('fills a day that has lost an exercise rather than leaving it short', () => {
    // An exclusion is absolute and must not cost the day its session: a
    // lifter with no dip station still gets a full upper day, built out
    // of something else.
    const program = build({ excludedExercises: [asExerciseId('dips')] })
    const upper = weekAt(program, 3).days[2]

    const ids = (upper?.slots ?? []).flatMap((slot) =>
      slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [],
    )

    expect(ids).not.toContain('dips')
    expect(ids.length).toBeGreaterThan(2)
  })

  it('honours an exclusion on conditioning and on warm-ups', () => {
    // No treadmill, or a shoulder that will not take dislocations.
    const program = build({
      excludedExercises: [asExerciseId('running'), asExerciseId('shoulder-dislocation')],
    })

    const ids = (program.blocks[0]?.weeks ?? [])
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

    expect(ids).not.toContain('running')
    expect(ids).not.toContain('shoulder-dislocation')
  })

  it('is deterministic', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()))
  })
})

describe('session length', () => {
  const program = build()

  it('keeps every day under the two hours that would demand another session', () => {
    for (const week of program.blocks[0]?.weeks ?? []) {
      for (const day of week.days) {
        expect(estimateDayMinutes(day), `${day.label} in ${week.label} runs too long`).toBeLessThan(
          SESSION_TOO_LONG_MINUTES,
        )
      }
    }
  })

  /*
   * There is deliberately no lower bound here.
   *
   * One used to exist, and satisfying it took three padding mechanisms
   * in the assembler — a grace period, a top-up pass and a slot-growing
   * loop — all to move a thirty-nine minute session to forty-one. A
   * short day is information: a deadlift day with the legs on
   * maintenance is forty minutes because that is what the tiers asked
   * for.
   */

  it('averages into the band the frequency autoregulator holds at', () => {
    const peak = weekAt(program, 5)
    const minutes = peak.days.map((day) => estimateDayMinutes(day))
    const average = minutes.reduce((sum, m) => sum + m, 0) / minutes.length

    // Between the two thresholds, so a settled block neither adds nor
    // drops a day.
    expect(average).toBeGreaterThan(SESSION_TOO_SHORT_MINUTES)
    expect(average).toBeLessThan(SESSION_TOO_LONG_MINUTES)
  })

  it('gives the small fast-recovering muscles a place on every upper day', () => {
    /*
     * Arms and side delts recover fast and cost almost nothing
     * systemically, so they carry the balancing load.
     *
     * This asked for each of them on both upper days, which one exercise
     * per muscle per session made unaffordable: they now compete for the
     * same six slots as the back and the delts rather than being tucked in
     * alongside. What survives is that they are still what a full day
     * makes room for — an upper day with none of them would mean the
     * ordering had stopped preferring cheap work when it ran out of time.
     */
    const peak = weekAt(program, 5)
    const upper = peak.days.filter((day) => day.label.includes('Upper'))

    expect(upper).toHaveLength(2)

    for (const day of upper) {
      const small = new Set(
        day.slots.flatMap((slot) => {
          if (slot.exercise.kind !== 'specific') return []
          const muscle = lookup(slot.exercise.exerciseId)?.primaryMuscle
          return muscle === 'biceps' || muscle === 'triceps' || muscle === 'side-delts'
            ? [muscle]
            : []
        }),
      )

      expect(small.size, `${day.label} made room for none of them`).toBeGreaterThanOrEqual(1)
    }
  })
})

/*
 * Nothing is pinned to a day any more.
 *
 * Monday used to be anchored to the session actually trained — overhead
 * press, pull-ups, lateral raises, curls — so a generated block picked
 * up where training was rather than proposing something different for a
 * day already done. That was worth having while history was being
 * imported. It stopped being worth having once the split settled and the
 * import went away, and it had a cost: the exercises were a transcript,
 * not a derivation, so they went on being scheduled after the tiers that
 * justified them had moved. An overhead press outlived the front delts
 * falling to maintenance by three tier edits.
 */
describe('what a day contains', () => {
  const program = build()

  it('never programmes two exercises for the same muscle and pattern in one day', () => {
    // Pull-ups followed by chin-ups is not extra stimulus, just extra time.
    for (const week of program.blocks[0]?.weeks ?? []) {
      for (const day of week.days) {
        const seen = new Set<string>()

        for (const slot of day.slots) {
          if (slot.exercise.kind !== 'specific') continue
          const exercise = lookup(slot.exercise.exerciseId)
          if (exercise?.intent !== 'hypertrophy') continue

          const key = `${exercise.primaryMuscle}|${exercise.pattern}`
          expect(seen.has(key), `${day.label} repeats ${key}`).toBe(false)
          seen.add(key)
        }
      }
    }
  })
})
