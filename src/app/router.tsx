import { createBrowserRouter, Navigate } from 'react-router-dom'

import { HomePage } from '@/features/today/HomePage'
import { HistoryPage } from '@/features/history/HistoryPage'
import { ProgramPage } from '@/features/program/ProgramPage'
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
        { index: true, element: <Navigate to="/today" replace /> },
        /*
         * **Everything that was not training is gone**, and every path it
         * had lands on Today: _"fully lean into this simply being a
         * gamified workout tracker"_. Redirects rather than deletions,
         * because a PWA shortcut is registered with the operating system
         * at install time and an installed copy goes on asking for the
         * path it was installed with.
         */
        ...[
          'quests',
          'next',
          'goals',
          'goals/:id',
          'jobs',
          'resume',
          'mind',
          'backlog',
          'upgrades',
          'gear',
          'base',
          'vitals',
          'limits',
          'finance',
          'map',
          'map/share',
          'map/inbox',
          'trips',
          'character',
          'party',
        ].map((path) => ({ path, element: <Navigate to="/today" replace /> })),
        { path: 'train', element: <TrainPage /> },
        /*
         * The Plan screen is gone and `/plan` lands on the Program page.
         * It explained how each muscle's weekly volume was arrived at,
         * which was worth a screen while those were settings — its own
         * last section had already become "Why there is nothing to
         * change". With one hardcoded split there is nothing to explain
         * and nothing to change, so what is left of the question is what
         * the week actually looks like, which is Program.
         */
        { path: 'plan', element: <Navigate to="/program" replace /> },
        { path: 'program', element: <ProgramPage /> },
        { path: 'today', element: <HomePage /> },
        { path: 'history', element: <HistoryPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
