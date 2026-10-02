import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Masonry } from '@/components/shared/Masonry'
import { buttonStyles } from '@/components/shared/styles'
import { ActivityHeatmap } from '@/features/character/ActivityHeatmap'
import { SheetCard } from '@/features/character/SheetCard'
import { NextSessionCard } from '@/features/train/NextSessionCard'

import { SampleNotice } from './SampleNotice'

/**
 * Who you are as a lifter, and what today's session is.
 *
 * **Three cards, because the app is a workout tracker now.** Asked for as
 * _"fully lean into this simply being a gamified workout tracker"_, after
 * every other area turned out to be done better by an app that already
 * does it — a streaming queue, a calendar, a wishlist, Notion. The page
 * kept its shape and lost its glances: the character sheet, the next
 * session, and the activity grid, which between them say how you are
 * doing, what to do next, and whether you have been doing it.
 *
 * **The cards are balanced by measured height, not assigned to columns.**
 * `Masonry` takes as many ~360px columns as the width holds and drops
 * each card into the shortest one, so it balances at every width, and on
 * a phone it is a single stack in this order.
 */
export function HomePage() {
  return (
    <>
      <SampleNotice />
      <Masonry
        items={[
          {
            key: 'you',
            node: (
              <SheetCard
                avatarSize="large"
                action={
                  <Link
                    viewTransition
                    to="/settings"
                    aria-label="Settings"
                    className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                  >
                    <Settings size={16} aria-hidden />
                  </Link>
                }
              />
            ),
          },
          { key: 'session', node: <NextSessionCard compact /> },
          { key: 'activity', node: <ActivityHeatmap /> },
        ]}
      />
    </>
  )
}
