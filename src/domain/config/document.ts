import { parseWants, type HomeWants } from '@/domain/homes/candidate'
import { parseJobSearch, parseSources, type JobSearch } from '@/domain/jobs/search'
import { parseDigestPreferences, type DigestPreferences } from '@/domain/news/digest'

/**
 * The preferences that are tedious to type, as one pasteable document.
 *
 * The report: *"passing files back and forth is a slow workflow, same
 * with me seeding job board stuff and everything else when you already
 * have it."* Two halves, and this is the answer to both — a document
 * that goes out to the clipboard and comes back in through a box, with
 * no file in between.
 *
 * **Not a backup, deliberately.** A backup is the whole database, and it
 * carries a checksum because a large file can be truncated on the way to
 * disk. This is three small preference blocks that somebody pastes: a
 * truncated paste fails to be JSON at all, so a checksum would only be a
 * thing to compute by hand before the document could be written. Trying
 * to reuse the backup envelope for this is the trap — `validateEnvelope`
 * demands `exercises`, `workouts` and `checkIns` arrays, so a document
 * containing a job search and nothing else is not a valid backup and
 * should not be made into one.
 *
 * **It carries preferences, never records.** A room, a habit and a
 * campaign stage are things that happened or were decided, and they have
 * their own screens and their own history. What is here is the settings
 * whose value is entirely in somebody having typed a long list once.
 */

export const CONFIG_MAGIC = 'lifeos.config'

export interface ConfigDocument {
  readonly magic: typeof CONFIG_MAGIC
  readonly jobSearch?: JobSearch
  readonly digest?: DigestPreferences
  readonly homeWants?: HomeWants
}

/** The settings a document may carry, and nothing else. */
export interface ConfigSettings {
  readonly jobSearch: JobSearch
  readonly digest: DigestPreferences
  readonly homeWants: HomeWants
}

export const CONFIG_KEYS = ['jobSearch', 'digest', 'homeWants'] as const
export type ConfigKey = (typeof CONFIG_KEYS)[number]

export const CONFIG_LABELS: Record<ConfigKey, string> = {
  jobSearch: 'Job search',
  digest: 'Morning digest',
  homeWants: 'What you want nearby',
}

export function writeConfig(settings: ConfigSettings): ConfigDocument {
  return {
    magic: CONFIG_MAGIC,
    jobSearch: settings.jobSearch,
    digest: settings.digest,
    homeWants: settings.homeWants,
  }
}

export interface ConfigSectionRead {
  readonly key: ConfigKey
  /** What the section would become, already through its own parser. */
  readonly value: JobSearch | DigestPreferences | HomeWants
  /** A line saying what it holds, so it can be read before it is applied. */
  readonly summary: string
}

export type ConfigRead =
  | { readonly kind: 'unreadable'; readonly reason: string }
  | {
      readonly kind: 'read'
      readonly sections: readonly ConfigSectionRead[]
      /** Only the sections the document actually carried. */
      readonly change: Partial<ConfigSettings>
    }

/**
 * Lets the boards be written the way a person writes them.
 *
 * `parseJobSearch` wants `{ provider, token }` objects, because that is
 * what a stored search holds. Nobody hand-writes that: the screen's own
 * paste box takes `greenhouse:stripe`, and it is the format the boards
 * are quoted in everywhere. Both are accepted here — a string, or a list
 * of strings, goes through `parseSources` first, and anything else is
 * handed on untouched so a round-tripped document still reads.
 */
function withReadableSources(raw: Record<string, unknown>): Record<string, unknown> {
  const sources = raw.sources

  if (typeof sources === 'string') return { ...raw, sources: parseSources(sources) }

  if (Array.isArray(sources) && sources.every((one) => typeof one === 'string')) {
    return { ...raw, sources: parseSources(sources.join('\n')) }
  }

  return raw
}

function describeJobSearch(value: JobSearch): string {
  const { profile } = value
  const boards = value.sources.length

  return [
    `${String(boards)} board${boards === 1 ? '' : 's'}`,
    `${String(profile.titleIncludes.length)} title terms`,
    `${String(profile.keywordIncludes.length)} keywords`,
    `floor ${String(value.minimumScore)}`,
  ].join(' · ')
}

function describeDigest(value: DigestPreferences): string {
  return [
    `${String(value.sources.length)} source${value.sources.length === 1 ? '' : 's'}`,
    `${String(value.interests.length)} interests`,
    `${String(value.mutes.length)} mutes`,
    `top ${String(value.limit)}`,
  ].join(' · ')
}

function describeWants(value: HomeWants): string {
  const kinds = value.wanted.length

  return [
    `${String(kinds)} kind${kinds === 1 ? '' : 's'} nearby`,
    `${String(Math.round(value.radiusMetres))} m`,
  ].join(' · ')
}

/**
 * Reads a pasted document, without applying anything.
 *
 * **A section that is absent is left alone; it is never cleared.** That
 * is the rule `recordFinance` already follows — an empty box means "I
 * did not say", and only the other reading corrupts anything. It is what
 * makes a document holding a job search and nothing else safe to paste.
 *
 * **A section that is present and not an object is refused rather than
 * parsed.** The three parsers are total, so junk degrades to the default
 * — which for a job search is *empty*, and applying that would be a wipe
 * wearing a settings change's clothes. Refusing is the honest answer;
 * for anything it does accept, the summary says what it would become, so
 * a section that really does parse to nothing can be seen before it is
 * taken.
 */
export function readConfig(candidate: unknown): ConfigRead {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return { kind: 'unreadable', reason: 'That is not a configuration document.' }
  }

  const bag = candidate as Record<string, unknown>

  if (bag.magic !== CONFIG_MAGIC) {
    return {
      kind: 'unreadable',
      reason: `This does not look like LifeOS configuration — it should start with "magic": "${CONFIG_MAGIC}".`,
    }
  }

  const sections: ConfigSectionRead[] = []
  const change: {
    jobSearch?: JobSearch
    digest?: DigestPreferences
    homeWants?: HomeWants
  } = {}

  for (const key of CONFIG_KEYS) {
    const raw = bag[key]
    if (raw === undefined) continue

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {
        kind: 'unreadable',
        reason: `The "${key}" section is present but is not an object. Remove it or fix it — applying it as it stands would clear what is there.`,
      }
    }

    if (key === 'jobSearch') {
      const value = parseJobSearch(withReadableSources(raw as Record<string, unknown>))
      change.jobSearch = value
      sections.push({ key, value, summary: describeJobSearch(value) })
    } else if (key === 'digest') {
      const value = parseDigestPreferences(raw)
      change.digest = value
      sections.push({ key, value, summary: describeDigest(value) })
    } else {
      const value = parseWants(raw)
      change.homeWants = value
      sections.push({ key, value, summary: describeWants(value) })
    }
  }

  if (sections.length === 0) {
    return {
      kind: 'unreadable',
      reason:
        'The document carries no settings. It needs at least one of: jobSearch, digest, homeWants.',
    }
  }

  return { kind: 'read', sections, change }
}
