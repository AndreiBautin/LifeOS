import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges class names, with later Tailwind utilities winning over earlier
 * ones in the same group — so a variant's default padding can be
 * overridden at the call site without the two fighting.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
