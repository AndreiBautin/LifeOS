import { buildAvatar, type Avatar } from '@/domain/game/avatar'
import { seasonOf } from '@/domain/game/season'

import { characterSheet, type SheetDeps } from './sheet'

/**
 * The portrait, assembled from the sheet it portrays.
 *
 * Deliberately built *on top of* `characterSheet` rather than beside it.
 * Reading the stores again and re-deriving XP would be a second
 * implementation of the tally, and the two would disagree the first time
 * either changed — the avatar claiming level 12 on a page that says 11
 * is a small bug with no obvious cause and no obvious owner.
 *
 * The season comes from the clock rather than from `seasonProgressFor`,
 * because all that is wanted here is *which* season it is. Pulling the
 * whole progress read model for one enum would make the portrait pay for
 * a comparison against last season that it never shows.
 */
export async function avatarFor(deps: SheetDeps): Promise<Avatar> {
  const [sheet, upgrades] = await Promise.all([characterSheet(deps), deps.upgrades.all()])

  return buildAvatar({
    standing: sheet.standing,
    areas: sheet.areas.map((area) => ({ area: area.area, name: area.name, xp: area.xp })),
    upgrades,
    season: seasonOf(deps.clock.now()).season,
  })
}
