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
        /*
         * **The worker no longer waits, and the banner still asks.**
         *
         * `'prompt'` installs a new version and leaves it *waiting* until
         * a client sends `SKIP_WAITING`. That is one message away from
         * fine and it stranded a real device: a banner missed once left
         * the old shell serving forever, and closing the app and opening
         * it again never promotes a waiting worker, so every restart
         * changed nothing.
         *
         * The client-side repair for that shipped, and could not reach
         * the device that needed it — it lived in the bundle the stale
         * worker was refusing to serve. **This is the only lever that
         * reaches a stuck install**, because a browser fetches `sw.js`
         * from the network itself rather than through the worker it is
         * replacing.
         *
         * `autoUpdate` here means the *worker* activates as soon as it
         * installs. It does **not** mean the page reloads underneath
         * anybody: `onNeedReload` in `UpdatePrompt` shows the banner
         * instead, so the reason `'prompt'` was chosen — never swapping
         * the app out from under somebody three sets into a session —
         * still holds. What changes is that the new version can no longer
         * be stranded behind an unanswered question.
         */
        registerType: 'autoUpdate',
        injectRegister: null,

        // Every asset the shell needs is precached, so a cold start with
        // no network is indistinguishable from a warm one. There are no
        // runtime network calls to cache — the app has no server — which
        // is why there is no runtimeCaching block here.
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

          /*
           * Leaflet is precached with everything else, deliberately. It
           * is about 190 kB, and the map is wanted outdoors on poor signal
           * — exactly when a chunk fetched on demand would fail to arrive.
           * The fog and the markers draw without a network; only tiles
           * need one.
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
      target: 'es2022',
      sourcemap: true,
    },
  }
})
