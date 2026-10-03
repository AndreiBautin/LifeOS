import type { ReactNode } from 'react'

import { usePageSwipe } from './usePageSwipe'

/** The exercise card, turned by a sideways swipe; see `usePageSwipe`. */
export function SwipePager({
  onNext,
  onPrevious,
  children,
}: {
  readonly onNext: () => void
  readonly onPrevious: () => void
  readonly children: ReactNode
}) {
  const swipe = usePageSwipe(onNext, onPrevious)
  return (
    <section className="card touch-pan-y p-4 lg:p-6" aria-labelledby="exercise-name" {...swipe}>
      {children}
    </section>
  )
}
