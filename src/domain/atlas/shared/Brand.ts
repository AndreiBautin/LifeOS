/**
 * Nominal typing helper. Two `Brand<string, 'PlaceId'>` and `Brand<string, 'Tag'>`
 * values are both strings at runtime but are incompatible at the type level,
 * preventing accidental mixups (e.g. passing a Tag where a PlaceId is expected).
 */
export type Brand<T, BrandName extends string> = T & { readonly __brand: BrandName }
