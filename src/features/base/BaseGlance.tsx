import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { PercentRing } from '@/components/shared/PercentRing'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { describeClear } from '@/domain/base/declutter'
import { currentNextAction } from '@/domain/projects/priority'
import type { Project } from '@/domain/projects/project'

import { useBaseProjects } from '../projects/hooks'
import { useHouse } from './hooks'

const ROW_LABEL = 'text-ink-500 text-xs font-medium tracking-wide uppercase'

/**
 * Base, at a glance — the same treatment Train and Codex already get on
 * Today. Asked for directly: *"could we add something from each section
 * to you/today like train/codex have? quests, base status, next
 * upgrade."* Quests and Vitals already had one; Base, the tech tree and
 * the map did not, which made the dashboard's promise — "a solid
 * at-a-glance dashboard with the ability to drill into each section" —
 * only half kept.
 *
 * **Two readings, not the full screen.** How clear the house is and
 * what job is furthest along — the same pairing `Declutter`'s own
 * summary row draws. `Declutter` still owns the room-by-room picture;
 * this owns the one sentence, plus the same headline ring `Declutter`
 * already draws for the identical number.
 *
 * **The ring is `lg` and up only, the same restriction `PercentRing`
 * already carries everywhere else it appears.** Asked for directly
 * against a screenshot of this exact card — *"lets make this page more
 * interesting with some sort of visual as well"* — after weighing it
 * against the glance card's own original reasoning: a ring here reads
 * as one more on a page that already has several. `PercentRing`'s
 * built-in `lg:` gate is what keeps that reasoning true on the phone
 * this card is mostly seen on, and turns it into extra texture only on
 * the wide screens with room to spare — the same trade `Declutter`
 * itself already makes for its own ring.
 *
 * **The job named is the one already open, not the highest priority.**
 * `JobRow` on Base itself ranks by what has actually been started
 * rather than by impact — you did not choose for the tap to leak — and
 * this glance reads the same list in the same order rather than
 * inventing a second ranking for one line of text.
 *
 * **The job's name leads and its next step follows.** Reported against
 * a card reading only _"Roof"_ — a job name alone says what is broken
 * and nothing about what to do next. `ArcSlot` already settled the
 * order, `Fix the porch roof · Find the right person`: name first, so a
 * truncated line keeps the half that tells jobs apart, since every hired
 * job opens on the same three steps.
 *
 * **Two labelled rows, Clutter and Projects, with a rule between.** It
 * was one sentence — _"The house is Lived in, 51% clear."_ — over a job
 * name, reported as reading oddly and as blurring two different things.
 * They are different: clutter is a level that moves both ways, a job is
 * a task that closes. The number leads its row and the band follows it,
 * the same number-then-word order `Declutter` uses.
 *
 * **Each row carries its own visual, in one column under Open.** With
 * one ring the card read lopsided — reported as asymmetrical. A second
 * ring then read as the same widget twice, so Projects draws `JobBars`.
 * Open is fixed at the column's width so all three share a centre line.
 */
/**
 * One bar per open job, each filled by its own steps.
 *
 * A second ring under the first read as the same widget twice — and a
 * share of steps pooled across every job hid the thing worth seeing,
 * which is that the roof is under way and the grill is untouched. Bars
 * side by side say how many jobs there are and how far each has got.
 * Same 56-pixel column as the ring and Open, and `lg` and up only, like
 * the ring. An untouched job keeps a dim stub so it still reads as a job.
 */
function JobBars({ jobs }: { readonly jobs: readonly Project[] }) {
  const shown = jobs.slice(0, 10).map((job) => {
    const done = job.actions.filter((action) => action.status === 'done').length
    return { job, progress: job.actions.length === 0 ? 0 : done / job.actions.length }
  })
  const described = shown
    .map(({ job, progress }) => `${job.name} ${String(Math.round(progress * 100))}%`)
    .join(', ')

  return (
    <div
      role="img"
      aria-label={`${String(jobs.length)} open jobs: ${described}`}
      className="hidden h-11 w-14 shrink-0 items-end justify-center gap-1 lg:flex"
    >
      {shown.map(({ job, progress }) => (
        <span key={job.id} className="bg-ink-800 relative h-full w-1 overflow-hidden rounded-full">
          <span
            className={
              progress === 0
                ? 'bg-ink-600 absolute inset-x-0 bottom-0 h-1 rounded-full'
                : 'bg-accent-500 absolute inset-x-0 bottom-0 rounded-full'
            }
            style={
              progress === 0 ? undefined : { height: `${String(Math.round(progress * 100))}%` }
            }
          />
        </span>
      ))}
    </div>
  )
}

export function BaseGlance() {
  const house = useHouse()
  const jobs = useBaseProjects()

  if (house.data === undefined || jobs.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-16" label="Loading Base" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    )
  }

  const open = jobs.data.filter((job) => job.status !== 'completed')
  const next = open[0]
  const step = next === undefined ? undefined : currentNextAction(next)

  return (
    <Card>
      <CardHeading
        icon={<Home size={16} aria-hidden />}
        title="Base"
        action={
          <Link
            viewTransition
            to="/base"
            className={`${buttonStyles({ variant: 'ghost', size: 'sm' })} w-14`}
          >
            Open
          </Link>
        }
      />

      <dl>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <dt className={ROW_LABEL}>Clutter</dt>
            <dd className="mt-0.5 text-sm">
              {house.data.clear === undefined ? (
                <span className="text-ink-500">No room read yet</span>
              ) : (
                <>
                  <span className="text-ink-50 font-medium">{String(house.data.clear)}% clear</span>
                  <span className="text-ink-300"> · {describeClear(house.data.clear)}</span>
                </>
              )}
            </dd>
          </div>

          {house.data.clear !== undefined && (
            <PercentRing
              value={house.data.clear}
              good={house.data.clear >= 70}
              label={`Clutter: ${String(house.data.clear)}% clear, ${describeClear(house.data.clear)}`}
            />
          )}
        </div>

        <div className="border-ink-800 mt-3 flex items-center gap-3 border-t pt-3">
          <div className="min-w-0 flex-1">
            <dt className={ROW_LABEL}>Projects</dt>
            <dd className="mt-0.5 truncate text-sm">
              {next === undefined ? (
                <span className="text-ink-500">No open jobs</span>
              ) : (
                <>
                  <span className="text-ink-50 font-medium">{next.name}</span>
                  {step !== undefined && (
                    <span className="text-ink-300"> · {step.description}</span>
                  )}
                </>
              )}
            </dd>
          </div>

          {open.length > 0 && <JobBars jobs={open} />}
        </div>
      </dl>
    </Card>
  )
}
