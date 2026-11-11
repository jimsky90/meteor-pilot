# Fun plan: "one more run" features

The owner wants Meteor Pilot to be very addictive. In this game that means fun, rewarding and something to look forward to, never tricks. Every feature here follows the owner's rules:
- no gambling or paid randomness
- no pressure timers
- no guilt messages
- no pay-to-win

It also follows `ART-DIRECTION.md` (style rules) and `ECONOMY-PLAN.md` (guardrails).

Build the features in this order. Each has a size: S is about one round, M is one round on its own.

## Fun 1: "Beat my run" challenge links (M)
- **Where it starts:** after a daily run, the game-over screen gets a **Challenge a friend** button. It uses `navigator.share` when available, and otherwise copies to the clipboard.
- **What the link holds:** `#c=` in the URL hash, carrying:
  - the day number (the seed)
  - the ship and loadout config
  - the recorded inputs
  - the score
  - a name the player chooses (max 12 chars, optional, default "A pilot")

  The inputs are compressed: delta-encode the target x/y per tick, quantize to 1 px, run-length encode, then base64url. Aim for 3 KB or less for a 2-minute run. If the link would be longer than 8,000 characters, keep every 2nd tick and interpolate.
- **Opening a link:** the game shows a card: "<name> scored 4,820 on Day 17. Race their ghost?" The run uses that day's course, even if it isn't today. Their run replays as the ghost through `CR.replay`, so it's exact and deterministic.
- **Result:** "You beat <name> by 310!" or "<name> wins by 95. Rematch?", plus a button to send your own run back.
- **Safety:** validate everything decoded and cap the sizes. If a link is broken, show "This challenge link is broken" and nothing else happens. Never `eval`.
- **Rewards:** none paid. A trophy for "Beat 3 friends' challenges".
- **Test:** encode, decode and replay across 10 seeds. The ghost's score must equal the recorded score.

## Fun 2: Fever mode (S)
- **Trigger:** at a ×5 multiplier, Fever starts. It lasts 6 s, or 8 s if it starts during an event.
- **During Fever:** stars pay ×2 on top of the multiplier.
  - **Visuals:** a warm hue shift on the background (use the cached background, don't add per-frame gradients) and a faint edge glow in the theme color.
  - **Sound:** the music's tempo goes up about 8% and adds a hi-hat layer.
- **HUD:** shows "FEVER" next to the multiplier, with a draining bar.
- **When it ends:** a hit ends Fever at once. It can't restart until the multiplier drops below ×5 and climbs back.
- **Determinism:** if this changes scoring, it goes inside `window.CR`, ticks only, no Date or Math.random. Replays must still match.
- **Calm effects:** the Settings option "calmer screen effects" turns off the hue shift and keeps only the HUD label.

## Fun 3: "So close" game over and instant retry (S)
- **Near your best:** if the score is within 15% of your best (and isn't a new best), the screen says "Only 120 from your best!" with a small bar showing how close.
- **New best:** a gold "NEW BEST" stamp animation.
- **Instant retry:** Retry restarts in under 1 second. Skip any countdown on retry, and keep the music running.
- **Next goal:** shows one line, choosing between the nearest unfinished mission, the next rank or the next unlock, whichever is closest to done.
- **No guilt:** never say anything negative about the player.

## Fun 4: Endless sectors (M)
- **Sectors:** in the daily run, every 45 s of survival is a new **Sector** (Sector 1 at the start).
- **The jump:** each change plays a 0.8 s hyperspace jump. Streak the starfield, give a short whoosh, then cross-fade the background to the next theme in a fixed order. This is a good place for Art fix 15.
- **Course untouched:** the sector theme is visual only. The course itself (window.CR) is unchanged, so the daily course stays the same for everyone.
- **HUD and results:** "SECTOR 3" flashes in the HUD after each jump, and game over shows "Reached Sector 5".
- **Tracking:** save `bestSector`. Add trophies for Sectors 3, 5 and 7.

## Fun 5: Free season track (M, after Economy changes 1–3)
- **Seasons:** 30 days, named and themed by month. The first one is "Season 1: Ignition".
- **The track:** 40 tiers. Season points come from:
  - daily missions: 10 each
  - weekly ladder steps: 30 each
  - time flown: 1 per minute, capped at 20 a day
- **Rewards:** every tier has a fixed, stated free reward. Mostly coins (50–150), with cosmetic paints, trails, badges or a boom every 5th tier and an exclusive season ship finish at tier 40.
- **Pacing:** check in tools/econ that a regular player reaches tier 40 around day 24–26, and a casual player tier 20–25.
- **Free only for now:** no paid track yet. Leave a clear spot in the code for a future optional paid cosmetic track with fixed contents (test mode only until real billing).
- **When a season ends:** unclaimed earned rewards are given automatically. Points reset, and cosmetics stay forever. Say "Season 2 starts in 3 days" only as plain information, never as countdown pressure.

## Fun 6: Daily twist (S–M)
- **One twist a day:** each daily course gets one twist, picked from the day number in `window.CR`, so everyone gets the same one:
  - **Mirror Day:** the course is flipped left–right.
  - **Comet Storm:** 1.5× the warned comets.
  - **Giant Stars:** stars are 1.4× bigger and worth the same.
  - **Low Gravity:** everything falls at 0.8× speed, and runs last longer.
  - **Gold Rush:** gold stars appear 3× as often.
  - **Calm Skies:** no events and no black holes; pure dodging.
  - **None:** a plain day, about 1 in 4 days.
- **Showing it:** the start screen shows today's twist on a chip, with one line explaining it.
- **Determinism and fairness:** recorded runs and challenge links must carry the twist and stay deterministic. Daily missions must stay clearable under every twist, so check this with the ghost bot.

## Also queued for later (not this round of work)
- Weekly boss with a new pattern and a no-hit trophy.
- Ship evolution visuals tied to ship mastery.
- Hazard logbook collection.
- Opt-in daily reminder (store build only).
- Online leaderboards and friend leagues (needs a server).
