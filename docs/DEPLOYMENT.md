# Deployment

## Where, and why

**GitHub Pages.** The repository already lives on GitHub, the artifact is
a static bundle, and Pages authenticates with the workflow's own token —
so it adds **no new account and no new secret**. For a static SPA that
alone decides it.

Rejected, and on what grounds:

| Option           | Why not                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare Pages | Genuinely good, and free. Adds an account and a token for no capability this app uses — there is no server-side rendering, no edge function, nothing to run. |
| Netlify          | Same, plus a build-minutes quota to watch.                                                                                                                   |
| Vercel           | Same, and its free tier's commercial-use terms are a thing to keep re-checking.                                                                              |
| Fly.io / Render  | For long-running servers. There is no server.                                                                                                                |
| Neon / Supabase  | For a database. There is no database — that is the product.                                                                                                  |

## What gets deployed is the demo build

**`VITE_DEMO_MODE=true`, and deliberately no Firebase variables.** That
is the deployment decision, and it is worth stating before anything else
here because it changes what the published app _is_.

With the flag, the database name and every storage key move to a
`lifeos.demo` prefix and `seedDemoData` fills empty storage before the
first render. With no Firebase project there is no sign-in to offer and
no account gate to apply, so a reviewer clicking the link is inside a
populated app immediately. See [DEMO_DATA.md](DEMO_DATA.md).

The published build used to pass the Firebase config and
`VITE_ALLOWED_UIDS`, which put a sign-in screen and an account list in
front of the site. That was right while this was a personal app and is
wrong for a portfolio piece — a lock in front of the thing you are asking
somebody to look at.

**The trade, stated rather than buried: the deployed site does not
sync.** Personal use runs from a local build with `.env.local`, where
the Firebase variables live. The account gate still exists and still
works; it is simply not applied to what deploys.

`VITE_ALLOWED_UIDS` remains configured as a repository variable and is
now **inert** — nothing passes it. Removing the variable would change
nothing; it is left so that reinstating a gated build is one line in the
workflow.

## The two things that break a static SPA deploy

**Base path.** A GitHub project page serves from `/<repo>/`, not `/`. The
bundler needs that prefix for asset URLs and the router needs the same
prefix as its basename. Deriving both from one variable is the difference
between a working site and one where assets load and every route 404s.

```
VITE_BASE_PATH  ──►  vite.config.ts `base`
                └─►  import.meta.env.BASE_URL  ──►  router basename
```

Set once, in the deploy workflow, as `/${{ github.event.repository.name }}/`.

**SPA fallback.** A static host 404s on a client-side route requested
cold. The deploy copies `index.html` to `404.html`, which Pages serves
for any unmatched path — turning a deep link into a working page. The
status code remains 404, which is honest and invisible to a user.

## Pipeline

```
push to main
   │
   ├── ci.yml       typecheck · lint · format · test · build
   │                build again with VITE_DEMO_MODE · icons match generator
   │                audit · secret scan (full history)
   │
   └── deploy.yml
         verify  ──►  build  ──►  deploy  ──►  smoke test
        (pnpm verify)                          (fetch the live URL,
         gates everything                       assert the shell and
         downstream)                            the manifest are there)
```

The deploy runs `pnpm verify` as a job the build **depends on**. Chaining
workflows would save the duplicated minutes; running the same one-command
verification inline means the deploy reads top to bottom, and duplicated
CI minutes are cheap next to a pipeline that can publish a commit which
failed its own tests.

**CI builds both configurations that ship.** The demo build takes a
different branch at startup — a different storage namespace, and a seeder
that runs before the first render — and it is the one that is actually
deployed. A failure that only appears under it must not first surface at
deploy time.

The smoke test is the step most often skipped. A green deploy means an
upload succeeded; a green smoke test means the site answered — and it
retries, because Pages propagation is not instant.

## First-time setup

1. Push to GitHub.
2. **Settings → Pages → Source → GitHub Actions.** (Not "Deploy from a
   branch".) This is the one manual step; the workflow cannot enable it.
3. Push to `main`. The site appears at
   `https://<user>.github.io/<repo>/`.

### Branch protection, with the caveats that are usually got wrong

Worth configuring, but two things are widely misunderstood:

- **A public repo does not let strangers push.** Only collaborators can.
  Branch protection mostly protects the maintainer from themselves.
- **Nobody can approve their own pull request.** Requiring one approving
  review on a single-maintainer repository deadlocks every PR you open,
  however much "require approval" sounds correct.

A configuration that protects without deadlocking:

- Require the **CI** status checks — and _only_ those. Requiring a deploy
  job deadlocks every PR, because deploy workflows do not run on PRs.
- **No required reviews**, for the reason above.
- **Admins not enforced**, so there is a direct-push escape hatch; the
  local pre-push hook still guards it.
- **Force-push and deletion blocked** — the genuine protection.

## Environment variables

All of them are `VITE_`-prefixed, which in Vite means **compiled into the
public bundle**. None is a secret and none ever should be.

| Variable            | Local (`.env.local`) | Deployed                      |
| ------------------- | -------------------- | ----------------------------- |
| `VITE_BASE_PATH`    | `/`                  | `/<repo>/`                    |
| `VITE_LOG_LEVEL`    | `debug`              | `warn`                        |
| `VITE_APP_VERSION`  | unset                | the tag or branch             |
| `VITE_COMMIT_SHA`   | unset                | the commit, shown in Settings |
| `VITE_DEMO_MODE`    | `false`              | **`true`**                    |
| `VITE_FIREBASE_*`   | set, for sync        | **unset**                     |
| `VITE_ALLOWED_UIDS` | optional             | **unset** (inert)             |

**A Firebase web config belongs in a public variable and a database URL
with a password in it does not** — the test is whether the value
_authorises_ anything, not whether it is called a key. A web `apiKey`
identifies a project and grants nothing; access is decided entirely by
`firestore.rules`. Hiding it as a secret would imply a confidentiality it
does not have and make a failed deploy harder to diagnose.

**Absent is a supported state, not a broken one.** A fork with none of
these configured builds an app that stores locally and says so on its
Settings screen. That is why they are not defaulted to this project's
values: somebody else's fork must not write into it.

## Troubleshooting

| Symptom                               | Cause                                | Fix                                                                           |
| ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Blank page, 404s on `/assets/*`       | `VITE_BASE_PATH` missing or wrong    | It must be `/<repo>/`, with both slashes                                      |
| Home page works, `/programs` 404s     | No SPA fallback                      | The deploy's `cp dist/index.html dist/404.html` step                          |
| Deploy job fails with "not enabled"   | Pages source still set to a branch   | Settings → Pages → Source → GitHub Actions                                    |
| Service worker never updates          | Cached `sw.js`                       | It is served no-cache by default; check the Application tab, then hard-reload |
| App shows an old version after deploy | The update prompt is waiting         | By design — press Reload in the banner                                        |
| Every PR is stuck awaiting review     | Required reviews on a solo repo      | Remove the requirement; see above                                             |
| Deployed app is empty                 | Storage already has something in it  | Seeding refuses rather than overwriting. Delete the `lifeos.demo` database    |
| Deployed app asks you to sign in      | Firebase variables reached the build | The deploy must pass none of them; check the `Build` step's `env`             |
| Sync works locally, not on the site   | By design                            | The published build is the demo build. See above                              |

## Free-tier limits

Pages allows 1 GB stored and 100 GB of bandwidth a month, with a soft
limit of ten builds an hour. This app builds to roughly 500 KB
precached — three orders of magnitude of headroom on storage, and the
service worker means a returning user fetches almost nothing.

## What is not deployed

**Nothing personal, and that is structural rather than careful.** The
fixture is generated code in this repository; there is no export step
from a personal device anywhere in the pipeline, so there is no path by
which real records could reach the published bundle. A test scans the
fixture's own source for emails, phone numbers, credential shapes and
links out.

**No Firestore project**, so the deployed app cannot read or write
anything in one. Personal records are unreachable from it by
construction rather than by permission.

**No secrets**, because there are none to deploy. Every variable this app
reads is `VITE_`-prefixed and therefore compiled into a public bundle,
and each one either identifies something or configures something.
