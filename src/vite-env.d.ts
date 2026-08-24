/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Set to "true" by the demo build so storage namespaces cannot collide. */
  readonly VITE_DEMO_MODE?: string
  /** Where the app is served from. Vite exposes this as BASE_URL too. */
  readonly VITE_BASE_PATH?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_COMMIT_SHA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
