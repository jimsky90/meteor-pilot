#!/usr/bin/env python3
"""Browser tests (Playwright + Chromium). Prints one JSON line per check:
   {"name": ..., "status": "PASS"|"FAIL"|"WARN", "detail": ...}

1. Smoke at 360x640 and 390x844: menu, play a run, pause/resume, end run, results, Levels (open a brief),
   Shop (every tab), Hangar (every tab), Settings (Low and back to High graphics), Trophies, back to menu.
   No page errors, no console errors, no sideways scroll on any screen.
2. Saves: fixture saves from older versions load with coins and stars kept; corrupted saves still reach a
   working start screen. A run is played on each old save.
3. Frame time: a busy daily run (0:40, kept alive by a test-only shield refill) with 4x CPU throttling at
   390x844, against the budget in budgets.json.
"""
import json, os, sys, time, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
import browser as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

BUDGET = json.load(open(os.path.join(HERE, "budgets.json")))
FIX = os.path.join(HERE, "fixtures")
SHOTS = os.path.join(HERE, "out"); os.makedirs(SHOTS, exist_ok=True)
FAST = "--fast" in sys.argv


def report(name, status, detail):
    print(json.dumps({"name": name, "status": status, "detail": detail}), flush=True)


def shot(page, name):
    try:
        page.screenshot(path=os.path.join(SHOTS, name + ".png"))
    except Exception:
        pass


def skip_brief(page):
    page.wait_for_timeout(250)
    if page.is_visible("#skipbrief"):
        page.click("#skipbrief", force=True)


def smoke(br, base, w, h, label=""):
    name = f"smoke {label}{w}x{h}"
    ctx = B.new_context(br, w, h, 2 if w < 380 else 3)
    page, errors = B.open_game(ctx, base)
    steps, problems = [], []

    def check(where):
        for p in B.no_sideways_scroll(page):
            problems.append(f"{where}: {p}")
        steps.append(where)

    try:
        check("menu")
        # first flight: Play opens Level 1 with a radio briefing
        B.click(page, "#play"); skip_brief(page); B.wait_state(page, "play", 8000)
        B.steer(page, 2.5, w, h)
        s1 = B.state(page)
        if not s1 or s1["t"] < 30:
            problems.append(f"run: the game clock did not advance (t={s1 and s1['t']})")
        check("run")
        B.click(page, "#pausebtn"); B.wait_state(page, "paused", 3000); check("pause")
        t_paused = B.state(page)["t"]; page.wait_for_timeout(600)
        if B.state(page)["t"] != t_paused:
            problems.append("pause: the game kept running while paused")
        B.click(page, "#resume"); B.wait_state(page, "play", 5000)
        B.steer(page, 1.0, w, h)
        st = B.state(page)["state"]
        if st == "play":
            B.click(page, "#pausebtn"); B.wait_state(page, "paused", 3000)
            B.click(page, "#quit")
        B.wait_state(page, "over", 8000)
        page.wait_for_timeout(500)
        check("results")
        # back to the menu through the level map
        B.click(page, "#lv-map", 4000)
        page.wait_for_selector("#levels:not([hidden])", timeout=4000); check("levels")
        page.click('[data-lv="1"]', force=True); page.wait_for_selector("#lv-go", timeout=3000); page.wait_for_timeout(300); check("level brief")
        B.click(page, "#lv-back"); B.wait_state(page, "menu", 3000); check("menu again")
        # shop, every tab
        B.click(page, "#shop-btn"); page.wait_for_selector("#shop:not([hidden])", timeout=3000)
        for tab in page.eval_on_selector_all("#shop [data-st]", "els => els.map(e => e.dataset.st)"):
            page.click(f'#shop [data-st="{tab}"]', force=True); page.wait_for_timeout(250); check(f"shop/{tab}")
        B.click(page, "#sh-back")
        # hangar, every tab
        B.click(page, "#open-hangar"); page.wait_for_selector("#hangar:not([hidden])", timeout=3000)
        for tab in page.eval_on_selector_all("#hangar [data-tab]", "els => els.map(e => e.dataset.tab)"):
            page.click(f'#hangar [data-tab="{tab}"]', force=True); page.wait_for_timeout(250); check(f"hangar/{tab}")
        B.click(page, "#h-done")
        # settings: switch graphics to Low and back (re-creates the canvas size and the GPU ship)
        B.click(page, "#settings-btn"); page.wait_for_selector("#settings:not([hidden])", timeout=3000); check("settings")
        low = page.query_selector('#settings [data-sk="gfx"][data-sv="low"]')
        high = page.query_selector('#settings [data-sk="gfx"][data-sv="high"]')
        if low and high:
            low.click(force=True); page.wait_for_timeout(300)
            page.query_selector('#settings [data-sk="gfx"][data-sv="high"]').click(force=True); page.wait_for_timeout(300)
        else:
            problems.append("settings: Graphics High/Low buttons not found (data-sk=gfx)")
        B.click(page, "#set-done")
        B.click(page, "#trophies-btn"); page.wait_for_selector("#trophies:not([hidden])", timeout=3000); check("trophies")
        B.click(page, "#tr-back"); B.wait_state(page, "menu", 3000); check("menu end")
        # the save written by this session must be valid JSON with the fields the game relies on
        raw = page.evaluate("k => localStorage.getItem(k)", B.SAVE_KEY)
        sv = json.loads(raw or "null")
        if not isinstance(sv, dict) or "coins" not in sv or "runs" not in sv:
            problems.append("save: cometrun:v2 missing or malformed after a session")
        elif sv.get("runs", 0) < 1:
            problems.append("save: the finished run was not counted (runs < 1)")
    except Exception as e:
        problems.append(f"after [{', '.join(steps[-2:])}]: {type(e).__name__}: {str(e).splitlines()[0][:200]}")
    if errors or problems:
        shot(page, f"fail-smoke-{w}x{h}")
    ctx.close()
    # page errors first, then each distinct layout problem once (with the first screen it was seen on)
    seen, uniq = set(), []
    for pr in problems:
        key = pr.split(": ", 1)[-1]
        if key not in seen:
            seen.add(key); uniq.append(pr)
    bad = list(dict.fromkeys(errors)) + uniq
    report(name, "FAIL" if bad else "PASS", "; ".join(bad[:8]) if bad else f"{len(steps)} screens, no errors, no sideways scroll")


def saves(br, base):
    files = sorted(os.listdir(FIX))
    for fn in files:
        path = os.path.join(FIX, fn)
        raw = open(path).read()
        old = fn.startswith("save-")
        ctx = B.new_context(br, 390, 844, 2)
        problems = []
        try:
            page, errors = B.open_game(ctx, base, raw_save=raw, wait_menu=False)
            page.wait_for_selector("#start:not([hidden])", timeout=10000)
            rescue = page.is_visible("#rescue")
            if old:
                data = json.loads(raw)
                if rescue:
                    problems.append("an old save opened the reset screen instead of the game")
                else:
                    coins = page.inner_text("#c-coins").replace(",", "").strip()
                    if str(data.get("coins")) != coins:
                        problems.append(f"coins changed on load: {data.get('coins')} -> {coins}")
                    stars = sum(v for v in (data.get("levels") or {}).values())
                    lv = page.inner_text("#levels-btn")
                    if stars and str(min(stars, 120)) not in lv.replace(",", ""):
                        problems.append(f"level stars not shown ({stars} expected, button says '{lv.strip()}')")
                    # play a short run on it and end it
                    B.click(page, "#play"); skip_brief(page); B.wait_state(page, "play", 8000)
                    B.steer(page, 1.2, 390, 844)
                    if B.state(page)["state"] == "play":
                        B.click(page, "#pausebtn"); B.wait_state(page, "paused", 3000); B.click(page, "#quit")
                    B.wait_state(page, "over", 8000)
                    after = json.loads(page.evaluate("k => localStorage.getItem(k)", B.SAVE_KEY))
                    if after.get("coins", -1) < data.get("coins", 0):
                        problems.append("coins went down after a run")
                    for k in ("owned", "levels", "best"):
                        if k in data and isinstance(data[k], (dict, list)):
                            for item in (data[k] if isinstance(data[k], list) else data[k].keys()):
                                if item not in (after.get(k) or []):
                                    problems.append(f"{k} lost '{item}'"); break
            else:
                if rescue:
                    problems.append("WARN:opened the 'Reset game data' screen (the player loses everything) instead of repairing the save")
                elif not page.is_visible("#play"):
                    problems.append("no Play button on the start screen")
                else:
                    B.click(page, "#play"); skip_brief(page); B.wait_state(page, ["play", "launch", "brief"], 8000)
            problems += errors
        except Exception as e:
            problems.append(f"{type(e).__name__}: {str(e).splitlines()[0][:200]}")
        ctx.close()
        hard = [p for p in problems if not p.startswith("WARN:")]
        status = "FAIL" if hard else ("WARN" if problems else "PASS")
        report(f"save: {fn}", status, "; ".join(p.replace("WARN:", "") for p in problems[:6]) if problems else ("loads, values kept, a run plays" if old else "recovers to a playable start screen"))


def frames(br, base):
    """Busy daily run at 0:40 (kept alive), 390x844 at 3x pixel ratio, CPU throttled. Measured twice:
    High graphics (JS time per frame is the gate; frame interval only catches disasters, because headless
    Chromium rasterises the canvas in software) and Low graphics (must hold about 30 fps)."""
    b = BUDGET["frame"]
    for gfx in ("high", "low"):
        name = f"frame time: daily run 0:40, {gfx} graphics, {b['cpu_throttle']}x CPU"
        ctx = B.new_context(br, 390, 844, 3)
        page, errors = B.open_game(ctx, base, save={"runs": 5, "tutDone": True, "musicOff": True, "muted": True, "coins": 0,
                                                    "set": {"gfx": gfx, "haptics": True, "motion": "auto", "gap": "normal", "hand": "center", "voice": False}})
        try:
            page.wait_for_function("() => window.__MP_ROCKS().ready", timeout=30000)
            B.click(page, "#play"); skip_brief(page); B.wait_state(page, "play", 8000)
            B.god_mode(page, True)
            B.fast_forward(page, 40 * 60, factor=12)
            B.throttle(page, b["cpu_throttle"])
            page.wait_for_timeout(500)
            st = B.frame_stats(page, b["sample_ms"])
        except Exception as e:
            ctx.close()
            report(name, "FAIL", f"{type(e).__name__}: {str(e).splitlines()[0][:200]}")
            continue
        ctx.close()
        lim = b[gfx]
        msg = (f"JS per frame p50 {st['js50']} ms, p95 {st['js95']} ms (budget {lim['js_p50_ms']} / {lim['js_p95_ms']}); "
               f"frame interval p50 {st['p50']} ms, p95 {st['p95']} ms = {st['fps']} fps (budget p95 {lim['interval_p95_ms']} ms)")
        over = st["js50"] > lim["js_p50_ms"] or st["js95"] > lim["js_p95_ms"] or st["p95"] > lim["interval_p95_ms"]
        near = st["js50"] > lim["js_p50_ms"] * 0.75 or st["js95"] > lim["js_p95_ms"] * 0.75
        report(name, "FAIL" if over else "WARN" if near else "PASS", msg + ("; " + "; ".join(errors[:3]) if errors else ""))


def memory(br, base):
    mb = BUDGET["memory"]
    ctx = B.new_context(br, 390, 844, 2)
    page, errors = B.open_game(ctx, base, save={"runs": 5, "tutDone": True, "musicOff": True, "muted": True})
    rows = []
    try:
        page.wait_for_function("() => window.__MP_ROCKS().ready", timeout=30000)
        B.god_mode(page, False)
        for k in range(mb["runs"] + 1):
            if k == 0:
                B.click(page, "#play"); skip_brief(page)
            else:
                B.click(page, "#again")
            B.wait_state(page, "play", 8000)
            B.fast_forward(page, 10 ** 9, factor=16, timeout=60000)
            B.wait_state(page, "over", 15000); page.wait_for_timeout(800)  # results ignore taps for 400 ms
            rows.append(B.heap_and_dom(page))
    except Exception as e:
        ctx.close()
        report(f"memory: {mb['runs']} runs", "FAIL", f"{type(e).__name__}: {str(e).splitlines()[0][:200]}"); return
    ctx.close()
    a, z = rows[0], rows[-1]
    dh, dn, dl = round(z["heapMB"] - a["heapMB"], 1), z["nodes"] - a["nodes"], z["listeners"] - a["listeners"]
    msg = f"after run 1: {a['heapMB']} MB heap, {a['nodes']} nodes, {a['listeners']} listeners; after run {len(rows)}: {z['heapMB']} MB, {z['nodes']} nodes, {z['listeners']} listeners"
    status = "FAIL" if dh > mb["heap_growth_mb"] or dn > mb["dom_nodes_growth"] else "WARN" if dl > 0 or dn > mb["dom_nodes_growth"] / 2 else "PASS"
    if dl > 0:
        msg += f" (event listeners grow by about {round(dl / max(1, len(rows) - 1), 1)} per run: a leak)"
    report(f"memory: {mb['runs']} runs (heap +{dh} MB, DOM nodes +{dn})", status, msg + ("; " + "; ".join(errors[:3]) if errors else ""))


def main():
    base, stop = B.serve()
    try:
        with sync_playwright() as p:
            try:
                br = p.chromium.launch()
            except Exception as e:
                report("browser: launch Chromium", "FAIL", str(e).splitlines()[0]); return
            for (w, h) in [(360, 640), (390, 844)]:
                try:
                    smoke(br, base, w, h)
                except Exception as e:
                    report(f"smoke {w}x{h}", "FAIL", traceback.format_exc(limit=2))
            saves(br, base)
            frames(br, base)
            memory(br, base)
            br.close()
            # the owner's phone is an iPhone: run the smoke test on WebKit too when it is installed
            try:
                wk = p.webkit.launch()
            except Exception:
                report("smoke on WebKit (iPhone engine)", "WARN", "WebKit is not installed, so the iPhone engine was not tested. Install once with: python3 -m playwright install webkit")
            else:
                try:
                    smoke(wk, base, 390, 844, label="WebKit ")
                finally:
                    wk.close()
    finally:
        stop()


if __name__ == "__main__":
    main()
