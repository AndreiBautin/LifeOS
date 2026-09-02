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
 * The ring is how far into that level you are. The mainstay is whichever
 * area has paid the most XP. The gear is upgrades you actually bought.
 * The avatar is a *way of looking at* the character sheet, not a second
 * one.
 */

/**
 * **There were flavour titles here and they are gone.**
 *
 * Each area named somebody who spent their time there — Devotee for
 * dailies, Steward for the house, Athlete for training — and whichever
 * area had paid the most XP put its word at the top of the screen as the
 * page heading.
 *
 * Asked for directly: *"I don't really care too much about the level
 * names like Devotee, could we drop those."* What is kept is the half
 * that was never the label: **which area has paid the most, and what
 * share of everything that is.** A share is a measurement and can be
 * checked against the breakdown beneath it; a word invented here could
 * only be taken on trust. The card's own note already called the share
 * "the difference between a label and a claim" — what is left is the
 * claim.
 *
 * It was also the one heading in the app that was *derived* rather than
 * read. Every other one says what the screen is; this one said what you
 * were.
 */

/** One area's XP, as much of `AreaStanding` as this needs. */
export interface AreaXp {
  readonly area: string
  readonly name: string
  readonly xp: number
}

export interface Mainstay {
  readonly area: string
  /** The area's own name, which is what the sentence says out loud. */
  readonly areaName: string
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
   * Absent rather than a nought-per-cent reading, for the reason every
   * reading in this app is absent rather than zero: "you have not done
   * anything yet" is a different statement from "0% of your XP is
   * training", and only one of them is true on an empty database.
   */
  readonly mainstay?: Mainstay
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
export function mainstayFrom(areas: readonly AreaXp[]): Mainstay | undefined {
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

/**
 * **There was a wishlist here and it is gone with its shelf.** It listed
 * open upgrades on the `gear` shelf — *"what you mean to carry"* — and
 * was deliberately that shelf only, on the reasoning that wanted tech
 * already has a screen doing it better with gates, prerequisites and a
 * budget. Removing the shelf left it reading from nothing.
 *
 * Asked for directly: *"I don't really have anything in gear that I want
 * right now and don't foresee typing progress to that."* The tech tree
 * is where a wanted thing lives now, which is where the better version
 * always was.
 *
 * The **equipped** list below is untouched and never depended on that
 * shelf: it reads `isOwned` and `isOwnArea`, so a bought phone and a
 * bought pair of boots both still show in the portrait.
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
  const mainstay = mainstayFrom(input.areas)
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
    ...(mainstay === undefined ? {} : { mainstay }),
    gear,
    gearCount: gear.reduce((sum, slot) => sum + slot.items.length, 0),
  }
}
