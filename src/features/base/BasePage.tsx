import { Declutter } from './Declutter'
import { Hammer, Plus, Undo2, Wrench } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Link } from 'react-router-dom'

import { Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { EyeIcon } from '@/components/shared/EyeIcon'
import { buttonStyles } from '@/components/shared/styles'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import { BASE, JOB_APPROACHES, stepsFor, type JobApproach } from '@/domain/base/base'
import { UPGRADE_SHELF_LABELS, UPGRADE_SHELVES } from '@/domain/upgrades/shelf'
import { dropped, owned, wanted, wishlistTotal } from '@/domain/upgrades/wishlist'
import { formatMinorUnits, isOwned } from '@/domain/upgrades/upgrade'
import { cn } from '@/lib/cn'

import { useAddProject, useBaseProjects, useMoveProjectHome } from '../projects/hooks'
import { useAddUpgrade, useMoveUpgradeToShelf, useUpgradeTree } from '../upgrades/hooks'

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
  const move = useMoveUpgradeToShelf()

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">{upgrade.title}</span>
      {/*
        The cost, where there is one, in place of the badge that used to
        sit here. Under a heading that says "Wanted", a chip saying
        "Wanted" is noise — and the price is the thing you actually want
        to see beside a name you are saving for. Silent when there is no
        estimate rather than showing a nought, because an unpriced
        dishwasher is not a free one.
      */}
      {upgrade.estimatedCostMinorUnits !== undefined && !isOwned(upgrade) && (
        <span className="text-ink-700 numeric shrink-0 text-xs">
          {formatMinorUnits(upgrade.estimatedCostMinorUnits)}
        </span>
      )}
      {/*
        Off the house shelf, and now it has to say *which* other one.
        A single "back to the tech tree" button was right while there
        were two shelves; with three it would send a pair of boots to
        the machines.
      */}
      {UPGRADE_SHELVES.filter((shelf) => shelf !== 'base').map((shelf) => (
        <Button
          key={shelf}
          variant="ghost"
          size="sm"
          aria-label={`Move ${upgrade.title} to ${UPGRADE_SHELF_LABELS[shelf]}`}
          disabled={move.isPending}
          onClick={() => {
            move.mutate({ id: upgrade.id, shelf })
          }}
        >
          <span className="text-xs">{UPGRADE_SHELF_LABELS[shelf]}</span>
        </Button>
      ))}
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

/**
 * A house job, created here rather than in the quest log.
 *
 * Adding one meant opening the Quests page, typing it among the things
 * you chose to do, and coming back to move it — the same round trip
 * already removed from chores and from upgrades, and left in place here.
 * Third instance of one shape.
 *
 * **The steps arrive with it**, and there are two sets of them.
 * Hiring somebody is find the right person, get a quote, book the
 * appointment — the errand this module has described in prose since it
 * was written. Doing it yourself is work out what it needs, get the
 * materials, do the work.
 *
 * **The approach is chosen before the steps are shown**, because on a
 * job you handle yourself all three hiring steps are wrong: there is
 * nobody to find, nothing to quote and no appointment. Leaving one list
 * and asking somebody to un-tick their way to the other would be the
 * form arguing with itself, and it is what made the template useless for
 * half the jobs.
 *
 * Ticked, not forced, either way. A boiler service the landlord books
 * skips the first two — an offer, the same stance every other default in
 * this app takes.
 */
function AddJob({ onDone }: { readonly onDone: () => void }) {
  const add = useAddProject()
  const [name, setName] = useState('')
  /*
   * Hiring is the default because it is the common case this screen was
   * built around — house work "arrives when something breaks, and it is
   * mostly the same errand each time". Doing it yourself is one tap.
   */
  const [approach, setApproach] = useState<JobApproach>('hired')
  const offered = stepsFor(approach)
  const [steps, setSteps] = useState<readonly string[]>(offered)

  const toggle = (step: string): void => {
    setSteps(steps.includes(step) ? steps.filter((one) => one !== step) : [...steps, step])
  }

  /*
   * Switching approach re-ticks the new list rather than keeping what
   * was ticked. The two share no step, so carrying the selection across
   * would leave every box empty and the job would open with nothing.
   */
  const chooseApproach = (next: JobApproach): void => {
    setApproach(next)
    setSteps(stepsFor(next))
  }

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          add.mutate(
            {
              name,
              belongsTo: BASE,
              // In the order the errand runs, not the order they were
              // ticked — unticking the quote and re-ticking it must not
              // send it to the end. Filtered against the chosen
              // approach's own list, so a step from the other one cannot
              // survive a change of mind.
              steps: offered.filter((one) => steps.includes(one)),
              /*
                Stored, so Crafting can be fed by the jobs you do
                yourself and not by the ones you hire out. The steps used
                to be the only record of which errand this was, and they
                are free text the moment anybody edits one.
              */
              approach,
            },
            { onSuccess: onDone },
          )
        }}
      >
        <input
          className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm"
          aria-label="What needs fixing"
          placeholder="What needs fixing?"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />

        {/*
          The approach first, because it decides which steps are even
          worth showing. Two buttons rather than a checkbox: these are
          two named errands, not a setting with an on and an off.
        */}
        <div className="flex gap-1.5">
          {JOB_APPROACHES.map((one) => (
            <button
              key={one.id}
              type="button"
              className={[
                'tap-target flex-1 rounded-lg border px-2.5 text-xs font-medium',
                approach === one.id
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              aria-pressed={approach === one.id}
              onClick={() => {
                chooseApproach(one.id)
              }}
            >
              {one.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <span className="text-ink-500 block text-xs">Steps to open it with</span>
          {offered.map((step) => (
            <label key={step} className="tap-target flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 shrink-0"
                checked={steps.includes(step)}
                onChange={() => {
                  toggle(step)
                }}
              />
              <span className="text-ink-300">{step}</span>
            </label>
          ))}
        </div>

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add it
        </Button>
      </form>
    </Card>
  )
}

export function BasePage() {
  const [addingUpgrade, setAddingUpgrade] = useState(false)
  const [addingJob, setAddingJob] = useState(false)
  /*
   * What the eye in each card header reveals: rows the house is not
   * asking for today, which still carry the only control that can undo,
   * rename or retire them. Folded, never filtered — the rule Today's
   * header already follows.
   */
  const [showingRestUpgrades, setShowingRestUpgrades] = useState(false)

  const jobs = useBaseProjects()
  /*
   * Ranked against an empty wallet, which shows the tree without claiming
   * anything is affordable. The Tech tree screen owns the budget control;
   * duplicating it here would be two places to set one number.
   */
  const upgrades = useUpgradeTree(0, 'base')
  const houseUpgrades = (upgrades.data ?? []).map((entry) => entry.upgrade)
  const houseWanted = wanted(houseUpgrades)
  const houseOwned = owned(houseUpgrades)
  const houseDropped = dropped(houseUpgrades)
  const total = wishlistTotal(houseUpgrades)

  const restingUpgrades = [...houseOwned, ...houseDropped]

  return (
    <div className="space-y-4">
      {/*
        **The page header stays**, and that is deliberate rather than an
        oversight while the sections around it went. Today has none
        because it opens on a portrait of you, which says what the screen
        is without a word; this one opens on a list of chores, and a list
        needs naming. The note on `PageHeader` says not to extend that
        exception.
      */}
      <PageHeader title="Base" subtitle="The place you live, and what it is asking for" />

      {/*
        **Cards that name themselves, where four `Section`s used to stack
        a heading and a lit rule above each one.** Asked for as _"refactor
        its looks so it's cleaner like we did with the homepage"_ — and
        the home screen's own note is the argument: a heading over a rule
        over a description, four times down one screen, is what a settings
        pane looks like. Each of those headings named something the card
        beneath it already said.

        `space-y-4` rather than `space-y-8` for the same reason. Two rem
        between cards was holding apart blocks that had a heading each;
        without them the gap reads as a gulf.
      */}
      {/*
        **Declutter leads now, because the chores are gone.** A chore
        was a `Daily` filed to Base, so removing the recurring tracking
        took them off this screen too — that half of the house moved to
        a calendar. What is left is the work that has an end: how clear
        each room is, the jobs with steps, and what there is to save
        for.
      */}
      <Declutter />

      <Card>
        <CardHeading
          icon={<Hammer size={16} aria-hidden />}
          title="Jobs"
          action={
            <Button
              size="sm"
              onClick={() => {
                setAddingJob(!addingJob)
              }}
            >
              {addingJob ? 'Close' : 'Add'}
            </Button>
          }
        />

        {addingJob && (
          <AddJob
            onDone={() => {
              setAddingJob(false)
            }}
          />
        )}

        {jobs.data === undefined ? null : jobs.data.length === 0 ? (
          <Empty title="Nothing broken">
            A job opens with the errand it usually is — find the right person, get a quote, book the
            appointment — or with the one you do yourself: work out what it needs, get the
            materials, do the work.
          </Empty>
        ) : (
          <ul>
            {jobs.data.map((project) => (
              <JobRow key={project.id} project={project} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeading
          icon={<Wrench size={16} aria-hidden />}
          title="Upgrades"
          action={
            <>
              {/*
                **What is already in the house, and what was decided
                against, behind the same eye the chores use.** Both are
                records rather than things to do: the list you open this
                card for is what you are saving for. Folded rather than
                dropped, because the only control that can un-cancel a
                dropped upgrade lives on its row.
              */}
              {restingUpgrades.length > 0 && (
                <Button
                  size="sm"
                  variant={showingRestUpgrades ? 'primary' : 'ghost'}
                  aria-pressed={showingRestUpgrades}
                  aria-label={`${showingRestUpgrades ? 'Hide' : 'Show'} ${String(restingUpgrades.length)} owned and dropped`}
                  onClick={() => {
                    setShowingRestUpgrades(!showingRestUpgrades)
                  }}
                >
                  <EyeIcon open={showingRestUpgrades} />
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setAddingUpgrade(!addingUpgrade)
                }}
              >
                {addingUpgrade ? 'Close' : 'Add'}
              </Button>
            </>
          }
        />

        {addingUpgrade && (
          <AddHouseUpgrade
            onDone={() => {
              setAddingUpgrade(false)
            }}
          />
        )}

        {upgrades.data === undefined ? null : upgrades.data.length === 0 ? (
          <Empty title="Nothing on the list">
            Add one above, or send something across from the tech tree. It shares the same wallet
            either way — a dishwasher and a barbell come out of the same money.
          </Empty>
        ) : (
          <>
            {houseWanted.length > 0 && (
              <div>
                {/*
                  What the list comes to, with the unpriced ones *named*
                  rather than folded in as nothing. A couch with no
                  estimate is not a free couch, and a total that pretended
                  otherwise would be understated in the direction that
                  matters.

                  The "Wanted" label above it is gone: with the owned and
                  dropped rows behind the eye, this list is the only one
                  on screen and a heading over it says nothing the card's
                  own name did not.
                */}
                {total.priced > 0 && (
                  <p className="text-ink-700 numeric mb-1.5 text-xs">
                    {formatMinorUnits(total.minorUnits)} across {total.priced}
                    {total.unpriced > 0 && ` · ${String(total.unpriced)} unpriced`}
                  </p>
                )}
                <ul className="space-y-1.5">
                  {houseWanted.map((upgrade) => (
                    <UpgradeRow key={upgrade.id} upgrade={upgrade} />
                  ))}
                </ul>
              </div>
            )}

            {houseWanted.length === 0 && !showingRestUpgrades && (
              <p className="text-ink-500 text-sm">Nothing on the wishlist.</p>
            )}

            {showingRestUpgrades && (
              <div className="border-ink-800 mt-3 space-y-3 border-t pt-3">
                {houseOwned.length > 0 && (
                  <div>
                    <span className="text-ink-700 mb-1.5 block text-xs tracking-wide uppercase">
                      In the house
                    </span>
                    <ul className="space-y-1.5">
                      {houseOwned.map((upgrade) => (
                        <UpgradeRow key={upgrade.id} upgrade={upgrade} />
                      ))}
                    </ul>
                  </div>
                )}

                {houseDropped.length > 0 && (
                  <div>
                    <span className="text-ink-700 mb-1.5 block text-xs tracking-wide uppercase">
                      Dropped
                    </span>
                    <ul className="space-y-1.5">
                      {houseDropped.map((upgrade) => (
                        <UpgradeRow key={upgrade.id} upgrade={upgrade} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Link to="/upgrades" className={cn(buttonStyles({ variant: 'outline' }), 'mt-3 w-full')}>
          <Wrench size={16} aria-hidden />
          The rest of the tech tree
        </Link>
      </Card>
    </div>
  )
}
