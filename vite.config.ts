import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * One value decides where the app is served from.
 *
 * A GitHub project page serves from `/<repo>/`, not from `/`. The bundler
 * needs that prefix to emit asset URLs, and the router needs the same
 * prefix as its basename. Deriving both from a single variable is the
 * difference between "assets load and every route 404s" and a site that
 * works — that mismatch is the most common way a static SPA deploy fails.
 *
 * `BASE_URL` is exposed to the app by Vite automatically, and
 * `src/app/router.tsx` reads it rather than hardcoding anything.
 */
/**
 * `loadEnv` is typed as though every key is present, but an unset variable
 * is genuinely absent at runtime. Reading it as `unknown` keeps the
 * fallback honest rather than trusting a signature that overstates what
 * the object contains.
 */
function readBasePath(env: Record<string, string>): string {
  const { VITE_BASE_PATH } = env
  const value: unknown = VITE_BASE_PATH
  return typeof value === 'string' && value.length > 0 ? value : '/'
}

export default defineConfig(({ mode }) => {
  const base = readBasePath(loadEnv(mode, process.cwd(), ''))

  return {
    base,

    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,

        // Every asset the shell needs is precached, so a cold start with
        // no network is indistinguishable from a warm one. There are no
        // runtime network calls to cache — the app has no server — which
        // is why there is no runtimeCaching block here.
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          cleanupOutdatedCaches: true,
          // A client-side route requested cold must return the shell
          // rather than a 404 from the static host.
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/api/],
        },

        manifest: {
          name: 'Lift — Programs & Training Log',
          short_name: 'Lift',
          description:
            'Build strength programs and track the workouts that follow them. Works fully offline; your data never leaves the device.',
          id: base,
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0a0a0b',
          theme_color: '#0a0a0b',
          categories: ['health', 'fitness', 'sports'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Start workout',
              url: `${base}train`,
              description: 'Jump into today’s session',
            },
            { name: 'Programs', url: `${base}programs`, description: 'Browse and edit programs' },
          ],
        },

        devOptions: { enabled: false },
      }),
    ],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },

    build: {
      target: 'es2022',
      sourcemap: true,
    },
  }
})
