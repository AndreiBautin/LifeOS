import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import { Button } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import {
  isMoney,
  REQUIREMENT_KINDS,
  unitOf,
  REQUIREMENT_LABELS,
  requirementOf,
  targetOf,
  type Requirement,
  type Stage,
} from '@/domain/campaign/campaign'
import type { CampaignId } from '@/domain/ids/ids'
import { ageFromBirthYear, salaryReferences } from '@/domain/finance/standards'
import { formatMinorUnits, toMinorUnits } from '@/domain/upgrades/upgrade'

import { useDropStage, useMoveStage, useReshapeStage } from './hooks'

/**
 * Changing a stage: its name, what it needs, and where it sits.
 *
 * **Three kinds of edit, and only one of them loses anything.** A name
 * is a label — the stage means what it meant and every lap against it
 * still happened. A target changes whether it is met and rewrites no
 * history, unlike a habit's cadence, which decides *which days were
 * expected* and re-reads every streak. Removing is the destructive one
 * and says how many dated records it is about to take.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

/**
 * The target box, in whatever unit the kind is counted in.
 *
 * Money is typed in major units and stored in minor, which is the same
 * conversion the tech tree's price field makes — a person types 40000
 * and the record holds 4,000,000. `isMoney` lives on the requirement
 * rather than here, so a kind added to the union cannot leave this
 * guessing.
 */
function targetLabel(kind: Requirement['kind']): string {
  if (isMoney(kind)) return 'Amount'
  if (kind === 'credit-score') return 'Score'
  return 'How many'
}

export function StageEditor({
  campaignId,
  stage,
  isFirst,
  isLast,
  onDone,
}: {
  readonly campaignId: CampaignId
  readonly stage: Stage
  readonly isFirst: boolean
  readonly isLast: boolean
  readonly onDone: () => void
}) {
  const reshape = useReshapeStage()
  const move = useMoveStage()
  const drop = useDropStage()

  const [name, setName] = useState(stage.name)
  const [kind, setKind] = useState<Requirement['kind']>(stage.requirement.kind)
  const [target, setTarget] = useState(() => {
    const current = targetOf(stage.requirement)
    if (current === undefined) return ''

    return isMoney(stage.requirement.kind) ? String(current / 100) : String(current)
  })
  const [confirming, setConfirming] = useState(false)

  const laps = stage.reached.length

  /*
   * Only for a salary target, and only with a birth year: the published
   * table is income by age, so without an age there is nothing to look
   * up and a guess would be worse than no offer at all.
   */
  const { settings } = useSettings()
  const services = useServices()

  const suggestions =
    kind === 'salary' && settings.birthYear !== undefined
      ? salaryReferences(ageFromBirthYear(settings.birthYear, services.clock.now()))
      : []

  return (
    <div className="border-ink-800 bg-ink-850/40 space-y-3 rounded-xl border p-3">
      <div>
        <label className={LABEL} htmlFor={`stage-name-${stage.id}`}>
          Name
        </label>
        <input
          id={`stage-name-${stage.id}`}
          className={FIELD}
          value={name}
          autoFocus
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor={`stage-kind-${stage.id}`}>
          Met when
        </label>
        <select
          id={`stage-kind-${stage.id}`}
          className={FIELD}
          value={kind}
          onChange={(event) => {
            const next = event.target.value as Requirement['kind']
            /*
             * **A target that has changed unit is cleared, not carried.**
             * The box is seeded once from the stored requirement, so
             * retargeting a stage from applications to a salary left the
             * count sitting in it — and `offers: 1` saved as one pound,
             * a target nobody chose which the screen then reports as
             * comfortably met. Found by driving the repair somebody has
             * to make after the arc template changed under them.
             *
             * A count carried into another count is kept, because five
             * house jobs and five applications mean the same five. It is
             * the unit that decides, which is why `unitOf` is in the
             * domain beside the union rather than being a list of kinds
             * written out here.
             */
            if (unitOf(next) !== unitOf(kind)) setTarget('')
            setKind(next)
          }}
        >
          {REQUIREMENT_KINDS.map((one) => (
            <option key={one} value={one}>
              {REQUIREMENT_LABELS[one]}
            </option>
          ))}
        </select>
      </div>

      {kind !== 'declared' && (
        <div>
          <label className={LABEL} htmlFor={`stage-target-${stage.id}`}>
            {targetLabel(kind)}
          </label>
          <input
            id={`stage-target-${stage.id}`}
            className={FIELD}
            inputMode="decimal"
            value={target}
            onChange={(event) => {
              setTarget(event.target.value)
            }}
          />

          {/*
            **The published figures, as one tap each.** Asked as _"we
            probably need to set some sort of target for that then huh,
            any way to automate that."_

            The target itself is not automatable and offering to compute
            one would be the invented scale this app refuses everywhere —
            nothing here knows what you ought to earn. What *is*
            automatable is not having to make the number up: these are
            the Census Bureau's own breakpoints for people your age.

            They fill the box rather than setting the stage, so the
            figure is still chosen and still editable — the same
            offered-never-applied stance the estimate apply and the
            config paste both take. Absent without a birth year, and
            absent outside the ages the published table covers.
          */}
          {suggestions.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((one) => (
                  <button
                    key={one.label}
                    type="button"
                    className={buttonStyles({ variant: 'outline', size: 'sm' })}
                    onClick={() => {
                      setTarget(String(one.minorUnits / 100))
                    }}
                  >
                    {one.label} · {formatMinorUnits(one.minorUnits)}
                  </button>
                ))}
              </div>
              <p className="text-ink-700 mt-1.5 text-xs">
                Individual income, 2024 Census ASEC. A reference rather than a recommendation —
                nothing here knows what you should be earning.
              </p>
            </div>
          )}
        </div>
      )}

      {/*
        Said before it is done rather than after. Turning a declared
        stage into a measured one leaves its dates inert — the reading
        decides from then on — and clearing them would be a destructive
        edit wearing a settings change's clothes, so they are kept and
        this explains what happened to them.
      */}
      {laps > 0 && kind !== 'declared' && stage.requirement.kind === 'declared' && (
        <p className="text-warn-500 text-xs">
          The {laps === 1 ? 'date' : `${String(laps)} dates`} recorded here will be kept, but a
          reading will decide this stage from now on.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={reshape.isPending || name.trim() === ''}
          onClick={() => {
            /*
             * One write, and the first version was two.
             *
             * A rename and a retarget are separate operations, which is
             * what made firing both look right — but each is a
             * read-modify-write of the same campaign record, so the
             * second read the copy from *before* the first had saved and
             * wrote the old name back over it. Driving it caught the
             * target moving to 30,000 while the new name silently did
             * not stick. One form press is one edit.
             */
            const parsed = isMoney(kind) ? toMinorUnits(target) : Number(target)
            const value = Number.isFinite(parsed) ? (parsed ?? 0) : 0

            reshape.mutate(
              { id: campaignId, stageId: stage.id, name, requirement: requirementOf(kind, value) },
              { onSuccess: onDone },
            )
          }}
        >
          Save
        </Button>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Move this stage earlier"
          disabled={isFirst || move.isPending}
          onClick={() => {
            move.mutate({ id: campaignId, stageId: stage.id, by: -1 })
          }}
        >
          <ChevronUp size={14} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Move this stage later"
          disabled={isLast || move.isPending}
          onClick={() => {
            move.mutate({ id: campaignId, stageId: stage.id, by: 1 })
          }}
        >
          <ChevronDown size={14} aria-hidden />
        </Button>

        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {/*
        Confirmed only when there is something to lose. A stage nobody
        has reached carries no record, so asking about it is a dialogue
        for its own sake — and asking about everything is how somebody
        learns to press through the question without reading it.
      */}
      <div className="border-ink-800 border-t pt-3">
        {confirming ? (
          <div className="space-y-2">
            <p className="text-bad-500 text-xs">
              Removing this also removes {laps === 1 ? 'the date' : `the ${String(laps)} dates`}{' '}
              recorded against it. Nothing else holds them.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-bad-500 flex-1"
                disabled={drop.isPending}
                onClick={() => {
                  drop.mutate({ id: campaignId, stageId: stage.id }, { onSuccess: onDone })
                }}
              >
                Remove it
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirming(false)
                }}
              >
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-ink-500"
            disabled={drop.isPending}
            onClick={() => {
              if (laps > 0) setConfirming(true)
              else drop.mutate({ id: campaignId, stageId: stage.id }, { onSuccess: onDone })
            }}
          >
            <Trash2 size={14} aria-hidden />
            Remove this stage
          </Button>
        )}
      </div>
    </div>
  )
}
