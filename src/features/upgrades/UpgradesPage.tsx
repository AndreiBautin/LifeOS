import { Check, ListTree, Lock, Network, Plus, Trash2, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { EyeIcon } from '@/components/shared/EyeIcon'
import { wishlistTotal } from '@/domain/upgrades/wishlist'
import {
  UPGRADE_SHELF_LABELS,
  UPGRADE_SHELVES,
  shelfOf,
  type UpgradeShelf,
} from '@/domain/upgrades/shelf'
import type { Gate } from '@/domain/game/tree'
import type { UpgradeId } from '@/domain/ids/ids'
import type { TreeEntry } from '@/domain/upgrades/recommendation'
import {
  formatMinorUnits,
  isOpen,
  toMinorUnits,
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABELS,
  UPGRADE_STATUS_LABELS,
  type UpgradeCategory,
} from '@/domain/upgrades/upgrade'

import {
  useAddUpgrade,
  useDeleteUpgrade,
  useMoveUpgradeToShelf,
  useSpendingPool,
  useUpdateUpgrade,
  useWholeTree,
} from './hooks'
import { TechTree } from './TechTree'

/**
 * The tech tree.
 *
 * Rendered as the tree it always was — the source's own result type
 * carried `UnlocksUpgradeId` and `UnlocksTitle`, which is skill-tree
 * vocabulary sitting in a purchase planner. What is available now, what it
 * leads to, what is locked and by what.
 *
 * What keeps it honest, where an invented tree would not be, is that both
 * gates are externally real: money you actually have, and a prerequisite
 * that physically holds. Nothing here is bought with points, and nothing
 * here pays them out — see docs/GAME_MODEL.md.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

function GateNote({ gates }: { readonly gates: readonly Gate[] }) {
  if (gates.length === 0) return null

  return (
    <ul className="text-ink-500 mt-2 space-y-0.5 text-xs">
      {gates.map((gate) => (
        <li key={gate.kind} className="flex items-center gap-1.5">
          {gate.kind === 'prerequisite' ? (
            <>
              <Lock size={12} aria-hidden />
              Needs {gate.title} first
            </>
          ) : (
            <>
              <Wallet size={12} aria-hidden />
              {formatMinorUnits(gate.shortfallMinorUnits)} short
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * What has to come first, changeable after the fact.
 *
 * Here rather than only on the add form, because the cycle guard is
 * otherwise unreachable: a brand-new node has no dependents and cannot
 * close a loop, so the only way to make one is to re-point an existing
 * node — and a rule nothing can reach is a rule nobody can trust.
 */
function PrerequisitePicker({
  entry,
  others,
}: {
  readonly entry: TreeEntry
  readonly others: readonly TreeEntry[]
}) {
  const update = useUpdateUpgrade()

  if (others.length === 0) return null

  return (
    <label className="mt-3 block">
      <span className={LABEL}>Needs first</span>
      <select
        className={FIELD}
        value={entry.upgrade.prerequisiteId ?? ''}
        onChange={(event) => {
          update.mutate({
            id: entry.upgrade.id,
            changes: {
              prerequisiteId: event.target.value === '' ? null : (event.target.value as UpgradeId),
            },
          })
        }}
      >
        <option value="">Nothing</option>
        {others.map((other) => (
          <option key={other.upgrade.id} value={other.upgrade.id}>
            {other.upgrade.title}
          </option>
        ))}
      </select>

      {update.data?.error !== undefined && (
        <p role="alert" className="text-bad-500 mt-2 text-sm">
          {update.data.error}
        </p>
      )}
    </label>
  )
}

function EntryCard({
  entry,
  others,
}: {
  readonly entry: TreeEntry
  readonly others: readonly TreeEntry[]
}) {
  const update = useUpdateUpgrade()
  const remove = useDeleteUpgrade()
  const move = useMoveUpgradeToShelf()
  const [confirming, setConfirming] = useState(false)

  const { upgrade, recommendation, gates, affordable } = entry
  const owned = upgrade.status === 'purchased'
  const error = update.data?.error ?? remove.data?.error

  return (
    <Card
      id={`upgrade-${upgrade.id}`}
      className={affordable ? 'border-accent-500/30 py-3' : 'py-3'}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={owned ? 'text-ink-500 font-medium line-through' : 'text-ink-50 font-medium'}
          >
            {upgrade.title}
          </p>

          <p className="text-ink-500 numeric mt-0.5 text-xs">
            {UPGRADE_CATEGORY_LABELS[upgrade.category]} · priority{' '}
            {recommendation.effectivePriority.toString()}
            {recommendation.unlocksTitle !== undefined &&
              ` · unlocks ${recommendation.unlocksTitle}`}
            {upgrade.estimatedCostMinorUnits !== undefined &&
              ` · ${formatMinorUnits(upgrade.estimatedCostMinorUnits)}`}
          </p>

          <GateNote gates={gates} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {affordable ? (
            <Badge tone="accent">available</Badge>
          ) : (
            <Badge tone={owned ? 'good' : 'neutral'}>
              {UPGRADE_STATUS_LABELS[upgrade.status].toLowerCase()}
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {!owned && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              update.mutate({ id: upgrade.id, changes: { status: 'purchased' } })
            }}
          >
            <Check size={16} aria-hidden />
            Bought
          </Button>
        )}

        {owned && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update.mutate({ id: upgrade.id, changes: { status: 'ready-to-buy' } })
            }}
          >
            Not yet
          </Button>
        )}

        {/*
          Three shelves rather than one button to the house, because the
          question is what this upgrades: the place you live, the tools
          you work with, or you. Only the two it is *not* on are offered
          — a button that moves a row where it already is does nothing
          and still looks pressable.
        */}
        {UPGRADE_SHELVES.filter((shelf) => shelf !== shelfOf(upgrade)).map((shelf) => (
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

        <Button
          variant={confirming ? 'danger' : 'ghost'}
          size="sm"
          aria-label={confirming ? `Confirm deleting ${upgrade.title}` : `Delete ${upgrade.title}`}
          onClick={() => {
            if (confirming) {
              remove.mutate(upgrade.id)
              setConfirming(false)
            } else {
              setConfirming(true)
            }
          }}
        >
          {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
        </Button>
      </div>

      <PrerequisitePicker entry={entry} others={others} />

      {error !== undefined && (
        <p role="alert" className="text-bad-500 mt-2 text-sm">
          {error}
        </p>
      )}
    </Card>
  )
}

function AddUpgrade({
  candidates,
  defaultShelf,
}: {
  readonly candidates: readonly TreeEntry[]
  /**
   * Which branch a new upgrade lands on unless it is changed.
   *
   * **Chosen on the form rather than fixed by the screen**, which it was
   * when there was a screen per shelf: with one tree showing every
   * branch there is no longer a screen to infer it from, and adding a
   * desk from the tree only to move it afterwards is the round trip Base
   * was given its own add form to avoid.
   */
  readonly defaultShelf: UpgradeShelf
}) {
  const add = useAddUpgrade()

  const [title, setTitle] = useState('')
  const [shelf, setShelf] = useState<UpgradeShelf>(defaultShelf)
  const [category, setCategory] = useState<UpgradeCategory>('other')
  const [priority, setPriority] = useState('50')
  const [cost, setCost] = useState('')
  const [prerequisite, setPrerequisite] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() === '') return

          const estimate = toMinorUnits(cost)

          add.mutate(
            {
              title,
              category,
              shelf,
              priority: Number(priority),
              ...(estimate === undefined ? {} : { estimatedCostMinorUnits: estimate }),
              ...(prerequisite === '' ? {} : { prerequisiteId: prerequisite as UpgradeId }),
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setTitle('')
                setCost('')
                setPrerequisite('')
              },
            },
          )
        }}
      >
        <input
          className={FIELD}
          value={title}
          aria-label="What you want"
          placeholder="Something you are saving up for"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>Branch</span>
            <select
              className={FIELD}
              value={shelf}
              onChange={(event) => {
                setShelf(event.target.value as UpgradeShelf)
              }}
            >
              {UPGRADE_SHELVES.map((one) => (
                <option key={one} value={one}>
                  {UPGRADE_SHELF_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>Category</span>
            <select
              className={FIELD}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as UpgradeCategory)
              }}
            >
              {UPGRADE_CATEGORIES.map((one) => (
                <option key={one} value={one}>
                  {UPGRADE_CATEGORY_LABELS[one]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={LABEL}>Priority 1–100</span>
            <input
              className={FIELD}
              inputMode="numeric"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value)
              }}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Cost</span>
            <input
              className={FIELD}
              inputMode="decimal"
              value={cost}
              placeholder="0.00"
              onChange={(event) => {
                setCost(event.target.value)
              }}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Needs first</span>
            <select
              className={FIELD}
              value={prerequisite}
              onChange={(event) => {
                setPrerequisite(event.target.value)
              }}
            >
              <option value="">Nothing</option>
              {candidates.map((entry) => (
                <option key={entry.upgrade.id} value={entry.upgrade.id}>
                  {entry.upgrade.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {add.data?.error !== undefined && (
          <p role="alert" className="text-bad-500 text-sm">
            {add.data.error}
          </p>
        )}

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add to the tree
        </Button>
      </form>
    </Card>
  )
}

/**
 * One shelf of the tree.
 *
 * Shared by the Tech tree and Gear screens rather than copied, because
 * they are the same record with the same gates and the same wallet —
 * a second copy of this file is where a gate bug would outlive its fix.
 * What differs is the heading and which shelf is read.
 */
/**
 * What there is to spend, and where it came from.
 *
 * **Read-only here on purpose.** The pool is derived from the monthly
 * surpluses, so the way to change it is to record a surplus — and that
 * belongs on the screen that already collects the month's figures. A
 * second box here would be a second answer to "how much have I got",
 * which is exactly what the device-local budget was.
 *
 * It shows the arithmetic rather than only the answer: banked, spent,
 * and what that leaves. A single number nobody can trace is the thing
 * the old budget box was.
 */
function PoolCard() {
  const pool = useSpendingPool()
  const data = pool.data

  if (data === undefined) return null

  const over = data.availableMinor < 0

  return (
    <Card className="mb-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-500 text-sm">The pool</span>
        <span className={`numeric text-sm font-semibold ${over ? 'text-bad-500' : 'text-ink-50'}`}>
          {formatMinorUnits(data.availableMinor)}
        </span>
      </div>

      <p className="text-ink-700 mt-1 text-xs">
        {data.monthsBanked === 0 ? (
          <>
            Nothing banked yet. Record a month&rsquo;s surplus on{' '}
            <Link to="/finance" className="text-accent-400 underline">
              Finance
            </Link>{' '}
            and it lands here.
          </>
        ) : (
          <>
            {formatMinorUnits(data.bankedMinor)} banked over {data.monthsBanked}{' '}
            {data.monthsBanked === 1 ? 'month' : 'months'} · {formatMinorUnits(data.spentMinor)}{' '}
            spent
            {data.unpricedPurchases > 0 &&
              ` · ${String(data.unpricedPurchases)} bought with no cost recorded, so this reads high`}
            {over && ' · you are over'}
          </>
        )}
      </p>
    </Card>
  )
}

function ShelfPage() {
  /*
   * **The pool replaced the budget box**, which was a number typed into
   * `localStorage` on one device. What is affordable now comes from the
   * surpluses recorded on the finance readings minus what the purchased
   * upgrades cost — derived, synced, and inspectable. See
   * `domain/upgrades/pool.ts`.
   */
  /* What the eye on "Every node" reveals — see the note beside it. */
  const [showingSettled, setShowingSettled] = useState(false)

  const pool = useSpendingPool()
  const available = pool.data?.availableMinor ?? 0

  const tree = useWholeTree(available)
  const entries = tree.data ?? []

  /*
   * `isOpen` rather than "not purchased", which is what this said and
   * which quietly kept **cancelled** upgrades in the tree — and, if one
   * was cheap enough, offered it under "what you can get today". A
   * screen recommending something you had decided against.
   */
  const open = entries.filter((entry) => isOpen(entry.upgrade))
  const owned = entries.filter((entry) => entry.upgrade.status === 'purchased')
  const gone = entries.filter((entry) => entry.upgrade.status === 'cancelled')
  const availableNow = open.filter((entry) => entry.affordable)

  /*
   * Bought and decided-against together: both are settled, and both had
   * a section of their own at the foot of the page. Dropped first —
   * something you may yet change your mind about is worth meeting before
   * a list of things already in the house.
   */
  const settled = [...gone, ...owned]

  const total = wishlistTotal(entries.map((entry) => entry.upgrade))
  /*
   * What the list still needs beyond what you have. Two stated numbers
   * subtracted — the budget you typed and the costs you typed — and it
   * says how many rows carry no price, because a shortfall that folded
   * those in as free is understated in the direction that matters.
   */
  const shortfall = Math.max(0, total.minorUnits - available)

  return (
    <div className="space-y-4">
      <PageHeader title="Tech tree" subtitle="What you are saving for, and what unlocks what" />

      {/*
        **The tree itself leads, because it is the thing that was asked
        for.** The lists below it are how a node is edited; the picture
        is how it is understood.
      */}
      <div>
        <CardHeading icon={<Network size={16} aria-hidden />} title="The tree" />
        {entries.length === 0 ? (
          <Empty title="Nothing planned">Add the first thing you are saving up for.</Empty>
        ) : (
          <TechTree
            entries={entries}
            onPick={(id) => {
              document
                .getElementById(`upgrade-${id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          />
        )}
      </div>

      <div>
        <CardHeading icon={<Wallet size={16} aria-hidden />} title="What you can get today" />
        <p className="text-ink-500 mb-2 text-sm">
          {availableNow.length === 0
            ? 'Nothing is within reach at this pool.'
            : `${availableNow.length.toString()} within reach.`}
        </p>

        <PoolCard />

        {availableNow.length > 0 && (
          <div className="space-y-2">
            {availableNow.map((entry) => (
              <EntryCard
                key={entry.upgrade.id}
                entry={entry}
                others={entries.filter((one) => one.upgrade.id !== entry.upgrade.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/*
        The same nodes as the diagram, as rows that can be edited — the
        picture is how the tree is read and this is how it is changed.
        It is not called "The tree" any more, because the diagram above
        is, and one screen calling two things the same name is the
        collision the Gadgets rename was made to fix.
      */}
      <div>
        {/*
          **Owned and dropped fold behind the eye, and the tail was the
          complaint.** Reported alongside the width: _"the long list of
          items isn't the best at the end."_ It was three stacked
          sections — every open node, then everything decided against,
          then everything already bought — so a tree you had used for a
          year ended in two lists of things there is nothing left to do
          about.

          Folded rather than dropped, the rule the other four screens
          follow: the only control that can un-cancel a dropped upgrade
          lives on its own row.
        */}
        <CardHeading
          icon={<ListTree size={16} aria-hidden />}
          title="Every node"
          action={
            settled.length > 0 && (
              <Button
                size="sm"
                variant={showingSettled ? 'primary' : 'ghost'}
                aria-pressed={showingSettled}
                aria-label={`${showingSettled ? 'Hide' : 'Show'} ${String(settled.length)} owned and dropped`}
                onClick={() => {
                  setShowingSettled(!showingSettled)
                }}
              >
                <EyeIcon open={showingSettled} />
              </Button>
            )
          }
        />

        <p className="text-ink-500 mb-2 text-sm">
          Ordered by the priority each node inherits from the most important thing it unblocks.
        </p>

        {total.priced > 0 && (
          <Card className="mb-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-500 text-sm">The whole list</span>
              <span className="text-ink-50 numeric text-sm font-semibold">
                {formatMinorUnits(total.minorUnits)}
              </span>
            </div>
            <p className="text-ink-700 mt-1 text-xs">
              Across {total.priced} priced {total.priced === 1 ? 'item' : 'items'}
              {total.unpriced > 0 &&
                ` · ${String(total.unpriced)} with no estimate, so this is a floor rather than a total`}
              {shortfall > 0 && ` · ${formatMinorUnits(shortfall)} beyond the pool`}
            </p>
          </Card>
        )}

        <AddUpgrade candidates={entries} defaultShelf="tech" />

        {open.length === 0 ? (
          <Empty title="Nothing planned">Add the first thing you are saving up for.</Empty>
        ) : (
          <div className="space-y-2">
            {open.map((entry) => (
              <EntryCard
                key={entry.upgrade.id}
                entry={entry}
                others={entries.filter((one) => one.upgrade.id !== entry.upgrade.id)}
              />
            ))}
          </div>
        )}

        {showingSettled && settled.length > 0 && (
          <div className="border-ink-800 mt-3 space-y-2 border-t pt-3">
            {settled.map((entry) => (
              <EntryCard
                key={entry.upgrade.id}
                entry={entry}
                others={entries.filter((one) => one.upgrade.id !== entry.upgrade.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The tech tree, at `/upgrades`.
 *
 * The route keeps its old path under a label that no longer covers
 * everything it used to — the rule routes outlive labels, and a PWA
 * shortcut is registered with the operating system at install time.
 */
export function UpgradesPage() {
  return <ShelfPage />
}

/** Apparel, shoes and accessories, at `/gear`. */
