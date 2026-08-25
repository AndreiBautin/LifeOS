/**
 * What an RPE actually feels like, in words, at the moment it is asked
 * for.
 *
 * RTS makes the lifter the instrument: every load in the app is derived
 * from an RPE somebody typed, so a lifter who systematically reads 9 as 8
 * is not slightly off — they are running a different program from the one
 * on the screen, and nothing downstream can tell. The chart, the fatigue
 * stopping rule and the next session's suggestion all inherit the error.
 *
 * Calibration is a skill and it is learned by being told, set by set,
 * what the number is supposed to mean. So the guidance lives here rather
 * than in a help page nobody opens between sets: a target has a
 * description and an entered value has one, and they sit next to the
 * field where the judgement is made.
 *
 * Deliberately written as reps-in-reserve plus one observable cue. "How
 * hard it felt" is unusable — everything heavy feels hard. "Could you
 * have done two more" is a question a lifter can answer honestly, and bar
 * speed is a thing they can see.
 */

export interface RpeGuide {
  /** The RPE this describes. */
  readonly rpe: number
  /** Reps in reserve, as text — a range where the RPE is a half step. */
  readonly rir: string
  /** Three or four words: the judgement, not the sensation. */
  readonly feel: string
  /** One observable thing that distinguishes it from its neighbours. */
  readonly cue: string
}

/**
 * The scale, coarse-grained on purpose.
 *
 * Below 6 there is nothing worth distinguishing — a set with five or more
 * reps left is a warm-up whatever the number says, and pretending to
 * resolve RPE 3 from RPE 4 invites precision that does not exist.
 */
export const RPE_SCALE: readonly RpeGuide[] = [
  {
    rpe: 10,
    rir: '0',
    feel: 'Nothing left',
    cue: 'The last rep was maximal. Another one would have failed.',
  },
  {
    rpe: 9.5,
    rir: '0–1',
    feel: 'No more reps, maybe more weight',
    cue: 'Could not have repped again, but the bar was not quite stopping.',
  },
  {
    rpe: 9,
    rir: '1',
    feel: 'One left',
    cue: 'The last rep slowed noticeably. One more was there; two were not.',
  },
  {
    rpe: 8.5,
    rir: '1–2',
    feel: 'One certain, two doubtful',
    cue: 'Definitely one more. You would not have bet on the second.',
  },
  {
    rpe: 8,
    rir: '2',
    feel: 'Two left',
    cue: 'The last rep slowed but was never in doubt. Two more were there.',
  },
  {
    rpe: 7.5,
    rir: '2–3',
    feel: 'Two certain, three maybe',
    cue: 'Still moving well. The set ended before it got interesting.',
  },
  {
    rpe: 7,
    rir: '3',
    feel: 'Three left',
    cue: 'Every rep fast and deliberate. Hard work that never felt close.',
  },
  {
    rpe: 6,
    rir: '4',
    feel: 'Four left',
    cue: 'Speed work or a heavy warm-up. Not a set that grows anything.',
  },
  {
    rpe: 5,
    rir: '5+',
    feel: 'Warm-up',
    cue: 'Preparing the movement, not training it.',
  },
]

/**
 * The guidance for an RPE, snapping to the nearest half step at or below
 * it.
 *
 * Downward rather than to the nearest, because rounding 8.7 up to 9 would
 * tell a lifter they had one rep left when they said they had closer to
 * two. Where the two readings disagree the conservative one is the one
 * that does not quietly add volume.
 */
export function describeRpe(rpe: number): RpeGuide | undefined {
  if (!Number.isFinite(rpe)) return undefined

  const clamped = Math.min(10, rpe)
  return RPE_SCALE.find((entry) => entry.rpe <= clamped)
}

/**
 * The one-line coaching note for a target RPE, phrased as an instruction.
 *
 * Present tense and imperative, because it is read before the set rather
 * than after it: "stop with about two left", not "two were left".
 */
export function coachRpe(rpe: number): string | undefined {
  const guide = describeRpe(rpe)
  if (guide === undefined) return undefined

  if (guide.rpe >= 10) return 'Take it to failure — the next rep should not be there.'
  return `Stop with about ${guide.rir} rep${guide.rir === '1' ? '' : 's'} left. ${guide.cue}`
}
