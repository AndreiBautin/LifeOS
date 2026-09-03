---
name: ship
description: Finish a change in LifeOS by getting it onto the phone — verify, commit, push to main, watch the Pages deploy, and report the live URL and commit sha so the update banner can be trusted. Use at the end of any change to this repository that alters what the app does or shows, and whenever the user asks to ship, deploy, publish, push, or says they want to see something on their phone.
---

# Shipping a change in LifeOS

A change that is green on this machine has reached nobody. The app lives
on a phone, and the only route there is `main` → the Pages deploy → the
update banner. **Work is not finished until it is on that path**, which
is why this is a procedure rather than a preference.

## The standing authorization

The user has asked, once and for this repository, that finishing a
change includes pushing it. Do not ask again for an ordinary change.
That overrides the global default of committing only when asked — see
the _Shipping_ section of `CLAUDE.md`.

It is an authorization to **push finished work**, not to push anything.
Stop and ask when:

- `pnpm verify` is not green. A red gate is the one state that is never
  shippable, and pushing it burns the deploy and the phone at once.
- The change is half-built, or the user is still deciding.
- It would delete data, rewrite history, or force-push.
- It touches secrets, `firestore.rules`, or the allowlist.

## The steps

1. **`pnpm verify`.** Not `npx tsc --noEmit` — the root tsconfig is a
   solution file and that command can pass while the app is unchecked.
   The pre-push hook runs this again; running it first means finding a
   failure before writing a commit message about it.

2. **Drive the change if it is visible.** A screen change is claimed,
   not verified, until it has been looked at — `preview_start` on the
   `lift` config, then the browser tools. Seed what the screen needs and
   clean it up afterwards.

3. **Commit at a coherent milestone**, message saying _why_. If the pass
   answers a report, quote the report.

4. **Push to `main`.** The pre-push hook gates it and the deploy is
   gated on the same `pnpm verify` again. There is no third state.

5. **Watch the deploy to completion**:

   ```bash
   gh run watch --exit-status $(gh run list --workflow=Deploy --branch=main --limit=1 --json databaseId --jq '.[0].databaseId')
   ```

   The workflow ends with a smoke test that fetches the live URL and
   greps for the app shell and the manifest, so a green run means the
   site answered rather than that an upload succeeded.

6. **Report the sha and the URL.** <https://andreibautin.github.io/LifeOS/>
   and the first seven characters of the commit. Settings shows the sha
   of the running build, so those two numbers are how the user tells "it
   did not update" from "the deploy never happened".

7. **Leave the worktree clean**, and check rather than assume:

   ```bash
   git status --porcelain
   ```

   Empty output is the finished state. Anything printed is dealt with
   before the run is reported as done — see below.

## A clean worktree at the end of every round

Asked for directly: _"after every round, I'd like a clean worktree to
avoid spillover between runs."_ The cost of skipping it is not
theoretical — a stray file from one round is picked up by `git add -A` in
the next and lands in a commit whose message is about something else,
which is the hardest kind of change to find later.

**Check, then classify. Never blanket-delete.** `git add -A` and
`git checkout -- .` are both ways to lose work that was not yours to
throw away. Every line `git status --porcelain` prints is one of four
things, and each has a different answer:

| What it is                                                   | What to do                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Part of the change just made                                 | Stage it by name and include it in the commit                             |
| A scratch or temp file you created                           | Delete it — you made it, you know it is disposable                        |
| A generated agent-harness artifact (`AGENTS.md`, `.agents/`) | Already gitignored; if a new one appears, ignore it rather than commit it |
| Anything else, or anything you are unsure about              | **Leave it and say so.** It is the user's file until they say otherwise   |

**Stage by name, not with `-A`.** The whole point is that an unexpected
file is a question rather than a silent passenger, and `git add -A`
answers the question by committing it.

**Scratch files go in the scratchpad directory**, not in the repository.
A temp script written to the repo root is a file somebody has to
classify later; the same script in the session scratchpad never appears
in `git status` at all.

If something is left uncommitted deliberately, **name it in the report**
along with why. A worktree that is not clean is a fine outcome as long
as it is a stated one — what must not happen is the next round
discovering it.

## What the user does next, and what to say about it

Open the app, and the update banner appears — `UpdatePrompt` calls
`registration.update()` whenever the app becomes visible, so resuming it
is what triggers the check. Its button is a plain reload.

If no banner appears, Settings carries a manual **Check for updates**
that answers in words. "Already the newest" beside a sha that does not
match the one just deployed is the useful failure, and it means the
deploy, not the phone.

**Never tell the user a change is on their phone before the Deploy run
is green.** A push is not a deploy, and the gap is about three minutes.
