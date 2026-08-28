import { Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { SEASON_LABELS } from '@/domain/game/season'
import { cn } from '@/lib/cn'

import { AvatarPortrait } from './AvatarPortrait'
import { useAvatar } from './hooks'

/**
 * The portrait, with the two things it is a portrait *of*.
 *
 * The calling and the gear are shown as words beside the figure rather
 * than drawn onto it, and both carry the evidence for themselves: the
 * calling states its share of your XP, and the gear names the actual
 * upgrades. Somebody who distrusts "Athlete" can see that it means 74%
 * of everything you have earned came from training — which is the
 * difference between a label and a claim.
 */
export function AvatarCard({ xp }: { readonly xp: number }) {
  const avatar = useAvatar()

  if (avatar.data === undefined) return null

  const { calling, gear, gearCount, into, needed, season } = avatar.data

  return (
    <Card>
      <div className="flex items-center gap-4">
        <AvatarPortrait avatar={avatar.data} />

        <div className="min-w-0 flex-1">
          <h2 className="text-ink-50 truncate text-lg font-semibold">
            {calling === undefined ? 'Unproven' : calling.title}
          </h2>

          <p className="text-ink-500 mt-0.5 text-sm">
            {calling === undefined ? (
              // Absent, never a default class. Nothing has been done yet,
              // which is a different statement from being a novice
              // anything.
              'Do something and this becomes what you do most of.'
            ) : (
              <>
                {Math.round(calling.share * 100)}% of your XP is {calling.areaName.toLowerCase()}
              </>
            )}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/*
              No level chip here. The section heading says it and the
              ring's own badge says it — a third copy of one number is
              how three figures start disagreeing after somebody edits
              one of them.
            */}
            <Badge>{SEASON_LABELS[season]}</Badge>
            {gearCount > 0 && (
              <Badge tone="cool">
                {gearCount} {gearCount === 1 ? 'item' : 'items'}
              </Badge>
            )}
          </div>

          <p className="text-ink-700 numeric mt-1.5 text-xs">
            {needed > 0
              ? `${String(into)} / ${String(needed)} XP into the level`
              : 'Top of the ladder'}
          </p>
        </div>
      </div>

      {/*
        Kept from the card this replaced, because it is the sentence that
        stops XP being mistaken for a measure of how well anything went.
      */}
      <p className="text-ink-500 mt-3 text-xs">
        {xp} XP all time, across everything you track. Paid for doing the thing, never for it having
        worked — getting stronger moves a ladder, and paying it twice is how a number stops being a
        record of effort.
      </p>

      {/*
        Gear is what you actually bought, grouped by the upgrade's own
        category. Purchased rather than wanted — a wishlist is not
        equipment — and yours rather than the house's, which is the split
        the Base screen already makes.
      */}
      <div className="border-ink-800 mt-4 border-t pt-3">
        {gear.length === 0 ? (
          <p className="text-ink-500 text-sm">
            Nothing equipped. Upgrades you mark as bought show up here — the house&rsquo;s stay on
            Base.
          </p>
        ) : (
          <dl className="space-y-2">
            {gear.map((slot) => (
              <div key={slot.category} className="flex items-baseline gap-3">
                <dt className="text-ink-700 w-20 shrink-0 text-xs tracking-wide uppercase">
                  {slot.label}
                </dt>
                <dd className="text-ink-300 min-w-0 flex-1 text-sm">{slot.items.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}

        <Link
          to="/upgrades"
          className={cn(buttonStyles({ variant: 'ghost', size: 'sm' }), 'mt-2 w-full')}
        >
          <Wrench size={14} aria-hidden />
          The tech tree
        </Link>
      </div>
    </Card>
  )
}
