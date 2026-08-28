import { createContext, use } from 'react'

/**
 * A short-lived acknowledgement that an act was performed.
 *
 * Games acknowledge what you did; this app did not. Ticking a habit
 * changed a checkbox, finishing a session navigated away, and the XP
 * those acts paid appeared only if you went and looked at the character
 * sheet afterwards. The number was real the whole time and nothing said
 * so at the moment it was earned.
 *
 * **It reports, it does not reward.** The value shown is read out of
 * `domain/game/registry.ts` for the act that just happened, so this can
 * never announce a figure the tally will not agree with — and it fires
 * on an act, never on an outcome, which is the same line XP itself is
 * paid along.
 */
export interface XpAward {
  readonly id: number
  readonly points: number
  readonly label: string
}

export interface XpAwardContextValue {
  readonly awards: readonly XpAward[]
  /** Takes an act id from the registry. Unknown ids show nothing. */
  readonly award: (actId: string) => void
}

export const XpAwardContext = createContext<XpAwardContextValue | undefined>(undefined)

export function useXpAward(): XpAwardContextValue {
  const value = use(XpAwardContext)
  if (value === undefined) throw new Error('useXpAward used outside its provider')
  return value
}
