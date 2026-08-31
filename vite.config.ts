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

          /*
           * The Firebase SDK is not part of the shell.
           *
           * Precaching it undoes the code splitting: every install would
           * download it on first load whether or not sync is configured,
           * which for a phone opened in a gym is a third of a megabyte
           * bought for a feature most sessions never touch.
           *
           * Leaving it out costs nothing that matters. Sync needs a
           * network by definition, so the one situation where a missing
           * cache entry would hurt — offline — is a situation where the
           * feature could not run anyway. Everything the app does without
           * a network is still precached in full.
           */
          globIgnores: ['**/firebase-*.js', '**/firebase-*.js.map'],

          /*
           * Leaflet is *not* on that list, and the asymmetry is the point.
           *
           * It is a comparable weight — about 190 kB for the map and its
           * clustering plugin — and by the same first-load argument it
           * looks like a candidate. It is not, because of when the map is
           * actually wanted: outdoors, walking, on a phone with poor
           * signal, clearing fog. That is precisely the moment a chunk
           * fetched on demand would fail to arrive.
           *
           * The Firebase argument does not transfer either. Sync needs a
           * network by definition, so leaving it out costs nothing in the
           * one situation where a missing cache entry would hurt. A map
           * degrades without a network — no tiles — but the fog and the
           * markers still draw, and that is most of what the screen is
           * for.
           */
          cleanupOutdatedCaches: true,
          // A client-side route requested cold must return the shell
          // rather than a 404 from the static host.
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/^\/api/],
        },

        manifest: {
          name: 'LifeOS — training, quests, codex and map',
          short_name: 'LifeOS',
          description:
            'Six things worth tracking, scored by one model: what you are training, building, reading, saving up for, who you are seeing and where you have been.',
          /*
           * `id`, `start_url` and `scope` all derive from `base` and must
           * not move until the repository is renamed — changing any of
           * them makes every installed copy on every device look like a
           * different app, which is a bad thing to debug mid-migration.
           * The name and description are free to change; identity is not.
           */
          id: base,
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0a0a0b',
          theme_color: '#0a0a0b',
          categories: ['health', 'fitness', 'productivity'],
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
          /*
           * "Share → Lift" from a maps app. A GET target, so the share
           * arrives as an ordinary navigation the router already handles
           * and nothing needs a POST handler in the service worker.
           *
           * The three parameters are not filled in consistently by the
           * apps that do the sharing — Android tends to put the name in
           * `text` and the link in `url`, others put both in `text` — so
           * the page reads all three rather than trusting one.
           */
          share_target: {
            action: `${base}map/share`,
            method: 'GET',
            params: { title: 'title', text: 'text', url: 'url' },
          },

          /*
           * The long-press menu. `Programs` used to point at `programs`,
           * which is not a route — the page is `program`, singular — so
           * the shortcut landed on Not Found. Fixed here rather than by
           * adding a second route, because the route name is right and the
           * link was wrong.
           */
          shortcuts: [
            { name: 'Quests', url: `${base}quests`, description: 'The next thing to do' },
            {
              name: 'Start workout',
              url: `${base}train`,
              description: 'Jump into today’s session',
            },
            { name: 'Codex', url: `${base}backlog`, description: 'What is due today' },
          ],
        },

        devOptions: { enabled: false },
      }),
    ],

    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },

    build: {
      rollupOptions: {
        output: {
          /*
           * Firebase into one predictably named chunk.
           *
           * Rollup would otherwise name these after whatever module
           * happened to be the entry point — `index.esm-<hash>.js` for
           * the Firestore SDK — and a precache rule cannot exclude a name
           * that generic without risking excluding something of ours.
           * Naming it here is what lets the rule above be specific.
           */
          manualChunks: (id: string) =>
            id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')
              ? 'firebase-sdk'
              : undefined,
        },
      },
      target: 'es2022',
      sourcemap: true,
    },
  }
})
