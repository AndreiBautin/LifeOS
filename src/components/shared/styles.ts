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
  'tap-target inline-flex items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-[color,filter] hover:brightness-125 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100',
  {
    variants: {
      variant: {
        /*
         * **Made of what the cards are made of** — see `.control-surface`
         * in `index.css` for why that is a gradient and a hairline rather
         * than `backdrop-filter`.
         *
         * Still the loudest thing on its screen, which is the constraint
         * the old solid fill was meeting and this had to keep meeting:
         * the tint is stronger, the text is the accent rather than the
         * ink, and it is the only variant that glows. What it stops being
         * is a block of flat cyan on a page with no other flat colour on
         * it.
         */
        /*
         * `accent-400`, and the first attempt at this said `accent-300`,
         * which **does not exist**. An undefined Tailwind colour compiles
         * to no declaration at all, so the label inherited
         * `--text-primary` and came out near-white — legible, plausible,
         * and not the colour anybody chose.
         *
         * That is the `--color-ink-600` bug this repository already
         * records, reproduced within a day of reading the note about it.
         * It was caught the only way it can be: by reading the *computed*
         * colour off the element rather than trusting the class name. The
         * scale is 400 / 500 / 600 — there is no 300.
         */
        primary:
          'control-surface control-surface-lit [--control-tint:var(--color-accent-500)] text-accent-400',
        secondary: 'control-surface [--control-tint:var(--color-ink-500)] text-ink-50',
        /*
         * Flat on purpose, and the only variant that is. A ghost is meant
         * to recede; giving it a surface would make every icon button on
         * a row read as something to press.
         */
        ghost: 'text-ink-300 hover:bg-ink-850 hover:text-ink-50',
        danger:
          'control-surface control-surface-lit [--control-tint:var(--color-bad-500)] text-bad-500',
        /*
         * A stronger fill than the rest, for the one control a screen is
         * for. The surface class takes a weight so "made of the same
         * stuff as the cards" does not collapse into "as quiet as the
         * cards" — see `--control-fill` in `index.css`.
         */
        outline: 'control-surface [--control-tint:var(--color-ink-500)] text-ink-100',
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
        // A ring on every badge, so a tone reads as a chip with an edge
        // rather than as tinted text. The neutral one gains the most: it
        // was a grey fill on a grey card.
        neutral: 'bg-ink-800 text-ink-300 ring-1 ring-ink-700',
        accent: 'bg-accent-500/15 text-accent-400 ring-1 ring-accent-500/30',
        good: 'bg-good-500/15 text-good-500 ring-1 ring-good-500/30',
        warn: 'bg-warn-500/15 text-warn-500 ring-1 ring-warn-500/30',
        bad: 'bg-bad-500/15 text-bad-500 ring-1 ring-bad-500/30',
        cool: 'bg-cool-500/15 text-cool-500 ring-1 ring-cool-500/30',
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
