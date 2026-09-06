import { describe, expect, it } from 'vitest'

import { createAccountHolder, requireAccount } from './account-holder'

describe('holding the signed-in account', () => {
  it('is empty until somebody signs in', () => {
    expect(createAccountHolder().current()).toBeUndefined()
  })

  it('hands back the uid it was given', () => {
    const holder = createAccountHolder()
    holder.set('owner')

    expect(holder.current()).toBe('owner')
  })

  /*
   * Signing out has to clear it. Left set, the next reader would go on
   * writing to the account that just left.
   */
  it('clears on sign-out', () => {
    const holder = createAccountHolder()
    holder.set('owner')
    holder.set(undefined)

    expect(holder.current()).toBeUndefined()
  })

  /*
   * **Refusing beats returning empty**, and the alternative is worse than
   * it looks: a repository that read `users/undefined/...` would work,
   * return nothing, and look exactly like an account with no data.
   */
  it('refuses to name an account before there is one', () => {
    expect(() => requireAccount(createAccountHolder())).toThrow(/No account is signed in/)
  })

  it('says nothing about the failure once an account is set', () => {
    const holder = createAccountHolder()
    holder.set('owner')

    expect(requireAccount(holder)).toBe('owner')
  })
})
