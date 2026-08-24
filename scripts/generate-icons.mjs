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
const BAR = [0xef, 0xf1, 0xf5, 0xff]
const PLATE = [0xe8, 0x7a, 0x3c, 0xff]

/**
 * A barbell, drawn from rectangles.
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

  // Bar
  rect(0.12, 0.47, 0.76, 0.06, BAR)
  // Inner plates
  rect(0.24, 0.34, 0.08, 0.32, PLATE)
  rect(0.68, 0.34, 0.08, 0.32, PLATE)
  // Outer plates
  rect(0.15, 0.39, 0.06, 0.22, PLATE)
  rect(0.79, 0.39, 0.06, 0.22, PLATE)
  // Collars
  rect(0.33, 0.44, 0.03, 0.12, BAR)
  rect(0.64, 0.44, 0.03, 0.12, BAR)

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

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0a0a0b"/>
  <rect x="12" y="47" width="76" height="6" fill="#eff1f5"/>
  <rect x="24" y="34" width="8" height="32" fill="#e87a3c"/>
  <rect x="68" y="34" width="8" height="32" fill="#e87a3c"/>
  <rect x="15" y="39" width="6" height="22" fill="#e87a3c"/>
  <rect x="79" y="39" width="6" height="22" fill="#e87a3c"/>
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
