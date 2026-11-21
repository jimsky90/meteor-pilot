#!/usr/bin/env python3
"""Release a new Meteor Pilot version to the live app (GitHub Pages) in one command.

    python3 tools/release/release.py <artifact.html> [--summary "short words"] [--audit "F1, M2"] [--skip-browser] [--dry-run]

<artifact.html> is the published game page as saved by the Artifact tool's read action (the viewer wrapper is fine).

What it does, stopping at the first problem:
  1. checks the checkout (remote, branch, no local edits to the files it writes) and pulls the latest main
  2. validates the artifact file: the game is there, the CHANGELOG parses, and its version is newer than the repo's
  3. runs tools/sync_from_artifact.py (index.html + sw.js cache version)
  4. runs python3 tools/test/run_all.py and stops on FAIL (--skip-browser runs --quick instead: emergencies only, it is logged)
  5. adds a line per new version to docs/AUDIT-PROGRESS.md (from --audit or the CHANGELOG notes) unless it is already listed
  6. commits as Claude: "Update game to vNN: <summary>"
  7. git pull --rebase, git push origin HEAD:main, then git fetch and checks origin/main has the commit
  8. prints a plain-English summary and writes tools/release/last-release.json (git-ignored)

--dry-run does all of this in a temporary clone and only does `git push --dry-run`, so nothing reaches GitHub.
Exit codes: 0 released (or dry run OK), 1 stopped before anything was pushed, 2 committed but the push failed.
"""
import argparse, datetime, os, re, shutil, subprocess, sys, tempfile, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (ROOT, REMOTE_URL, LIVE_URL, BRANCH, TRAILER, AS_CLAUDE, Stop, git, mask, parse_changelog,
                     first_version, sw_version, repo_version, diagnose, on_branch, sync_with_origin, push_and_verify,
                     print_push_failure, write_json, run_tests)

LAST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "last-release.json")
OWNED = ["index.html", "sw.js", "docs/AUDIT-PROGRESS.md"]


def say(msg):
    print(msg, flush=True)


def short_summary(note, limit=60):
    s = re.sub(r"<[^>]+>", "", note).strip().rstrip(".!")
    s = re.split(r";|\(|\. ", s)[0].strip()
    if len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0].rstrip(",")
    if len(s) > 1 and s[0].isupper() and s[1].islower():
        s = s[0].lower() + s[1:]
    return s


def validate_artifact(path, current):
    if not os.path.isfile(path):
        raise Stop(f"The artifact file doesn't exist: {path}")
    html = open(path, encoding="utf-8", errors="replace").read()
    problems = []
    if len(html) < 100_000:
        problems.append(f"it is only {len(html) / 1000:.0f} KB; the game is over 400 KB, so this is probably a summary or a cut-off read")
    if "<title>" not in html:
        problems.append("no <title> tag, so the sync script can't find where the game starts")
    for needle, what in (("const CHANGELOG = [", "the CHANGELOG"), ("window.CR", "the rules engine (window.CR)"), ("<script", "any script")):
        if needle not in html:
            problems.append(f"{what} is missing")
    if "<!-- GAME:START -->" in html:
        problems.append("it contains the GAME markers, so it looks like the repo's index.html, not the artifact page")
    if not re.search(r"</script>\s*(</body>\s*</html>)?\s*$", html):
        problems.append("it doesn't end with </script> (and </body></html>), so it may be cut off")
    cl = parse_changelog(html)
    if not cl:
        problems.append("the CHANGELOG entries could not be read (expected lines like { v: 54, date: \"...\", notes: [...] })")
    if problems:
        raise Stop("The artifact file doesn't look like a complete Meteor Pilot page:\n  - " + "\n  - ".join(problems))
    new = cl[0]["v"]
    fv = first_version(html)
    if fv != new:
        raise Stop(f"The first '{{ v: N,' in the page is v{fv}, but the newest CHANGELOG entry is v{new}. The sync script and tests read the first one, so they must match.")
    if [e["v"] for e in cl] != sorted([e["v"] for e in cl], reverse=True):
        raise Stop("The CHANGELOG is not newest-first.")
    if not re.match(r"\d{4}-\d{2}-\d{2}$", cl[0]["date"]) or not cl[0]["notes"]:
        raise Stop(f"CHANGELOG v{new} needs a date (YYYY-MM-DD) and at least one note.")
    if current is not None and new <= current:
        raise Stop(f"The artifact is v{new}, but the repo already has v{current}. Nothing new to release.")
    return html, cl


def audit_listed(text):
    got = set()
    for a, b in re.findall(r"\*\*v(\d+)(?:\s*[–-]\s*v?(\d+))?\*\*", text):
        got.update(range(int(a), int(b or a) + 1))
    return got


def update_audit(root, entries, audit_text):
    path = os.path.join(root, "docs", "AUDIT-PROGRESS.md")
    text = open(path, encoding="utf-8").read()
    listed = audit_listed(text)
    added = []
    for i, e in enumerate(sorted(entries, key=lambda e: e["v"])):
        if e["v"] in listed:
            continue
        what = audit_text if (audit_text and e is entries[0]) else "; ".join(re.sub(r"<[^>]+>", "", n).rstrip(".") for n in e["notes"])
        added.append(f"- **v{e['v']}** ({e['date']}): {what}.")
    if added:
        if not text.endswith("\n"):
            text += "\n"
        text += "\n".join(added) + "\n"
        open(path, "w", encoding="utf-8").write(text)
    return added


def make_workdir(dry):
    if not dry:
        return ROOT, None
    tmp = tempfile.mkdtemp(prefix="mp-release-dry-")
    work = os.path.join(tmp, "repo")
    say(f"Dry run: working in a temporary clone at {work}")
    git(["clone", "-q", "--no-hardlinks", ROOT, work], cwd=tmp, timeout=300, check=True)
    url = git(["remote", "get-url", "origin"])[1].strip() or REMOTE_URL
    git(["remote", "set-url", "origin", url], cwd=work, check=True)
    return work, tmp


def main():
    ap = argparse.ArgumentParser(description="Release a new Meteor Pilot version to the live app.")
    ap.add_argument("artifact", help="path to the published artifact HTML")
    ap.add_argument("--summary", help="short words for the commit title (default: from the first CHANGELOG note)")
    ap.add_argument("--audit", help="what this version finished, for AUDIT-PROGRESS (e.g. 'F1 (error guard on the game loop)'); default: CHANGELOG notes")
    ap.add_argument("--skip-browser", action="store_true", help="EMERGENCY ONLY: run the quick tests (no browser). Logged in the commit and last-release.json")
    ap.add_argument("--dry-run", action="store_true", help="do everything in a temporary clone; push with --dry-run only")
    ap.add_argument("--keep", action="store_true", help="with --dry-run: keep the temporary clone for inspection")
    a = ap.parse_args()

    artifact = os.path.abspath(a.artifact)
    t0 = time.time()
    rec = {"ok": False, "dry_run": a.dry_run, "artifact": artifact, "skip_browser": a.skip_browser, "steps": []}
    work, tmp = None, None
    code = 1

    def step(name, detail=""):
        rec["steps"].append({"step": name, "detail": detail})
        say(f"- {name}" + (f": {detail}" if detail else ""))

    try:
        # 1. checkout
        if git(["rev-parse", "--is-inside-work-tree"])[0] != 0:
            raise Stop(f"{ROOT} is not a git checkout. Clone it first: git clone {REMOTE_URL} /home/claude/meteor-pilot")
        rc, url, err = git(["remote", "get-url", "origin"])
        if rc != 0:
            raise Stop(f"No 'origin' remote. Fix: git remote add origin {REMOTE_URL}")
        if not on_branch():
            say("  note: the checkout is on a detached HEAD; that's OK, the push goes to main with HEAD:main")
        dirty = git(["status", "--porcelain", "--"] + OWNED)[1].strip()
        if dirty:
            raise Stop("These files have local changes that aren't committed:\n" + dirty +
                       "\nThe release writes them itself. If they're only an earlier hand sync, undo it with "
                       "`git checkout -- index.html sw.js docs/AUDIT-PROGRESS.md`; if they're someone's real edits, commit them first.")
        work, tmp = make_workdir(a.dry_run)
        ok, err = sync_with_origin(work)
        if not ok:
            label, fix = diagnose(err)
            raise Stop(f"Could not pull the latest main:\n    {mask(err)}\nDiagnosis ({label}): {fix}")
        before = repo_version(work)
        step("checkout ready", f"repo has v{before}, branch {on_branch(work) or 'detached HEAD'}")

        # 2. validate
        html, cl = validate_artifact(artifact, before)
        new = cl[0]["v"]
        entries = [e for e in cl if before is None or e["v"] > before]
        rec.update(version=new, previous=before)
        step("artifact OK", f"v{new} ({cl[0]['date']}), {len(html) / 1000:.1f} KB, {len(entries)} new version(s)")

        # 3. sync
        p = subprocess.run([sys.executable, os.path.join(work, "tools", "sync_from_artifact.py"), artifact],
                           cwd=work, capture_output=True, text=True, timeout=120)
        if p.returncode != 0:
            raise Stop("tools/sync_from_artifact.py failed:\n" + (p.stderr or p.stdout).strip()[-1500:])
        got = repo_version(work)
        swv = sw_version(open(os.path.join(work, "sw.js")).read())
        if got != new or swv != f"meteor-pilot-v{new}":
            raise Stop(f"After the sync, index.html is v{got} and sw.js is {swv}; expected v{new} and meteor-pilot-v{new}.")
        size = os.path.getsize(os.path.join(work, "index.html"))
        rec["size_bytes"] = size
        step("synced", p.stdout.strip() + f" ({size / 1000:.1f} KB)")

        # 4. tests
        if a.skip_browser:
            say("  WARNING: --skip-browser: running the quick tests only (no browser). Emergency use only; this is logged.")
        say("- running the test suite" + (" (quick)" if a.skip_browser else " (about 2-3 minutes)") + "...")
        verdict, line, fails, warns, out = run_tests(work, a.skip_browser)
        rec["tests"] = {"verdict": verdict, "line": line, "fails": fails, "warns": warns, "quick": a.skip_browser}
        if verdict != "PASS":
            raise Stop("The test suite FAILED, so nothing was committed or pushed:\n  " + "\n  ".join(fails or [line]) +
                       f"\nFull output: python3 tools/test/run_all.py (results in tools/test/out/summary.json)")
        step("tests", line + (f" ({len(warns)} warnings: read them)" if warns else ""))

        # 5. audit
        added = update_audit(work, entries, a.audit)
        step("AUDIT-PROGRESS", f"added {', '.join('v' + l.split('**v')[1].split('**')[0] for l in added)}" if added else "already listed")

        # 6. commit
        summary = a.summary or short_summary(cl[0]["notes"][0])
        title = f"Update game to v{new}: {summary}"
        body = "\n".join(f"- {re.sub(r'<[^>]+>', '', n)}" for n in cl[0]["notes"])
        if a.skip_browser:
            body += "\n\nEMERGENCY RELEASE: browser tests were skipped (--skip-browser); only the quick tests ran."
        msg = f"{title}\n\n{body}\n\n{TRAILER}\n"
        git(["add", "--"] + OWNED, cwd=work, check=True)
        if git(["diff", "--cached", "--quiet"], cwd=work)[0] == 0:
            raise Stop("Nothing changed after the sync; there's nothing to commit.")
        rc, out, err = git(AS_CLAUDE + ["commit", "-q", "-m", msg], cwd=work)
        if rc != 0:
            raise Stop("git commit failed:\n    " + (err or out).strip() +
                       ("\nDiagnosis: commit signing failed. Check `git config --get-regexp 'gpg|sign'` and that the signing program exists."
                        if re.search(r"sign|gpg", err or out, re.I) else ""))
        rec["commit"] = git(["rev-parse", "HEAD"], cwd=work)[1].strip()
        rec["title"] = title
        step("committed", f"{rec['commit'][:7]} {title}")
        code = 2

        # 7. pull --rebase, push, verify
        ok, err = sync_with_origin(work)
        if not ok:
            label, fix = diagnose(err)
            raise Stop(f"git pull --rebase failed after committing (someone changed the same lines on GitHub):\n    {mask(err)}\n"
                       f"Diagnosis ({label}): {fix}\nYour commit is still here locally; nothing was pushed.")
        after = repo_version(work)
        if after != new:
            raise Stop(f"After pulling, index.html is v{after}, not v{new}: someone else released at the same time. Check `git log -3` before pushing by hand.")
        res = push_and_verify(work, dry_run=a.dry_run)
        rec["push"] = res
        if not res["ok"]:
            print_push_failure(res)
            raise Stop("The release was committed locally but is NOT live.")
        step("pushed" if not a.dry_run else "dry-run push OK", res["remote"][:7] if not a.dry_run else "GitHub accepted the login; nothing was sent")
        rec["ok"] = True
        code = 0
    except Stop as e:
        rec["error"] = str(e)
        say("\nSTOPPED: " + str(e))
    finally:
        rec["seconds"] = round(time.time() - t0)
        try:
            write_json(LAST, rec)
        except OSError:
            pass
        if tmp and not a.keep:
            shutil.rmtree(tmp, ignore_errors=True)
        elif tmp:
            say(f"(kept the temporary clone: {work})")

    say("\n" + "=" * 60)
    v = rec.get("version")
    if rec["ok"] and a.dry_run:
        say(f"DRY RUN OK: v{v} would go live. Tests: {rec['tests']['line']}. Nothing was pushed.")
    elif rec["ok"]:
        say(f"RELEASED v{v}. GitHub has commit {rec['commit'][:7]}; the live app at {LIVE_URL} updates within a few minutes.")
        say(f"Tests: {rec['tests']['line']}" + ("  (EMERGENCY: browser tests skipped)" if a.skip_browser else ""))
        say("Installed apps pick it up the next time they're opened online (the sw.js cache version changed).")
    elif code == 2:
        say(f"NOT LIVE: v{v} was committed here but the push failed. See the diagnosis above; the live app is unchanged.")
    else:
        say("NOT RELEASED: stopped before anything was pushed. The live app is unchanged.")
    say("=" * 60)
    return code


if __name__ == "__main__":
    sys.exit(main())
