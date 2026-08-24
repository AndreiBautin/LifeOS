# Security

## Threat model first

Most of a web security checklist does not apply here, and saying which
parts are _structurally absent_ is more useful than a list of items
marked N/A.

Lift is a static bundle. It has:

- **no server**, so no server-side vulnerability class exists;
- **no API and no runtime network requests**, so no CSRF, no server-side
  injection, no insecure CORS, no API authentication to get wrong;
- **no accounts, sessions, cookies or tokens**, so no credential
  handling, no session fixation, no password storage;
- **no database engine**, so no SQL injection;
- **no content shared between users**, because there is exactly one user
  and no channel between users;
- **no third-party services**, so no data reaches a vendor.

What remains is a much shorter list.

## What actually applies

### The trust boundary is the import file

Data enters this app from exactly one place the lifter does not fully
control: a backup file chosen from the filesystem. It may be truncated,
hand-edited, from a future version, or not a backup at all.

Everything is validated before a single record reaches the database
(`domain/backup/envelope.ts`): a magic marker, a schema version checked
against a ceiling, every section's presence and shape, and an integrity
checksum over the contents.

The validator deliberately reads the parsed JSON as
`Record<string, unknown>` rather than asserting it is already the
expected type. Declaring untrusted input to be the shape you hope for is
how a validator ends up "checking" conditions the compiler has decided
cannot fail — and the compiler will happily delete those checks from your
attention by flagging them as unnecessary.

An import shows a preview before writing anything, and the destructive
option requires typing a confirmation word.

### XSS

React escapes by default. The app contains no `dangerouslySetInnerHTML`,
no `eval`, and no dynamic script construction. Exercise names and notes
render as text.

### Personal data in logs

This is a health and fitness app; its data is personal. All logging goes
through one sink (`shared/logging/logger.ts`) whose field type is
`Record<string, string | number | boolean | null | undefined>` — event
names and scalars, never a set, a weight, a note, or a program name. An
ESLint rule forbids `console` everywhere else, so the guarantee cannot be
bypassed by accident rather than only by policy.

Error handling follows the same rule: the error boundary shows a
recoverable screen and no internals, and stack traces render only in
development.

### Dependency supply chain

`pnpm audit --audit-level high` runs on every push, weekly on a schedule,
and on demand. Gated at `high` deliberately — a personal app blocked by a
moderate advisory in a transitive build-time dependency teaches nothing,
and a gate people learn to ignore is not a gate.

Dependabot groups routine bumps into one weekly PR and keeps majors
separate so they get read rather than rubber-stamped.

### Secrets

There are none, and the repository has never contained one. `gitleaks`
scans the full history in CI to keep it that way.

Every environment variable is `VITE_`-prefixed, which in Vite means
_compiled into the public bundle_. `.env.example` says so explicitly, so
nobody later assumes the prefix hides anything.

## Deployment posture

GitHub Pages serves over HTTPS, which a service worker requires anyway.

Pages does not permit custom response headers, so a Content-Security-Policy
header is unavailable. A `<meta http-equiv>` CSP was considered and
**deliberately not added**: it cannot express `frame-ancestors`, it is
easy to write in a form that silently blocks the service worker, and a
directive that looks like protection while providing little is worse than
an acknowledged gap. The gap is small here because the app loads no
third-party code and makes no network requests.

## Remaining risks, stated plainly

- **Physical device access.** Anyone who can unlock the phone can read
  the training history. There is no app-level lock. For sets and reps
  that is a proportionate trade; if the data were medical it would not be.
- **A malicious backup file** could fill storage with junk. It cannot
  execute anything — the file is data, parsed by `JSON.parse`, every
  field validated — but a lifter importing a file from someone else
  should expect it to replace their programs, because that is what import
  does.
- **No CSP**, as above.
- **No integrity protection against a compromised host.** If GitHub Pages
  served a modified bundle, the service worker would cache it. This is
  true of every static site and is not separately mitigable here.
