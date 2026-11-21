#!/usr/bin/env python3
"""Store-build checks for Meteor Pilot (mobile/).

    python3 mobile/test_build.py                 # build www/, static checks, then the game in Chromium with Capacitor stubbed
    python3 mobile/test_build.py --static-only   # no browser (used by the Codemagic cloud build)

Static: www/ has no external font URLs, no service worker registration, no sw.js or web manifest; native.js is
injected before the game; the game section is byte-identical to ../index.html; fonts are local files; the app ID
matches in capacitor.config.json and codemagic.yaml; patch-native.mjs works (and is idempotent) on template fixtures.
Browser: the store build loads with no page errors and no requests to other hosts, with a stubbed window.Capacitor.
Back button, pause on app switch, haptics, keep-awake, share/clipboard link rewriting, the hidden Store tab and the
save backup / restore are exercised through the stub.
Exit code 0 when nothing FAILs. WARN lines are things to fix but not blockers (e.g. fonts not installed here).
"""
import json, os, re, shutil, subprocess, sys, tempfile, time

MOBILE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(MOBILE)
WWW = os.path.join(MOBILE, "www")
STATIC_ONLY = "--static-only" in sys.argv
results = []


def report(name, status, detail=""):
    results.append((name, status, detail))
    print(f"{status:4}  {name}" + (f"  ({detail})" if detail else ""), flush=True)


def check(name, ok, detail="", warn=False):
    report(name, "PASS" if ok else ("WARN" if warn else "FAIL"), "" if ok else detail)
    return ok


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------- build
fonts_installed = os.path.isdir(os.path.join(MOBILE, "node_modules", "@fontsource"))
cmd = ["node", os.path.join(MOBILE, "scripts", "build-www.mjs")] + ([] if fonts_installed else ["--allow-missing-fonts"])
r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stdout.strip())
if r.returncode != 0:
    print(r.stderr)
    report("build-www.mjs runs", "FAIL", r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "exit %d" % r.returncode)
    sys.exit(1)
report("build-www.mjs runs", "PASS")
if not fonts_installed:
    report("font packages installed", "WARN", "node_modules/@fontsource missing (npm install not possible here); the cloud build installs them and fails without them")

# ---------------------------------------------------------------- static checks
src = read(os.path.join(ROOT, "index.html"))
out = read(os.path.join(WWW, "index.html"))


def game_block(t):
    a, b = t.find("<!-- GAME:START -->"), t.find("<!-- GAME:END -->")
    return t[a:b + len("<!-- GAME:END -->")] if a >= 0 and b > a else None


check("game section is byte-identical to ../index.html", game_block(src) is not None and game_block(src) == game_block(out))

ext_fonts = []
for dp, _, files in os.walk(WWW):
    for fn in files:
        if fn.endswith((".html", ".css", ".js", ".json")):
            t = read(os.path.join(dp, fn))
            for m in re.finditer(r"fonts\.(googleapis|gstatic)\.com", t):
                ext_fonts.append(os.path.relpath(os.path.join(dp, fn), WWW))
check("www/ has no external font URLs", not ext_fonts, ", ".join(sorted(set(ext_fonts))))

shell = out.replace(game_block(out) or "", "")
check("no service worker registration in the app shell", not re.search(r"serviceWorker\s*\.\s*register", shell))
check("sw.js and the web manifest are not in www/", not os.path.exists(os.path.join(WWW, "sw.js")) and not os.path.exists(os.path.join(WWW, "manifest.webmanifest")) and "manifest.webmanifest" not in shell)

tag = out.find('<script src="native.js"></script>')
check("native.js is injected in <head> before the game", 0 <= tag < out.find("</head>") < out.find("<!-- GAME:START -->"))
bridge = read(os.path.join(WWW, "native.js"))
check("native.js has the web URL filled in", "__WEB_URL__" not in bridge and "https://jimsky90.github.io/meteor-pilot/" in bridge)
r = subprocess.run(["node", "--check", os.path.join(WWW, "native.js")], capture_output=True, text=True)
check("native.js parses", r.returncode == 0, r.stderr.strip()[:200])
check("native.js is not loaded by the web game", "native.js" not in src)

css = read(os.path.join(WWW, "fonts", "fonts.css"))
urls = re.findall(r'url\("([^"]+)"\)', css)
check("fonts.css uses only local files", urls and all(not re.match(r"^[a-z]+:", u) for u in urls), str(urls))
missing = [u for u in urls if not os.path.exists(os.path.join(WWW, "fonts", u))]
fams = set(re.findall(r'font-family: "([^"]+)"', css))
check("fonts.css covers Chakra Petch and Atkinson Hyperlegible", {"Chakra Petch", "Atkinson Hyperlegible"} <= fams, str(fams))
check("font files are bundled", not missing, f"{len(missing)} of {len(urls)} .woff2 files missing", warn=not fonts_installed)
check("index.html links the local fonts.css", 'href="fonts/fonts.css"' in out)

r = subprocess.run(["node", os.path.join(MOBILE, "scripts", "check-config.mjs")], capture_output=True, text=True)
check("app ID matches in capacitor.config.json and codemagic.yaml", r.returncode == 0, (r.stderr or r.stdout).strip()[:300])
pkg = json.loads(read(os.path.join(MOBILE, "package.json")))
check("owner has confirmed the app ID", pkg.get("meteorPilot", {}).get("appIdConfirmed") is True,
      "appIdConfirmed is false: the cloud build refuses to run until the owner confirms it", warn=True)

tmp = tempfile.mkdtemp()
try:
    shutil.copytree(os.path.join(MOBILE, "test", "fixtures"), tmp, dirs_exist_ok=True)
    shutil.copy(os.path.join(MOBILE, "package.json"), tmp)
    env = dict(os.environ, VERSION_CODE="42", VERSION_NAME="1.2.3")
    ok = True
    for _ in range(2):  # twice: must be idempotent
        for plat in ("android", "ios"):
            r = subprocess.run(["node", os.path.join(MOBILE, "scripts", "patch-native.mjs"), plat, "--dir", tmp], capture_output=True, text=True, env=env)
            ok = ok and r.returncode == 0
    g = read(os.path.join(tmp, "android/app/build.gradle"))
    mf = read(os.path.join(tmp, "android/app/src/main/AndroidManifest.xml"))
    pl = read(os.path.join(tmp, "ios/App/App/Info.plist"))
    px = read(os.path.join(tmp, "ios/App/App.xcodeproj/project.pbxproj"))
    import plistlib
    pd = plistlib.loads(pl.encode())
    ok = ok and "versionCode 42" in g and 'versionName "1.2.3"' in g and g.count("signingConfigs {") == 1 and g.count("signingConfig signingConfigs.release") == 1
    ok = ok and mf.count('android:screenOrientation="portrait"') == 1
    ok = ok and pd["UISupportedInterfaceOrientations"] == ["UIInterfaceOrientationPortrait"] and pd["ITSAppUsesNonExemptEncryption"] is False and pd["UIStatusBarHidden"] is True
    ok = ok and "CURRENT_PROJECT_VERSION = 42;" in px and "MARKETING_VERSION = 1.2.3;" in px and (("TARGETED_DEVICE_FAMILY = 1;" in px) if pkg["meteorPilot"].get("iPhoneOnly") else ('TARGETED_DEVICE_FAMILY = "1,2";' in px))
    check("patch-native.mjs sets portrait, versions, signing and plist keys (template fixtures, twice)", ok, (r.stderr or "").strip()[:200])
finally:
    shutil.rmtree(tmp, ignore_errors=True)

gi = read(os.path.join(MOBILE, ".gitignore"))
check("mobile/.gitignore keeps out node_modules, www, native projects and keys",
      all(x in gi for x in ("node_modules/", "/www/", "/android/", "/ios/", "*.jks", "*.p8")))
try:
    tracked = subprocess.run(["git", "ls-files", "--", "mobile", "codemagic.yaml"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    bad = [t for t in tracked if re.search(r"(node_modules/|^mobile/(www|android|ios|build)/|\.(jks|keystore|p12|p8|mobileprovision|aab|apk|ipa)$)", t)]
    check("no build output or keys committed", not bad, ", ".join(bad))
    ycm = read(os.path.join(ROOT, "codemagic.yaml"))
    check("codemagic.yaml holds no secrets", not re.search(r"(BEGIN [A-Z ]*PRIVATE KEY|\"private_key\"|password\s*:\s*\S)", ycm, re.I))
except FileNotFoundError:
    pass

# ---------------------------------------------------------------- browser
STUB = r"""
(() => {
  const calls = window.__capCalls = [];
  const listeners = {};
  let prefs = {};
  try { prefs = JSON.parse(sessionStorage.getItem('__stubPrefs') || 'null') || (%SEED%); } catch (e) { prefs = %SEED%; }
  const savePrefs = () => { try { sessionStorage.setItem('__stubPrefs', JSON.stringify(prefs)); } catch (e) {} };
  savePrefs();
  const rec = (p, m, a) => calls.push([p, m, a === undefined ? null : JSON.parse(JSON.stringify(a))]);
  const impl = {
    App: { addListener: (ev, fn) => { listeners[ev] = fn; return Promise.resolve({ remove() {} }); } },
    Preferences: {
      get: ({ key }) => Promise.resolve({ value: key in prefs ? prefs[key] : null }),
      set: ({ key, value }) => { prefs[key] = value; savePrefs(); return Promise.resolve(); },
      remove: ({ key }) => { delete prefs[key]; savePrefs(); return Promise.resolve(); }
    }
  };
  const mk = name => new Proxy({}, { get(_, m) {
    if (m === 'then' || typeof m !== 'string') return undefined;
    return (a, b) => { rec(name, m, typeof a === 'function' ? null : a); const f = impl[name] && impl[name][m]; return f ? f(a, b) : Promise.resolve(); };
  } });
  const Plugins = {};
  ['App', 'Haptics', 'Preferences', 'Share', 'Clipboard', 'Browser', 'StatusBar', 'KeepAwake', 'SplashScreen'].forEach(n => Plugins[n] = mk(n));
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins, registerPlugin: n => Plugins[n] || (Plugins[n] = mk(n)) };
  window.__capFire = (ev, data) => listeners[ev] ? (listeners[ev](data), true) : false;
  window.__capPrefs = () => prefs;
})();
"""


def browser_tests():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        report("browser tests", "WARN", "Playwright not installed")
        return
    sys.path.insert(0, os.path.join(ROOT, "tools", "test", "lib"))
    import browser as B
    base, stop = B.serve(WWW)
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()

            def page_with(seed=None, local_save=None):
                ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
                pg = ctx.new_page()
                errors, foreign = [], []
                pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e).splitlines()[0][:300]))
                pg.on("console", lambda m: errors.append("console.error: " + m.text[:300]) if m.type == "error" and not m.text.startswith("Failed to load resource") else None)
                pg.on("response", lambda rs: errors.append(f"HTTP {rs.status}: {rs.url[len(base):]}") if rs.status >= 400 and rs.url.startswith(base)
                      and not (not fonts_installed and rs.url.endswith(".woff2")) else None)
                pg.on("request", lambda rq: foreign.append(rq.url) if not rq.url.startswith(base) and not rq.url.startswith("data:") and not rq.url.startswith("blob:") else None)
                pg.route(re.compile(r"^(?!" + re.escape(base) + r"|data:|blob:).*"), lambda r: r.abort())
                pg.add_init_script(STUB.replace("%SEED%", json.dumps(seed or {})))
                if local_save is not None:
                    pg.add_init_script("try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem('cometrun:v2', %s); sessionStorage.setItem('__seeded', '1'); } } catch (e) {}" % json.dumps(local_save))
                pg.goto(base + "index.html")
                pg.wait_for_function("() => window.__MP_STATE && document.querySelector('#start') && !document.querySelector('#start').hidden", timeout=20000)
                return ctx, pg, errors, foreign

            calls = lambda pg, plugin, method=None: pg.evaluate("([p, m]) => window.__capCalls.filter(c => c[0] === p && (!m || c[1] === m))", [plugin, method])
            st = lambda pg: B.state(pg)["state"]

            ctx, pg, errors, foreign = page_with()
            check("store build loads to the menu with the bridge active", pg.evaluate("() => !!(window.MP_NATIVE && MP_NATIVE.platform === 'android' && MP_NATIVE.webUrl)"))
            regs = pg.evaluate("() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r => r.length) : 0")
            check("no service worker registered", regs == 0, f"{regs} registrations")
            fonts_ok = pg.evaluate("""async () => { await document.fonts.ready; await new Promise(r => setTimeout(r, 300));
              return ['500 16px "Chakra Petch"', '700 16px "Chakra Petch"', '400 16px "Atkinson Hyperlegible"', '700 16px "Atkinson Hyperlegible"']
                .map(f => { try { return document.fonts.check(f) && [...document.fonts].some(ff => ff.family.replace(/"/g, '') === f.split('"')[1] && ff.status === 'loaded'); } catch (e) { return false; } }); }""")
            check("bundled fonts load from the app", all(fonts_ok), f"loaded: {fonts_ok}", warn=not fonts_installed)
            check("status bar hidden at start", bool(calls(pg, "StatusBar", "hide")))

            # Store tab hidden (F3)
            B.click(pg, "#shop-btn"); pg.wait_for_selector("#shop:not([hidden])")
            check("Store tab (test checkout) is hidden in the store build",
                  not pg.is_visible('#shop [data-st="store"]') and pg.is_visible('#shop [data-st="paints"]') and not pg.is_visible("#shop [data-pay]"))
            # back button closes the overlay
            pg.evaluate("() => __capFire('backButton', { canGoBack: false })"); pg.wait_for_timeout(250)
            check("back button closes an open screen (Shop)", pg.is_hidden("#shop") and st(pg) == "menu")

            # back on the menu: ask, then exit
            pg.evaluate("() => __capFire('backButton', { canGoBack: false })"); pg.wait_for_timeout(200)
            asked = pg.evaluate("() => { const t = document.querySelector('#mp-native-toast'); return !!(t && !t.hidden && /back again/i.test(t.textContent)); }")
            no_exit_yet = not calls(pg, "App", "exitApp")
            pg.evaluate("() => __capFire('backButton', { canGoBack: false })"); pg.wait_for_timeout(300)
            check("back on the menu asks first, then exits on a second press", asked and no_exit_yet and bool(calls(pg, "App", "exitApp")))

            # haptics, share and clipboard
            pg.evaluate("() => navigator.vibrate([30, 40, 10])"); pg.wait_for_timeout(200)
            imp = [c[2]["style"] for c in calls(pg, "Haptics", "impact")]
            check("navigator.vibrate becomes native haptics", imp == ["MEDIUM", "LIGHT"], str(imp))
            pg.evaluate("() => navigator.share({ title: 'Meteor Pilot challenge', text: 'Beat me', url: 'https://localhost/#c=abc123' })")
            pg.evaluate("() => navigator.clipboard.writeText('Beat me\\ncapacitor://localhost/index.html#c=xyz')")
            sh = calls(pg, "Share", "share"); cl = calls(pg, "Clipboard", "write")
            check("challenge links are shared with the https web address",
                  sh and sh[-1][2]["url"] == "https://jimsky90.github.io/meteor-pilot/#c=abc123"
                  and cl and cl[-1][2]["string"].endswith("https://jimsky90.github.io/meteor-pilot/#c=xyz"), f"share={sh[-1:]}, clipboard={cl[-1:]}")

            # a run: back during the briefing, keep-awake, back pauses, back resumes, app switch pauses
            B.click(pg, "#play"); pg.wait_for_timeout(400)
            if st(pg) == "brief":
                pg.evaluate("() => __capFire('backButton', { canGoBack: false })")
            B.wait_state(pg, "play", 10000)
            B.steer(pg, 1.5, 390, 844)
            check("keep-awake is on during a run", bool(calls(pg, "KeepAwake", "keepAwake")))
            pg.evaluate("() => __capFire('backButton', { canGoBack: false })"); pg.wait_for_timeout(250)
            check("back during a run pauses", st(pg) == "paused", st(pg))
            pg.evaluate("() => __capFire('backButton', { canGoBack: false })"); pg.wait_for_timeout(250)
            check("back on the pause screen resumes", st(pg) in ("countdown", "play"), st(pg))
            B.wait_state(pg, "play", 5000)
            pg.evaluate("() => __capFire('appStateChange', { isActive: false })"); pg.wait_for_timeout(250)
            check("leaving the app pauses the run", st(pg) == "paused", st(pg))
            check("leaving the app lets the screen sleep", bool(calls(pg, "KeepAwake", "allowSleep")))
            pg.evaluate("() => __capFire('appStateChange', { isActive: true })")
            B.click(pg, "#quit"); B.wait_state(pg, "over", 8000); pg.wait_for_timeout(1500)

            # save mirrored to native storage
            local = pg.evaluate("() => localStorage.getItem('cometrun:v2')")
            mirrored = pg.evaluate("() => __capPrefs()['cometrun:v2'] || null")
            check("save is backed up to native storage (Preferences)", local and mirrored == local, "mirror differs from localStorage")

            # game hooks win when present (MOBILE-GAME-CHANGES M4)
            pg.evaluate("() => { window.__MP_APP = { back: () => { window.__hookBack = (window.__hookBack || 0) + 1; return true; } }; __capFire('backButton', {}); delete window.__MP_APP; }")
            check("bridge uses the game's __MP_APP.back hook when it exists", pg.evaluate("() => window.__hookBack === 1"))

            check("no page or console errors in the store build", not errors, "; ".join(errors[:5]))
            check("no requests to other hosts (works offline)", not foreign, ", ".join(sorted(set(foreign))[:5]))
            ctx.close()

            # restore: empty local storage, save in native storage -> restored after one reload
            fixture = read(os.path.join(ROOT, "tools", "test", "fixtures", "save-v45.json"))
            ctx, pg, errors, foreign = page_with(seed={"cometrun:v2": fixture})
            pg.wait_for_timeout(1500)
            pg.wait_for_function("() => window.__MP_STATE && !document.querySelector('#start').hidden", timeout=20000)
            got = pg.evaluate("() => localStorage.getItem('cometrun:v2')")
            want_coins = json.loads(fixture).get("coins")
            got_coins = json.loads(got).get("coins") if got else None
            check("an emptied local storage is restored from native storage", got and got_coins == want_coins and pg.evaluate("() => sessionStorage.getItem('mp-restored') === '1'"),
                  f"coins {got_coins} vs {want_coins}")
            pg.wait_for_timeout(1200)
            check("restored save stays backed up", pg.evaluate("() => __capPrefs()['cometrun:v2'] === localStorage.getItem('cometrun:v2')"))
            check("no page errors during restore", not errors, "; ".join(errors[:5]))
            ctx.close()

            # fresh install: nothing anywhere -> no reload loop, new save gets mirrored
            ctx, pg, errors, foreign = page_with()
            pg.wait_for_timeout(1500)
            check("fresh install starts normally (no restore, no reload loop)", pg.evaluate("() => sessionStorage.getItem('mp-restored') === null") and not errors, "; ".join(errors[:3]))
            ctx.close()

            # the web game without Capacitor: the bridge stays out of the way
            ctx = br.new_context(viewport={"width": 390, "height": 844})
            pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.route(re.compile(r"^(?!" + re.escape(base) + r"|data:|blob:).*"), lambda r: r.abort())
            pg.goto(base + "index.html")
            pg.wait_for_function("() => window.__MP_STATE && !document.querySelector('#start').hidden", timeout=20000)
            B.click(pg, "#shop-btn"); pg.wait_for_selector("#shop:not([hidden])")
            check("in a plain browser the bridge does nothing (no MP_NATIVE, Store tab shown)",
                  pg.evaluate("() => !window.MP_NATIVE") and pg.is_visible('#shop [data-st="store"]') and not errs, "; ".join(errs[:3]))
            ctx.close()
            br.close()
    except Exception as e:  # a crash in the harness is a failure, with the reason
        import traceback
        report("browser tests", "FAIL", traceback.format_exc().strip().splitlines()[-1][:300])
    finally:
        stop()


if not STATIC_ONLY:
    browser_tests()

fails = [r for r in results if r[1] == "FAIL"]
warns = [r for r in results if r[1] == "WARN"]
print(f"\n{'FAIL' if fails else 'PASS'}: {len(results) - len(fails) - len(warns)} passed, {len(warns)} warnings, {len(fails)} failed")
sys.exit(1 if fails else 0)
