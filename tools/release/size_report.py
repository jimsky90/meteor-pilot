#!/usr/bin/env python3
"""index.html size per version from git history, the growth trend, and when the 600 KB warning and 700 KB limit arrive.

    python3 tools/release/size_report.py [--window 10] [--json]

Sizes are bytes / 1000 (the same KB the test suite and budgets.json use). One row per version: the last commit that shipped it.
The trend is a straight-line fit over the last --window versions (KB per version), plus the plain average.
"""
import argparse, datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, version_history

BUDGET = json.load(open(os.path.join(ROOT, "tools", "test", "budgets.json")))["file"]


def fit(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return 0.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=10, help="versions used for the trend (default 10)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    hist = version_history(ROOT)
    if not hist:
        print("No versions found in git history.")
        return 1
    rows = [{"v": v, "commit": h[:7], "date": d, "kb": round(s / 1000, 1)} for v, h, d, s, _ in hist]
    for prev, r in zip(rows, rows[1:]):
        r["growth_kb"] = round(r["kb"] - prev["kb"], 1)
        r["kb_per_version"] = round((r["kb"] - prev["kb"]) / max(1, r["v"] - prev["v"]), 1)

    win = rows[-a.window:] if len(rows) > 1 else rows
    slope = fit([r["v"] for r in win], [r["kb"] for r in win])
    avg = (win[-1]["kb"] - win[0]["kb"]) / max(1, win[-1]["v"] - win[0]["v"])
    last = rows[-1]
    d0 = datetime.date.fromisoformat(win[0]["date"])
    d1 = datetime.date.fromisoformat(last["date"])
    per_day = (last["v"] - win[0]["v"]) / max(1, (d1 - d0).days)  # versions per day in the window

    def when(limit_kb, rate):
        if last["kb"] >= limit_kb:
            return {"version": last["v"], "date": last["date"], "note": "already over"}
        if rate <= 0:
            return {"version": None, "date": None, "note": "not growing"}
        dv = (limit_kb - last["kb"]) / rate
        v = last["v"] + int(dv) + (0 if dv == int(dv) else 1)
        days = (v - last["v"]) / max(per_day, 1e-9)
        return {"version": v, "date": (d1 + datetime.timedelta(days=round(days))).isoformat(), "note": ""}

    warn_kb, max_kb = BUDGET["warn_bytes"] / 1000, BUDGET["max_bytes"] / 1000
    forecast = {
        "trend_kb_per_version": round(slope, 2), "average_kb_per_version": round(avg, 2),
        "versions_per_day": round(per_day, 2), "window": [win[0]["v"], last["v"]],
        "warn_600": when(warn_kb, slope), "max_700": when(max_kb, slope),
        "warn_600_at_average": when(warn_kb, avg), "max_700_at_average": when(max_kb, avg),
        "at_v100_kb": round(last["kb"] + slope * (100 - last["v"]), 1) if last["v"] < 100 else last["kb"],
    }
    if a.json:
        print(json.dumps({"versions": rows, "forecast": forecast}, indent=1))
        return 0

    print("Meteor Pilot index.html size by version (from git history; versions not committed separately are skipped)\n")
    print(f"{'ver':>5}  {'date':<10}  {'commit':<7}  {'size':>9}  {'growth':>8}  {'per ver':>8}")
    for r in rows:
        g = f"{r['growth_kb']:+.1f}" if "growth_kb" in r else ""
        p = f"{r['kb_per_version']:+.1f}" if "kb_per_version" in r else ""
        bar = "#" * int(r["kb"] / 20)
        print(f"  v{r['v']:<3}  {r['date']:<10}  {r['commit']:<7}  {r['kb']:7.1f}KB  {g:>8}  {p:>8}  {bar}")
    f = forecast
    print(f"\nNow: v{last['v']} is {last['kb']:.1f} KB ({100 * last['kb'] / max_kb:.0f}% of the {max_kb:.0f} KB limit).")
    print(f"Trend over v{win[0]['v']}-v{last['v']}: {f['trend_kb_per_version']:+.1f} KB per version (line fit), "
          f"{f['average_kb_per_version']:+.1f} KB average; about {f['versions_per_day']:.1f} versions a day.")
    for label, key, key2 in (("600 KB warning", "warn_600", "warn_600_at_average"), ("700 KB hard limit", "max_700", "max_700_at_average")):
        w, w2 = f[key], f[key2]
        if w["note"]:
            print(f"  {label}: {w['note']}")
        else:
            print(f"  {label}: around v{w['version']} (~{w['date']}) at the trend; v{w2['version'] or '-'} at the average.")
    if last["v"] < 100:
        print(f"  At v100 the trend gives {f['at_v100_kb']:.0f} KB" + ("  -> over the limit without the trim plan (TECH-DIRECTION section 5)." if f["at_v100_kb"] > max_kb else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
