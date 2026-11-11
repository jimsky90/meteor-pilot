/* Meteor Pilot core: deterministic world, scoring rules, ghost bot, missions. No DOM. */
(function (root) {
  const W = 360, H = 640, SHIP_Y = 560, SHIP_R = 13, TPS = 60, MAX_T = TPS * 240;
  const MAX_LIVES = 4, MAGNET_T = TPS * 6, NOVA_R = 160, NEAR_BAND = 16;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const EPOCH = Date.UTC(2026, 9, 25);
  function dayNumber(d) { return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000) + 1; }

  const PARTNERS = [["🇧🇷","Brazil"],["🇳🇬","Nigeria"],["🇯🇵","Japan"],["🇮🇳","India"],["🇲🇽","Mexico"],["🇰🇪","Kenya"],["🇫🇷","France"],["🇭🇹","Haiti"],["🇮🇩","Indonesia"],["🇪🇬","Egypt"],["🇵🇭","the Philippines"],["🇩🇪","Germany"],["🇨🇦","Canada"],["🇦🇷","Argentina"],["🇻🇳","Vietnam"],["🇵🇱","Poland"]];
  const POWERS = ["shield", "magnet", "nova"];

  /* Every meteor, star, power-up and event is fixed by the seed, so everyone plays the same course. */
  const EVENT_LEN = { shower: TPS * 5, starrain: TPS * 4, gates: TPS * 5, streaks: TPS * 5 };
  function makeWorld(seed) {
    const rng = mulberry32(hashStr(String(seed)));
    const items = [], events = [];
    const order = ["shower", "gates", "starrain", "streaks"];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let k = 0; k < 8; k++) { const t = TPS * (20 + k * 25); events.push({ t, type: order[k % 4], dur: EVENT_LEN[order[k % 4]] }); }
    const push = o => items.push(Object.assign({ id: items.length, vx: 0, zig: 0, zf: 0, spin: rng() * 6.28, power: null, gold: false, gate: -1, streak: false }, o));
    let next = 50, gid = 0, ei = 0;
    for (let t = 0; t < MAX_T; t++) {
      while (ei < events.length && t >= events[ei].t + events[ei].dur) ei++;
      const ev = events[ei] && t >= events[ei].t ? events[ei] : null;
      const secs = t / TPS, sp = 2.6 + secs * 0.028;
      if (ev) {
        const local = t - ev.t;
        if (ev.type === "shower" && local % 8 === 0) { const r = 9 + rng() * 9; push({ t, kind: "rock", r, x: r + rng() * (W - 2 * r), vy: sp + 1 + rng() * 1.6 }); }
        if (ev.type === "starrain" && local % 6 === 0) push({ t, kind: "star", r: 10, x: 20 + rng() * (W - 40), vy: 3 + rng(), gold: rng() < 0.06 });
        if (ev.type === "gates" && local % 70 === 0 && local < ev.dur - 40) {
          const gap = 84, gx = 30 + rng() * (W - 60 - gap);
          for (let x = 14; x <= W - 14; x += 26) if (x < gx - 12 || x > gx + gap + 12) push({ t, kind: "rock", r: 13, x, vy: 3.3, gate: gid });
          gid++;
        }
        if (ev.type === "streaks" && local % 34 === 20) push({ t, kind: "rock", r: 9, x: 20 + rng() * (W - 40), vy: 11, streak: true });
        next = ev.t + ev.dur + 40;
        continue;
      }
      if (t < next) continue;
      const roll = rng();
      const kind = secs > 8 && roll < 0.045 ? "power" : roll < 0.24 ? "star" : "rock";
      const r = kind === "rock" ? 11 + rng() * 13 : kind === "star" ? 10 : 13;
      const zig = kind === "rock" && secs > 12 && rng() < 0.2;
      push({
        t, kind, r, x: r + rng() * (W - 2 * r), vy: kind === "rock" ? sp + rng() * 0.8 : Math.min(sp, 3.4),
        vx: kind === "rock" && !zig ? (rng() - 0.5) * 0.6 : 0,
        zig: zig ? 28 + rng() * 34 : 0, zf: zig ? 0.035 + rng() * 0.03 : 0,
        power: kind === "power" ? POWERS[Math.floor(rng() * 3)] : null,
        gold: kind === "star" && secs > 15 && rng() < 0.08
      });
      next = t + Math.max(10, Math.round(40 - secs * 0.55 + rng() * 16));
    }
    const world = { seed: String(seed), items, events, partner: PARTNERS[Math.floor(rng() * PARTNERS.length)] };
    setBosses(world, DAILY_BOSSES);
    setWells(world, DAILY_WELLS);
    return setFlares(world, DAILY_FLARES);
  }

  /* ---------- Solar flares (v24): the sun flares for a few seconds and fires vertical heat beams down the screen.
     Each beam is marked for a full second (BEAM_WARN) before it burns (BEAM_FIRE). Own rng, so the course is unchanged. ---------- */
  const FLARE_LEN = TPS * 6, BEAM_WARN = 60, BEAM_FIRE = 30, BEAM_HW = 26, BEAM_EVERY = 55;
  /* v27: first flare at 48 s, so it ends before the first Mothership warning */
  const DAILY_FLARES = [48, 132, 177].map(s => TPS * s);
  /** Replace a world's solar flares. starts: ticks. Flares that overlap a boss or a black hole are dropped. */
  function setFlares(world, starts) {
    const rng = mulberry32(hashStr(world.seed + ":flare"));
    world.flares = (starts || []).map((t, i) => {
      const beams = [];
      for (let k = 0; k * BEAM_EVERY + BEAM_WARN + BEAM_FIRE <= FLARE_LEN - 20; k++) {
        const n = i >= 1 && k % 2 === 1 ? 2 : 1, xs = [];
        for (let q = 0; q < n; q++) {
          let x = 40 + rng() * (W - 80);
          for (let tries = 0; tries < 20 && xs.some(o => Math.abs(o - x) < 130); tries++) x = 40 + rng() * (W - 80);
          xs.push(x);
        }
        for (const x of xs) beams.push({ t: t + k * BEAM_EVERY, x, hw: BEAM_HW });
      }
      return { id: i, t, dur: FLARE_LEN, beams };
    });
    return refreshFlares(world);
  }
  function refreshFlares(world) {
    const wl = world.wellsLive || [];
    world.flaresLive = (world.flares || []).filter(f => !eventHidden(world, f) && !wl.some(w => w.t < f.t + f.dur && w.t + w.dur > f.t));
    return world;
  }
  /** Beams on screen at tick t: k = ticks since marked, live = burning now. */
  function beamsAt(world, t) {
    const out = [];
    if (world.flaresLive) for (const f of world.flaresLive) {
      if (t < f.t || t >= f.t + f.dur) continue;
      for (const b of f.beams) { const k = t - b.t; if (k >= 0 && k < BEAM_WARN + BEAM_FIRE) out.push({ b, x: b.x, hw: b.hw, k, live: k >= BEAM_WARN }); }
    }
    return out;
  }

  /* ---------- Black holes (v22): a gravity well opens between events. It bends the paths of everything falling
     past it, swallows what drifts into its core, tugs on the ship, and its core hurts. Own rng, so the course is unchanged. ---------- */
  const WELL_LEN = TPS * 7, WELL_RAMP = 60, WELL_CORE = 20, WELL_PULL = 3.4, WELL_RANGE = 300, WELL_BEND = 0.55, WELL_SIG = 150;
  /* v27: 77 s and 152 s moved to 88 s and 186 s so they no longer fall inside a Mothership fight and get dropped */
  const DAILY_WELLS = [27, 88, 186, 229].map(s => TPS * s);
  /** Replace a world's black holes. starts: ticks. Wells that overlap a boss are dropped. */
  function setWells(world, starts) {
    const rng = mulberry32(hashStr(world.seed + ":well"));
    world.wells = (starts || []).map((t, i) => ({ id: i, t, dur: WELL_LEN, x: 110 + rng() * (W - 220), y: 330 + rng() * 80, sway: 40 + rng() * 30, ph: rng() * 6.283 }));
    return refreshWells(world);
  }
  function refreshWells(world) {
    world.wellsLive = (world.wells || []).filter(w => !eventHidden(world, w));
    world.swallow = new Map(); world.swallowAt = new Map();
    for (const it of world.items) {
      if (hiddenAt(world, it.t)) continue;
      for (const w of world.wellsLive) {
        const tc = Math.ceil(it.t + (w.y + it.r) / it.vy);
        if (tc < w.t || tc >= w.t + w.dur) continue;
        const ws = wellState(w, tc), b = itemPos(it, tc), bx = b.x + (ws.x - b.x) * WELL_BEND * ws.s;
        if (ws.s > 0.25 && Math.abs(bx - ws.x) < WELL_CORE + it.r * 0.5) {
          world.swallow.set(it.id, tc);
          if (!world.swallowAt.has(tc)) world.swallowAt.set(tc, []);
          world.swallowAt.get(tc).push(it.id);
          break;
        }
      }
    }
    if (world.flares) refreshFlares(world);
    return world;
  }
  function wellAt(world, t) {
    if (world.wellsLive) for (const w of world.wellsLive) if (t >= w.t && t < w.t + w.dur) return w;
    return null;
  }
  /** Where a well is at tick t and how open it is (s: 0..1). */
  function wellState(w, t) {
    const k = t - w.t, s = Math.max(0, Math.min(1, k / WELL_RAMP, (w.dur - k) / WELL_RAMP));
    return { x: Math.max(70, Math.min(W - 70, w.x + Math.sin(k * 0.012 + w.ph) * w.sway)), y: w.y, s };
  }
  function bendX(x, y, ws) {
    if (!ws) return x;
    const dy = y - ws.y;
    return x + (ws.x - x) * WELL_BEND * ws.s * Math.exp(-(dy * dy) / (WELL_SIG * WELL_SIG));
  }
  /** Item position including any black-hole bending. */
  function posAt(world, it, t) {
    const p = itemPos(it, t), w = wellAt(world, t);
    if (w) p.x = bendX(p.x, p.y, wellState(w, t));
    return p;
  }

  /* ---------- Mothership boss: slow, readable bullet patterns fixed by the seed (own rng, so the course itself is unchanged).
     While a boss is on screen (plus a short warning before it), normal meteors, stars and events are held back. ---------- */
  const BOSS_WARN = 150, BOSS_ENTER = 100, BOSS_LEAVE = 60, BOSS_HP = 5;
  /* v27 (audit #1): the first Mothership arrives at 1:00 so most players actually meet it; the tougher one at 2:30 */
  const DAILY_BOSSES = [{ t0: TPS * 60, dur: TPS * 22, lvl: 0 }, { t0: TPS * 150, dur: TPS * 22, lvl: 2 }];
  function bossPos(b, t) {
    const k = t - b.t0;
    let y = 96;
    if (k < 90) { const e = Math.max(0, k) / 90; y = -70 + 166 * (1 - (1 - e) * (1 - e)); }
    else if (k > b.dur - BOSS_LEAVE) y = 96 - (k - (b.dur - BOSS_LEAVE)) / BOSS_LEAVE * 180;
    return { x: W / 2 + Math.sin(k * 0.011) * 100 + Math.sin(k * 0.027) * 18, y };
  }
  function buildBoss(seed, idx, spec) {
    const rng = mulberry32(hashStr(seed + ":boss" + idx));
    const lvl = spec.lvl || 0, sp = 1 + lvl * 0.1;
    const b = { t0: spec.t0, dur: spec.dur, lvl, hp: BOSS_HP, bullets: [], cores: [] };
    const start = b.t0 + BOSS_ENTER, end = b.t0 + b.dur - BOSS_LEAVE - 20;
    const shot = (t, x, y, ang, v, r) => b.bullets.push({ t, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: r || 6 });
    const pats = ["fan", "curtain", "ring", "spiral"];
    for (let i = pats.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pats[i], pats[j]] = [pats[j], pats[i]]; }
    let t = start, k = 0;
    while (t < end) {
      const p = pats[k % pats.length], stop = Math.min(end, t + 170), rot = rng() * 6.283;
      let n = 0;
      for (let s = t; s < stop; s++) {
        const local = s - t, bp = bossPos(b, s), ox = bp.x, oy = bp.y + 24;
        if (p === "fan" && local % 45 === 0) {
          const m = 5 + lvl, gap = 1.8 / (m - 1), off = (n++ % 2) ? gap / 2 : 0;
          for (let q = 0; q < m; q++) shot(s, ox, oy, Math.PI / 2 - 0.9 + q * gap + off - gap / 4, 2.2 * sp);
        }
        if (p === "ring" && local % 60 === 0) {
          const m = 12 + 2 * lvl, a0 = rot + (n++) * 0.26;
          for (let q = 0; q < m; q++) shot(s, ox, oy, a0 + q / m * 6.283, 1.8 * sp);
        }
        if (p === "spiral" && local % 7 === 0) {
          const a = rot + local * 0.045;
          shot(s, ox, oy, a, 2.0 * sp); shot(s, ox, oy, a + Math.PI, 2.0 * sp);
        }
        if (p === "curtain" && local % 60 === 10) {
          const gw = 96 - lvl * 6, gx = 20 + rng() * (W - 40 - gw);
          for (let x = 12; x <= W - 12; x += 28) if (x < gx || x > gx + gw) b.bullets.push({ t: s, x, y: -10, vx: 0, vy: 2.3 * sp, r: 7 });
        }
      }
      t = stop + 40; k++;
    }
    for (let s = start + 50; s < end; s += 130) { const bp = bossPos(b, s); b.cores.push({ id: idx * 100 + b.cores.length, t: s, x: bp.x, y: bp.y + 20, vy: 1.9, r: 11 }); }
    return b;
  }
  /** Replace a world's bosses. specs: [{ t0, dur, lvl }] in ticks. Deterministic from the world's seed. */
  function setBosses(world, specs) {
    world.bosses = (specs || []).map((s, i) => buildBoss(world.seed, i, s));
    world.hide = world.bosses.map(b => [b.t0 - BOSS_WARN, b.t0 + b.dur]);
    if (world.wells) refreshWells(world);
    if (world.flares) refreshFlares(world);
    return world;
  }
  function hiddenAt(world, t) {
    if (world.hide) for (const h of world.hide) if (t >= h[0] && t < h[1]) return true;
    return false;
  }
  function eventHidden(world, e) {
    if (world.hide) for (const h of world.hide) if (e.t < h[1] && e.t + e.dur > h[0]) return true;
    return false;
  }
  /** Boss bullets and cores on screen at tick t. With a runner, skips bosses it destroyed and cores it caught. */
  function bossActive(world, r, t) {
    const shots = [], cores = [];
    if (!world.bosses) return { shots, cores };
    world.bosses.forEach((b, i) => {
      if (t < b.t0 || t > b.t0 + b.dur + 420) return;
      if (r && r.bossKill[i] != null) return;
      for (const s of b.bullets) {
        if (s.t > t) break;
        const age = t - s.t; if (age > 420) continue;
        const x = s.x + s.vx * age, y = s.y + s.vy * age;
        if (x < -20 || x > W + 20 || y < -30 || y > H + 20) continue;
        shots.push({ s, i, x, y, r: s.r });
      }
      if (t > b.t0 + b.dur) return;
      for (const c of b.cores) {
        if (c.t > t) break;
        if (r && r.cores.has(c.id)) continue;
        const y = c.y + c.vy * (t - c.t);
        if (y - c.r > H) continue;
        cores.push({ c, i, x: c.x, y, r: c.r });
      }
    });
    return { shots, cores };
  }
  function itemPos(it, t) {
    const span = W - 2 * it.r;
    let x = it.x + it.vx * (t - it.t) - it.r;
    x = ((x % (2 * span)) + 2 * span) % (2 * span);
    if (x > span) x = 2 * span - x;
    x += it.r;
    if (it.zig) x = Math.max(it.r, Math.min(W - it.r, x + Math.sin((t - it.t) * it.zf) * it.zig));
    return { x, y: -it.r + it.vy * (t - it.t) };
  }
  function active(world, t) {
    const out = [], wl = wellAt(world, t), ws = wl && wellState(wl, t), sw = world.swallow;
    for (const it of world.items) {
      if (it.t > t) break;
      if (world.hide && hiddenAt(world, it.t)) continue;
      if (sw && sw.size) { const k = sw.get(it.id); if (k != null && t >= k) continue; }
      const p = itemPos(it, t);
      if (ws) p.x = bendX(p.x, p.y, ws);
      if (p.y - it.r > H) continue;
      out.push({ it, x: p.x, y: p.y });
    }
    return out;
  }

  function newRunner(cfg) {
    cfg = Object.assign({ speed: 14, hit: SHIP_R, lives: 3, magnetT: MAGNET_T, novaR: NOVA_R, starMul: 1, keep: 0, ability: null }, cfg || {});
    return { cfg, keep: cfg.keep, x: W / 2, y: SHIP_Y, lives: cfg.lives, inv: 0, stars: 0, got: new Set(), alive: true, t: 0, score: 0, bonus: 0,
      combo: 0, mult: 1, maxMult: 1, magnet: 0, smashed: new Set(), close: new Set(), hitIds: new Set(),
      nearDone: new Set(), near: 0, powers: 0, gates: 0, gateHit: new Set(), gateDone: new Set(), golds: 0,
      bossHp: [], bossKill: [], bossHurt: [], cores: new Set(), coreCount: 0, bossesDown: 0, wells: 0, flares: 0, siphons: 0 };
  }
  /* Ship abilities (v25). siphon: every SIPHON_EVERY stars restores a shield. phase: hits leave you phased twice as long, close calls pay double. */
  const SIPHON_EVERY = 15;
  const invFor = r => r.cfg.ability === "phase" ? 150 : 75;

  /* One fixed step for a ship heading to targetX. Returns events for the screen to show. */
  const MIN_Y = H * 0.3, MAX_Y = H - SHIP_R - 18;
  function step(world, r, targetX, maxSpeed, targetY) {
    if (!r.alive) return [];
    const ev = [];
    const ty = targetY == null ? r.y : targetY;
    const dx = targetX - r.x, dy = ty - r.y, dist = Math.hypot(dx, dy);
    const k = dist > maxSpeed ? maxSpeed / dist : 1;
    r.x = Math.max(SHIP_R, Math.min(W - SHIP_R, r.x + dx * k));
    r.y = Math.max(MIN_Y, Math.min(MAX_Y, r.y + dy * k));
    r.t++;
    if (r.inv > 0) r.inv--;
    if (r.magnet > 0) r.magnet--;
    const well = wellAt(world, r.t), wst = well && wellState(well, r.t);
    if (wst) {
      const wx = wst.x - r.x, wy = wst.y - r.y, wd = Math.hypot(wx, wy) || 1, f = WELL_PULL * wst.s * Math.max(0, 1 - wd / WELL_RANGE) ** 2;
      r.x = Math.max(SHIP_R, Math.min(W - SHIP_R, r.x + wx / wd * f));
      r.y = Math.max(MIN_Y, Math.min(MAX_Y, r.y + wy / wd * f));
    }
    const list = active(world, r.t);
    for (const a of list) {
      const it = a.it, d = Math.hypot(a.x - r.x, a.y - r.y);
      if (it.kind === "star") {
        const reach = r.magnet > 0 ? 95 : it.r + r.cfg.hit + 4;
        if (d < reach && !r.got.has(it.id)) {
          r.got.add(it.id); r.stars++; r.combo++;
          r.mult = Math.min(5, 1 + Math.floor(r.combo / 3)); r.maxMult = Math.max(r.maxMult, r.mult);
          const pts = Math.round((it.gold ? 150 : 25) * r.mult * r.cfg.starMul);
          r.bonus += pts; if (it.gold) r.golds++;
          ev.push({ type: "star", x: a.x, y: a.y, pts, mult: r.mult, gold: it.gold });
          if (r.cfg.ability === "siphon" && r.stars % SIPHON_EVERY === 0) {
            const cap = Math.max(MAX_LIVES, r.cfg.lives + 1);
            if (r.lives < cap) { r.lives++; r.siphons++; ev.push({ type: "siphon", x: r.x, y: r.y }); }
          }
        }
      } else if (it.kind === "power") {
        if (d < it.r + r.cfg.hit + 6 && !r.got.has(it.id)) {
          r.got.add(it.id); r.powers++;
          if (it.power === "shield") r.lives = Math.min(Math.max(MAX_LIVES, r.cfg.lives + 1), r.lives + 1);
          if (it.power === "magnet") r.magnet = r.cfg.magnetT;
          if (it.power === "nova") {
            let n = 0;
            for (const b of list) {
              if (b.it.kind !== "rock" || r.smashed.has(b.it.id) || b.y < -20) continue;
              if (Math.hypot(b.x - r.x, b.y - r.y) < r.cfg.novaR) { r.smashed.add(b.it.id); n++; ev.push({ type: "smash", x: b.x, y: b.y }); }
            }
            r.bonus += 15 * n;
          }
          ev.push({ type: "power", power: it.power, x: a.x, y: a.y });
        }
      } else if (!r.smashed.has(it.id)) {
        const hitR = it.r * 0.82 + r.cfg.hit;
        if (it.gate >= 0 && d < hitR) r.gateHit.add(it.gate);
        if (it.gate >= 0 && !r.gateDone.has(it.gate) && !r.gateHit.has(it.gate) && a.y - it.r > r.y + SHIP_R) {
          r.gateDone.add(it.gate); r.gates++; r.bonus += 50 * r.mult;
          ev.push({ type: "gate", x: r.x, y: r.y - 34, pts: 50 * r.mult });
        }
        if (d < hitR && r.inv === 0) {
          r.hitIds.add(it.id); r.lives--; r.inv = invFor(r);
          if (r.keep > 0) { r.keep--; ev.push({ type: "guard" }); } else { r.combo = 0; r.mult = 1; }
          ev.push({ type: "hit", x: a.x, y: a.y });
          if (r.lives <= 0) { r.alive = false; ev.push({ type: "dead" }); break; }
        } else if (d < hitR + NEAR_BAND && r.inv === 0) {
          r.close.add(it.id);
        }
        if (r.close.has(it.id) && !r.hitIds.has(it.id) && !r.nearDone.has(it.id) && a.y - it.r > r.y + SHIP_R) {
          const np = 10 * r.mult * (r.cfg.ability === "phase" ? 2 : 1);
          r.nearDone.add(it.id); r.near++; r.bonus += np;
          ev.push({ type: "near", x: r.x, y: r.y - 30, pts: np });
        }
      }
    }
    if (r.alive && world.bosses && world.bosses.length) {
      world.bosses.forEach((b, i) => { if (r.t === b.t0) ev.push({ type: "bossIn", i }); });
      const ba = bossActive(world, r, r.t);
      for (const a of ba.cores) {
        if (r.bossKill[a.i] != null) continue;
        const reach = r.magnet > 0 ? 95 : a.r + r.cfg.hit + 6;
        if (Math.hypot(a.x - r.x, a.y - r.y) >= reach) continue;
        const b = world.bosses[a.i];
        r.cores.add(a.c.id); r.coreCount++;
        const hp = (r.bossHp[a.i] == null ? b.hp : r.bossHp[a.i]) - 1; r.bossHp[a.i] = hp;
        const pts = 40 * r.mult; r.bonus += pts;
        ev.push({ type: "core", x: a.x, y: a.y, pts, hp, max: b.hp, i: a.i });
        if (hp <= 0) {
          r.bossKill[a.i] = r.t; r.bossesDown++;
          const clean = !r.bossHurt[a.i], p2 = (300 + 200 * b.lvl) * (clean ? 2 : 1), bp = bossPos(b, r.t);
          r.bonus += p2;
          ev.push({ type: "bossDown", x: bp.x, y: bp.y, pts: p2, clean, i: a.i });
        }
      }
      if (r.inv === 0) for (const a of ba.shots) {
        if (r.bossKill[a.i] != null) continue;
        if (Math.hypot(a.x - r.x, a.y - r.y) >= a.r + r.cfg.hit * 0.5) continue;
        r.bossHurt[a.i] = true; r.hitIds.add("boss" + r.t); r.lives--; r.inv = invFor(r);
        if (r.keep > 0) { r.keep--; ev.push({ type: "guard" }); } else { r.combo = 0; r.mult = 1; }
        ev.push({ type: "hit", x: a.x, y: a.y });
        if (r.lives <= 0) { r.alive = false; ev.push({ type: "dead" }); }
        break;
      }
      if (r.alive) world.bosses.forEach((b, i) => {
        if (r.t === b.t0 + b.dur && r.bossKill[i] == null) { const pts = 100 + 50 * b.lvl; r.bonus += pts; ev.push({ type: "bossGone", pts, i }); }
      });
    }
    if (r.alive && wst && wst.s > 0.25 && r.inv === 0 && Math.hypot(wst.x - r.x, wst.y - r.y) < WELL_CORE + r.cfg.hit * 0.5) {
      r.hitIds.add("well" + r.t); r.lives--; r.inv = invFor(r);
      if (r.keep > 0) { r.keep--; ev.push({ type: "guard" }); } else { r.combo = 0; r.mult = 1; }
      ev.push({ type: "hit", x: wst.x, y: wst.y, well: true });
      if (r.lives <= 0) { r.alive = false; ev.push({ type: "dead" }); }
    }
    if (r.alive && r.inv === 0 && world.flaresLive && world.flaresLive.length) for (const a of beamsAt(world, r.t)) {
      if (!a.live || Math.abs(r.x - a.x) >= a.hw + r.cfg.hit * 0.5) continue;
      r.hitIds.add("flare" + r.t); r.lives--; r.inv = invFor(r);
      if (r.keep > 0) { r.keep--; ev.push({ type: "guard" }); } else { r.combo = 0; r.mult = 1; }
      ev.push({ type: "hit", x: a.x, y: r.y, flare: true });
      if (r.lives <= 0) { r.alive = false; ev.push({ type: "dead" }); }
      break;
    }
    if (r.alive && world.flaresLive) for (const f of world.flaresLive) {
      if (r.t === f.t + f.dur) { r.bonus += 100; r.flares++; ev.push({ type: "survived", event: "flare" }); }
    }
    if (r.alive && world.wellsLive) for (const w of world.wellsLive) {
      if (r.t === w.t + w.dur) { r.bonus += 100; r.wells++; ev.push({ type: "survived", event: "well" }); }
    }
    if (world.events) for (const e of world.events) {
      if (r.t === e.t + e.dur && !eventHidden(world, e)) { r.bonus += 100; ev.push({ type: "survived", event: e.type }); }
    }
    r.score = Math.floor(r.t / 6) + r.bonus;
    if (r.t >= MAX_T - 1) r.alive = false;
    return ev;
  }

  /* The ghost: a decent but imperfect bot that reads only a short window ahead. */
  function ghostAim(world, g, rng) {
    let best = g.x, bestCost = Infinity;
    const ba = world.bosses && world.bosses.length ? bossActive(world, g, g.t) : null;
    const bm = world.flaresLive && world.flaresLive.length ? beamsAt(world, g.t) : null;
    for (let i = 0; i <= 16; i++) {
      const cx = SHIP_R + i * (W - 2 * SHIP_R) / 16;
      let cost = Math.abs(cx - g.x) * 0.02;
      for (const a of active(world, g.t)) {
        const dt = (SHIP_Y - a.y) / a.it.vy;
        if (dt < -4 || dt > 34) continue;
        const reach = Math.abs(cx - g.x) / 3.0;
        const gap = Math.abs(posAt(world, a.it, g.t + Math.max(0, dt)).x - cx);
        if (a.it.kind !== "rock") { if (gap < 26 && reach <= dt + 2 && !g.got.has(a.it.id)) cost -= a.it.kind === "power" ? 5 : 3; }
        else if (!g.smashed.has(a.it.id) && gap < a.it.r + SHIP_R + 10) cost += 10 + (reach > dt ? 20 : 0);
      }
      if (ba) {
        const reach = Math.abs(cx - g.x) / 3.0;
        for (const a of ba.shots) {
          if (a.s.vy <= 0.2) continue;
          const dt = (SHIP_Y - a.y) / a.s.vy;
          if (dt < -3 || dt > 40) continue;
          if (Math.abs(a.x + a.s.vx * Math.max(0, dt) - cx) < a.r + 14) cost += 12 + (reach > dt ? 20 : 0);
        }
        for (const a of ba.cores) {
          const dt = (SHIP_Y - a.y) / a.c.vy;
          if (dt >= 0 && dt <= 60 && Math.abs(a.x - cx) < 24 && reach <= dt + 2) cost -= 6;
        }
      }
      if (bm) for (const a of bm) if (a.k > BEAM_WARN - 50 && Math.abs(cx - a.x) < a.hw + SHIP_R + 8) cost += 30;
      cost += rng() * 3.2;
      if (cost < bestCost) { bestCost = cost; best = cx; }
    }
    return best;
  }
  function recordGhost(world) {
    const rng = mulberry32(hashStr(world.seed + ":ghost"));
    const g = newRunner(), path = [g.x], scores = [0];
    let aim = g.x, lapse = 0;
    while (g.alive) {
      if (lapse > 0) lapse--;
      else if (g.t % 6 === 0) {
        aim = ghostAim(world, g, rng);
        if (rng() < 0.02 + g.t / TPS * 0.0004) lapse = 22 + Math.floor(rng() * 20);
      }
      step(world, g, aim, 3.0, SHIP_Y);
      path.push(g.x); scores.push(g.score);
    }
    return { path, scores, score: g.score, t: g.t, stars: g.stars };
  }

  /* Three daily missions, the same for everyone that day.
     v28 (audit #2): sizes tuned to where players actually get to (survival, score and close calls came down). */
  const MISSION_POOL = [
    { id: "stars", make: n => ({ text: `Grab ${n} stars in one run`, goal: n, of: r => r.stars }), sizes: [15, 25, 35] },
    { id: "combo", make: n => ({ text: `Reach a ×${n} combo`, goal: n, of: r => r.maxMult }), sizes: [3, 4, 5] },
    { id: "time", make: n => ({ text: `Survive ${n} seconds`, goal: n, of: r => Math.floor(r.t / TPS) }), sizes: [30, 45, 60] },
    { id: "near", make: n => ({ text: `Pull off ${n} close calls in one run`, goal: n, of: r => r.near }), sizes: [3, 6, 10] },
    { id: "power", make: n => ({ text: `Catch ${n} power-ups in one run`, goal: n, of: r => r.powers }), sizes: [2, 3, 4] },
    { id: "gates", make: n => ({ text: `Fly through ${n} gates in one run`, goal: n, of: r => r.gates }), sizes: [2, 3, 4] },
    { id: "score", make: n => ({ text: `Score ${n.toLocaleString()} points`, goal: n, of: r => r.score }), sizes: [600, 1200, 2000] }
  ];
  /* v26: a gates event holds 4 gates, so a gates mission is only offered when the daily course has a gates event
     that starts before 60 s and isn't hidden by the Mothership. Uses the same first rng draws as makeWorld's event shuffle. */
  const GATES_BY = TPS * 60;
  function firstGatesAt(seed) {
    const rng = mulberry32(hashStr(String(seed)));
    const order = ["shower", "gates", "starrain", "streaks"];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const hide = DAILY_BOSSES.map(b => [b.t0 - BOSS_WARN, b.t0 + b.dur]);
    for (let k = 0; k < 8; k++) {
      const t = TPS * (20 + k * 25), dur = EVENT_LEN[order[k % 4]];
      if (order[k % 4] === "gates" && !hide.some(h => t < h[1] && t + dur > h[0])) return t;
    }
    return Infinity;
  }
  function missions(day) {
    const rng = mulberry32(hashStr("missions-" + day));
    const pool = MISSION_POOL.filter(m => m.id !== "gates" || firstGatesAt("comet-" + day) < GATES_BY), out = [];
    for (let tier = 0; tier < 3; tier++) {
      const m = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      out.push(Object.assign({ key: m.id + tier, reward: 30 + tier * 30 }, m.make(m.sizes[tier])));
    }
    return out;
  }

  const SKINS = [
    { id: "comet", name: "Comet", cost: 0, body: "#ffcc4d", flame: "#ff7a3d", speed: 14, hit: 13, lives: 3, desc: "Balanced all-rounder" },
    { id: "ember", name: "Ember", cost: 60, body: "#ff6b4a", flame: "#ffd166", speed: 17, hit: 13, lives: 3, desc: "Fastest ship in the fleet" },
    { id: "aurora", name: "Aurora", cost: 180, body: "#7cf3a0", flame: "#4fb8ff", speed: 14, hit: 10.5, lives: 3, desc: "Tiny frame, slips through gaps" },
    { id: "nebula", name: "Nebula", cost: 400, body: "#ff7ad9", flame: "#9b7bff", speed: 13, hit: 13, lives: 4, desc: "Heavy armor, starts with 4 shields" },
    { id: "halo", name: "Halo", cost: 500, body: "#9fe8ff", flame: "#ffe08a", speed: 14, hit: 13, lives: 3, ability: "siphon", desc: "Star Siphon: every 15 stars restores a shield" },
    { id: "void", name: "Void", cost: 800, body: "#f4f1ff", flame: "#a26bff", speed: 16, hit: 11, lives: 4, desc: "Fast, small and armored" },
    { id: "phantom", name: "Phantom", cost: 1100, body: "#b9a6ff", flame: "#4fe0cf", speed: 15, hit: 12, lives: 3, ability: "phase", desc: "Phase Shift: phases out twice as long after a hit. Close calls pay double" }
  ];

  /* Turn a ship + upgrade levels into run settings. Shared by the game and the server so both score the same. */
  const UP_KEYS = ["magnet", "guard", "value", "nova"];
  function loadoutCfg(shipId, up) {
    const s = SKINS.find(x => x.id === shipId) || SKINS[0];
    const lv = k => { const v = up && up[k]; return Number.isInteger(v) ? Math.max(0, Math.min(5, v)) : 0; };
    return { ship: s.id, ability: s.ability || null, speed: s.speed, hit: s.hit, lives: s.lives, magnetT: MAGNET_T + lv("magnet") * 90,
      novaR: NOVA_R + lv("nova") * 25, starMul: 1 + lv("value") * 0.1, keep: lv("guard") };
  }

  /* Replay a recorded run. inputs: [[ticksSincePrevChange, x, y], ...] with integer targets. */
  function replay(world, cfg, inputs) {
    const r = newRunner(cfg);
    let tx = W / 2, ty = SHIP_Y, i = 0, wait = inputs.length ? inputs[0][0] : Infinity;
    while (r.alive) {
      while (i < inputs.length && wait <= 0) { tx = inputs[i][1]; ty = inputs[i][2]; i++; wait = i < inputs.length ? inputs[i][0] : Infinity; }
      step(world, r, tx, cfg.speed, ty);
      wait--;
    }
    return { score: r.score, t: r.t, stars: r.stars, golds: r.golds, usedInputs: i };
  }

  function fmtTime(s) { return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0"); }

  root.CR = { MIN_Y, MAX_Y, W, H, SHIP_Y, SHIP_R, TPS, MAX_LIVES, MAGNET_T, NOVA_R, dayNumber, makeWorld, active, newRunner, step,
    recordGhost, missions, SKINS, fmtTime, loadoutCfg, replay, MAX_T,
    bossPos, bossActive, setBosses, hiddenAt, eventHidden, BOSS_WARN, BOSS_HP,
    setWells, wellAt, wellState, WELL_CORE, WELL_RANGE,
    setFlares, beamsAt, BEAM_WARN, BEAM_FIRE, FLARE_LEN, SIPHON_EVERY, firstGatesAt };
})(typeof module !== "undefined" ? module.exports : window);

