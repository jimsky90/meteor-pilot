/* Loads the real game rules straight out of index.html for Node tests.
   - CR: the deterministic rules (first <script>), with a few internals exposed for the test bot.
   - makeLevels: copied out of the app script (it only needs CR).
   Nothing here is a copy that can go stale: every run reads the current index.html. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const INDEX = path.join(ROOT, "index.html");

function readIndex(file) { return fs.readFileSync(file || INDEX, "utf8"); }

/** All inline <script> bodies in order: [{ start, code }] */
function scripts(html) {
  const out = [], re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) { if (!/\bsrc=/.test(m[1] || "")) out.push({ start: m.index, attrs: m[1] || "", code: m[2] }); }
  return out;
}

/** The game's two scripts: the rules (window.CR) and the app. */
function gameScripts(html) {
  const s = scripts(html);
  const cr = s.find(x => /root\.CR\s*=/.test(x.code));
  const app = s.find(x => /const LV = makeLevels\(CR\)/.test(x.code));
  if (!cr) throw new Error("Could not find the rules script (root.CR = {...}) in index.html");
  if (!app) throw new Error("Could not find the app script (const LV = makeLevels(CR)) in index.html");
  return { cr: cr.code, app: app.code, all: s };
}

/** Load CR in a fresh, sealed VM context (no Math.random/Date leaks from other tests). */
function loadCR(html, opts) {
  const { cr } = gameScripts(html || readIndex());
  let src = cr;
  /* expose internals the test bot needs; harmless if a name disappears (the bot falls back) */
  const internals = ["posAt", "ghostAim", "MIN_Y", "MAX_Y", "POD_VY", "FRAG_VY", "MOTE_VY", "ESC_Y"]
    .filter(n => new RegExp("\\b(function\\s+" + n + "\\b|" + n + "\\s*=)").test(cr));
  src = src.replace("root.CR = {", "root.CR = { " + internals.map(n => "_" + n + ": " + n).join(", ") + (internals.length ? ", " : ""));
  const sandbox = { window: {}, module: undefined, console };
  if (opts && opts.trapNondeterminism) {
    /* any call to Math.random / Date.now / new Date() / performance.now inside the rules is recorded */
    const hits = sandbox.__nondet = [];
    const M = Object.create(Math); M.random = () => { hits.push("Math.random"); return 0.5; };
    sandbox.Math = M;
    const RealDate = Date;
    function FakeDate(...a) { if (!a.length) hits.push("new Date()"); return new RealDate(...(a.length ? a : [0])); }
    FakeDate.UTC = RealDate.UTC; FakeDate.now = () => { hits.push("Date.now"); return 0; }; FakeDate.prototype = RealDate.prototype;
    sandbox.Date = FakeDate;
    sandbox.performance = { now: () => { hits.push("performance.now"); return 0; } };
  }
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "index.html#CR" });
  const CR = sandbox.window.CR;
  if (!CR) throw new Error("window.CR was not defined by the rules script");
  CR.__sandbox = sandbox;
  return CR;
}

/** Extract makeLevels(CR) from the app script and build LV. */
function loadLevels(CR, html) {
  const { app } = gameScripts(html || readIndex());
  const a = app.indexOf("function makeLevels(CR)");
  const b = app.indexOf("const LV = makeLevels(CR);");
  if (a < 0 || b < 0) throw new Error("makeLevels(CR) not found in the app script");
  const src = app.slice(a, b);
  const ctx = vm.createContext({ CR, console, Math, Map, Set, Array, Object, Number, String, JSON });
  return vm.runInContext("(function(){" + src + "\n return makeLevels(CR); })()", ctx, { filename: "index.html#makeLevels" });
}

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Stable fingerprint of any JSON-able value (Sets/Maps become arrays). */
function fingerprint(v) {
  const seen = new WeakSet();
  const s = JSON.stringify(v, (k, x) => {
    if (x instanceof Set) return Array.from(x);
    if (x instanceof Map) return Array.from(x.entries());
    if (typeof x === "function") return "fn";
    if (x && typeof x === "object") { if (seen.has(x)) return "[cycle]"; seen.add(x); }
    if (typeof x === "number" && !Number.isFinite(x)) return String(x);
    return x;
  });
  return hashStr(s).toString(16) + ":" + s.length;
}

/* ---------------- The test bot ----------------
   A strong, deterministic pilot. Same cost idea as the game's own ghost (CR ghostAim), but it flies at the
   real ship speed, never lapses, can fly at any height, shadows the Light Ship on escort missions and tries
   several noise seeds. It drives the exact CR.step the game uses, and records inputs in CR.replay format. */
function makeBot(CR) {
  const { W, SHIP_R, SHIP_Y } = CR;
  const posAt = CR._posAt;
  function aim(world, g, rng, P) {
    const ty = P.ty;
    let best = g.x, bestCost = Infinity;
    const ba = world.bosses && world.bosses.length ? CR.bossActive(world, g, g.t) : null;
    const bm = world.flaresLive && world.flaresLive.length ? CR.beamsAt(world, g.t) : null;
    const act = CR.active(world, g.t);
    const esc = world.escort ? CR.escortAt(world, g.t) : null;
    for (let i = 0; i <= 24; i++) {
      const cx = SHIP_R + i * (W - 2 * SHIP_R) / 24;
      let cost = Math.abs(cx - g.x) * 0.01;
      const reach = Math.abs(cx - g.x) / P.speed;
      for (const a of act) {
        const vy = a.it.vy || 1;
        const dt = (g.y - a.y) / vy;
        if (dt < -4 || dt > P.horizon) continue;
        const px = posAt ? posAt(world, a.it, g.t + Math.max(0, dt)).x : a.x + (a.it.vx || 0) * Math.max(0, dt);
        const gap = Math.abs(px - cx);
        if (a.it.kind !== "rock") { if (gap < 26 && reach <= dt + 2 && !g.got.has(a.it.id)) cost -= a.it.kind === "power" ? 5 : 3 * P.greed; continue; }
        if (g.smashed.has(a.it.id)) continue;
        const hitR = a.it.r * 0.82 + g.cfg.hit;
        if (esc) {
          /* escort: while linked, rocks that touch you are blocked, so put yourself between the rocks and the Light Ship */
          const de = (esc.y - a.y) / vy;
          if (de > 0 && de < P.horizon + 20) { const ex = posAt ? posAt(world, a.it, g.t + de).x : a.x; if (Math.abs(ex - esc.x) < a.it.r + 30 && Math.abs(px - cx) < hitR + 4) cost -= 20; }
          continue;
        }
        /* sweep the time the rock spends crossing the ship's row, with the ship travelling toward cx */
        const tIn = (g.y - hitR - P.margin - a.y) / vy, tOut = (g.y + hitR + P.margin - a.y) / vy;
        if (tOut < 0 || tIn > P.horizon) continue;
        let dmin = Infinity;
        for (let q = 0; q <= 4; q++) {
          const s = Math.max(0, tIn + (tOut - tIn) * q / 4);
          const sx = g.x + Math.sign(cx - g.x) * Math.min(Math.abs(cx - g.x), P.speed * s);
          const rx = posAt ? posAt(world, a.it, g.t + s).x : a.x;
          dmin = Math.min(dmin, Math.abs(rx - sx));
        }
        if (dmin < hitR + P.margin) cost += 40;
        else if (P.close && dmin < hitR + P.margin + 10 && reach <= dt) cost -= P.close;
      }
      if (ba) {
        for (const a of ba.shots) {
          if (a.s.vy <= 0.2) continue;
          const dt = (g.y - a.y) / a.s.vy;
          if (dt < -3 || dt > P.horizon + 6) continue;
          if (Math.abs(a.x + a.s.vx * Math.max(0, dt) - cx) < a.r + 16) cost += 14 + (reach > dt ? 25 : 0);
        }
        for (const a of ba.cores) {
          const dt = (g.y - a.y) / a.c.vy;
          if (dt >= 0 && dt <= 60 && Math.abs(a.x - cx) < 24 && reach <= dt + 2) cost -= 6;
        }
      }
      if (bm) for (const a of bm) if (a.k > CR.BEAM_WARN - 60 && Math.abs(cx - a.x) < a.hw + SHIP_R + 10) cost += 40;
      if (world.rescue && CR.podAt) for (const p of world.rescue.pods) {
        if (g.t < p.t - 30 || g.podDone.has(p.id)) continue;
        const t0 = Math.max(g.t, p.t), dt = (g.y - CR.podAt(p, t0).y) / (CR._POD_VY || 1.6);
        if (dt < -4 || dt > 140) continue;
        if (Math.abs(CR.podAt(p, t0 + Math.max(0, dt)).x - cx) < 20 && reach <= dt + 2) cost -= 14;
      }
      if (world.beacon && CR.moteAt) for (const m of world.beacon.motes) {
        if (m.t > g.t + 10) break;
        if (g.moteDone.has(m.id)) continue;
        const dt = (g.y - CR.moteAt(m, g.t).y) / (CR._MOTE_VY || 2.6);
        if (dt < -2 || dt > 70) continue;
        if (Math.abs(CR.moteAt(m, g.t + Math.max(0, dt)).x - cx) < 18 && reach <= dt + 2) cost -= 2;
      }
      if (world.heist && CR.fragAt) {
        for (const f of world.heist.frags) {
          if (g.t < f.t - 30 || g.fragDone.has(f.id)) continue;
          const t0 = Math.max(g.t, f.t), dt = (g.y - CR.fragAt(f, t0).y) / (CR._FRAG_VY || 1.7);
          if (dt < -4 || dt > 140) continue;
          if (Math.abs(CR.fragAt(f, t0 + Math.max(0, dt)).x - cx) < 20 && reach <= dt + 2) cost -= 12;
        }
        for (let dt = 0; dt <= 30; dt += 10) { const lt = CR.lightAt(world, g.t + dt); if (lt && lt.on >= 0.5 && Math.abs(cx - lt.x) < lt.r + 18 && Math.abs(g.y - lt.y) < lt.r + 10) cost += 30; }
      }
      if (esc) cost += Math.max(0, Math.abs(cx - esc.x) - 30) * 1.5; /* stay inside the Light Ship's link ring */
      cost += rng() * P.noise;
      if (cost < bestCost) { bestCost = cost; best = cx; }
    }
    return best;
  }
  /** Fly one run. Returns { r, inputs } where inputs are CR.replay inputs. */
  function fly(world, cfg, opt) {
    const P = Object.assign({ speed: cfg.speed || 14, horizon: 40, greed: 1, noise: 1.5, every: 3, margin: 10, close: 0, tag: "bot", maxT: Infinity, aimUntil: Infinity }, opt || {});
    const rng = mulberry32(hashStr(world.seed + ":" + P.tag));
    const r = CR.newRunner(cfg);
    const inputs = [];
    let tx = W / 2, ty = SHIP_Y, last = { x: Math.round(W / 2), y: SHIP_Y }, since = 0;
    while (r.alive && r.t < P.maxT) {
      if (r.t % P.every === 0 && r.t < P.aimUntil) {
        if (world.escort) { const e = CR.escortAt(world, r.t); ty = Math.round(Math.max(CR._MIN_Y || 0, e.y - 46)); }
        else ty = P.y0 || SHIP_Y;
        P.ty = ty;
        tx = Math.round(aim(world, r, rng, P));
      }
      if (tx !== last.x || ty !== last.y) { inputs.push([since, tx, ty]); since = 0; last = { x: tx, y: ty }; }
      CR.step(world, r, tx, cfg.speed, ty);
      since++;
    }
    return { r, inputs };
  }
  return { fly, aim };
}

module.exports = { ROOT, INDEX, readIndex, scripts, gameScripts, loadCR, loadLevels, makeBot, mulberry32, hashStr, fingerprint };
