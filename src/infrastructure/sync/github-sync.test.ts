import { deleteDB } from 'idb'
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import type { BackupRepositories } from '@/infrastructure/backup/backup-service'
import { closeAppDatabase, openDatabase, type AppDatabase } from '@/infrastructure/db/database'
import {
  createAttemptRepository,
  createBacklogItemRepository,
  createCampaignRepository,
  createChallengeRepository,
  createCheckInRepository,
  createExerciseRepository,
  createExploredAreaRepository,
  createFinanceRepository,
  createGoalRepository,
  createPlaceRepository,
  createProjectRepository,
  createResumeRepository,
  createReviewRepository,
  createRoomRepository,
  createTombstoneRepository,
  createTripRepository,
  createUpgradeRepository,
  createViceRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { aWorkout } from '@/test/builders/workout'

import { fromBase64, toBase64, type GitHubTarget } from './github-file'
import { syncWithGitHub } from './github-sync'

/**
 * Two devices, one repository, and the network replaced by an in-memory
 * GitHub that behaves the way the real contents API does where it
 * matters: a write must name the sha it replaces, and a stale one is
 * refused with 409.
 */
function fakeGitHub() {
  let file: { text: string; sha: string } | undefined
  let version = 0
  let writes = 0
  /** Set to make the next write lose a race, as if the other device got there first. */
  let raceOnce: (() => void) | undefined

  const respond = (_url: string, init?: RequestInit): Response => {
    if (init?.method === 'PUT') {
      raceOnce?.()
      raceOnce = undefined
      const body = JSON.parse(init.body as string) as { content: string; sha?: string }
      if (file !== undefined && body.sha !== file.sha) return new Response('', { status: 409 })
      version += 1
      writes += 1
      file = { text: fromBase64(body.content), sha: `sha-${String(version)}` }
      return new Response('{}', { status: 200 })
    }
    if (file === undefined) return new Response('', { status: 404 })
    return new Response(
      JSON.stringify({ sha: file.sha, content: toBase64(file.text), encoding: 'base64' }),
      { status: 200 },
    )
  }
  const fetchFn = ((url: string, init?: RequestInit) =>
    Promise.resolve(respond(url, init))) as typeof fetch

  return {
    fetchFn,
    writes: () => writes,
    loseNextRace: (other: () => void) => {
      raceOnce = other
    },
    bump: () => {
      if (file === undefined) return
      version += 1
      file = { ...file, sha: `sha-${String(version)}` }
    },
  }
}

const target: GitHubTarget = { owner: 'me', repo: 'data', path: 'lifeos.json', token: 't' }
const clock = { now: () => new Date('2026-09-01T09:00:00.000Z') }

const opened: string[] = []

async function device(name: string): Promise<BackupRepositories> {
  const db: AppDatabase = await openDatabase(name)
  opened.push(name)
  return {
    exercises: createExerciseRepository(db, clock),
    workouts: createWorkoutRepository(db, clock),
    checkIns: createCheckInRepository(db, clock),
    resume: createResumeRepository(db, clock),
    campaigns: createCampaignRepository(db, clock),
    goals: createGoalRepository(db, clock),
    attempts: createAttemptRepository(db, clock),
    challenges: createChallengeRepository(db, clock),
    rooms: createRoomRepository(db, clock),
    tombstones: createTombstoneRepository(db),
    items: createBacklogItemRepository(db, clock),
    projects: createProjectRepository(db, clock),
    upgrades: createUpgradeRepository(db, clock),
    review: createReviewRepository(db, clock),
    places: createPlaceRepository(db, clock),
    trips: createTripRepository(db, clock),
    explored: createExploredAreaRepository(db),
    vices: createViceRepository(db, clock),
    finance: createFinanceRepository(db, clock),
  }
}

afterEach(async () => {
  await closeAppDatabase()
  for (const name of opened.splice(0)) await deleteDB(name)
})

const options = { settings: DEFAULT_SETTINGS, appVersion: 'test', now: clock.now() }

describe('syncing two devices through one file', () => {
  /*
   * One database per test, opened and closed in turn: `openDatabase` holds
   * a single connection, so the two "devices" take turns exactly the way
   * one person's phone and desktop do.
   */
  it('carries a session logged on one device to the other', async () => {
    const github = fakeGitHub()
    const phone = await device('sync-phone')
    const workout = aWorkout({ notes: 'from the phone', updatedAt: '2026-09-01T08:00:00.000Z' })
    await phone.workouts.restoreMany([workout])

    const first = await syncWithGitHub(target, phone, options, github.fetchFn)
    expect(first.uploaded).toBe(true)
    await closeAppDatabase()

    const desktop = await device('sync-desktop')
    const second = await syncWithGitHub(target, desktop, options, github.fetchFn)

    expect(second.pulled).toBeGreaterThan(0)
    expect((await desktop.workouts.byId(workout.id))?.notes).toBe('from the phone')
  })

  /*
   * The no-op commit guard. Without it every page switch would be a
   * commit, and two devices would trade identical files forever.
   */
  it('writes nothing when nothing has changed', async () => {
    const github = fakeGitHub()
    const phone = await device('sync-idle')
    await phone.workouts.restoreMany([aWorkout({ updatedAt: '2026-09-01T08:00:00.000Z' })])

    await syncWithGitHub(target, phone, options, github.fetchFn)
    const again = await syncWithGitHub(target, phone, options, github.fetchFn)

    expect(again.uploaded).toBe(false)
    expect(github.writes()).toBe(1)
  })

  it('reads again and retries when the other device wrote in between', async () => {
    const github = fakeGitHub()
    const phone = await device('sync-race')
    await phone.workouts.restoreMany([aWorkout({ updatedAt: '2026-09-01T08:00:00.000Z' })])
    await syncWithGitHub(target, phone, options, github.fetchFn)

    await phone.workouts.restoreMany([aWorkout({ updatedAt: '2026-09-01T08:30:00.000Z' })])
    // The file moves on between this device's read and its write.
    github.loseNextRace(() => {
      github.bump()
    })
    const run = await syncWithGitHub(target, phone, options, github.fetchFn)

    expect(run.uploaded).toBe(true)
    expect(github.writes()).toBe(2)
  })

  it('refuses to overwrite a file that is not a readable backup', async () => {
    const github = fakeGitHub()
    const phone = await device('sync-corrupt')
    await syncWithGitHub(target, phone, options, github.fetchFn)

    const broken = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return github.fetchFn(url, init)
      return new Response(
        JSON.stringify({ sha: 'x', content: toBase64('{"not":"a backup"'), encoding: 'base64' }),
        { status: 200 },
      )
    }) as typeof fetch

    await expect(syncWithGitHub(target, phone, options, broken)).rejects.toThrow(
      /not a readable backup/,
    )
  })

  it('round-trips text that is not ASCII', () => {
    const text = 'Frieren: Beyond Journey’s End — 5 × 3–5'
    expect(fromBase64(toBase64(text))).toBe(text)
  })
})
