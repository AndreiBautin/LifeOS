# Where your data lives, and what can destroy it

LiftOS has no server. Everything — training history, exercises,
settings — is stored in your browser, on the device you are using. That
is a deliberate product decision, not a limitation waiting to be fixed:
the app works on a gym basement's dead Wi-Fi, needs no account, and
sends nothing anywhere unless you turn on sync with a GitHub token of
your own.

It also means the durability of your training history is a property of a
browser's storage rules rather than of a database somebody else operates.
This document is the honest account of what those rules are.

## The short version

**Export regularly.** Everything else on this page is detail.

Clearing browser data destroys the app's data, and in most browsers the
control labelled "cookies" is really "cookies and other site data" — so
yes, clearing cookies usually does destroy it. Nothing transfers to a new
phone or a different browser on its own. A backup file — or the copy
sync keeps in your own GitHub repository — is the only thing that
survives all of it, and Settings says how old your last export is.

---

## What is stored where

| Store             | Holds                                                     | Why there                                                                                                            |
| ----------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **IndexedDB**     | Exercises, workout history, check-ins, tombstones         | Unbounded, indexed, asynchronous. See below.                                                                         |
| **localStorage**  | Units, rounding, bodyweight, estimated maxes, preferences | Small, read synchronously at startup, and — crucially — a _separate_ store, so a rebuilt IndexedDB does not take it. |
| **Cache Storage** | The app's own HTML, JavaScript, CSS and icons             | Managed by the service worker. Versioned and swept on update. Contains nothing of yours.                             |

### Why IndexedDB and not localStorage

Both source repositories reached for `localStorage` whenever they wanted
something local. For a training log that is the wrong tool:

- **Volume.** Roughly one record per set means a few thousand rows in the
  first year and tens of thousands after that. localStorage is a
  synchronous, main-thread string store with a ~5 MB ceiling, so logging
  a single set would mean re-serialising the entire history and blocking
  the UI to do it.
- **Queries.** "What did I lift on this exercise last time" and "how has
  my estimated max moved" are the two questions the app leans on hardest.
  In IndexedDB they are index range scans. StrengthFlow answered the
  first by downloading every workout document and scanning it in
  JavaScript — on every set.
- **Fidelity.** Structured clone stores dates and numbers as they are,
  with no JSON round-trip.
- **Headroom.** Quota is a share of free disk — typically hundreds of
  megabytes to gigabytes — rather than five megabytes.

Settings stay in localStorage on purpose. Losing your history is bad;
losing your history _and_ every number needed to resume training is
worse, and keeping them in different stores means one failure does not
cause both.

---

## What happens when…

### You install the app to your home screen

**Your data is preserved**, and installing generally _improves_ its
durability.

- **Android / Chrome.** The installed app shares the browser profile's
  storage for this origin. It is the same data, not a separate sandbox.
  Installing usually earns persistent storage automatically (see below).
- **iOS 16.4 and later.** A Home Screen web app gets storage **separate
  from Safari**. That is genuinely self-contained — but it cuts both
  ways: anything you logged in Safari before installing will not appear
  in the installed app. Install first, then start logging.

### You close and reopen the app

Nothing. Your data persists. An unfinished session resumes exactly where
you left it, including the sets already logged.

### You restart your phone

Nothing. Your data persists.

### You clear cookies

⚠️ **This usually destroys everything.**

This is the answer you probably came here for, and it is not the
comfortable one. Cookies and IndexedDB are different mechanisms, but no
mainstream browser gives you a control that clears only cookies:

| Browser       | The control                        | Clears IndexedDB? |
| ------------- | ---------------------------------- | ----------------- |
| Chrome / Edge | "Cookies and other site data"      | **Yes**           |
| Safari        | "Remove All Website Data"          | **Yes**           |
| Firefox       | "Cookies and Site Data"            | **Yes**           |
| DevTools      | Application → Cookies → clear only | No                |

Only a narrow HTTP-cookies-only tool spares it. Treat "clear cookies" as
"delete my training history", because in practice that is what it does.

### You clear site data

⚠️ **Destroys everything for this origin** — IndexedDB, Cache Storage,
localStorage, and the service worker.

### You uninstall and reinstall the app

⚠️ **Assume the data is gone.**

- **iOS.** Deleting the Home Screen app deletes its storage. Reinstalling
  gives you an empty app.
- **Android.** Uninstalling typically offers to clear data, and typically
  does.

### You switch browsers

**Data does not transfer.** Storage is per-origin _per browser profile_.
Chrome and Firefox on the same phone see entirely different databases.

### You get a new phone

**Data does not transfer on its own.** There is no account and no
server of ours. Either export from the old device and import on the new
one, or turn on sync on both: it reads, merges and writes one backup file
in a private GitHub repository you own (`src/infrastructure/sync/`).

### The browser performs storage cleanup

This is the one the app can actually defend against.

Browser storage is "best-effort" by default: under disk pressure the
browser evicts least-recently-used origins. Calling
[`navigator.storage.persist()`](https://developer.mozilla.org/docs/Web/API/StorageManager/persist)
promotes the origin to **persistent**, which exempts it from that
automatic eviction. LiftOS requests it at every startup
(`src/infrastructure/storage/durability.ts`).

| Browser  | Behaviour                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------ |
| Chromium | Granted silently for an installed PWA, or a site with high engagement                            |
| Firefox  | Prompts the user                                                                                 |
| Safari   | No equivalent API, but an installed Home Screen app is exempt from its 7-day inactivity eviction |

Settings → Your data shows what was actually granted rather than assuming
it worked.

**Persistence protects against silent loss. It does nothing about
deliberate deletion.** Both are stated plainly in the app.

### The app is updated

**Your data is untouched.** IndexedDB is versioned and migrated by
explicit, numbered upgrade steps — a deploy never wipes it. Only Cache
Storage is versioned and swept, and that holds nothing but the app's own
files.

A new version applies itself when the app becomes visible and no session
is open, and otherwise waits behind a banner — it never swaps the app out
from under you three sets into a session.

---

## Backup and restore

Because local-only storage has the limits above, export is a **core
feature**, not a settings-page afterthought.

### The file

Plain JSON, two-space indented, readable in any text editor. It carries a
schema version, the app version, an export timestamp, record counts, and
an integrity checksum over the contents.

```json
{
  "magic": "lifeos.backup",
  "schemaVersion": 3,
  "appVersion": "1.0.0",
  "exportedAt": "2026-08-24T12:00:00.000Z",
  "checksum": "a3f21c08",
  "counts": { "exercises": 4, "workouts": 142, "checkIns": 0, ... },
  "data": { "settings": {...}, "exercises": [...], "workouts": [...], "tombstones": [...] }
}
```

The sections are settings, exercises, workouts, check-ins and tombstones
(`src/domain/backup/envelope.ts`). An export is saved as
`liftos-backup-….json`. **A file written while the app also held a
Codex, a map, a tech tree, a monthly review and the rest still imports**:
the training in it is restored and the extra sections are ignored,
because refusing them would make every backup taken before the app
narrowed useless at the moment somebody reaches for one.

Ids are stable, human-readable slugs where possible (`bench-press`, not a
UUID), so the file stays legible and a program written on one device
references the same exercise on another.

### The checksum

Not a security measure — nobody is attacking a file you exported to your
own phone. It defends against a **truncated or partially written** file:
an interrupted download, a sync that copied half of it, a disk that
filled mid-write. Such a file parses as valid JSON right up to the point
it stops, and importing it would quietly restore three years of training
with the last six months missing.

FNV-1a is used deliberately over a cryptographic hash: it is a few lines,
needs no async Web Crypto call, and detects truncation reliably. SHA-256
here would imply a property this does not have.

### Importing

The file is validated before a single record is written, and a preview
shows what it holds — "142 workouts, 3 programs, March 2024 to August
2026" — so you can recognise whether you picked the right file.

Then two named operations, never one function with a flag:

- **Merge** writes every record by id. Anything in both is overwritten by
  the file's version; anything only on the device survives. Settings are
  _not_ adopted — merging someone else's estimated maxes into a live setup
  would silently rewrite every percentage the program prescribes.
- **Replace** clears everything first and requires typing `replace` to
  confirm.

### How old the last backup is

Settings states it beside the export button: how many days since the
last export, tinted once that is past **14 days** (`backupAge` in
`domain/settings/settings.ts`), and the sentences around it read whether
sync is on rather than assuming it is not. There used to be a reminder
card over every screen; it came back on each launch however often it was
answered, and it could not tell whether sync already had the data
covered — a warning that cannot check its own premise is worse than
none.

### What is deliberately not here

- **A cloud database.** It would mean an account, a server of ours, and
  your training data on someone else's disk. It was tried: optional
  Firebase sync shipped for a while and was removed, because a second
  copy kept in step with this one is worse than either a real cloud
  database or none. What replaced it is a file — one backup in a private
  GitHub repository the lifter owns, merged by newer `updatedAt` with
  tombstones travelling both ways.
- **Automatic scheduled backups.** A browser cannot write to your
  filesystem unprompted, and a backup silently held in the same origin's
  storage would die with everything else it was meant to protect.
- **Encryption of the backup file.** It contains sets and reps. Adding a
  password would mean a password that can be lost, protecting data that
  is not sensitive, and it would make the file unreadable by the text
  editor that is its main fallback.

That is **user-supplied storage**, which was always the right shape for
cross-device here — not a backend.

---

## Schema migrations

`DB_VERSION` in `src/infrastructure/db/database.ts` is bumped and a new
guarded step is added:

```ts
if (oldVersion < 2) {
  /* ... */
}
```

Existing steps are **never edited**. A device that has already run one
will not run it again, so changing a step leaves two devices with
different schemas and no way to tell them apart. Every migration hop is
covered by a test.

**A retired store is cleared, never removed.** When the app narrowed to
training, the Codex, map, tech tree, Base, buffs, finance, challenges and
arc stores were emptied by a new step at `DB_VERSION` 24 and left in the
schema; the monthly review's `metrics` and `reviews` stores followed at
`DB_VERSION` 25, when the game went. Removing a store means editing the step that created it, which is
the one thing above that must never happen; clearing it in a new step
reaches every device exactly once.

## Addresses that still say lifeos

The app is called LiftOS, and its storage still says `lifeos`: the
IndexedDB database `lifeos`, the `localStorage` prefix `lifeos` (or
`lifeos.demo` in the demo build), the `lifeos.backup` magic string at
the top of every backup, and the `lifeos-sync.json` file sync keeps in
GitHub. **Those are addresses, not labels.** Renaming one opens a fresh,
empty store beside the old rather than migrating anything, so a rename
of the product left them alone on purpose. Only the exported file's
_name_ changed, to `liftos-backup-….json`, because nothing reads it
back by name.
