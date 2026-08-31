import { describe, expect, it } from 'vitest'

import { DEFAULT_WANTS } from '@/domain/homes/candidate'
import { EMPTY_JOB_SEARCH } from '@/domain/jobs/search'
import { DEFAULT_DIGEST } from '@/domain/news/digest'

import { CONFIG_MAGIC, readConfig, writeConfig } from './document'

const settings = { jobSearch: EMPTY_JOB_SEARCH, digest: DEFAULT_DIGEST, homeWants: DEFAULT_WANTS }

describe('reading a configuration document', () => {
  it('refuses anything without the marker', () => {
    expect(readConfig({ jobSearch: {} }).kind).toBe('unreadable')
    expect(readConfig('nonsense').kind).toBe('unreadable')
    expect(readConfig(null).kind).toBe('unreadable')
    expect(readConfig([]).kind).toBe('unreadable')
  })

  it('refuses a document that carries no settings at all', () => {
    expect(readConfig({ magic: CONFIG_MAGIC }).kind).toBe('unreadable')
  })

  /*
   * The load-bearing one. A document holding a job search and nothing
   * else must not clear the digest — absent means "I did not say", the
   * rule recordFinance already follows, and only the other reading
   * destroys anything.
   */
  it('carries only the sections the document holds', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: { sources: ['greenhouse:stripe'], minimumScore: 55 },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')

    expect(Object.keys(read.change)).toEqual(['jobSearch'])
    expect(read.change.digest).toBeUndefined()
    expect(read.change.homeWants).toBeUndefined()
  })

  it('runs each section through its own parser', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: {
        sources: ['greenhouse:stripe', 'nonsense'],
        minimumScore: 55,
        profile: { titleIncludes: ['engineer'] },
      },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')

    // The unrecognised board is dropped rather than handed on to the
    // gateway.
    expect(read.change.jobSearch?.sources).toHaveLength(1)
    expect(read.change.jobSearch?.minimumScore).toBe(55)
  })

  /*
   * The parsers are total, so junk degrades to a default — and for a job
   * search the default is *empty*. Applying that would be a wipe wearing
   * a settings change's clothes, so a section that is present and not an
   * object is refused rather than parsed.
   */
  it('refuses a section that is present and is not an object', () => {
    const read = readConfig({ magic: CONFIG_MAGIC, jobSearch: 'boards' })

    expect(read.kind).toBe('unreadable')
    if (read.kind !== 'unreadable') return
    expect(read.reason).toContain('clear what is there')
  })

  it('says what each section would become, so it can be read before it is taken', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: { sources: ['lever:acme'], minimumScore: 40 },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')
    expect(read.sections[0]?.summary).toContain('1 board')
  })
})

describe('writing one', () => {
  it('round-trips through the reader', () => {
    const read = readConfig(JSON.parse(JSON.stringify(writeConfig(settings))))

    if (read.kind !== 'read') throw new Error('expected a readable document')

    expect(read.change.jobSearch).toEqual(settings.jobSearch)
    expect(read.change.digest).toEqual(settings.digest)
    expect(read.change.homeWants).toEqual(settings.homeWants)
  })
})

/*
 * The boards are what this document exists to carry, and nobody
 * hand-writes `{ provider, token }`. The screen's own paste box takes
 * `greenhouse:stripe`, so this does too.
 */
describe('writing boards the way a person writes them', () => {
  it('takes a list of strings', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: { sources: ['greenhouse:stripe', 'lever:acme'] },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')
    expect(read.change.jobSearch?.sources).toEqual([
      { provider: 'greenhouse', token: 'stripe' },
      { provider: 'lever', token: 'acme' },
    ])
  })

  it('takes one string holding several lines', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: { sources: 'greenhouse:stripe\nashby:ramp' },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')
    expect(read.change.jobSearch?.sources).toHaveLength(2)
  })

  it('drops a bad line rather than the good ones above it', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: { sources: ['greenhouse:stripe', 'nonsense'] },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')
    expect(read.change.jobSearch?.sources).toHaveLength(1)
  })

  it('still reads the stored object form, so a copied document round-trips', () => {
    const read = readConfig({
      magic: CONFIG_MAGIC,
      jobSearch: { sources: [{ provider: 'greenhouse', token: 'stripe' }] },
    })

    if (read.kind !== 'read') throw new Error('expected a readable document')
    expect(read.change.jobSearch?.sources).toHaveLength(1)
  })
})
