# Meteor Pilot: economy and retention plan (based on v28, 2026-11-10)

## Summary
- **Pilot rank is broken.** XP is a tenth of your score, and the XP needed per rank barely grows. A regular player reaches Legend (rank 20) on day 3 and rank 69 by day 30. A strong player is rank 174. So the rank gates on ships do nothing.
- **Players get too much in the first days, then nothing.** A regular player owns every ship by day 5. A strong player has bought everything in the game by day 15, then has 15 days with nothing new and 18,000 unspent coins.
- **There is no reason to come back for a week or a month.** The streak pays once (30 coins at 3 days), the gift is a flat 30 coins, and nothing spans a week or belongs to a ship.
- **The fix:** XP from time flown instead of score, with a curve that grows with rank. Spread the ship unlocks out. Add four goals with fixed, stated rewards: a weekly mission ladder, ship mastery, a gift ladder that never resets, and a guilt-free streak with a welcome-back gift. Add one new thing to spend coins on (ship finishes).
- **Effect in the model:** a regular player now reaches Legend on day 18 (was day 3) and gets Phantom on day 11 (was day 5). Played days with nothing new drop from 5 of 28 to 1. A strong player's unspent coins at day 30 fall from 18,071 to 285, and dry days fall from 15 to 2. Nothing new is random or sold for money.

---

## 1. How this was measured
- **Bot runs:** The real game rules (`window.CR`) and level code (`makeLevels`) were loaded in Node, unchanged. A tunable version of the ghost bot played them.
- **Three skill levels**, set by how long they survive on the daily course with the starter ship:

| Player | Runs a day | Days missed | Survival on the daily course (25th / median / 75th percentile, s) | Stars per run (median) |
|---|---|---|---|---|
| Casual | 3 | 8 of 30 (about 2 a week) | 25 / 41 / 58 | 4 |
| Regular | 10 | 2 of 30 | 46 / 59 / 87 | 10 |
| Strong | 25 | none | 67 / 87 / 103 | 26 |

- **Bank of runs:**
  - 60 daily courses per player and per gear level (starter ship, mid gear, full gear).
  - 6 tries per level per player and gear level on all 40 levels.
- **The 30-day (and 90-day) model:**
  - Uses the real daily missions for 2026-11-10 onward.
  - Players split runs 50/50 between Levels and the daily course.
  - They save for the next ship they can unlock, then buy the cheapest thing left.
  - Each run takes the run time plus 12 s of menus.
- **Limits of the model:**
  - Bots chase close calls and stars less than people do. People probably earn 10–15% more coins from runs.
  - Bots rarely clear close-call levels (4, 14, 24, 34). The model therefore lets a person who has failed a level 3+ times scrape 1 star on 30% of later tries.
  - Use the trends, not the exact numbers.
- **Robustness:** Single-run timelines are shown below. Medians over 20 random seeds are in section 6, and they agree.
- **Scripts:** `/tmp/claude-0/-home-claude/a43d0df2-ba07-558a-81cd-37b065e28b52/scratchpad/econ/` (`bank.js` builds the run bank, `econ.js` is the model, `report.js` prints the tables, `ablate.js` adds one change at a time). This is a temporary folder, so copy it to `tools/econ/` if you want to keep it.

---

## 2. Current economy (v28)

### Where coins come from
| Source | How much | Notes |
|---|---|---|
| Run coins | 1 coin per star caught | Casual ≈ 4 per run, regular ≈ 10, strong ≈ 26. `gameOver()` / `finishLevel()` |
| Daily missions | 30 / 60 / 90, plus 50 for clearing all three | Max 230 a day. Count in any mode. `CR.missions()`, `checkMissions()` |
| Daily gift | 30 flat | Claimed in the Shop. `DAILY_GIFT` |
| Rank-up | 40 flat per rank | `levelUpCoins()` |
| Level stars | 10 / 15 / 20 / 25 per new ★ (worlds 1–4) | 2,100 total for 120 ★ |
| Trophies | 21 one-time trophies, 10–60 each | 655 total |
| Streak | Only the 3-day "Regular" trophy (30) | — |

### What coins buy
| Item | Prices | Unlock rule |
|---|---|---|
| Ships (`CR.SKINS`) | Ember 60, Aurora 180, Nebula 400, Halo 500, Void 800, Phantom 1,100 (total 3,040) | Rank 2 / 4 / 7 / 6 / 10 / 13 (`SHIP_RANK`) |
| Upgrades (4 tracks × 5 levels) | Magnet / Nova 40-100-220-400-700, Guard 60-140-300-520-850, Polish 50-120-260-450-750 (total 6,420) | None |
| Trails | Sparks 80, Rainbow 220, Plasma 450, Stardust 900 (total 1,650) | Rank 3 / 5 / 8 / 12 (`TRAIL_RANK`) |
| Paints, badges, explosions (22 items) | Common 120, Rare 300, Epic 650, Legendary 1,200 (total 10,690) | None |
| **Everything** | **21,800 coins** | |

### Rank and worlds
- **XP per run** is score ÷ 10, plus 25 per new level star. **XP per rank** is 80 + 40 × rank. Reaching rank 20 takes 9,120 XP in total.
- **Rank names:** Cadet 1, Pilot 3, Ace 6, Captain 10, Commander 15, Legend 20. Nothing comes after 20.
- **Worlds** open at 0 / 15 / 35 / 60 ★. Quantum Void (world 4) also takes away one shield.
- **Real-money store:** the Supporter Pass and two paint packs. Fixed contents, looks only. This complies with the rules.

### Before: 30-day timelines (single run, seed 1)

**Casual** (3 runs on play days, about 2.8 minutes)

| Day | Rank | Ships | Level ★ | Upgrades | Cosmetics | Coins earned | Unspent |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 3/7 | 3 | 4/20 | 0 | 467 | 37 |
| 3 | 7 | 4/7 | 11 | 5/20 | 0 | 1,204 | 194 |
| 7 | 12 | 5/7 | 26 | 5/20 | 0 | 2,022 | 512 |
| 14 | 17 | 6/7 | 32 | 5/20 | 0 | 3,182 | 872 |
| 21 | 20 | 7/7 | 42 | 7/20 | 4 | 4,136 | 26 |
| 30 | 23 | 7/7 | 44 | 9/20 | 7 | 4,975 | 145 |

Milestones:
- Ships: Ember and Aurora on day 1, Nebula day 3, Halo day 6, Void day 10, Phantom day 17.
- Worlds: world 2 day 6, world 3 day 17, world 4 never within 30 days (day 45).
- Legend on day 20.
- 8 of 22 play days bring nothing new.

**Regular** (10 runs, about 12.7 minutes a day)

| Day | Rank | Ships | Level ★ | Upgrades | Cosmetics | Coins earned | Unspent |
|---|---|---|---|---|---|---|---|
| 1 | 10 | 5/7 | 8 | 4/20 | 0 | 1,356 | 26 |
| 3 | 21 | 6/7 | 9 | 4/20 | 0 | 2,654 | 524 |
| 7 | 31 | 7/7 | 58 | 9/20 | 7 | 4,833 | 3 |
| 14 | 44 | 7/7 | 92 | 13/20 | 13 | 8,353 | 323 |
| 30 | 69 | 7/7 | 110 | 18/20 | 18 | 15,095 | 595 |
| 60 | 101 | 7/7 | 114 | 20/20 | 22 | 26,198 | 4,398 |
| 90 | 129 | 7/7 | 114 | 20/20 | 22 | 38,174 | 16,374 |

Milestones:
- 4 ships on day 1, Phantom day 4. Legend on day 3.
- Everything bought by day 49, then **40 days in a row with nothing new**.

**Strong** (25 runs, about 41 minutes a day)

| Day | Rank | Ships | Level ★ | Upgrades | Cosmetics | Coins earned | Unspent |
|---|---|---|---|---|---|---|---|
| 1 | 27 | 6/7 | 9 | 6/20 | 0 | 2,693 | 283 |
| 7 | 74 | 7/7 | 88 | 16/20 | 15 | 11,484 | 334 |
| 14 | 114 | 7/7 | 114 | 20/20 | 21 | 20,663 | 63 |
| 30 | 174 | 7/7 | 114 | 20/20 | 22 | 39,871 | 18,071 |
| 90 | 310 | 7/7 | 114 | 20/20 | 22 | 108,055 | 86,255 |

Milestones:
- Legend on day 1, all ships by day 2.
- Everything bought by day 15. **Days 16–30 bring nothing new.**

Where the coins came from over 30 days (before):

| | Missions | Run coins | Rank-ups | Gift | Level ★ | Trophies |
|---|---|---|---|---|---|---|
| Casual | 37% | 10% | 18% | 13% | 11% | 11% |
| Regular | 36% | 24% | 18% | 6% | 12% | 4% |
| Strong | 17% | 57% | 17% | 2% | 5% | 2% |

---

## 3. Problems found (most serious first)

1. **Rank inflation.** XP is score ÷ 10, and the XP per rank grows only 40 at a time.
   - Regular players hit Legend on day 3, and strong players on day 1. By day 30 a strong player is rank 174.
   - Rank titles stop at 20, so 150+ rank-ups mean nothing.
   - Every ship's rank gate is passed on day 1–5 for regular and strong players.
   - Rank-up coins become a big source (6,920 for strong in 30 days).
   - Because XP follows score, Star Polish upgrades also speed up ranking. Better gear means faster rank, which means more coins.
2. **Players get too much at the start, then hit a cliff.**
   - A regular player buys 4 ships on day 1 and all 7 by day 5. Even a casual player owns all 7 by day 17–19.
   - Ember (60) and Aurora (180) cost less than one day of missions.
   - The best part of the game, getting a new ship, is gone by the end of week 1.
3. **The catalog runs out and coins pile up.**
   - Strong players finish everything on day 15 and regular players on day 49. After that there is nothing to buy.
   - Unspent coins reach 18k at day 30 and 86k at day 90 for strong players. Anything added later gets bought instantly.
4. **Nothing to aim for over a week or longer.**
   - Daily missions are the only goal that repeats.
   - Trophies are one-time, and a regular player clears most of them in week 1.
   - No goal spans a week, belongs to a ship, or rewards collecting.
5. **The daily return hooks are thin and a little punishing.**
   - The gift is a flat 30 coins.
   - The streak pays once (30 coins at 3 days), and one missed day resets it to 0.
   - There is no "welcome back" for a player who drifted away. That is exactly when a kind nudge matters most.
6. **A run on its own pays very little.**
   - Run coins equal stars caught. A casual 40-second run pays about 4 coins (8 coins per minute of play), while a single mission pays 30–90.
   - A run that finishes no mission feels unpaid. That is most runs for a casual player, who completes 1.5 missions a day.
7. **Casual players have empty days.** 7–8 of 22 play days bring nothing new.
8. **World 4 is a wall for casual players.**
   - They have about 44 ★ at day 30, and Quantum Void needs 60.
   - Quantum Void is also very hard, because it takes a shield away. Even the strong bot got 0 ★ in every try on levels 32, 34 and 38.
   - The level designer should review it. This plan only lowers the gate.
9. **Small issues:**
   - The "next unlock" card ignores the rank lock. It says "Void unlocks at ◉ 800" while Void is still rank-locked.
   - The daily gift is only visible inside the Shop.
   - `save.missions` keeps one entry per day forever.

Fairness check: nothing in v28 is pay-to-win. The Supporter Pass and packs are looks only, no coins are sold, and nothing is random. Section 7 adds a rule so that new collection rewards can't be reached faster by paying.

---

## 4. Changes, ranked by impact

The effect of each change comes from adding it on top of the previous ones in the model (30 days, seed 1; "bank@60" means unspent coins on day 60). Changes 1 and 4 touch the same numbers, so ship them together.

| Step | Casual | Regular | Strong |
|---|---|---|---|
| Before | rank 23, Phantom d17, 8/22 empty days | rank 69, Legend d3, Phantom d4, 5/28 empty, bank@60 4,398 | rank 174, Legend d1, 15/30 empty, 15-day dry spell, bank@30 18,071 |
| + 1 Rank rework (and new prices) | rank 13, Phantom after d30 | rank 23, Legend d18, Phantom d13 | rank 38, Legend d5 |
| + 2 Run coins, Fresh Fuel, daily limit | 8/22 empty | 4/28 empty | bank@30 6,170, 9/30 empty |
| + 3 Weekly ladder | 5/22 empty | 4/28 empty | 5/30 empty, longest dry spell 3 days |
| + 4 Ship mastery and finishes | 3/22 empty | 1/28 empty, bank@60 825 | 2/30 empty, bank@30 620 |
| + 5 Gift ladder, streak saver, welcome back | 2/22 empty, +1,300 coins | 1/28 empty | 2/30 empty |
| + 6 Collection milestones | 2/22 | 0/28 | 2/30 |
| + 7 World 4 at 50 ★ | world 4 on day 41 (was 52) | world 4 on day 7 (was 9) | — |

### 1. Rework pilot rank: XP from flying, a rising curve, spaced-out unlocks. Size M.
Why: this fixes problems 1 and 2 and makes rank a goal that lasts weeks.

**XP per run**
- **Value:** `runXP(r, newStars) = min(400, 10 + floor(r.t / TPS) + 2 × r.stars) + 25 × newStars`. In words: 10, plus 1 per second survived, plus 2 per star, with the total capped at 400; then add 25 per new level star.
- **Where:** `makeLevels()` → `runXP`.
- **Change from now:** score no longer counts. Typical XP per run is casual ≈ 60, regular ≈ 90, strong ≈ 150.

**Mission XP**
- **Value:** +20 / +30 / +40 XP for the easy / medium / hard mission, plus 30 XP for clearing all three.
- **Where:** in `checkMissions()`, add the XP to a run variable `runMissionXP`. Then add it with the run XP in `gameOver()` / `finishLevel()`, so no rank-up pops up mid-run.

**XP needed per rank**
- **Value:** `xpNeed(lv) = 50 + 20 × lv + 6 × lv²`.
- **Where:** `makeLevels()` → `xpNeed`.
- **Change from now:** the first ranks come quicker (rank 3 after about 3 casual runs). Legend now takes 19,570 XP instead of 9,120.

**Rank-up coins**
- **Value:** `levelUpCoins(lv) = lv ≤ 20 ? 30 + 5 × lv : 100`. That is 40 at rank 2 and 130 at rank 20.
- **Where:** `makeLevels()` → `levelUpCoins`.
- **Change from now:** fewer rank-ups, each one worth more.

**Rank titles**
- **Value:** add `[30, "Legend II"], [40, "Legend III"], [50, "Legend IV"], [60, "Legend V"]`.
- **Where:** `RANKS`.
- **Change from now:** gives meaning to ranks above 20.

**Ship prices**
- **Value:** Ember 100, Aurora 250, Halo 500, Nebula 650, Void 1,000, Phantom 1,400.
- **Where:** `cost` in `CR.SKINS`. Price data only; scoring and `loadoutCfg` are untouched.
- **Change from now:** the total goes from 3,040 to 3,900.

**Ship rank gates**
- **Value:** Ember 2, Aurora 4, Halo 6, Nebula 9, Void 12, Phantom 16.
- **Where:** `SHIP_RANK`.

**Trail rank gates**
- **Value:** Sparks 3, Rainbow 5, Plasma 9, Stardust 13.
- **Where:** `TRAIL_RANK`.

**Upgrade level gates**
- **Value:** upgrade level 1 / 2 / 3 / 4 / 5 needs rank 1 / 3 / 6 / 10 / 15.
- **Where:** new `UP_RANK = [1, 3, 6, 10, 15]`. Use it in `renderHangar()` (show "🔒 Lv N", the same way ships do) and in `buy("up")`.
- **Change from now:** upgrades spread over weeks instead of being bought on day 1.

**Next-unlock card**
- **Value:** show the next ship the player can actually reach. If it is rank-locked, say "Reach Lv N" instead of the coin cost.
- **Where:** `nextUnlockHTML()`.

**Existing saves**
- Keep `save.pilot` and everything already owned. Nobody is demoted.

After this change, each rank brings: 2 Ember · 3 Sparks, upgrades up to level 2 · 4 Aurora · 5 Rainbow · 6 Halo, upgrades up to level 3, Ace · 9 Nebula, Plasma · 10 upgrades up to level 4, Captain · 12 Void · 13 Stardust · 15 upgrades up to level 5, Commander · 16 Phantom · 20 Legend · 30, 40, 50 Legend II, III, IV.

Total XP needed to reach each rank:

| Rank | 3 | 6 | 10 | 12 | 16 | 20 | 30 |
|---|---|---|---|---|---|---|---|
| Now | 280 | 1,000 | 2,520 | 3,520 | 6,000 | 9,120 | 19,720 |
| New | 190 | 880 | 3,060 | 4,906 | 10,590 | 19,570 | 61,480 |

Model results:
- Regular: Legend day 18 (was 3). Ships on days 1, 1, 2, 3, 6, 12. Rank 23 at day 30 (was 69).
- Casual: rank 13 at day 30. Halo on day 7, Nebula day 14, Void day 26, Phantom day 56.
- Strong: Legend on day 5.

### 2. Run coins that feel earned: time pay, Fresh Fuel, a fair daily limit. Size S.
**Run coins**
- **Value:** `stars + floor(seconds / 15)`.
- **Where:** `gameOver()`: `earned = me.stars` → the new formula. Same change in `finishLevel()` (`runCoins`).

**Fresh Fuel**
- **Value:** the first 5 runs of each day pay double run coins. Show "Fresh Fuel ×2 · run 2 of 5 today" on the end screen.
- **Where:** new `save.fuelDay` and `save.runsToday`.
- **Why:** rewards short daily visits, not marathon sessions.

**Daily run-coin limit**
- **Value:** 500 run coins per day. After that, runs pay 0 run coins. Missions, gift, XP, mastery, weekly rewards and trophies still pay. End-screen text: "Today's run coins: 500/500. Missions, XP and mastery still count. Refills tomorrow."
- **Where:** new `save.runCoinsDay` and `save.runCoinsToday`.
- **Why:** caps runaway hoarding and gently says "take a break." The model's regular player never hits it (about 245 a day).

Effect:
- Casual run coins rise from about 8 to about 20 coins per minute of play.
- Strong unspent coins at day 30 fall from 14k to 6k (before ship mastery).
- Trade-off: a strong player's 11th+ run of the day pays no run coins. If that feels harsh, use "half pay after 500" instead.

### 3. Weekly mission ladder. Size S–M.
- **What it counts:** missions completed this week. Weeks run Monday to Sunday (game day 2 was a Monday, so `week = floor((day − 2) / 7)`). The count comes from the existing `save.missions[d]` for the 7 days of the week.
- **Steps:** 5 missions → +100 coins · 10 → +150 · 15 → +200 and **this week's cosmetic**.
- **Weekly cosmetics:** a fixed rotation of 8 items, `week % 8`, that are never sold:
  1. "Comet Tail" paint `#ffe9a8 / #ff7a3d`
  2. "Weekender" badge
  3. "Solar Wind" paint `#ffd23e / #ff5ef1`
  4. "Night Shift" badge
  5. "Deep Field" paint `#1b2550 / #4fb8ff`
  6. "Ion Drift" paint `#3ef0ff / #7cf3a0`
  7. "Orbit" badge
  8. "Red Giant" paint `#ff4f62 / #ffcc4d`
- **Honest display:** show the item and the line "back in the rotation in 8 weeks". Show the reset as plain text, "Resets Monday", with no ticking timer.
- **UI:** a panel under "Today's missions" (`missionHTML()`) and on the start screen, e.g. "This week: 7/15 · next: 10 → +150 ◉".
- **Saving:** `save.week = { n, paid: [] }`.
- **Effect:** about +450 coins a week for regular players. Casual players reach the first 1–2 steps. Strong players' longest dry spell drops from 7 days to 3.

### 4. Ship mastery, plus ship finishes to spend coins on. Size M.
- **Tracking:** add each run's seconds to the ship flown, in `save.flown[shipId]`.
- **Mastery levels** at 5 / 15 / 30 / 60 / 100 minutes flown in that ship:
  - L1: +50 coins
  - L2: a "Mk II" paint for that ship (free, never sold)
  - L3: +100 coins
  - L4: a "<Ship> Ace" badge
  - L5: a "<Ship> Master" badge
- **Mk II paint colors:**
  - Comet `#ffe9a8 / #ff4f62`
  - Ember `#ff2e2e / #ffe03e`
  - Aurora `#3ef0b0 / #b07bff`
  - Halo `#e8f7ff / #4fb8ff`
  - Nebula `#c03ea5 / #3ef0ff`
  - Void `#1b1530 / #ff5ef1`
  - Phantom `#6b5bd6 / #7cf3a0`
- **Finishes (new coin sink, looks only):** three finishes per ship:
  - **Chrome:** 300 coins, needs mastery 1. Silver body, stronger shine.
  - **Holo:** 700 coins, needs mastery 3. Slow color cycle, like the Prismatic paint.
  - **Gold:** 1,500 coins, needs mastery 5. `#ffd23e` body, `#fff1c2` flame, strong shine.
  - 21 finishes in all, 17,500 coins.
- **Code:**
  - Finish data: `save.fin = { shipId: ["chrome", …] }` and `save.finOn = { shipId: "chrome" }`.
  - Drawing: `shipLook()` returns the finish colors when one is on. Add `o.shine` to `SHIP3D.draw` to scale `m.spec` (×2 for chrome and gold).
  - Hangar: a "Mastery" line and a bar on each ship card (`renderHangar()`). Finishes appear under the ship.
- **Effect:** the largest single drop in empty days (regular 4 → 1, strong 5 → 2). Regular unspent coins at day 60 fall from 12.6k to 0.8k. Ship-switching is rewarded, so every ship stays useful.

### 5. Daily gift ladder, a streak saver, streak milestones and a welcome back. Size S–M.
**Gift ladder**
- **Value:** the reward goes by how many gifts you have claimed, not by streak: 30, 35, 40, 45, 50, 60, then **100** on the 7th claim, then the cycle repeats. Missing a day only pauses the ladder; it never resets.
- **Where:** `DAILY_GIFT` → `GIFT_LADDER = [30, 35, 40, 45, 50, 60, 100]`, indexed by `save.giftN % 7`.
- **UI:** show the claim button on the start screen as well as in the Shop. Text: "Gift 3 of 7 · +40 ◉. Gift 7: +100".

**Streak saver**
- **Value:** one missed day per 7 days doesn't break the streak.
- **Where:** at load, change `if (!(save.lastDay >= day − 1))` so it also accepts `lastDay === day − 2` when `day − save.saverDay ≥ 7`. In `bumpStreak()`, set `save.saverDay = day` when the saver is used.
- **UI:** tell the player kindly: "Streak saved. You get one free day off a week."

**Streak milestones** (paid once ever, fixed and shown in advance)
- **Value:**
  - 3 days: +50 coins
  - 7 days: "Hot Streak" paint `#ff9a3d / #ffd23e`
  - 14 days: +150 coins
  - 30 days: "Afterburner" trail (reuse the Plasma drawing in orange `#ff7a3d / #ffd23e`)
  - 60 days: "Unstoppable" badge
  - 100 days: "Centurion" paint `#fff1c2 / #ff3ea5`
- **Where:** new `save.streakPaid`.

**Welcome back**
- **Value:** on the first run after one or more missed days, +50 coins with the message "Welcome back, pilot!" Never mention the lost streak. At most once per 7 days.
- **Where:** new `save.backDay`.

Effect: casual players earn about +1,300 coins over 30 days, and their empty days fall from 3 to 2. For casual players the gift (15%) and missions (29%) become the main income, which makes for a good daily hook.

### 6. Collection milestones. Size S.
- **Value:** own 5 / 10 / 15 / 20 cosmetics → +50 / +100 / +150 / +200 coins. Own 25 → a "Collector" badge.
- **What counts:** items bought with coins or earned in play, including finishes. Items received from a **paid** pack or the Supporter Pass do **not** count. Record those ids in `save.paidCos` inside `completePurchase()`. Without this, money would turn into coins.
- **Where:** a progress line at the top of the Locker tab (`renderShop()`).

### 7. World 4 opens at 50 ★ instead of 60. Size S.
- **Where:** `WORLDS[3].need`.
- **Effect:** casual players reach Quantum Void around day 41 (was 52) and regular players on day 7 (was 9).
- **Also:** ask the level designer to review Quantum Void. In the bot runs, levels 32, 34 and 38 were never cleared even by the strong bot.

### 8. Small fixes. Size S each.
- After a run with several rank-ups, show one summary line instead of separate toasts. This becomes rare after change 1.
- Keep only the last 14 days of `save.missions`. Note that the weekly ladder needs up to 7 days.
- Optional, and not in the model: lifetime trophy ladders with fixed coins.
  - "Stargazer": 500 / 2,000 / 5,000 stars caught → 50 / 100 / 200.
  - "Frequent Flyer": 60 / 300 / 1,000 minutes flown → 50 / 100 / 200.
  - "Boss Hunter": 5 / 25 / 100 Motherships destroyed → 50 / 100 / 200.
  - These add about 1,000–1,500 coins over several months.

Suggested release order:
- v29: changes 1 + 2 + the next-unlock card
- v30: change 3
- v31: change 5
- v32: change 4
- v33: change 6 + 7
- v34: change 8

---

## 5. After: 30- to 90-day timelines (all changes, seed 1)

**Casual** (about 2.6 minutes a day)

| Day | Rank | Ships | Level ★ | Upgrades | Cosmetics | Coins earned | Unspent |
|---|---|---|---|---|---|---|---|
| 1 | 2 | 2/7 | 2 | 0/20 | 0 | 118 | 18 |
| 3 | 5 | 3/7 | 7 | 5/20 | 0 | 777 | 57 |
| 7 | 7 | 4/7 | 7 | 7/20 | 3 | 1,898 | 98 |
| 14 | 10 | 5/7 | 23 | 10/20 | 8 | 3,911 | 181 |
| 21 | 11 | 5/7 | 38 | 12/20 | 13 | 5,876 | 86 |
| 30 | 13 | 6/7 | 42 | 12/20 | 16 | 7,610 | 220 |
| 60 | 17 | 7/7 | 77 | 16/20 | 26 | 14,013 | 203 |
| 90 | 20 | 7/7 | 98 | 20/20 | 37 | 22,220 | 160 |

Milestones:
- Ships: Ember day 1, Aurora 3, Halo 7, Nebula 14, Void 26, Phantom 56.
- Worlds 2 / 3 / 4 open on days 12 / 17 / 41. Legend on day 84.
- 2 empty days out of 22.

**Regular** (about 12.3 minutes a day)

| Day | Rank | Ships | Level ★ | Upgrades | Cosmetics | Coins earned | Unspent |
|---|---|---|---|---|---|---|---|
| 1 | 6 | 3/7 | 9 | 7/20 | 1 | 1,274 | 214 |
| 3 | 10 | 5/7 | 31 | 8/20 | 7 | 3,185 | 115 |
| 7 | 14 | 6/7 | 55 | 12/20 | 13 | 6,097 | 207 |
| 14 | 18 | 7/7 | 91 | 15/20 | 27 | 11,853 | 313 |
| 21 | 21 | 7/7 | 106 | 17/20 | 37 | 16,780 | 20 |
| 30 | 23 | 7/7 | 114 | 18/20 | 45 | 21,557 | 597 |
| 60 | 30 | 7/7 | 114 | 20/20 | 69 | 38,614 | 1,454 |
| 90 | 35 | 7/7 | 114 | 20/20 | 80 | 56,106 | 15,946 |

Milestones:
- Ships on days 1, 1, 2, 3, 6, 12. Legend on day 18.
- Empty days: 1 of 28 in the first 30 days. The longest dry spell over 90 days is 3 days.
- The catalog is finished around day 70 (was 49). After that, new content is needed (see guardrails).

**Strong** (about 42 minutes a day)

| Day | Rank | Ships | Level ★ | Upgrades | Cosmetics | Coins earned | Unspent |
|---|---|---|---|---|---|---|---|
| 1 | 11 | 4/7 | 9 | 7/20 | 4 | 2,160 | 360 |
| 7 | 23 | 7/7 | 78 | 13/20 | 31 | 11,245 | 255 |
| 14 | 29 | 7/7 | 114 | 18/20 | 45 | 18,720 | 560 |
| 30 | 38 | 7/7 | 114 | 20/20 | 66 | 33,085 | 425 |
| 60 | 48 | 7/7 | 114 | 20/20 | 76 | 59,460 | 19,300 |

Milestones:
- Legend day 5, Phantom day 4.
- Catalog finished around day 39 (was 15). Empty days: 2 of 30 (was 15).

Where the coins came from over 30 days (after):

| | Missions | Run coins | Weekly | Gift | Rank-ups | Mastery + collection | Other |
|---|---|---|---|---|---|---|---|
| Casual | 29% | 15% | 7% | 15% | 11% | 7% | 17% |
| Regular | 23% | 32% | 9% | 7% | 9% | 7% | 13% |
| Strong | 21% | 45% | 6% | 5% | 10% | 5% | 8% |

## 6. Before and after, at a glance (median of 20 random seeds, day 30)

| | Casual before → after | Regular before → after | Strong before → after |
|---|---|---|---|
| Rank at end of day 1 | 3 → 3 | 9 → 6 | 27 → 11 |
| Ships owned on day 7 | 5 → 4 | 7 → 6 | 7 → 7 |
| Phantom unlocked | day 19 → after day 30 (≈ 56) | day 5 → day 11 | day 2 → day 4 |
| Legend (rank 20) | day 24 → ≈ day 84 | day 3 → day 18 | day 1 → day 5 |
| Rank on day 30 | 22 → 13 | 68 → 24 | 174 → 38 |
| Coins earned in 30 days | 4,775 → 7,427 | 14,854 → 22,140 | 39,919 → 32,945 |
| Unspent on day 30 | 110 → 192 | 354 → 448 | 18,119 → 285 |
| Played days with nothing new | 7 → 4 | 5 → 1 | 15 → 2 |
| Coins per minute of play | ≈ 82 → 132 | ≈ 43 → 63 | ≈ 32 → 26 |

Casual and regular players earn more, but they also get more things to buy: the catalog grows from 21,800 to 40,160 coins with the finishes and pricier ships. Strong players earn a bit less and are never left with nothing to buy.

---

## 7. Guardrails for every future change

**Never (owner's rules)**
- No crypto, Bitcoin, ZBD, real-money payouts or gambling.
- No loot boxes, crates, spins, mystery rewards or random rewards, whether bought with coins or money. Every reward and every purchase states its exact contents before the player commits.
- Real money buys only cosmetics with fixed, listed contents. Never coins, XP, upgrades, ships, mission skips, streak repairs, or anything that counts toward a coin or XP reward (collection milestones must exclude paid items).
- No fake timers, fake player counts or fake reviews. Real resets ("Resets Monday", "Refills tomorrow") are shown as plain text, with no ticking clocks or flashing urgency.
- No guilt copy. Never "You lost your streak!" Missing days pauses things; it never takes anything away.

**Price bands** (a regular player earns about 700 coins a day after these changes; a casual player about 350)

| Item | Band | Rule |
|---|---|---|
| Common cosmetic | 100–150 | |
| Rare cosmetic | 250–350 | |
| Epic cosmetic | 600–700 | |
| Legendary cosmetic or finish | 1,100–1,500 | Nothing coin-priced above 1,500 |
| Ship | 100–1,500 | Always rank-gated, each about 2–4 ranks after the previous one |
| Upgrade level | ≤ 900 | Rank-gated by `UP_RANK` |

**Reward targets**
- Run coins: about 15–25 per minute of play during Fresh Fuel. The daily run-coin limit stays at 500 or less.
- Fixed daily rewards (gift + missions + all-clear) stay at or below 400 a day.
- Daily missions stay 30 / 60 / 90 plus 50. The ladder steps stay at or below 500 coins a week in total.
- XP comes only from time flown, stars, missions and new level stars. Never from score, upgrades or anything paid.
- A new rank must take a regular player no more than about 1.5 days below rank 20, and no more than about 3 days above it.

**Goal rules**
- A regular player always has a visible next goal costing no more than 3 days of income.
- Something new (a purchase, unlock, cosmetic or rank title) happens on at least 6 of every 7 played days.
- Every new ship gets mastery. Every new world gets a star gate no higher than about 55% of the stars available before it.
- Content pace: regular players finish the catalog around day 70, strong players around day 40. So add at least 2 new coin-priced cosmetics every 2 weeks of real calendar time after launch, and refresh the weekly rotation every 8 weeks.
- Everything earned is fixed and shown in advance (weekly item, mastery rewards, streak milestones). Rotating items always return, and the UI says when.

**Before you merge an economy change:** re-run the model (`node econ.js after 30`, `node ablate.js`). Check that played days with nothing new stay at or below 1 in 7 for every player type, and that a strong player's unspent coins on day 30 stay below about 2,000.
