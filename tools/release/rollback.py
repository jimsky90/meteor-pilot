#!/usr/bin/env python3
"""Put an earlier Meteor Pilot version back on the live app.

    python3 tools/release/rollback.py --list            # versions you can go back to
    python3 tools/release/rollback.py --dry-run          # rehearse going back one version (temporary clone, nothing pushed)
    python3 tools/release/rollback.py v52 [--reason "why"]

What it does:
  1. finds the last commit that shipped vNN (default: the version before the live one)
  2. restores index.html and sw.js from that commit
  3. moves the sw.js cache name FORWARD (meteor-pilot-vNN-rbYYYYMMDDHHMM) so installed phones see a new version and switch
  4. runs the quick tests (python3 tools/test/run_all.py --quick) and stops on FAIL
  5. commits "Roll back live game to vNN", git pull --rebase, pushes, and checks origin/main has it

Note: the static test warns "could not read one of the versions" for the rollback cache name. That WARN is expected.
The published artifact still holds the newer version: the next daily run builds on it, so fix the bug there too.
Exit codes: 0 done (or dry run OK), 1 stopped before anything was pushed, 2 committed but the push failed.
"""
import argparse, datetime, os, re, shutil, sys, tempfile, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (ROOT, REMOTE_URL, LIVE_URL, TRAILER, AS_CLAUDE, Stop, git, mask, sw_version, repo_version,
                     version_history, diagnose, sync_with_origin, push_and_verify, print_push_failure, write_json, run_tests)

LAST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "last-release.json")


def main():
    ap = argparse.ArgumentParser(description="Roll the live game back to an earlier version.")
    ap.add_argument("version", nargs="?", help="e.g. v52 or 52 (default: the version before the live one)")
    ap.add_argument("--reason", default="", help="one line on why, for the commit message")
    ap.add_argument("--dry-run", action="store_true", help="rehearse in a temporary clone; push with --dry-run only")
    ap.add_argument("--list", action="store_true", help="list versions in git history and exit")
    a = ap.parse_args()

    hist = version_history(ROOT)
    cur = repo_version(ROOT)
    if a.list:
        print(f"Live in this checkout: v{cur}\nVersions you can roll back to (last commit that shipped each):")
        for v, h, d, size, subj in hist:
            print(f"  v{v:<4} {h[:7]}  {d}  {size / 1000:6.1f} KB  {subj[:70]}")
        return 0

    t0 = time.time()
    rec = {"ok": False, "kind": "rollback", "dry_run": a.dry_run, "steps": []}
    tmp = None
    code = 1
    try:
        if git(["status", "--porcelain", "--", "index.html", "sw.js"])[1].strip():
            raise Stop("index.html or sw.js has uncommitted changes. Commit or undo them first (git checkout -- index.html sw.js).")
        work = ROOT
        if a.dry_run:
            tmp = tempfile.mkdtemp(prefix="mp-rollback-dry-")
            work = os.path.join(tmp, "repo")
            git(["clone", "-q", "--no-hardlinks", ROOT, work], cwd=tmp, timeout=300, check=True)
            git(["remote", "set-url", "origin", git(["remote", "get-url", "origin"])[1].strip() or REMOTE_URL], cwd=work, check=True)
            print(f"Dry run: working in a temporary clone at {work}")
        ok, err = sync_with_origin(work)
        if not ok:
            label, fix = diagnose(err)
            raise Stop(f"Could not pull the latest main:\n    {mask(err)}\nDiagnosis ({label}): {fix}")
        hist = version_history(work)
        cur = repo_version(work)
        versions = [v for v, *_ in hist]
        if a.version:
            target = int(a.version.lstrip("vV"))
        else:
            older = [v for v in versions if v < (cur or 0)]
            if not older:
                raise Stop("There is no earlier version in git history.")
            target = max(older)
        if target >= (cur or 0):
            raise Stop(f"v{target} is not older than the live v{cur}. To ship a newer version use release.py.")
        if target not in versions:
            raise Stop(f"v{target} was never committed to index.html. Choose one of: " + ", ".join(f"v{v}" for v in versions if v < cur))
        _, commit, date, size, subj = next(r for r in hist if r[0] == target)
        rec.update(version=target, previous=cur, source_commit=commit)
        print(f"- rolling back v{cur} -> v{target} (from {commit[:7]}, {date}: {subj[:60]})")

        for f in ("index.html", "sw.js"):
            rc, out, err = git(["show", f"{commit}:{f}"], cwd=work)
            if rc != 0:
                raise Stop(f"Could not read {f} from {commit[:7]}: {err.strip()}")
            open(os.path.join(work, f), "w", encoding="utf-8").write(out)
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M")
        new_sw = f"meteor-pilot-v{target}-rb{stamp}"
        swp = os.path.join(work, "sw.js")
        sw = open(swp, encoding="utf-8").read()
        sw2 = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{new_sw}";', sw, count=1)
        if sw2 == sw:
            raise Stop("Could not find `const VERSION = \"...\";` in the old sw.js to move the cache name forward.")
        open(swp, "w", encoding="utf-8").write(sw2)
        print(f"- restored index.html and sw.js; sw.js cache name is now {new_sw} (forward, so phones update)")

        print("- running the quick tests...")
        verdict, line, fails, warns, _ = run_tests(work, quick=True)
        rec["tests"] = {"verdict": verdict, "line": line, "fails": fails, "warns": warns, "quick": True}
        if verdict != "PASS":
            raise Stop("The quick tests FAILED on the rolled-back files, so nothing was committed:\n  " + "\n  ".join(fails or [line]))
        print(f"- tests: {line} (a WARN about the sw.js cache version is expected after a rollback)")

        title = f"Roll back live game to v{target}"
        body = f"Live app goes from v{cur} back to v{target} (index.html and sw.js from {commit[:7]}).\n" \
               f"sw.js cache name moved forward to {new_sw} so installed apps switch."
        if a.reason:
            body += f"\nReason: {a.reason}"
        git(["add", "--", "index.html", "sw.js"], cwd=work, check=True)
        rc, out, err = git(AS_CLAUDE + ["commit", "-q", "-m", f"{title}\n\n{body}\n\n{TRAILER}\n"], cwd=work)
        if rc != 0:
            raise Stop("git commit failed:\n    " + (err or out).strip())
        rec["commit"] = git(["rev-parse", "HEAD"], cwd=work)[1].strip()
        print(f"- committed {rec['commit'][:7]} {title}")
        code = 2
        res = push_and_verify(work, dry_run=a.dry_run)
        rec["push"] = res
        if not res["ok"]:
            print_push_failure(res)
            raise Stop("The rollback was committed locally but is NOT live.")
        rec["ok"] = True
        code = 0
    except Stop as e:
        rec["error"] = str(e)
        print("\nSTOPPED: " + str(e))
    finally:
        rec["seconds"] = round(time.time() - t0)
        if not a.dry_run:
            try:
                write_json(LAST, rec)
            except OSError:
                pass
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "=" * 60)
    if rec["ok"] and a.dry_run:
        print(f"DRY RUN OK: rolling back to v{rec['version']} works. Tests: {rec['tests']['line']}. Nothing was pushed.")
    elif rec["ok"]:
        print(f"ROLLED BACK: {LIVE_URL} now serves v{rec['version']} (GitHub Pages takes a few minutes).")
        print("Next: fix the bug in the published artifact too, or the next daily release brings it back.")
    elif code == 2:
        print("NOT LIVE: the rollback commit exists here but the push failed. See the diagnosis above.")
    else:
        print("NOT ROLLED BACK: stopped before anything was pushed. The live app is unchanged.")
    print("=" * 60)
    return code


if __name__ == "__main__":
    sys.exit(main())
