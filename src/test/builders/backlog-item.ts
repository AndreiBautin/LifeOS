import { createItem, type CreateItemInput, type Item } from '@/domain/backlog/item'

let sequence = 0

/**
 * A valid backlog `Item` for tests, with every field overridable.
 *
 * The clock and id generator are fixed rather than defaulted away — the
 * domain no longer accepts a missing one, and a builder that quietly
 * reached for the real clock is what makes a test fail at midnight.
 */
export function buildItem(overrides: Partial<Item> = {}): Item {
  sequence += 1

  const input: CreateItemInput = {
    title: overrides.title ?? `Test Item ${sequence.toString()}`,
    category: overrides.category ?? 'games',
  }

  const base = createItem(input, {
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
    ids: { next: () => `test-item-${sequence.toString()}` },
  })

  return { ...base, ...overrides }
}
