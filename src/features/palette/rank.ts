/**
 * Ranking what was typed into the command palette against what it can
 * open. Every word typed must appear; a label that **starts** with the
 * query beats one where a word starts with it, which beats a match in the
 * middle — so "be" finds Bench Press before Barbell Curl's "…bell". Ties
 * keep the order the caller gave, which puts pages before exercises
 * before sessions.
 */
export interface PaletteItem {
  readonly id: string
  readonly label: string
  /** The kind, shown beside it: "Page", "Exercise", "Session". */
  readonly kind: string
  /** Extra words that should match without being shown, e.g. a date. */
  readonly keywords?: string
  readonly to: string
}

export function rankItems(
  items: readonly PaletteItem[],
  query: string,
  limit = 8,
): readonly PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (q === '') return items.slice(0, limit)
  const words = q.split(/\s+/)

  return items
    .map((item, order) => {
      const label = item.label.toLowerCase()
      const haystack = `${label} ${(item.keywords ?? '').toLowerCase()}`
      if (!words.every((word) => haystack.includes(word))) return undefined
      const score = label.startsWith(q)
        ? 0
        : label.split(/[\s—-]+/).some((word) => word.startsWith(words[0] ?? ''))
          ? 1
          : 2
      return { item, score, order }
    })
    .filter((one) => one !== undefined)
    .toSorted((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map(({ item }) => item)
}
