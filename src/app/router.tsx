import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AtlasPage } from '@/features/atlas/AtlasPage'
import { InboxPage } from '@/features/atlas/InboxPage'
import { PartyPage } from '@/features/party/PartyPage'
import { HomePage } from '@/features/today/HomePage'
import { SharePage } from '@/features/atlas/SharePage'
import { TripsPage } from '@/features/atlas/TripsPage'
import { BacklogPage } from '@/features/backlog/BacklogPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ReviewPage } from '@/features/review/ReviewPage'
import { BasePage } from '@/features/base/BasePage'
import { VitalsPage } from '@/features/vitals/VitalsPage'
import { LimitsPage } from '@/features/limits/LimitsPage'
import { MindPage } from '@/features/mind/MindPage'
import { HomesPage } from '@/features/homes/HomesPage'
import { JobsPage } from '@/features/jobs/JobsPage'
import { FinancePage } from '@/features/finance/FinancePage'
import { ResumePage } from '@/features/resume/ResumePage'
import { GearPage, UpgradesPage } from '@/features/upgrades/UpgradesPage'
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
        { index: true, element: <Navigate to="/today" replace /> },
        { path: 'quests', element: <ProjectsPage /> },
        /*
         * Kept as a redirect rather than deleted. The PWA manifest shipped
         * a "What next" shortcut pointing here, and a shortcut is
         * registered with the operating system when the app is installed —
         * an installed copy goes on asking for this path long after the
         * manifest stops mentioning it.
         */
        { path: 'next', element: <Navigate to="/quests" replace /> },
        { path: 'train', element: <TrainPage /> },
        { path: 'plan', element: <PlanPage /> },
        { path: 'program', element: <ProgramPage /> },
        { path: 'backlog', element: <BacklogPage /> },
        { path: 'upgrades', element: <UpgradesPage /> },
        { path: 'gear', element: <GearPage /> },
        { path: 'base', element: <BasePage /> },
        { path: 'vitals', element: <VitalsPage /> },
        { path: 'limits', element: <LimitsPage /> },
        { path: 'mind', element: <MindPage /> },
        { path: 'houses', element: <HomesPage /> },
        { path: 'jobs', element: <JobsPage /> },
        { path: 'finance', element: <FinancePage /> },
        { path: 'resume', element: <ResumePage /> },
        { path: 'map', element: <AtlasPage /> },
        { path: 'map/share', element: <SharePage /> },
        { path: 'map/inbox', element: <InboxPage /> },
        { path: 'trips', element: <TripsPage /> },
        { path: 'character', element: <Navigate to="/today" replace /> },
        { path: 'today', element: <HomePage /> },
        { path: 'party', element: <PartyPage /> },
        { path: 'review', element: <ReviewPage /> },
        { path: 'history', element: <HistoryPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
