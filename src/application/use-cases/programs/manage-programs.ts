import type { IdGenerator, InstanceId, ProgramId } from '@/domain/ids/ids'
import { asInstanceId, asProgramId } from '@/domain/ids/ids'
import type { ProgramTemplate } from '@/domain/programs/program'
import type {
  Clock,
  ExerciseRepository,
  InstanceRepository,
  ProgramInstance,
  ProgramRepository,
} from '@/domain/repositories/ports'

export interface ProgramDeps {
  readonly programs: ProgramRepository
  readonly instances: InstanceRepository
  readonly exercises: ExerciseRepository
  readonly ids: IdGenerator
  readonly clock: Clock
}

/**
 * Copies a program so it can be edited freely.
 *
 * Forking rather than editing in place is what lets the built-ins be
 * genuinely editable without a lifter being able to lose the original —
 * and it is why nothing in the app needs a concept of a locked preset.
 */
export async function forkProgram(
  programId: ProgramId,
  name: string,
  deps: ProgramDeps,
): Promise<ProgramTemplate> {
  const original = await deps.programs.byId(programId)
  if (original === undefined) throw new Error(`No program found with id ${programId}.`)

  const timestamp = deps.clock.now().toISOString()
  const fork: ProgramTemplate = {
    ...original,
    id: asProgramId(deps.ids.next()),
    name,
    origin: 'fork',
    forkedFrom: original.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  await deps.programs.save(fork)
  return fork
}

export async function saveProgram(
  program: ProgramTemplate,
  deps: ProgramDeps,
): Promise<ProgramTemplate> {
  const updated: ProgramTemplate = { ...program, updatedAt: deps.clock.now().toISOString() }
  await deps.programs.save(updated)
  return updated
}

/* -------------------------------------------------------------------- */
/* Running a program                                                     */
/* -------------------------------------------------------------------- */

export interface StartProgramResult {
  readonly instance: ProgramInstance
}

/**
 * Begins a run of a program.
 *
 * The instance takes a frozen copy of the template. Editing the template
 * afterwards changes what *future* runs prescribe and leaves this one
 * exactly as it was — the separation LiftTracker lacked, where the
 * generated sets were both the plan and the log and editing either
 * destroyed the other.
 */
export async function startProgram(
  programId: ProgramId,
  deps: ProgramDeps,
): Promise<StartProgramResult> {
  const program = await deps.programs.byId(programId)
  if (program === undefined) throw new Error(`No program found with id ${programId}.`)

  // Only one program runs at a time. Any other active run is paused
  // rather than deleted, so it can be resumed with its position intact.
  const running = await deps.instances.active()
  if (running !== undefined) {
    await deps.instances.save({ ...running, status: 'paused' })
  }

  const instance: ProgramInstance = {
    id: asInstanceId(deps.ids.next()),
    programId: program.id,
    templateSnapshot: program,
    name: program.name,
    startedAt: deps.clock.now().toISOString(),
    status: 'active',
    cycleNumber: 1,
    blockIndex: 0,
    weekIndex: 0,
    dayIndex: 0,
  }

  await deps.instances.save(instance)
  return { instance }
}

export async function pauseProgram(instanceId: InstanceId, deps: ProgramDeps): Promise<void> {
  const instance = await deps.instances.byId(instanceId)
  if (instance === undefined) return
  await deps.instances.save({ ...instance, status: 'paused' })
}

export async function resumeProgram(instanceId: InstanceId, deps: ProgramDeps): Promise<void> {
  const running = await deps.instances.active()
  if (running !== undefined && running.id !== instanceId) {
    await deps.instances.save({ ...running, status: 'paused' })
  }

  const instance = await deps.instances.byId(instanceId)
  if (instance === undefined) return
  await deps.instances.save({ ...instance, status: 'active' })
}
