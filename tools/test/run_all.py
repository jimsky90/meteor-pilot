#!/usr/bin/env python3
"""Meteor Pilot regression suite. Run before every publish:

    python3 tools/test/run_all.py            # everything (about 2-3 minutes)
    python3 tools/test/run_all.py --quick    # static + rules only, no browser (about 30 s), for quick checks while coding

Exit code 0 = no FAIL (WARNs are allowed but must be read). A FAIL blocks the publish.
Results are also written to tools/test/out/summary.json.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
QUICK = "--quick" in sys.argv

SUITES = [
    ("static", [sys.executable, os.path.join(HERE, "static_checks.py")], 120),
    ("rules", ["node", os.path.join(HERE, "rules_test.js")], 180),
]
if not QUICK:
    SUITES.append(("browser", [sys.executable, os.path.join(HERE, "browser_test.py")], 420))


def run(name, cmd, timeout):
    t0 = time.time()
    rows = []
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=os.path.join(HERE, "..", ".."))
        for line in p.stdout.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
        if p.returncode != 0 or not rows:
            tail = (p.stderr or p.stdout).strip().splitlines()[-6:]
            rows.append({"name": f"{name}: test runner crashed (exit {p.returncode})", "status": "FAIL", "detail": " | ".join(tail)[:600]})
    except subprocess.TimeoutExpired:
        rows.append({"name": f"{name}: timed out after {timeout} s", "status": "FAIL", "detail": "a test hung; run it alone to see where"})
    except FileNotFoundError as e:
        rows.append({"name": f"{name}: could not start", "status": "FAIL", "detail": str(e)})
    for r in rows:
        r["suite"] = name
    return rows, time.time() - t0


def main():
    t0 = time.time()
    allrows = []
    print("Meteor Pilot regression suite" + (" (quick: no browser)" if QUICK else ""))
    for name, cmd, to in SUITES:
        print(f"\n== {name} ", end="", flush=True)
        rows, dt = run(name, cmd, to)
        print(f"({dt:.0f} s)")
        for r in rows:
            mark = {"PASS": "  PASS", "WARN": "  WARN", "FAIL": "x FAIL"}.get(r["status"], r["status"])
            print(f"{mark}  {r['name']}")
            if r["status"] != "PASS" or "-v" in sys.argv:
                print(f"          {r['detail']}")
        allrows += rows
    n = {s: sum(1 for r in allrows if r["status"] == s) for s in ("PASS", "WARN", "FAIL")}
    verdict = "FAIL" if n["FAIL"] else "PASS"
    print("\n" + "=" * 60)
    print(f"{verdict}: {n['PASS']} passed, {n['WARN']} warnings, {n['FAIL']} failed  ({time.time() - t0:.0f} s)")
    if n["FAIL"]:
        print("Do not publish. Fix every FAIL above, then run this again.")
    elif n["WARN"]:
        print("OK to publish. Read the warnings; fix them when you can.")
    print("=" * 60)
    json.dump({"verdict": verdict, "counts": n, "seconds": round(time.time() - t0), "results": allrows}, open(os.path.join(OUT, "summary.json"), "w"), indent=1)
    sys.exit(1 if n["FAIL"] else 0)


if __name__ == "__main__":
    main()
