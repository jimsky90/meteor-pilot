# Mission plan: "The Last Light"

The owner wants missions to be the heart of Meteor Pilot. They should be exciting, an adventure, and something to look forward to, with a meaningful, positive message so anyone who plays feels good about themselves. The game should borrow the best ideas from today's top games and make them its own, so that it doesn't feel like anything else on the market.

This plan turns the existing Levels into a story campaign. It comes first in the update task's backlog, right after the launch-critical QA fixes. Everything follows `ART-DIRECTION.md`, `ECONOMY-PLAN.md`'s guardrails, and the owner's rules: no gambling, no paid randomness, no guilt.

## The story
- **The world.** A star called the Heart broke apart. Its pieces fall through space as meteors, and the gold stars are fragments of its light.
- **The enemy.** The Silence is a vast dark Mothership that swallows the light of whole worlds, one sector at a time.
- **You.** You are a pilot of the Lightrunners. Every star you catch is light carried back home.
- **The message.** "Nobody gets left in the dark." Every mission you finish lights a beacon, and every pilot helps light the galaxy back up together.
- **Losing.** Losing never scolds. Command always answers kindly: "Good flying, pilot. Let's go again."

## The crew (original characters; drawn in-game, no real people)
- **Commander Vega:** calm, warm, believes in you. She gives the briefings and debriefs. Color: teal.
- **Bolt:** the mechanic, funny and a little chaotic. He makes jokes about your ship and gives tips. Color: orange.
- **Kestrel:** a rival pilot, cocky. She trash-talks you through chapters 1–2 (playful, never cruel) and races you. She joins your side in chapter 3 after you save her. Color: magenta.
- **Nova:** a captured pilot held inside the Silence, rescued in mission 20. After that she guides you through the dark sectors. Color: soft white.
- **The Silence:** the villain. Its lines show in deep red with a glitch effect. It speaks rarely, which makes each line hit harder. "Little pilot. You can't save them all."

### Faces
Each character gets an original portrait drawn in code (canvas or inline SVG) in a small "radio window":
- Expressions: neutral, happy, worried, smirk and shout.
- Idle animation: blinks, small head movement, and a mouth that moves while text types.
- Kept stylized and clean, matching the game's art rules. No copying of any existing character.

## Radio comms (how every mission feels)
- **On tap Play:** static crackle, then the radio window slides in from the top with a beep. The line types out with a soft blip per character.
  - Tap to skip a line; a "Skip briefing" button skips all of it.
  - Then: a "LAUNCH" stamp, an engine roar, and the run starts.
- **During runs:** short lines for key moments, such as "Boss incoming!", "Halfway there!", "That was close!" or Kestrel passing you. At most one line every 8 s, and never covering the ship or incoming hazards.
- **Debrief after a run:**
  - **Win:** a celebration plus a story line.
  - **Loss:** an encouraging line that moves the story forward a little (borrowed from Hades). Every few losses, Bolt or Vega reveals something new about the world, so even losing feels like progress.
  - Every 10 failed runs, the next attempt can offer an optional "Bolt's tune-up" (+1 shield for that one run). It's free and never sold.
- **Voice:** radio-style text with crackle and beeps for now.
  - Add a Settings toggle "Read lines aloud (beta)" that uses the phone's built-in speech when available. Off by default; pitch and rate set per character.
  - Structure the lines (id, speaker, text) so a real voice actor's recordings can drop in later.
- **Calm effects and accessibility:** the "calmer screen effects" setting reduces static and flicker. Text is at least 15 px, with high contrast.

## Boss entrances (borrowed from Brawl Stars' and Clash's big reveals)
Before each Mothership fight:
1. The screen dims, red alarm lights pulse at the edges, and a low rumble plays.
2. The Silence speaks one line.
3. The Mothership's silhouette slides in with a name plate, e.g. "THE SILENCE — HUSK I".
4. "BREAK THE CORE" appears, and the fight begins.

The whole entrance takes 3 s at most and can be skipped after the first time it's seen. On a boss win, the core bursts, light floods back into the sector, and the background brightens for the rest of the debrief.

## The beacon map (replaces the plain level grid; borrowed from Candy Crush's map, made ours)
- A vertical galaxy map where each mission is a beacon on a glowing path. Each world is a sector with its own look.
- Finished missions glow gold; the next one pulses. Stars earned show under each beacon.
- When a sector is complete, all its beacons flare and the sector's colors return. Keep the cutscene short and skippable.
- Keep the existing world unlock rules and level data. This is a new skin and flow on top of `makeLevels`.

## Campaign structure
The 40 existing levels become 40 missions in 4 chapters (one per world). Each mission has: a title, a briefing (1–3 radio lines), an objective type, optional bonus objectives for the 3 stars, and win and lose debrief lines. Store all of it as data (a `MISSIONS` table keyed by level), not scattered code.

### Mission types
Each type needs a deterministic rule inside `window.CR`: driven by the seed and ticks, with no Math.random or Date, and replays must match.

1. **Survive:** fly for N seconds (the existing objective).
2. **Bring Back the Light:** catch N stars.
3. **Destroy the Mothership:** break the core (the existing boss).
4. **Escort the Light Ship:** a slow friendly ship drifts beside you. It has 3 hit points, and you protect it by blocking meteors with your ship's shield. Win if it reaches the end.
5. **Blackout Run:** the Silence kills the lights. Only a circle of about 120 px around your ship is lit, plus warning glows on hazards. Hazards must stay fair: warned comets and beams are always visible.
6. **Rescue the Pilot:** an escape pod falls along a marked path. Catch it before it hits a meteor; the pod is protected while you're touching it.
7. **Race the Rival:** Kestrel's ghost flies the same course with a target score. Beat her score, or reach the end ahead of her.
8. **Heist:** the Mothership's searchlight sweeps the screen. Grab the core fragments while staying out of the light; getting caught costs one shield, not the run.
9. **Light the Beacon:** catch 50 stars in one run. On success, a big glowing celebration lights up that world.

### Chapters (story beats)
- **Chapter 1, "First Light"** (missions 1–10)
  - Training with Vega and Bolt.
  - Kestrel shows up and mocks you.
  - First Mothership husk at mission 10.
- **Chapter 2, "The Dark Belt"** (11–20)
  - Blackouts and escorts.
  - Kestrel's race challenges.
  - **Twist:** a distress signal from inside the Silence. Mission 20 is the rescue of Nova.
- **Chapter 3, "Turning Tide"** (21–30)
  - Kestrel gets caught by the Silence, and you save her. She joins the crew and flies as a wingman ghost in some missions.
  - Heist missions to steal the Silence's core fragments.
- **Chapter 4, "Dawn"** (31–40)
  - The Silence's true form.
  - **Final mission, "Dawn":** the whole crew flies with you (crew ghosts help clear meteors). On victory, the Heart is reborn, the whole galaxy lights up, and the credits roll over the beacon map.

After the finale, the campaign stays replayable for 3 stars. A short "New Game+ — Night Shift" variant with harder missions can come later.

## Monthly story events (borrowed from Fortnite's live events, offline-friendly)
Each month, a dated event chapter unlocks automatically from the device date (no server needed): 5 missions, a new Silence form, and a fixed cosmetic reward. It goes together with Fun 5 (the season track) as that month's theme. Old events stay playable afterwards in an "Archive".

## Real 3D and a human feel (staged upgrade)
Right now the game fakes 3D with canvas shading. Move the main visuals to real GPU 3D with WebGL, in stages. Each stage ships only if the frame time on a 4× slowed CPU is no worse than before, and there is always an automatic fallback to the current canvas renderer (on WebGL failure, or when Low graphics is on).

- **Library choice:** use a small in-house WebGL renderer written for this game, not a big library. That keeps the game one self-contained file that works offline. Budget: renderer plus models under about 60 KB.
- **3D-a, ship:** a real lit 3D mesh of each ship, with metal and glass shading, a rim light, banking and engine glow.
- **3D-b, meteors:** tumbling 3D rocks with lit, cratered surfaces and a hot glowing underside, drawn with instancing. Keep the existing sizes and hit boxes.
- **3D-c, effects and camera:** particles for explosions and trails, a light bloom on stars kept within the art budget, a slight camera tilt, and a camera shake and swoop during boss entrances.
- **Human feel:** crew faces in the radio window, plus a 1.5 s cockpit shot during mission intros: the pilot's gloved hands on the controls and the HUD lighting up. Drawn in-game; skippable.

## Later (needs a small online server; not now)
- **Light Messages:** after a mission, a player can leave a short note of hope, picked from a safe preset list of phrases (no free text, so nothing can be abused). Other players find it as a glowing capsule in space.
- **The Shared Sky:** every star anyone catches adds to one giant galaxy everybody sees, and each pilot gets their own named star.

## Build order (one item per round unless marked S)
1. **Radio comms system** (window, typing, crackle and beeps, skip), **crew portraits** (Vega, Bolt, Kestrel, the Silence) and the **mission intro** with the LAUNCH stamp. (M)
2. **`MISSIONS` data for chapter 1** (briefings, objectives, debriefs) wired into Levels, plus the kind loss debriefs. (M)
3. **Boss entrance cinematic** and the light-returns win effect. (M)
4. **Beacon map** replacing the level grid. (M)
5. **New mission types, one per round:** Escort, Rescue, Blackout, Race the Rival, Heist, Light the Beacon. (M each)
6. **`MISSIONS` data for chapters 2–4** with the story beats, Nova's rescue, Kestrel joining, and the finale "Dawn" with the credits. (M, maybe two rounds)
7. **"Read lines aloud (beta)" toggle.** (S)
8. **3D-a, 3D-b, 3D-c**, then the cockpit intro shot. (M each)
9. **Monthly story event framework** together with Fun 5. (M)

## Writing rules for all lines
- Short: 12 words or fewer per radio line, and at most 3 lines before launch.
- Warm, hopeful and a little funny, never cruel or scary for kids. The Silence can be ominous, never gory.
- Every pilot is called "pilot" or by the name they choose. No gendered assumptions.
- Losing is never shamed. Winning is celebrated loudly.
- Plain English, easy to translate later. Keep every line in one `LINES` table.
