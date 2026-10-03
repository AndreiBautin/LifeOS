import type { CSSProperties } from 'react'
import { useViewTransitionState } from 'react-router-dom'

/**
 * Shared-element transitions: the name you tapped grows into the heading
 * of the page it opens, and shrinks back into its row on the way back.
 *
 * **The name is only given while a transition to or from that link is
 * running** (`useViewTransitionState` answers both directions). A view
 * transition name must be unique on the page, and a history list holds
 * many rows — naming all of them permanently would abort every
 * transition. The heading on the target page carries its name always,
 * because there it is the only one.
 *
 * A browser without the API ignores the property; so does reduced
 * motion, through the block in `index.css`.
 */
export function morphName(kind: 'session' | 'exercise', id: string): string {
  return `${kind}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export function morphStyle(name: string): CSSProperties {
  return { viewTransitionName: name, viewTransitionClass: 'morph' }
}

export function useMorph(to: string, name: string): CSSProperties | undefined {
  return useViewTransitionState(to) ? morphStyle(name) : undefined
}
