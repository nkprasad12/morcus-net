# Upstream data repos

Morcus builds its dictionaries and library from 11 ancillary repos (`lexica`, `smithandhall`, `canonical-latinlit`, ...). Most are our forks of other projects. [`upstream_sources.lock.json`](../../../upstream_sources.lock.json) pins each one to a commit:

- **Prod and CI** build exactly the pinned commits, so the same morcus-net commit always builds the same data, and a data change is its own reviewable, revertable commit.
- **Local builds** (`./morcus.sh build` / `web`) use whatever is checked out at each source's env var (`LS_PATH`, `SH_RAW_PATH`, ...), so local commits in a data repo just work. Builds warn when that differs from the pins.

Staying close to the original upstream projects is **not** a goal. Forks being behind upstream is fine.

## The three rules

1. **Start each fix branch at the current pin.** Pinning a commit ships its whole history, so this makes your fix the only new data.
2. **Change pins only with `./morcus.sh upstream pin`.** It checks the commit is pushed, tags it, and refuses pins that would drop data.
3. **Never delete `morcus-pin/*` tags.** They keep pinned commits reachable after their branches are deleted, force-pushed, or squash-merged upstream, so old morcus-net commits stay buildable.

## Commands

| Command                                        | What it does                                                                                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./morcus.sh upstream status`                  | One line per clone: at pin / ahead / behind / uncommitted changes / custom path. Offline.                                                                                                                         |
| `./morcus.sh upstream sync [source...]`        | Fetches missing pins and moves clones to them, leaving local work alone (see below). `set_up_or_update.sh` runs it.                                                                                               |
| `./morcus.sh upstream pin <source>[@<ref>]...` | Re-pins. `<ref>` is a branch, tag or SHA in your clone (default: the source's tracked `branch` on the remote). Add `--dry-run` to check without changing anything, `--allow-drop` and `--yes` to override checks. |
| `./morcus.sh upstream tag [source...]`         | Pushes any missing `morcus-pin/<sha>` tags for the current pins.                                                                                                                                                  |
| `./morcus.sh upstream verify`                  | Checks every pin is tagged on its repo. CI runs this before the Docker build.                                                                                                                                     |

## What `pin` checks

Nothing changes unless every source passes. For each one, the new commit must:

- **Be on the source's repo**, on a branch or a `morcus-pin` tag. A commit that's only in your clone can't be fetched by CI.
- **Still have everything the current pin had.** If the new commit builds on the current pin, this passes. Otherwise the check asks: would merging the current pin into the new one change anything? That passes when upstream squash- or rebase-merged our commits, since the changes are there under new SHAs. It fails, and shows what would be lost, when the new commit lacks a fix the current pin has: a different branch, or a fix upstream rejected or rewrote. Override with `--allow-drop` once you've looked.
  - What it can't catch: if the new commit builds on the current pin, later commits that change or revert a fix (e.g. upstream merged your PR with a merge commit, then reverted it) count as intended edits. Those show up only in the summary below, so read it.
- **Not bring in a surprising amount.** It prints the added (`+`) and replaced (`-`) commits and a diffstat, and asks before pinning more than 5 new commits, which usually means the fix branch started somewhere other than the current pin.

Then it pushes a `morcus-pin/<sha>` tag, rewrites the lock file, and prints a suggested commit message for the lock bump.

## What `sync` will and won't move

`sync` owns one local branch per clone, `morcus-pinned`, and moves it to the pin only when nothing local could be lost:

- The clone is on `morcus-pinned`, the tracked branch, the remote's default branch, or a detached HEAD. Any other branch is your work and is left alone.
- It has no uncommitted changes to tracked files.
- None of its commits exist only locally (every commit is on a remote branch or tag).
- It's the default clone at `../<source>`, not a custom path from `.env`.

Anything else is reported and left as is.

## Workflows

### Fixing data

```bash
cd ../smithandhall
git checkout -b fix-typo morcus-pinned   # rule 1: start at the pin
# edit, commit; ./morcus.sh build in morcus-net picks it up
git push -u origin fix-typo              # and open the upstream PR, if any
cd ../morcus-net
./morcus.sh upstream pin smithandhall@fix-typo
git commit -am "Pin smithandhall to <sha>"   # with the change that needs it
```

Once the lock bump lands, `git checkout morcus-pinned` in the clone (or stay on `fix-typo`). If upstream asks you to rebase or amend the PR, the old pin stays valid because of its tag. Re-pin if prod should match the new version.

### Two fixes in flight in one repo

You can only pin one commit, so pin a merge of both. Start both branches at the pin, so each upstream PR stays independent:

```bash
git checkout -b morcus-combined fix-a
git merge fix-b
git push -u origin morcus-combined
./morcus.sh upstream pin smithandhall@morcus-combined   # from morcus-net
```

The combined branch is disposable. When one fix lands upstream, rebuild it rather than merging the old one forward:

```bash
git checkout -B morcus-combined origin/main
git merge fix-b
git push --force-with-lease origin morcus-combined   # it was pushed before
```

The tag on the old pin keeps it reachable, so the force-push is safe. Any other clone with its own local `morcus-combined` will now have diverged from `origin/morcus-combined`, and `pin` refuses to guess between them. Reset it there (`git checkout -B morcus-combined origin/morcus-combined`), or pin the SHA.

### After upstream merges your fix

Sync your fork's `main` with upstream if you want, then `./morcus.sh upstream pin <source>@main`. That works however upstream merged:

- a merge commit keeps your SHA in history;
- a squash or rebase merge brings the same changes under new SHAs, which the content check accepts.

If upstream rejected or rewrote your fix, the check stops and shows the difference. To keep your version, pin a merge of `main` and your fix branch.

If an upstream PR conflicts, **merge** upstream `main` into the PR branch rather than rebasing. Keep the pin on your original fix commit, not on that merge, which would ship upstream's other changes too.

### Someone else bumped a pin

Run `./morcus.sh upstream sync`. It fetches the new pin and moves `morcus-pinned` to it, unless you have work in that clone.
