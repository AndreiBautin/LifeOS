import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createAccountHolder } from '@/infrastructure/firestore/account-holder'

/*
 * The account has to be in the holder *before* any child renders.
 *
 * This is the bug the test exists for, and it looked nothing like a
 * crash: the gate set the holder in a `useEffect`, effects run after the
 * commit, so every screen below mounted and fired its queries against an
 * empty holder. Each threw, and with `retry: false` sat in error with
 * `data` undefined — the same state a card draws a skeleton for. The
 * whole app came up as placeholders on a device that had signed in
 * perfectly well.
 *
 * Firebase is stubbed rather than reached: what is under test is the
 * order of two things in one render, not authentication.
 */
const account = { uid: 'owner', email: 'owner@example.com' }
const holder = createAccountHolder()

vi.mock('@/features/sync/useSync', () => ({
  useSyncConfig: () => ({ kind: 'configured', config: {} }),
  useAccount: () => ({ account, ready: true }),
  useSignIn: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSignOut: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/app/context', () => ({
  useServices: () => ({ account: holder }),
}))

vi.mock('@/config/access', () => ({
  readAccessConfig: () => ({ kind: 'open' }),
}))

const { AuthGate } = await import('./AuthGate')

/** Records what the holder said at the moment it first rendered. */
function Child() {
  return <span>uid at mount: {String(holder.current())}</span>
}

describe('handing the account to the repositories', () => {
  it('has set it before a child renders', () => {
    render(
      <AuthGate>
        <Child />
      </AuthGate>,
    )

    expect(screen.getByText('uid at mount: owner')).toBeDefined()
  })
})
