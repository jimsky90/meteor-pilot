# Meteor Pilot: art direction (reviewed at v28, 2026-11-10)

How this was reviewed: real screenshots with Playwright at 390×844 and 360×640 (DPR 2). Covered: start menu (new and returning player), first-run tip, gameplay at 6 s / 20 s (gates) / 28 s (black hole) / 48–50 s (solar flare warn + live beam) / 58 s (boss warning) / 65–70 s (Mothership fight), a hit, death, pause, game over, Levels (all 4 world tabs + a level brief), Hangar (3 tabs), Shop (Paints, Booms, Store), Trophies, Settings, and a contact sheet of all 40 level themes in play.
- Frame cost: `draw()` measured mid-run at 4× CPU throttle on a 720×1277 canvas: **38.7 ms** per frame.
- Fonts: Google Fonts were blocked in the test, so the fallback font is what an offline install would show today.

---

## 1. Style rules (check every version against these)

### 1.1 Palette tokens
Every color in CSS or canvas code must come from this list. A new hex needs a new token here first.

| Token | Hex | Meaning (only this) |
|---|---|---|
| `--space` | `#070a1a` | Page / sky floor |
| `--panel` | `rgba(12,17,42,.92)` | Cards, sheets |
| `--ink` | `#eef0ff` | Primary text |
| `--muted` | `#8d93bf` | Secondary text (never below 11 px) |
| `--rule` | `#273061` | Borders, inactive tracks |
| `--gold` | `#ffcc4d` | **Reward**: stars, coins, primary CTA, combo |
| `--tide` | `#4fe0cf` | **Good / progress**: cores, close calls, success, XP |
| `--hurt` | `#ff4f62` | **Danger**: bullets, comets, damage, warnings |
| `--ember` | `#ff7a3d` | Heat: meteor fire, brand accent in the logo |
| `--flare` | `#ff9a4d` | Solar flare only |
| `--void` | `#c58bff` | Black hole, weaving rocks, best-run ghost |
| power colors | shield `#5aa9ff`, magnet `#ff7ad9`, nova `#ffffff` | Power-ups only |

**Semantic lock.** Danger is always `--hurt`/`--ember`/`--flare`/`--void`. Reward is always `--gold`. Help or progress is always `--tide`.
- A hazard warning toast is never teal.
- A reward is never red.

**How worlds may vary.** Each world owns a 4-color set, and each theme's `a`/`b`/`sky` must come from its world's set:
- Neon Belt: `#ff3ea5 #3ef0ff #ff7ad9 #9b8bff`
- Red Circuit: `#ff6a3d #ff3d2e #ff8c5a #5ee8ff`
- Prism Rings: `#7cf3ff #a0f0ff #ff9ae0 #6affd8`
- Quantum Void: `#b07bff #8c7bff #ff4fd8 #3effc8`

Two more limits:
- **No theme `a`/`b` with a hue between 35° and 60°** (the gold band). Stars must own gold. Today Golden Signal, Solar Vault, Prism Gate, Saturn Choir, Crystal Crown and Quantum Throne break this.
- `sky` stays darker than L* 12, so hazards always sit on near-black.

### 1.2 Typography
- **Display:** Chakra Petch 700, uppercase for labels, buttons and HUD numbers.
- **Body:** Atkinson Hyperlegible 400/700.
- Both are **bundled as local woff2** (no Google Fonts request in store builds).
- **Type scale** (CSS px): 11 / 13 / 16 / 20 / 28 / 40 / 56. Canvas uses the same numbers in game units (360-wide).
- **Minimum size 11 px** everywhere. Today `.lt .nm` is 8 px, `.tro p` 10 px and boss-warning subtitle 9 px.
- Numbers always use `font-variant-numeric: tabular-nums`.
- Letter-spacing: .12–.14em on eyebrows only. Buttons .06em.
- No more than 2 lines of body text on any game-facing screen before the first button.

### 1.3 UI components
- **Radii:** 8 (chips, small buttons), 12 (cards, buttons, tiles), 18 (stage, sheets), 999 (pills). Nothing else.
- **Spacing:** 4-pt grid. Gaps are 4/8/12/16/24 only.
- **Buttons:**
  - **Primary:** gold, at least 52 px tall, exactly one per screen.
  - **Secondary:** tide fill or 1 px `--rule` outline, at least 44 px tall.
  - **Tertiary:** text.
  - The exit button on every overlay is the same component, labeled "Back", in the same place (top-left icon button 44×44, or the bottom outline button). Never "Done" on one screen and "Back" on another.
- **Icons:** one inline-SVG icon set (stroke 2 px, 20 px box). No emoji as UI icons (🔥🛒🏆⚙🔒 today). Flags in the ghost label are content and may stay.
- **Coin display:** one coin glyph component (SVG gold disc). The balance appears once per screen (top bar), not again in the sheet header.
- **Cards:** `--panel` fill, 1 px `--rule` border, radius 12, padding 12. Selected = 1.5 px gold inner border. Rarity uses a left 3 px stripe only.

### 1.4 Glow and bloom limits
- `shadowBlur` is **banned inside per-frame loops that draw more than 3 objects** (stars, power-ups, meteors, cores, hazards, trails). Use pre-rendered glow sprites made once with `cached()`.
- At most **one full-screen additive layer** at a time (combo edge glow, flare corona or event tint). Its alpha must stay at or below .45.
- Bloom around a single object can be at most 2.2× its hit radius.
- Full-screen color flash: alpha ≤ .35 (calm mode ≤ .10), decays at ×.85/frame or faster.

### 1.5 Motion and easing
| Use | Duration | Easing |
|---|---|---|
| Tap feedback | 90–120 ms | `cubic-bezier(.2,.8,.2,1)` |
| Overlay in / out | 220 / 160 ms | same, opacity + translateY 12 px |
| Reward pop (stars, trophy, rank) | 450 ms | `cubic-bezier(.2,1.6,.4,1)` (overshoot only for rewards) |
| Number count-up | 600 ms | easeOutCubic |
| Sector/world transition | 600 ms | easeInOutCubic |

Gameplay feedback limits:
- **Screen shake caps:** star 0, close call 3, hit 12, nova 10, death 18, boss kill 20. Calm mode multiplies by 0.2.
- **Hit-stop:** hit ≤ 110 ms, death ≤ 260 ms, boss kill ≤ 220 ms. Nothing else freezes.
- **Pulsing buttons:** at most one pulsing element per screen.

### 1.6 Effects budget (per frame, high graphics)
- Particles ≤ 300 (low: 120). Chunks ≤ 40.
- New `createLinearGradient`/`createRadialGradient` calls in `draw()` ≤ 6. Cache by key otherwise.
- Background: drawn into a cached 1× offscreen canvas and redrawn at most every 2nd frame.
- **Target:** `draw()` ≤ 24 ms at 4× CPU throttle (DPR 2, 390×844). Today it is 38.7 ms.
- Low graphics: no `over` scene, no `lighter` compositing on more than 1 layer, DPR ≤ 1.5.

### 1.7 Readability rules (hazards vs pickups)
- **Hazards:**
  - Have a warm glow (`--ember`/`--hurt`) **and** a dark rim (at least 2 px of `rgba(4,5,13,.8)` or a baked dark limb).
  - Read as solid, heavy shapes.
  - Drawn size ≥ hit circle.
- **Pickups:**
  - Have a **white-hot core** plus their token color.
  - Have no dark rim.
  - Gently pulse.
  - Drawn star outer radius ≥ 13 game units.
- **Scenery:**
  - Never above alpha .35 in the play lane (y 120–600 game units).
  - Never uses gold or `--hurt` above alpha .25.
  - Never draws black filled circles, red dots or vertical dashed lines (those are hazard language).
- **Gameplay text:** All text drawn over gameplay has a 3 px dark stroke (`rgba(4,5,13,.85)`) under it.
- **Gameplay is legible in grayscale:** hazards dark-rimmed, pickups bright-cored.

### 1.8 Never do
- Introduce a hex that is not a token.
- Ship text under 11 px.
- Use emoji as UI icons.
- Show more than **one toast + one banner** at once.
- Let floating texts overlap. They merge or stack.
- Put toasts or tips inside the top hazard lane (y 70–200) during an event or boss fight.
- Show a level preview with a hazard style that never appears in play.
- Add scenery that resembles a hazard.
- Show a full-white sector flash.
- Show a text wall on the start screen.
- Show the game title twice on one screen.
- Add a new `shadowBlur` in a per-object loop.

---

## 2. First impression (verdict)

The in-game art is closer to a premium game than the menus: the 3D meteors, the faceted ship, the live solar-flare beams and the gates rows all read well. The first five seconds, though, are a dark web page.
- The title appears twice.
- The start screen is a nine-line paragraph and a 95%-opaque overlay that hides the scene and the ship.
- Below that sit stacked dashboard panels in mostly one gold.

In play, three things look unfinished:
- Meteors and stars are low-contrast against several worlds.
- Floating texts pile into unreadable mush ("CLOSE +10CLOSE +10", "BLACK HOLE CLOSED" over "SURVIVED +100").
- Death, the most emotional beat, is a puff of 3 px squares.

Store screenshots today would show a nice mid-run frame and generic menus. It is not yet "never seen before".

---

## 3. Visual fixes, ranked (biggest impact first)

### 1. Hazards and pickups must pop on every world. Size M
**What's wrong.** In gameplay on Chrome Tide, Shadow Aurora and Red Circuit worlds:
- Meteors are dark brown (`PAL` albedo ~0.5) on navy/maroon skies, so their bodies nearly vanish. Only the faint tail shows (61_play_early, 90_level_38).
- Stars are drawn at r=10 (20 px), the same visual weight as the background shards and dust. On Golden Signal, Solar Vault and Quantum Throne the theme neon is itself gold, so stars blend in.

**The change.**
- `makeMeteors.renderFrame`:
  - Raise the rock base: multiply `PAL` by 1.25.
  - Add a rim light: `rim = pow(1 - z, 3) * 0.55` added as `#ffd6b0`.
  - Bake a 1.5 px dark limb (alpha edge band multiplied by .35 lightness).
  - Pre-render the entry-fire heat glow into each frame sprite. That removes 2 per-meteor gradients in `M3.draw`.
- `drawStar`:
  - Outer radius `r * 1.35` (≈13.5).
  - Draw from a cached sprite: a 64 px canvas with a white core (`#ffffff` at 0–25%), `#ffe08a` body, `#ffcc4d` edge and a soft gold halo.
  - Remove `shadowBlur` 18/30.
  - Gold star: the same sprite at 1.5× plus a white 4-point glint rotating, instead of the `hsla` rainbow ring.
- `makeThemes` LIST: move every gold-hued `a`/`b` (#ffd23e, #ffe08a, #ffd28a) to the world's set (rule 1.1).

**Performance.** Net win: removes ~2 gradients per meteor and 1 `shadowBlur` per star each frame.

### 2. Stop text collisions, and give toasts a home and a meaning. Size S
**What's wrong.**
- Floaters stack on the same spot: "CLOSE +10CLOSE +10", "BLACKSURVIVED +100", "GATE +50" over "MAGNET" (62, 64, 64d, 65b).
- Toasts sit at `top: 13%`, right on the incoming lane, covering flare "!" markers and the Mothership (66, 64b).
- Hazard toasts ("SOLAR FLARE", "MOTHERSHIP INCOMING") are teal, the "good" color, and repeat what the canvas banner already says.

**The change.**
- **Floater manager** in `tick()`/`draw()`:
  - Same text within 30 ticks: merge into one ("CLOSE ×3 +30"), restart its life and pop scale 1.25→1 in 150 ms.
  - Different texts within 24 px: offset each new one by −18 px.
  - Cap 4 on screen.
  - Draw with `strokeText` 3 px `rgba(4,5,13,.85)` first.
  - Size 14/16/20 only.
- "SURVIVED"/"CLOSED" event results: one centered result banner slot at y = H×0.30, never a floater.
- `.toast`:
  - Move to `top: 62px` (just under the HUD), font 13 px, padding 5×12.
  - Add `.toast.danger` (border/color `--hurt`) and `.toast.flare` (`--flare`).
  - Drop the toast entirely when a canvas banner (`drawWarning`) is showing.
  - Trophy and mission toasts wait until no boss or flare is active.

### 3. Rebuild the start screen as a hero shot. Size M
**What's wrong.**
- "METEOR PILOT" appears in the top bar *and* as the h2.
- There are 9 lines of rules text.
- The overlay at `.8–.95` opacity hides the animated scene, so the first impression is a dark form.
- The missions and loadout panels push Shop/Trophies/Settings below the fold.
- The footer ("Same course for everyone… Keyboard…") permanently eats 80 px and shrinks the stage. At 390×844 the stage ends 160 px above the bottom (01, 95).

**The change.**
- `#start` background: `linear-gradient(180deg, rgba(7,10,26,0) 0%, rgba(7,10,26,0) 38%, rgba(7,10,26,.88) 62%)`, so the live theme scene shows through the top half. Draw the player ship idling at (W/2, H×0.36) with roll sway ±0.25 and thrust.
- Remove the h2 while the start overlay is up; keep the top-bar logo. Or the reverse, but only one.
- Replace `.quick` with one line: "Drag to fly. Dodge rocks. Grab ★."
- Show the ghost line as a pill: "Beat 🇩🇪 2,950".
- **Play daily:** full-width (max 300), 56 px tall.
- **Levels:** outline-tide secondary, same width, 48 px.
- Collapse missions into one tappable row ("Missions 0/3 · +180 ◉") that expands.
- Bottom nav row of three 44 px icon buttons: Shop, Hangar, Trophies, with Settings as a gear in the top bar.
- Hide `.foot` (move its text to Settings).
- Let `fit()` use the freed height (also requested in the v25 audit, #9).

### 4. Make death, and hits, the best-feeling moment. Size M
**What's wrong.**
- Death (Classic boom) is 70 single-color 3 px squares and the ship just vanishes (69_death).
- A hit shows only the ship blinking.
- The shatter wedges are drawn with orange wireframe strokes that read as hollow triangles (67, 90_level_40).

**The change.**
- `BOOMS.classic.play`:
  - (a) 180 ms white core flash: a cached radial sprite scaled 0→2.4 with easeOutCubic.
  - (b) 2 rings: `#ffffff` max 140, w 4; `--ember` max 90, w 3.
  - (c) cut the ship into 4 hull shards from `SHIP3D.icon` the same way `shatter()` does, spinning out.
  - (d) 28 sparks using a cached additive glow-dot sprite (8 px), colors `#fff`/`#ffcc4d`/`#ff7a3d`.
  - (e) 350 ms of 0.3× time scale before `gameOver()`.
  - (f) camera punch-in: `ctx.scale(1.05)` about the ship, easing back over 300 ms.
- Hit:
  - A red vignette from a cached edge-gradient sprite (alpha .35, 250 ms).
  - The ship flashes white for 2 frames, then blinks.
- `drawChunks`: drop the orange edge stroke. Use a 1 px `rgba(255,190,140,.5)` only on the lit edge, and let chunks fade by alpha only.

**Performance.** Sprites only, with no new per-frame gradients.

### 5. Give each world a real identity and drop noisy scenes. Size M
**What's wrong.** The contact sheet of all 40 themes shows four worlds that blur together:
- `scene`/`over` are mixed randomly. The same striped sun, sonar rings and planet appear in every world.
- Shadow Aurora (38) is olive/brown mud.
- The `data` scene draws hex digits that read as debug text and compete with boss bullets (66b).
- Neon Crown's striped sun sits on top of the planet (63b).

**The change.** A scene vocabulary per world in `makeThemes`:

| World | Scenes |
|---|---|
| Neon Belt | grid, skyline, sun-grid |
| Red Circuit | circuit, tunnel, heat shimmer bands |
| Prism Rings | planet, shards, aurora (cool hues only) |
| Quantum Void | faint hole swirl, warp, glitch slices |

Then:
- Never pair `planet` with `grid` (two focal suns).
- Retire `data` or limit it to alpha .12 with no white head.
- `aurora`: set band alpha to .12 and use only the world set (no green/olive in Quantum Void).
- Add one **world-wide signature color grade**: an overlay multiply tint per world, cached and drawn once into the background layer.
- Make the level-brief preview (`drawPreview`) show the real 3D meteor for all 3 samples. The wire/crystal/glitch hazard styles never appear in play (M3 sprites always win), so the preview misleads. Delete the unused `drawHazard` styles.

### 6. Cache the background, and kill per-frame `shadowBlur`. Size M (performance)
**What's wrong.**
- Full `draw()` costs 38.7 ms at 4× throttle.
- `aurora`, `sonar` and `grid` build gradients every frame.
- `drawStar`, `drawPower`, `drawCores`, `drawShip`, `drawIntro`, `drawWarning` and the trails use `shadowBlur` (10–30) every frame, which is slow on old Android GPUs.
- The v25 audit already found the background at 50–70% of draw time.

**The change.**
- `TH.drawBackground` renders into one offscreen canvas at 1× logical size (360×640), refreshed every 2nd frame (every 3rd in low graphics). The main canvas does `drawImage` once.
- Make the sky gradient + `over` scene a static cached layer per theme.
- Replace every `shadowBlur` listed above with cached glow sprites keyed by color (helper `glowSprite(color, r)` → 64 px canvas).
- Flare gradients: cache per beam width.

**Target:** 1.6 budget.

### 7. Tidy the HUD. Size S
**What's wrong.**
- The HUD band is `rgba(7,10,26,.6)`, so meteors and stars slide visibly *under* the score (61, 64b).
- The ghost/goal label is 11 px.
- The combo pips are 10×4 and barely visible.
- The pause button is 34 px.
- The Halo siphon bar collides with the ghost label.

**The change.**
- HUD band: a gradient from `rgba(7,10,26,.92)` at y=0 to `rgba(7,10,26,0)` at y=64, plus a 1 px `--rule` line at y=54.
- Score: 28 px.
- Combo pips: 14×5, gold when lit, with a ×N badge in a gold pill.
- Ghost/goal label: 12 px with the 3 px dark stroke.
- `.pausebtn`: 44×44, radius 12.
- Move the siphon bar to y 40 under the shields, width = the shields group.

### 8. The player ship must dominate, not the ghost. Size S
**What's wrong.**
- The ghost ship is the same size as the player at alpha .4, in solid teal, often overlapping the player at start (59, 96).
- The player ship is small (~30 px) and lacks an anchor.

**The change.**
- `drawShip` ghost: alpha .22, scale .85, no engine flame, flag 10 px below at alpha .6.
- Player:
  - scale ×1.12 (visual only, keep the hit radius).
  - A cached under-glow ellipse 34×10 in `shipLook().flame` color at alpha .35 below the ship.
  - A 1 px white rim highlight on the lit hull faces in `SHIP3D.draw`.

### 9. A Mothership worth fighting. Size M
**What's wrong.**
- The boss is a 136×36 generic saucer parked at the top edge.
- It is half-covered by the toast and visually smaller than a bullet wall (66, 66b).
- The warning banner and a duplicate toast stack (65b).

**The change.** In `drawMothership`:
- Scale ×1.35, with a segmented hull (3 plates with dark seams) and 5 visible core sockets that go dark as `hp` drops.
- The underside glow pulses with the bullet volleys.
- Entrance: 70-frame descent from y −90 with scale 1.25→1, screen dims 18% (`--space` overlay), and a low rumble. One 10-unit shake on arrival.
- The HP bar becomes a name plate ("MOTHERSHIP · MK I") with 5 segments under the HUD.
- Remove the "MOTHERSHIP INCOMING" toast (the banner covers it).

### 10. Redraw the black hole and the comet head. Size S
**What's wrong.**
- The black hole's accretion disk is `setLineDash` ellipses, which read like a UI selection "marching ants", not a glowing disk (63b).
- The comet head renders as a flat white trapezoid with a hard bottom edge (64, 64d).

**The change.**
- `drawWell`:
  - Pre-render a 256 px accretion disk sprite once: a conic gradient of `#ffd696` → `#c58bff` → transparent, squashed 0.32, plus a thin white photon ring.
  - Draw the back half, the core, then the front half by clipping.
  - Rotate by `t*0.02`.
  - Keep the streaks (10 low / 18 high).
- `M3.drawComet`:
  - The head is a cached radial sprite (white→`#ffb0bc`→0) at r×2.6.
  - The tail's top is a quadratic curve to a point, without a flat base.
  - Add a dark 2 px outline ring on the head so it obeys the hazard rule.

**Performance.** Removes 6 dashed strokes per frame.

### 11. One consistent component kit across menus. Size S
**What's wrong.**
- Emoji icons (🔥🛒🏆⚙🔒) are mixed with unicode ◉ ✦ ♛ and letter icons "U", "×".
- "Done" (gold primary) in Hangar/Settings vs "Back" (outline) in Levels/Shop/Trophies.
- The coin balance is shown twice on Hangar/Shop.
- Level tile names are 8 px and truncated ("Neon Horiz…").
- The Quantum Void tab wraps to 3 lines.
- Boss tiles (10/20/30/40) look like normal tiles.
- Pause stacks 5 buttons in 3 rows.

**The change.**
- Inline SVG icon set: coin, flame, cart, trophy, gear, lock, magnet, combo, star, nova.
- One "Back" outline button at the bottom of every overlay.
- Remove `.h-top .chip.coin`.
- `.lt .nm` at 11 px, showing only on the selected tile or in the brief.
- `.wtab` font 12 px with names shortened to one line ("NEON", "RED", "PRISM", "VOID") and the full name in the `.whead`.
- `.lt.boss`: a 2 px `--hurt` top border and a small skull/saucer glyph.
- Pause: Resume (primary) plus one row of 3 icon buttons (music, sfx, settings), with "End run" as a text button.

### 12. Hangar and Shop that sell the ship. Size M
**What's wrong.**
- Ships are 44 px thumbnails in spreadsheet rows with stat bars.
- Paints are shown as flat color bars, not on the ship.
- Booms preview is an empty dark box between loops (31).
- Every buy button is the same gold, so nothing stands out (30).

**The change.**
- Hangar top: a 300×170 "turntable" canvas showing the selected `SHIP3D` at scale 2.6, slow roll ±0.5 and thrust, on the current theme sky. Tapping a ship card swaps it with a 220 ms crossfade.
- Shop paints: the swatch becomes `SHIP3D.icon(paint.body, paint.flame, model)` on a dark tile, with the rarity stripe kept.
- Buy buttons: gold only when affordable. Otherwise an outline with the price in `--muted`.
- Booms: loop period 90 frames instead of 130, so the preview is never empty for more than 0.6 s.
- Store: a 2-column card for the Supporter Pass with a gold gradient border; the packs stay as rows.

### 13. Game over with a reveal, not a receipt. Size S
**What's wrong.**
- The result is a stack of same-weight text: big score, a red-orange "1,504 short of the ghost", a paragraph of 8 trophies, then two primary-looking buttons (gold "Play again" + tide "Levels").
- Missions are cut off at the bottom (80).

**The change.**
- Score counts up over 600 ms (easeOutCubic).
- The ghost verdict sits in `--muted` when lost (`--tide` when won). Never orange.
- Stats row as 4 chips.
- New trophies as up to 3 icon chips that pop in (starpop, 120 ms stagger) plus "+5 more".
- Play again is the only primary. Levels becomes secondary outline.
- Missions only appear if one changed this run.

### 14. Bundle the fonts. Size S
**What's wrong.** Store and offline builds load Chakra Petch and Atkinson from Google Fonts. Without network, everything falls back to the system sans and the game loses its futuristic voice; the screenshots show the fallback.

**The change.**
- Ship `fonts/ChakraPetch-500.woff2`, `-700.woff2`, `AtkinsonHyperlegible-400.woff2`, `-700.woff2` with `@font-face { font-display: swap }`.
- Remove the Google Fonts link.
- Before the first canvas text, `await document.fonts.load("700 24px 'Chakra Petch'")` so the HUD never draws in the fallback font.
- Add the fonts to `sw.js` precache.

### 15. Signature wow: the hyperspace sector jump. Size M
**What's wrong.** A daily-run sector change is a 60%-white full-screen flash plus a toast (63b), which is harsh and cheap. This is the moment that should make a store video.

**The change.** On sector change (`tick()` where `sec > sector`), play a 600 ms transition:
1. 0–200 ms: the `warp` streak field (already in `SCENES.warp`) ramps from alpha 0 to .8, with streak length ×3.
2. 200–400 ms: crossfade the cached background layer from the old to the new theme. Chromatic split ±3 px on the background layer only.
3. 400–600 ms: the streaks decay. The theme name types on in the existing `drawIntro` style at 22 px.

Constraints:
- No white flash.
- Gameplay objects stay fully readable throughout. Only the background layer transitions.
- Calm mode: a 300 ms crossfade only.

**Performance.** Reuses the cached layers. One extra `drawImage` during the transition.

---

## 4. Review checklist for each new version (yes/no)

1. Does every color added or changed in this version map to a token in 1.1, and is no theme `a`/`b` in the 35°–60° gold hue band?
2. Is all text, in menus and on canvas, at least 11 px, with one title per screen and no emoji used as UI icons?
3. On a 360×640 and a 390×844 screenshot of a busy moment (event + black hole or boss), can you tell every hazard from every pickup in under one second, including in grayscale?
4. During that busy moment, are there zero overlapping floating texts and at most one toast and one banner?
5. Does every screen have exactly one primary (gold) button, with the same Back component and the same radii (8/12/18/999)?
6. Is `draw()` at most 24 ms at 4× CPU throttle mid-run (DPR 2, 390×844), and was no `shadowBlur` or per-frame gradient added inside a per-object loop?
7. Does any new effect respect the motion table (durations, easing, shake and flash caps) and degrade in Calm and Low graphics modes?
8. Does any new scenery stay at or below alpha .35 in the play lane, and avoid black cores, red dots and vertical dashed lines?
9. Does the start screen still show the live scene and ship in the top half, with no more than one line of instructions?
10. Would a frame from the 3 seconds around this version's new feature work as a store screenshot as-is (no debug text, no clipped UI, no placeholder art)?
