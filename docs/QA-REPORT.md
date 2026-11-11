# QA report

**Game:** Meteor Pilot v28 (CHANGELOG entry dated 2026-11-10), `index.html` + `sw.js` + `manifest.webmanifest` as in the repo
**Tested:** 2026-11-10
**How:** code read-through of both game scripts and the app shell; Node tests of the rules engine (`window.CR`); Headless Chromium (Playwright) at 360×640 and 390×844 with touch, CPU throttling, tab-switch simulation, corrupted saves, offline mode and a forced clock. The test scripts and screenshots are in the QA scratchpad folder (`qa/`), not in the repo.

## Summary

The core is solid. The rules engine is fully deterministic: replays matched live play on all 10 seeds and 7 ships. I found no memory leak over 12 back-to-back runs, no listener build-up, no stacked animation loops and no console errors in normal play. The worst problems are around the game rather than in it:

1. **The service worker can replace the offline game with another page.** After a visit to `privacy.html` or any broken link, launching the installed app offline shows the privacy policy or a 404 page instead of the game.
2. **Leaving the app during the 3-2-1 countdown doesn't pause the game.** When the player comes back, the run is already live.
3. **One bad field in the save crashes the start screen for good.** There is no way to recover.
4. **The daily day never changes while the app stays open.** It stays on yesterday's course, missions and gift.
5. **The game is slow on weaker phones with the default High graphics.**

---

## Findings (worst first)

### 1. Offline launch can show the privacy page or an error page instead of the game (High)

**What happens:** `sw.js` saves every page the browser navigates to as `"index.html"` in the cache, whatever page it actually was, and even when the server returned an error. The offline fallback then serves that saved copy. If a player opens the privacy policy (the store listings link to it), follows a dead link, or connects through hotel or airport Wi-Fi with a login page, the next offline launch of the installed app shows that page and no game. It stays that way until they open the game online again.

**Reproduce:** load the game once so the service worker takes control, open `/privacy.html`, go offline, then open `/`.

**Evidence (Playwright, offline mode):**
- After visiting `privacy.html`, the offline launch has the title "Meteor Pilot · Privacy Policy" and no game canvas.
- After visiting `/does-not-exist` (HTTP 404), the offline launch has the title "Error response" and no game canvas.
- Code: the `fetch` handler, `req.mode === "navigate"` branch: `caches.open(VERSION).then(c => c.put("index.html", copy))` runs for every navigation, with no check of the URL or of `r.ok`.

**Fix (S):** only update the cache when the navigation is for the game page and the response is good. For example: `if (r.ok && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")))`. Also put that `put` inside `e.waitUntil(...)` so the browser doesn't cut it off. Bump `VERSION` so existing installs get a clean cache.

### 2. Switching apps during the resume countdown un-pauses the game behind the player's back (Medium)

**What happens:** auto-pause only fires while `state === "play"`. During the 3-2-1 countdown after Resume, the state is `"countdown"`, so a notification, an app switch or a screen lock is ignored. The countdown timer keeps running on the clock, and when the player returns the run is already live with no countdown. That means a likely hit or death they had no chance to avoid.

**Reproduce:** start a run, tap Pause, tap Resume, then switch apps (or pull down the notification shade) within 2 seconds. Come back after 3 seconds and the ship is already flying.

**Evidence (Playwright):** pause → `paused`; resume → `countdown`; tab hidden → still `countdown` and the pause screen stays hidden; window blur → still `countdown`; on return → `play`, with the run already advanced (t=115 ticks).
- Code: `document.addEventListener("visibilitychange", …)` and `addEventListener("blur", …)` both check `state === "play"` only. `pause()` itself already accepts `"countdown"`.

**Fix (S):** in both listeners, use `if (state === "play" || state === "countdown") pause();`.

### 3. One bad value in the save crashes the start screen, with no way back (Medium)

**What happens:** the loader fills in fields that are *missing*, but not fields that are present with the wrong type. If `best` or `missions` is `null`, the start screen throws and stays blank on every launch. If `owned` is `null`, the Hangar crashes. There is no reset option in the game, so the only fix is clearing site data or reinstalling, which wipes all progress. Today this can only come from an edited save or a future code change, but nothing in the code protects against it.

**Reproduce:** set `localStorage["cometrun:v2"] = '{"best":null}'` and reload.

**Evidence (Playwright, 20 corrupted saves tried):**

| Save contents | Result |
|---|---|
| `{"best":null}` | Start screen does not render: `TypeError: Cannot read properties of null (reading '17')` |
| `{"missions":null}` | Same crash |
| `{"owned":null}` | Start screen works; opening the Hangar throws `Cannot read properties of null (reading 'includes')` |
| Garbage text, `{}`, `null`, `123`, `"hello"`, `[]`, an old-style save, `trails:null`, `levels:[]`, unknown skin or trail, bad `pb` recording | Handled correctly |

- Code: the `let save = …` block in the app script uses `Object.assign(defaults, save)`, so a `null` overwrites a default.

**Fix (S):** after loading, check each container field and reset any that has the wrong type. For example: `for (const k of ["best","missions","levels","up","rec","ach"]) if (!save[k] || typeof save[k] !== "object" || Array.isArray(save[k])) save[k] = {};` and `for (const k of ["owned","trails"]) if (!Array.isArray(save[k])) save[k] = k === "owned" ? ["comet"] : ["none"];`. Wrap the first `showStart()` in a try/catch that offers "Reset game data" if it still fails.

### 4. The daily course doesn't change at midnight while the app is open (Medium)

**What happens:** `day` is worked out once, when the page loads. An installed app that stays in memory overnight (common on phones) keeps serving yesterday's daily course, missions, "best today" and daily gift until the page is reloaded. Runs played after midnight are saved under the old day. If the app stays open across two midnights, the 🔥 streak breaks even though the player played every day.

**Reproduce:** set the clock to 23:58, load the game, move the clock 5 minutes past midnight, play a run.

**Evidence (Playwright with a shifted clock):** after midnight the clock reads `Wed Nov 11 00:03`, but the game day is still 17, the start screen still shows "Daily No. 17", the run's best is saved under day `17` and `lastDay` is 17.
- Code: `const day = Math.max(1, CR.dayNumber(new Date()));` at the top of the app script, and `const MISSIONS = CR.missions(day);`.

**Fix (M):** make `day` and `MISSIONS` reassignable (`let`). On `visibilitychange` (visible) and in `showStart()`, recompute the day. If it changed, reset `pbRun`, run the streak check, call `setup(true)` and re-render the start screen. Never switch days in the middle of a run.

### 5. Choppy on weaker phones with the default High graphics (Medium)

**What happens:** everyone starts on High graphics, which draws two background layers at up to 3× pixel density. On a CPU slowed 4× to stand in for an older phone, the game drops to about 17–26 fps. Low graphics gets back to about 37–55 fps. There are also one-off stalls of 65–100 ms when the first solar flare and the second Mothership appear.

**Evidence (headless Chromium, 4 s of live play at each point of a run; frames over 33 ms out of all frames):**

| Setting | 0:05 | 1:02 boss | 1:30 black hole | 2:14 flare | 2:35 boss 2 | 3:08 |
|---|---|---|---|---|---|---|
| High, normal CPU | 0/278 | 1/282 | 3/276 | 18/240 (worst 65 ms) | 9/255 (worst 81 ms) | 2/281 |
| Low, normal CPU | 0/282 | 0/282 | 0/284 | 2/280 | 1/281 | 0/282 |
| High, CPU ×4 | 55/131 | 62/150 | 85/111 | 89/105 (worst 102 ms) | 91/102 | 68/140 |
| Low, CPU ×4 | 6/216 | 6/250 | 31/183 | 30/192 | 27/197 | 12/207 |

JavaScript time per frame is small (1–8 ms on average), so the cost is mostly drawing (canvas fill at high pixel density, plus the cached background layers). Headless Chromium draws in software, so real phones with a GPU will do better. The gap between High and Low, though, is real.

**Fix (M):** (a) Pick Low by default on weaker devices: if the average frame time over the first 3 seconds is above about 22 ms, switch to Low and show a one-line toast. (b) Cap pixel density at 2 on High (`Math.min(lowGfx() ? 1.5 : 2, devicePixelRatio)` in `resize()`). (c) Pre-build the flare and boss assets during the boss warning or at run start so their first frame doesn't stall.

### 6. Double-tapping "End run" skips the results screen and starts a new run (Medium)

**What happens:** "End run" ends the run and draws the results screen immediately. That screen's "Play again" button sits right under where "End run" was. A quick double tap (very common on phones) ends the run and starts the next one at once, so the player never sees their score, coins or trophies.

There is also no guard against the handler running twice. When the click does fire twice (I triggered it with a script; assistive tools or a laggy WebView could do the same), `gameOver()` pays out twice: double coins, double run count, double XP. The results screen still shows the single amount.

**Evidence:**
- Real double tap (two touch taps 40 ms apart on "End run"): the state ends as `play`, meaning a new run has started. A mouse double-click ends on the results screen, with "Play again" now under the cursor.
- Scripted double click on `#quit` after a 20-star run: wallet +90 coins and runs +2 (including a rank-up from doubled XP), against +30 and +1 for a single click. The results screen said "+20 ◉" in both cases. Level mode behaves the same way.
- Code: in `pause()`, `$("#quit").onclick = () => { o.hidden = true; me.alive = false; me.quit = true; state = "dying"; gameOver(); }`. `gameOver()` and `finishLevel()` never check whether the run was already settled. Related dead code: `start()` begins with `if (state === "starting") return;`, but nothing ever sets that state.

**Fix (S):** at the top of `gameOver()` and `finishLevel()`, add `if (state === "over") return;`. Ignore taps on the results screen for the first 400 ms (for example, add a `disabled` attribute and remove it with a `setTimeout`). Remove the dead `"starting"` check or set the state properly.

### 7. Short freezes when opening a level or going back from the level map (Low)

**What happens:** tapping a level tile builds that level the first time. That includes simulating its ghost, which runs until the bot dies rather than stopping at the level's finish line. Tapping Back rebuilds the daily course and its ghost from scratch every time. On a 4× slower CPU, each tap freezes the screen for 200–380 ms.

**Evidence:**
- Browser at CPU ×4: level 1 tile 380 ms, level 2 tile 364 ms, level 3 tile 200 ms, Back from the level map 373 ms. At normal speed: 46–154 ms.
- Node: building all 40 levels takes 2.5 s in total. Level 3 alone took 319 ms, and its ghost ran 4,539 ticks for a 1,320-tick level. A daily `recordGhost` takes 18–169 ms.
- Code: `makeLevels → get()` calls `CR.recordGhost(world)` with no end limit. `renderLevels` → `#lv-back` → `setup(true)` and `showStart()` (when `mode === "level"`) rebuild the world and ghost every time.

**Fix (S):** cache the daily `{world, ghost, theme}` for the current day and reuse it in `setup(true)`. For levels, stop the ghost at `durT`, for example with an optional `maxT` argument on `recordGhost`. That argument would be the only rules-engine change, and it doesn't affect scoring.

### 8. Save numbers aren't type-checked, so one odd value snowballs (Low)

**What happens:** coins stored as text get glued together instead of added. A huge XP value turns into hundreds of thousands of rank-ups, and one big enough would freeze the game in the rank-up loop. Only an edited save can trigger this.

**Evidence (Playwright):**
- `coins: "500"`: after one 10-coin run, the save holds `coins: "5000010"`.
- `xp: 1e12`: after one run, pilot level 223,605 and coins 8,944,220.
- `levels` values stored as text: the star total is built by joining text instead of adding numbers.
- Code: `paintChips`, `gameOver` (`save.coins += earned`), `LV.addXP` (an unbounded `while` loop), `LV.total`.

**Fix (S):** when loading, force the number fields to valid ranges, for example `save.coins = Math.max(0, Math.floor(+save.coins) || 0)`. Do the same for `xp`, `pilot`, `runs`, `streak`, every `levels[n]` (0–3) and every `up[k]` (0–5). Cap the number of rank-ups `addXP` can grant in one call.

### 9. Background images stay in memory forever (Low)

**What happens:** each background scene that uses a pre-drawn image (nebula, circuit, planet, skyline) gets a 720×1280 canvas (3.5 MB) per theme, and these are never freed. Daily runs change theme every 30 seconds, and the level preview draws a theme for each level tapped. After a while, up to 22 of these canvases exist: about **77 MB** on High, or 49 MB on Low. That is a lot for Android Go phones and for iOS Safari's canvas memory limit.

**Evidence:** `makeThemes → cached(key, …)` stores entries in `caches` (a `Map`) keyed by `"neb"/"cir"/"pl"/"sky" + th.name` and never evicts them. The count comes from the 40 theme definitions. Heap measurements didn't show this growth, because canvas pixels are stored outside the JS heap.

**Fix (S):** keep at most 4 entries (delete the oldest key when adding), or draw these at 1× instead of 2×. They are soft background layers.

### 10. Visual effects run faster on high-refresh phones (Low)

**What happens:** particles, background scrolling, screen shake, flashes, rock chunks and the combo glow all move a fixed amount per drawn frame instead of per unit of time. On 90/120 Hz Android phones they run 1.5–2× faster and burn out sooner. The game rules themselves are unaffected, because they run on a fixed 60-ticks-per-second clock.

**Evidence:** in `frame()`, `p.x += p.vx … p.life--`, `bgT += speed` (in `draw()`), `shake *= .85`, `flash.a *= .88`, `stepChunks()` and `comboGlow += …` all run once per animation frame.

**Fix (S):** scale these by `dt / 16.67`, or step them inside the fixed-tick loop.

### 11. Space or Enter starts a run hidden behind the Hangar, Shop, Settings or Levels screens (Low, keyboard only)

**What happens:** those screens set `state = "menu"`, and the keydown handler starts a run on Space or Enter in `"menu"`. On desktop or Chromebook, pressing Space while browsing the Hangar launches a daily run.

**Evidence:** opened the Hangar from the results screen, pressed Space → state `play`, Hangar closed.
- Code: the `keydown` listener, line with `(e.key === " " || e.key === "Enter") && (state === "menu" || state === "over")`.

**Fix (S):** only start when `!$("#start").hidden || !$("#over").hidden`.

### 12. Battery: screen wake lock and audio stay on outside of play (Low)

**What happens:** the app shell asks for a screen wake lock on the first tap and every time the app comes back to the front, and never releases it. The screen never dims, even on menus. The `AudioContext` is never suspended when the app is hidden: music is silenced by turning the volume to 0, but the audio hardware stays awake. On iOS, an `AudioContext` that ends up in Safari's `"interrupted"` state (for example after a phone call) is not resumed, because `audio()` only resumes from `"suspended"`. I couldn't test this one here, so it's a risk to check on a real iPhone.

**Evidence:** app shell `wake()` (no `lock.release()` anywhere). `audio()` checks only `ac.state === "suspended"`. `MUSIC.pump` keeps a `setInterval(…, 30)` running forever.

**Fix (S):** hold the wake lock only while `state` is `play` or `countdown`, and release it otherwise. On hidden, call `ac.suspend()`; on visible plus the first tap, call `resume()`. In `audio()`, resume when `ac.state !== "running"`.

### 13. Save failures are silent (Low)

**What happens:** `persist()` swallows every error. If storage is full or blocked (some private modes, or a WebView with storage turned off), coins and unlocks quietly stop saving and the player only finds out after a reload.

**Evidence:** `const persist = () => { try { localStorage.setItem(…) } catch (e) {} };`.

**Fix (S):** on the first failure, show a one-time toast: "Progress can't be saved on this device/browser".

---

## Checked and fine

- **Syntax:** both game scripts pass `node --check`.
- **Determinism:** the rules engine uses no `Math.random`, `Date` or `performance`. `CR.replay()` matched live stepping exactly (score, ticks, stars, golden stars, every input used) on 10 seeds across all 7 ships with upgrades. `makeWorld` and `recordGhost` give the same output for the same seed. Input recording in `tick()` matches the replay format. The rule changes between v26 and v28 came with a bump of `PB_VER`, so old best-run recordings can't drift out of sync.
- **No memory leak over 12 back-to-back runs with steering:** JS heap 2.5 → 2.9 MB (it rises and falls, no steady climb), DOM nodes steady at about 459, event listeners steady at 35, one document. Particles, floaters, rings, chunks, the trail and the rock-shape cache all reset or stay capped (particles 700, or 140 on Low; chunks 56; trail 18; rock shapes limited by the course size).
- **Only one animation loop:** a single `requestAnimationFrame` chain started once. Nothing starts a second one, and pause, resume and tab switches don't stack it.
- **Event listeners:** all global listeners are added once at startup. Overlay buttons use `onclick =` on freshly rendered markup, so nothing piles up across opens.
- **Audio nodes:** every oscillator and noise source gets `stop()` and is released after it finishes. The music only schedules about 160 ms ahead.
- **Rapid taps:** triple-tapping Play or Play again just restarts cleanly. Spamming pause and resume ends in a clean countdown and then play. Opening and closing the Trophies, Hangar (all tabs), Settings and Shop 20 times quickly left exactly one screen open, with no errors.
- **Mid-run tab switch:** pauses correctly while in `play`.
- **Corrupted saves:** invalid JSON, `{}`, `null`, a number, a string, an array, an old-style save (coins and owned ships kept), `trails:null`, `levels:[]`, an unknown skin or trail, an out-of-range upgrade level (clamped by `loadoutCfg`) and a broken best-run recording all load and play.
- **Layout:** no sideways scroll at 360×640 or 390×844, on the start screen or any overlay (`scrollWidth` equals the viewport width). Touch drag steers the ship and doesn't scroll the page (`touch-action: none`, `overscroll-behavior: none`).
- **No page errors or console errors in normal play.** The only failed requests are the blocked Google Fonts, which is expected here.
- **Service worker basics:** every file in the `SHELL` list exists (all returned 200). Old caches are deleted when a new version activates. The game page is network-first, so new versions arrive and there is no "stale index.html forever" path. The problem in finding 1 is a different one.
- **Store and WebView readiness:** `wakeLock`, `vibrate`, `serviceWorker`, `matchMedia`, `setPointerCapture`, `clipboard` and `roundRect` are all checked for or wrapped in try/catch. The `AudioContext` is created from a tap and falls back to `webkitAudioContext`. The code doesn't use `structuredClone`, `.at()`, `findLast`, `replaceAll`, `Object.hasOwn`, logical assignment, `OffscreenCanvas` or `Intl`. It does use `??` (needs Chrome 80+ or iOS 13.4+) and `ResizeObserver` without a check (iOS 13.4+). Both are fine for current store minimums.
- **Saving cost:** nothing writes to storage every frame. Writes happen only on purchases, settings changes, completed missions and trophies, and at the end of a run. The best-run recording is about 400 inputs for a 1-minute run.
