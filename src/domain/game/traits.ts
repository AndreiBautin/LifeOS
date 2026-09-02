import { levelFromXp } from './character'
import { LIFE_AREAS, type LifeArea } from './registry'
import { xpFrom, type ActDefinition } from './xp'

/**
 * Strength, Intellect, Charisma — the character sheet as an RPG reads
 * one, and **not a fourth currency.**
 *
 * The request was for attributes that "get individually leveled up to
 * make this more gamified", and the tempting build is a new pool per
 * attribute that things pay into. That is exactly the fourth currency
 * `docs/GAME_MODEL.md` has three on purpose to avoid, and worse, most of
 * these have no external standard to anchor to: strength has published
 * bodyweight multiples that nothing in this app can move, and there is
 * no such table for how charismatic somebody is. Inventing one is the
 * one thing the model refuses everywhere.
 *
 * **So a trait is a projection of XP, and nothing else.** Each life area
 * belongs to exactly one trait, so a trait's XP is the sum of the XP
 * those areas have already paid — the same acts, re-presented under a
 * name. Nothing new is counted, nothing new is invented, and every bar
 * on the screen can be traced back to acts somebody actually performed.
 * It is the same stance the avatar takes: a way of *looking at* the
 * sheet, never a second one.
 *
 * The rule that keeps it honest is the partition. `TRAITS` covers every
 * area and no area twice, which is what makes the trait totals add up to
 * the XP total exactly — rule three, "nothing counted twice", holding by
 * construction rather than by attention. `traits.test.ts` fails on both
 * halves.
 *
 * Called traits rather than attributes because `character.ts` already
 * exports an `Attribute`, which is a lift measured against a published
 * standard. Two things called the same word in one folder is how a
 * reader ends up believing a bench press and Charisma are the same kind
 * of quantity, when they are precisely not: one is a ladder and one is a
 * projection of XP.
 */

export interface TraitDefinition {
  readonly id: string
  readonly label: string
  /**
   * The areas whose XP this trait re-presents.
   *
   * **No blurb any more.** Each row used to carry a sentence naming what
   * fed it — "people you actually saw" — on the reasoning that a bar
   * with no source is the invented scale this model refuses. That
   * reasoning was about a bar somebody might not be able to trace; four
   * bars called Strength, Stamina, Intellect and Craft, on a sheet whose
   * every number comes from acts, do not need a paragraph each to be
   * legible. Asked for as _"drop the descriptions on traits"_.
   */
  readonly areas: readonly LifeArea[]
}

/**
 * Four traits, and **they no longer partition the areas.**
 *
 * That is the change to know about before reading anything else here.
 * Every area used to belong to exactly one trait, which made the trait
 * totals sum to the XP total exactly — rule three holding by
 * construction. Asked for: _"drop discipline, fortune and wayfaring
 * completely"_, and there is no honest home among the four survivors for
 * habits, limits, challenges, job search, finance or exploration.
 * Forcing them in would have made Craft a catch-all holding half the
 * app, which is the invented structure this file has always refused.
 *
 * **So a trait is now a selection, and the bars add up to less than the
 * level above them.** That is a real cost and it is deliberate rather
 * than accidental — which is the entire difference from the failure the
 * old guard existed to catch, where an area fell out of the partition by
 * mistake and nothing said so. `UNCLAIMED_AREAS` names the ones with no
 * bar, and `traits.test.ts` asserts that list exactly, so a *new* area
 * arriving without a trait is still a decision somebody has to make out
 * loud rather than a silence.
 *
 * What has not changed: no area feeds two traits, and nothing here
 * invents a number. A trait is still XP you already earned under a
 * different name.
 */
export const TRAITS: readonly TraitDefinition[] = [
  { id: 'strength', label: 'Strength', areas: ['training'] },
  /*
   * Its own area rather than a share of `training`, because an area
   * feeds exactly one trait — see the note in `registry.ts`. The act is
   * a session that contained conditioning actually done.
   */
  { id: 'stamina', label: 'Stamina', areas: ['cardio'] },
  { id: 'intellect', label: 'Intellect', areas: ['backlog', 'mind'] },
  /*
   * **Crafting is things you built, and it used to be much wider.** It
   * was quests, the house and the tech tree — asked for as _"it
   * shouldn't be any dailies or housework, just the diy stuff I work on
   * myself or Legos from my codex."_
   *
   * So it claims one area, and that area is split off two others rather
   * than being a new place to log things: Lego comes out of the Codex
   * and DIY house jobs come out of Base. Buying an upgrade and hiring a
   * plumber are still things you did and still pay the level; they are
   * not crafting, and they have no bar now.
   */
  { id: 'crafting', label: 'Crafting', areas: ['crafting'] },
]

/**
 * The areas that pay XP into the level and into no bar.
 *
 * **Listed rather than derived, and that is the point.** It is the same
 * guard the partition used to be, one step weaker: the test asserts this
 * list matches reality exactly, so an area added without a trait fails
 * the build until somebody says which of the two it is. Deriving it
 * would make the answer always "correct" and never a decision.
 */
export const UNCLAIMED_AREAS: readonly LifeArea[] = [
  'places',
  'projects',
  'upgrades',
  'base',
  'dailies',
  'jobs',
  'vitals',
  'finance',
  'challenges',
]

/** Which trait an area feeds. Total, by the partition guard. */
export function traitForArea(area: LifeArea): TraitDefinition | undefined {
  return TRAITS.find((trait) => trait.areas.includes(area))
}

export interface TraitStanding {
  readonly trait: TraitDefinition
  readonly xp: number
  readonly level: number
  /** XP into the current level, and what the level costs. */
  readonly into: number
  readonly needed: number
  /**
   * Whether anything has ever fed it.
   *
   * Absent, never zero — the rule the whole app follows. A trait nothing
   * has paid into is *unproven* rather than a zero, and the screen says
   * so instead of drawing a bar at nought against a scale that would
   * read as failing.
   */
  readonly proven: boolean
}

/**
 * Every trait, levelled off the XP its areas have paid.
 *
 * **The same level curve as the character**, deliberately. A separate
 * curve per trait would be a second answer to "what is a level worth",
 * and the first thing anybody would do is compare a Strength 12 with a
 * character level 20 and find the two say different things. Sharing the
 * curve means a trait level is exactly what it looks like: the level you
 * would be if this were all you had ever done.
 */
export function traitStandings(
  tally: Readonly<Record<string, number>>,
  catalogue: readonly ActDefinition[],
): readonly TraitStanding[] {
  return TRAITS.map((trait) => {
    /*
     * Filtered by area rather than by a list of act ids. An act joins a
     * trait by its area gaining one, so a new act in an existing area is
     * counted without anything here being edited — the same reason
     * `tallyActs` splits on `belongsTo` rather than on the calling
     * screen.
     */
    const acts = catalogue.filter((act) => trait.areas.includes(act.area as LifeArea))
    const xp = xpFrom(tally, acts)
    const { level, into, needed } = levelFromXp(xp)

    return { trait, xp, level, into, needed, proven: xp > 0 }
  })
}

/**
 * The areas no trait claims.
 *
 * Empty by construction and checked by a test, because the failure is
 * silent in the direction that matters: an area missing from the
 * partition pays XP that appears in the character total and in no trait,
 * so the bars quietly sum to less than the level above them. The same
 * shape as a muscle group belonging to no tier, which typechecked
 * cleanly and was caught by exactly this kind of test.
 */
export function areasWithoutTrait(): readonly LifeArea[] {
  return LIFE_AREAS.filter((area) => traitForArea(area) === undefined)
}
