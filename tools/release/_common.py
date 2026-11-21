"""Shared helpers for the Meteor Pilot release tools (release.py, rollback.py, diagnose_push.py, size_report.py).

Plain standard library only, so the tools run in any fresh cloud session.
"""
import datetime, json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REMOTE_URL = "https://github.com/jimsky90/meteor-pilot"
LIVE_URL = "https://jimsky90.github.io/meteor-pilot/"
BRANCH = "main"
TRAILER = (
    "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n"
    "Claude-Session: https://claude.ai/code/session_01Tn3un1oSNZtBueP1wd1RUr"
)
AS_CLAUDE = ["-c", "user.name=Claude", "-c", "user.email=noreply@anthropic.com"]


class Stop(Exception):
    """A step failed; the message is shown to the reader as-is."""


def git(args, cwd=ROOT, timeout=120, check=False):
    """Run git; return (returncode, stdout, stderr). Never prompts for a password."""
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        p = subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        if check:
            raise Stop(f"git {' '.join(args)} timed out after {timeout} s")
        return 124, "", f"timed out after {timeout} s"
    if check and p.returncode != 0:
        raise Stop(f"git {' '.join(args)} failed:\n{(p.stderr or p.stdout).strip()}")
    return p.returncode, p.stdout, p.stderr


def mask(s):
    """Hide tokens embedded in URLs (https://user:TOKEN@host) and ghp_/github_pat_ strings."""
    s = re.sub(r"(https?://[^/\s:@]+:)[^@\s]+@", r"\1***@", s)
    s = re.sub(r"(https?://)[A-Za-z0-9_]{20,}@", r"\1***@", s)
    return re.sub(r"\b(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]+", r"\1***", s)


# ---------- versions ----------

ENTRY = re.compile(r'\{ v: (\d+), date: "([^"]*)", notes: (\[.*\]) \},?\s*$')


def parse_changelog(html):
    """Return the CHANGELOG as a list of {v, date, notes}, newest first. [] if not found."""
    i = html.find("const CHANGELOG = [")
    if i < 0:
        return []
    out = []
    for line in html[i:].splitlines()[1:]:
        s = line.strip()
        if s.startswith("];") or s == "]":
            break
        m = ENTRY.search(s)
        if not m:
            continue
        try:
            notes = json.loads(m.group(3))
        except ValueError:
            notes = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(3))
        out.append({"v": int(m.group(1)), "date": m.group(2), "notes": [str(n) for n in notes]})
    return out


def first_version(html):
    """The version the sync script and the static test read: the first `{ v: N,` in the page."""
    m = re.search(r"\{ v: (\d+),", html)
    return int(m.group(1)) if m else None


def sw_version(sw_text):
    m = re.search(r'const VERSION = "([^"]*)";', sw_text)
    return m.group(1) if m else None


def repo_version(root=ROOT):
    try:
        return first_version(open(os.path.join(root, "index.html"), encoding="utf-8").read())
    except OSError:
        return None


def version_history(root=ROOT):
    """[(version, commit, date, size_bytes, subject)] oldest first; the last commit for each version wins."""
    rc, out, _ = git(["log", "--reverse", "--format=%H%x09%ad%x09%s", "--date=short", "--", "index.html"], cwd=root)
    rows = {}
    order = []
    for line in out.splitlines():
        h, d, subj = line.split("\t", 2)
        p = subprocess.run(["git", "show", f"{h}:index.html"], cwd=root, capture_output=True)
        if p.returncode != 0:
            continue
        v = first_version(p.stdout.decode("utf-8", "replace"))
        if v is None:
            continue
        if v not in rows:
            order.append(v)
        rows[v] = (v, h, d, len(p.stdout), subj)
    return [rows[v] for v in order]


# ---------- push diagnosis ----------

DIAGNOSES = [
    ("proxy refusal", [r"from proxy after CONNECT", r"Proxy CONNECT aborted", r"\b407\b", r"\[agent-proxy\]", r"CONNECT tunnel failed"],
     "The session's network proxy refused the connection to github.com. In a claude.ai cloud session this means github.com "
     "is not allowed for this environment, or the repo was not attached. Fix: call add_repo (owner jimsky90, repo meteor-pilot, "
     "access push) and retry once; if it still fails, the environment's network settings must allow github.com. Do not try to route around the proxy."),
    ("protected branch / push rule", [r"GH006", r"protected branch", r"pre-receive hook declined", r"GH013"],
     "GitHub's branch rules refused the push. Fix: the owner checks Settings > Branches / Rules on github.com/jimsky90/meteor-pilot. "
     "GH013 means GitHub thinks the commit contains a secret: remove it from the commit."),
    ("auth 403 (no write permission)", [r"\b403\b", r"Permission to \S+ denied", r"denied to"],
     "GitHub (or the proxy) knows who we are but this login may not write to jimsky90/meteor-pilot. Fix in a cloud session: "
     "call add_repo with access \"push\" and retry once; if it still fails, the owner reconnects GitHub in claude.ai Settings > Connectors "
     "and makes sure the Claude GitHub App is installed on jimsky90/meteor-pilot. On a computer: `gh auth login` then `gh auth setup-git`."),
    ("auth 401 / no credentials", [r"\b401\b", r"Authentication failed", r"could not read Username", r"terminal prompts disabled",
                                    r"Invalid username or (password|token)", r"Support for password authentication was removed"],
     "Git had no working login for github.com. In a claude.ai cloud session the proxy adds the login for attached repos, so this "
     "means the repo was not attached with push access. Fix: call add_repo (owner jimsky90, repo meteor-pilot, access push), then retry. "
     "On a computer: `gh auth login` then `gh auth setup-git` (installs a credential helper)."),
    ("repository not found", [r"Repository not found", r"not found\b.*\brepository", r"\b404\b"],
     "GitHub says the repo doesn't exist for this login. The repo is public, so this usually means a wrong remote URL or a login "
     f"that can't see it. Fix: `git remote set-url origin {REMOTE_URL}` and attach the repo with push access."),
    ("non-fast-forward", [r"non-fast-forward", r"\[rejected\]", r"fetch first", r"Updates were rejected"],
     "Someone else pushed to main first (often a chat session pushing the same version). Fix: `git pull --rebase origin main`, "
     "rerun the tests if index.html changed, then push again. The release script retries this once by itself."),
    ("missing remote", [r"does not appear to be a git repository", r"No such remote", r"No configured push destination"],
     f"This checkout has no 'origin' remote. Fix: `git remote add origin {REMOTE_URL}` (or `git remote set-url origin {REMOTE_URL}`)."),
    ("detached HEAD", [r"not currently on a branch", r"HEAD detached", r"You are in 'detached HEAD'"],
     "The checkout is not on a branch. Fix: `git switch -C main` (keeps the current commit) and run the release again; "
     "pushes always go to main with `git push origin HEAD:main`."),
    ("network / transfer cut", [r"Could not resolve host", r"Failed to connect", r"Connection timed out", r"timed out after",
                                 r"RPC failed", r"unexpected disconnect", r"Connection reset", r"early EOF", r"\b429\b", r"\b503\b"],
     "The connection to GitHub broke or timed out. Fix: wait a minute and retry once. In a cloud session read /root/.ccr/README.md "
     "for the proxy's per-error fixes."),
    ("TLS / certificate", [r"certificate", r"SSL", r"server certificate verification failed"],
     "Git doesn't trust the proxy's certificate. Fix: make sure GIT_SSL_CAINFO (or git http.sslCAInfo) points at the session's CA bundle "
     "(/root/.ccr/ca-bundle.crt in claude.ai cloud sessions). Never turn certificate checks off."),
]


def diagnose(err_text):
    """Return (label, plain-English diagnosis + fix) for a git error."""
    for label, pats, fix in DIAGNOSES:
        for p in pats:
            if re.search(p, err_text, re.I):
                return label, fix
    return "unknown", ("Not a known pattern. Run `python3 tools/release/diagnose_push.py` and read its PROBLEM lines; "
                       "it checks the remote, logins, proxy and a dry-run push.")


def on_branch(cwd=ROOT):
    rc, out, _ = git(["symbolic-ref", "-q", "--short", "HEAD"], cwd=cwd)
    return out.strip() if rc == 0 else None


def sync_with_origin(cwd=ROOT):
    """git pull --rebase (autostash). Works on a branch or a detached HEAD. Returns (ok, error_text)."""
    if on_branch(cwd):
        rc, out, err = git(["pull", "--rebase", "--autostash", "-q", "origin", BRANCH], cwd=cwd, timeout=180)
    else:
        rc, out, err = git(["fetch", "-q", "origin", BRANCH], cwd=cwd, timeout=180)
        if rc == 0:
            rc, out, err = git(["rebase", "--autostash", "FETCH_HEAD"], cwd=cwd, timeout=180)
    if rc != 0:
        if os.path.isdir(os.path.join(cwd, ".git", "rebase-merge")) or os.path.isdir(os.path.join(cwd, ".git", "rebase-apply")):
            git(["rebase", "--abort"], cwd=cwd)
        return False, (err or out).strip()
    return True, ""


def push_and_verify(cwd=ROOT, dry_run=False):
    """Push HEAD to main (one automatic retry after a non-fast-forward), then verify with git fetch.

    Returns a dict: ok, step, error, diagnosis_label, diagnosis, local, remote."""
    res = {"ok": False, "step": "push", "error": "", "diagnosis_label": "", "diagnosis": "", "local": "", "remote": ""}
    args = ["push"] + (["--dry-run"] if dry_run else []) + ["origin", f"HEAD:{BRANCH}"]
    for attempt in (1, 2):
        rc, out, err = git(args, cwd=cwd, timeout=240)
        if rc == 0:
            break
        text = (err or out).strip()
        label, _ = diagnose(text)
        if label == "non-fast-forward" and attempt == 1:
            ok, e2 = sync_with_origin(cwd)
            if ok:
                continue
            text += "\n(retry) git pull --rebase failed:\n" + e2
        res["error"] = mask(text)
        res["diagnosis_label"], res["diagnosis"] = diagnose(text)
        return res
    res["local"] = git(["rev-parse", "HEAD"], cwd=cwd)[1].strip()
    if dry_run:
        res.update(ok=True, step="dry-run push", remote="(dry run: not pushed)")
        return res
    res["step"] = "verify"
    rc, out, err = git(["fetch", "-q", "origin", BRANCH], cwd=cwd, timeout=180)
    if rc != 0:
        res["error"] = mask((err or out).strip())
        res["diagnosis_label"], res["diagnosis"] = diagnose(res["error"])
        return res
    remote = git(["rev-parse", "FETCH_HEAD"], cwd=cwd)[1].strip()
    res["remote"] = remote
    if remote != res["local"]:
        res["error"] = f"after the push, origin/main is {remote[:7]} but our commit is {res['local'][:7]}"
        res["diagnosis_label"] = "not on origin"
        res["diagnosis"] = "The push said OK but GitHub's main doesn't have our commit. Someone may have force-pushed; run `git log origin/main` and push again."
        return res
    res["ok"] = True
    return res


def print_push_failure(res):
    print("\nPUSH FAILED at step: " + res["step"])
    print("Exact git error:")
    for line in (res["error"] or "(no output)").splitlines():
        print("    " + line)
    print(f"Diagnosis ({res['diagnosis_label']}): {res['diagnosis']}")
    print("For a full check run: python3 tools/release/diagnose_push.py")


def write_json(path, data):
    data = dict(data, written_at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")


def run_tests(root, quick):
    cmd = [sys.executable, os.path.join(root, "tools", "test", "run_all.py")] + (["--quick"] if quick else [])
    p = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=900)
    out = p.stdout + p.stderr
    verdict = "PASS" if p.returncode == 0 else "FAIL"
    m = re.search(r"^(PASS|FAIL): (.*)$", out, re.M)
    line = m.group(0) if m else f"{verdict} (exit {p.returncode})"
    fails = [l.strip() for l in out.splitlines() if l.strip().startswith("x FAIL")]
    warns = [l.strip() for l in out.splitlines() if l.strip().startswith("WARN")]
    return verdict, line, fails, warns, out
