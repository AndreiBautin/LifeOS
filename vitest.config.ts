import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    /*
     * **The suite runs west of Greenwich, deliberately.**
     *
     * In UTC a local day key and a UTC date prefix are the same ten
     * characters, so every test comparing one against the other passes
     * whatever the code does. That is how an evening completion being
     * filed under tomorrow survived: the app was wrong for the last
     * hours of every day for anyone in the Americas, and the suite could
     * not see it because the suite lived in London.
     *
     * A fixed offset would be weaker than this one. New York changes
     * offset twice a year, so anything that quietly assumes a constant
     * one fails here too.
     */
    env: { TZ: 'America/New_York' },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The domain layer is pure and is where the programming logic
      // lives, so it is held to a higher bar than the UI.
      include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
      exclude: ['**/*.test.ts', 'src/infrastructure/seed/**'],
    },
  },
})
