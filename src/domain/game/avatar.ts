import { isOwnArea } from '@/domain/base/base'
import { isOwned, UPGRADE_CATEGORY_LABELS, type Upgrade } from '@/domain/upgrades/upgrade'

import { LIFE_AREAS, type LifeArea } from './registry'
import type { Season } from './season'
import type { XpStanding } from './xp'

/**
 * A portrait of the sheet, and **nothing the sheet does not already
 * say.**
 *
 * The temptation in an avatar is to give it a number of its own — a
 * power rating, a gear score, some figure that goes up as you play. That
 * would be the fourth currency, and the model has three on purpose: a
 * ladder anchored to an external standard, a rating that reads a
 * direction, and XP paid per act. Anything here that could not be traced
 * back to one of those would be a scale the app invented and can
 * therefore move, which is what `docs/GAME_MODEL.md` refuses everywhere.
 *
 * So every field below is a re-presentation. The level is the XP level.
 * The ring is how far into that level you are. The calling is whichever
 * area has paid the most XP. The gear is upgrades you actually bought.
 * The avatar is a *way of looking at* the character sheet, not a second
 * one.
 */

/**
 * What each area calls someone who spends their time there.
 *
 * Flavour, and flavour is allowed — this is a label on a derivation, not
 * a number entering one. The constraint it does have to meet is that it
 * must never be the *only* place something is said: a reader who
 * distrusts "Wayfarer" can look at the XP breakdown underneath and see
 * exactly which acts produced it.
 */
export const AREA_TITLES: Record<LifeArea, string> = {
  training: 'Athlete',
  backlog: 'Scholar',
  projects: 'Builder',
  upgrades: 'Artificer',
  social: 'Companion',
  places: 'Wayfarer',
  dailies: 'Devotee',
  jobs: 'Journeyman',
  base: 'Steward',
  // Vitals pays no XP at all, so it can never be the calling. The entry
  // exists because this is a total record and the compiler says so.
  vitals: 'Ascetic',
}

/** One area's XP, as much of `AreaStanding` as this needs. */
export interface AreaXp {
  readonly area: string
  readonly name: string
  readonly xp: number
}

export interface Calling {
  readonly area: string
  /** The area's own name, so the label can be checked against it. */
  readonly areaName: string
  readonly title: string
  readonly xp: number
  /** This area's share of all XP earned, 0–1. */
  readonly share: number
}

export interface GearSlot {
  readonly category: string
  readonly label: string
  readonly items: readonly string[]
}

export interface Avatar {
  readonly level: number
  /** XP into the current level, and what the level costs. A real bar. */
  readonly into: number
  readonly needed: number
  /** `0`–`1` through the level, for the ring around the figure. */
  readonly progress: number
  readonly season: Season
  /**
   * Absent until something has actually been done.
   *
   * Absent rather than a default class, for the reason every reading in
   * this app is absent rather than zero: "you have not done anything
   * yet" is a different statement from "you are a novice Athlete", and
   * only one of them is true on an empty database.
   */
  readonly calling?: Calling
  readonly gear: readonly GearSlot[]
  /** Owned upgrades that are yours rather than the house's. */
  readonly gearCount: number
}

/**
 * Which area has paid the most XP.
 *
 * XP is the one quantity that is comparable across areas — that is the
 * whole reason it exists as a single currency — so it is the only honest
 * basis for a question like "what am I, mostly". Ladders cannot answer
 * it: they are anchored to different external standards, and Advanced on
 * the squat and Advanced at exploration are not the same distance from
 * anywhere.
 *
 * Ties break by `LIFE_AREAS` order rather than by whichever the caller
 * happened to list first, so the answer does not depend on an array's
 * order somewhere else.
 */
export function callingFrom(areas: readonly AreaXp[]): Calling | undefined {
  const total = areas.reduce((sum, area) => sum + area.xp, 0)
  if (total <= 0) return undefined

  const rank = (area: string) => {
    const at = LIFE_AREAS.indexOf(area as LifeArea)
    return at < 0 ? LIFE_AREAS.length : at
  }

  const best = [...areas]
    .filter((area) => area.xp > 0)
    .sort((a, b) => b.xp - a.xp || rank(a.area) - rank(b.area))[0]

  if (best === undefined) return undefined

  return {
    area: best.area,
    areaName: best.name,
    // Read through a partial view rather than an assertion, the way
    // `slotRoleLabel` does: casting a plain string to `LifeArea` would
    // tell the compiler the fallback is dead when it is exactly what
    // catches an area this build has not heard of.
    title: (AREA_TITLES as Partial<Record<string, string>>)[best.area] ?? 'Adventurer',
    xp: best.xp,
    share: best.xp / total,
  }
}

/**
 * What you are carrying, from what you have actually bought.
 *
 * Two existing fields decide this and no new one was added. `isOwned`
 * means the upgrade was purchased rather than wanted — a wishlist is not
 * equipment — and `isOwnArea` excludes the house, which is the split you
 * already make on the Base screen: a dishwasher is an upgrade to the
 * place you live and a belt is an upgrade to you.
 *
 * Grouped by the upgrade's own `category`, so the slots are the
 * categories that already exist rather than a set of RPG body parts
 * invented here and mapped onto them.
 */
export function gearFrom(upgrades: readonly Upgrade[]): readonly GearSlot[] {
  const worn = upgrades.filter((upgrade) => isOwned(upgrade) && isOwnArea(upgrade))

  const bySlot = new Map<string, string[]>()

  for (const upgrade of worn) {
    const existing = bySlot.get(upgrade.category)
    if (existing === undefined) bySlot.set(upgrade.category, [upgrade.title])
    else existing.push(upgrade.title)
  }

  return (
    [...bySlot.entries()]
      .map(([category, items]) => ({
        category,
        label: (UPGRADE_CATEGORY_LABELS as Partial<Record<string, string>>)[category] ?? category,
        items,
      }))
      /*
       * Fullest slot first. Sorting by the category list's own order would
       * put an empty-ish slot above the one carrying most of what you own,
       * and the point of the panel is to show what you have.
       */
      .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label))
  )
}

export function buildAvatar(input: {
  readonly standing: XpStanding
  readonly areas: readonly AreaXp[]
  readonly upgrades: readonly Upgrade[]
  readonly season: Season
}): Avatar {
  const calling = callingFrom(input.areas)
  const gear = gearFrom(input.upgrades)

  return {
    level: input.standing.level,
    into: input.standing.into,
    needed: input.standing.needed,
    /*
     * Guarded, because `needed` is zero at the top of the ladder and a
     * ring drawn from `0 / 0` is `NaN` — which renders as an invisible
     * arc rather than as an error, and would look like a bug nobody
     * could find.
     */
    progress: input.standing.needed > 0 ? input.standing.into / input.standing.needed : 1,
    season: input.season,
    ...(calling === undefined ? {} : { calling }),
    gear,
    gearCount: gear.reduce((sum, slot) => sum + slot.items.length, 0),
  }
}
