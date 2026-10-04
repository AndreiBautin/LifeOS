import { PersonStanding } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import { Card, CardHeading } from '@/components/shared/primitives'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import { RECENCY_DAYS, type Freshness, type MuscleRecency } from '@/domain/volume/recency'
import { cn } from '@/lib/cn'

import { useMuscleRecency } from './hooks'

/**
 * Two figures, front and back, each muscle lit by how lately it worked
 * (`muscleRecency`): bright for today or yesterday, half-lit for two or
 * three days ago, unlit beyond. Pressing a muscle names it with its days
 * since and its sets in the last week.
 *
 * **Not the week card a second time.** That counts this calendar week's
 * sets per muscle as one shape; this asks _how long ago_, which carries
 * over Monday — and it is a body, because the question somebody asks of
 * it is "what did I hit lately", and the answer is a place.
 *
 * The figures are drawn here from rounded blocks rather than an anatomy
 * plate: the lighting is the information, and a detailed drawing would
 * claim a precision the per-muscle counts do not have.
 */
export function BodyMapCard() {
  const recency = useMuscleRecency()
  const [chosen, setChosen] = useState<MuscleGroup | undefined>(undefined)

  if (recency.data === undefined) return null
  const data = recency.data
  const lately = (Object.keys(data) as MuscleGroup[]).filter(
    (muscle) => data[muscle].freshness === 'worked',
  ).length

  const region = (muscle: MuscleGroup, shapes: readonly ReactElement[], key: string) => (
    <g
      key={key}
      role="button"
      tabIndex={0}
      aria-label={`${MUSCLE_GROUP_LABELS[muscle]}: ${describe(data[muscle])}`}
      aria-pressed={chosen === muscle}
      onClick={() => {
        setChosen(muscle)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setChosen(muscle)
        }
      }}
      className={cn(
        'body-region cursor-pointer outline-none',
        TONES[data[muscle].freshness],
        chosen === muscle && 'body-region-chosen',
      )}
    >
      {shapes}
    </g>
  )

  return (
    <Card>
      <CardHeading icon={<PersonStanding size={16} aria-hidden />} title="Lately" />
      <p className="text-ink-300 text-sm">
        {chosen === undefined ? (
          <>
            <span className="numeric text-ink-50 font-semibold">{lately}</span> muscle
            {lately === 1 ? '' : 's'} worked in the last two days
          </>
        ) : (
          <>
            <span className="text-ink-50 font-semibold">{MUSCLE_GROUP_LABELS[chosen]}</span>
            <span className="text-ink-500"> · {describe(data[chosen])}</span>
          </>
        )}
      </p>

      <svg viewBox="0 0 220 186" className="mx-auto mt-3 w-full max-w-sm" role="group">
        <title>Muscles by how lately they were trained</title>
        <Figure x={0} label="Front">
          {region('front-delts', [ellipse(32, 40, 7, 6), ellipse(68, 40, 7, 6)], 'fd')}
          {region('side-delts', [ellipse(24, 44, 3.5, 7), ellipse(76, 44, 3.5, 7)], 'sd')}
          {region('chest', [block(37, 35, 12.5, 15, 4), block(50.5, 35, 12.5, 15, 4)], 'ch')}
          {region('biceps', [block(21, 49, 8, 19, 4), block(71, 49, 8, 19, 4)], 'bi')}
          {region('forearms', [block(19, 71, 7, 21, 3.5), block(74, 71, 7, 21, 3.5)], 'fa')}
          {region('core', [block(39, 53, 22, 29, 5)], 'co')}
          {region('quads', [block(37, 92, 12, 34, 6), block(51, 92, 12, 34, 6)], 'qu')}
          {region('calves', [block(38.5, 130, 9, 34, 4.5), block(52.5, 130, 9, 34, 4.5)], 'cf')}
        </Figure>
        <Figure x={115} label="Back">
          {region('traps', [<polygon key="t" points="42,27 58,27 67,36 50,46 33,36" />], 'tr')}
          {region('rear-delts', [ellipse(32, 40, 7, 6), ellipse(68, 40, 7, 6)], 'rd')}
          {region('side-delts', [ellipse(24, 44, 3.5, 7), ellipse(76, 44, 3.5, 7)], 'sd')}
          {region('upper-back', [block(41, 45, 18, 11, 3)], 'ub')}
          {region(
            'lats',
            [
              <polygon key="l" points="35,45 40,47 45,74 38,69" />,
              <polygon key="r" points="65,45 60,47 55,74 62,69" />,
            ],
            'la',
          )}
          {region('triceps', [block(21, 49, 8, 19, 4), block(71, 49, 8, 19, 4)], 'tc')}
          {region('forearms', [block(19, 71, 7, 21, 3.5), block(74, 71, 7, 21, 3.5)], 'fa')}
          {region('glutes', [block(37, 84, 12.5, 15, 6), block(50.5, 84, 12.5, 15, 6)], 'gl')}
          {region(
            'hamstrings',
            [block(37.5, 101, 11.5, 27, 5.5), block(51, 101, 11.5, 27, 5.5)],
            'ha',
          )}
          {region('calves', [block(38.5, 130, 9, 34, 4.5), block(52.5, 130, 9, 34, 4.5)], 'cf')}
        </Figure>
      </svg>

      <ul className="text-ink-500 mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.7rem]">
        {LEGEND.map(({ freshness, label }) => (
          <li key={freshness} className="flex items-center gap-1.5">
            <svg viewBox="0 0 10 10" className={cn('size-2.5', TONES[freshness])} aria-hidden>
              <rect width="10" height="10" rx="3" />
            </svg>
            {label}
          </li>
        ))}
      </ul>
    </Card>
  )
}

const TONES: Readonly<Record<Freshness, string>> = {
  worked: 'fill-accent-500',
  recovering: 'fill-accent-500/45',
  fresh: 'fill-ink-800',
}

const LEGEND: readonly { readonly freshness: Freshness; readonly label: string }[] = [
  { freshness: 'worked', label: 'Today or yesterday' },
  { freshness: 'recovering', label: '2–3 days ago' },
  { freshness: 'fresh', label: 'Longer' },
]

function Figure({
  x,
  label,
  children,
}: {
  readonly x: number
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <g transform={`translate(${String(x + 5)} 0)`}>
      {/* The parts no count lights: head, neck, hips, shins. */}
      <g className="fill-ink-700/45">
        <circle cx="50" cy="15" r="10" />
        <rect x="45" y="24" width="10" height="7" rx="2" />
        <rect x="38" y="82" width="24" height="9" rx="3" />
      </g>
      {children}
      <text x="50" y="180" textAnchor="middle" className="fill-ink-500 text-[9px]">
        {label}
      </text>
    </g>
  )
}

function block(x: number, y: number, width: number, height: number, radius: number) {
  return (
    <rect key={`${String(x)}-${String(y)}`} x={x} y={y} width={width} height={height} rx={radius} />
  )
}

function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return <ellipse key={`${String(cx)}-${String(cy)}`} cx={cx} cy={cy} rx={rx} ry={ry} />
}

function describe(recency: MuscleRecency): string {
  const when =
    recency.daysAgo === undefined
      ? 'not trained yet'
      : recency.daysAgo === 0
        ? 'today'
        : recency.daysAgo === 1
          ? 'yesterday'
          : `${String(recency.daysAgo)} days ago`
  return `${when} · ${String(recency.sets)} sets in ${String(RECENCY_DAYS)} days`
}
