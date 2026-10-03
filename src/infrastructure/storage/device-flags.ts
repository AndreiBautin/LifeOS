/**
 * One-bit, device-local facts — "this device dismissed that" — which must
 * not travel with the settings, because a phone and a desktop answer them
 * differently. Any failure reads as unset rather than throwing.
 */
export function readFlag(key: string, storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function setFlag(key: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(key, '1')
  } catch {
    // A private window may refuse; the card simply comes back next time.
  }
}
