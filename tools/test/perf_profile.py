#!/usr/bin/env python3
"""Deeper performance profile (not part of the every-round suite; run it when touching drawing code).

    python3 tools/test/perf_profile.py            # full: 1x/4x/6x CPU, High and Low graphics, CPU profile, 10-run memory
    python3 tools/test/perf_profile.py --quick    # 4x only, High only

Scenarios at 390x844 (3x pixel ratio, like an iPhone 12-15): menu, Levels map, Shop (explosion preview), daily run
early and at 40 s, Mothership boss at 1:00, Blackout mission (Level 18). Prints a table and writes
tools/test/out/perf.json. Headless Chromium draws with a software GPU (SwiftShader), so absolute numbers are
pessimistic for GPU work and optimistic for nothing; compare runs against each other, not against a phone.
"""
import json, os, sys, time
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))
import browser as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

QUICK = "--quick" in sys.argv
OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
TPS = 60


def veteran(gfx):
    """A save with a few runs done (so Play opens the daily course) and Levels 1-17 cleared (so Level 18 is open)."""
    return {"coins": 500, "runs": 20, "tutDone": True, "levels": {str(i): 3 for i in range(1, 18)}, "lastDay": 0,
            "set": {"haptics": True, "motion": "auto", "gap": "normal", "hand": "center", "gfx": gfx, "voice": False}, "musicOff": True, "muted": True}


def start_daily(page):
    B.click(page, "#play")
    page.wait_for_timeout(300)
    if page.is_visible("#skipbrief"):
        page.click("#skipbrief")
    B.wait_state(page, "play", 6000)


def start_level(page, n):
    B.click(page, "#levels-btn")
    page.click(f'[data-w="{(n - 1) // 10}"]', force=True)
    page.click(f'[data-lv="{n}"]', force=True)
    B.click(page, "#lv-go")
    page.wait_for_timeout(300)
    if page.is_visible("#skipbrief"):
        page.click("#skipbrief")
    B.wait_state(page, "play", 6000)


def cpu_profile(page, ms=3000):
    cdp = page.context.new_cdp_session(page)
    cdp.send("Profiler.enable"); cdp.send("Profiler.setSamplingInterval", {"interval": 200}); cdp.send("Profiler.start")
    page.wait_for_timeout(ms)
    prof = cdp.send("Profiler.stop")["profile"]; cdp.detach()
    nodes = {n["id"]: n for n in prof["nodes"]}
    dt = defaultdict(float)
    deltas = prof.get("timeDeltas", [])
    for sid, d in zip(prof.get("samples", []), deltas):
        n = nodes[sid]["callFrame"]; name = n["functionName"] or "(anonymous)"
        if n["url"] and "index.html" not in n["url"]:
            name = name + " @" + n["url"].rsplit("/", 1)[-1]
        dt[name] += d / 1000.0
    total = sum(dt.values()) or 1
    return [(k, round(v, 1), round(100 * v / total, 1)) for k, v in sorted(dt.items(), key=lambda x: -x[1])[:15]]


def main():
    base, stop = B.serve()
    results, profiles = [], {}
    rates = [4] if QUICK else [1, 4, 6]
    gfxs = ["high"] if QUICK else ["high", "low"]
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            combos = [(g, r, 3) for g in gfxs for r in rates] + ([] if QUICK else [("high", 4, 2), ("high", 4, 1)])
            for gfx, rate, dpr in combos:
                if True:
                    ctx = B.new_context(br, 390, 844, dpr)
                    page, errs = B.open_game(ctx, base, save=veteran(gfx))
                    page.wait_for_function("() => window.__MP_ROCKS().ready", timeout=30000)
                    B.throttle(page, rate)
                    row = lambda scen, st: results.append(dict(gfx=gfx + ("" if dpr == 3 else f"@{dpr}x"), cpu=f"{rate}x", scenario=scen, **st))
                    page.wait_for_timeout(800); row("menu", B.frame_stats(page))
                    B.click(page, "#levels-btn"); page.wait_for_timeout(600); row("levels map", B.frame_stats(page))
                    page.click("#lv-back"); B.click(page, "#shop-btn"); page.click('[data-st="booms"]', force=True); page.wait_for_timeout(600)
                    row("shop boom preview", B.frame_stats(page)); page.click("#sh-back")
                    start_daily(page); B.god_mode(page, True); page.evaluate("() => { window.__mpFF = 1; }")
                    page.wait_for_timeout(1500); row("daily run 0:02", B.frame_stats(page))
                    B.fast_forward(page, 40 * TPS); row("daily run 0:40", B.frame_stats(page))
                    if rate == 4 and gfx == "high" and dpr == 3:
                        profiles["daily 0:40"] = cpu_profile(page)
                    B.fast_forward(page, 64 * TPS); row("boss 1:04", B.frame_stats(page))
                    if rate == 4 and gfx == "high" and dpr == 3:
                        profiles["boss"] = cpu_profile(page)
                    page.evaluate("() => { const c = window.CR; window.__mpGod = false; }")
                    page.close(); ctx.close()
                    ctx = B.new_context(br, 390, 844, dpr)
                    page, errs2 = B.open_game(ctx, base, save=veteran(gfx))
                    page.wait_for_function("() => window.__MP_ROCKS().ready", timeout=30000)
                    B.throttle(page, rate)
                    start_level(page, 18); B.god_mode(page, True)
                    B.fast_forward(page, 6 * TPS, factor=4); row("blackout (L18)", B.frame_stats(page))
                    if rate == 4 and gfx == "high" and dpr == 3:
                        profiles["blackout"] = cpu_profile(page)
                    for e in errs + errs2:
                        print("  page error:", e)
                    ctx.close()
                    print(f"done gfx={gfx} cpu={rate}x dpr={dpr}", flush=True)
            # memory over 10 runs (4x CPU, High)
            mem = []
            ctx = B.new_context(br, 390, 844, 3)
            page, errs = B.open_game(ctx, base, save=veteran("high"))
            page.wait_for_function("() => window.__MP_ROCKS().ready", timeout=30000)
            mem.append(dict(run=0, **B.heap_and_dom(page)))
            B.god_mode(page, False)
            for k in range(1, 11):
                if k == 1:
                    start_daily(page)
                else:
                    B.click(page, "#again"); B.wait_state(page, "play", 6000)
                B.fast_forward(page, 10 ** 9, factor=16)
                B.wait_state(page, "over", 15000)
                page.wait_for_timeout(800)
                mem.append(dict(run=k, t=B.state(page)["t"], **B.heap_and_dom(page)))
            mem.append(dict(run="ship cache", **page.evaluate("() => window.__MP_SHIP()")))
            ctx.close(); br.close()
    finally:
        stop()
    print("\n%-6s %-4s %-20s %6s %6s %6s %6s %6s %6s %6s" % ("gfx", "cpu", "scenario", "fps", "p50", "p95", "p99", "max", "js50", "js95"))
    for r in results:
        print("%-6s %-4s %-20s %6s %6s %6s %6s %6s %6s %6s" % (r["gfx"], r["cpu"], r["scenario"], r["fps"], r["p50"], r["p95"], r["p99"], r["max"], r["js50"], r["js95"]))
    for k, v in profiles.items():
        print(f"\nTop self time, {k} (4x CPU, High):")
        for name, ms, pc in v:
            print(f"  {pc:5.1f}%  {ms:7.1f} ms  {name}")
    print("\nMemory over 10 daily runs (after GC):")
    for m in mem:
        print("  ", m)
    json.dump({"frames": results, "profiles": profiles, "memory": mem}, open(os.path.join(OUT, "perf.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
