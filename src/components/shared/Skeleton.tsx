import { cn } from '@/lib/cn'

/**
 * The shape of something that has not arrived yet.
 *
 * Its job is to hold the layout, not to entertain. Screens here rendered
 * nothing at all until their query resolved, so opening the app was a
 * blank page that snapped into a full one — and worse than the flicker
 * is that anything you were reaching for moved under your thumb as the
 * real content pushed it down. A placeholder of the right size means the
 * page is built before it is filled.
 *
 * Given a `label` it announces itself politely; without one it is
 * `aria-hidden`, which is right when a heading beside it already says
 * what is loading. The default is hidden, because most of these sit
 * inside a card whose title is already on screen.
 */
export function Skeleton({
  className,
  label,
}: {
  readonly className?: string
  readonly label?: string
}) {
  return (
    <div
      className={cn('skeleton', className)}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label })}
    />
  )
}
