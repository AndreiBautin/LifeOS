import {
  applyItemUpdate,
  createItem,
  logDailyProgress,
  type CreateItemInput,
  type Item,
  type ItemChanges,
  type LogDailyProgressInput,
} from '@/domain/backlog/item'
import { filterItems, type ItemFilters } from '@/domain/backlog/filter-items'
import { sortItems } from '@/domain/backlog/sort-items'
import type { SortKey } from '@/domain/backlog/sort-key'
import type { BacklogItemId, IdGenerator } from '@/domain/ids/ids'
import type { BacklogItemRepository, Clock } from '@/domain/repositories/ports'

/**
 * The four things you do to a backlog item, and reading the list back.
 *
 * Each takes its dependencies as a parameter, as everything in this layer
 * does. Backlogs wrapped each of these in a factory returning a closure;
 * that is the same idea one indirection deeper, and the shape here is the
 * one the rest of LifeOS's use-cases already have.
 */

export interface BacklogDeps {
  readonly items: BacklogItemRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export async function addBacklogItem(input: CreateItemInput, deps: BacklogDeps): Promise<Item> {
  const item = createItem(input, deps)
  await deps.items.save(item)
  return item
}

async function require(id: BacklogItemId, deps: BacklogDeps): Promise<Item> {
  const existing = await deps.items.byId(id)
  if (existing === undefined) throw new Error(`No backlog item found with id ${id}.`)
  return existing
}

export async function updateBacklogItem(
  id: BacklogItemId,
  changes: ItemChanges,
  deps: BacklogDeps,
): Promise<Item> {
  const updated = applyItemUpdate(await require(id, deps), changes, deps)
  await deps.items.save(updated)
  return updated
}

/**
 * Deletes, and records that it did.
 *
 * `remove`, never `purge`. A backlog item deleted on one device and not
 * tombstoned is one the other device offers back as news on its next
 * push, and the two then trade it forever.
 */
export async function deleteBacklogItem(id: BacklogItemId, deps: BacklogDeps): Promise<void> {
  await deps.items.remove(id)
}

export interface ListBacklogOptions {
  readonly filters?: ItemFilters
  readonly sortKey?: SortKey
}

export async function listBacklogItems(
  options: ListBacklogOptions,
  deps: BacklogDeps,
): Promise<readonly Item[]> {
  const items = await deps.items.all()
  const filtered = options.filters === undefined ? items : filterItems(items, options.filters)
  return options.sortKey === undefined ? filtered : sortItems(filtered, options.sortKey)
}

/**
 * Records a day's progress toward an item's daily goal.
 *
 * Separate from `updateBacklogItem` because the domain treats it as
 * appending to a log rather than editing a field — including refusing to
 * log against an item that has no goal.
 */
export async function logBacklogProgress(
  id: BacklogItemId,
  input: LogDailyProgressInput,
  deps: BacklogDeps,
): Promise<Item> {
  const updated = logDailyProgress(await require(id, deps), input, deps)
  await deps.items.save(updated)
  return updated
}
