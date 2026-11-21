# Releasing Meteor Pilot

Owned by the Release Engineer. Tools live in `tools/release/`.

## For the owner (plain English)

- **What a release is:** the game is made and tested as a claude.ai artifact. A release copies that game into this GitHub repo, and GitHub Pages then serves it at **jimsky90.github.io/meteor-pilot** a few minutes later. Installed apps pick it up the next time they're opened online.
- **It's now one command.** The daily task runs `release.py`. It checks the game file, runs the full test suite, records what changed, saves it to GitHub and then checks that GitHub really has it. If anything is wrong it stops before anything goes live, and says why in plain words.
- **A bad version can be undone in one command** (`rollback.py`). That puts the previous version back on the live app within minutes, and phones switch to it too.
- **If the daily message says "the live app wasn't updated":** the game link still has the new version. Only the installable app is behind. Say "push" (or "release") in a chat with the repo attached and it gets released from there. Nothing is lost.

## The one command

```
python3 tools/release/release.py <artifact.html> --summary "error guard and sharper phones" --audit "F1 (error guard), F2 (pixel cap)"
```

`<artifact.html>` is the published game page as saved by the Artifact tool's `read` action. The viewer wrapper can stay in; the sync script strips it.

What it does, in order (it stops at the first problem):

| Step | Detail |
|---|---|
| 1. Checkout | The checkout must be a git repo with an `origin` remote and no uncommitted edits to `index.html`, `sw.js` or `docs/AUDIT-PROGRESS.md`. It then runs `git pull --rebase --autostash origin main`. A detached HEAD is OK. |
| 2. Validate | The file must be over 100 KB and have `<title>`, `const CHANGELOG = [`, `window.CR`, and a `</script>` at the end (so a cut-off read is caught). Its newest CHANGELOG entry must parse, match the first `{ v: N,` in the page, and be newer than the repo's version. A repo `index.html` passed by mistake (it has GAME markers) is refused. |
| 3. Sync | Runs `tools/sync_from_artifact.py`, then checks that `index.html` and `sw.js` both say vNN. |
| 4. Test | Runs `python3 tools/test/run_all.py` (about 2–3 min). Any FAIL stops the release. |
| 5. Audit | Adds `- **vNN** (date): ...` to `docs/AUDIT-PROGRESS.md` for each new version that isn't already listed. The newest line uses `--audit` if given; otherwise it uses the CHANGELOG notes. Ranges such as `v38–v43` count as listed. |
| 6. Commit | Commits as Claude: `Update game to vNN: <summary>`, with the notes as bullets and the Co-Authored-By / Claude-Session lines. |
| 7. Push | Runs `git pull --rebase`, then `git push origin HEAD:main`. After a non-fast-forward it retries once by itself. Then it runs `git fetch` and checks that origin/main is our commit. |
| 8. Report | Prints a plain summary and writes `tools/release/last-release.json` (git-ignored). |

Options:

- `--dry-run` does all of the above in a temporary clone. It only runs `git push --dry-run`, so nothing reaches GitHub. Use it to rehearse.
- `--skip-browser` is for **emergencies only**. It runs `run_all.py --quick` (no browser tests). The skip is printed, written into the commit message ("EMERGENCY RELEASE") and saved in `last-release.json`.
- `--summary` sets the commit title words. The default is the start of the first CHANGELOG note; a hand-written summary reads better.
- `--audit` sets what the version finished, with its source (e.g. `F1, M2, Art 6`). The default is the CHANGELOG notes.

Exit codes: **0** means released (or the dry run was OK). **1** means it stopped before pushing, so the live app is unchanged. **2** means it committed locally but the push failed, so the app is NOT live (see below).

**After a release that skipped steps by hand**, check that the artifact and the repo match. Rehearse with the latest artifact copy: `release.py <file> --dry-run`. It says "Nothing new to release" when they're the same version. Syncing the v53 artifact on 2026-11-20 gave a byte-identical `index.html`.

## Rolling back

```
python3 tools/release/rollback.py --list          # versions in git history
python3 tools/release/rollback.py --dry-run       # rehearse going back one version
python3 tools/release/rollback.py v52 --reason "boss freezes on iPhone"
```

The rollback script:

1. Finds the last commit that shipped that version.
2. Restores `index.html` and `sw.js` from that commit.
3. Moves the `sw.js` cache name **forward**, to `meteor-pilot-v52-rbYYYYMMDDHHMM`, so installed phones see a change and switch.
4. Runs the quick tests.
5. Commits `Roll back live game to v52`, pushes and verifies.

Things to know:

- **The static test WARNs "could not read one of the versions" after a rollback.** That's expected: the cache name has a suffix. The next normal release sets it back to `meteor-pilot-vNN`.
- **The artifact still has the bad version.** The next daily run builds on it, so the bug must be fixed in the artifact, or that run ships it again. Tell the daily task (or the owner) what was rolled back and why.
- **Growth check after a rollback:** the next release's "growth this round" is measured against the rolled-back file. Rolling back one version is fine. Rolling back several versions can make the next release look like 20+ KB of growth, which is a FAIL. If that happens, the Technical Director decides whether the next release may use `--skip-browser` or whether the check gets a rollback exception.
- Versions that were never committed on their own (for example v48–v51, which went out together as v52) can't be picked; `--list` shows what can.

## When a push fails

`release.py` and `rollback.py` print the **exact git error** and a diagnosis. For the full picture, run:

```
python3 tools/release/diagnose_push.py
```

It checks:

- the checkout, branch and remote URL
- `git config --get-regexp 'credential|url|http'`
- the proxy and its certificate, the token variables, and the credential helper
- read access (`git ls-remote`) and write access (`git push --dry-run`, which makes GitHub check the login for a push)
- ahead/behind
- the commit identity and commit signing (a throwaway signed object)

It changes nothing.

| Diagnosis | What it means | Fix |
|---|---|---|
| proxy refusal (403/407 "from proxy after CONNECT", `[agent-proxy]` lines) | The cloud session's network proxy won't let us reach github.com. | Call `add_repo` (owner `jimsky90`, repo `meteor-pilot`, access `push`) and retry once. If it still fails, the environment's network settings must allow github.com. Never route around the proxy. |
| auth 403 (`Permission ... denied`) | Logged in, but not allowed to write. | Call `add_repo` with access `push` and retry once. If it still fails, the owner reconnects GitHub in claude.ai Settings → Connectors and checks that the Claude GitHub App is installed on the repo. |
| auth 401 / no credentials (`could not read Username`, `terminal prompts disabled`) | Git had no login. In cloud sessions the proxy adds it only for repos attached to the session. | `add_repo` with access `push`. On a computer: `gh auth login && gh auth setup-git`. |
| non-fast-forward (`[rejected] ... fetch first`) | Someone pushed first, often a chat session pushing the same version. | The script retries once after `git pull --rebase`. If it still fails, check `git log origin/main -3`. |
| missing remote | No `origin`. | `git remote add origin https://github.com/jimsky90/meteor-pilot` |
| detached HEAD | Not on a branch. | `git switch -C main`. Pushes use `HEAD:main` anyway. |
| commit signing failed | `commit.gpgsign` is on, but the signing program is missing. | Check `git config --get-regexp 'gpg|sign'`. |
| network / transfer cut | Timeout, reset or RPC failed. | Wait a minute and retry once. See `/root/.ccr/README.md`. |

If the push still fails after one retry, **finish the round anyway** and tell the owner plainly that the live app wasn't updated, quoting the exact error. The next round's catch-up check (the CHANGELOG version is newer than `sw.js`) releases it.

### What a working cloud session looks like (measured 2026-11-20)

```
OK   remote 'origin': https://github.com/jimsky90/meteor-pilot
INFO git config: http.proxyauthmethod basic | credential.interactive false |
     url.https://github.com/.insteadof git@github.com: | url.https://github.com/.insteadof ssh://git@github.com/
OK   HTTPS proxy: http://127.0.0.1:<port>   (HTTPS_PROXY / https_proxy)
OK   proxy certificate: GIT_SSL_CAINFO=/root/.ccr/ca-bundle.crt
OK   credential helper: none, which is normal: GH_TOKEN / GITHUB_TOKEN = "proxy-injected"
OK   read (git ls-remote) and write (git push --dry-run) both succeed
OK   commit identity Claude <noreply@anthropic.com>; commit signing on via /tmp/code-sign, test signature works
```

In other words, a working session has **no credential helper and no token in git**. The session's proxy adds the GitHub login, and only for repos attached to the session with push access. A session where `git push --dry-run` fails with 401/403 or a proxy refusal was not given the repo with push access.

## Size

```
python3 tools/release/size_report.py [--window 10] [--json]
```

This prints the `index.html` size per version from git history, the growth per version, a straight-line trend and an average, and the version and date at which the 600 KB warning and the 700 KB limit (`tools/test/budgets.json`) are reached. The window is the last 10 committed versions by default.

On 2026-11-20 (v53, 442.1 KB) the report showed:

- **Trend (v28–v53):** +8.6 KB a version (line fit), +7.8 KB on average, about 2.5 versions a day.
- **600 KB warning:** around v72–v74, late November.
- **700 KB limit:** around v84–v86, early December.

The recent rounds (v52 → v53, +5.2 KB) are inside the 6 KB budget. The longer window still includes the big story rounds, so the trim plan in TECH-DIRECTION section 5 is needed to reach v100.
