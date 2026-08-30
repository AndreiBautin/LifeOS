import { Flame, Plus, Undo2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Link } from 'react-router-dom'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { DailyView } from '@/application/use-cases/dailies/dailies'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import { BASE } from '@/domain/base/base'
import { cn } from '@/lib/cn'

import { useKeepToday, useMoveDailyHome, useUndoToday } from '../today/dailies-hooks'
import { AddDaily } from '../today/Dailies'
import { useChores } from '../today/dailies-hooks'
import { useBaseProjects, useMoveProjectHome } from '../projects/hooks'
import { useAddUpgrade, useMoveUpgradeHome, useUpgradeTree } from '../upgrades/hooks'

/**
 * Base: the place you live, and everything it asks of you.
 *
 * Three kinds of thing, none of them new. A leaking tap is a project with
 * steps, a weekly hoover is a daily on a cadence, a new dishwasher is an
 * upgrade with a price — and the app already knows how to store all
 * three. What Base changes is where they appear.
 *
 * House work has a different rhythm from the rest of a quest log. It
 * arrives when something breaks rather than when you decide to do it, it
 * is mostly the same errand each time — find the right person, get them
 * to come — and it never finishes. Mixed into the quest list it crowds
 * out the things somebody actually chose; on its own screen it reads as
 * maintenance, which is what it is.
 *
 * The ordering is deliberate and matches Today's: **what is due, then
 * what is open, then what is wanted.** Chores first because they are the
 * part with a deadline today; jobs next because they are the part that
 * stalls; upgrades last because wanting a dishwasher is not a task.
 */

function ChoreRow({ view }: { readonly view: DailyView }) {
  const keep = useKeepToday(view.daily.belongsTo)
  const undo = useUndoToday()
  const moveHome = useMoveDailyHome()

  const { daily, doneToday, expectedToday, doneCount, needed } = view

  return (
    <div className="flex items-center gap-3 py-2">
      {/*
        Counts rather than toggles when the chore asks for more than one —
        letting the dog out is the case this exists for, and a tap at the
        second time of day has to record a third rather than undo the
        first. It only becomes an undo once the day is full.
      */}
      <Button
        variant={doneToday ? 'primary' : 'outline'}
        aria-label={
          doneToday
            ? `Undo ${daily.title}`
            : needed > 1
              ? `Log ${daily.title}, ${String(doneCount)} of ${String(needed)} done`
              : `Mark ${daily.title} done`
        }
        aria-pressed={doneToday}
        disabled={keep.isPending || undo.isPending}
        onClick={() => {
          if (doneToday) undo.mutate(daily.id)
          else keep.mutate(daily.id)
        }}
      >
        {doneToday ? '✓' : needed > 1 ? `${String(doneCount)}/${String(needed)}` : ''}
      </Button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm',
            doneToday ? 'text-ink-500 line-through' : 'text-ink-50',
          )}
        >
          {daily.title}
        </p>
        {needed > 1 && expectedToday && (
          <p className="text-ink-700 text-xs">
            {doneCount} of {needed} today
          </p>
        )}
        {!expectedToday && <p className="text-ink-700 text-xs">Not due today</p>}
      </div>

      {view.streak > 0 && (
        <span className="text-ink-500 numeric flex items-center gap-1 text-xs">
          <Flame size={12} aria-hidden />
          {view.streak}
        </span>
      )}

      {/* The way back out, so a chore filed here by mistake is one tap
          from Today rather than a re-create — the days it has been kept
          on are the whole value of the record. */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Move ${daily.title} back to Today`}
        disabled={moveHome.isPending}
        onClick={() => {
          moveHome.mutate({ id: daily.id, home: undefined })
        }}
      >
        <Undo2 size={14} aria-hidden />
      </Button>
    </div>
  )
}

/**
 * A house job, shown by what is left rather than by score.
 *
 * The quest log ranks by impact, urgency and effort, which is the right
 * question when you are choosing what to start. It is the wrong one here:
 * you did not choose for the boiler to fail, and a ranking would tell you
 * the leak matters more than the draught, which you already knew. What
 * you need is which of them you have actually begun.
 */
function JobRow({ project }: { readonly project: Project }) {
  const moveHome = useMoveProjectHome()
  const open = project.actions.filter((action) => action.status !== 'done')
  const next = open[0]

  return (
    <li className="border-ink-800 border-b py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-50 min-w-0 flex-1 truncate text-sm font-medium">
          {project.name}
        </span>
        <span className="text-ink-500 numeric shrink-0 text-xs">
          {project.actions.length - open.length}/{project.actions.length}
        </span>
        {/* The way back out, so a thing filed here by mistake is one tap
            from the quest log rather than a re-create. */}
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Move ${project.name} back to Quests`}
          disabled={moveHome.isPending}
          onClick={() => {
            moveHome.mutate({ id: project.id, home: undefined })
          }}
        >
          <Undo2 size={14} aria-hidden />
        </Button>
      </div>
      {next !== undefined && (
        <p className="text-ink-500 mt-0.5 text-xs">Next: {next.description}</p>
      )}
    </li>
  )
}

/**
 * A house upgrade, with the way back to the tech tree.
 *
 * Read-only otherwise, and deliberately: an upgrade carries a price, a
 * priority and a prerequisite, and a second editor for those on this
 * screen would be a second place for the gate rules to be got wrong. The
 * tree owns editing; Base owns the filing.
 */
function UpgradeRow({ upgrade }: { readonly upgrade: Upgrade }) {
  const moveHome = useMoveUpgradeHome()

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">{upgrade.title}</span>
      <Badge tone={upgrade.status === 'purchased' ? 'good' : 'neutral'}>
        {upgrade.status === 'purchased' ? 'Owned' : 'Wanted'}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Move ${upgrade.title} back to the tech tree`}
        disabled={moveHome.isPending}
        onClick={() => {
          moveHome.mutate({ id: upgrade.id, home: undefined })
        }}
      >
        <Undo2 size={14} aria-hidden />
      </Button>
    </li>
  )
}

/**
 * Adding something the house needs, without leaving the house.
 *
 * A title and a rough cost, and nothing else. That is the deliberate
 * half of the coupling: the record, the wallet and the gates are shared
 * with the tech tree — a dishwasher and a barbell compete for the same
 * money, and two sets of gate rules would be two places for the cycle
 * bug to live — while the *screens* are not. Wanting a new washing
 * machine should not mean opening a page about barbells.
 *
 * Prerequisites, categories and priority stay on the tree, which is
 * where an upgrade is *edited*. Those are the parts a second form would
 * genuinely duplicate; a name and a price are not.
 */
function AddHouseUpgrade({ onDone }: { readonly onDone: () => void }) {
  const add = useAddUpgrade()
  const [title, setTitle] = useState('')
  const [cost, setCost] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() === '') return

          const pounds = Number(cost)
          const minor =
            cost.trim() !== '' && Number.isFinite(pounds) && pounds > 0
              ? Math.round(pounds * 100)
              : undefined

          add.mutate(
            {
              title,
              belongsTo: BASE,
              // The house's own default, rather than the tree's "other".
              category: 'home',
              ...(minor === undefined ? {} : { estimatedCostMinorUnits: minor }),
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setTitle('')
                setCost('')
                onDone()
              },
            },
          )
        }}
      >
        <input
          className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm"
          value={title}
          aria-label="Something the house needs"
          placeholder="Something the house needs"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />

        <div className="flex gap-2">
          <input
            className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 numeric tap-target min-w-0 flex-1 rounded-xl border px-3 text-sm"
            inputMode="decimal"
            value={cost}
            aria-label="Roughly what it costs"
            placeholder="Roughly what it costs"
            onChange={(event) => {
              setCost(event.target.value)
            }}
          />
          <Button type="submit" variant="primary" disabled={add.isPending}>
            <Plus size={16} aria-hidden />
            Add
          </Button>
        </div>

        {add.data?.error !== undefined && (
          <p role="alert" className="text-bad-500 text-sm">
            {add.data.error}
          </p>
        )}
      </form>
    </Card>
  )
}

export function BasePage() {
  const [addingChore, setAddingChore] = useState(false)
  const [addingUpgrade, setAddingUpgrade] = useState(false)
  const chores = useChores()
  const jobs = useBaseProjects()
  /*
   * Ranked against an empty wallet, which shows the tree without claiming
   * anything is affordable. The Tech tree screen owns the budget control;
   * duplicating it here would be two places to set one number.
   */
  const upgrades = useUpgradeTree(0, 'base')

  const dueChores = (chores.data ?? []).filter((view) => view.dueToday || view.doneToday)
  const otherChores = (chores.data ?? []).filter((view) => !view.dueToday && !view.doneToday)

  return (
    <div className="space-y-4">
      <PageHeader title="Base" subtitle="The place you live, and what it is asking for" />

      <Section
        title="Chores"
        description="What the house wants today"
        action={
          <Button
            variant={addingChore ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setAddingChore(!addingChore)
            }}
          >
            {addingChore ? 'Close' : 'Add'}
          </Button>
        }
      >
        {addingChore && (
          <AddDaily
            home={BASE}
            placeholder="Something the house needs doing"
            onDone={() => {
              setAddingChore(false)
            }}
          />
        )}

        <Card>
          {chores.data === undefined ? null : dueChores.length === 0 && otherChores.length === 0 ? (
            <Empty title="No chores yet">
              Add one above — the hoovering, the bins, anything on a daily, weekly or monthly
              cadence.
            </Empty>
          ) : (
            <>
              <div className="divide-ink-800 divide-y">
                {dueChores.map((view) => (
                  <ChoreRow key={view.daily.id} view={view} />
                ))}
              </div>

              {otherChores.length > 0 && (
                <div className="border-ink-800 mt-2 border-t pt-2">
                  <p className="text-ink-700 mb-1 text-xs tracking-wide uppercase">Not due today</p>
                  <div className="divide-ink-800 divide-y">
                    {otherChores.map((view) => (
                      <ChoreRow key={view.daily.id} view={view} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </Section>

      <Section title="Jobs" description="Things that need fixing, and who is coming">
        <Card>
          {jobs.data === undefined ? null : jobs.data.length === 0 ? (
            <Empty title="Nothing broken">
              House jobs are quests marked as Base. The usual shape is find the right person, get a
              quote, book the appointment.
            </Empty>
          ) : (
            <ul>
              {jobs.data.map((project) => (
                <JobRow key={project.id} project={project} />
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <Section
        title="Upgrades"
        description="Things for the place rather than for you"
        action={
          <Button
            variant={addingUpgrade ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setAddingUpgrade(!addingUpgrade)
            }}
          >
            {addingUpgrade ? 'Close' : 'Add'}
          </Button>
        }
      >
        {addingUpgrade && (
          <AddHouseUpgrade
            onDone={() => {
              setAddingUpgrade(false)
            }}
          />
        )}

        <Card>
          {upgrades.data === undefined ? null : upgrades.data.length === 0 ? (
            <Empty title="Nothing on the list">
              Add one above, or send something across from the tech tree. It shares the same wallet
              either way — a dishwasher and a barbell come out of the same money.
            </Empty>
          ) : (
            <ul className="space-y-1.5">
              {upgrades.data.map((entry) => (
                <UpgradeRow key={entry.upgrade.id} upgrade={entry.upgrade} />
              ))}
            </ul>
          )}

          <Link to="/upgrades" className={cn(buttonStyles({ variant: 'outline' }), 'mt-3 w-full')}>
            <Wrench size={16} aria-hidden />
            The rest of the tech tree
          </Link>
        </Card>
      </Section>
    </div>
  )
}
