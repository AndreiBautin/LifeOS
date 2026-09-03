/**
 * The disclosure control for rows a screen is not asking for.
 *
 * **Drawn rather than imported** so the open and closed states are one
 * shape with one line changing — a swap between two lucide icons reads
 * as two different controls at 16 pixels.
 *
 * Shared rather than copied: Today reveals what is done and not due, and
 * Base now reveals the same thing about the house. A second hand-drawn
 * eye is where the two would start disagreeing about which way the
 * stroke goes.
 */
export function EyeIcon({ open }: { readonly open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" strokeWidth="1.8" />
      {!open && <path d="M4 20 20 4" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}
