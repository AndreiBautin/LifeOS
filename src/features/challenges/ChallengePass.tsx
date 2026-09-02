import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Button, Empty } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { Challenge } from '@/domain/challenges/challenge'

import {
  useAddChallenge,
  useChallenges,
  useCompleteChallenge,
  useHideChallenge,
  useUncompleteChallenge,
} from './hooks'

/*
 * The same field styling the other add forms use. Copied rather than
 * shared because it is a class string in five places already and
 * extracting it is a sweep of its own, not a thing to do in passing.
 */
const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'

/**
 * The season's challenges, and the pass they fill.
 *
 * **The bar has a real denominator**, which is the whole reason this
 * exists in a model that refuses invented scales: it is challenges done
 * over challenges that exist, not XP against tiers the app chose. A
 * battle pass's usual hundred numbered tiers would be exactly the "scale
 * the app can move" `domain/game/season.ts` rejects in writing.
 *
 * **It sits with the season because it is scoped to one.** A challenge
 * belongs to Autumn 2026 and stops mattering when that ends, which is
 * the same window the bar beneath it measures.
 */
function ChallengeRow({ challenge }: { readonly challenge: Challenge }) {
  const complete = useCompleteChallenge()
  const uncomplete = useUncompleteChallenge()
  const hide = useHideChallenge()

  const done = challenge.completedAt !== undefined

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/*
        **A box, empty or ticked — never an icon that means "press me".**
        The rule this app learned on quest steps: an icon that changes
        between two actions cannot also be the record of which state you
        are in, and the wrong reading is the first one anybody takes.
      */}
      <button
        type="button"
        aria-label={done ? `Undo ${challenge.title}` : `Finished ${challenge.title}`}
        aria-pressed={done}
        /*
          The same control `DailyRow` draws, down to the size and the
          icon. Both are "a thing you did today or did not", and a second
          look for the same question is how two lists start feeling like
          two apps.
        */
        className={[
          'tap-target grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
          done
            ? 'border-good-500 bg-good-500/15 text-good-500'
            : 'border-ink-700 text-ink-700 hover:border-ink-500',
        ].join(' ')}
        onClick={() => {
          if (done) uncomplete.mutate(challenge.id)
          else complete.complete(challenge.id)
        }}
      >
        {done && <Check size={18} aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={done ? 'text-ink-500 text-sm line-through' : 'text-ink-100 text-sm'}>
          {challenge.title}
        </p>
        {challenge.blurb !== undefined && (
          <p className="text-ink-700 mt-0.5 text-xs">{challenge.blurb}</p>
        )}
      </div>

      <button
        type="button"
        aria-label={`Remove ${challenge.title}`}
        className="text-ink-700 hover:text-ink-300 tap-target shrink-0"
        onClick={() => {
          hide.mutate(challenge.id)
        }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

/**
 * Grouped by event, so Halloween reads as Halloween.
 *
 * Own challenges have no event and come last under their own heading —
 * the shape the dailies list already uses for its ungrouped run, except
 * that this one *is* named, because "yours" is a thing you chose rather
 * than the leftovers.
 */
function grouped(challenges: readonly Challenge[]): readonly [string, readonly Challenge[]][] {
  const order: string[] = []
  const byEvent = new Map<string, Challenge[]>()

  for (const one of challenges) {
    const key = one.event ?? 'Yours'
    if (!byEvent.has(key)) {
      byEvent.set(key, [])
      order.push(key)
    }
    byEvent.get(key)?.push(one)
  }

  return order.map((key) => [key, byEvent.get(key) ?? []])
}

export function ChallengePass() {
  const pass = useChallenges()
  const add = useAddChallenge()
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const data = pass.data
  if (data === undefined) return null

  /*
   * **A band, not a card.** Asked for as _"let's group together the
   * season challenges and progress into one card so that it's a distinct
   * season section."_ The pass and the season's XP are two readings of
   * one season, so two cards under one heading drew the boundary in the
   * wrong place — the same argument that merged the portrait, the season
   * and the traits into `SheetCard`.
   *
   * The card is the caller's, which is what lets it put the rule between
   * the two bands rather than each band guessing what follows it.
   */
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-500 text-sm">Challenges done</span>
        <span className="numeric text-ink-50 text-sm font-semibold">
          {data.done}
          <span className="text-ink-500 font-normal"> / {data.total}</span>
        </span>
      </div>

      {/*
        `of` is the count of challenges that exist — a denominator taken
        from the list below rather than a threshold. `Meter` requires both
        numbers precisely so a call site cannot hide what it divides by,
        and this one has nothing to hide.
      */}
      <Meter
        className="mt-2"
        value={data.done}
        of={data.total}
        tone={data.total > 0 && data.done === data.total ? 'good' : 'accent'}
        glow
        label={`${String(data.done)} of ${String(data.total)} challenges finished`}
      />

      <div className="mt-3 space-y-3">
        {data.challenges.length === 0 ? (
          <Empty title="Nothing this season">
            <p>Add something you mean to do before it turns.</p>
          </Empty>
        ) : (
          grouped(data.challenges).map(([event, list]) => (
            <div key={event}>
              <p className="text-ink-500 text-xs">{event}</p>
              <div className="divide-ink-850 divide-y">
                {list.map((one) => (
                  <ChallengeRow key={one.id} challenge={one} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/*
        Folded away, the rule the dailies add form follows: a form left
        standing open on a screen that is mostly read reads as furniture,
        and one you open is one you finish.
      */}
      <div className="border-ink-850 mt-3 border-t pt-3">
        {adding ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (title.trim() === '') return
              add.mutate(title, {
                onSuccess: () => {
                  setTitle('')
                  setAdding(false)
                },
              })
            }}
          >
            <input
              className={FIELD}
              value={title}
              autoFocus
              aria-label="A challenge of your own"
              placeholder="Something to do before the season turns"
              onChange={(event) => {
                setTitle(event.target.value)
              }}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" full disabled={add.isPending}>
                Add it
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false)
                  setTitle('')
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="ghost"
            full
            onClick={() => {
              setAdding(true)
            }}
          >
            <Plus size={16} aria-hidden />
            Add your own
          </Button>
        )}
      </div>
    </div>
  )
}
