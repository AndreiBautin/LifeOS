import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * The layer rule, enforced rather than documented.
 *
 * docs/ARCHITECTURE.md says dependencies point inward only. A document
 * cannot fail a build, so the same rule lives here: an import that breaks
 * the layering is a lint error carrying the reason, caught before it is
 * ever committed.
 *
 *   features/ → application/ → domain/ ← infrastructure/
 */
const layerBoundaries = [
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/application/*',
                '@/infrastructure/*',
                '@/features/*',
                '@/app/*',
                '@/components/*',
                '@/config/*',
                'react',
                'react-*',
                '@tanstack/*',
                'zustand',
                'idb',
              ],
              message:
                'domain/ is the innermost layer: no other layer, no React, no library. Set resolution, progression and volume maths stay pure functions so a 5/3/1 percentage can be tested by calling it — no database, no render, no clock.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/infrastructure/*',
                '@/features/*',
                '@/app/*',
                '@/components/*',
                'react',
                'react-*',
                '@tanstack/*',
                'zustand',
                'idb',
              ],
              message:
                'application/ may depend on domain/ only. If a use-case needs something concrete (a repository, a clock, an id generator), take it as a parameter and let src/app/di.ts wire it in.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '@/app/*', '@/components/*', 'react', 'react-*'],
              message:
                'infrastructure/ implements domain ports. It may not reach up into the UI or into the composition root.',
            },
          ],
        },
      ],
    },
  },
]

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'dev-dist']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

      // A leading underscore marks a binding that exists only to be
      // discarded — most often destructuring a property back off an
      // object, which `exactOptionalPropertyTypes` makes the correct way
      // to express "this field is absent".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Every discriminated union in the domain (load sources, rep
      // targets, progression rules) is exhaustively switched. Without
      // this, adding a variant silently falls through to a default
      // somewhere instead of failing the build.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Logging goes through the structured logger, which filters by
      // level and carries event names and scalars — never a set, a weight
      // or a note. A stray console.log bypasses both guarantees.
      'no-console': 'error',

      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message:
            'Only src/infrastructure/storage/* may touch localStorage, and only through a key from config/storage-keys.ts. Training history lives in IndexedDB; localStorage holds small settings.',
        },
        {
          object: 'window',
          property: 'sessionStorage',
          message: 'Persistence belongs behind a repository port, not in a component.',
        },
      ],

      'no-restricted-globals': [
        'error',
        {
          name: 'indexedDB',
          message:
            'Open the database through src/infrastructure/db/database.ts so every connection runs the same migration chain. A second open path is how a schema drifts.',
        },
      ],

      // Dates enter the domain as an injected clock. A `new Date()` deep
      // in a progression rule makes the rule untestable and makes a
      // program behave differently depending on when it is opened.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
          message:
            'Take the current time as a `now: Date` parameter (or use the injected Clock) rather than reading the system clock here. Progression and scheduling must be reproducible in a test.',
        },
      ],
    },
  },

  ...layerBoundaries,

  {
    // The one file allowed to write to the console — it is the sink the
    // rest of the app logs through.
    files: ['src/shared/logging/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The composition root, the storage adapters and the clock adapter
    // legitimately name concrete browser APIs. That is their job.
    files: [
      'src/app/di.ts',
      'src/infrastructure/storage/**/*.ts',
      'src/infrastructure/db/**/*.ts',
      'src/infrastructure/clock/**/*.ts',
      'src/config/**/*.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      'src/test/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-globals': 'off',
      // The clock adapter's whole job is to read the system clock. It is
      // the one place allowed to, which is what makes every consumer
      // testable.
      'no-restricted-syntax': 'off',
    },
  },
  {
    // The layer rule constrains what *ships*, not what verifies it. A
    // use-case test reaching for InMemoryProgramRepository is the intended
    // design — that double exists precisely so application tests need no
    // mocking — so tests are exempt from the import boundaries and from
    // the clock rule.
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  eslintConfigPrettier,
])
