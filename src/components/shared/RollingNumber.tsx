import { cn } from '@/lib/cn'

/**
 * A figure that rolls like an odometer when it changes: each digit is a
 * column of 0–9 slid to its value, so a count going 7 → 8 turns one wheel
 * rather than swapping text.
 *
 * **Digits are keyed from the right**, so 9 → 10 adds a wheel on the left
 * and the ones wheel rolls from 9 to 0 — keyed from the left, every wheel
 * would shift one place and roll to the wrong neighbour. Anything that is
 * not a digit (a colon, a slash) is drawn plainly.
 *
 * The wheels are `aria-hidden` and the value is read once as text, so a
 * screen reader hears "1:57" rather than forty digits. Reduced motion
 * collapses the transition with every other one in `index.css`, which
 * leaves the right digit showing.
 */
export function RollingNumber({
  value,
  className,
}: {
  readonly value: string | number
  readonly className?: string
}) {
  const text = String(value)
  const chars = text.split('')
  return (
    <span className={cn('relative inline-flex tabular-nums', className)}>
      <span className="sr-only">{text}</span>
      {chars.map((char, at) => {
        const key = chars.length - at
        const digit = /\d/.test(char) ? Number(char) : undefined
        return digit === undefined ? (
          <span key={`c${String(key)}`} aria-hidden>
            {char}
          </span>
        ) : (
          <span
            key={`d${String(key)}`}
            aria-hidden
            className="relative inline-block h-[1lh] overflow-hidden"
          >
            {/* Holds the wheel's width: one digit, invisible. */}
            <span className="invisible">0</span>
            <span
              className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: `translateY(${String(-digit * 10)}%)` }}
            >
              {DIGITS.map((one) => (
                <span key={one}>{one}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
