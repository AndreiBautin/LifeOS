import { Shirt, Wrench } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { Link } from 'react-router-dom'

import { Badge, Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { formatMinorUnits } from '@/domain/upgrades/upgrade'
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

  if (avatar.data === undefined) {
    return (
      <Card>
        <div className="flex items-center gap-4">
          <Skeleton className="h-[120px] w-[120px] rounded-full" label="Loading your character" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-3 h-5 w-20" />
          </div>
        </div>
      </Card>
    )
  }

  const { calling, gear, gearCount, into, needed, wanted, wantedBeyond } = avatar.data

  return (
    <Card>
      <div className="flex items-center gap-4">
        <AvatarPortrait avatar={avatar.data} />

        <div className="min-w-0 flex-1">
          {/*
            No name here any more — the header carries it. What stays is
            the *evidence*, which is the half worth keeping beside the
            figure: somebody who distrusts "Devotee" can read that it
            means 83% of everything earned came from dailies, and that is
            the difference between a label and a claim.
          */}
          <p className="text-ink-300 text-sm">
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
        The number stays out; the sentence folds away.

        Reported as *"the blurb underneath the avatar might be overkill,
        explaining everything"*, and that is fair — it is a rule, and a
        rule is worth reading once rather than every morning on the
        screen you open most. Deleting it would be worse: it is the
        sentence that stops XP being mistaken for a measure of how well
        anything went, and somebody meeting the number for the first
        time still needs it. A disclosure keeps both.
      */}
      <details className="group mt-3">
        <summary className="text-ink-500 marker:content-none flex cursor-pointer list-none items-baseline gap-1.5 text-xs">
          <span className="numeric">{xp} XP all time</span>
          <span className="text-ink-700 group-open:hidden">— what counts?</span>
        </summary>
        <p className="text-ink-700 mt-1.5 text-xs">
          Across everything you track. Paid for doing the thing, never for it having worked —
          getting stronger moves a ladder, and paying it twice is how a number stops being a record
          of effort.
        </p>
      </details>

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

        {/*
          The other half of an inventory: what you mean to carry.

          **The gear shelf only**, which is a deliberate asymmetry with
          the equipped list above — that counts both non-house shelves,
          because a phone is a thing you carry and somebody whose
          purchases are all tech would otherwise have an empty portrait.
          A wishlist has no such problem: wanted tech already has a
          screen that does it better, with gates, prerequisites and a
          budget, so repeating it here would add nothing and make
          "gear" mean something else.

          Silent when there is nothing on it. An empty "Wanted" heading
          is a prompt to go shopping, which is not what a character sheet
          is for.
        */}
        {wanted.length > 0 && (
          <div className="border-ink-800 mt-3 border-t pt-3">
            <p className="text-ink-700 mb-1.5 text-xs tracking-wide uppercase">Wanted</p>
            <ul className="space-y-1">
              {wanted.map((item) => (
                <li key={item.title} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-300 min-w-0 truncate text-sm">{item.title}</span>
                  <span className="text-ink-700 numeric shrink-0 text-xs">
                    {item.costMinorUnits === undefined
                      ? item.slot
                      : formatMinorUnits(item.costMinorUnits)}
                  </span>
                </li>
              ))}
            </ul>
            {wantedBeyond > 0 && (
              <p className="text-ink-700 mt-1.5 text-xs">
                and {wantedBeyond} more on the gear shelf
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex gap-1.5">
          <Link to="/gear" className={cn(buttonStyles({ variant: 'ghost', size: 'sm' }), 'flex-1')}>
            <Shirt size={14} aria-hidden />
            Gear
          </Link>
          <Link
            to="/upgrades"
            className={cn(buttonStyles({ variant: 'ghost', size: 'sm' }), 'flex-1')}
          >
            <Wrench size={14} aria-hidden />
            Tech tree
          </Link>
        </div>
      </div>
    </Card>
  )
}
