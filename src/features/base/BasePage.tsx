import { Flame, Undo2, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { DailyView } from '@/application/use-cases/dailies/dailies'
import type { Project } from '@/domain/projects/project'
import { cn } from '@/lib/cn'

import { useKeepToday, useUndoToday } from '../today/dailies-hooks'
import { useChores } from '../today/dailies-hooks'
import { useBaseProjects, useMoveProjectHome } from '../projects/hooks'
import { useUpgradeTree } from '../upgrades/hooks'

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
  const keep = useKeepToday()
  const undo = useUndoToday()

  const { daily, doneToday, expectedToday } = view

  return (
    <div className="flex items-center gap-3 py-2">
      <Button
        variant={doneToday ? 'primary' : 'outline'}
        aria-label={doneToday ? `Undo ${daily.title}` : `Mark ${daily.title} done`}
        aria-pressed={doneToday}
        disabled={keep.isPending || undo.isPending}
        onClick={() => {
          if (doneToday) undo.mutate(daily.id)
          else keep.mutate(daily.id)
        }}
      >
        {doneToday ? '✓' : ''}
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
        {!expectedToday && <p className="text-ink-700 text-xs">Not due today</p>}
      </div>

      {view.streak > 0 && (
        <span className="text-ink-500 numeric flex items-center gap-1 text-xs">
          <Flame size={12} aria-hidden />
          {view.streak}
        </span>
      )}
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

export function BasePage() {
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
      <header>
        <h1 className="text-ink-50 text-2xl font-semibold">Base</h1>
        <p className="text-ink-500 text-sm">The place you live, and what it is asking for</p>
      </header>

      <Section title="Chores" description="What the house wants today">
        <Card>
          {chores.data === undefined ? null : dueChores.length === 0 && otherChores.length === 0 ? (
            <Empty title="No chores yet">
              Add one from Today — anything on a daily, weekly or monthly cadence.
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

      <Section title="Upgrades" description="Things for the place rather than for you">
        <Card>
          {upgrades.data === undefined ? null : upgrades.data.length === 0 ? (
            <Empty title="Nothing on the list">
              Upgrades marked as Base appear here; the rest stay on the tech tree.
            </Empty>
          ) : (
            <ul className="space-y-1.5">
              {upgrades.data.map((entry) => (
                <li key={entry.upgrade.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">
                    {entry.upgrade.title}
                  </span>
                  <Badge tone={entry.upgrade.status === 'purchased' ? 'good' : 'neutral'}>
                    {entry.upgrade.status === 'purchased' ? 'Owned' : 'Wanted'}
                  </Badge>
                </li>
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
