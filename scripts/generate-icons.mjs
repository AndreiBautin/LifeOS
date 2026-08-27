import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Generates the PWA icons.
 *
 * Written by hand rather than pulled from a design tool so the icons are
 * reproducible from the repository — a binary checked in with no source
 * is a file nobody can ever change. It encodes PNG directly (a bitmap,
 * one zlib stream, three chunks), which avoids adding an image library to
 * the dependency tree for four files that change roughly never.
 *
 * Run with: node scripts/generate-icons.mjs
 */

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BACKGROUND = [0x0a, 0x0a, 0x0b, 0xff]
/** Levels already reached. */
const CLIMBED = [0xe8, 0x7a, 0x3c, 0xff]
/** The one you are on. */
const CURRENT = [0xef, 0xf1, 0xf5, 0xff]

/**
 * Four ascending bars: a level, going up.
 *
 * It was a barbell, which stopped being right when five other areas were
 * absorbed and the app stopped being about training. What every area now
 * has in common is a level that rises, so that is what the icon shows —
 * three bars in the accent for ground covered and a taller one in white
 * for where you are.
 *
 * Four bars rather than six-for-six-areas, deliberately. A favicon is
 * sixteen pixels across and six bars at that size is a smear; the icon has
 * to survive being small far more than it needs to be a diagram.
 *
 * `safeInset` shrinks the glyph for the maskable variant: Android crops a
 * maskable icon to whatever shape the launcher uses, and anything outside
 * the middle 80% can be cut off. Drawing the same glyph smaller is how
 * one design serves both.
 */
function drawIcon(size, { safeInset = 0 } = {}) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let i = 0; i < size * size; i += 1) {
    pixels.set(BACKGROUND, i * 4)
  }

  const scale = (1 - safeInset * 2) * size
  const offset = safeInset * size

  const rect = (x, y, w, h, colour) => {
    const x0 = Math.round(offset + x * scale)
    const y0 = Math.round(offset + y * scale)
    const x1 = Math.round(offset + (x + w) * scale)
    const y1 = Math.round(offset + (y + h) * scale)

    for (let py = Math.max(0, y0); py < Math.min(size, y1); py += 1) {
      for (let px = Math.max(0, x0); px < Math.min(size, x1); px += 1) {
        pixels.set(colour, (py * size + px) * 4)
      }
    }
  }

  /*
   * Bottom-aligned on one baseline, 0.13 wide with 0.06 between them, so
   * the group spans 0.15 to 0.85 and sits centred without a magic offset.
   *
   * Those two numbers are what a 16-pixel favicon can hold: 0.13 is very
   * nearly two pixels and 0.06 is very nearly one, which is the narrowest
   * gap that still separates four bars instead of merging them into a
   * block. Widening the bars costs the gaps and vice versa — there is no
   * slack here at all.
   */
  const BASE = 0.82
  const bar = (x, height, colour) => {
    rect(x, BASE - height, 0.13, height, colour)
  }

  bar(0.15, 0.2, CLIMBED)
  bar(0.34, 0.34, CLIMBED)
  bar(0.53, 0.48, CLIMBED)
  bar(0.72, 0.62, CURRENT)

  return pixels
}

function encodePng(size, pixels) {
  // Each scanline is prefixed with its filter byte; 0 means "no filter",
  // which costs some size and keeps the encoder to a dozen lines.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0)

  return Buffer.concat([length, typeAndData, crc])
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return crc ^ -1
}

// The same four bars, at the same coordinates times 100.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0a0a0b"/>
  <rect x="15" y="62" width="13" height="20" fill="#e87a3c"/>
  <rect x="34" y="48" width="13" height="34" fill="#e87a3c"/>
  <rect x="53" y="34" width="13" height="48" fill="#e87a3c"/>
  <rect x="72" y="20" width="13" height="62" fill="#eff1f5"/>
</svg>
`

mkdirSync(OUT_DIR, { recursive: true })

for (const size of [192, 512]) {
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), encodePng(size, drawIcon(size)))
}

// Maskable: same glyph, inset into the safe zone so a circular or
// squircle launcher mask cannot clip it.
writeFileSync(
  join(OUT_DIR, 'icon-maskable-512.png'),
  encodePng(512, drawIcon(512, { safeInset: 0.1 })),
)

writeFileSync(join(OUT_DIR, 'favicon.svg'), FAVICON_SVG)

process.stdout.write(`Wrote 4 icons to ${OUT_DIR}\n`)
