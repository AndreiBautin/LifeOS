import fs from 'node:fs'

const read = (p) => fs.readFileSync(p, 'utf8')
const write = (p, s) => fs.writeFileSync(p, s)
const cut = (s, from, to, where) => {
  if (!s.includes(from)) throw new Error(`not found in ${where}`)
  return s.replace(from, to)
}

/* ---- settings type ---- */

let d = read('src/domain/settings/settings.ts')
d = cut(
  d,
  `  /**
   * Days per week and weeks per block.
   *
   * Both are autoregulated — session length moves the first, block
   * performance the second — so these are the *current* values rather
   * than fixed preferences, and the app writes back to them.
   */
  readonly daysPerWeek: number
  readonly weeksBeforeDeload: number
  /** Roughly how long a session should run, in minutes. */
  readonly targetSessionMinutes: number`,
  `  /**
   * Days per week and weeks per block.
   *
   * Set by the lifter and left alone. Both used to be described as
   * autoregulated, which stopped being true when the schedule
   * autoregulation was removed — nothing has written back to either
   * since.
   */
  readonly daysPerWeek: number
  readonly weeksBeforeDeload: number`,
  'settings type',
)
d = cut(d, `  targetSessionMinutes: 70,\n`, '', 'DEFAULT_SETTINGS')
write('src/domain/settings/settings.ts', d)

/* ---- store ---- */

let store = read('src/infrastructure/storage/settings-store.ts')
store = cut(
  store,
  `    targetSessionMinutes: asBoundedNumber(
      stored.targetSessionMinutes,
      20,
      180,
      DEFAULT_SETTINGS.targetSessionMinutes,
    ),
`,
  '',
  'settings-store',
)
write('src/infrastructure/storage/settings-store.ts', store)

/* ---- the recipe: a constant, not an input ---- */

let a = read('src/domain/assembly/rp-assemble.ts')
a = cut(
  a,
  `   * Capping the fill by projected duration is what makes the *week* balanced
   * rather than just the totals.
   */
  readonly targetSessionMinutes: number
`,
  `   * Capping the fill by projected duration is what makes the *week* balanced
   * rather than just the totals.
   *
   * Not a setting. It was one, and it read as a dial for how long you
   * wanted to train — which it never was: raising it does not make the
   * session longer, it only stops holding the first day back from
   * spending the last day's budget. A number whose visible meaning is
   * the opposite of its actual one is worse in the UI than out of it.
   */
`,
  'recipe field',
)
a = cut(a, `    targetSessionMinutes: 70,\n`, '', 'recipe default')
a = a.replace(/recipe\.targetSessionMinutes/g, 'SESSION_MINUTES_CAP')
a = cut(
  a,
  `export function defaultRpRecipe(`,
  `/** The ceiling a day's fill is costed against. See {@link RpRecipe}. */
export const SESSION_MINUTES_CAP = 70

export function defaultRpRecipe(`,
  'constant',
)
write('src/domain/assembly/rp-assemble.ts', a)

/* ---- wiring ---- */

let cp = read('src/application/use-cases/programs/current-program.ts')
cp = cut(cp, `    targetSessionMinutes: settings.targetSessionMinutes,\n`, '', 'current-program')
write('src/application/use-cases/programs/current-program.ts', cp)

/* ---- the settings screen ---- */

let page = read('src/features/settings/SettingsPage.tsx')
page = cut(
  page,
  `          <NumberSetting
            label="Session length cap"
            suffix="min"
            value={settings.targetSessionMinutes}
            onChange={(targetSessionMinutes) => {
              update({ targetSessionMinutes })
            }}
          />
          <p className="text-ink-500 text-xs">
            The session length is a <span className="text-ink-300">ceiling</span>, not a target. It
            is what stops one day taking the whole week&rsquo;s accessory work — the first day built
            would otherwise claim every shared muscle and leave the last one with the leftovers.
            Nothing pads a day upward, so a squat day with maintained legs finishing in forty
            minutes is the plan rather than a gap.
          </p>
`,
  '',
  'SettingsPage',
)
write('src/features/settings/SettingsPage.tsx', page)

console.log('ok')
