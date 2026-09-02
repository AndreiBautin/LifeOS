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
   * What it is, in the terms of what fed it.
   *
   * On the screen beside the bar, because a bar labelled "Charisma" with
   * no source is the invented scale this whole design is avoiding. The
   * sentence names the acts.
   */
  readonly blurb: string
  /** The areas whose XP this trait re-presents. */
  readonly areas: readonly LifeArea[]
}

/**
 * Eight traits over eleven areas, and every bundle is defensible in a
 * sentence.
 *
 * Six was the target, because six is what an RPG character sheet has —
 * and forcing eleven areas into six meant bundling things whose only
 * shared property was needing somewhere to go, which is invented
 * structure wearing a familiar name. Where a bundle *is* natural it is
 * made: a house job, a quest step and an upgrade are all Craft, and a
 * job application and a pound saved are both Fortune. Where it is not,
 * the trait stands alone.
 */
export const TRAITS: readonly TraitDefinition[] = [
  {
    id: 'strength',
    label: 'Strength',
    blurb: 'Sessions finished and sets logged',
    areas: ['training'],
  },
  {
    id: 'intellect',
    label: 'Intellect',
    blurb: 'Books and courses worked through, and problems practised',
    areas: ['backlog', 'mind'],
  },
  {
    id: 'discipline',
    label: 'Discipline',
    blurb: 'Habits kept, limits held, and the season taken up on its offers',
    /*
     * **`vitals` is here because Vitality was deleted, not because the
     * bundle got looser.** Vitality's only area was `vitals`, and that
     * area stopped paying anything the moment upkeep became a `group`
     * label rather than a home: brushing pays `dailies.completed` now,
     * and what is left under `vitals` is the limits, which measure and
     * pay nothing.
     *
     * A trait fed by nothing is worse than one merely unproven. The
     * sheet keeps unproven bars on purpose — "eight bars with three
     * empty says where the time is going" — but that argument is about
     * a bar somebody could still fill. One that **cannot** be filled by
     * any act in the app is furniture, and it would sit at "Nothing yet"
     * for the life of the app while the XP it described appeared under
     * Discipline.
     *
     * The partition still has to be total, so `vitals` needs a trait
     * whether or not it pays: `traits.test.ts` asserts every area has
     * exactly one. Discipline is the honest home for it — staying under
     * a limit and keeping a habit are the same kind of thing, and the
     * upkeep XP lands here anyway now.
     */
    /*
     * **`challenges` is here because deliberateness is the shared
     * thread, and it was the closest of seven rather than an obvious
     * one.** A seasonal challenge is explicitly *not* an ordinary day,
     * which is what the rest of this trait is about — so the case is
     * narrower than the bundle looks: keeping a habit and carving a
     * pumpkin in the week it is worth carving one are both doing a thing
     * you meant to do rather than letting it pass.
     *
     * The alternatives were worse. Craft is things built and bought,
     * Charisma is people seen, and a trait of its own would be an eighth
     * bar fed by one act. If challenges ever grow past a seasonal list,
     * this is the assignment to revisit first.
     */
    areas: ['dailies', 'vitals', 'challenges'],
  },
  {
    id: 'craft',
    label: 'Craft',
    blurb: 'Things built, fixed and bought — quests, the house, the tree',
    areas: ['projects', 'base', 'upgrades'],
  },
  {
    /*
     * Fed by one act, and that is worth knowing rather than fixing.
     * Finance deliberately declares no acts — typing in your net worth
     * is a *measurement*, and paying XP for the number going up would be
     * paying for an outcome — so Fortune moves only when an application
     * is sent. The area belongs here regardless: leaving it out of the
     * partition would mean an area with no trait, which is the gap the
     * guard test exists to catch.
     */
    id: 'fortune',
    label: 'Fortune',
    blurb: 'Applications sent. Money is measured here, not earned',
    areas: ['jobs', 'finance'],
  },
  {
    id: 'wayfaring',
    label: 'Wayfaring',
    blurb: 'Ground covered and places marked',
    areas: ['places'],
  },
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
