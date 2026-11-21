# Meteor Pilot: technical direction (v53, 2026-11-20)

Written by the Technical Director for the owner (plain English) and for the daily engineer (exact detail).
Everything below was measured on v53 (`index.html`, 442.1 KB). The test suite that goes with it lives in `tools/test/`.

## Summary

1. **The codebase is in decent health for a one-file game.** The rules engine (`window.CR`) is clean, deterministic and replays exactly; old and damaged saves load; every screen works at 360 and 390 px wide with no page errors.
2. **Biggest launch risk: one error freezes the game for good.** The game loop has no error guard. A single bug in a new feature stops the screen, and Pause and Resume stop working too (shown in testing). This must be fixed before the store build.
3. **Biggest phone risk: drawing at 3× pixel density.** Game code takes under 1 ms per frame, but filling a 3× canvas is the bottleneck. On a 4× slowed CPU, High graphics drops to 11–12 fps, while the same scene at 2× runs at 26–30 fps and Low runs at 57–60 fps.
4. **Store blockers to fix first:** the test checkout in the Store tab, challenge links that break inside the app, Google Fonts loaded from the internet, no Android back button handling, and saves that have no backup.
5. **Size:** at today's growth (about 6 KB per version), the file passes 700 KB around v95–v97. With the trim plan below it ends near 620 KB at v100.

---

## 1. Engineering standards (the daily engineer follows these every round from now on)

### 1.1 The one command

```
python3 tools/test/run_all.py
```

- It must end with **`PASS`** (exit code 0) **before every publish**. A `FAIL` blocks the publish. Read every `WARN` and fix it when you can.
- It takes about 2 minutes. While you are coding, `python3 tools/test/run_all.py --quick` runs only the static and rules checks (about 20 s, no browser).
- Results are also saved to `tools/test/out/summary.json`. Screenshots of failed smoke tests go to `tools/test/out/fail-*.png`. The `out/` folder is not committed.
- When you change drawing code, also run `python3 tools/test/perf_profile.py --quick` (about 5 minutes) and compare it with the numbers in section 3.
- WebKit (the iPhone engine) is tested automatically once it is installed: `python3 -m playwright install webkit`. Until then the suite prints a WARN.

What the suite checks:

| Part | Checks |
|---|---|
| static (`static_checks.py`) | File size and growth this round. GAME markers present. No external scripts. `window.CR` has no `Math.random`, `Date`, `performance.now`, DOM or timers. The save key is still only `cometrun:v2`. Only allowed outside hosts. Every inline script and `sw.js` parses (`node --check`). CSS braces balance. Manifest and icons exist. The `sw.js` cache version matches the game version. No crypto or gambling leftovers. Unused CSS classes. |
| rules (`rules_test.js`, Node) | Loads the real `CR` and `makeLevels` out of `index.html`, so nothing can go stale. Same seed gives the same world, ghost and bot run in two separate VMs (10 seeds). Recorded bot runs replay through `CR.replay` to identical score, time, stars and golds (10 seeds). Nothing random or clock-based is called. Daily missions are deterministic. A bot clears every mission type (all 13 types over 40 levels). Gate gaps are not filled by a rock that arrives with the wall. |
| browser (`browser_test.py`, Playwright Chromium) | Smoke at 360×640 and 390×844: menu, play, a run, pause and resume, end run, results, Levels and a level brief, every Shop tab, every Hangar tab, Settings (Graphics Low then High), Trophies, back to the menu. Fails on any page error, console error or sideways scroll. Saves: fixtures from v17, v25 and v45 load with coins, stars, ships and levels kept, and a run plays on each. 5 corrupted saves still reach a playable start screen. Frame time at 4× CPU (High and Low). Memory over 5 runs. |

### 1.2 Budgets (in `tools/test/budgets.json`; change only with the owner's OK)

| Budget | Limit | v53 today |
|---|---|---|
| `index.html` size | **700 KB hard stop**, warning from 600 KB | 442.1 KB (63%) |
| Growth per round | warning above **6 KB**, fail above 20 KB | +5.2 KB (v52 to v53) |
| JS time per frame (daily run at 0:40, 4× CPU) | p50 ≤ **4 ms**, p95 ≤ **16 ms** | High 0.8 / 6.9 ms, Low 0.4 / 3.8 ms |
| Low graphics frame interval (4× CPU) | p95 ≤ **50 ms** (holds about 30 fps or better) | 33 ms (57 fps) |
| High graphics frame interval (4× CPU) | p95 ≤ 250 ms (catches disasters only; see note) | 150 ms |
| Memory over 5 runs | heap growth ≤ **3 MB**, DOM nodes ≤ **+250**, event listeners: no growth (warning) | +0.3 MB, +78 nodes, +4 listeners per run |

Note on frame interval: headless Chromium fills the canvas with a software renderer, so interval numbers are worse than on a phone. JS time per frame is the reliable gate. After finding F2 is fixed, tighten the High interval budget to 80 ms.

### 1.3 Code rules

**Rules engine (`window.CR`, first script)**
1. No `Math.random`, `Date`, `performance.now`, DOM, timers or storage. All randomness comes from `mulberry32(hashStr(seed))`. The suite enforces this.
2. If a change makes an existing course play differently (spawns, speeds, hit sizes), bump `PB_VER` (race your best) and `CH_FMT` (challenge links) in the same round. Old recordings must never replay wrong.
3. Never put state on the module. Everything belongs on the `world` or the runner. The suite replays twice on one world object to catch drift.

**Saves**
4. The key `cometrun:v2` never changes. Every new save field gets a default and a type repair in the save block (next to `isObj` and the other repairs), never just `save.x = save.x || ...`.
5. When the save shape changes, add a fixture: save a real save from the new version as `tools/test/fixtures/save-vNN.json`. Never delete old fixtures.
6. Never erase a save without first copying it to a backup key (see F5).

**Drawing and frame loop**
7. Draw code makes no new objects per frame: no `createLinearGradient` or `createRadialGradient` (cache by color, like `glowSprite` and `bloomSprite` do), no `document.createElement("canvas")`, no new arrays in loops over meteors.
8. No `shadowBlur` in anything drawn every frame. Pre-render the glow into a sprite once.
9. Respect `lowGfx()` and `calm()` in every new effect. Low graphics must stay at 30 fps or better at 4× CPU (the suite measures this).
10. Every new full-screen layer (veil, tint, wash) costs a whole-screen fill at up to 3× density. Add one only if it replaces another.

**DOM, timers, listeners**
11. Overlays render with `innerHTML` and `el.onclick = ...` (property handlers, replaced on each render). Don't call `addEventListener` on `window`, `document` or `#stage` outside start-up code.
12. Every `setTimeout` callback checks `state` before acting, because the player may have left the screen. Store the timer id when it can fire twice (like `launchTimer` and `guardOver.h`).
13. Every new screen must pass the no-sideways-scroll check at 360 px. The smoke test opens every tab, but a brand-new overlay needs its own step in `browser_test.py`.

**Size and comments**
14. Comments say *why*, in one line. No version-history comments like "v38 (mission plan 5): ..." in new code, because git keeps the history.
15. The in-game `CHANGELOG` keeps only the newest 3 entries. Older entries move to `docs/CHANGELOG.md`.
16. Every round bumps `sw.js` `VERSION` to the game version (the suite fails if they differ).

**Errors**
17. New feature code that can throw (parsing, storage, audio, speech, WebGL) sits in `try/catch` and falls back quietly. After F1 lands, the frame loop catches the rest.

---

## 2. Findings, worst first

Sizes: **S** is one round or less (under 2 KB of code). **M** is one or two rounds.

### F1. One error freezes the game permanently. Severity: Critical. Size S
**Evidence:** `frame()` (end of the app script) calls `tick()`, `draw()`, `radioUpdate()` and the rest with no `try`, and `requestAnimationFrame(frame)` is its **last** line. Any exception means the next frame is never scheduled. In testing, one injected error during a run left the screen frozen, and Pause, then Resume, never returned to play (the 3-2-1 countdown runs inside `frame()`). There is no `window.onerror` either, so nobody learns about it.
**Fix:**
```js
let frameErrs = 0;
function frame(now) {
  requestAnimationFrame(frame);           /* schedule first, so the loop always survives */
  try { frameBody(now); frameErrs = 0; }  /* frameBody = the current body of frame() */
  catch (e) {
    diag(e);
    if (++frameErrs === 3 && me && (state === "play" || state === "countdown")) {
      try { me.alive = false; state = "dying"; gameOver(); } catch (_) { state = "menu"; showStart(); }
      toast("Something went wrong. Your run was saved.");
    }
  }
}
/* keep the last 20 errors on this device for bug reports (a separate key, never the save) */
function diag(e) { try { const k = "cometrun:diag", a = JSON.parse(localStorage.getItem(k) || "[]");
  a.push({ v: CHANGELOG[0].v, t: Date.now(), m: String(e && e.stack || e).slice(0, 400) }); localStorage.setItem(k, JSON.stringify(a.slice(-20))); } catch (_) {} }
addEventListener("error", e => diag(e.error || e.message));
addEventListener("unhandledrejection", e => diag(e.reason));
```
Add a "Copy error report" button in Settings when `cometrun:diag` has entries. (`cometrun:diag` is a new key. The save key `cometrun:v2` is untouched. The static check already allows exactly `cometrun:v2`, `cometrun:v2:bak` and `cometrun:diag`.)

### F2. Drawing at 3× pixel density limits the frame rate. Severity: High. Size M
**Evidence:** 390×844 at 3×, frames per second:

| CPU | Scenario | High @3× | High @2× | High @1× | Low |
|---|---|---|---|---|---|
| 1× | daily 0:40 / boss | 58 / 51 | | | 60 / 60 |
| 4× | menu | 14 | 39 | 60 | 60 |
| 4× | daily 0:40 / boss | **12 / 11** | 31 / 26 | 60 / 56 | 57 / 58 |
| 6× | daily 0:40 / boss | **7 / 7** | | | 43 / 40 |
| 4× | blackout (L18) | 31 | 58 | 60 | 59 |

- JS time per frame is only 0.3–0.9 ms (p50). A CPU profile of the boss fight shows 99% of main-thread time in native canvas work, not game code.
- Blackout is fast because it paints the background only inside the lamp, which proves the cost is filling pixels.
- `resize()` uses `dpr = min(lowGfx() ? 1.5 : 3, devicePixelRatio)`, so iPhones (3×) fill about 2.1 million pixels per layer.
- Per-frame cost also comes from about 10 per-frame `shadowBlur` uses, two new gradients per meteor per frame in `M3.draw`, a new radial gradient per frame for event tints, and full theme scenes (`SCENES[th.scene]` plus `th.over`) redrawn every frame. Audit item 8 (offscreen background) is still open.
**Fix, in this order:**
1. Cap High at 2×: `dpr = Math.min(lowGfx() ? 1.5 : 2, devicePixelRatio || 1)`. On a phone, 2× is visually near 3× for a moving game, and this is the single biggest win (+150% fps in the table).
2. Auto quality: during the first 3 s of each run, track the frame interval. If the 90th percentile is above 22 ms, drop the density by 0.5 (not below 1.25) for the session, without changing the saved setting. This saves an automatic "Low" for weak phones.
3. Draw the theme background into an offscreen canvas at 1× and refresh it every 2nd frame. Draw it to the screen with one `drawImage` (camera lean still applies to the `drawImage`).
4. Replace the per-frame `shadowBlur` uses (lines with `shadowBlur = 10..22` in `drawStar`, `drawPower`, `drawMeteor`, `drawMothership`, `drawCores`, trails and the intro) with cached glow sprites, the way `glowSprite()` already works.
5. Cache the meteor heat-trail and glow gradients per (theme color, radius bucket) in an offscreen sprite.

### F3. Store tab: a free "test checkout" and no restore. Severity: High (rejection). Size S
**Evidence:** Shop tab `store` shows "Test checkout". `completePurchase()` grants the paid packs when `window.COMET_PAYMENTS` is missing. Apple rejects demo or test purchase flows (Guideline 2.1) and digital goods outside StoreKit (3.1.1), and non-consumables need a **Restore Purchases** button. Google Play requires Play Billing for digital goods.
**Fix:** `const STORE_BUILD = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());`. When `STORE_BUILD && !window.COMET_PAYMENTS`, leave `store` out of the Shop tabs list. When payments exist, add a "Restore purchases" button that calls `COMET_PAYMENTS.restore()` and grants the returned ids (the contract is in `store/LAUNCH-PLAN.md` C5). Keep paid items cosmetic with fixed contents.

### F4. Challenge links break inside the app. Severity: High. Size S
**Evidence:** `CH_BASE = /github\.io$/.test(location.hostname) || location.hostname === "localhost" ? location.origin + location.pathname : "https://jimsky90.github.io/meteor-pilot/"`. Capacitor serves the game from `capacitor://localhost` (iOS) and `https://localhost` (Android), so app players would share links like `capacitor://localhost/#c=...` that open nothing.
**Fix:** `const devHost = location.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);` then `CH_BASE = /github\.io$/.test(location.hostname) || devHost ? location.origin + location.pathname : "https://jimsky90.github.io/meteor-pilot/"`. Later, Universal Links and App Links can open them in the app.

### F5. Saves have no backup and no version number. Severity: High. Size M
**Evidence:**
- If the save JSON fails to parse, the game starts from `{}`, and the next `persist()` overwrites the player's real data. A truncated save in testing loaded as a brand-new pilot, so the old data was gone.
- "Reset game data" (`rescue`) removes the key with no copy.
- There is no schema number (only the one-off `save.econ = 1`).
- `localStorage` in a WKWebView can be cleared by iOS under storage pressure. Capacitor's docs recommend native storage for anything important.
- Moving from the web app to the store app starts players from zero (different origin).
- `save.best` and `save.missions` grow by one entry per day forever.
**Fix:**
1. Before repairing or replacing a save that failed to parse or had wrong types, copy the raw string to `cometrun:v2:bak` (one copy, overwritten only when the current save is good again).
2. Add `save.sv` (schema version, start at 1) and a list of ordered migrations `[(save) => {...}, ...]` that run once each. Move the existing repairs into migration 1.
3. In the Capacitor build, mirror every `persist()` to `@capacitor/preferences`. On start, if `localStorage` is empty but Preferences has a save, restore it.
4. Add **Settings > Transfer progress**: export the save as a code (deflate plus base64, the same tools the challenge links already use) and import it on another device or in the app.
5. Prune `save.best` and `save.missions` to the last 60 days.

### F6. iPhone audio can stay silent after a call or app switch. Severity: Medium. Size S
**Evidence:** `audio()` only resumes when `ac.state === "suspended"`. iOS Safari and WKWebView use the state `"interrupted"` after calls, Siri, alarms or other apps playing. The AudioContext is never suspended when the app is hidden, and `setInterval(pump, 30)` runs forever.
**Fix:** `if (ac && ac.state !== "running" && ac.state !== "closed") ac.resume().catch(() => {});`. In the existing `visibilitychange` handler: when hidden, `ac && ac.suspend()`; when visible, nothing (the next tap calls `audio()`). Also call `audio()` from the stage `pointerdown` in every state, not only in briefings. On iOS 17+, set `navigator.audioSession && (navigator.audioSession.type = "ambient")` so the game respects the silent switch and mixes with the player's music. Test speech with the silent switch both on and off.

### F7. WebGL ship never comes back after a context loss. Severity: Medium. Size S
**Evidence:** `makeShip3D` handles `webglcontextlost` (sets `GL.ok = false`) but has no `webglcontextrestored` handler, and `glInit()` returns the cached `false` forever. iOS often drops GPU contexts when an app goes to the background, so after the first app switch the ship can fall back to the flat canvas hull for the rest of the session. The meteor builder is fine: it uses a temporary context and releases it with `WEBGL_lose_context`.
**Fix:** add `cv.addEventListener("webglcontextrestored", () => { GL.ok = null; GL.meshes.clear(); setGL(GL.want); })`. In `visibilitychange` (visible), call `if (GL.want && !GL.on) setGL(true)` after resetting `GL.ok = null` when `GL.gl.isContextLost()` is false. Cached 2D images in `GL.cache` remain valid.

### F8. Android back button, haptics, keep-awake and system bars. Severity: Medium (store quality). Size S
**Evidence:** No back-button handling exists, so in Capacitor, back exits the app mid-run or walks the `#c=` hash history. `vibrate()` uses `navigator.vibrate`, which iOS doesn't have, so iPhone players get no haptics. `navigator.wakeLock` (app shell) isn't available in older WKWebViews.
**Fix:** a small `store-bridge.js` loaded only in the Capacitor build (outside the GAME markers):
- `App.addListener("backButton", ...)`: during a run, pause. On an overlay, press its Back/Done button. On the menu, show "Tap back again to exit", then `App.exitApp()`.
- `window.__mpHaptics = ms => Haptics.impact({ style: ms > 25 ? "MEDIUM" : "LIGHT" })`, and `vibrate()` calls it when present.
- `KeepAwake.keepAwake()` while playing.
- `StatusBar.hide()` and portrait-only orientation in the native projects.

### F9. Online-only pieces: Google Fonts and the service worker. Severity: Medium. Size S
**Evidence:** The head loads Chakra Petch and Atkinson Hyperlegible from `fonts.googleapis.com`. A first launch offline (or a review device offline) shows fallback fonts, and Google Fonts requests make the "no data collected" privacy answers questionable. `sw.js` registers in any non-`file:` page. In WKWebView with `capacitor://` it fails (caught). On Android `https://localhost` it can register and cache, which is pointless inside an app bundle and can serve stale icons after an update.
**Fix:** bundle the four font weights as `fonts/*.woff2` files in the app (Latin subset, about 15–25 KB each) with `@font-face` in the app shell part of `index.html` (outside GAME). **Do not base64 them into the game section**, because that would cost about 100 KB of the 700 KB budget. Skip service-worker registration when `window.Capacitor` exists.

### F10. Menus burn battery at full gameplay cost. Severity: Medium. Size S
**Evidence:** `frame()` always calls `draw()` at full density, even while an opaque overlay (Shop, Levels, Hangar, Settings, Trophies) covers the stage. The menu measured 14 fps at 4× CPU, the same cost as gameplay.
**Fix:** when `state === "menu"` and one of `#shop, #levels, #hangar, #settings, #trophies` is visible, draw the canvas at most every 4th frame, but keep drawing the explosion preview and the level preview. Skip `draw()` entirely when `document.hidden`.

### F11. Small listener and node leak per run. Severity: Low. Size S
**Evidence:** Over 10 daily runs (after garbage collection), event listeners went 42 to 98 (+4 per run), DOM nodes 406 to 766, and heap 2.5 to 4.3 MB. The live DOM stays at about 190 elements, so detached results-screen nodes are kept alive by something.
**Fix:** take a DevTools heap snapshot after 5 runs, filter "Detached", and follow the retainers. The likely cause is a module variable or closure that keeps an old `#over` child (for example `lastRun` captured in a handler, or the debrief canvases). The memory test in the suite warns until the growth is 0.

### F12. Dead code from the dropped wallet and sats feature. Severity: Low. Size S (about 2.5 KB)
**Evidence:** CSS `.chip.sats`, `.wallet`, `.demo`, `.wbig`, `.wrow`, `.wsteps`, `.notice` (the wallet block, orange `#f7931a`). Also the unused `.lgrid`, `.ls`, `.shipico` and `.skins`. The suite lists them as a warning.
**Fix:** delete them, then re-run the suite. The warning list must be empty.

### F13. Level 34: the gate gap is almost blocked. Severity: Low (fairness). Size S
**Evidence:** In Level 34, a rock with radius 23 arrives at the same moment as gate 0 and leaves 14 px of an 83 px gap. The test bot clears every other level, but not this one. No daily course in days 1–60 has a blocked gap.
**Fix:** in `makeLevels` `pickSeed`, reject seeds where a rock crosses the ship row within 14 ticks of a gate wall inside the gap. This changes only levels with such a seed, never daily courses. Bump `PB_VER` only if daily courses change (they don't).

### F14. Smaller structure notes. Severity: Low. Size S each
- 16 hand-rolled `document.createElement("canvas")` sprite makers. One helper `sprite(w, h, scale, paint)` saves about 1.5 KB and centralises device-pixel handling.
- About 30 lines of save repairs follow the same pattern. A small schema table (`{ key: [type, default] }`) makes F5's migrations easy.
- `hud()` calls `toLocaleString()` and sets fonts every frame. Cache the score string when the score changes.
- Good things to keep: one IIFE with no stray globals (only `CR` and the read-only `__MP_*` test hooks), factories per subsystem (`makeThemes`, `makeMeteors`, `makeShip3D`), and a rules engine with no DOM. Keep the `__MP_*` hooks, because the test suite uses them.

---

## 3. Performance report (detail for the engineer)

- **Setup:** Playwright Chromium 153 headless, 390×844 viewport, 3× pixel ratio, CDP CPU throttling 1×, 4× and 6×.
- **Save:** veteran save (Levels 1–17 cleared, daily course).
- **Scenarios:** daily runs kept alive with a test-only shield refill and skipped ahead to 0:40 and the 1:04 Mothership.
- **Sampling:** 3 s per sample.
- **Command:** `python3 tools/test/perf_profile.py` (full table in `tools/test/out/perf.json`).
- **What limits the frame rate:** filling pixels. JS per frame stays under 1 ms (p50) and 12 ms (p95) in every case. Frame rate tracks pixel count: High at 4× CPU gives 12 fps at 3×, 31 fps at 2× and 60 fps at 1×.
- **Worst scenes:** boss (bullets, alarm vignette, dim layer, glows) and daily 0:40 (event tints and many meteors with per-meteor gradients).
- **Cheapest scene:** blackout.
- **Low graphics** holds 57–60 fps at 4× and 40–55 fps at 6×.
- **Memory:** about 4 MB JS heap, stable, apart from the small leak in F11. GPU-side memory:
  - Meteor sprites: 6 variants × 24 frames × 128×128 (about 9.4 MB of canvas memory).
  - GPU ship image cache: up to 140 entries of up to 256×256 (90 after 10 runs). That's fine for iPhones, but keep the 140 cap.
- **Top fixes, in order of value:**
  1. Cap density at 2× (F2.1).
  2. Auto quality (F2.2).
  3. Offscreen background (F2.3).
  4. Remove per-frame `shadowBlur` and gradients (F2.4, F2.5).
  5. Throttle menus (F10).
- **Caveat:** headless Chromium rasterises in software. A real iPhone uses the GPU for canvas, so its absolute numbers will be better, but the *ranking* holds, and older Android phones behave much like this table. Before launch, check on real devices: an iPhone 11 or SE (2nd/3rd gen) and a budget Android (for example a Galaxy A14 or Moto G). Use Safari Web Inspector or Chrome remote debugging and the in-game run at 0:40.

---

## 4. Store-readiness checklist (Capacitor, Android and iOS)

The owner's plan is **one Capacitor project for both stores**. That replaces the TWA route in `store/LAUNCH-PLAN.md` part A, and part C already recommends it. The game files are copied into `www/` unchanged. Store-only code lives in a separate `store-bridge.js` loaded before the game, so `index.html` stays the single source.

| # | Item | Status in v53 | Fix |
|---|---|---|---|
| 1 | Game freezes on an error | ✗ | F1 |
| 2 | Test checkout in the Store tab, no Restore Purchases | ✗ rejection risk | F3 |
| 3 | Challenge links point at `capacitor://localhost` | ✗ | F4 |
| 4 | Fonts from Google (offline first launch, privacy label) | ✗ | F9: bundle `fonts/*.woff2` |
| 5 | Service worker inside the app | ⚠ harmless on iOS, pointless on Android | F9: skip when `window.Capacitor` |
| 6 | Android back button | ✗ exits mid-run | F8: `@capacitor/app` backButton |
| 7 | Safe areas | ✓ `viewport-fit=cover` and `env(safe-area-inset-*)` already used | iOS: Capacitor `ios.contentInset: "never"`. Android 15+ forces edge-to-edge, and some WebViews report `env()` as 0, so test on a device. If the top bar sits under the status bar, use Capacitor's system-bars or safe-area plugin CSS variables as a fallback in the app shell. |
| 8 | Audio unlock and interruptions | ⚠ unlock is done in taps ✓, `"interrupted"` not handled | F6 |
| 9 | Read-aloud speech in WKWebView | ✓ `speechSynthesis` works in WKWebView; unlocked inside taps (v48) | Test on device with the silent switch on and off. Keep "beta" in the label. |
| 10 | Vibration | ✗ no-op on iPhone | F8: `@capacitor/haptics` |
| 11 | Saves survive (WKWebView storage can be cleared; web players start over in the app) | ✗ | F5: Preferences mirror, backup key, Transfer progress |
| 12 | Keep the screen awake | ⚠ web Wake Lock only | F8: keep-awake plugin |
| 13 | Install button and PWA hints | ✓ the Install chip only appears on `beforeinstallprompt`, which never fires in a WebView | none |
| 14 | Status bar, orientation, splash | ✗ native settings | `StatusBar.hide()`, portrait only in `Info.plist` and `AndroidManifest.xml`, splash in the app background color `#070a1a` |
| 15 | Privacy policy | ⚠ `privacy.html` exists; contact still says `[your contact email]` (line 159); no link in the game | Fill in the email. Add "Privacy" to Settings that opens the hosted URL in the system browser (`@capacitor/browser`). Put the same URL in both store consoles. |
| 16 | Age rating | ✓ drafted in `store/AGE-RATING-AND-FORMS.md` | Answer "Cartoon or fantasy violence: Infrequent" (boss bullets, ship explosions). That gives Apple 9+ and IARC Everyone or 7+, which is the safer answer for review. No user accounts, chat or ads. Challenge names travel only inside links the player sends. |
| 17 | Data safety and privacy labels | ⚠ true only after fonts are bundled | After F9: "No data collected" on both stores. |
| 18 | Encryption export question | n/a | `ITSAppUsesNonExemptEncryption = NO` |
| 19 | Minimum functionality (Apple 4.2) | ✓ full game, offline | Bundle the files (not a remote URL). Add haptics and Game Center (LAUNCH-PLAN B6). Hide web-only UI. |
| 20 | Real-device test | not done | iPhone SE or 11, a recent iPhone, and a budget Android. Airplane mode. Silent switch. App switch mid-run. Incoming call mid-run. |
| 21 | WebKit in the test suite | ⚠ not installed here | `python3 -m playwright install webkit`; the suite then smoke-tests the iPhone engine automatically. |

---

## 5. Size budget plan through v100

**History:** v17 182.5 KB (Nov 2), v25 239.3, v35 299.7, v44 389.7, v47 414.8, v52 436.9, v53 442.1 KB.
- Average growth from v17 to v53: 7.2 KB per version.
- Average over the last 9 versions: 5.8 KB per version.
- **At 5.8 KB per version the file reaches 700 KB at about v97 (715 KB at v100). At 7.2 KB it hits 700 KB at about v89.** It will not fit without a plan.

**Where the bytes are (v53):**

| Part | Size |
|---|---|
| App script | 357.6 KB |
| Rules (`CR`) | 44.9 KB |
| CSS | 34.6 KB |
| Within the app: drawing | 55.7 KB |
| Within the app: radio dialogue (`LINES`) | 24.2 KB |
| Within the app: trophies, tips, results | 26.0 KB |
| Within the app: 3D ship / meteors | 21.7 / 21.0 KB |
| Within the app: levels UI | 20.7 KB |
| Within the app: themes | 20.0 KB |
| Comments (all scripts and CSS) | **37.7 KB** |
| Indentation | 23 KB |

**Plan:**
1. **Per-round budget: 6 KB on average** (the suite warns above 6 KB and fails above 20 KB). A round that needs more must pay it back within 2 rounds.
2. **Trim rounds at v60, v70, v80 and v90.** Each one removes at least 10 KB with no change in behaviour, and the suite must pass unchanged:
   - **v60:**
     - Remove the dead CSS (F12, 2.5 KB).
     - Cut the in-game `CHANGELOG` to 3 entries (−3.5 KB).
     - Strip version-history comments (`v38 (mission plan 5): ...`) down to one-line *why* comments. About 15 KB of the 37.7 KB of comments is history.
   - **v70:**
     - Add the `sprite()` helper and the save schema table (F14, about 3 KB).
     - Turn the six mission-type briefing strings in `renderLevels` into one table (about 2 KB).
     - Merge repeated draw patterns in the mission-type sprites (about 3 KB).
   - **v80 and v90:** review the largest sections again (drawing, trophies and results) for duplicated layout strings and dead branches left by features that changed.
3. **Things that must not go into `index.html`:**
   - Fonts: they ship as files (F9).
   - Large images.
   - Audio files: music stays procedural.
   - Store-only code: it lives in `store-bridge.js`.
4. **Expected result:** about 5.8 KB × 47 rounds = +273 KB, minus about 45 KB of trims and minus the code F-fixes delete, plus about 10 KB that the F-fixes add. That lands at **about 620–650 KB at v100**, leaving room for fixes after launch.
5. **If it still gets close (over 650 KB) before v100:** move the static story text (`LINES`, `CREDITS`, mission titles) into a compact `[id, who, mood, text]` array, which saves about 6 KB of repeated keys. Do not minify the published file, because the daily engineer edits it directly and readable code is worth more than the bytes.
