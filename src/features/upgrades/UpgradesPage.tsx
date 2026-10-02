import { Check, Lock, Network, Plus, Trash2, Wallet, X } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useEffect, useRef, useState } from 'react'

import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
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
  UPGRADE_CATEGORIES,
  UPGRADE_CATEGORY_LABELS,
  UPGRADE_STATUS_LABELS,
  type UpgradeCategory,
} from '@/domain/upgrades/upgrade'

import {
  useAddUpgrade,
  useDeleteUpgrade,
  useMoveUpgradeToShelf,
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
          </p>

          <GateNote gates={gates} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {affordable ? (
            <Badge tone="accent">unlocked</Badge>
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
  const [prerequisite, setPrerequisite] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim() === '') return

          add.mutate(
            {
              title,
              category,
              shelf,
              priority: Number(priority),
              ...(prerequisite === '' ? {} : { prerequisiteId: prerequisite as UpgradeId }),
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setTitle('')
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
function ShelfPage() {
  const tree = useWholeTree()
  const entries = tree.data ?? []
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const open = entries.filter((entry) => isOpen(entry.upgrade))
  const unlocked = open.filter((entry) => entry.affordable)
  /* Read live each render, so an edit in the card shows straight away. */
  const pickedEntry = entries.find((entry) => entry.upgrade.id === picked)

  return (
    <div className="space-y-4">
      <PageHeader title="Tech tree" subtitle="What you are saving for, and what unlocks what" />

      {/*
        **The tree is the list now; a node's card opens when you tap it.**
        Asked for as _"having the whole list on the page is a lot — could
        we only have the cards pop up when you click on them?"_ Every node
        was drawn twice: once in the picture and once as a full editor
        card below it. The tree already draws every node — owned and
        dropped included, struck through and dimmed — so nothing became
        unreachable when the list went, which is the check this file
        makes before removing any control.

        Side by side from `lg`: the tree on the left, adding on the right.
      */}
      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <div>
          <CardHeading icon={<Network size={16} aria-hidden />} title="The tree" />
          {entries.length === 0 ? (
            <Empty title="Nothing planned">Add the first thing you are saving up for.</Empty>
          ) : (
            <>
              <p className="text-ink-500 mb-2 text-sm">
                {`${String(open.length)} open · ${String(unlocked.length)} unlocked. Tap a node to edit it.`}
              </p>
              <TechTree entries={entries} onPick={setPicked} />
            </>
          )}
        </div>

        <div>
          <CardHeading icon={<Plus size={16} aria-hidden />} title="Add" />
          <AddUpgrade candidates={entries} defaultShelf="tech" />
        </div>
      </div>

      {pickedEntry !== undefined && (
        <NodeDialog
          entry={pickedEntry}
          others={entries.filter((one) => one.upgrade.id !== pickedEntry.upgrade.id)}
          onClose={() => {
            setPicked(undefined)
          }}
        />
      )}
    </div>
  )
}

/**
 * One node's card, over the page.
 *
 * **A native `<dialog>` opened modally**, not a positioned div: it brings
 * focus trapping, Escape to close and an inert page behind it from the
 * platform, which a hand-rolled overlay gets subtly wrong. Pressing the
 * backdrop closes it too, since that is where a thumb goes to dismiss a
 * sheet. The blur is on the backdrop, a fixed surface — the one place
 * this app allows `backdrop-filter`.
 */
function NodeDialog({
  entry,
  others,
  onClose,
}: {
  readonly entry: TreeEntry
  readonly others: readonly TreeEntry[]
  readonly onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const node = dialog.current
    if (node !== null && !node.open) node.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-label={entry.upgrade.title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current.close()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] overflow-visible bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Close"
          className="absolute -top-12 right-0"
          onClick={() => {
            dialog.current?.close()
          }}
        >
          <X size={16} aria-hidden />
        </Button>
        <EntryCard entry={entry} others={others} />
      </div>
    </dialog>
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
