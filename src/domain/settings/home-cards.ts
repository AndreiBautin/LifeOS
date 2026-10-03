/**
 * The order of the home page's cards, and which are hidden.
 *
 * **Stored as the person's choices, read against the app's list**: a card
 * shipped after the order was saved is not in it, and must appear — at
 * its default position among its neighbours — rather than vanish because
 * nobody ordered it. A key the app no longer has is ignored.
 */
export interface HomeCardPrefs {
  readonly order: readonly string[]
  readonly hidden: readonly string[]
}

export function arrangeCards(
  defaults: readonly string[],
  prefs: HomeCardPrefs | undefined,
): readonly string[] {
  if (prefs === undefined) return defaults
  const known = new Set(defaults)
  const ordered = prefs.order.filter((key) => known.has(key))
  // A card the saved order has never seen goes after the card it follows by default.
  for (const [at, key] of defaults.entries()) {
    if (ordered.includes(key)) continue
    const before = defaults.slice(0, at).findLast((one) => ordered.includes(one))
    ordered.splice(before === undefined ? 0 : ordered.indexOf(before) + 1, 0, key)
  }
  const hidden = new Set(prefs.hidden)
  return ordered.filter((key) => !hidden.has(key))
}

/** Moves a card one place up or down in the full order, hidden cards included. */
export function moveCard(
  defaults: readonly string[],
  prefs: HomeCardPrefs | undefined,
  key: string,
  by: -1 | 1,
): HomeCardPrefs {
  const order = [...arrangeCards(defaults, { order: prefs?.order ?? defaults, hidden: [] })]
  const at = order.indexOf(key)
  const to = at + by
  if (at === -1 || to < 0 || to >= order.length) {
    return { order, hidden: prefs?.hidden ?? [] }
  }
  ;[order[at], order[to]] = [order[to] ?? key, order[at] ?? key]
  return { order, hidden: prefs?.hidden ?? [] }
}

export function toggleCard(
  prefs: HomeCardPrefs | undefined,
  defaults: readonly string[],
  key: string,
): HomeCardPrefs {
  const hidden = new Set(prefs?.hidden ?? [])
  if (hidden.has(key)) hidden.delete(key)
  else hidden.add(key)
  return { order: prefs?.order ?? defaults, hidden: [...hidden] }
}
