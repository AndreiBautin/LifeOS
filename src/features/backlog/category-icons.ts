import {
  BookMarked,
  BookOpen,
  Clapperboard,
  Gamepad2,
  GraduationCap,
  Mic,
  Music,
  Sparkles,
  SquarePlay,
  Tv,
  type LucideIcon,
} from 'lucide-react'

import type { CategoryId } from '@/domain/backlog/category-registry'

/** Maps each category to its icon component (kept in sync with CATEGORY_REGISTRY's icon names). */
export const CATEGORY_ICONS: Record<CategoryId, LucideIcon> = {
  games: Gamepad2,
  'tv-shows': Tv,
  movies: Clapperboard,
  anime: Sparkles,
  books: BookOpen,
  manga: BookMarked,
  podcasts: Mic,
  music: Music,
  youtube: SquarePlay,
  courses: GraduationCap,
}
