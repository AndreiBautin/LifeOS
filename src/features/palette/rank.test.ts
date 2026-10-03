import { describe, expect, it } from 'vitest'

import { rankItems, type PaletteItem } from './rank'

const item = (label: string, kind = 'Exercise', keywords?: string): PaletteItem => ({
  id: label,
  label,
  kind,
  to: `/${label}`,
  ...(keywords === undefined ? {} : { keywords }),
})

const items = [
  item('Settings', 'Page'),
  item('Barbell Curl'),
  item('Bench Press'),
  item('Legs B', 'Session', 'Sep 25 2026-09-25'),
]

describe('the command palette ranking', () => {
  it('puts a label starting with the query first', () => {
    expect(rankItems(items, 'be').map((one) => one.label)).toEqual(['Bench Press', 'Barbell Curl'])
    expect(rankItems(items, 'b')[0]?.label).toBe('Barbell Curl')
  })

  it('needs every word, and matches hidden keywords', () => {
    expect(rankItems(items, 'press bench').map((one) => one.label)).toEqual(['Bench Press'])
    expect(rankItems(items, 'sep 25').map((one) => one.label)).toEqual(['Legs B'])
  })

  it('offers the first few when nothing is typed', () => {
    expect(rankItems(items, '', 2).map((one) => one.label)).toEqual(['Settings', 'Barbell Curl'])
  })
})
