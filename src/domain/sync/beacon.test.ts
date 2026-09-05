import { describe, expect, it } from 'vitest'

import { isRemoteBeacon } from './beacon'

const ME = 'device-a'

describe('hearing the other device', () => {
  it('wakes for a beacon another device stamped', () => {
    expect(isRemoteBeacon({ hasPendingWrites: false, by: 'device-b' }, ME)).toBe(true)
  })

  /*
   * The loop this prevents: our own push wakes us, we sync, we push, we
   * wake again — costing reads continuously while looking exactly like
   * sync working properly.
   */
  it('ignores its own confirmed write', () => {
    expect(isRemoteBeacon({ hasPendingWrites: false, by: ME }, ME)).toBe(false)
  })

  it('ignores its own write before the server has it', () => {
    expect(isRemoteBeacon({ hasPendingWrites: true, by: ME }, ME)).toBe(false)
  })

  /*
   * A pending write from another device cannot happen — pending means
   * *this* client wrote it — but the flag is checked before the id
   * either way, so a surprising snapshot never triggers a sync.
   */
  it('ignores anything still pending, whoever it claims to be', () => {
    expect(isRemoteBeacon({ hasPendingWrites: true, by: 'device-b' }, ME)).toBe(false)
  })

  it('does not treat a missing beacon as a change', () => {
    expect(isRemoteBeacon({ hasPendingWrites: false }, ME)).toBe(false)
  })
})
