import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/shared/Skeleton'

import { AvatarPortrait } from './AvatarPortrait'
import { useAvatar } from './hooks'

/**
 * The portrait in Today's header, as a way through to the sheet.
 *
 * Compact and without its gear, because Today is present tense and a
 * character sheet is standing: what belongs on this screen is the
 * glance — who you are, how far through the level — and the readout
 * belongs one tap away.
 *
 * It renders nothing at all until the query lands, rather than a
 * placeholder ring. An empty ring that fills a moment later reads as
 * progress being lost and regained.
 */
export function TodayAvatar() {
  const avatar = useAvatar()

  /*
   * A circle of the right size rather than nothing, because this one is
   * in the page header: an absent portrait let the title sit left, and
   * it slid across as soon as the query landed.
   */
  if (avatar.data === undefined) return <Skeleton className="h-14 w-14 rounded-full" />

  return (
    <Link
      to="/character"
      aria-label="Your character sheet"
      className="tap-target flex shrink-0 items-center"
    >
      <AvatarPortrait avatar={avatar.data} compact />
    </Link>
  )
}
