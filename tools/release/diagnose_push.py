#!/usr/bin/env python3
"""Check everything that can stop `git push` to jimsky90/meteor-pilot, and say what's wrong in plain words.

    python3 tools/release/diagnose_push.py [--json]

Safe to run any time: it changes nothing on GitHub (the push is `--dry-run`) and nothing in the checkout.
Exit code 0 if a push should work, 1 if something will stop it.
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, REMOTE_URL, BRANCH, git, mask, diagnose, on_branch

rows = []


def report(status, name, detail, fix=""):
    rows.append({"status": status, "check": name, "detail": detail, "fix": fix})


def main():
    as_json = "--json" in sys.argv

    # 1. checkout
    rc, out, err = git(["rev-parse", "--show-toplevel"])
    if rc != 0:
        report("PROBLEM", "git checkout", f"{ROOT} is not a git checkout", f"git clone {REMOTE_URL} /home/claude/meteor-pilot")
        return finish(as_json)
    report("OK", "git checkout", f"{out.strip()} ({git(['--version'])[1].strip()})")
    br = on_branch()
    if br:
        report("OK", "branch", f"on '{br}'")
    else:
        report("WARN", "branch", "detached HEAD", "pushes still work with `git push origin HEAD:main`; `git switch -C main` makes pulls simpler")
    rc, out, _ = git(["status", "--porcelain"])
    if os.path.isdir(os.path.join(ROOT, ".git", "rebase-merge")) or os.path.isdir(os.path.join(ROOT, ".git", "rebase-apply")):
        report("PROBLEM", "rebase in progress", "a git rebase was left half-done", "`git rebase --abort` (or finish it) before releasing")

    # 2. remote
    rc, url, _ = git(["remote", "get-url", "--push", "origin"])
    url = url.strip()
    if rc != 0:
        report("PROBLEM", "remote 'origin'", "missing", f"git remote add origin {REMOTE_URL}")
    else:
        shown = mask(url)
        if shown != url:
            report("WARN", "remote 'origin'", f"{shown} has a login token written into the URL", f"git remote set-url origin {REMOTE_URL} (tokens in URLs leak into logs)")
        elif re.search(r"github\.com[:/]jimsky90/meteor-pilot(\.git)?/?$", url):
            report("OK", "remote 'origin'", url)
        else:
            report("PROBLEM", "remote 'origin'", f"points at {url}", f"git remote set-url origin {REMOTE_URL}")
        if url.startswith(("git@", "ssh://")):
            rewrites = git(["config", "--get-regexp", r"url\..*\.insteadof"])[1]
            if "github.com" in rewrites:
                report("OK", "SSH remote", "an SSH URL, but git rewrites it to https (url.*.insteadOf)")
            else:
                report("PROBLEM", "SSH remote", "SSH URL and no SSH rewrite; cloud sessions have no SSH key", f"git remote set-url origin {REMOTE_URL}")

    # 3. git config that affects logins
    rc, cfg, _ = git(["config", "--show-origin", "--get-regexp", r"credential|^url\.|^http\."])
    cfg_lines = [mask(l) for l in cfg.strip().splitlines()]
    helpers = [l for l in cfg_lines if "credential.helper" in l or re.search(r"credential\..*\.helper", l)]
    report("INFO", "git config (credential|url|http)", " | ".join(cfg_lines) or "(none)")

    # 4. environment: proxy, CA, tokens
    https_proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or ""
    no_proxy = os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or ""
    tok = [k for k in ("GH_TOKEN", "GITHUB_TOKEN") if os.environ.get(k)]
    injected = [k for k in tok if os.environ.get(k) == "proxy-injected"]
    if https_proxy:
        report("OK", "HTTPS proxy", f"{mask(https_proxy)} (claude.ai cloud sessions route GitHub through this proxy, which adds the login)")
        if re.search(r"(^|,)\.?github\.com", no_proxy):
            report("PROBLEM", "NO_PROXY", "github.com is in NO_PROXY, so git skips the proxy and its login", "remove github.com from NO_PROXY")
        ca = os.environ.get("GIT_SSL_CAINFO") or git(["config", "--get", "http.sslCAInfo"])[1].strip()
        if ca and os.path.exists(ca):
            report("OK", "proxy certificate", f"git trusts {ca}")
        else:
            report("PROBLEM", "proxy certificate", "GIT_SSL_CAINFO / http.sslCAInfo not set to an existing file", "export GIT_SSL_CAINFO=/root/.ccr/ca-bundle.crt (cloud sessions)")
    else:
        report("INFO", "HTTPS proxy", "none (normal on a personal computer)")
    if helpers:
        report("OK", "credential helper", "; ".join(helpers))
    elif injected and https_proxy:
        report("OK", "credential helper", f"none, which is normal here: {', '.join(injected)} = proxy-injected, so the proxy adds the GitHub login")
    elif tok:
        report("WARN", "credential helper", f"none; {', '.join(tok)} is set but git doesn't read it by itself", "gh auth setup-git")
    else:
        report("PROBLEM", "credential helper", "no credential helper, no token and no proxy: git has no way to log in", "gh auth login && gh auth setup-git (or attach the repo with push access in a cloud session)")
    if os.environ.get("GIT_TERMINAL_PROMPT") == "0" or "credential.interactive false" in cfg:
        report("INFO", "password prompts", "turned off (git fails fast instead of waiting for a password, which is what we want unattended)")

    # 5. read access
    rc, out, err = git(["ls-remote", "origin", f"refs/heads/{BRANCH}"], timeout=60)
    if rc == 0 and out.strip():
        remote_sha = out.split()[0]
        report("OK", "read (git ls-remote)", f"origin/{BRANCH} is {remote_sha[:7]}")
    else:
        label, fix = diagnose(err or out)
        report("PROBLEM", "read (git ls-remote)", f"{label}: {mask((err or out).strip())[-400:]}", fix)
        remote_sha = None

    # 6. write access: a dry-run push still asks GitHub's receive-pack, which checks the login
    rc, out, err = git(["push", "--dry-run", "--porcelain", "origin", f"HEAD:{BRANCH}"], timeout=120)
    text = (err + out).strip()
    if rc == 0:
        report("OK", "write (git push --dry-run)", "GitHub accepted the login for a push: " + (text.splitlines()[-1] if text else "ok"))
    else:
        label, fix = diagnose(text)
        if label == "non-fast-forward":
            report("WARN", "write (git push --dry-run)", "login OK, but this checkout is behind GitHub", "git pull --rebase origin main, then push")
        else:
            report("PROBLEM", "write (git push --dry-run)", f"{label}: {mask(text)[-500:]}", fix)

    # 7. ahead / behind
    if remote_sha:
        git(["fetch", "-q", "origin", BRANCH], timeout=120)
        rc, out, _ = git(["rev-list", "--left-right", "--count", f"HEAD...FETCH_HEAD"])
        if rc == 0:
            ahead, behind = out.split()
            report("OK" if behind == "0" else "WARN", "ahead/behind GitHub", f"{ahead} commit(s) to push, {behind} to pull",
                   "" if behind == "0" else "git pull --rebase origin main")

    # 8. committing: identity and signing
    name = git(["config", "user.name"])[1].strip()
    email = git(["config", "user.email"])[1].strip()
    report("OK" if name and email else "WARN", "commit identity", f"{name or '(no user.name)'} <{email or 'no user.email'}>",
           "" if name and email else "the release tools pass -c user.name=Claude -c user.email=noreply@anthropic.com themselves")
    if git(["config", "--bool", "commit.gpgsign"])[1].strip() == "true":
        prog = git(["config", "gpg.ssh.program"])[1].strip() or git(["config", "gpg.program"])[1].strip()
        rc, out, err = git(["commit-tree", "-S", "HEAD^{tree}", "-p", "HEAD", "-m", "signing probe (not kept)"])
        if rc == 0:
            report("OK", "commit signing", f"on, and a test signature worked ({prog or 'default program'})")
        else:
            report("PROBLEM", "commit signing", f"commit.gpgsign is on but signing failed: {(err or out).strip()[-300:]}",
                   "fix the signing program, or for this checkout only: git config commit.gpgsign false")
    else:
        report("INFO", "commit signing", "off")
    return finish(as_json)


def finish(as_json):
    bad = [r for r in rows if r["status"] == "PROBLEM"]
    if as_json:
        print(json.dumps({"ok": not bad, "checks": rows}, indent=1))
    else:
        print("Meteor Pilot push check\n")
        for r in rows:
            print(f"{r['status']:<8} {r['check']}: {r['detail']}")
            if r["fix"] and r["status"] != "OK":
                print(f"{'':<8}   fix: {r['fix']}")
        print("\n" + ("PUSH SHOULD WORK." if not bad else f"PUSH WILL FAIL: {len(bad)} problem(s) above. Fix them in order, then run this again."))
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
