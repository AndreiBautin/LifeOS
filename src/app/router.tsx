import { createBrowserRouter, Navigate } from 'react-router-dom'

import { HistoryPage } from '@/features/history/HistoryPage'
import { NotFoundPage } from '@/features/not-found/NotFoundPage'
import { ProgramDetailPage } from '@/features/programs/ProgramDetailPage'
import { ProgramsPage } from '@/features/programs/ProgramsPage'
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
        { index: true, element: <Navigate to="/train" replace /> },
        { path: 'train', element: <TrainPage /> },
        { path: 'programs', element: <ProgramsPage /> },
        { path: 'programs/:programId', element: <ProgramDetailPage /> },
        { path: 'history', element: <HistoryPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
