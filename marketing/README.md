# Meteor Pilot launch marketing assets

Every gameplay image and every second of the trailer is real footage of the live build (`index.html`). It was captured with Playwright at 430×932, deviceScaleFactor 3. The frames are not mock-ups. The captions, frames and end card were added on top as overlay typography (Inter Display Black Italic).

The assets show no ratings, reviews, player counts, loot boxes, gambling or crypto.

## Files

| File | Size (px) | Where it goes |
|---|---|---|
| `appstore/01-hook.png` … `06-daily.png` | 1290×2796 | App Store Connect → iPhone 6.7" Display screenshots, uploaded in numeric order (Apple scales them to smaller iPhones) |
| `googleplay/01-hook.png` … `06-daily.png` | 1080×1920 | Play Console → Main store listing → Phone screenshots, in numeric order |
| `googleplay/feature-graphic.png` | 1024×500 | Play Console → Main store listing → Feature graphic |
| `trailer.mp4` | 1080×1920, H.264 High, 30 fps, AAC, 22.4 s, ~13.5 MB | App Store: App Preview (6.7"), but see the note below. Google Play: upload it to YouTube, then paste the link into "Video". Also works for TikTok, Reels and Shorts |
| `CONTACT-SHEET.png` | 2772×3302 | Internal review only. Do not upload it |

All PNGs are RGB with no alpha channel, which the App Store requires.

## Screenshot captions (same in both stores)

| # | Caption | What's shown |
|---|---|---|
| 1 | **DODGE THE METEOR STORM** | Level 12 "Dust Choir" (Red Circuit) during a meteor shower, ×4 combo |
| 2 | **40 LEVELS. 4 WORLDS.** | 2×2 collage of gameplay from Neon Belt, Red Circuit, Prism Rings (with a solar flare beam) and Quantum Void |
| 3 | **BEAT THE MOTHERSHIP** | Level 10 world-finale boss: red bullet ring, cyan cores, CORE 4/5 |
| 4 | **CHAIN STARS ×5 COMBOS** | Level 9 star rain at a ×5 combo, with a "×5" sticker |
| 5 | **UNLOCK 7 SHIPS** | The real Hangar screen, plus all 7 ships rendered large by the game's own 3D ship renderer |
| 6 | **RACE THE DAILY GHOST** | Today's daily course with a black hole. The daily ghost (flag) is called out |

Feature graphic: "METEOR PILOT" logotype, the Comet fighter, a meteor storm and the Mothership. It has no small text.

## Trailer (22.4 s)

Cards in order:

1. ONE THUMB.
2. ZERO MERCY.
3. CHAIN ×5 COMBOS
4. BLACK HOLES
5. SOLAR FLARES
6. WARNING / BOSS INCOMING
7. BEAT THE MOTHERSHIP, then the in-game "Mothership down"
8. 40 LEVELS · 4 WORLDS, with a chip for each world
9. 7 SHIPS TO UNLOCK, with the Hangar
10. NEW COURSE DAILY / RACE THE GHOST
11. End card: METEOR PILOT · FREE TO PLAY

The music is an original synthwave bed made in Python/numpy for this trailer, with hits on the cuts, so it needs no licence.

**App Store note:** Apple's App Preview spec for the 6.7" display is 886×1920 (portrait) and 15–30 s. To use the trailer as an App Preview, export a 886×1920 version, for example:
`ffmpeg -i trailer.mp4 -vf "scale=886:-2,crop=886:1920" -c:a copy preview-886.mp4`
Apple also asks that previews show only in-app footage, so the end card and the text cards may need trimming or approval.

## Notes and limitations

- Google Fonts were blocked during capture, so the in-game HUD uses the fallback system font (Inter). All marketing typography was set separately, so it is unaffected.
- Gameplay was flown by a scripted autopilot. To get smooth 30 fps capture, the page's clock was virtualised in memory. No game files were changed.
- The "ghost" in the daily course is a bot standing in for another player, as the game itself says. The copy says "race the ghost" and never claims real opponents.
- The save was pre-seeded (pilot rank 14, ships owned, most levels starred) so that late worlds and the full hangar could be shown.
