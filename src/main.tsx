import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { bootstrap } from '@/app/di'
import { AppProviders } from '@/app/providers'
import { router } from '@/app/router'
import { logger } from '@/shared/logging/logger'

import './index.css'

/**
 * Startup.
 *
 * The database is opened and seeded *before* the first render, so no
 * screen ever has to handle "the app is not ready yet". The cost is a
 * few milliseconds against a local IndexedDB; the saving is an entire
 * category of loading state spread across every component.
 */
const container = document.getElementById('root')
if (container === null) throw new Error('Root element is missing from the document.')

const root = createRoot(container)

bootstrap()
  .then(({ services }) => {
    root.render(
      <StrictMode>
        <AppProviders services={services}>
          <RouterProvider router={router} />
        </AppProviders>
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    logger.error('app.bootstrap-failed', error)

    // If storage cannot be opened there is no app, so this says what
    // happened in plain language rather than leaving a blank page.
    root.render(
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', color: '#eee' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Lift could not start</h1>
        <p style={{ opacity: 0.8, lineHeight: 1.5 }}>
          Local storage is unavailable. This usually means private browsing, or a browser setting
          blocking site data. Your existing data has not been deleted — the app simply cannot reach
          it right now.
        </p>
      </div>,
    )
  })
