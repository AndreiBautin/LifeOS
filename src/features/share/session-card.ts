/**
 * A finished session as a picture: 1080 × 1350, the 4:5 a phone's feed
 * and its photo roll both take without cropping.
 *
 * **Drawn on a canvas rather than screenshotted**, because a screenshot
 * of the report is a picture of a web page — scroll position, status
 * bar, a half-visible button — and this is made to be looked at on its
 * own. It carries the session's name, its date, the three numbers the
 * report leads with, the volume in pictures, and up to four records.
 *
 * The colours are the app's tokens as literals: a canvas cannot read CSS
 * custom properties, and a share image that silently drew black on black
 * because a variable did not resolve would be worse than one copy of the
 * palette here.
 */
export interface ShareCard {
  /** The small line on top; a session's card says "Session complete". */
  readonly eyebrow?: string
  /** Replaces the long date under the title — "18 sessions · 64 hours". */
  readonly dateLine?: string
  readonly title: string
  /** A day key. */
  readonly date: string
  readonly sets: number
  /** Already formatted with its unit: "14,620 lb". */
  readonly volume: string
  readonly minutes?: number | undefined
  /** The third figure's name when it is not minutes — a month says hours. */
  readonly timeLabel?: string
  /** "about 1.1 African elephants", when there is one. */
  readonly heft?: string | undefined
  /** The heading over the list; "New records" by default. */
  readonly recordsHeading?: string | undefined
  readonly records: readonly {
    readonly name: string
    readonly detail: string
    readonly label: string
  }[]
}

const W = 1080
const H = 1350
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif"
const INK_50 = '#f2f4f8'
const INK_300 = '#aab1bf'
const INK_500 = '#79808f'
const INK_800 = '#2b2f38'
const ACCENT = '#5ccad9'
const GOLD = '#f0c35a'

export function drawShareCard(card: ShareCard): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (ctx === null) return Promise.reject(new Error('No 2D canvas here.'))

  // Background: the page's near-black, lit from the top corner.
  ctx.fillStyle = '#0d0f13'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W)
  glow.addColorStop(0, 'rgba(92, 202, 217, 0.28)')
  glow.addColorStop(1, 'rgba(92, 202, 217, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const left = 88
  let y = 140

  ctx.fillStyle = ACCENT
  ctx.font = `600 30px ${FONT}`
  ctx.fillText((card.eyebrow ?? 'Session complete').toUpperCase(), left, y)

  y += 100
  ctx.fillStyle = INK_50
  ctx.font = `700 92px ${FONT}`
  y = wrap(ctx, card.title, left, y, W - left * 2, 104)

  y += 56
  ctx.fillStyle = INK_300
  ctx.font = `400 36px ${FONT}`
  ctx.fillText(card.dateLine ?? longDate(card.date), left, y)

  // Three numbers, the report's own.
  y += 110
  const stats: readonly (readonly [string, string])[] = [
    ['SETS', String(card.sets)],
    ['VOLUME', card.volume],
    [
      (card.timeLabel ?? 'Minutes').toUpperCase(),
      card.minutes === undefined ? '—' : String(card.minutes),
    ],
  ]
  const column = (W - left * 2) / stats.length
  stats.forEach(([label, value], at) => {
    const x = left + column * at
    ctx.fillStyle = INK_500
    ctx.font = `600 26px ${FONT}`
    ctx.fillText(label, x, y)
    ctx.fillStyle = INK_50
    ctx.font = `700 56px ${FONT}`
    ctx.fillText(value, x, y + 72, column - 32)
  })
  y += 120

  if (card.heft !== undefined) {
    y += 64
    ctx.fillStyle = INK_300
    ctx.font = `400 34px ${FONT}`
    ctx.fillText(`You moved ${card.heft}.`, left, y, W - left * 2)
  }

  // Records, gold: ahead of every time before.
  const records = card.records.slice(0, 4)
  if (records.length > 0) {
    y += 90
    ctx.strokeStyle = INK_800
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(left, y - 40)
    ctx.lineTo(W - left, y - 40)
    ctx.stroke()

    ctx.fillStyle = GOLD
    ctx.font = `600 28px ${FONT}`
    ctx.fillText(
      `★ ${(card.recordsHeading ?? (records.length === 1 ? 'New record' : 'New records')).toUpperCase()}`,
      left,
      y + 10,
    )
    y += 30
    for (const record of records) {
      y += 76
      ctx.fillStyle = INK_50
      ctx.font = `600 38px ${FONT}`
      ctx.fillText(record.name, left, y, W - left * 2 - 260)
      ctx.fillStyle = GOLD
      ctx.font = `600 34px ${FONT}`
      ctx.textAlign = 'right'
      ctx.fillText(record.detail, W - left, y)
      ctx.textAlign = 'left'
      ctx.fillStyle = INK_500
      ctx.font = `400 26px ${FONT}`
      ctx.fillText(record.label, left, y + 36)
      y += 20
    }
  }

  ctx.fillStyle = INK_500
  ctx.font = `600 28px ${FONT}`
  ctx.fillText('LiftOS', left, H - 80)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('The image could not be made.'))
      else resolve(blob)
    }, 'image/png')
  })
}

/** Wraps a heading onto as many lines as it needs; returns the last baseline. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
): number {
  const words = text.split(' ')
  let line = ''
  let baseline = y
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`
    if (ctx.measureText(next).width > width && line !== '') {
      ctx.fillText(line, x, baseline)
      line = word
      baseline += lineHeight
    } else {
      line = next
    }
  }
  ctx.fillText(line, x, baseline)
  return baseline
}

function longDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
