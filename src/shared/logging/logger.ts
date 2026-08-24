/**
 * Structured logging.
 *
 * Two rules make this safe to leave switched on in production:
 *
 *   1. **Event names and scalars only.** Never a set, a weight, a note, a
 *      program name, or anything else a lifter typed. This is a health
 *      and fitness app; its data is personal, and a log line is the
 *      easiest place for personal data to end up somewhere unexpected.
 *   2. **One sink.** Everything goes through here, so the level filter and
 *      the rule above cannot be bypassed. An ESLint rule forbids
 *      `console` everywhere else in the codebase.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

/** Scalars only — the type is the enforcement. */
export type LogFields = Record<string, string | number | boolean | null | undefined>

function configuredLevel(): LogLevel {
  const raw: unknown = import.meta.env.VITE_LOG_LEVEL
  // A typo must not silently enable debug logging in production, so an
  // unrecognised value falls back to the default rather than being
  // trusted.
  if (typeof raw === 'string' && (LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel
  }
  return import.meta.env.DEV ? 'debug' : 'warn'
}

let level: LogLevel = configuredLevel()

export function setLogLevel(next: LogLevel): void {
  level = next
}

export function getLogLevel(): LogLevel {
  return level
}

function shouldLog(candidate: LogLevel): boolean {
  return SEVERITY[candidate] >= SEVERITY[level]
}

function emit(candidate: Exclude<LogLevel, 'silent'>, event: string, fields?: LogFields): void {
  if (!shouldLog(candidate)) return

  const payload = { event, ...fields }

  switch (candidate) {
    case 'debug':
      console.debug(payload)
      return
    case 'info':
      console.info(payload)
      return
    case 'warn':
      console.warn(payload)
      return
    case 'error':
      console.error(payload)
      return
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => {
    emit('debug', event, fields)
  },
  info: (event: string, fields?: LogFields) => {
    emit('info', event, fields)
  },
  warn: (event: string, fields?: LogFields) => {
    emit('warn', event, fields)
  },
  /**
   * Errors carry the error's name and message but never its stack in
   * production — a stack from a source-mapped bundle can leak paths, and
   * the name plus the event is enough to find the problem.
   */
  error: (event: string, error?: unknown, fields?: LogFields) => {
    const details: LogFields =
      error instanceof Error
        ? { errorName: error.name, errorMessage: error.message }
        : error !== undefined
          ? { errorName: 'unknown' }
          : {}

    emit('error', event, { ...fields, ...details })
  },
}
