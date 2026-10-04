/**
 * The session player's keys, for a desktop or a tablet with a keyboard.
 *
 * Enter or L logs the next set as planned, S skips it, E opens it, ← → or
 * J K move between exercises, Escape closes whatever is open, ? lists the
 * keys. **Nothing fires while typing** — a weight field would otherwise
 * log a set on its own Enter — except Escape, which is how you leave the
 * field. A held modifier is somebody else's shortcut.
 */
export type KeyAction = 'log' | 'skip' | 'edit' | 'next' | 'previous' | 'close' | 'help'

export const KEY_HELP: readonly (readonly [string, string])[] = [
  ['Enter / L', 'Log the next set as planned'],
  ['E', 'Open the next set to edit'],
  ['S', 'Skip the next set'],
  ['→ / J', 'Next exercise'],
  ['← / K', 'Previous exercise'],
  ['Esc', 'Close the editor or the rest timer'],
  ['?', 'Show these keys'],
]

export interface KeyPress {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  /** Whether focus is in something you type into. */
  readonly typing: boolean
}

export function keyActionFor(press: KeyPress): KeyAction | undefined {
  if (press.key === 'Escape') return 'close'
  if (press.typing || press.ctrlKey || press.metaKey || press.altKey) return undefined
  switch (press.key.toLowerCase()) {
    case 'enter':
    case 'l':
      return 'log'
    case 's':
      return 'skip'
    case 'e':
      return 'edit'
    case 'arrowright':
    case 'j':
      return 'next'
    case 'arrowleft':
    case 'k':
      return 'previous'
    case '?':
      return 'help'
    default:
      return undefined
  }
}

/**
 * Whether an element takes keys of its own — typed text, or a slider's
 * arrows (the weight dial) — so the player's shortcuts leave them be.
 */
export function isTypingIn(element: Element | null): boolean {
  if (element === null) return false
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (element.getAttribute('role') === 'slider') return true
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
