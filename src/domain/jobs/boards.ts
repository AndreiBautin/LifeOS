import type { Posting } from '@/domain/jobs/score'

/**
 * Reading the three public ATS boards, ported from Career Command Center.
 *
 * Greenhouse, Lever and Ashby publish every open posting as JSON with no
 * key and no account, and — verified from a browser rather than assumed
 * — they send the headers that let a page read them directly. That is
 * the whole reason this can live in a client-only app: the boards that
 * *do* need a server are the ones nobody can scrape anyway.
 *
 * **Pure.** Parsing is here and fetching is not, so every quirk below is
 * testable against a fixture rather than against the internet on the day
 * the suite runs.
 */

export const ATS_PROVIDERS = ['greenhouse', 'lever', 'ashby'] as const
export type AtsProvider = (typeof ATS_PROVIDERS)[number]

export const PROVIDER_LABELS: Record<AtsProvider, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
}

/** A posting as a board gave it, before any profile has judged it. */
export interface FetchedPosting extends Posting {
  readonly externalId: string
  readonly provider: AtsProvider
  readonly boardToken: string
  readonly url: string
  readonly applyUrl?: string
  readonly department?: string
  readonly salaryRaw?: string
}

export function boardUrl(provider: AtsProvider, token: string): string {
  const slug = encodeURIComponent(token)

  if (provider === 'greenhouse') {
    return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
  }
  if (provider === 'lever') return `https://api.lever.co/v0/postings/${slug}?mode=json`

  return `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`
}

/** Raised for a board token that does not exist, which is a typo rather than a fault. */
export class UnknownBoard extends Error {
  // Written out rather than declared as constructor parameters, which
  // `erasableSyntaxOnly` forbids: a parameter property emits code, and
  // this project's TypeScript must erase to nothing.
  readonly provider: AtsProvider
  readonly token: string

  constructor(provider: AtsProvider, token: string) {
    super(`No ${PROVIDER_LABELS[provider]} board called "${token}"`)
    this.name = 'UnknownBoard'
    this.provider = provider
    this.token = token
  }
}

export function readBoard(
  provider: AtsProvider,
  body: unknown,
  token: string,
): readonly FetchedPosting[] {
  if (provider === 'greenhouse') return readGreenhouse(body, token)
  if (provider === 'lever') return readLever(body, token)
  return readAshby(body, token)
}

/* -------------------------------------------------------------------- */
/* Greenhouse                                                            */
/* -------------------------------------------------------------------- */

function readGreenhouse(body: unknown, token: string): readonly FetchedPosting[] {
  const jobs = arrayAt(body, 'jobs')

  return jobs.map((job) => {
    const id = idOf(job)
    const title = stringAt(job, 'title') ?? ''
    const location = stringAt(objectAt(job, 'location'), 'name')

    /*
     * `content` arrives HTML-entity-encoded, so one decode yields the
     * markup itself and the second — inside `htmlToText` — yields the
     * words. Decoding once and stopping leaves `&lt;p&gt;` in the text
     * a keyword search then has to match through.
     */
    const html = decodeEntities(stringAt(job, 'content') ?? '')

    return {
      externalId: id,
      provider: 'greenhouse' as const,
      boardToken: token,
      title,
      description: htmlToText(html),
      ...(location === undefined ? {} : { location }),
      isRemote: looksRemote(location) || looksRemote(title),
      /*
       * `absolute_url` can point at an embedded board on the company's
       * own site, which is not a form anything can fill. The hosted one
       * is always at this canonical address.
       */
      url: stringAt(job, 'absolute_url') ?? '',
      applyUrl: `https://job-boards.greenhouse.io/${token}/jobs/${id}`,
      ...optional('department', firstNamed(job, 'departments')),
      ...optional('postedAt', isoAt(job, 'first_published') ?? isoAt(job, 'updated_at')),
    }
  })
}

/* -------------------------------------------------------------------- */
/* Lever                                                                 */
/* -------------------------------------------------------------------- */

function readLever(body: unknown, token: string): readonly FetchedPosting[] {
  /*
   * An unknown token answers **200** with `{"ok":false,...}` rather than
   * a 404, so the shape of the body is the only way to tell a real empty
   * board from a name that does not exist.
   */
  if (!Array.isArray(body)) throw new UnknownBoard('lever', token)

  return body.map((job: unknown) => {
    const categories = objectAt(job, 'categories')
    const location = stringAt(categories, 'location')
    const workplaceType = stringAt(job, 'workplaceType')
    const hosted = stringAt(job, 'hostedUrl') ?? ''

    const description = [stringAt(job, 'descriptionPlain'), stringAt(job, 'additionalPlain')]
      .filter((part) => part !== undefined && part.trim() !== '')
      .join('\n\n')

    return {
      externalId: stringAt(job, 'id') ?? '',
      provider: 'lever' as const,
      boardToken: token,
      title: stringAt(job, 'text') ?? '',
      description,
      ...(location === undefined ? {} : { location }),
      isRemote: workplaceType?.toLowerCase() === 'remote' || looksRemote(location),
      url: hosted,
      ...optional(
        'applyUrl',
        stringAt(job, 'applyUrl') ?? (hosted === '' ? undefined : `${hosted}/apply`),
      ),
      ...optional('department', stringAt(categories, 'department')),
      ...optional('postedAt', epochAt(job, 'createdAt')),
    }
  })
}

/* -------------------------------------------------------------------- */
/* Ashby                                                                 */
/* -------------------------------------------------------------------- */

function readAshby(body: unknown, token: string): readonly FetchedPosting[] {
  return arrayAt(body, 'jobs')
    .filter((job) => valueAt(job, 'isListed') !== false)
    .map((job) => {
      const location = stringAt(job, 'location')
      const workplaceType = stringAt(job, 'workplaceType')
      const html = stringAt(job, 'descriptionHtml')
      const pay = readCompensation(job)

      return {
        externalId: stringAt(job, 'id') ?? '',
        provider: 'ashby' as const,
        boardToken: token,
        title: (stringAt(job, 'title') ?? '').trim(),
        description: stringAt(job, 'descriptionPlain') ?? htmlToText(html ?? ''),
        ...(location === undefined ? {} : { location }),
        isRemote: actuallyRemote(workplaceType, location),
        url: stringAt(job, 'jobUrl') ?? '',
        ...optional('applyUrl', stringAt(job, 'applyUrl') ?? stringAt(job, 'jobUrl')),
        ...optional('department', stringAt(job, 'department')),
        ...optional('postedAt', isoAt(job, 'publishedAt')),
        ...pay,
      }
    })
}

/**
 * Ashby's own `isRemote` flag cannot be trusted.
 *
 * Boards routinely set it on roles whose `workplaceType` is Hybrid or
 * OnSite, which floods a remote search with office jobs — so
 * `workplaceType` is authoritative whenever it is present, and only a
 * blank one falls back to reading the location text.
 */
function actuallyRemote(workplaceType: string | undefined, location: string | undefined): boolean {
  if (workplaceType?.toLowerCase() === 'remote') return true
  if (workplaceType !== undefined && workplaceType.trim() !== '') return false

  return looksRemote(location)
}

/**
 * The annual salary out of Ashby's tiered compensation block.
 *
 * Tiers hold components of several kinds — equity, bonus, commission —
 * and only the one typed `Salary` is a wage. Taking the first component
 * of the first tier reports somebody's option grant as their pay.
 */
function readCompensation(job: unknown): {
  salaryMinMinor?: number
  salaryMaxMinor?: number
  salaryRaw?: string
} {
  const comp = objectAt(job, 'compensation')
  if (comp === undefined) return {}

  const raw =
    stringAt(comp, 'scrapeableCompensationSalarySummary') ??
    stringAt(comp, 'compensationTierSummary')

  for (const tier of arrayAt(comp, 'compensationTiers')) {
    for (const component of arrayAt(tier, 'components')) {
      if (stringAt(component, 'compensationType')?.toLowerCase() !== 'salary') continue

      const min = numberAt(component, 'minValue')
      const max = numberAt(component, 'maxValue')
      if (min === undefined && max === undefined) continue

      return {
        ...optional('salaryMinMinor', min === undefined ? undefined : Math.round(min * 100)),
        ...optional('salaryMaxMinor', max === undefined ? undefined : Math.round(max * 100)),
        ...optional('salaryRaw', raw),
      }
    }
  }

  return optional('salaryRaw', raw)
}

/* -------------------------------------------------------------------- */
/* Text                                                                  */
/* -------------------------------------------------------------------- */

/**
 * Description markup, as searchable words.
 *
 * Regex rather than a parser, and rather than `DOMParser`: the domain
 * layer may not touch a browser API, and a job description is small and
 * well-formed enough that stripping tags is honest. Block tags become
 * newlines first, or every list item runs into the next and a phrase
 * match invents pairs that were never adjacent.
 */
export function htmlToText(html: string): string {
  if (html.trim() === '') return ''

  return decodeEntities(
    html
      .replace(/<\s*\/?\s*(p|br|div|li|tr|h[1-6]|ul|ol|table)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]*\n[ \t]*(\n[ \t]*)+/g, '\n\n')
    .trim()
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body.startsWith('#x') || body.startsWith('#X')
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole
    }

    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

function looksRemote(value: string | undefined): boolean {
  return value?.toLowerCase().includes('remote') === true
}

/* -------------------------------------------------------------------- */
/* Reading unknown JSON                                                  */
/* -------------------------------------------------------------------- */

/*
 * A board's response is `unknown` and is read field by field, never cast.
 * It is the far side of a trust boundary — the shape can change without
 * warning and has no obligation to tell us — and asserting it is already
 * what we hope would be a validator checking conditions the compiler has
 * decided cannot fail.
 */

function valueAt(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null
    ? (source as Record<string, unknown>)[key]
    : undefined
}

function stringAt(source: unknown, key: string): string | undefined {
  const value = valueAt(source, key)
  return typeof value === 'string' ? value : undefined
}

function numberAt(source: unknown, key: string): number | undefined {
  const value = valueAt(source, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function objectAt(source: unknown, key: string): unknown {
  const value = valueAt(source, key)
  return typeof value === 'object' && value !== null ? value : undefined
}

function arrayAt(source: unknown, key: string): readonly unknown[] {
  const value = valueAt(source, key)
  return Array.isArray(value) ? value : []
}

/** Greenhouse ids are numbers; everything downstream wants one kind of key. */
function idOf(job: unknown): string {
  const value = valueAt(job, 'id')
  return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
}

function firstNamed(job: unknown, key: string): string | undefined {
  for (const item of arrayAt(job, key)) {
    const name = stringAt(item, 'name')
    if (name !== undefined) return name
  }

  return undefined
}

function isoAt(source: unknown, key: string): string | undefined {
  const raw = stringAt(source, key)
  if (raw === undefined) return undefined

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function epochAt(source: unknown, key: string): string | undefined {
  const millis = numberAt(source, key)
  return millis === undefined ? undefined : new Date(millis).toISOString()
}

/** Omits the key entirely when there is no value — `exactOptionalPropertyTypes`. */
function optional<K extends string, T>(key: K, value: T | undefined): Record<K, T> | object {
  return value === undefined ? {} : { [key]: value }
}
