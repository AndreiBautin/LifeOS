import { Link } from 'react-router-dom'

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

  if (avatar.data === undefined) return null

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
