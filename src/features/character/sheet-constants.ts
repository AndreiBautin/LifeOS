import type { Level } from '@/domain/game/character'

/**
 * The constants the character sheet reads, apart from the components
 * that render them.
 *
 * Split out because a file that exports both components and values
 * breaks fast refresh — the lint rule says so, and the reason is worth
 * knowing: React cannot hot-swap a module whose exports it cannot prove
 * are all components, so editing a colour would remount the screen.
 */

/*
 * **`AREA_LINKS` is gone, and the reason it existed is worth keeping.**
 * It listed the screens with no tab so they could be found at all, and
 * every entry was eventually a symptom: a screen nobody could reach is a
 * screen the app does not have.
 *
 * It emptied the right way — not by deleting the list, but by each
 * screen finding a parent that is *about* it. Resume and Mind sit on Job
 * search, Job search on Quests, Houses on the arc's house-search stage,
 * Limits on its own card, Finance and the tree on tabs of their own.
 *
 * **If a screen is ever added with no route, do not bring this back.**
 * Find the screen it belongs to. The block read as random because it
 * was: its members shared only the absence of a tab.
 */

/** The tone each rung of the strength ladder reads in. */
export const LEVEL_TONE: Partial<Record<Level, 'neutral' | 'accent' | 'good' | 'cool'>> = {
  Untrained: 'neutral',
  Novice: 'neutral',
  Intermediate: 'accent',
  Advanced: 'good',
  Elite: 'cool',
}

/*
 * **`AREA_ROUTES` was here and went with the area cards.** It mapped
 * each life area to the screen where that area is actually done, so a
 * card's heading could link to it. With the cards gone nothing asks the
 * question any more, and `AREA_LINKS` above is the surviving answer to
 * the one that still matters: how to reach a screen that has no tab.
 *
 * If area cards ever return, note what that map got right — it was
 * **partial on purpose**, because an area with no screen of its own is a
 * heading rather than a link that goes nowhere, and it lived here rather
 * than in the registry because `domain/game/` must not know a browser
 * exists.
 */
