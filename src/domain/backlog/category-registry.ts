export interface CategoryDefinition {
  readonly id: string
  readonly label: string
  readonly icon: string
  /** The unit a daily goal for this kind of thing is naturally counted in. */
  readonly suggestedGoalUnit: string
  readonly suggestedPlatforms: readonly string[]
}

/**
 * The single extension point for content categories: adding a category
 * means adding an entry here, never touching domain services or use-cases.
 */
export const CATEGORY_REGISTRY = [
  {
    id: 'games',
    label: 'Games',
    icon: 'Gamepad2',
    suggestedGoalUnit: 'level',
    suggestedPlatforms: ['Steam', 'PlayStation', 'Xbox', 'Switch'],
  },
  {
    id: 'tv-shows',
    label: 'TV Shows',
    icon: 'Tv',
    suggestedGoalUnit: 'episode',
    suggestedPlatforms: ['Netflix', 'Hulu', 'Disney+'],
  },
  {
    id: 'movies',
    label: 'Movies',
    icon: 'Clapperboard',
    suggestedGoalUnit: 'movie',
    suggestedPlatforms: ['Netflix', 'Theater', 'Blu-ray'],
  },
  {
    id: 'anime',
    label: 'Anime',
    icon: 'Sparkles',
    suggestedGoalUnit: 'episode',
    suggestedPlatforms: ['Crunchyroll', 'Netflix'],
  },
  {
    id: 'books',
    label: 'Books',
    icon: 'BookOpen',
    suggestedGoalUnit: 'chapter',
    suggestedPlatforms: ['Kindle', 'Physical', 'Audible'],
  },
  {
    id: 'manga',
    label: 'Manga',
    icon: 'BookMarked',
    suggestedGoalUnit: 'chapter',
    suggestedPlatforms: ['Physical', 'Digital'],
  },
  {
    id: 'podcasts',
    label: 'Podcasts',
    icon: 'Mic',
    suggestedGoalUnit: 'episode',
    suggestedPlatforms: ['Spotify', 'Apple Podcasts'],
  },
  {
    id: 'music',
    label: 'Music',
    icon: 'Music',
    suggestedGoalUnit: 'album',
    suggestedPlatforms: ['Spotify', 'Apple Music'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: 'SquarePlay',
    suggestedGoalUnit: 'video',
    suggestedPlatforms: ['YouTube'],
  },
  {
    id: 'courses',
    label: 'Courses',
    icon: 'GraduationCap',
    suggestedGoalUnit: 'lesson',
    suggestedPlatforms: ['Udemy', 'Coursera'],
  },
] as const satisfies readonly CategoryDefinition[]

export type CategoryId = (typeof CATEGORY_REGISTRY)[number]['id']

const CATEGORY_BY_ID = new Map<CategoryId, CategoryDefinition>(
  CATEGORY_REGISTRY.map((category) => [category.id, category]),
)

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORY_BY_ID.has(value as CategoryId)
}

export function getCategoryDefinition(id: CategoryId): CategoryDefinition {
  const category = CATEGORY_BY_ID.get(id)
  if (!category) {
    throw new Error(`Unknown category id: ${id}`)
  }
  return category
}
