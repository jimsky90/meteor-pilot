#!/usr/bin/env node
/* Rules tests (Node, no browser). Prints one JSON line per check on stdout:
   {"name": ..., "status": "PASS"|"FAIL"|"WARN", "detail": ...}
   Checks:
   1. The rules script (window.CR) never calls Math.random, Date.now, new Date() or performance.now.
   2. Determinism: the same seed gives the same world, ghost and bot run twice over, in two separate VMs.
   3. Replay equality: a recorded bot run replays to the identical score, time, stars and golds (10 seeds).
   4. Every mission type is clearable by the test bot (40 levels; each type must be cleared at least once,
      levels the bot can't clear are listed as a warning to look at).
   5. Every level's gate gap is not blocked by a big rock arriving at the same moment (fairness, warning). */
"use strict";
const G = require("./lib/game.js");

const out = [];
const report = (name, status, detail) => { out.push({ name, status, detail }); process.stdout.write(JSON.stringify({ name, status, detail }) + "\n"); };
const fast = process.argv.includes("--fast");

let CR, CR2, LV;
try {
  CR = G.loadCR(null, { trapNondeterminism: true });
  CR2 = G.loadCR(null, {});
  LV = G.loadLevels(CR);
} catch (e) {
  report("rules: load window.CR and levels", "FAIL", String(e && e.stack || e));
  process.exit(0);
}
report("rules: load window.CR and levels", "PASS", `CR exports ${Object.keys(CR).filter(k => k[0] !== "_").length} names; ${LV.COUNT} levels`);

const SEEDS = ["comet-1", "comet-7", "comet-30", "comet-57", "comet-100", "comet-365", "comet-r-abc123", "lvl-1-0", "lvl-18-3", "challenge-x"];
const bot = G.makeBot(CR), bot2 = G.makeBot(CR2);
const AIM = CR.TPS * 75; /* the bot steers for 75 s, then holds its last target until the ship goes down (keeps the test fast) */
const cfg = () => CR.loadoutCfg("comet", {});

/* 2 + 3: determinism and replay */
{
  const bad = [], rp = [];
  let totalTicks = 0;
  for (const seed of SEEDS) {
    const w1 = CR.makeWorld(seed), w2 = CR2.makeWorld(seed), w3 = CR.makeWorld(seed);
    if (G.fingerprint(w1) !== G.fingerprint(w2) || G.fingerprint(w1) !== G.fingerprint(w3)) bad.push(`${seed}: makeWorld differs between calls`);
    const g1 = CR.recordGhost(w1), g2 = CR2.recordGhost(w2);
    if (g1.score !== g2.score || g1.t !== g2.t || G.fingerprint(g1.path) !== G.fingerprint(g2.path)) bad.push(`${seed}: recordGhost differs (${g1.score}/${g1.t} vs ${g2.score}/${g2.t})`);
    /* a full run (until the ship goes down, like CR.replay) flown in both VMs */
    const full = bot.fly(CR.makeWorld(seed), cfg(), { tag: "replay", aimUntil: AIM });
    const b = bot2.fly(CR2.makeWorld(seed), CR2.loadoutCfg("comet", {}), { tag: "replay", aimUntil: AIM });
    if (full.r.score !== b.r.score || full.r.t !== b.r.t || G.fingerprint(full.inputs) !== G.fingerprint(b.inputs)) bad.push(`${seed}: bot run differs between VMs (${full.r.score}/${full.r.t} vs ${b.r.score}/${b.r.t})`);
    totalTicks += full.r.t;
    const re = CR.replay(CR.makeWorld(seed), cfg(), full.inputs);
    const re2 = CR2.replay(CR2.makeWorld(seed), CR2.loadoutCfg("comet", {}), full.inputs);
    const same = x => x.score === full.r.score && x.t === full.r.t && x.stars === full.r.stars && x.golds === full.r.golds;
    if (!same(re) || !same(re2)) rp.push(`${seed}: live ${full.r.score}/${full.r.t}t/${full.r.stars}★ vs replay ${re.score}/${re.t}t/${re.stars}★`);
    /* the same world object replayed twice must not drift (no hidden state kept on the world between runs) */
    const w = CR.makeWorld(seed), x1 = CR.replay(w, cfg(), full.inputs), x2 = CR.replay(w, cfg(), full.inputs);
    if (x1.score !== x2.score || x1.t !== x2.t) rp.push(`${seed}: replaying twice on one world object drifts (${x1.score} vs ${x2.score})`);
  }
  report("rules: determinism (10 seeds, two VMs)", bad.length ? "FAIL" : "PASS", bad.length ? bad.join("; ") : `world, ghost and bot runs identical for ${SEEDS.length} seeds`);
  report("rules: replay equality (10 seeds)", rp.length ? "FAIL" : "PASS", rp.length ? rp.join("; ") : `${SEEDS.length} bot runs (${Math.round(totalTicks / CR.TPS)} s of flying) replay to identical results`);
}

/* daily missions and levels are generated the same way every time */
{
  const bad = [];
  for (const d of [1, 2, 30, 31, 365]) if (G.fingerprint(CR.missions(d)) !== G.fingerprint(CR2.missions(d))) bad.push("missions(" + d + ")");
  report("rules: daily missions deterministic", bad.length ? "FAIL" : "PASS", bad.length ? bad.join(", ") : "missions(day) identical across VMs");
}

/* 1: no clock or random inside the rules (checked after everything above ran through the trapped VM) */
{
  const hits = CR.__sandbox.__nondet;
  const uniq = Array.from(new Set(hits));
  report("rules: no Math.random / Date / performance.now in window.CR", uniq.length ? "FAIL" : "PASS", uniq.length ? `called: ${uniq.join(", ")} (${hits.length} times)` : "none called during all rules tests");
}

/* 4: every mission type clearable */
{
  const STRATS = [{}, { y0: 600 }, { margin: 14, every: 2 }, { margin: 6, close: 6 }, { y0: 600, margin: 6, close: 5 }, { margin: 16, horizon: 55, every: 1 }, { y0: 500 }, { margin: 4, close: 8, every: 1 }];
  const byType = new Map(), stuck = [];
  const t0 = Date.now();
  const levels = fast ? [1, 2, 3, 4, 5, 8, 10, 13, 14, 16, 18, 23, 27] : Array.from({ length: LV.COUNT }, (_, i) => i + 1);
  for (const n of levels) {
    const L = LV.get(n), c = cfg(); c.lives = Math.max(1, c.lives - L.shieldCut);
    let best = null;
    for (let k = 0; k < STRATS.length; k++) {
      const { r } = bot.fly(L.world, c, Object.assign({ tag: "clear" + k, maxT: L.durT }, STRATS[k]));
      const rt = LV.rate(L, r, r.alive && r.t >= L.durT);
      if (rt.met) { best = { stars: rt.stars, tries: k + 1 }; break; }
    }
    const e = byType.get(L.type) || { levels: [], cleared: [] };
    e.levels.push(n); if (best) e.cleared.push(n); else stuck.push(`${n} (${L.type})`);
    byType.set(L.type, e);
  }
  const missing = [...byType].filter(([, e]) => !e.cleared.length).map(([k]) => k);
  const summary = [...byType].map(([k, e]) => `${k} ${e.cleared.length}/${e.levels.length}`).join(", ");
  report("missions: every mission type clearable by the bot", missing.length ? "FAIL" : "PASS",
    (missing.length ? `never cleared: ${missing.join(", ")}. ` : "") + `${byType.size} types: ${summary} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (stuck.length) report("missions: levels the bot could not clear (look at them, may be too hard)", "WARN", stuck.join(", "));
}

/* 5: gate gaps blocked by a big rock arriving with the gate wall (unfair, but not always unavoidable) */
{
  const issues = [];
  const check = (world, label, maxT) => {
    const gates = new Map();
    for (const it of world.items) if (it.gate >= 0) { if (!gates.has(it.gate)) gates.set(it.gate, { t: it.t, vy: it.vy, xs: [] }); gates.get(it.gate).xs.push(it.x); }
    for (const [gid, g] of gates) {
      if (g.t > maxT) continue;
      const tc = g.t + (CR.SHIP_Y + 13) / g.vy, xs = g.xs.sort((a, b) => a - b);
      let lo = 0, hi = 0; for (let i = 0; i < xs.length - 1; i++) if (xs[i + 1] - xs[i] > hi - lo) { lo = xs[i]; hi = xs[i + 1]; }
      const gr = 13 * 0.82 + 13, free = [lo + gr, hi - gr];
      for (const it of world.items) {
        if (it.kind !== "rock" || it.gate >= 0 || Math.abs(it.t + (CR.SHIP_Y + it.r) / it.vy - tc) > 14) continue;
        const x = CR._posAt ? CR._posAt(world, it, Math.round(tc)).x : it.x, hr = it.r * 0.82 + 13;
        if (x + hr > free[0] && x - hr < free[1]) {
          const room = Math.max(x - hr - free[0], free[1] - x - hr);
          if (room < 30) issues.push(`${label} gate ${gid}: a rock (r ${Math.round(it.r)}) fills the gap, ${Math.max(0, Math.round(room))} px left`);
        }
      }
    }
  };
  for (let n = 1; n <= LV.COUNT; n++) { const L = LV.get(n); check(L.world, "Level " + n, L.durT); }
  report("fairness: gate gaps stay open", issues.length ? "WARN" : "PASS", issues.length ? issues.join("; ") : "no gate gap is filled by a rock arriving with the wall");
}
