import { Declutter } from './Declutter'
import { Plus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Link } from 'react-router-dom'

import { Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { EyeIcon } from '@/components/shared/EyeIcon'
import { buttonStyles } from '@/components/shared/styles'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import { BASE } from '@/domain/base/base'
import { UPGRADE_SHELF_LABELS, UPGRADE_SHELVES } from '@/domain/upgrades/shelf'
import { dropped, owned, wanted } from '@/domain/upgrades/wishlist'
import { cn } from '@/lib/cn'

import { NO_BUDGET, useAddUpgrade, useMoveUpgradeToShelf, useUpgradeTree } from '../upgrades/hooks'

/**
 * Base: the place you live — how clear it is, and what you mean to buy
 * for it.
 *
 * **House jobs left with the quests**, asked for as _"drop them too"_:
 * house projects are worked through in Notion now. What is left is what
 * the app measures about the house and the upgrades saved up for.
 */

function UpgradeRow({ upgrade }: { readonly upgrade: Upgrade }) {
  const move = useMoveUpgradeToShelf()

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">{upgrade.title}</span>
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

  return (
    <Card className="mb-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() === '') return

          add.mutate(
            {
              title,
              belongsTo: BASE,
              // The house's own default, rather than the tree's "other".
              category: 'home',
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setTitle('')
                onDone()
              },
            },
          )
        }}
      >
        <div className="flex gap-2">
          <input
            className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target min-w-0 flex-1 rounded-xl border px-3 text-sm"
            value={title}
            aria-label="Something the house needs"
            placeholder="Something the house needs"
            onChange={(event) => {
              setTitle(event.target.value)
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
export function BasePage() {
  const [addingUpgrade, setAddingUpgrade] = useState(false)
  /*
   * What the eye in each card header reveals: rows the house is not
   * asking for today, which still carry the only control that can undo,
   * rename or retire them. Folded, never filtered — the rule Today's
   * header already follows.
   */
  const [showingRestUpgrades, setShowingRestUpgrades] = useState(false)

  /*
   * Ranked against an empty wallet, which shows the tree without claiming
   * anything is affordable. The Tech tree screen owns the budget control;
   * duplicating it here would be two places to set one number.
   */
  const upgrades = useUpgradeTree(NO_BUDGET, 'base')
  const houseUpgrades = (upgrades.data ?? []).map((entry) => entry.upgrade)
  const houseWanted = wanted(houseUpgrades)
  const houseOwned = owned(houseUpgrades)
  const houseDropped = dropped(houseUpgrades)

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
        **Two columns, not one long stack.** Reported directly: "could we
        make codex, map, tech and base also not scroll." `Declutter`
        alone (a house-wide reading plus every room) runs about as tall
        as Jobs and Upgrades put together, so it gets a column to
        itself; the other two — both short, both lists of a handful of
        rows — share the second. `lg:items-start`, the same "a shorter
        column simply ends" call Today and Quests already make, rather
        than stretching either to match the other.
      */}
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {/*
          **Declutter leads now, because the chores are gone.** A chore
          was a `Daily` filed to Base, so removing the recurring tracking
          took them off this screen too — that half of the house moved to
          a calendar. What is left is the work that has an end: how clear
          each room is, the jobs with steps, and what there is to save
          for.
        */}
        <Declutter />

        <div className="space-y-4">
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
                Add one above, or send something across from the tech tree. It shares the same
                wallet either way — a dishwasher and a barbell come out of the same money.
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

            <Link
              viewTransition
              to="/upgrades"
              className={cn(buttonStyles({ variant: 'outline' }), 'mt-3 w-full')}
            >
              <Wrench size={16} aria-hidden />
              The rest of the tech tree
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
