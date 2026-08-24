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
   ├── ci.yml       typecheck · lint · format · test · build · icons match generator
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

| Variable           | Local   | Deployed                      |
| ------------------ | ------- | ----------------------------- |
| `VITE_BASE_PATH`   | `/`     | `/<repo>/`                    |
| `VITE_LOG_LEVEL`   | `debug` | `warn`                        |
| `VITE_APP_VERSION` | unset   | the tag or branch             |
| `VITE_COMMIT_SHA`  | unset   | the commit, shown in Settings |
| `VITE_DEMO_MODE`   | `false` | `false`                       |

## Troubleshooting

| Symptom                               | Cause                              | Fix                                                                           |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Blank page, 404s on `/assets/*`       | `VITE_BASE_PATH` missing or wrong  | It must be `/<repo>/`, with both slashes                                      |
| Home page works, `/programs` 404s     | No SPA fallback                    | The deploy's `cp dist/index.html dist/404.html` step                          |
| Deploy job fails with "not enabled"   | Pages source still set to a branch | Settings → Pages → Source → GitHub Actions                                    |
| Service worker never updates          | Cached `sw.js`                     | It is served no-cache by default; check the Application tab, then hard-reload |
| App shows an old version after deploy | The update prompt is waiting       | By design — press Reload in the banner                                        |
| Every PR is stuck awaiting review     | Required reviews on a solo repo    | Remove the requirement; see above                                             |

## Free-tier limits

Pages allows 1 GB stored and 100 GB of bandwidth a month, with a soft
limit of ten builds an hour. This app builds to roughly 500 KB
precached — three orders of magnitude of headroom on storage, and the
service worker means a returning user fetches almost nothing.

## What is not deployed

**No demo data.** The deployed app opens empty, exactly as it does on a
fresh install, because there is no server and therefore no shared
instance where one visitor could see another's data. `VITE_DEMO_MODE`
exists and namespaces storage separately if a seeded demo is ever wanted,
but shipping fabricated training history as though it were real is worse
than an honest empty state — and the empty state here is not blank: six
built-in programs and sixty-six exercises are there on first open.
