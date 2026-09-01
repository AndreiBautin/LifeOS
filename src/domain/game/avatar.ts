import { isOwnArea } from '@/domain/base/base'
import { isOpen, isOwned, UPGRADE_CATEGORY_LABELS, type Upgrade } from '@/domain/upgrades/upgrade'
import { shelfOf } from '@/domain/upgrades/shelf'

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
  /*
   * **Unreachable today, and written down anyway.**
   *
   * Finance declares no acts — a net worth is measured, not done — so it
   * pays no XP and can never be the area that has paid the most. The
   * calling below cannot currently be shown to anybody.
   *
   * It is here because `avatar.test.ts` requires a title for every
   * declared area, and that guard is right: an area without one reads as
   * "Adventurer" forever, which is a gap that survives precisely because
   * nothing fails. The Vitals entry a few lines down was written under
   * the same "can never happen" and stopped being true the day upkeep
   * arrived.
   */
  finance: 'Provider',
  /* Somebody whose XP is mostly practice -- problems worked, patterns
     studied. "Adept" over "Scholar", which the backlog already has: one
     is what you have read and the other is what you can do. */
  mind: 'Adept',
  /*
   * Reachable now, and it was not when this was written.
   *
   * The note here said Vitals pays no XP so this could never be the
   * calling — true of an area holding only charges and a scale, and
   * false the moment it held upkeep. Brushing your teeth is an act and
   * pays like one, so somebody whose XP is mostly upkeep reads as an
   * Ascetic, which is the right word for it.
   */
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
  /** Gear you have not bought yet — see {@link wantedFrom}. */
  readonly wanted: readonly WantedItem[]
  /** How many more there are than the few listed. */
  readonly wantedBeyond: number
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
 * equipment — and `isOwnArea` excludes the house: a dishwasher is an
 * upgrade to the place you live and a belt is an upgrade to you.
 *
 * **The tech and gear shelves both count, and that is deliberate now
 * that they are separate.** Narrowing this to the gear shelf would be
 * more precise about the word and worse on the screen: a phone and a
 * laptop are things you carry, and somebody whose purchases are all
 * tech would have an empty portrait to make a label read better.
 * `isOwnArea` still draws the line that matters here — the house, or
 * you — and it keeps drawing it correctly with three shelves.
 *
 * Grouped by the upgrade's own `category`, so the slots are the
 * categories that already exist rather than a set of RPG body parts
 * invented here and mapped onto them.
 */

export interface WantedItem {
  readonly title: string
  readonly slot: string
  readonly costMinorUnits?: number
}

/**
 * Kept short on purpose. A wishlist that scrolls is a list, and this sits
 * on a screen that is scanned — the Gear page holds the whole thing.
 */
export const WANTED_SHOWN = 4

/**
 * What you are saving up for, on the shelf that is about you.
 *
 * The ask: *"gear/cosmetics to track apparel, shoes and accessories that
 * I would like to purchase."* The character sheet already shows what you
 * are carrying; this is the other half of an inventory — what you mean
 * to carry.
 *
 * **The gear shelf only, and that is a deliberate asymmetry with the
 * equipped list above it.** `gearFrom` counts both non-house shelves,
 * because a phone is a thing you carry and somebody whose purchases are
 * all tech would otherwise have an empty portrait. A *wishlist* has no
 * such problem: wanted tech already has a screen that does it better,
 * with gates, prerequisites and a budget. Duplicating it here would add
 * nothing and would make "gear/cosmetics" mean something else.
 *
 * **Open, not merely unbought.** `isOpen` excludes cancelled as well as
 * purchased — something you decided against is not something you want.
 *
 * Ordered by the upgrade's own priority, which is **not** the tech
 * tree's ranking: that one inherits priority from whatever a node
 * unblocks, and recomputing it here would put a second ordering on the
 * same records for a four-row summary.
 */
export function wantedFrom(upgrades: readonly Upgrade[]): readonly WantedItem[] {
  return upgrades
    .filter((upgrade) => isOpen(upgrade) && shelfOf(upgrade) === 'gear')
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
    .map((upgrade) => ({
      title: upgrade.title,
      slot: UPGRADE_CATEGORY_LABELS[upgrade.category],
      ...(upgrade.estimatedCostMinorUnits === undefined
        ? {}
        : { costMinorUnits: upgrade.estimatedCostMinorUnits }),
    }))
}

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
  const wanted = wantedFrom(input.upgrades)

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
    wanted: wanted.slice(0, WANTED_SHOWN),
    wantedBeyond: Math.max(0, wanted.length - WANTED_SHOWN),
  }
}
