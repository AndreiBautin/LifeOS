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
 * The ring is how far into that level you are. The avatar is a *way of
 * looking at* the character sheet, not a second one.
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

export interface Avatar {
  readonly level: number
  /**
   * How much figure the portrait draws, `0`-`4`.
   *
   * **A re-presentation of the level and nothing else**, which is what
   * lets it exist at all: the model has three currencies on purpose, and
   * a portrait that changed on its own would be a fourth. This is the
   * level, drawn.
   *
   * It came from _"is there a way to make the avatar more engaging
   * instead of simply a blank figure? Perhaps levelling could upgrade it,
   * since currently levelling is done simply for the sake of levelling."_
   * That is a fair account of what levelling did — it moved a numeral and
   * an arc, and the silhouette at level 1 was the silhouette at level 20.
   *
   * **A number rather than a name.** Flavour titles were deleted from
   * this file for being words the app made up, and a rank called
   * *Ascendant* would be the same thing wearing armour. Nothing prints
   * this; it only decides how much is drawn.
   */
  readonly build: number
  /** XP into the current level, and what the level costs. A real bar. */
  readonly into: number
  readonly needed: number
  /** `0`–`1` through the level, for the ring around the figure. */
  readonly progress: number
  readonly season: Season
}

/**
 * **The gear is gone from the portrait, and the upgrades are not gone.**
 *
 * `gearFrom` grouped what you had bought — `isOwned` and `isOwnArea`,
 * so purchases that were yours rather than the house's — into slots
 * named by the upgrade's own category, and the card listed them beside
 * the figure. There had been a wishlist beside it, removed with the gear
 * shelf a day earlier. Asked for directly: *"no need to track or show
 * upgrades in that card."*
 *
 * The records are untouched and the tech tree still owns them, bought or
 * wanted. What went is this model's copy, and with it the last field on
 * the avatar that was not a reading of the XP model: a level, a ring and
 * a season are XP or the calendar, where a list of typed titles was
 * neither.
 *
 * Deleting it rather than leaving it exported is what takes `upgrades`
 * out of `buildAvatar` — so drawing a portrait no longer loads a whole
 * store to group something nothing shows.
 */

/**
 * The level at which each band of the figure appears.
 *
 * Five steps, at levels the XP curve actually reaches, so the picture
 * changes about as often as it is worth noticing. **The thresholds are
 * this app's own** — unlike a ladder, which must name a published
 * standard, because there is nothing external to anchor "how much
 * silhouette" to and nothing is being claimed by it. It is a scale the
 * app invented, and that is allowed precisely because it measures
 * nothing: it re-draws a number that was already earned honestly.
 */
export const BUILD_BANDS: readonly number[] = [1, 5, 10, 15, 20]

/** How much figure a level has earned, `0`-`4`. */
export function buildFor(level: number): number {
  let band = 0
  for (const [index, at] of BUILD_BANDS.entries()) {
    if (level >= at) band = index
  }
  return band
}

export function buildAvatar(input: {
  readonly standing: XpStanding
  readonly season: Season
}): Avatar {
  return {
    level: input.standing.level,
    build: buildFor(input.standing.level),
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
  }
}
