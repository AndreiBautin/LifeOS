/**
 * Silhouettes for the pools.
 *
 * Asked for as _"if you can find cool icons that match the avatar ones
 * that would be amazing"_ — and the honest statement of what these are
 * matters more than the flattering one.
 *
 * **These are not game-icons.net art and must not be credited as such.**
 * The avatar figures in `features/character/figures.ts` genuinely are:
 * Lorc and Delapouite's work under CC BY 3.0, credited at the foot of
 * Settings. These are plain shapes drawn for this app, on the same 512
 * viewBox and at a similar weight so they sit beside the figures without
 * clashing — a family resemblance rather than the same hand.
 *
 * The distinction is not pedantry. The credit in Settings names a
 * source; quietly widening it to cover work those artists did not make
 * would make the one attribution this app carries untrue.
 *
 * **If real game-icons art is wanted here**, the route is the one
 * `figures.ts` took: pick the icons, copy their paths in, and the
 * existing credit already covers them. Until then nothing is claimed.
 *
 * Committed as paths either way, so no outbound host was added for an
 * icon. Each host in this app is a decision.
 */

export interface PoolIcon {
  readonly id: string
  readonly label: string
  readonly path: string
}

/**
 * The default when nothing is chosen.
 *
 * A plain flask, because it is the one shape that reads as "a measure of
 * something" whatever the pool turns out to hold.
 */
export const DEFAULT_POOL_ICON = 'flask'

export const POOL_ICONS: readonly PoolIcon[] = [
  {
    id: 'flask',
    label: 'Flask',
    path: 'M208 32v138.7L88.6 400.4C74 428.5 94.4 462 126.1 462h259.8c31.7 0 52.1-33.5 37.5-61.6L304 170.7V32h-96zm32 32h32v114.7l6.6 12.7L390.6 416H121.4l112-206.6 6.6-12.7V64z',
  },
  {
    id: 'potion',
    label: 'Potion',
    path: 'M192 32v64h-32v48c0 24-32 56-32 120v96c0 66 54 102 128 102s128-36 128-102v-96c0-64-32-96-32-120V96h-32V32H192zm32 32h64v32h-64V64zm-32 64h128v16c0 40 32 72 32 120v96c0 40-38 70-96 70s-96-30-96-70v-96c0-48 32-80 32-120v-16z',
  },
  {
    id: 'coffee',
    label: 'Coffee',
    path: 'M96 128v192c0 53 43 96 96 96h96c53 0 96-43 96-96v-32h16c44 0 80-36 80-80s-36-80-80-80h-16v-32H96v32zm32 0h224v192c0 35-29 64-64 64h-96c-35 0-64-29-64-64V128zm256 32h16c26 0 48 22 48 48s-22 48-48 48h-16v-96zM96 448v32h288v-32H96z',
  },
  {
    id: 'beer',
    label: 'Beer',
    path: 'M128 64v352c0 18 14 32 32 32h160c18 0 32-14 32-32V160h32c26 0 48 22 48 48v96c0 26-22 48-48 48v32c44 0 80-36 80-80v-96c0-44-36-80-80-80h-32V64H128zm32 32h160v320H160V96zm32 48v224h32V144h-32zm64 0v224h32V144h-32z',
  },
  {
    id: 'leaf',
    label: 'Leaf',
    path: 'M432 64C240 64 96 160 96 320c0 40 10 74 26 102l32-26c-16-26-26-52-26-76 0-128 116-224 272-224 0 96-48 176-128 224-40 24-80 32-112 32v32c40 0 88-10 136-38 96-56 152-152 152-282h-16z',
  },
  {
    id: 'droplet',
    label: 'Water',
    path: 'M256 32S96 224 96 320c0 88 72 160 160 160s160-72 160-160c0-96-160-288-160-288zm0 62c22 29 58 79 89 132 33 57 39 84 39 94 0 70-58 128-128 128s-128-58-128-128c0-10 6-37 39-94 31-53 67-103 89-132z',
  },
  {
    id: 'apple',
    label: 'Fruit',
    path: 'M256 96c-16-32-48-48-80-48 0 32 16 60 44 74-52 6-92 50-92 110 0 88 64 208 128 208s128-120 128-208c0-60-40-104-92-110 28-14 44-42 44-74-32 0-64 16-80 48zm0 168c48 0 96 40 96 88 0 66-52 152-96 152s-96-86-96-152c0-48 48-88 96-88z',
  },
  {
    id: 'carrot',
    label: 'Vegetable',
    path: 'M400 64c-32 0-64 16-80 48-16-32-48-48-80-48 0 26 11 50 30 66l-158 222c-14 20 8 42 28 28l222-158c16 19 40 30 66 30 0-32-16-64-48-80 32-16 48-48 48-80h-28zM268 200l44 44-150 106 106-150z',
  },
  {
    id: 'smoke',
    label: 'Smoke',
    path: 'M96 352h288c44 0 80-36 80-80s-36-80-80-80c-8-56-56-96-112-96-48 0-90 30-106 74-42 6-74 42-74 86 0 20 6 38 16 54l-12 42zm32-32c-6-12-10-26-10-40 0-30 24-54 54-54h14l4-14c10-34 42-58 78-58 42 0 78 30 84 72l4 22 22-4c4 0 8-2 12-2 26 0 48 22 48 48s-22 48-48 48H128v-18zM96 416v32h320v-32H96z',
  },
  {
    id: 'bolt',
    label: 'Energy',
    path: 'M288 32L128 288h96l-32 192 192-288h-96l32-160h-32z',
  },
]

/**
 * The flask, kept as a value rather than looked up.
 *
 * `poolIcon` has to return something for an unknown id, and a lookup
 * that could itself come back empty would need a non-null assertion —
 * which the lint rule forbids, correctly: it is a promise the compiler
 * cannot check. Naming the fallback directly makes the guarantee real.
 */
const FALLBACK: PoolIcon = {
  id: DEFAULT_POOL_ICON,
  label: 'Flask',
  path: 'M208 32v138.7L88.6 400.4C74 428.5 94.4 462 126.1 462h259.8c31.7 0 52.1-33.5 37.5-61.6L304 170.7V32h-96zm32 32h32v114.7l6.6 12.7L390.6 416H121.4l112-206.6 6.6-12.7V64z',
}

export function poolIcon(id: string | undefined): PoolIcon {
  return POOL_ICONS.find((one) => one.id === id) ?? FALLBACK
}
