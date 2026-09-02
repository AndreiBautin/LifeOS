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

/**
 * The screens with **no other way in at all**, listed so they can be
 * found.
 *
 * Reported as _"let's clean up the areas section, seems unnecessary"_,
 * and it mostly was: of the seven chips it carried, four had grown a
 * route somewhere better. Finance and the Tech tree are tabs now, Job
 * search is reached from a main quest's stage and from the leads card,
 * and Limits from the "Set up" on its own card on this screen.
 *
 * **The three left are here because deleting the block outright would
 * have orphaned them**, which is the trap this list exists for: `/mind`
 * and `/resume` were linked from nowhere else in the app, and
 * `/houses` only from a campaign stage that has to exist first. A screen
 * you cannot reach is a screen the app does not have — the same shape as
 * the geocoder nothing could call.
 *
 * Checked by grep rather than assumed. If one of these gains a home
 * elsewhere, it comes off this list and the list goes when it empties.
 */
export const AREA_LINKS = [
  { to: '/mind', label: 'Mind' },
  { to: '/resume', label: 'Resume' },
  { to: '/houses', label: 'Houses' },
] as const

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
