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
 * The screens with no tab of their own, listed so they can be found.
 *
 * It exists because the area cards were the only way in and a silent
 * area renders no card: Job search had nothing to say until an
 * application existed, and the only route to the screen that creates one
 * was the card that could not appear until it did. A link makes no claim
 * about standing, so it can be shown where a card cannot.
 */
export const AREA_LINKS = [
  { to: '/limits', label: 'Limits' },
  { to: '/jobs', label: 'Job search' },
  { to: '/mind', label: 'Mind' },
  { to: '/houses', label: 'Houses' },
  { to: '/finance', label: 'Finance' },
  { to: '/resume', label: 'Resume' },
  { to: '/upgrades', label: 'Tech tree' },
] as const

/** The tone each rung of the strength ladder reads in. */
export const LEVEL_TONE: Partial<Record<Level, 'neutral' | 'accent' | 'good' | 'cool'>> = {
  Untrained: 'neutral',
  Novice: 'neutral',
  Intermediate: 'accent',
  Advanced: 'good',
  Elite: 'cool',
}

/**
 * Where each area is actually done, so the hub is a hub.
 *
 * Here rather than in the registry because `domain/game/` must not know
 * that a browser exists — an area is a way of scoring, and which URL
 * shows it is a fact about this front end.
 *
 * Partial on purpose: an area with no screen of its own is a heading and
 * nothing more, which is honest rather than a link that goes nowhere.
 */
export const AREA_ROUTES: Partial<Record<string, string>> = {
  training: '/train',
  projects: '/quests',
  backlog: '/backlog',
  upgrades: '/upgrades',
  places: '/map',
  base: '/base',
  /*
   * Today, like `dailies` above it and for the same reason: upkeep is
   * kept on the hub itself now that the screen it had has gone. A
   * self-link rather than no link, because the card is what tells you
   * where the records are.
   */
  vitals: '/today',
  dailies: '/today',
  jobs: '/jobs',
  finance: '/finance',
  mind: '/mind',
}
