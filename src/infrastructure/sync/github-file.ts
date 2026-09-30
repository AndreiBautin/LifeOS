/**
 * One file in one private GitHub repository, read and written through the
 * REST API's contents endpoint.
 *
 * **The whole transport, and deliberately nothing more.** GitHub is where
 * the code and the deploy already live, the API is free with no card,
 * and a fine-grained token can be scoped to this one repository with
 * contents read/write and nothing else — so the worst case of the token
 * leaking is the data it already guards.
 *
 * Every request is `cache: 'no-store'`. The API sends `max-age=60`, and a
 * read served from the browser's cache would hand back the file as it
 * was a minute ago — a sync that then writes against that stale `sha` is
 * refused, and one that merges the stale copy has simply missed the
 * other device's last change.
 */
export interface GitHubTarget {
  readonly owner: string
  readonly repo: string
  readonly path: string
  readonly token: string
}

export interface RemoteFile {
  readonly text: string
  /** The blob id the next write must name, so it cannot clobber a newer one. */
  readonly sha: string
}

export type WriteOutcome = 'written' | 'conflict'

/** A failure the Settings screen can put into words. */
export type GitHubSyncReason =
  'unauthorised' | 'not-found' | 'rate-limited' | 'network' | 'unexpected'

export class GitHubSyncError extends Error {
  readonly reason: GitHubSyncReason

  constructor(reason: GitHubSyncReason, message: string) {
    super(message)
    this.name = 'GitHubSyncError'
    this.reason = reason
  }
}

type Fetch = typeof fetch

function urlOf(target: GitHubTarget): string {
  const path = target.path.split('/').map(encodeURIComponent).join('/')
  return `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${path}`
}

function headers(target: GitHubTarget, accept: string): Record<string, string> {
  return {
    Accept: accept,
    Authorization: `Bearer ${target.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function failureFor(status: number): GitHubSyncError {
  if (status === 401) return new GitHubSyncError('unauthorised', 'The token was refused.')
  if (status === 403 || status === 429)
    return new GitHubSyncError(
      'rate-limited',
      'GitHub refused the request — rate limit or token scope.',
    )
  if (status === 404)
    return new GitHubSyncError('not-found', 'Repository not found, or the token cannot see it.')
  return new GitHubSyncError('unexpected', `GitHub answered ${String(status)}.`)
}

async function send(fetchFn: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, { ...init, cache: 'no-store' })
  } catch {
    throw new GitHubSyncError('network', 'Could not reach GitHub.')
  }
}

/** UTF-8 safe, and chunked so a large file does not overflow the call stack. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const CHUNK = 0x8000
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** The file, or `undefined` when it does not exist yet — the first sync. */
export async function readFile(
  target: GitHubTarget,
  fetchFn: Fetch = fetch,
): Promise<RemoteFile | undefined> {
  const response = await send(fetchFn, urlOf(target), {
    headers: headers(target, 'application/vnd.github+json'),
  })
  if (response.status === 404) {
    // Either the file or the repository is missing; the write that follows
    // tells them apart, because creating a file in a missing repo fails.
    return undefined
  }
  if (!response.ok) throw failureFor(response.status)

  const body = (await response.json()) as unknown
  if (typeof body !== 'object' || body === null || !('sha' in body)) {
    throw new GitHubSyncError('unexpected', 'That path is not a file.')
  }
  const { sha, content, encoding } = body as {
    readonly sha: string
    readonly content?: string
    readonly encoding?: string
  }

  if (encoding === 'base64' && content !== undefined && content !== '') {
    return { text: fromBase64(content), sha }
  }

  /*
   * Over a megabyte the JSON response carries no content, only the sha.
   * The raw media type returns the bytes themselves, up to 100 MB.
   */
  const raw = await send(fetchFn, urlOf(target), {
    headers: headers(target, 'application/vnd.github.raw+json'),
  })
  if (!raw.ok) throw failureFor(raw.status)
  return { text: await raw.text(), sha }
}

/**
 * Writes the file, naming the version it replaces.
 *
 * A `conflict` means the other device wrote in between this device's
 * read and its write; the caller reads again and re-merges rather than
 * overwriting what it never saw.
 */
export async function writeFile(
  target: GitHubTarget,
  text: string,
  sha: string | undefined,
  message: string,
  fetchFn: Fetch = fetch,
): Promise<WriteOutcome> {
  const response = await send(fetchFn, urlOf(target), {
    method: 'PUT',
    headers: {
      ...headers(target, 'application/vnd.github+json'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: toBase64(text),
      ...(sha === undefined ? {} : { sha }),
    }),
  })
  if (response.ok) return 'written'
  if (response.status === 409 || response.status === 422) return 'conflict'
  throw failureFor(response.status)
}
