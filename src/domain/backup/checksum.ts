/**
 * A checksum over a backup's contents.
 *
 * The failure this defends against is not tampering — nobody is attacking
 * a file the lifter exported to their own phone. It is a *truncated or
 * partially written* file: a download interrupted, a sync that copied
 * half of it, a filesystem that filled up mid-write. Such a file parses
 * as valid JSON right up to the point it stops, and importing it would
 * quietly restore three years of training with the last six months
 * missing.
 *
 * FNV-1a is chosen deliberately over a cryptographic hash: it is a few
 * lines, needs no async Web Crypto call, and detects truncation and
 * corruption reliably. Using SHA-256 here would imply a security property
 * this does not have and does not need.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function checksumOf(value: unknown): string {
  return fnv1a(canonicalJson(value))
}

export function verifyChecksum(value: unknown, expected: string): boolean {
  // An older or hand-edited file may carry no checksum. Treat that as
  // unverified rather than corrupt — refusing it outright would make a
  // recoverable backup unrecoverable.
  if (expected === '') return true
  return checksumOf(value) === expected
}

function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    // `Math.imul` keeps the multiply in 32-bit space; a plain `*` would
    // overflow into a float and silently stop being a hash.
    hash = Math.imul(hash, FNV_PRIME)
  }

  // Length is mixed in so that a truncation which happens to collide on
  // the rolling hash still changes the result.
  hash ^= input.length
  hash = Math.imul(hash, FNV_PRIME)

  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * JSON with object keys in a stable order.
 *
 * `JSON.stringify` preserves insertion order, so two objects holding
 * identical data serialise differently depending on how they were built —
 * which would make the checksum fail on a file that is perfectly intact.
 */
export function canonicalJson(value: unknown): string {
  // `JSON.stringify` returns undefined for undefined and for a function,
  // which would concatenate as the literal text "undefined" and make the
  // hash depend on a value JSON cannot represent anyway.
  if (value === undefined || typeof value === 'function') return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)

  return `{${entries.join(',')}}`
}
