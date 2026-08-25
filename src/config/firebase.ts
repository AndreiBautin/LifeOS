/**
 * The Firebase project this install talks to, if it talks to one.
 *
 * Parsed totally. Every field missing is the normal case — an install
 * with no project configured is a working app that keeps everything on
 * the device, which is what this app was before sync existed and what it
 * must remain if the configuration is absent. *Some* fields missing is a
 * misconfiguration, and it reports that rather than half-initialising a
 * client that will fail on the first write.
 *
 * There is no failure mode here that stops the app opening. Sync is the
 * only feature that can be unavailable, and it says so on the Settings
 * screen.
 */

export interface FirebaseConfig {
  readonly apiKey: string
  readonly authDomain: string
  readonly projectId: string
  readonly appId: string
}

export type FirebaseConfigState =
  | { readonly kind: 'configured'; readonly config: FirebaseConfig }
  /** No project set up. The expected state for a local build. */
  | { readonly kind: 'absent' }
  | { readonly kind: 'incomplete'; readonly missing: readonly string[] }

const FIELDS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const

/**
 * Reads the configuration from a plain bag rather than from
 * `import.meta.env` directly, so the parsing can be tested without a
 * bundler and without setting process-wide environment variables.
 */
export function readFirebaseConfig(
  env: Record<string, string | undefined> = import.meta.env,
): FirebaseConfigState {
  const entries = Object.entries(FIELDS).map(([key, variable]) => {
    const raw = env[variable]
    const value = typeof raw === 'string' ? raw.trim() : ''
    return { key, variable, value }
  })

  const present = entries.filter((entry) => entry.value !== '')
  if (present.length === 0) return { kind: 'absent' }

  const missing = entries.filter((entry) => entry.value === '').map((entry) => entry.variable)
  if (missing.length > 0) return { kind: 'incomplete', missing }

  const byKey = Object.fromEntries(entries.map((entry) => [entry.key, entry.value]))

  return {
    kind: 'configured',
    config: {
      apiKey: byKey.apiKey ?? '',
      authDomain: byKey.authDomain ?? '',
      projectId: byKey.projectId ?? '',
      appId: byKey.appId ?? '',
    },
  }
}
