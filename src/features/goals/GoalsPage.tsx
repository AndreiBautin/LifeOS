import { Flag, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, Empty } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { GoalStanding } from '@/domain/goals/goal'

import { useAddGoal, useGoals } from './hooks'

/**
 * Complex, multi-branch goals — a relocation, a career change, anything
 * with several workstreams running at once and real uncertainty in more
 * than one of them.
 *
 * **Not a second quest log.** A project's steps are a to-do list and a
 * campaign's stages are one measured chain; a goal is neither, because
 * "where do we want to live" and "can we afford it" are not steps in a
 * sequence, they are separate questions that can each be blocked,
 * answered or ruled out on their own schedule. See `domain/goals/goal.ts`
 * for the full case against forcing this into either existing shape.
 *
 * **Pays no XP**, on the same footing as a campaign — this is a planning
 * surface, not a scored area.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'

function GoalCard({ standing }: { readonly standing: GoalStanding }) {
  const { goal, resolved, total } = standing

  return (
    <Link to={`/goals/${goal.id}`}>
      <Card className="hover:brightness-110">
        <p className="text-ink-50 font-medium">{goal.name}</p>
        {goal.aim !== undefined && goal.aim.trim() !== '' && (
          <p className="text-ink-500 mt-0.5 text-sm">{goal.aim}</p>
        )}
        {total === 0 ? (
          <p className="text-ink-700 mt-2 text-xs">Nothing added yet</p>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-ink-500 text-xs">
                {resolved} of {total} settled
              </p>
              {resolved === total && <Badge tone="good">Fully settled</Badge>}
            </div>
            <Meter
              className="mt-1.5"
              value={resolved}
              of={total}
              height={5}
              label={`${goal.name}, ${String(resolved)} of ${String(total)} settled`}
            />
          </>
        )}
      </Card>
    </Link>
  )
}

function AddGoal({ onDone }: { readonly onDone: () => void }) {
  const add = useAddGoal()
  const [name, setName] = useState('')
  const [aim, setAim] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          add.mutate({ name, aim }, { onSuccess: onDone })
        }}
      >
        <label className="block">
          <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">
            What it is called
          </span>
          <input
            className={FIELD}
            placeholder="Move somewhere new"
            value={name}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
        </label>
        <label className="block">
          <span className="text-ink-500 mb-1 block text-xs tracking-wide uppercase">
            Where it ends · not the first step
          </span>
          <input
            className={FIELD}
            placeholder="Somewhere we actually want to live"
            value={aim}
            onChange={(event) => {
              setAim(event.target.value)
            }}
          />
        </label>
        <p className="text-ink-700 text-xs">
          Starts empty. Add the facts, the open questions and the decisions once it exists — a goal
          this shape is rarely the same as the last one, so there is no template to offer.
        </p>
        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Start it
        </Button>
      </form>
    </Card>
  )
}

export function GoalsPage() {
  const goals = useGoals()
  const [adding, setAdding] = useState(false)
  const standings = goals.data ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Goals"
        subtitle="Several workstreams at once — what is decided, what is still open, and what is waiting on what."
      />

      {standings.length === 0 && goals.data !== undefined ? (
        adding ? (
          <AddGoal
            onDone={() => {
              setAdding(false)
            }}
          />
        ) : (
          <Card>
            <Empty title="No complex goals yet">
              <span className="block">
                For the kind of thing that is not a single to-do list — several parallel questions,
                some of them blocked on each other, most of them not yet decided.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setAdding(true)
                }}
              >
                <Flag size={14} aria-hidden />
                Start one
              </Button>
            </Empty>
          </Card>
        )
      ) : (
        <>
          <div className="space-y-2">
            {standings.map((standing) => (
              <GoalCard key={standing.goal.id} standing={standing} />
            ))}
          </div>

          {adding ? (
            <AddGoal
              onDone={() => {
                setAdding(false)
              }}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(true)
              }}
            >
              <Plus size={14} aria-hidden />
              Another goal
            </Button>
          )}
        </>
      )}
    </div>
  )
}
