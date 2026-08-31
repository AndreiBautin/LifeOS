import { describe, expect, it } from 'vitest'

import { addRole, getResume, removeRole, type ResumeDeps } from './resume'
import type { Resume } from '@/domain/resume/resume'

/**
 * The resume.
 *
 * Fixtures are invented on purpose: this repository is public, and a real
 * employer in a test file is published the same as one in a seed.
 *
 * One decision is worth holding here and the rest is plumbing: two roles
 * at one employer is a *promotion*, and the record has to say so. A flat
 * list of jobs prints the company twice, which reads as job-hopping —
 * the opposite of what a promotion is evidence of.
 */

function deps(): ResumeDeps & { readonly stored: () => Resume | undefined } {
  let saved: Resume | undefined
  let sequence = 0

  return {
    stored: () => saved,
    resume: {
      get: () => Promise.resolve(saved),
      save: (resume) => {
        saved = resume
        return Promise.resolve()
      },
    },
    clock: { now: () => new Date('2026-08-31T12:00:00.000Z') },
    ids: {
      next: () => {
        sequence += 1
        return `id-${String(sequence)}`
      },
    },
  }
}

describe('adding a role', () => {
  it('starts an employer that is not there yet', async () => {
    const services = deps()

    const after = await addRole(
      {
        company: 'Northwind',
        location: 'Denver, CO',
        title: 'Senior Software Engineer',
        from: 'September 2024',
        bullets: 'Led delivery of a RAG platform\nMentored 5+ engineers',
      },
      services,
    )

    expect(after.companies).toHaveLength(1)
    expect(after.companies[0]?.name).toBe('Northwind')
    expect(after.companies[0]?.roles[0]?.bullets.map((one) => one.text)).toEqual([
      'Led delivery of a RAG platform',
      'Mentored 5+ engineers',
    ])
  })

  /*
   * The whole reason a company holds roles rather than a job holding a
   * title. Adding the earlier role at the same employer must not print
   * the name a second time.
   */
  it('files a second role under the same employer', async () => {
    const services = deps()
    await addRole(
      {
        company: 'Northwind',
        title: 'Senior Software Engineer',
        from: 'September 2024',
        bullets: 'a',
      },
      services,
    )

    const after = await addRole(
      {
        company: 'Northwind',
        title: 'Software Engineer',
        from: 'June 2019',
        to: 'September 2024',
        bullets: 'b',
      },
      services,
    )

    expect(after.companies).toHaveLength(1)
    // Current first — see 'the order roles print in' below.
    expect(after.companies[0]?.roles.map((one) => one.title)).toEqual([
      'Senior Software Engineer',
      'Software Engineer',
    ])
  })

  it('matches an employer regardless of case and stray spaces', async () => {
    const services = deps()
    await addRole({ company: 'Northwind', title: 'Senior', from: '2024', bullets: 'a' }, services)

    const after = await addRole(
      { company: '  northwind ', title: 'Junior', from: '2019', bullets: 'b' },
      services,
    )

    expect(after.companies).toHaveLength(1)
  })

  it('keeps a different employer separate', async () => {
    const services = deps()
    await addRole({ company: 'Northwind', title: 'Senior', from: '2024', bullets: 'a' }, services)

    const after = await addRole(
      { company: 'Somewhere Else', title: 'Engineer', from: '2018', bullets: 'b' },
      services,
    )

    expect(after.companies.map((one) => one.name)).toEqual(['Northwind', 'Somewhere Else'])
  })

  it('gives every bullet an id of its own, which is what tailoring picks', async () => {
    const services = deps()

    const after = await addRole(
      { company: 'X', title: 'Y', from: 'Z', bullets: 'one\ntwo\nthree' },
      services,
    )

    const ids = after.companies[0]?.roles[0]?.bullets.map((one) => one.id) ?? []
    expect(new Set(ids).size).toBe(3)
  })

  it('leaves out a blank line rather than storing an empty bullet', async () => {
    const services = deps()

    const after = await addRole(
      { company: 'X', title: 'Y', from: 'Z', bullets: 'one\n\n  \ntwo' },
      services,
    )

    expect(after.companies[0]?.roles[0]?.bullets).toHaveLength(2)
  })

  it('is current when no end date is given', async () => {
    const services = deps()

    const after = await addRole(
      { company: 'X', title: 'Y', from: 'Z', to: '  ', bullets: 'a' },
      services,
    )

    expect(after.companies[0]?.roles[0]?.to).toBeUndefined()
  })
})

describe('removing a role', () => {
  it('drops the employer with it when it was the last one', async () => {
    const services = deps()
    const added = await addRole({ company: 'X', title: 'Y', from: 'Z', bullets: 'a' }, services)
    const roleId = added.companies[0]?.roles[0]?.id ?? ''

    expect((await removeRole(roleId, services)).companies).toHaveLength(0)
  })

  it('keeps the employer while another role remains', async () => {
    const services = deps()
    await addRole({ company: 'X', title: 'Senior', from: '2024', bullets: 'a' }, services)
    const two = await addRole(
      { company: 'X', title: 'Junior', from: '2019', bullets: 'b' },
      services,
    )
    const junior = two.companies[0]?.roles.find((one) => one.title === 'Junior')?.id ?? ''

    const after = await removeRole(junior, services)

    expect(after.companies).toHaveLength(1)
    expect(after.companies[0]?.roles.map((one) => one.title)).toEqual(['Senior'])
  })
})

describe('reading it back', () => {
  /*
   * Empty rather than undefined, so every screen and every match reads
   * one shape. "No resume yet" is visible from the fields being blank.
   */
  it('is an empty resume before anything is written', async () => {
    expect((await getResume(deps())).companies).toEqual([])
  })
})

describe('the order roles print in', () => {
  /*
   * A resume leads with the job you are in. The order they were typed
   * has nothing to do with it — and adding the older one second put it
   * on top until this was looked at on the screen.
   */
  it('puts the current role first however it was entered', async () => {
    const services = deps()
    await addRole(
      {
        company: 'Northwind',
        title: 'Senior Software Engineer',
        from: 'September 2024',
        bullets: 'a',
      },
      services,
    )

    const after = await addRole(
      {
        company: 'Northwind',
        title: 'Software Engineer',
        from: 'June 2019',
        to: 'September 2024',
        bullets: 'b',
      },
      services,
    )

    expect(after.companies[0]?.roles.map((one) => one.title)).toEqual([
      'Senior Software Engineer',
      'Software Engineer',
    ])
  })

  it('still leads with the current one when it is added second', async () => {
    const services = deps()
    await addRole(
      {
        company: 'Northwind',
        title: 'Software Engineer',
        from: 'June 2019',
        to: '2024',
        bullets: 'a',
      },
      services,
    )

    const after = await addRole(
      { company: 'Northwind', title: 'Senior Software Engineer', from: '2024', bullets: 'b' },
      services,
    )

    expect(after.companies[0]?.roles[0]?.title).toBe('Senior Software Engineer')
  })
})
