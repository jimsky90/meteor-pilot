// Loads the game's real rules (window.CR) and makeLevels from extracted copies, plus a tunable bot.
const fs = require("fs"), path = require("path");
const dir = __dirname;
let src = fs.readFileSync(path.join(dir, "cr_src.js"), "utf8");
src = src.replace("root.CR = {", "root.CR = { _posAt: posAt, _itemPos: itemPos,");
const win = {};
new Function("module", "window", src.replace("typeof module !== \"undefined\" ? module.exports : window", "window"))(undefined, win);
const CR = win.CR;
const lvSrc = fs.readFileSync(path.join(dir, "levels_src.js"), "utf8");
const makeLevels = new Function("CR", lvSrc + "\nreturn makeLevels(CR);");
const LV = makeLevels(CR);

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/* Same cost function as CR's ghostAim, but with tunable reach speed, look-ahead and noise. */
function aim(world, g, rng, P) {
  const { W, SHIP_R, SHIP_Y, BEAM_WARN } = CR;
  let best = g.x, bestCost = Infinity;
  const ba = world.bosses && world.bosses.length ? CR.bossActive(world, g, g.t) : null;
  const bm = world.flaresLive && world.flaresLive.length ? CR.beamsAt(world, g.t) : null;
  const act = CR.active(world, g.t);
  for (let i = 0; i <= 16; i++) {
    const cx = SHIP_R + i * (W - 2 * SHIP_R) / 16;
    let cost = Math.abs(cx - g.x) * 0.02;
    const reach = Math.abs(cx - g.x) / P.speed;
    for (const a of act) {
      const dt = (SHIP_Y - a.y) / a.it.vy;
      if (dt < -4 || dt > P.horizon) continue;
      const gap = Math.abs(CR._posAt(world, a.it, g.t + Math.max(0, dt)).x - cx);
      if (a.it.kind !== "rock") { if (gap < 26 && reach <= dt + 2 && !g.got.has(a.it.id)) cost -= a.it.kind === "power" ? 5 : 3 * P.greed; }
      else if (!g.smashed.has(a.it.id) && gap < a.it.r + SHIP_R + 10) cost += 10 + (reach > dt ? 20 : 0);
    }
    if (ba) {
      for (const a of ba.shots) {
        if (a.s.vy <= 0.2) continue;
        const dt = (SHIP_Y - a.y) / a.s.vy;
        if (dt < -3 || dt > P.horizon + 6) continue;
        if (Math.abs(a.x + a.s.vx * Math.max(0, dt) - cx) < a.r + 14) cost += 12 + (reach > dt ? 20 : 0);
      }
      for (const a of ba.cores) {
        const dt = (SHIP_Y - a.y) / a.c.vy;
        if (dt >= 0 && dt <= 60 && Math.abs(a.x - cx) < 24 && reach <= dt + 2) cost -= 6;
      }
    }
    if (bm) for (const a of bm) if (a.k > BEAM_WARN - 50 && Math.abs(cx - a.x) < a.hw + SHIP_R + 8) cost += 30;
    cost += rng() * P.noise;
    if (cost < bestCost) { bestCost = cost; best = cx; }
  }
  return best;
}

/* Play one run with a bot of profile P and loadout cfg. Returns the runner. maxT optional (levels). */
function play(world, cfg, P, tag, maxT) {
  const rng = mulberry32(hashStr(world.seed + ":" + tag));
  const g = CR.newRunner(cfg);
  let target = g.x, lapse = 0;
  while (g.alive && (!maxT || g.t < maxT)) {
    if (lapse > 0) lapse--;
    else if (g.t % P.every === 0) {
      target = aim(world, g, rng, P);
      if (rng() < P.lapse0 + g.t / CR.TPS * P.lapseGrow) lapse = P.lapseLen + Math.floor(rng() * 20);
    }
    CR.step(world, g, target, P.speed, CR.SHIP_Y);
  }
  return g;
}

module.exports = { CR, LV, play, mulberry32, hashStr };
