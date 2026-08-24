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
        <div>
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

export function Empty({
  title,
  children,
}: {
  readonly title: string
  readonly children?: ReactNode
}) {
  return (
    <Card className="text-center">
      <p className="text-ink-100 font-medium">{title}</p>
      {children !== undefined && <div className="text-ink-500 mt-2 text-sm">{children}</div>}
    </Card>
  )
}

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeStyles>) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />
}
