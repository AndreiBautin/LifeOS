import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Cards laid into as many columns as the width holds, each card placed
 * in whichever column is currently shortest.
 *
 * **Placed by measured height, not by a column the page picked.** Today
 * used to hand-assign its cards to fixed columns, and a fixed split is
 * only balanced at the one width it was tuned for: at half a desktop
 * screen the readouts collapsed to one column and ran three times the
 * height of the portrait beside them. Reported as _"the second column
 * has a lot more content than the first."_
 *
 * **One grid, never several column divs.** Moving a card between two
 * sibling columns would remount it and lose whatever it was holding
 * open. Here every card stays a child of one grid; only its
 * `grid-column` and its row span change. Rows are one pixel, so a span
 * is a height, and `dense` flow puts each card at the top of the free
 * space in its column — which, filled in order, is directly under the
 * card before it.
 *
 * Below `minColumn` × 2 of width it is a plain stack, so the phone
 * layout does not change at all.
 */
export function Masonry({
  items,
  minColumn = 360,
  gap = 24,
  columnGap = 32,
}: {
  readonly items: readonly { readonly key: string; readonly node: ReactNode }[]
  readonly minColumn?: number
  readonly gap?: number
  readonly columnGap?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const inner = useRef(new Map<string, HTMLDivElement>())
  const [layout, setLayout] = useState<{
    readonly columns: number
    readonly heights: readonly number[]
  }>({ columns: 1, heights: [] })

  // Keyed on the card list rather than the array, which is rebuilt every render.
  const keys = items.map((item) => item.key).join('|')
  const measure = useCallback(() => {
    const element = container.current
    if (element === null) return
    const width = element.clientWidth
    const columns = Math.max(1, Math.floor((width + columnGap) / (minColumn + columnGap)))
    const heights = keys.split('|').map((key) => inner.current.get(key)?.offsetHeight ?? 0)
    setLayout((previous) =>
      previous.columns === columns &&
      previous.heights.length === heights.length &&
      previous.heights.every((h, i) => h === heights[i])
        ? previous
        : { columns, heights },
    )
  }, [keys, minColumn, columnGap])

  // Before paint, so the first frame is already balanced.
  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (container.current !== null) observer.observe(container.current)
    for (const node of inner.current.values()) observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const stacked = layout.columns === 1
  const filled = Array.from({ length: layout.columns }, () => 0)
  const placement = items.map((_, index) => {
    const height = layout.heights[index] ?? 0
    // A card that renders nothing takes no space and no gap.
    const span = height === 0 ? 1 : Math.ceil(height) + gap
    const column = filled.indexOf(Math.min(...filled))
    filled[column] = (filled[column] ?? 0) + span
    return { column, span }
  })

  return (
    <div
      ref={container}
      style={
        stacked
          ? undefined
          : {
              display: 'grid',
              gridTemplateColumns: `repeat(${String(layout.columns)}, minmax(0, 1fr))`,
              gridAutoRows: '1px',
              gridAutoFlow: 'row dense',
              columnGap,
              alignItems: 'start',
            }
      }
    >
      {items.map((item, index) => {
        const place = placement[index]
        return (
          <div
            key={item.key}
            style={
              stacked || place === undefined
                ? { paddingBottom: (layout.heights[index] ?? 0) > 0 ? gap : 0 }
                : {
                    gridColumn: String(place.column + 1),
                    gridRow: `span ${String(place.span)}`,
                  }
            }
          >
            <div
              ref={(node) => {
                if (node === null) inner.current.delete(item.key)
                else inner.current.set(item.key, node)
              }}
            >
              {item.node}
            </div>
          </div>
        )
      })}
    </div>
  )
}
