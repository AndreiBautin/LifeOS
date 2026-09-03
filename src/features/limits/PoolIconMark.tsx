import { poolIcon } from './pool-icons'

/**
 * One pool's silhouette.
 *
 * Drawn at the 512 viewBox the avatar figures use, so an icon beside a
 * pool and the figure in the portrait are the same weight of line.
 *
 * `aria-hidden`, because every row states its own name in text — the
 * picture is the redundant half, the same call the tech tree's
 * connectors make.
 */
export function PoolIconMark({
  icon,
  name,
  size = 20,
  className,
}: {
  readonly icon: string | undefined
  /**
   * The pool's name, used only when no icon was chosen.
   *
   * Every pool written before the icon field existed drew the same
   * flask; guessing from the name is what stops two substances sharing
   * one picture. A chosen icon always wins — see `poolIcon`.
   */
  readonly name?: string
  readonly size?: number
  readonly className?: string
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
    >
      <path d={poolIcon(icon, name).path} />
    </svg>
  )
}
