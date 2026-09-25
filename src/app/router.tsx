import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AtlasPage } from '@/features/atlas/AtlasPage'
import { GoalsPage } from '@/features/goals/GoalsPage'
import { GoalPage } from '@/features/goals/GoalPage'
import { InboxPage } from '@/features/atlas/InboxPage'
import { HomePage } from '@/features/today/HomePage'
import { SharePage } from '@/features/atlas/SharePage'
import { TripsPage } from '@/features/atlas/TripsPage'
import { BacklogPage } from '@/features/backlog/BacklogPage'
import { BasePage } from '@/features/base/BasePage'
import { LimitsPage } from '@/features/limits/LimitsPage'
import { MindPage } from '@/features/mind/MindPage'
import { JobsPage } from '@/features/jobs/JobsPage'
import { QuestsPage } from '@/features/projects/QuestsPage'
import { ResumePage } from '@/features/resume/ResumePage'
import { UpgradesPage } from '@/features/upgrades/UpgradesPage'
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
         * **Quests un-folded from Today back onto its own page** — see
         * `QuestsPage`'s own doc. It had briefly redirected to `/today`
         * while folded in; now it renders directly again.
         */
        { path: 'quests', element: <QuestsPage /> },
        { path: 'goals', element: <GoalsPage /> },
        { path: 'goals/:id', element: <GoalPage /> },
        /*
         * The PWA manifest ships a "What next" shortcut pointing here.
         * Quests having its own page again is what "next" actually means.
         */
        { path: 'next', element: <Navigate to="/quests" replace /> },
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
        { path: 'backlog', element: <BacklogPage /> },
        { path: 'upgrades', element: <UpgradesPage /> },
        /*
         * The Gear shelf was removed for want of anything on it, and its
         * path is kept as a redirect rather than deleted — the rule
         * `/next` and `/character` already follow, because a PWA
         * shortcut is registered with the operating system at install
         * time and an installed copy goes on asking for the old path.
         *
         * It lands on the tech tree because that is where the records
         * went: `shelfOf` reads a stored `gear` as `tech`, so anything
         * filed there is on that screen rather than nowhere.
         */
        { path: 'gear', element: <Navigate to="/upgrades" replace /> },
        { path: 'base', element: <BasePage /> },
        /*
         * Kept as a redirect rather than deleted, the rule '/next' and
         * '/character' already follow: a PWA shortcut is registered with
         * the operating system at install time, so an installed copy
         * goes on asking for a path long after the app stops serving it.
         * Upkeep is what was on this screen and is on Today now.
         */
        { path: 'vitals', element: <Navigate to="/today" replace /> },
        { path: 'limits', element: <LimitsPage /> },
        { path: 'mind', element: <MindPage /> },
        { path: 'jobs', element: <JobsPage /> },
        /*
         * **Removed outright, not folded back into Today.** Reported
         * directly: "it doesn't really fit and could vibe weird to
         * employers" — a portfolio concern, since this deployed build is
         * the demo build a reviewer actually opens. The nav tab and this
         * screen are gone; the repository, the domain and the quest
         * arc's salary/savings stages are not — see
         * `application/use-cases/finance/finance.ts`'s own doc for what
         * stayed and why. Kept as a redirect rather than deleted, the
         * rule `/next` and `/character` already follow: a PWA shortcut
         * is registered with the operating system at install time, and
         * an installed copy goes on asking for this path.
         */
        { path: 'finance', element: <Navigate to="/today" replace /> },
        { path: 'resume', element: <ResumePage /> },
        { path: 'map', element: <AtlasPage /> },
        { path: 'map/share', element: <SharePage /> },
        { path: 'map/inbox', element: <InboxPage /> },
        { path: 'trips', element: <TripsPage /> },
        { path: 'character', element: <Navigate to="/today" replace /> },
        { path: 'today', element: <HomePage /> },
        /*
         * **`/party` is a redirect, not a deleted route.** Social is not
         * tracked any more and the screen is gone, but a PWA shortcut is
         * registered with the operating system at install time — an
         * installed copy goes on asking for the path it was installed
         * with. The rule `/next`, `/character`, `/vitals` and `/gear`
         * all follow.
         */
        { path: 'party', element: <Navigate to="/today" replace /> },
        { path: 'history', element: <HistoryPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
