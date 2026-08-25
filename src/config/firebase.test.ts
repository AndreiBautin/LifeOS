import { describe, expect, it } from 'vitest'

import { readFirebaseConfig } from './firebase'

/**
 * The case that matters most is the empty one: an install with no project
 * configured must be a working app, not a broken one.
 */

const COMPLETE = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'project',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
}

describe('reading the Firebase configuration', () => {
  it('reports absent when nothing is set', () => {
    expect(readFirebaseConfig({}).kind).toBe('absent')
  })

  it('treats blank and whitespace-only values as unset', () => {
    // A `.env` line left as `VITE_FIREBASE_API_KEY=` is the normal way to
    // leave something unconfigured, and an empty string is not a key.
    const state = readFirebaseConfig({
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '   ',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
    })

    expect(state.kind).toBe('absent')
  })

  it('reads a complete configuration', () => {
    const state = readFirebaseConfig(COMPLETE)

    expect(state).toEqual({
      kind: 'configured',
      config: {
        apiKey: 'key',
        authDomain: 'project.firebaseapp.com',
        projectId: 'project',
        appId: '1:2:web:3',
      },
    })
  })

  it('names what is missing rather than starting a half-built client', () => {
    // Half-configured is a mistake, not a preference. Initialising on it
    // produces a client that fails on the first write, somewhere far from
    // the cause.
    const state = readFirebaseConfig({
      VITE_FIREBASE_API_KEY: 'key',
      VITE_FIREBASE_PROJECT_ID: 'project',
    })

    expect(state).toEqual({
      kind: 'incomplete',
      missing: ['VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID'],
    })
  })

  it('trims surrounding whitespace, which a copied value usually has', () => {
    const state = readFirebaseConfig({ ...COMPLETE, VITE_FIREBASE_PROJECT_ID: '  project  ' })

    expect(state.kind === 'configured' && state.config.projectId).toBe('project')
  })
})
