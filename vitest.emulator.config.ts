import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * The suite that talks to a real Firestore.
 *
 * Separate from `vitest.config.ts` because these need something running:
 * `pnpm emulator` in another terminal, and a JDK 21+ for it. CI has
 * neither, which is why the default run excludes them rather than
 * skipping them at runtime — a skipped test reads as a passing one.
 *
 * `node` rather than `jsdom`: the Firestore SDK talks gRPC here and the
 * repositories under test touch no DOM. It is also what
 * `@firebase/rules-unit-testing` expects.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    env: { TZ: 'America/New_York' },
    environment: 'node',
    globals: true,
    include: ['src/**/*.emulator.test.ts'],
    /* One emulator, one project: parallel files would share documents. */
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
