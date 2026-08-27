import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AtlasPage } from '@/features/atlas/AtlasPage'
import { SharePage } from '@/features/atlas/SharePage'
import { BacklogPage } from '@/features/backlog/BacklogPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ReviewPage } from '@/features/review/ReviewPage'
import { UpgradesPage } from '@/features/upgrades/UpgradesPage'
import { CharacterPage } from '@/features/character/CharacterPage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { PlanPage } from '@/features/plan/PlanPage'
import { ProgramPage } from '@/features/plan/ProgramPage'
import { NotFoundPage } from '@/features/not-found/NotFoundPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TrainPage } from '@/features/train/TrainPage'

import { AppShell } from './layout/AppShell'
import { RouteError } from './RouteError'

/**
 * `import.meta.env.BASE_URL` comes from the same value the bundler uses
 * for asset paths, set once in vite.config.ts. Hardcoding a basename here
 * is the classic way a project-page deploy ends up serving its assets
 * correctly and 404ing on every route.
 */
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      errorElement: <RouteError />,
      children: [
        // The hub opens on what to do next, not on the training screen. That
        // is the change from a training app to a hub: the first thing on the
        // first screen should be the answer to "what now".
        { index: true, element: <Navigate to="/next" replace /> },
        { path: 'next', element: <ProjectsPage /> },
        { path: 'train', element: <TrainPage /> },
        { path: 'plan', element: <PlanPage /> },
        { path: 'program', element: <ProgramPage /> },
        { path: 'backlog', element: <BacklogPage /> },
        { path: 'upgrades', element: <UpgradesPage /> },
        { path: 'map', element: <AtlasPage /> },
        { path: 'map/share', element: <SharePage /> },
        { path: 'character', element: <CharacterPage /> },
        { path: 'review', element: <ReviewPage /> },
        { path: 'history', element: <HistoryPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
