/**
 * "1 thing" / "3 things", so a count never reads "1 things".
 *
 * In `lib/` rather than beside the fold that first needed it, because a
 * module exporting both a component and a helper breaks fast refresh —
 * the lint rule says so, and it is the same reason `sheet-constants.ts`
 * exists apart from the components that read it.
 */
export function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`
}
