"""Shared Playwright helpers for the Meteor Pilot tests.

- serve(): serves the repo from a background thread on a free port (no stray server process to kill).
- open_game(): a phone-sized page with Google Fonts blocked (so tests are offline and repeatable),
  page errors collected, and an optional save loaded into localStorage before the game starts.
- god_mode() / fast_forward(): test-only helpers that wrap window.CR.step from outside the game
  (the game reads CR.step at call time), so a run can be kept alive or skipped ahead without editing index.html.
- frame_stats(): rAF frame intervals measured in the page.
"""
import functools, http.server, json, os, socket, threading, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SAVE_KEY = "cometrun:v2"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(root=ROOT):
    """Start a static server for root. Returns (base_url, stop)."""
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(_Quiet, directory=root))
    t = threading.Thread(target=httpd.serve_forever, daemon=True); t.start()
    return f"http://127.0.0.1:{port}/", lambda: (httpd.shutdown(), httpd.server_close())


def new_context(browser, w=390, h=844, dpr=3):
    return browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=True, has_touch=True,
                               service_workers="block")


def open_game(ctx, base, save=None, raw_save=None, wait_menu=True, timeout=15000):
    """Open index.html. save: dict/list/None to JSON-encode; raw_save: exact string. Returns (page, errors)."""
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e).splitlines()[0][:300]))
    page.on("console", lambda m: errors.append("console.error: " + m.text[:300]) if m.type == "error" and "ERR_FAILED" not in m.text and "net::" not in m.text else None)
    # time spent inside requestAnimationFrame callbacks (the game's whole frame: rules + drawing calls)
    page.add_init_script("""(() => { const raf = window.requestAnimationFrame.bind(window); window.__mpCost = [];
      window.requestAnimationFrame = cb => raf(t => { const s = performance.now(); try { cb(t); } finally { const c = window.__mpCost; c.push(performance.now() - s); if (c.length > 4000) c.splice(0, 2000); } }); })();""")
    page.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    page.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    if save is not None or raw_save is not None:
        value = raw_save if raw_save is not None else json.dumps(save)
        # runs before any page script, every navigation of this page; the marker makes it apply once per page
        page.add_init_script("""(() => { try { if (!sessionStorage.getItem('__mp_seeded')) { localStorage.setItem(%s, %s); sessionStorage.setItem('__mp_seeded', '1'); } } catch (e) {} })();"""
                             % (json.dumps(SAVE_KEY), json.dumps(value)))
    page.goto(base + "index.html")
    if wait_menu:
        page.wait_for_function("() => window.__MP_STATE && document.querySelector('#start') && !document.querySelector('#start').hidden", timeout=timeout)
    return page, errors


def state(page):
    return page.evaluate("() => window.__MP_STATE ? window.__MP_STATE() : null")


def wait_state(page, states, timeout=8000):
    if isinstance(states, str):
        states = [states]
    page.wait_for_function("(s) => window.__MP_STATE && s.includes(window.__MP_STATE().state)", arg=states, timeout=timeout)


def click(page, sel, timeout=4000):
    page.wait_for_selector(sel, state="visible", timeout=timeout)
    page.click(sel, force=True)  # several buttons pulse forever, so they never count as "stable"


def god_mode(page, on=True):
    """Keep the ship alive (shields refilled before every tick). Test-only; wraps window.CR.step from outside."""
    page.evaluate("""(on) => {
      const CR = window.CR;
      if (!CR.__origStep) CR.__origStep = CR.step;
      window.__mpGod = on;
      if (!CR.__wrapped) {
        CR.__wrapped = true;
        CR.step = function (world, r, x, s, y) {
          if (window.__mpGod && r && r.alive && r.lives < r.cfg.lives) r.lives = r.cfg.lives;
          let ev = CR.__origStep.call(this, world, r, x, s, y);
          for (let k = 1; k < (window.__mpFF || 1) && r && r.alive; k++) ev = CR.__origStep.call(this, world, r, x, s, y);
          return ev;
        };
      }
    }""", on)


def fast_forward(page, to_tick, factor=12, timeout=120000):
    """Run the simulation `factor` ticks per game tick until the run reaches to_tick (needs god_mode first)."""
    page.evaluate("(f) => { window.__mpFF = f; }", factor)
    try:
        page.wait_for_function("(t) => window.__MP_STATE().t >= t || !['play','countdown'].includes(window.__MP_STATE().state)", arg=to_tick, timeout=timeout, polling=100)
    finally:
        page.evaluate("() => { window.__mpFF = 1; }")


def steer(page, seconds, w, h):
    """Drag the ship around the lower half of the stage with mouse moves for `seconds`."""
    box = page.evaluate("() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }")
    x0, y0, bw, bh = box
    t0 = time.time(); k = 0
    while time.time() - t0 < seconds:
        k += 1
        x = x0 + bw * (0.5 + 0.35 * __import__("math").sin(k * 0.35))
        y = y0 + bh * (0.80 + 0.06 * __import__("math").cos(k * 0.21))
        page.mouse.move(x, y)
        page.wait_for_timeout(50)


FRAME_JS = """(ms) => new Promise(res => {
  const out = []; let last = performance.now(); const end = last + ms;
  let longTasks = 0;
  try { new PerformanceObserver(l => { longTasks += l.getEntries().length; }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
  function f(now) { out.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res({ frames: out, longTasks }); }
  requestAnimationFrame(f);
})"""


def frame_stats(page, ms=3000):
    page.evaluate("() => { window.__mpCost.length = 0; }")
    r = page.evaluate(FRAME_JS, ms)
    cost = sorted(page.evaluate("() => window.__mpCost.slice()")) or [0]
    f = sorted(r["frames"][2:]) or [0]
    n = len(f)
    pct = lambda p: round(f[min(n - 1, int(p * n))], 1)
    return {"frames": n, "fps": round(1000 * n / max(1, sum(f)), 1), "p50": pct(0.5), "p95": pct(0.95), "p99": pct(0.99),
            "max": round(f[-1], 1), "js50": round(cost[len(cost) // 2], 1), "js95": round(cost[min(len(cost) - 1, int(0.95 * len(cost)))], 1), "over33": sum(1 for x in f if x > 33.4), "over50": sum(1 for x in f if x > 50), "longTasks": r["longTasks"]}


def throttle(page, rate):
    cdp = page.context.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": rate})
    return cdp


def heap_and_dom(page):
    cdp = page.context.new_cdp_session(page)
    try:
        cdp.send("HeapProfiler.collectGarbage")
    except Exception:
        pass
    m = cdp.send("Performance.enable") or {}
    metrics = {x["name"]: x["value"] for x in cdp.send("Performance.getMetrics")["metrics"]}
    cdp.detach()
    return {"heapMB": round(metrics.get("JSHeapUsedSize", 0) / 1048576, 1), "nodes": int(metrics.get("Nodes", 0)),
            "listeners": int(metrics.get("JSEventListeners", 0)), "docs": int(metrics.get("Documents", 0))}


def no_sideways_scroll(page):
    """Returns a list of problems: the page or a visible overlay wider than the screen."""
    return page.evaluate("""() => {
      const bad = [], vw = document.documentElement.clientWidth;
      const se = document.scrollingElement;
      if (se.scrollWidth > vw + 1) bad.push('page scrolls sideways: ' + se.scrollWidth + 'px content in ' + vw + 'px');
      for (const el of document.querySelectorAll('.overlay, .top, .foot')) {
        if (el.hidden || !el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) bad.push('#' + (el.id || el.className) + ' sticks out of the screen (' + Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + vw + ')');
        if (el.scrollWidth > el.clientWidth + 2) bad.push('#' + (el.id || el.className) + ' content wider than its box (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
      }
      return bad;
    }""")
