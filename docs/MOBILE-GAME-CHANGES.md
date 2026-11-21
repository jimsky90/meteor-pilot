# Game changes for the store apps (for the daily engineer)

Written by the Mobile Platform Engineer, 2026-11-20, against v53. These are the only changes the Google Play and App Store builds need inside `index.html`. Everything else lives in `mobile/` (see `docs/MOBILE-BUILD.md`).

**How the store build works.** `mobile/scripts/build-www.mjs` copies `index.html` into the app. It leaves the game section (`GAME:START` to `GAME:END`) byte-for-byte unchanged, swaps the Google Fonts links for bundled font files, removes the service worker registration from the app shell, and adds `<script src="native.js"></script>` to `<head>`. `native.js` runs before the game and sets `window.MP_NATIVE` only inside the real app. In a browser, `window.MP_NATIVE` is `undefined`, so the web game behaves exactly as it does today.

**Today, nothing here blocks a build.** `native.js` already works from outside the game. It hides the Store tab with CSS, turns `navigator.vibrate` into native haptics, rewrites `localhost` challenge links in share and copy, presses the visible Back, Done or Pause buttons for the Android back button, and mirrors `localStorage` to native storage. These items replace those workarounds with exact behaviour. Do them in order. Each one is small (S).

**Test for every item:** `python3 tools/test/run_all.py` must still PASS, and `python3 mobile/test_build.py` must still PASS. The web game must not change at all when `window.MP_NATIVE` is missing.

---

### M1. Read the store-build flag once
Near the top of the app script (the second `<script>`, after `const persist = ...` is fine):
```js
const NATIVE = window.MP_NATIVE || null;   /* set by mobile/native.js in the store apps only */
```
`NATIVE` has these fields: `platform` (`"android"` or `"ios"`), `webUrl` (`"https://jimsky90.github.io/meteor-pilot/"`), `haptic(p)`, `share({title,text,url})` (returns a promise), `openUrl(url)` and `backupNow()`.
**Test:** in a browser, `NATIVE === null`. In `mobile/test_build.py` (stubbed app), `MP_NATIVE.platform === "android"`.

### M2. Hide the test checkout in the store apps (F3)
- In `renderShop`, build the tab list without `["store", "Store"]` when `NATIVE && !(window.COMET_PAYMENTS && window.COMET_PAYMENTS.buy)`.
- In that case, if `shopTab === "store"`, set `shopTab = "paints"` before rendering.
- Change `.shop .tabs` to use `repeat(var(--tabs, 4), ...)` and set `--tabs: 3` on the tab row when the Store tab is hidden. Otherwise, leave the 4-column CSS as it is.
- In `completePurchase()`, add `if (NATIVE && !live) { checkout = null; return renderShop(); }` before granting anything. In the store apps, no code path may grant paid items without real billing.

**Test:** in the stubbed app, the Shop shows 3 tabs (Paints, Booms, Locker), and `[data-pay]` doesn't exist. In a browser, all 4 tabs still show, and the test checkout still works.

### M3. Challenge links always use the web address (F4)
Replace the `CH_BASE` line with:
```js
const devHost = location.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const CH_BASE = NATIVE ? NATIVE.webUrl
  : /github\.io$/.test(location.hostname) || devHost ? location.origin + location.pathname : "https://jimsky90.github.io/meteor-pilot/";
```
In `sendChallenge`, when `NATIVE` exists, call `await NATIVE.share({ title, text, url })` instead of `navigator.share`. Keep the same `AbortError` handling and the same clipboard fallback.
**Test:** in the stubbed app, `Share.share` receives a URL that starts with `https://jimsky90.github.io/meteor-pilot/#c=`. In a browser on `localhost`, links keep the local address, as they do today.

### M4. One back handler the app can call: `window.__MP_APP.back()`
Expose this next to the other `__MP_*` hooks (near `window.__MP_STATE`):
```js
window.__MP_APP = { back: appBack, pause: () => pause(), resumeAudio: () => audio(), state: () => state };
```
`appBack()` returns `true` when it handled the press and `false` when the app should offer to exit. Check these in order:
1. A checkout is open (`#co-x` visible): cancel it.
2. `state === "brief"`: `skipBrief()`.
3. `state === "play"` or `"countdown"`: `pause()`.
4. `state === "paused"`: if Settings is open over the pause screen, close Settings (run its Done handler). Otherwise, `resume()`.
5. Any of `#settings`, `#trophies`, `#hangar`, `#shop`, `#levels`, `#chal` or `#ending` is visible: run that screen's own Back, Done or Not now handler, which is the same code as its button. In Levels with a level brief open, go back to the map, not the menu.
6. `#over` (results) is visible: `showStart()`.
7. Otherwise (the start menu): return `false`.

**Test:** in a browser console, open each screen and call `__MP_APP.back()`. Each call must land on the screen named above, with no page errors. On the start menu, it returns `false`. `mobile/test_build.py` already checks that the bridge prefers this hook.

### M5. Audio after an app switch or call (F6, app side)
`__MP_APP.resumeAudio` (from M4) calls `audio()`. Do F6 at the same time: resume whenever `ac.state !== "running" && ac.state !== "closed"`, and suspend the context on `visibilitychange` when the page is hidden. The bridge calls `resumeAudio()` when the app comes back to the front. The run itself stays paused until the player taps Resume.
**Test:** on an iPhone (TestFlight build), start a run, take a phone call or open another app, then come back. The pause screen shows, and the music and sound effects play again after Resume.

### M6. Skip the service worker when running in the app (F9)
In the app shell (after `GAME:END`), change the condition to:
`if ("serviceWorker" in navigator && location.protocol !== "file:" && !window.Capacitor) { ... }`
The build already removes this block, and `native.js` blocks registration at runtime. This makes the source correct on its own.
**Test:** the web version still registers `sw.js`. Check DevTools > Application > Service workers on the GitHub Pages site.

### M7. Haptics through the bridge (optional, F8)
`vibrate(p)`: `if (!save.set.haptics) return; try { if (NATIVE) NATIVE.haptic(p); else if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}`.
The bridge already turns `navigator.vibrate` into native haptics, so this item only makes the path explicit. Keep the Haptics toggle in Settings working in both versions.
**Test:** in the stubbed app, `vibrate(30)` with haptics on records one `Haptics.impact`. With haptics off, it records none.

### M8. Privacy link in Settings (checklist item 15)
Add a "Privacy policy" text link at the bottom of Settings: `<a href="https://jimsky90.github.io/meteor-pilot/privacy.html" target="_blank" rel="noopener">Privacy policy</a>`. In the app, the bridge opens outside links in the system browser. (`privacy.html` is not bundled into the app.) Before launch, also fill in the contact email in `privacy.html`.
**Test:** in the app, tapping the link opens the policy in a browser sheet. In a browser, it opens a new tab.

### M9. Hide web-only text in the app
When `NATIVE` exists, hide the `.foot` line ("Keyboard: arrow keys or WASD, Space to play...") and any "install the app" or "add to Home Screen" hints. Store reviewers flag web-only instructions (Apple 4.2).
**Test:** in the stubbed app, `.foot` is not visible. In a browser, it is still visible.

---

**Please keep these stable, because the build and the bridge rely on them:**
- the `GAME:START` and `GAME:END` markers
- the Google Fonts `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...">` format in `<head>` (the build reads the font families and weights from it, so a new weight there is bundled automatically)
- `window.__MP_STATE().state`
- the button ids `#pausebtn`, `#resume`, `#skipbrief`, `#sh-back`, `#set-done`, `#tr-back`, `#h-done` and `#lv-back`, and the `data-st` tab attributes in the Shop
- the save key `cometrun:v2`

If you rename any of them, tell the Mobile Platform Engineer, or update `mobile/native.js` and run `python3 mobile/test_build.py`.
