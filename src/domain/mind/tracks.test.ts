import { describe, expect, it } from 'vitest'

import { matching, readTrack } from './tracks'

/*
 * Taken from the live `exercism/typescript` config on the day this was
 * written, trimmed to the fields that are read. The statuses and the
 * difficulty range are what that file actually contains: 111 practice
 * exercises, one concept exercise, difficulties 1–9, and `deprecated`
 * as the only status that appears.
 */
const CONFIG = {
  exercises: {
    concept: [{ slug: 'basics', name: 'Basics' }],
    practice: [
      {
        slug: 'hello-world',
        name: 'Hello World',
        uuid: 'x',
        difficulty: 1,
        topics: ['optional_values', 'strings', 'text_formatting'],
      },
      { slug: 'matrix', name: 'Matrix', difficulty: 5, topics: ['parsing', 'matrices'] },
      { slug: 'forth', name: 'Forth', difficulty: 9, topics: ['parsing', 'stacks'] },
      { slug: 'gone', name: 'Gone', difficulty: 3, topics: [], status: 'deprecated' },
      { slug: 'no-difficulty', name: 'No Difficulty', topics: [] },
    ],
  },
}

describe('reading a track', () => {
  it('keeps the fields a picker needs', () => {
    const [first] = readTrack(CONFIG)

    expect(first?.slug).toBe('hello-world')
    expect(first?.name).toBe('Hello World')
    expect(first?.topics).toContain('strings')
  })

  /*
   * A track's config also lists `concept` exercises, which are its
   * teaching material and are worked through in order rather than picked
   * from. Offering both would mix a syllabus into a problem list.
   */
  it('takes practice exercises and leaves the concept syllabus alone', () => {
    expect(readTrack(CONFIG).some((one) => one.slug === 'basics')).toBe(false)
  })

  /*
   * `deprecated` is a real status on the live config, not a guess.
   * Offering one is offering a problem the track has withdrawn.
   */
  it('drops a deprecated exercise', () => {
    expect(readTrack(CONFIG).some((one) => one.slug === 'gone')).toBe(false)
  })

  /*
   * Exercism bands 1–10; this app has three. Carrying both would mean
   * two answers to "how hard was it", so theirs is coarsened rather than
   * a judgement of ours being invented.
   */
  it('bands their 1–10 difficulty into the three this app uses', () => {
    const byName = new Map(readTrack(CONFIG).map((one) => [one.slug, one.difficulty]))

    expect(byName.get('hello-world')).toBe('easy')
    expect(byName.get('matrix')).toBe('medium')
    expect(byName.get('forth')).toBe('hard')
  })

  it('leaves difficulty absent when the config does not say', () => {
    const found = readTrack(CONFIG).find((one) => one.slug === 'no-difficulty')

    expect(found?.difficulty).toBeUndefined()
  })

  it('says nothing about a payload of the wrong shape', () => {
    expect(readTrack(undefined)).toEqual([])
    expect(readTrack({})).toEqual([])
    expect(readTrack({ exercises: { practice: 'not an array' } })).toEqual([])
  })
})

describe('finding something to work on', () => {
  const track = readTrack(CONFIG)

  it('matches on the name', () => {
    expect(matching(track, 'matrix').map((one) => one.slug)).toEqual(['matrix'])
  })

  it('matches on a topic, which is how somebody looks for a subject', () => {
    expect(matching(track, 'parsing').map((one) => one.slug)).toEqual(['matrix', 'forth'])
  })

  it('returns everything for an empty term', () => {
    expect(matching(track, '   ')).toHaveLength(track.length)
  })
})
