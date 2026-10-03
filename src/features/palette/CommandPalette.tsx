import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { withViewTransition } from '@/app/view-transitions'
import { useExercises, useRecentWorkouts } from '@/features/train/hooks'
import { isTypingIn } from '@/features/train/keyboard'
import { cn } from '@/lib/cn'

import { rankItems, type PaletteItem } from './rank'

const PAGES: readonly PaletteItem[] = [
  { id: 'today', label: 'Today', kind: 'Page', keywords: 'home dashboard', to: '/today' },
  { id: 'program', label: 'Program', kind: 'Page', keywords: 'week plan deload', to: '/program' },
  { id: 'records', label: 'Records', kind: 'Page', keywords: 'bests prs', to: '/records' },
  {
    id: 'settings',
    label: 'Settings',
    kind: 'Page',
    keywords: 'units plates accent',
    to: '/settings',
  },
]

/**
 * Anywhere in the app, ⌘K (Ctrl+K) or / opens a box that goes to any page,
 * exercise or recent session by typing a few letters (`rankItems`).
 *
 * The app is one page with links off it, which is right on a phone and
 * slow at a desk, where getting to the deadlift's history meant scrolling
 * the dashboard to find a link to it. ↑ ↓ choose, Enter goes, Esc closes.
 * **The slash is ignored while typing**, so a search box elsewhere keeps its
 * slash; ⌘K is not, because nothing types it.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !isTypingIn(document.activeElement)
      if (!combo && !slash) return
      event.preventDefault()
      setOpen((now) => !now)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!open) return null
  return (
    <Palette
      onClose={() => {
        setOpen(false)
      }}
    />
  )
}

function Palette({ onClose }: { readonly onClose: () => void }) {
  const navigate = useNavigate()
  const exercises = useExercises()
  const workouts = useRecentWorkouts(30)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState(0)

  const items = useMemo((): readonly PaletteItem[] => {
    const exerciseItems = (exercises.data ?? [])
      .filter((exercise) => !exercise.isArchived)
      .map((exercise) => ({
        id: `exercise:${exercise.id}`,
        label: exercise.name,
        kind: 'Exercise',
        to: `/exercise/${exercise.id}`,
      }))
    const sessionItems = (workouts.data ?? [])
      .filter((log) => log.status !== 'in-progress')
      .map((log) => ({
        id: `session:${log.id}`,
        label: log.title,
        kind: shortDate(log.date),
        keywords: `session ${log.date} ${shortDate(log.date)}`,
        to: `/session/${log.id}`,
      }))
    return [...PAGES, ...exerciseItems, ...sessionItems]
  }, [exercises.data, workouts.data])

  const shown = rankItems(items, query)
  const at = Math.min(chosen, Math.max(0, shown.length - 1))

  const go = (item: PaletteItem | undefined) => {
    if (item === undefined) return
    onClose()
    withViewTransition(() => {
      void navigate(item.to)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Go to"
      className="bg-ink-950/70 fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="card w-full max-w-lg overflow-hidden p-0">
        <label className="border-ink-800 flex items-center gap-3 border-b px-4">
          <Search size={16} className="text-ink-500 shrink-0" aria-hidden />
          <span className="sr-only">Go to</span>
          <input
            autoFocus
            value={query}
            placeholder="Go to a page, an exercise, a session…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={shown[at] === undefined ? undefined : `palette-${String(at)}`}
            onChange={(event) => {
              setQuery(event.target.value)
              setChosen(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setChosen(Math.min(shown.length - 1, at + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setChosen(Math.max(0, at - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                go(shown[at])
              } else if (event.key === 'Escape') {
                onClose()
              }
            }}
            className="text-ink-50 placeholder:text-ink-500 h-14 w-full bg-transparent text-base outline-none"
          />
          <kbd className="border-ink-700 text-ink-500 rounded border px-1.5 text-[0.65rem]">
            Esc
          </kbd>
        </label>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {shown.length === 0 && (
            <li className="text-ink-500 px-3 py-6 text-center text-sm">Nothing by that name.</li>
          )}
          {shown.map((item, index) => (
            <li
              key={item.id}
              id={`palette-${String(index)}`}
              role="option"
              aria-selected={index === at}
              onMouseEnter={() => {
                setChosen(index)
              }}
              onClick={() => {
                go(item)
              }}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm',
                index === at ? 'bg-accent-500/15 text-ink-50' : 'text-ink-300',
              )}
            >
              <span className="truncate">{item.label}</span>
              <span className="text-ink-500 shrink-0 text-xs">{item.kind}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
