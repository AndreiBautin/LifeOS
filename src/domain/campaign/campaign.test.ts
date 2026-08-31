import { describe, expect, it } from 'vitest'

import { asCampaignId, asStageId } from '@/domain/ids/ids'

import {
  addStage,
  isMoney,
  laps,
  markReached,
  moveStage,
  removeStage,
  renameCampaign,
  renameStage,
  requirementOf,
  reshapeStage,
  REQUIREMENT_KINDS,
  REQUIREMENT_LABELS,
  retargetStage,
  targetOf,
  standingFor,
  undoReached,
  type Campaign,
  type Requirement,
  type Stage,
} from './campaign'

function stage(name: string, requirement: Requirement, reached: readonly string[] = []): Stage {
  return {
    id: asStageId(name),
    name,
    requirement,
    reached: reached.map((at) => ({ at })),
  }
}

function campaign(...stages: readonly Stage[]): Campaign {
  return {
    id: asCampaignId('move'),
    name: 'Move',
    stages,
    createdAt: '2026-08-01T09:00:00',
  }
}

describe('a declared stage', () => {
  /*
   * Nothing in a habit tracker knows that you found a house you liked.
   * A stage says which kind it is rather than pretending everything is
   * measurable, and a declared stage is not a lesser one.
   */
  it('is met by having been declared, and nothing else', () => {
    const before = standingFor(campaign(stage('Find a house', { kind: 'declared' })), {})
    const after = standingFor(
      campaign(stage('Find a house', { kind: 'declared' }, ['2026-09-01'])),
      {},
    )

    expect(before.stages[0]?.met).toBe(false)
    expect(after.stages[0]?.met).toBe(true)
  })

  it('is never unproven — there is no reading to be missing', () => {
    expect(standingFor(campaign(stage('Move', { kind: 'declared' })), {}).stages[0]?.unproven).toBe(
      false,
    )
  })
})

describe('a measured stage', () => {
  it('reads the count the area already keeps', () => {
    const standing = standingFor(
      campaign(stage('Fix the house', { kind: 'house-jobs', count: 5 })),
      {
        houseJobsDone: 3,
      },
    )

    expect(standing.stages[0]?.met).toBe(false)
    expect(standing.stages[0]?.progress).toEqual({ value: 3, of: 5 })
  })

  it('is met once the reading reaches the target', () => {
    const standing = standingFor(
      campaign(stage('Fix the house', { kind: 'house-jobs', count: 5 })),
      {
        houseJobsDone: 5,
      },
    )

    expect(standing.stages[0]?.met).toBe(true)
  })

  /*
   * A count is genuinely zero when nothing has happened — you can count
   * no finished house jobs. Money is different: it is typed in monthly,
   * and its absence means nobody has said, not that it is nothing.
   */
  it('treats a count with nothing recorded as zero, not unknown', () => {
    const standing = standingFor(campaign(stage('Offers', { kind: 'offers', count: 1 })), {})

    expect(standing.stages[0]?.unproven).toBe(false)
    expect(standing.stages[0]?.progress).toEqual({ value: 0, of: 1 })
  })

  /*
   * Absent, never zero. A net-worth stage on a database with no finance
   * readings has not been *failed* — a bar at nought against a target
   * somebody set reads as failing when nothing has been measured.
   */
  it('is unproven when the money has never been recorded', () => {
    const standing = standingFor(
      campaign(stage('Deposit', { kind: 'net-worth', minorUnits: 4_000_000 })),
      {},
    )

    expect(standing.stages[0]?.unproven).toBe(true)
    expect(standing.stages[0]?.met).toBe(false)
    expect(standing.stages[0]?.progress).toBeUndefined()
  })

  it('judges money once there is a reading', () => {
    const standing = standingFor(
      campaign(stage('Deposit', { kind: 'net-worth', minorUnits: 4_000_000 })),
      { netWorthMinor: 4_500_000 },
    )

    expect(standing.stages[0]?.met).toBe(true)
    expect(standing.stages[0]?.unproven).toBe(false)
  })

  it('reads a credit score against its target', () => {
    const standing = standingFor(campaign(stage('Credit', { kind: 'credit-score', score: 740 })), {
      creditScore: 700,
    })

    expect(standing.stages[0]?.progress).toEqual({ value: 700, of: 740 })
  })

  /*
   * A measured stage is a threshold, and declaring it done would let
   * somebody tick past a reading that says otherwise — which is the
   * whole reason it is measured rather than declared.
   */
  it('is not met by declaring it', () => {
    const standing = standingFor(
      campaign(stage('Deposit', { kind: 'net-worth', minorUnits: 4_000_000 }, ['2026-09-01'])),
      { netWorthMinor: 100 },
    )

    expect(standing.stages[0]?.met).toBe(false)
  })
})

describe('the arc as a whole', () => {
  const arc = () =>
    campaign(
      stage('Fix the house', { kind: 'house-jobs', count: 3 }),
      stage('Improve income', { kind: 'offers', count: 1 }),
      stage('Find a house', { kind: 'declared' }),
      stage('Save the deposit', { kind: 'net-worth', minorUnits: 4_000_000 }),
    )

  it('counts what is done against stages you named, not a scale of ours', () => {
    const standing = standingFor(arc(), { houseJobsDone: 3, offers: 1 })

    expect(standing.done).toBe(2)
    expect(standing.total).toBe(4)
  })

  it('names the earliest outstanding stage as what it is waiting on', () => {
    const standing = standingFor(arc(), { houseJobsDone: 3 })

    expect(standing.next?.stage.name).toBe('Improve income')
  })

  /*
   * Ordered but not gated. The chain really is a chain — you cannot put
   * a deposit down before you have one — but a screen that refused to
   * record a later stage would be policing somebody's life rather than
   * reporting on it, and things do not always happen in the order they
   * were written down.
   */
  it('lets a later stage be met before an earlier one', () => {
    const standing = standingFor(
      campaign(
        stage('Fix the house', { kind: 'house-jobs', count: 3 }),
        stage('Find a house', { kind: 'declared' }, ['2026-09-01']),
      ),
      { houseJobsDone: 0 },
    )

    expect(standing.stages[1]?.met).toBe(true)
    expect(standing.next?.stage.name).toBe('Fix the house')
  })

  it('has nothing outstanding once every stage is met', () => {
    const standing = standingFor(campaign(stage('Move', { kind: 'declared' }, ['2026-12-01'])), {})

    expect(standing.next).toBeUndefined()
    expect(standing.done).toBe(standing.total)
  })

  it('says nothing about a campaign with no stages', () => {
    const standing = standingFor(campaign(), {})

    expect(standing.total).toBe(0)
    expect(standing.next).toBeUndefined()
  })
})

describe('running a stage again', () => {
  /*
   * The observation this exists for: "job improvement is interesting
   * because I can progress through multiple jobs, and that applies to
   * houses too." A tick that stopped meaning anything after the first
   * time would lose the shape of the arc.
   */
  it('keeps every lap, with what each one was', () => {
    let one = stage('Improve income', { kind: 'declared' })
    one = markReached(one, '2026-03-14', 'Acme')
    one = markReached(one, '2026-09-02', 'Beta')

    expect(one.reached).toEqual([
      { at: '2026-03-14', note: 'Acme' },
      { at: '2026-09-02', note: 'Beta' },
    ])
  })

  it('leaves the note absent rather than empty when none was given', () => {
    const one = markReached(stage('Move', { kind: 'declared' }), '2026-12-01', '   ')

    expect(one.reached[0]).toEqual({ at: '2026-12-01' })
  })

  /*
   * A mis-tap on a stage reached three times should cost the third, not
   * the record of the first two — which is what clearing the list would
   * do, and it is only noticed afterwards.
   */
  it('undoes the most recent lap and only that one', () => {
    let one = stage('Improve income', { kind: 'declared' })
    one = markReached(one, '2026-03-14', 'Acme')
    one = markReached(one, '2026-09-02', 'Beta')

    expect(undoReached(one).reached).toEqual([{ at: '2026-03-14', note: 'Acme' }])
  })

  it('undoing a stage never reached changes nothing', () => {
    expect(undoReached(stage('Move', { kind: 'declared' })).reached).toEqual([])
  })
})

describe('editing a stage', () => {
  const arc = () =>
    campaign(
      stage('Fix the house', { kind: 'house-jobs', count: 5 }),
      stage('Find a house', { kind: 'declared' }, ['2026-09-01']),
      stage('Move', { kind: 'declared' }),
    )

  it('renames without touching anything else', () => {
    const next = renameStage(arc(), asStageId('Find a house'), '  Find somewhere  ')
    const edited = next.stages[1]

    expect(edited?.name).toBe('Find somewhere')
    // A label: every lap recorded against it is still a lap that happened.
    expect(edited?.reached).toEqual([{ at: '2026-09-01' }])
  })

  it('refuses a blank name rather than storing one', () => {
    const next = renameStage(arc(), asStageId('Move'), '   ')

    expect(next.stages[2]?.name).toBe('Move')
  })

  it('changes a target, which changes whether it is met and nothing else', () => {
    const before = standingFor(arc(), { houseJobsDone: 3 })
    const after = standingFor(
      retargetStage(arc(), asStageId('Fix the house'), { kind: 'house-jobs', count: 3 }),
      { houseJobsDone: 3 },
    )

    expect(before.stages[0]?.met).toBe(false)
    expect(after.stages[0]?.met).toBe(true)
  })

  /*
   * The tempting move is to clear them, and it would be a destructive
   * edit wearing a settings-change's clothes. "2026-09-01" is a true
   * record of a day something happened, and it survives the way a
   * retired habit's kept days do — inert, but not erased.
   */
  it('keeps the laps when a declared stage becomes a measured one', () => {
    const next = retargetStage(arc(), asStageId('Find a house'), {
      kind: 'net-worth',
      minorUnits: 100,
    })

    expect(next.stages[1]?.reached).toEqual([{ at: '2026-09-01' }])
    // Inert, though: the reading decides now.
    expect(standingFor(next, {}).stages[1]?.met).toBe(false)
  })

  it('adds a stage at the end', () => {
    const next = addStage(arc(), stage('Retire', { kind: 'declared' }))

    expect(next.stages).toHaveLength(4)
    expect(next.stages[3]?.name).toBe('Retire')
  })

  it('removes a stage', () => {
    const next = removeStage(arc(), asStageId('Move'))

    expect(next.stages.map((one) => one.name)).toEqual(['Fix the house', 'Find a house'])
  })

  /*
   * A stage reached three times carries three dated records nothing else
   * holds, so a screen has to be able to say how many are about to go.
   */
  it('can say how many records a removal would discard', () => {
    expect(laps(arc(), asStageId('Find a house'))).toBe(1)
    expect(laps(arc(), asStageId('Move'))).toBe(0)
    expect(laps(arc(), asStageId('no such stage') as never)).toBe(0)
  })

  it('moves a stage one place', () => {
    const next = moveStage(arc(), asStageId('Move'), -1)

    expect(next.stages.map((one) => one.name)).toEqual(['Fix the house', 'Move', 'Find a house'])
  })

  /*
   * A stage jumping from the end to the top is never what a press of
   * "up" meant, so an out-of-range move changes nothing rather than
   * wrapping round.
   */
  it('does not wrap round at either end', () => {
    expect(moveStage(arc(), asStageId('Fix the house'), -1).stages[0]?.name).toBe('Fix the house')
    expect(moveStage(arc(), asStageId('Move'), 1).stages[2]?.name).toBe('Move')
  })

  it('leaves a stage that does not exist alone', () => {
    const missing = asStageId('nothing')

    expect(renameStage(arc(), missing, 'x').stages).toHaveLength(3)
    expect(moveStage(arc(), missing, 1).stages).toHaveLength(3)
    expect(removeStage(arc(), missing).stages).toHaveLength(3)
  })
})

describe('building a requirement from a form', () => {
  it('round-trips a target through the kind that holds it', () => {
    for (const kind of REQUIREMENT_KINDS) {
      const built = requirementOf(kind, 500)

      expect(built.kind).toBe(kind)
      expect(targetOf(built)).toBe(kind === 'declared' ? undefined : 500)
    }
  })

  /*
   * A count of zero is a stage met the instant it is created, which is
   * never what somebody typing a number meant.
   */
  it('never lets a count reach zero', () => {
    expect(targetOf(requirementOf('house-jobs', 0))).toBe(1)
    expect(targetOf(requirementOf('offers', -4))).toBe(1)
  })

  it('allows a money target of zero, which is a real threshold', () => {
    expect(targetOf(requirementOf('net-worth', 0))).toBe(0)
  })

  it('knows which kinds are money, so a screen can convert', () => {
    expect(isMoney('net-worth')).toBe(true)
    expect(isMoney('retirement')).toBe(true)
    expect(isMoney('credit-score')).toBe(false)
    expect(isMoney('house-jobs')).toBe(false)
  })

  it('has a label for every kind', () => {
    for (const kind of REQUIREMENT_KINDS) {
      expect(REQUIREMENT_LABELS[kind].trim()).not.toBe('')
    }
  })
})

describe('renaming the arc', () => {
  it('changes the name and the aim', () => {
    const next = renameCampaign(campaign(), ' Moving house ', ' Somewhere with a garden ')

    expect(next.name).toBe('Moving house')
    expect(next.aim).toBe('Somewhere with a garden')
  })

  it('drops the aim rather than storing an empty one', () => {
    const withAim = { ...campaign(), aim: 'Something' }
    const next = renameCampaign(withAim, 'Move', '   ')

    // Removed, not set to undefined: a key holding undefined is a key,
    // and it would travel over sync as one.
    expect('aim' in next).toBe(false)
  })

  it('refuses a blank name', () => {
    expect(renameCampaign(campaign(), '  ', '').name).toBe('Move')
  })
})

/*
 * The bug this function exists for. The editor first fired a rename and
 * a retarget as separate mutations, and both are a read-modify-write of
 * the same campaign record — so the second read the copy from before the
 * first had saved and wrote the old name back. Driving it caught the
 * target moving to 30,000 while the new name silently did not stick.
 */
describe('renaming and retargeting together', () => {
  it('applies both, which two separate edits raced over', () => {
    const next = reshapeStage(
      campaign(stage('Save the deposit', { kind: 'net-worth', minorUnits: 4_000_000 })),
      asStageId('Save the deposit'),
      'Save the down payment',
      { kind: 'net-worth', minorUnits: 3_000_000 },
    )

    expect(next.stages[0]?.name).toBe('Save the down payment')
    expect(targetOf(next.stages[0]?.requirement ?? { kind: 'declared' })).toBe(3_000_000)
  })

  it('keeps the laps, like every other non-destructive edit', () => {
    const next = reshapeStage(
      campaign(stage('Find a house', { kind: 'declared' }, ['2026-09-01'])),
      asStageId('Find a house'),
      'Find somewhere',
      { kind: 'declared' },
    )

    expect(next.stages[0]?.reached).toEqual([{ at: '2026-09-01' }])
  })

  it('refuses a blank name rather than half-applying', () => {
    const before = campaign(stage('Move', { kind: 'declared' }))
    const next = reshapeStage(before, asStageId('Move'), '  ', { kind: 'house-jobs', count: 2 })

    expect(next).toBe(before)
  })
})
