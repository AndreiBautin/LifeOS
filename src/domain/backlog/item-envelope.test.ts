import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import {
  createItemEnvelope,
  MAX_ENVELOPE_BYTES,
  MAX_ENVELOPE_ITEMS,
  parseItemEnvelope,
} from './item-envelope'

describe('createItemEnvelope / parseItemEnvelope', () => {
  it('round-trips a list of items with no warning', () => {
    const items = [buildItem(), buildItem({ category: 'books' })]

    const result = parseItemEnvelope(JSON.stringify(createItemEnvelope(items)))

    expect(result).toEqual({ items, warning: null, droppedCount: 0, envelopeValid: true })
  })

  it('round-trips an empty list', () => {
    const result = parseItemEnvelope(JSON.stringify(createItemEnvelope([])))

    expect(result).toEqual({
      items: [],
      warning: null,
      droppedCount: 0,
      envelopeValid: true,
    })
  })

  it('reports a warning instead of throwing on invalid JSON, and marks the envelope invalid', () => {
    const result = parseItemEnvelope('{not valid json')

    expect(result.items).toEqual([])
    expect(result.warning).not.toBeNull()
    expect(result.envelopeValid).toBe(false)
  })

  it('reports a warning for well-formed JSON that is not an item envelope, and marks it invalid', () => {
    const result = parseItemEnvelope(JSON.stringify({ some: 'other shape' }))

    expect(result.items).toEqual([])
    expect(result.warning).not.toBeNull()
    expect(result.envelopeValid).toBe(false)
  })

  it('drops individual malformed items but keeps the well-formed ones, marking the envelope valid', () => {
    const good = buildItem()
    const raw = JSON.stringify({
      version: 1,
      items: [good, { id: 'missing-fields' }],
    })

    const result = parseItemEnvelope(raw)

    expect(result.items).toEqual([good])
    expect(result.warning).not.toBeNull()
    expect(result.envelopeValid).toBe(true)
  })
})

describe('parseItemEnvelope daily-goal normalization', () => {
  /** Backlogs saved before daily goals existed have neither field. */
  function legacyRaw(overrides: Record<string, unknown> = {}): string {
    const { dailyProgress, dailyGoal, ...legacyItem } = buildItem()
    void dailyProgress
    void dailyGoal
    return JSON.stringify({ version: 1, items: [{ ...legacyItem, ...overrides }] })
  }

  it('gives an item saved before daily goals an empty progress log', () => {
    const { items, warning } = parseItemEnvelope(legacyRaw())

    expect(items[0]?.dailyProgress).toEqual([])
    expect(warning).toBeNull()
  })

  it('keeps a well-formed daily goal and its progress log', () => {
    const raw = legacyRaw({
      dailyGoal: { amount: 2, unit: 'episode' },
      dailyProgress: [{ date: '2026-08-19', amount: 2 }],
    })

    const { items } = parseItemEnvelope(raw)

    expect(items[0]).toMatchObject({
      dailyGoal: { amount: 2, unit: 'episode' },
      dailyProgress: [{ date: '2026-08-19', amount: 2 }],
    })
  })

  it('drops a malformed daily goal rather than the whole item', () => {
    const { items } = parseItemEnvelope(legacyRaw({ dailyGoal: { amount: 0 } }))

    expect(items).toHaveLength(1)
    expect(items[0]?.dailyGoal).toBeUndefined()
  })

  it('drops only the malformed entries from a progress log', () => {
    const raw = legacyRaw({
      dailyGoal: { amount: 1, unit: 'chapter' },
      dailyProgress: [
        { date: 'yesterday', amount: 1 },
        { date: '2026-08-19', amount: 1 },
      ],
    })

    const { items } = parseItemEnvelope(raw)

    expect(items[0]?.dailyProgress).toEqual([{ date: '2026-08-19', amount: 1 }])
  })

  it('recovers from a progress log that is not an array', () => {
    const { items } = parseItemEnvelope(legacyRaw({ dailyProgress: 'nope' }))

    expect(items[0]?.dailyProgress).toEqual([])
  })
})

/**
 * Everything below treats the parser as a *trust boundary*. Both of its
 * inputs — a restored backup file and LocalStorage — are outside the
 * app's control, and a browser tab has no other backstop between them and
 * the rest of the code.
 */
describe('parseItemEnvelope as a trust boundary', () => {
  function envelope(items: unknown[]): string {
    return JSON.stringify({ version: 1, items })
  }

  describe('closed value sets', () => {
    it.each([
      ['category', { category: 'not-a-category' }],
      ['status', { status: 'half-finished' }],
      ['priority', { priority: 'urgent' }],
    ])('rejects an item with an unknown %s', (_field, override) => {
      const raw = envelope([{ ...buildItem(), ...override }])

      const result = parseItemEnvelope(raw)

      // Dropped rather than repaired: a value outside the registry would
      // reach getCategoryDefinition, which throws. The type says CategoryId,
      // and this is what makes that claim true.
      expect(result.items).toEqual([])
      expect(result.droppedCount).toBe(1)
      expect(result.envelopeValid).toBe(true)
    })

    it('keeps the well-formed items alongside the rejected ones', () => {
      const good = buildItem()
      const raw = envelope([good, { ...buildItem(), status: 'nonsense' }])

      const result = parseItemEnvelope(raw)

      expect(result.items).toEqual([good])
      expect(result.droppedCount).toBe(1)
      expect(result.warning).toContain('1')
    })

    it('rejects an item whose tags are not all strings', () => {
      const raw = envelope([{ ...buildItem(), tags: ['fine', 42] }])

      expect(parseItemEnvelope(raw).items).toEqual([])
    })

    it('rejects an item with an empty id', () => {
      const raw = envelope([{ ...buildItem(), id: '' }])

      expect(parseItemEnvelope(raw).items).toEqual([])
    })
  })

  describe('prototype pollution', () => {
    it('does not let a crafted key reach Object.prototype', () => {
      const raw = envelope([
        JSON.parse(`{
          "id": "polluted",
          "title": "Looks innocent",
          "category": "games",
          "status": "backlog",
          "priority": "medium",
          "tags": [],
          "favorite": false,
          "dateAdded": "2026-01-01T00:00:00.000Z",
          "updatedAt": "2026-01-01T00:00:00.000Z",
          "__proto__": { "polluted": "yes" },
          "constructor": "hijacked"
        }`) as unknown,
      ])

      const { items } = parseItemEnvelope(raw)

      expect(items).toHaveLength(1)
      expect(Object.hasOwn(items[0] ?? {}, 'constructor')).toBe(false)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(Object.prototype).not.toHaveProperty('polluted')
    })
  })

  describe('resource limits', () => {
    it('refuses input larger than the size cap without parsing it', () => {
      const oversized = 'x'.repeat(MAX_ENVELOPE_BYTES + 1)

      const result = parseItemEnvelope(oversized)

      expect(result.envelopeValid).toBe(false)
      expect(result.items).toEqual([])
      expect(result.warning).toContain('too large')
    })

    it('refuses an envelope with more items than the cap', () => {
      const raw = envelope(Array.from({ length: MAX_ENVELOPE_ITEMS + 1 }, () => ({})))

      const result = parseItemEnvelope(raw)

      expect(result.envelopeValid).toBe(false)
      expect(result.warning).toContain('Too many items')
    })

    it('accepts an envelope right at the item cap', () => {
      const raw = envelope(Array.from({ length: MAX_ENVELOPE_ITEMS }, () => buildItem()))

      expect(parseItemEnvelope(raw).envelopeValid).toBe(true)
    })

    /**
     * A rejected envelope must report `envelopeValid: false`, because
     * importItems only overwrites the backlog when that flag is true.
     * If a size rejection ever reported `true`, opening a too-large file
     * would silently erase everything.
     */
    it('never reports a rejected envelope as valid', () => {
      for (const raw of ['not json', '{}', 'x'.repeat(MAX_ENVELOPE_BYTES + 1)]) {
        expect(parseItemEnvelope(raw).envelopeValid).toBe(false)
      }
    })
  })
})
