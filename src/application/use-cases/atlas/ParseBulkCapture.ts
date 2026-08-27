const MAX_NAME_LENGTH = 200
const DEFAULT_MAX_ENTRIES = 100

/**
 * Leading list markers people paste in from notes apps: "1.", "2)", "-",
 * "*", bullets and dashes. Stripped so the name is the name.
 */
const LIST_MARKER = /^\s*(?:[-*•·–—]|\d+[.)])\s+/

export interface BulkCaptureEntry {
  /** 1-based, so a rejected line can be pointed at in the original paste. */
  readonly lineNumber: number
  readonly name: string
}

export interface BulkCaptureParseResult {
  readonly entries: readonly BulkCaptureEntry[]
  /** Repeated within the paste itself. */
  readonly duplicates: readonly string[]
  /** Already saved, matched on name, case-insensitively. */
  readonly alreadySaved: readonly string[]
  readonly tooLong: readonly string[]
  /** How many entries were dropped for exceeding `maxEntries`. */
  readonly truncated: number
}

export interface ParseBulkCaptureOptions {
  readonly existingNames?: readonly string[]
  readonly maxEntries?: number
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Turns a pasted block of text into place names, one per line.
 *
 * Deliberately forgiving about what gets pasted — the whole point of a mind
 * dump is not having to tidy the input first — but it reports everything it
 * drops rather than silently swallowing lines, so nothing goes missing
 * without the user being told.
 */
export function parseBulkCapture(
  text: string,
  options: ParseBulkCaptureOptions = {},
): BulkCaptureParseResult {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const existing = new Set((options.existingNames ?? []).map((name) => name.trim().toLowerCase()))

  const entries: BulkCaptureEntry[] = []
  const duplicates: string[] = []
  const alreadySaved: string[] = []
  const tooLong: string[] = []
  const seen = new Set<string>()
  let truncated = 0

  const lines = text.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    const name = normalizeWhitespace(line.replace(LIST_MARKER, ''))
    if (name.length === 0) {
      continue
    }

    if (name.length > MAX_NAME_LENGTH) {
      tooLong.push(name)
      continue
    }

    const key = name.toLowerCase()
    if (seen.has(key)) {
      duplicates.push(name)
      continue
    }
    if (existing.has(key)) {
      seen.add(key)
      alreadySaved.push(name)
      continue
    }

    seen.add(key)

    if (entries.length >= maxEntries) {
      truncated += 1
      continue
    }

    entries.push({ lineNumber: index + 1, name })
  }

  return { entries, duplicates, alreadySaved, tooLong, truncated }
}
