import type { ReactNode } from 'react'

import { useMorph } from './morph'

/**
 * The words inside a link that become the heading of the page it opens.
 * See `morph.ts`: named only while that transition runs.
 */
export function MorphText({
  to,
  name,
  className,
  children,
}: {
  readonly to: string
  readonly name: string
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <span className={className} style={useMorph(to, name)}>
      {children}
    </span>
  )
}
