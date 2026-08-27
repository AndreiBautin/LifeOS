import type { Brand } from '../shared/Brand'

export type CategoryId = Brand<string, 'CategoryId'>

/**
 * A category is data, not code: adding a new one to the seed registry in
 * `config/categories.ts` requires no changes here or in any use case.
 */
export interface CategoryDefinition {
  readonly id: CategoryId
  readonly label: string
  readonly icon: string
}

export interface CategoryRegistry {
  getById(id: CategoryId): CategoryDefinition | undefined
  has(id: CategoryId): boolean
  list(): readonly CategoryDefinition[]
}

export function createCategoryRegistry(
  definitions: readonly CategoryDefinition[],
): CategoryRegistry {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]))
  return {
    getById: (id) => byId.get(id),
    has: (id) => byId.has(id),
    list: () => definitions,
  }
}
