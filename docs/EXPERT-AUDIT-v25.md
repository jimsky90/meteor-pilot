# Meteor Pilot: expert audit of v25 (2026-11-07)

How it was tested:
- **Bot playtests:** three bot profiles (casual, average, skilled), driving the real game rules in Node.
- **Screens:** Playwright at 360×640, 390×844 and 820×1180.
- **Speed:** frame timing at 3× pixel density.

The bots are weaker than real players, so use the trends rather than the exact numbers.

## Verdict
The core game is fair. A reachability check over 15 daily courses found no unavoidable hits, and every gap is at least 50 px wider than the ship.

The biggest problem is that the daily mode's best content and goals sit beyond where players die:
- The ghost bot survives a median of 64 s, and an average bot 38–40 s.
- The Mothership arrives at 1:45. The ghost reached it on 2 of 40 days and the test bots on 0 of 40.
- Some daily missions are mathematically out of reach.

## Bugs
1. **"Fly through 6 gates" mission is impossible or near-impossible** (high). Each gates event has only 4 gates, and the boss can hide the second gates event. `missions()` / `MISSION_POOL` ignore the event schedule.
2. **Supporter Pass is not cosmetic** (high). +25% XP leads to more rank-up coins, which buy upgrades and unlock ships sooner. After 7 days a payer has 6,830 coins versus 5,510 for a non-payer.
3. **The streak chip shows a broken streak** (medium). It only resets inside the daily-mode game over, and Level runs never count toward it.
4. **Page scrolls sideways at 360 px** (medium). The top bar overflows, and the installed app's Install chip makes it worse.
5. **The decorative black hole looks like the real hazard** (medium). `SCENES.hole` is bigger and scarier than the real one (`drawWell`).
6. **Tapping a level tile freezes the screen for 90–155 ms** (low–medium). `LV.get` runs `pickSeed` (up to 200 `makeWorld` calls) plus `recordGhost`.
7. **Background resume skips the countdown** (low). Hiding the app during the 3-2-1 skips it on return.
8. **Players' tablet and phone space is wasted** (low). `fit()` caps the stage at 420 px, and it is only 309 px wide at 360×640.
9. **Leftover crypto code** (low). Unused wallet/sats CSS and old Bitcoin changelog entries.

## Top 10 improvements (ranked)

**1. Make the Mothership reachable.** Effort M. Touches the rules.
- `DAILY_BOSSES` to `[{t0:60s, lvl:0}, {t0:150s, lvl:2}]`.
- First flare at 48 s.
- Update the "1:45" text on the start screen.

**2. Fix the daily mission generator.** Effort S. Touches the rules.
- Sizes: time 30/45/60, gates 2/3/4 (only pick gates when a gates event starts before 60 s), score 600/1200/2000, close calls 3/6/10.
- Fixed +50 bonus for clearing all three.

**3. Lower the world unlock walls.** Effort S.
- World `need` to 15/35/60.
- No shield cut in world 3.
- Star 3: "Finish with full shields **or** beat par ×1.3".

**4. Make hazards read the same on every theme.** Effort S.
- Drop the `hole` scene, or draw it faint with no black core.
- Draw weaving rocks as 3D rocks with a violet rim instead of the five theme styles.

**5. Make the Supporter Pass cosmetic only.** Effort S.
- Replace +25% XP with an exclusive trail and explosion effect.
- Flat 40 coins per rank-up, so unlocks stretch across days 2–9.

**6. Turn the streak into a real daily hook.** Effort M.
- Fix the streak bug, and count any run (Levels included).
- Fixed daily gift ladder: 30/40/50/60/80/100, then a paint on day 7.
- Earn one "streak shield" a week by clearing all 3 missions.

**7. Honest, beatable ghost.** Effort M. Touches the rules.
- Label it "Bot · PH".
- Raise the lapse in `recordGhost` to `0.035+t*0.0006`, aiming for a median near 45 s.
- For a player's first 5 runs, show only "beat your best".

**8. Cut background drawing cost.** Effort M.
- `TH.drawBackground` is 50–70% of draw time (7–17 ms per frame), and `aurora` alone is 10.4 ms.
- Render the background offscreen at 1× and redraw it every 2nd frame.
- Cap the pixel ratio at 2.
- Use cheap scenes in low graphics.
- Cache the flare gradients.

**9. Fix phone and tablet layout.** Effort S.
- Hide the footer while playing.
- Icon-only chips below 380 px.
- Let the stage fill the height on tablets.
- 44 px pause button.
- No text smaller than 11 px.

**10. Remove dead air at the start.** Effort S. Touches the rules.
- Events start at 14 s (`TPS*(14+k*24)`).
- Spawn interval `max(11, 34 − secs*0.45 + rng*14)`.
- The ship SPEED stat barely matters: show only Agility and Shields, or make speed affect the black-hole pull.

## First 10 minutes
- The first-ever run should be Level 1, not the daily.
- Move the tip box just under the HUD, out of the lane where meteors come in.
- Cut the start screen text to one line: "Drag to fly. Dodge rocks, grab ★."
- Introduce each hazard with a toast the first time it appears.
- The "Event Horizon" trophy should require a star caught near the black hole, not just surviving.
