/**
 * The meteorological season a date falls in — northern, on whole months.
 *
 * All that is left of the game's seasons: the backdrop's tint and the
 * drift of its particles change with the time of year. Nothing is scored
 * against a season any more.
 */
export const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const

export type Season = (typeof SEASONS)[number]

export function seasonOf(date: Date): Season {
  const month = date.getMonth() + 1
  if (month === 12 || month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'autumn'
}
