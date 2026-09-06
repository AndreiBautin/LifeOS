import { addCampaign } from '@/application/use-cases/campaign/campaign'
import { addPlace, visitPlace } from '@/application/use-cases/atlas/atlas'
import { completeChallenge, readChallenges } from '@/application/use-cases/challenges/challenges'
import { logAttempt } from '@/application/use-cases/mind/practice'
import {
  addContract,
  addProject,
  setActionStatus,
  updateProject,
} from '@/application/use-cases/projects/projects'
import { addRoom, recordClear } from '@/application/use-cases/base/declutter'
import { addUpgrade, updateUpgrade } from '@/application/use-cases/upgrades/upgrades'
import { APPLICATION_STAGES } from '@/domain/jobs/application'
import { createItem } from '@/domain/backlog/item'
import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { BulletId, CompanyId, ExerciseId, RoleId, WorkoutId } from '@/domain/ids/ids'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import type { TripId } from '@/domain/atlas/trip/TripId'
import type { LogEntry, WorkoutLog } from '@/domain/logging/workout-log'
import { toMonthKey } from '@/domain/time/day'
import type { Clock } from '@/domain/repositories/ports'

import type { DemoDeps } from './deps'

/**
 * The data the deployed app shows a first-time visitor.
 *
 * Three things make this safe to publish, and they are structural rather
 * than careful:
 *
 * 1. **Generated, never captured.** Every record below is written here,
 *    in a file anybody can read. There is no export step from a personal
 *    device anywhere in the pipeline, so there is no path by which real
 *    data could arrive.
 * 2. **A separate namespace.** A demo build sets `VITE_DEMO_MODE`, which
 *    moves the IndexedDB name and every storage key to a `lifeos.demo`
 *    prefix. The demo and any personal data on the same browser cannot
 *    collide.
 * 3. **Seeded only into empty storage.** `seedDemoData` refuses when
 *    anything is already there. That is a tested property rather than a
 *    convention — see `seed.test.ts`.
 *
 * **It drives the app's own use cases rather than writing records.**
 * Hand-built fixtures drift from the types they imitate and can encode
 * states the app cannot actually produce; going through `addProject` and
 * the rest means a fixture that compiles is a fixture the app could have
 * created, and every invariant those functions enforce holds here too.
 *
 * **Every date is an offset from the seed moment.** A fixture pinned to
 * absolute dates rots: opened a year later it shows dead streaks and an
 * empty "this month". Offsets keep it alive while staying deterministic
 * for a given clock.
 */

export interface SeedResult {
  readonly seeded: boolean
  /** Why not, when it declined. */
  readonly reason?: 'already-has-data'
}

/**
 * Days before the seed moment, as a **local** day key.
 *
 * Deliberately not `daysAgo(...).slice(0, 10)`, which is the UTC date —
 * west of Greenwich the two disagree for the last hours of every evening,
 * and a workout filed under tomorrow's key is a workout the history
 * screen shows on the wrong day. There is a lint rule about this.
 */
function dayKeyAgo(clock: Clock, days: number): string {
  const day = new Date(clock.now().getTime() - days * 86_400_000)
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${String(day.getFullYear())}-${month}-${date}`
}

/** Days before the seed moment, as an ISO timestamp. */
function daysAgo(clock: Clock, days: number): string {
  return new Date(clock.now().getTime() - days * 86_400_000).toISOString()
}

/** The month `back` months before the seed moment, as `YYYY-MM`. */
function monthsAgo(clock: Clock, back: number): string {
  const now = clock.now()
  return toMonthKey(new Date(now.getFullYear(), now.getMonth() - back, 1))
}

/**
 * Fills empty storage with a demonstration dataset.
 *
 * **Named for filling rather than for resetting**, and there is
 * deliberately no flag to make it overwrite. A call site must not be
 * able to ask for "fill if empty" and receive "wipe and replace" — the
 * rule this codebase already holds for destructive operations
 * everywhere else.
 */
export async function seedDemoData(deps: DemoDeps): Promise<SeedResult> {
  const [items, projects, upgrades] = await Promise.all([
    deps.items.count(),
    deps.projects.count(),
    deps.upgrades.count(),
  ])

  if (items + projects + upgrades > 0) return { seeded: false, reason: 'already-has-data' }

  await seedCodex(deps)
  await seedQuests(deps)
  await seedTechTree(deps)
  await seedBase(deps)
  await seedFinance(deps)
  await seedArc(deps)
  await seedBuffs(deps)
  await seedMap(deps)
  await seedSettings(deps)
  await seedTraining(deps)
  await seedMind(deps)
  await seedChallenges(deps)
  await seedResume(deps)

  return { seeded: true }
}

/**
 * A reading and playing list that covers every status the screen can
 * draw, plus the two edge cases worth having on screen: one entry with
 * only the required fields, and one with a title long enough to wrap.
 */
async function seedCodex(deps: DemoDeps): Promise<void> {
  const make = (
    title: string,
    category: string,
    over: Partial<Parameters<typeof createItem>[0]> = {},
    daysBack = 30,
  ) =>
    createItem(
      { title, category, ...over },
      {
        clock: { now: () => new Date(daysAgo(deps.clock, daysBack)) },
        ids: deps.ids,
      },
    )

  /*
   * **Finishing is a stamp, not a status.** `tallyActs` counts
   * `dateCompleted`, deliberately — an item reopened and finished again
   * is one finish, not two. A fixture that only set `status: 'completed'`
   * therefore paid no XP at all, and the landing page read Level 1 with
   * every trait empty. Found by opening the demo build rather than by a
   * test, which is why the parity test below now exists.
   */
  const finished = (item: ReturnType<typeof createItem>, daysBack: number) => ({
    ...item,
    dateCompleted: daysAgo(deps.clock, daysBack),
  })

  /** A run of days with something logged against them. */
  const withProgress = (item: ReturnType<typeof createItem>, days: readonly number[]) => ({
    ...item,
    dailyProgress: days.map((back) => ({
      date: daysAgo(deps.clock, back).slice(0, 10),
      amount: 1,
    })),
  })

  const rows = [
    /*
     * **The one item with a daily goal**, which is what puts a row in the
     * Codex's Today block and on the home screen. Without one that block
     * renders its own empty state on a screen full of books, which reads
     * as a broken feature rather than an unused one.
     *
     * Every day rather than a cadence, deliberately: a Tues/Thurs goal is
     * the more interesting case and is absent from the screen five days
     * out of seven, so a reviewer opening on the wrong day sees nothing.
     */
    withProgress(
      make(
        'The Pragmatic Programmer',
        'books',
        {
          status: 'currently-using',
          priority: 'high',
          dailyGoal: { amount: 20, unit: 'pages' },
        },
        40,
      ),
      [1, 2, 3, 5, 8],
    ),
    make('Designing Data-Intensive Applications', 'books', { status: 'backlog' }, 25),
    finished(make('Project Hail Mary', 'books', { status: 'completed', favorite: true }, 90), 12),
    withProgress(
      make('Outer Wilds', 'games', { status: 'currently-using', priority: 'high' }, 20),
      [1, 4, 6],
    ),
    finished(make('Return of the Obra Dinn', 'games', { status: 'completed' }, 120), 30),
    make('Slay the Spire', 'games', { status: 'paused' }, 60),
    make('Frieren: Beyond Journey’s End', 'anime', { status: 'currently-using' }, 15),
    make('The Bear', 'tv-shows', { status: 'backlog', priority: 'low' }, 10),
    finished(make('Everything Everywhere All At Once', 'movies', { status: 'completed' }, 200), 45),
    /* Only the required fields — the minimal record a screen must survive. */
    make('Dune', 'movies'),
    /* Long enough to wrap on a phone, which is the layout edge case. */
    make(
      'A Very Long Title That Exists Precisely To Prove The Row Wraps Rather Than Clipping',
      'articles',
      { status: 'backlog' },
      5,
    ),
  ]

  await Promise.all(rows.map((item) => deps.items.save(item)))
}

/** One main quest, one side quest, a contract, and something finished. */
async function seedQuests(deps: DemoDeps): Promise<void> {
  await addProject(
    {
      name: 'Ship the portfolio site',
      kind: 'main',
      steps: ['Pick the three projects', 'Write the case studies', 'Buy the domain'],
    },
    deps,
  )

  await addProject(
    {
      name: 'Learn enough Rust to be dangerous',
      kind: 'side',
      steps: ['Read the book to chapter 10', 'Port one small tool'],
    },
    deps,
  )

  const porch = await addProject(
    {
      name: 'Fix the porch light',
      belongsTo: 'base',
      approach: 'diy',
      steps: ['Work out what it needs', 'Get the materials', 'Do the work'],
    },
    deps,
  )

  const tap = await addProject(
    {
      name: 'Replace the kitchen tap',
      belongsTo: 'base',
      approach: 'hired',
      steps: ['Find the right person', 'Get a quote', 'Book the appointment'],
    },
    deps,
  )

  /*
   * **A closed step is what pays**, and which area it pays is decided by
   * the job's approach: hired work pays Base, work you do yourself pays
   * Crafting. Both are seeded because they are the same record type
   * scoring two different bars, and a fixture that closed neither leaves
   * both areas reading silent on a screen full of house jobs.
   */
  const quote = tap.actions[0]
  if (quote !== undefined) await setActionStatus(tap.id, quote.id, true, deps)

  await addProject(
    {
      name: 'Senior engineer at Northwind Systems',
      belongsTo: 'jobs',
      steps: [...APPLICATION_STAGES],
    },
    deps,
  )

  /*
   * A second one further along, because the screen's whole subject is
   * **how far each one has got** — one application sitting at 0 of 3
   * demonstrates the list and not the thing the list is for.
   *
   * Its closed stages are what `jobs.stage-advances-in-month` counts:
   * `ActionItem.completedAt` is the only record of *when* an application
   * reached a stage, which is why the stages are steps rather than a
   * "current stage" field.
   */
  const further = await addProject(
    {
      name: 'Platform engineer at Contoso Labs',
      belongsTo: 'jobs',
      steps: [...APPLICATION_STAGES],
    },
    deps,
  )
  for (const stage of further.actions.slice(0, 2)) {
    await setActionStatus(further.id, stage.id, true, deps)
  }

  /*
   * **A contract is one step, and that is not tidiness.** Nothing pays
   * for a project existing or being marked done — XP comes from closing
   * a step — so a one-off created empty would earn nothing, and a
   * section full of things that pay nothing teaches you not to use it.
   */
  await addContract('Return the parcel', deps)

  /*
   * One quest with a step already closed and one finished outright, so
   * the board draws a part-done card, the fold has something behind it,
   * and the XP total is not paid entirely by the Codex.
   */
  const main = await addProject(
    {
      name: 'Sort the photo archive',
      kind: 'side',
      steps: ['Buy the drive', 'Cull the duplicates', 'Back it up twice'],
    },
    deps,
  )

  const first = main.actions[0]
  if (first !== undefined) await setActionStatus(main.id, first.id, true, deps)

  const survey = porch.actions[0]
  if (survey !== undefined) await setActionStatus(porch.id, survey.id, true, deps)

  const done = await addProject(
    { name: 'Renew the passport', kind: 'side', steps: ['Book the photo', 'Send the form'] },
    deps,
  )
  for (const action of done.actions) {
    await setActionStatus(done.id, action.id, true, deps)
  }
  await updateProject(done.id, { status: 'completed' }, deps)
}

/** Two shelves, a prerequisite chain, and something already owned. */
async function seedTechTree(deps: DemoDeps): Promise<void> {
  const desk = await addUpgrade(
    {
      title: 'Standing desk',
      category: 'home',
      shelf: 'base',
      estimatedCostMinorUnits: 45_000,
    },
    deps,
  )

  await addUpgrade(
    {
      title: 'Monitor arm',
      category: 'office',
      shelf: 'tech',
      estimatedCostMinorUnits: 12_000,
      /* Gated on the desk, so the tree has an edge to draw and a lock. */
      ...(desk.upgrade === undefined ? {} : { prerequisiteId: desk.upgrade.id }),
    },
    deps,
  )

  const keyboard = await addUpgrade(
    {
      title: 'Mechanical keyboard',
      category: 'office',
      shelf: 'tech',
      estimatedCostMinorUnits: 9_000,
    },
    deps,
  )

  /*
   * **Every status the tree can draw, because two of them have nowhere
   * else to appear.** Owned and dropped both fold away behind the eye,
   * so a fixture holding only open upgrades leaves that control with
   * nothing behind it and the screen looking like it has a dead button.
   */
  if (keyboard.upgrade !== undefined) {
    await updateUpgrade(keyboard.upgrade.id, { status: 'purchased' }, deps)
  }

  const dropped = await addUpgrade(
    {
      title: 'Espresso machine',
      category: 'lifestyle',
      shelf: 'base',
      estimatedCostMinorUnits: 60_000,
    },
    deps,
  )
  if (dropped.upgrade !== undefined) {
    await updateUpgrade(dropped.upgrade.id, { status: 'cancelled' }, deps)
  }
}

/** Rooms with readings, so the clutter average has something to average. */
async function seedBase(deps: DemoDeps): Promise<void> {
  const rooms: readonly [string, number][] = [
    ['Kitchen', 95],
    ['Living room', 70],
    ['Office', 45],
    ['Garage', 20],
  ]

  /*
   * `addRoom` reports a refusal rather than handing the room back, so the
   * reading is applied by finding it afterwards — the same two steps the
   * screen takes.
   */
  for (const [name, clear] of rooms) {
    await addRoom(name, deps)
    const saved = (await deps.rooms.all()).find((one) => one.name === name)
    if (saved !== undefined) await recordClear(saved.id, clear, deps)
  }

  /* One room nobody has looked at — the absent-never-zero case. */
  await addRoom('Loft', deps)
}

/** Three months, so every trend on the screen has two points to compare. */
async function seedFinance(deps: DemoDeps): Promise<void> {
  const months: readonly { back: number; net: number; credit: number; saved: number }[] = [
    { back: 2, net: 4_100_000, credit: 712, saved: 240_000 },
    { back: 1, net: 4_350_000, credit: 728, saved: 310_000 },
    { back: 0, net: 4_620_000, credit: 741, saved: 385_000 },
  ]

  /*
   * **Written through the repository rather than `recordFinance`**, which
   * is the one place this seeder does not drive a use case. That function
   * derives the month from the clock on purpose — a reading is a
   * statement about *now* — so it cannot write history, and history is
   * exactly what a trend needs. Two points make a direction; one makes a
   * number.
   */
  for (const month of months) {
    await deps.finance.save({
      month: monthsAgo(deps.clock, month.back),
      netWorthMinor: month.net,
      retirementMinor: Math.round(month.net * 0.42),
      creditScore: month.credit,
      salaryMinor: 11_800_000,
      savingsMinor: month.saved,
      surplusMinor: 90_000,
    })
  }
}

/** The long arc, with one stage already met so the bars are not all empty. */
async function seedArc(deps: DemoDeps): Promise<void> {
  await addCampaign(
    {
      name: 'Move somewhere with a garden',
      aim: 'Out of the flat and into somewhere with a bit of outside.',
      stages: [
        { name: 'Fix up the flat', requirement: { kind: 'house-jobs', count: 8 } },
        { name: 'Improve my income', requirement: { kind: 'salary', minorUnits: 15_000_000 } },
        { name: 'Save the deposit', requirement: { kind: 'savings', minorUnits: 1_000_000 } },
      ],
    },
    deps,
  )
}

/**
 * Potions and restoratives, which are the two cards the landing page
 * draws under "Buffs" and the health bar.
 *
 * Written through the repository rather than a use case for the reason
 * the finance history is: the pools need *spends already on them* to
 * demonstrate anything, and spending is a thing that happens at a
 * moment rather than something a create call takes.
 */
async function seedBuffs(deps: DemoDeps): Promise<void> {
  const at = (daysBack: number, hour: number) => {
    const day = new Date(deps.clock.now().getTime() - daysBack * 86_400_000)
    day.setHours(hour, 0, 0, 0)
    return day.toISOString()
  }

  const pools = [
    {
      id: deps.ids.next(),
      name: 'Caffeine',
      capacity: 400,
      unit: 'mg',
      icon: 'coffee',
      cycle: { kind: 'calendar', period: 'day' },
      presets: [
        { label: 'Coffee', amount: 95 },
        { label: 'Double espresso', amount: 130 },
      ],
      /* Two in today, so the pool reads part-spent rather than untouched. */
      spent: [`${at(0, 8)}#95`, `${at(0, 11)}#130`],
    },
    {
      id: deps.ids.next(),
      name: 'Alcohol',
      capacity: 3,
      icon: 'beer',
      cycle: { kind: 'calendar', period: 'day' },
      daysLimit: { days: 2, period: 'week' },
      spent: [at(2, 20), at(2, 21)],
    },
    {
      id: deps.ids.next(),
      name: 'Water',
      capacity: 128,
      unit: 'oz',
      icon: 'droplet',
      direction: 'target',
      cycle: { kind: 'calendar', period: 'day' },
      presets: [
        { label: 'Gallon jug', amount: 128 },
        { label: 'Bottle', amount: 32 },
      ],
      spent: [`${at(0, 9)}#32`, `${at(0, 13)}#32`, `${at(1, 10)}#128`],
    },
    {
      id: deps.ids.next(),
      name: 'Vegetables',
      capacity: 2,
      icon: 'carrot',
      direction: 'target',
      cycle: { kind: 'calendar', period: 'day' },
      spent: [at(0, 13), at(0, 19), at(1, 19)],
    },
  ]

  for (const pool of pools) {
    await deps.vices.save(pool as unknown as Parameters<typeof deps.vices.save>[0])
  }
}

/**
 * Somewhere to go, and somewhere already been.
 *
 * **The visited half is what lights the fog.** `allExploredCells`
 * derives cells from places carrying a `dateVisited`, so the exploration
 * ladder and the cleared area on the map need no fixture of their own —
 * and seeding `exploredCells` directly would be a second, disagreeing
 * answer to the same question.
 *
 * Every coordinate is a public landmark in one city, which is the whole
 * safety argument for this section rather than a matter of taste: an
 * address is the one field on this screen that could be somebody's home,
 * so the fixture contains none that is not already on a postcard. They
 * sit close together so the map opens on a frame rather than on an ocean.
 */
async function seedMap(deps: DemoDeps): Promise<void> {
  const atlas = {
    places: deps.places,
    explored: deps.explored,
    clock: deps.clock,
    ids: deps.ids,
  }

  const rows = [
    {
      name: 'Golden Gate Park',
      categoryId: 'outdoors' as CategoryId,
      latitude: 37.7694,
      longitude: -122.4862,
      city: 'San Francisco',
      visited: true,
      favorite: true,
      tags: ['walkable', 'free'],
    },
    {
      name: 'Ferry Building Marketplace',
      categoryId: 'food' as CategoryId,
      latitude: 37.7955,
      longitude: -122.3937,
      city: 'San Francisco',
      visited: true,
      tags: ['coffee'],
    },
    {
      name: 'Exploratorium',
      categoryId: 'culture' as CategoryId,
      latitude: 37.8017,
      longitude: -122.3973,
      city: 'San Francisco',
      visited: true,
    },
    {
      name: 'Lands End Trail',
      categoryId: 'outdoors' as CategoryId,
      latitude: 37.7809,
      longitude: -122.5058,
      city: 'San Francisco',
      priority: 'high' as const,
      tags: ['walkable'],
    },
    {
      name: 'City Lights Booksellers',
      categoryId: 'shops' as CategoryId,
      latitude: 37.7976,
      longitude: -122.4066,
      city: 'San Francisco',
      priority: 'high' as const,
    },
    {
      name: 'Coit Tower',
      categoryId: 'landmarks' as CategoryId,
      latitude: 37.8025,
      longitude: -122.4058,
      city: 'San Francisco',
      priority: 'low' as const,
    },
    /*
     * **A place with no point is a supported entry, not a broken one.**
     * It is the name-only capture the inbox exists to resolve, and
     * without one that screen has nothing to demonstrate.
     */
    { name: 'That ramen place someone mentioned', categoryId: 'food' as CategoryId },
  ]

  const saved: PlaceId[] = []
  for (const { visited, ...input } of rows) {
    const created = await addPlace(input, atlas)
    if (created.place === undefined) continue
    saved.push(created.place.id)
    if (visited === true) await visitPlace(created.place.id, atlas)
  }

  /*
   * **A trip is a few saved places and the days you will be near them**,
   * which is why it is seeded here rather than in a function of its own:
   * it needs the ids the loop above just produced, and inventing them
   * separately would file a trip against places that do not exist.
   *
   * One upcoming and one past, because the screen sorts on that and a
   * fixture with only future trips leaves half of it undemonstrated.
   */
  const dayKey = (offset: number) => dayKeyAgo(deps.clock, -offset)

  await deps.trips.save({
    id: deps.ids.next() as TripId,
    name: 'A weekend of walking',
    location: 'San Francisco',
    startDate: dayKey(12),
    endDate: dayKey(14),
    placeIds: saved.slice(3, 6),
    notes: 'The coastal trail first, then books and the tower.',
  })

  await deps.trips.save({
    id: deps.ids.next() as TripId,
    name: 'The food one',
    location: 'San Francisco',
    startDate: dayKeyAgo(deps.clock, 40),
    endDate: dayKeyAgo(deps.clock, 38),
    placeIds: saved.slice(0, 2),
  })
}

/**
 * A resume, for a person who does not exist.
 *
 * **The one record in the app that nothing regenerates**, and therefore
 * the one whose empty screen reads most like a broken feature rather
 * than an untouched one — there is no "add your first" path that makes
 * sense to demonstrate with nothing behind it.
 *
 * **The contact line carries a city and nothing else.** A real resume
 * has an email and a phone number on it, and this fixture is scanned for
 * exactly those: `seed.test.ts` reads its own source and fails on
 * anything shaped like one. A fictional address would pass the scan and
 * would still be a made-up email published in a public repository. The
 * line says what it is instead.
 *
 * Northwind is the fixture employer this repository already uses
 * everywhere else, for the same reason.
 */
async function seedResume(deps: DemoDeps): Promise<void> {
  const bullet = (text: string) => ({ id: deps.ids.next() as BulletId, text })

  await deps.resume.save({
    name: 'Alex Rivera',
    contact: 'San Francisco · contact details omitted from the demo fixture',
    summary:
      'Software engineer with eight years building web applications, most recently on data-heavy internal tools. Happiest where the domain has real rules in it.',
    skills: [
      { label: 'Languages', skills: ['TypeScript', 'Python', 'Go', 'SQL'] },
      { label: 'Frontend', skills: ['React', 'Vite', 'Tailwind', 'Testing Library'] },
      { label: 'Platform', skills: ['Postgres', 'Docker', 'Terraform', 'GitHub Actions'] },
    ],
    companies: [
      {
        id: deps.ids.next() as CompanyId,
        name: 'Northwind Systems',
        location: 'San Francisco',
        /*
         * Two roles at one employer, newest first — a promotion, which a
         * flat list of jobs prints as two employers and makes read as
         * job-hopping. It is the case the `Company` type exists for, so
         * the fixture has to contain one.
         */
        roles: [
          {
            id: deps.ids.next() as RoleId,
            title: 'Senior Software Engineer',
            from: 'March 2023',
            bullets: [
              bullet(
                'Led the rewrite of the scheduling service, cutting p95 latency from 1.8s to 240ms.',
              ),
              bullet(
                'Introduced typed contracts between four teams, removing a class of integration bug entirely.',
              ),
              bullet('Mentored three engineers through their first year.'),
            ],
          },
          {
            id: deps.ids.next() as RoleId,
            title: 'Software Engineer',
            from: 'June 2020',
            to: 'March 2023',
            bullets: [
              bullet('Built the reporting pipeline that replaced a weekly manual export.'),
              bullet('Moved the test suite off a shared database, taking CI from 22 minutes to 6.'),
            ],
          },
        ],
      },
      {
        id: deps.ids.next() as CompanyId,
        name: 'Contoso Labs',
        location: 'Remote',
        roles: [
          {
            id: deps.ids.next() as RoleId,
            title: 'Software Engineer',
            from: 'August 2018',
            to: 'May 2020',
            bullets: [
              bullet('Shipped the first version of the customer portal, from an empty repository.'),
              bullet('Owned the on-call rotation for two services.'),
            ],
          },
        ],
      },
    ],
    education: [
      {
        school: 'University of Somewhere',
        award: 'BSc Computer Science',
        detail: 'Graduated 2018',
      },
    ],
  })
}

/**
 * The one setting the demo states, and it is a denominator.
 *
 * **A ladder is only a ladder because something outside the app fixes
 * its scale**, and for exploration that is the area of the region being
 * explored — which nothing here can know. Left unset the reading is
 * *absent*, which is the honest answer and demonstrates nothing, so the
 * fixture names a region the way a person would: the city its places are
 * in, at roughly its real area.
 *
 * **Merged rather than replaced.** Everything else in settings is a
 * default the app chose, and overwriting the blob to set one field would
 * make the demo silently responsible for every other one.
 */
async function seedSettings(deps: DemoDeps): Promise<void> {
  const current = await deps.settings.get()
  /* San Francisco, near enough. */
  await deps.settings.save({ ...current, exploredRegionKm2: 121 })
}

/**
 * Three finished sessions, so Strength and Stamina are not empty bars.
 *
 * **This is the one part written as records rather than driven through
 * the use cases**, and it is worth saying why, because the rest of this
 * file argues the opposite. `startWorkout` opens *today's* programme day
 * and `finishWorkout` advances the position from wherever it now stands,
 * so a loop of start-then-finish yields three sessions all dated today
 * with the block three days further on than the history claims. There is
 * no way to ask those use cases for a session that happened last week,
 * because from the app's point of view there never is one.
 *
 * What that gives up is the guarantee that the fixture can only hold
 * states the app could produce. It is bought back with the real exercise
 * slugs, the real `SetPrescription` shape and the real roles — and by
 * the parity test, which renders the screens rather than trusting the
 * records.
 */
async function seedTraining(deps: DemoDeps): Promise<void> {
  const lifted = (
    slug: string,
    order: number,
    role: LogEntry['role'],
    load: number,
    reps: number,
  ): LogEntry => ({
    exerciseId: slug as ExerciseId,
    role,
    order,
    sets: Array.from({ length: 3 }, () => ({
      prescription: {
        load: { kind: 'working' as const },
        reps: { kind: 'range' as const, low: reps - 2, high: reps + 2 },
      },
      plannedLoad: load,
      plannedReps: reps,
      actualLoad: load,
      actualReps: reps,
      outcome: 'completed' as const,
      isWarmup: false,
    })),
  })

  /*
   * The conditioning entry is what pays Stamina, and only because a set
   * on it is completed: `hasConditioning` asks whether the work was
   * *done* rather than whether it was scheduled. A fixture of slots with
   * nothing logged against them would leave that bar empty while looking,
   * from the record, like a full week of training.
   */
  const walked = (order: number): LogEntry => ({
    exerciseId: 'incline-walk' as ExerciseId,
    role: 'conditioning',
    order,
    sets: [
      {
        prescription: {
          load: { kind: 'bodyweight' as const },
          reps: { kind: 'time' as const, seconds: 1800 },
        },
        outcome: 'completed' as const,
        isWarmup: false,
      },
    ],
  })

  const sessions = [
    {
      daysBack: 6,
      entries: [
        lifted('low-bar-squat', 0, 'strength', 245, 5),
        lifted('bench-press', 1, 'hypertrophy', 165, 10),
        lifted('barbell-row', 2, 'hypertrophy', 135, 10),
        walked(3),
      ],
    },
    {
      daysBack: 4,
      entries: [
        lifted('bench-press', 0, 'strength', 190, 5),
        lifted('pull-up', 1, 'hypertrophy', 0, 8),
        lifted('db-lateral-raise', 2, 'hypertrophy', 20, 15),
        walked(3),
      ],
    },
    {
      daysBack: 2,
      entries: [
        lifted('sumo-deadlift', 0, 'strength', 315, 5),
        lifted('dips', 1, 'hypertrophy', 0, 10),
        lifted('barbell-calf-raise', 2, 'hypertrophy', 185, 15),
        walked(3),
      ],
    },
  ]

  for (const session of sessions) {
    const on = new Date(deps.clock.now().getTime() - session.daysBack * 86_400_000)
    const log: WorkoutLog = {
      id: deps.ids.next() as WorkoutId,
      date: dayKeyAgo(deps.clock, session.daysBack),
      startedAt: daysAgo(deps.clock, session.daysBack),
      completedAt: daysAgo(deps.clock, session.daysBack),
      status: 'completed',
      /*
       * **The weekday is read off the date rather than written beside
       * it.** The app titles a session "Monday — Squat", and a fixture
       * that hardcoded the word would be right on the day it was written
       * and wrong every day after — a session dated Thursday reading
       * "Friday", which is the exact rot relative dates exist to avoid,
       * reintroduced in the label.
       */
      title: `${on.toLocaleDateString('en-US', { weekday: 'long' })} — Full body`,
      entries: session.entries,
    }
    await deps.workouts.save(log)
  }
}

/**
 * A practice log, because Mind is otherwise a screen with a heading.
 *
 * The clock is shifted per entry rather than passed once: `logAttempt`
 * stamps `solvedOn` from `deps.clock`, so seeding them all against the
 * seed moment would file a week of practice on one afternoon — and the
 * *days practised* rating counts distinct days, which is the whole
 * reason it exists beside the problem count.
 */
async function seedMind(deps: DemoDeps): Promise<void> {
  const attempts: readonly [string, number, 'easy' | 'medium' | 'hard'][] = [
    ['Two Sum', 9, 'easy'],
    ['Valid Parentheses', 7, 'easy'],
    ['Longest Substring Without Repeating Characters', 4, 'medium'],
    ['Course Schedule', 2, 'medium'],
    ['Word Ladder', 1, 'hard'],
  ]

  for (const [title, daysBack, difficulty] of attempts) {
    const on = new Date(deps.clock.now().getTime() - daysBack * 86_400_000)
    await logAttempt(
      { title, difficulty, source: 'leetcode' },
      { attempts: deps.attempts, ids: deps.ids, clock: { now: () => on } },
    )
  }
}

/**
 * One challenge ticked, so the season's pass is not at nought.
 *
 * **Read rather than named.** The catalogue is placed against the
 * season the clock is in, so a hardcoded slug would be a challenge that
 * only exists for three months of the year — the fixture would tick
 * nothing for the other nine and nothing would say why.
 */
async function seedChallenges(deps: DemoDeps): Promise<void> {
  const pass = await readChallenges(deps)
  const first = pass.challenges[0]
  if (first === undefined) return

  await completeChallenge(first.id, deps)
}
