import { cva } from 'class-variance-authority'

/**
 * Style recipes, kept apart from the components that use them.
 *
 * Not an aesthetic decision: a file exporting both a component and a
 * constant breaks React Fast Refresh, so the split is what keeps editing
 * a button from reloading the whole app. It also lets a `Link` wear a
 * button's appearance without pretending to be one, which matters for
 * screen readers — a link that navigates should be a link.
 */
export const buttonStyles = cva(
  'tap-target inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-accent-500 text-black hover:bg-accent-400 active:bg-accent-600',
        secondary: 'bg-ink-800 text-ink-50 hover:bg-ink-700',
        ghost: 'text-ink-300 hover:bg-ink-850 hover:text-ink-50',
        danger: 'bg-bad-500 text-black hover:opacity-90',
        outline: 'border border-ink-700 text-ink-100 hover:bg-ink-850',
      },
      size: {
        md: 'h-11',
        lg: 'h-14 text-base',
        sm: 'h-9 px-3 text-xs',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'secondary', size: 'md', full: false },
  },
)

export const badgeStyles = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-ink-800 text-ink-300',
        accent: 'bg-accent-500/15 text-accent-400',
        good: 'bg-good-500/15 text-good-500',
        warn: 'bg-warn-500/15 text-warn-500',
        bad: 'bg-bad-500/15 text-bad-500',
        cool: 'bg-cool-500/15 text-cool-500',
        /*
         * A sub-category, not a category. Outlined rather than filled so
         * it reads as subordinate to the badge beside it whatever the
         * colours are doing — the hierarchy should survive being
         * photographed in greyscale.
         */
        sub: 'border border-ink-700 text-ink-500',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)
