import type { VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { badgeStyles, buttonStyles } from './styles'

/**
 * The handful of primitives the whole app is built from.
 *
 * Kept small on purpose. A component library grown ahead of need is a
 * component library nobody can remember the shape of — and every control
 * here has to clear a 44px touch target and a visible focus ring, which
 * is easier to guarantee across six components than sixty.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>

export function Button({ className, variant, size, full, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size, full }), className)} {...props} />
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-4', className)} {...props} />
}

interface SectionProps {
  readonly title: string
  readonly description?: string | undefined
  readonly action?: ReactNode
  readonly children: ReactNode
}

export function Section({ title, description, action, children }: SectionProps) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        {/*
          A lit rule beside the heading, so a section reads as a panel
          rather than as a paragraph that happens to be bold. It is
          `aria-hidden` and carries no meaning — the heading is still the
          heading, and a screen reader gets exactly what it did before.
        */}
        <div
          className="min-w-0 border-l-2 pl-2.5"
          style={{ borderColor: 'var(--color-accent-500)' }}
        >
          <h2 className="text-ink-50 text-lg font-semibold tracking-tight">{title}</h2>
          {description !== undefined && (
            <p className="text-ink-500 mt-0.5 text-sm">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label: string
  /** Shown greyed inside the field — last time's number, or the prescription. */
  readonly hint?: string | undefined
}

/**
 * The control the app is used through more than any other.
 *
 * `inputMode="decimal"` rather than `type="number"` semantics alone,
 * because it summons a numeric keypad on iOS without the spinner
 * arrows, which are unusable with a thumb and steal width from the value.
 */
export function NumberField({ label, hint, className, id, ...props }: NumberFieldProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <label htmlFor={fieldId} className="block">
      <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <input
        id={fieldId}
        type="number"
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          'numeric bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-14 w-full rounded-xl border px-3 text-center text-2xl font-semibold',
          className,
        )}
        placeholder={hint}
        {...props}
      />
    </label>
  )
}

/**
 * A slot waiting to be filled, rather than a paragraph apologising.
 *
 * Worth more care than it looks: on a database that is mostly empty —
 * which every database is for the first weeks — these are the majority
 * of what is on screen, so "the app looks unfinished" and "the app is
 * new" are the same picture unless this one component distinguishes
 * them. A dashed edge and a marked centre read as a space with a shape,
 * the way an empty inventory slot does.
 *
 * The dashed border replaces the card's own solid one, so an empty state
 * never reads as a filled panel that happens to contain a sentence.
 */
export function Empty({
  title,
  children,
}: {
  readonly title: string
  readonly children?: ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center rounded-[0.875rem] border border-dashed px-4 py-6 text-center"
      style={{
        borderColor: 'color-mix(in oklab, var(--color-accent-500) 22%, var(--border-subtle))',
        backgroundImage:
          'radial-gradient(80% 60% at 50% 0%, color-mix(in oklab, var(--color-accent-500) 6%, transparent), transparent 70%)',
      }}
    >
      <span
        aria-hidden
        className="border-ink-700 text-ink-700 mb-3 flex h-8 w-8 items-center justify-center rounded-full border border-dashed text-lg leading-none"
      >
        +
      </span>
      <p className="text-ink-100 font-medium">{title}</p>
      {children !== undefined && (
        <div className="text-ink-500 mt-1.5 max-w-prose text-sm">{children}</div>
      )}
    </div>
  )
}

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />
}
