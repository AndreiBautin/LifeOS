import { describe, expect, it } from 'vitest'

import { inSections, sectionTitle } from './program'

/**
 * Sectioning is presentation, and the whole risk is that it stops being
 * presentation.
 *
 * The session order is decided in one place — `inSessionOrder`, then
 * `reverseAccessoryBlocks`, then `trailingLast` — and each of those was
 * argued for. A grouping pass that collected slots by role would be a
 * fourth opinion arriving by accident, so the property worth holding is
 * not "warm-ups come first" but **"the rows come out in the order they
 * went in"**, whatever that order was.
 */

const row = (role: string) => ({ role })

describe('cutting a session into sections', () => {
  it('names the parts of a session a lifter performs it in', () => {
    const sections = inSections([
      row('warmup'),
      row('warmup'),
      row('strength'),
      row('strength'),
      row('hypertrophy'),
      row('assistance'),
      row('conditioning'),
    ])

    expect(sections.map((section) => section.title)).toEqual([
      'Warm-up',
      'Strength',
      'Compounds',
      'Isolation',
      'Conditioning',
    ])
    expect(sections.map((section) => section.slots.length)).toEqual([2, 2, 1, 1, 1])
  })

  /*
   * The load-bearing one. `trailingLast` moves the grip and trunk work
   * past slots of another role, so a by-role grouping would pull a
   * compound wrist exercise back above the isolation it was deliberately
   * placed after — a reordering nothing on screen would explain.
   */
  it('never reorders the slots it was given', () => {
    const slots = [
      row('warmup'),
      row('assistance'),
      row('hypertrophy'),
      row('warmup'),
      row('conditioning'),
    ]

    expect(inSections(slots).flatMap((section) => section.slots)).toEqual(slots)
  })

  /*
   * Which means a heading can repeat, and that is the honest outcome
   * rather than a defect: two blocks of one kind of work with something
   * else between them is a thing the reader should be able to see.
   */
  it('repeats a heading rather than merging across a gap', () => {
    expect(
      inSections([row('hypertrophy'), row('assistance'), row('hypertrophy')]).map(
        (section) => section.title,
      ),
    ).toEqual(['Compounds', 'Isolation', 'Compounds'])
  })

  it('reads the strength pair as one heading', () => {
    // A top set and its back-offs are two rows and one trip to the rack.
    expect(inSections([row('main'), row('strength')])).toHaveLength(1)
  })

  it('has nothing to say about an empty session', () => {
    expect(inSections([])).toEqual([])
  })

  /*
   * A stored log can carry a role this build has never heard of. A blank
   * heading would read as a bug; "Work" reads as unlabelled, which is
   * what it is.
   */
  it('gives an unknown role a heading rather than a blank', () => {
    expect(sectionTitle('mobility')).toBe('Work')
  })
})
