import { Skeleton } from '@/components/shared/Skeleton'

import { Badge, Card } from '@/components/shared/primitives'

import { AvatarPortrait } from './AvatarPortrait'
import { useAvatar } from './hooks'

/**
 * The portrait, with the two things it is a portrait *of*.
 *
 * What you do most of, and what you are carrying. Both are shown as
 * words beside the figure rather than drawn onto it, and both are
 * evidence rather than labels: the first is a share of your XP with the
 * area named, the second names the actual upgrades. There was a word
 * for the first — "Athlete", "Devotee" — and it is gone; the sentence
 * that made it checkable is what was worth keeping.
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

  const { mainstay, gear, gearCount, into, needed } = avatar.data

  return (
    <Card>
      <div className="flex items-center gap-4">
        <AvatarPortrait avatar={avatar.data} />

        <div className="min-w-0 flex-1">
          {/*
            The one line that used to sit under a derived title, and now
            stands on its own. It is a *share* with the area named, so it
            can be weighed against the XP breakdown rather than taken on
            trust — which is why it outlived the word above it.
          */}
          <p className="text-ink-300 text-sm">
            {mainstay === undefined ? (
              // Absent, never a nought-per-cent reading. Nothing has been
              // done yet, which is a different statement from none of it
              // having been training.
              'Do something and this becomes what you do most of.'
            ) : (
              <>
                {Math.round(mainstay.share * 100)}% of your XP is {mainstay.areaName.toLowerCase()}
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
          **The wishlist and the two links are gone from this card.**
          Asked for as *"I don't really have anything in gear that I want
          right now and don't foresee typing progress to that — let's get
          rid of it, and maybe move tech tree out of the initial hero
          card."*

          The wishlist read the gear shelf alone, so it went with the
          shelf. The links went because this card is a **portrait** — who
          you are and what you are carrying — and two navigation buttons
          at the bottom of it made the first thing on the screen half a
          menu. Both screens are still one tap away in *Areas*, which is
          the list that exists for exactly this and repeats none of the
          numbers above.
        */}
      </div>
    </Card>
  )
}
