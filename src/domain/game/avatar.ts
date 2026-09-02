import { isOwnArea } from '@/domain/base/base'
import { isOwned, UPGRADE_CATEGORY_LABELS, type Upgrade } from '@/domain/upgrades/upgrade'

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
 * The ring is how far into that level you are. The gear is upgrades you
 * actually bought.
 * The avatar is a *way of looking at* the character sheet, not a second
 * one.
 */

/**
 * **There were flavour titles here, then a share, and both are gone.**
 *
 * Each area named somebody who spent their time there — Devotee for
 * dailies, Steward for the house — and whichever area had paid the most
 * XP put its word up as the page heading. That went on the report
 * *"I don't really care too much about the level names."* What was kept
 * was the half that was a measurement: `mainstayFrom`, naming the area
 * that had paid the most and what share of everything that was, read on
 * the card as "100% of your XP is dailies".
 *
 * The share went a day later, asked for in the same breath as merging
 * the season and the traits into one card: *"let's get rid of the info
 * like 100 percent of xp from dailies."* It is not a loss of evidence.
 * **The season band names where this season's XP came from, area by
 * area, and the traits split the whole of it eight ways** — both of
 * which say what a single percentage said, with the arithmetic on
 * screen rather than reduced to one figure.
 *
 * The function is deleted rather than left exported, because a
 * derivation nothing calls is the trap this codebase keeps finding.
 */

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
  readonly gear: readonly GearSlot[]
  /** Owned upgrades that are yours rather than the house's. */
  readonly gearCount: number
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
  readonly upgrades: readonly Upgrade[]
  readonly season: Season
}): Avatar {
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
    gear,
    gearCount: gear.reduce((sum, slot) => sum + slot.items.length, 0),
  }
}
