import { describe, expect, it } from 'vitest'

import { matchResume, phrases, tokenise } from './match'
import { asBulletId, asCompanyId, asRoleId } from '@/domain/ids/ids'
import { EMPTY_RESUME, type Resume } from '@/domain/resume/resume'

function resumeWith(bullets: readonly string[], skills: readonly string[] = []): Resume {
  return {
    ...EMPTY_RESUME,
    skills: skills.length === 0 ? [] : [{ label: 'Languages', skills: [...skills] }],
    companies: [
      {
        id: asCompanyId('c'),
        name: 'Northwind',
        roles: [
          {
            id: asRoleId('r'),
            title: 'Engineer',
            from: '2019',
            bullets: bullets.map((text, index) => ({ id: asBulletId(`b${String(index)}`), text })),
          },
        ],
      },
    ],
  }
}

describe('tokenising a posting', () => {
  /*
   * The whole difficulty, and the reason this is not three lines. The
   * obvious tokeniser strips non-letters, which on a software posting
   * destroys most of the vocabulary before the comparison starts.
   */
  it('keeps the punctuation that is part of a name', () => {
    expect(tokenise('C# and .NET with Node.js and C++')).toEqual(['c#', 'net', 'node.js', 'c++'])
  })

  it('trims dots off the ends without splitting the middle', () => {
    // 'Ships' rather than 'Uses', which is now a stopword — the point
    // here is the dots, not the verb.
    expect(tokenise('Ships Node.js.')).toEqual(['ships', 'node.js'])
  })

  it('drops words that carry no information in any field', () => {
    expect(tokenise('You will have experience with the team')).toEqual([])
  })

  it('is case-insensitive, because Azure and azure are one requirement', () => {
    expect(tokenise('Azure azure AZURE')).toEqual(['azure', 'azure', 'azure'])
  })

  it('drops single characters, which are never a skill', () => {
    expect(tokenise('a b Go')).toEqual(['go'])
  })
})

describe('matching a posting against a resume', () => {
  it('separates what the resume says from what it does not', () => {
    const match = matchResume('We need Kubernetes and Azure', resumeWith(['Built things on Azure']))

    expect(match.covered.map((one) => one.word)).toEqual(['azure'])
    expect(match.missing.map((one) => one.word)).toEqual(['kubernetes'])
  })

  /*
   * The ordering is the useful part. A posting that says Kubernetes five
   * times and GraphQL once is mostly about Kubernetes, and the top of
   * the missing list should say so rather than sorting alphabetically.
   */
  it('puts what the posting keeps repeating at the top', () => {
    const match = matchResume(
      'kubernetes graphql kubernetes kubernetes',
      resumeWith(['Nothing relevant']),
    )

    expect(match.missing.map((one) => one.word)).toEqual(['kubernetes', 'graphql'])
    expect(match.missing[0]?.count).toBe(3)
  })

  it('counts a skill as covered even when no bullet mentions it', () => {
    const match = matchResume('We need TypeScript', resumeWith(['Nothing'], ['TypeScript']))

    expect(match.covered.map((one) => one.word)).toEqual(['typescript'])
  })

  it('counts the summary too', () => {
    const match = matchResume('We need mentorship', {
      ...resumeWith(['Nothing']),
      summary: 'Senior engineer with a record of mentorship',
    })

    expect(match.missing).toEqual([])
  })

  /*
   * Absent, never zero. Nothing over nothing is not a score, and 0%
   * would read as a terrible match rather than as no comparison having
   * been made — the same rule the meters and the review both follow.
   */
  it('says nothing about an empty posting rather than scoring it zero', () => {
    expect(matchResume('', resumeWith(['Azure'])).share).toBeUndefined()
  })

  it('scores the share of the posting the resume covers', () => {
    const match = matchResume('azure kubernetes', resumeWith(['Azure']))

    expect(match.share).toBeCloseTo(0.5, 5)
  })

  it('counts a repeated term once towards the share', () => {
    const match = matchResume('azure azure azure kubernetes', resumeWith(['Azure']))

    expect(match.share).toBeCloseTo(0.5, 5)
    expect(match.covered[0]?.count).toBe(3)
  })

  /*
   * Stated as a limit rather than half-solved. Stemming would match
   * these and would also match things that are not the same word, and a
   * match that is wrong in a way nobody can predict is worse than one
   * that is plainly literal.
   */
  it('does not stem, so a plural reads as a different word', () => {
    const match = matchResume('microservices', resumeWith(['Built a microservice']))

    expect(match.missing.map((one) => one.word)).toEqual(['microservices'])
  })
})

describe('two-word phrases', () => {
  /*
   * The whole reason phrases exist. A word match reports Azure covered
   * and says nothing about the gap — on a posting built out of product
   * names that is most of what it was asked.
   */
  it('finds a phrase missing even when both its words are covered', () => {
    const match = matchResume(
      'You will use Azure Functions',
      resumeWith(['Built things on Azure', 'Wrote functions in TypeScript']),
    )

    expect(match.missing).toEqual([])
    expect(match.missingPhrases.map((one) => one.word)).toEqual(['azure functions'])
  })

  it('says nothing when the resume uses the phrase too', () => {
    const match = matchResume('Azure Functions', resumeWith(['Shipped Azure Functions']))

    expect(match.missingPhrases).toEqual([])
  })

  /*
   * Adjacency has to survive stopword removal, or a phrase is invented
   * out of a sentence that never said it. This is why `phrases` walks
   * the unfiltered words.
   */
  it('does not invent a phrase across a stopword', () => {
    expect(phrases('azure and functions')).toEqual([])
  })

  it('breaks a pair on a word not worth comparing', () => {
    expect(phrases('scalable azure functions')).toEqual(['scalable azure', 'azure functions'])
  })

  it('ranks by how often the posting repeats it', () => {
    const match = matchResume(
      'azure functions. service bus. azure functions.',
      resumeWith(['Nothing']),
    )

    expect(match.missingPhrases[0]).toEqual({ word: 'azure functions', count: 2 })
  })

  /*
   * Every phrase is made of words that are already counted, so folding
   * them in would weigh the same vocabulary twice and move the number
   * for a reason nobody could trace back to the posting.
   */
  it('leaves the share to single words', () => {
    const match = matchResume('azure functions', resumeWith(['Azure', 'functions']))

    expect(match.share).toBe(1)
    expect(match.missingPhrases).toHaveLength(1)
  })

  it('does not run one resume section into the next', () => {
    // "TypeScript" ends a bullet and "Mentored" starts the next; joining
    // them without a stop would create a phrase neither sentence said.
    const match = matchResume(
      'typescript mentored',
      resumeWith(['Wrote TypeScript', 'Mentored engineers']),
    )

    expect(match.missingPhrases.map((one) => one.word)).toEqual(['typescript mentored'])
  })
})

describe('the noise a real posting carries', () => {
  /*
   * All three of these came out of the first *real* posting the match
   * was run against — 5,400 characters of Ashby job ad. The hand-written
   * three-sentence fixtures above never produced any of them.
   */
  it('drops bare numbers, which are never a skill', () => {
    expect(tokenise('100% of premiums and 16 weeks and 401k')).toEqual([
      'premiums',
      'weeks',
      '401k',
    ])
  })

  it('drops the tail an apostrophe leaves behind', () => {
    // "we'll" splits on the apostrophe, and "ll" is neither a word nor a
    // skill — it appeared five times in one posting's gap list.
    expect(tokenise("we'll build what you've shipped")).toEqual(['build', 'shipped'])
  })

  /*
   * A posting says the company constantly — ten times in the first real
   * one — and the company is never a requirement of the job. Left in, it
   * sorts to the top of the gap list by frequency, which is the first
   * thing anybody reads.
   */
  it('ignores the employer’s own name when told it', () => {
    const match = matchResume('Ramp is hiring. Ramp uses Kubernetes.', resumeWith(['Nothing']), [
      'Ramp',
    ])

    expect(match.missing.map((one) => one.word)).toEqual(['hiring', 'kubernetes'])
  })

  it('drops a phrase built out of the employer’s name too', () => {
    const match = matchResume('Ramp engineering is hiring', resumeWith(['Nothing']), ['Ramp'])

    expect(match.missingPhrases.map((one) => one.word)).not.toContain('ramp engineering')
  })
})
