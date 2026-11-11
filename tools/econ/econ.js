// 30-day economy model for Meteor Pilot. Uses bot run banks (bank.json) and the real daily mission generator.
// node econ.js before|after [days]
const { CR, LV, mulberry32, hashStr } = require("./load");
const BANK = require("./bank.json");

const LIVES = { comet: 3, ember: 3, aurora: 3, nebula: 4, halo: 3, void: 4, phantom: 3 };
const BEFORE = {
  name: "before",
  shipCost: { comet: 0, ember: 60, aurora: 180, nebula: 400, halo: 500, void: 800, phantom: 1100 },
  shipRank: { comet: 1, ember: 2, aurora: 4, nebula: 7, halo: 6, void: 10, phantom: 13 },
  upCosts: { magnet: [40, 100, 220, 400, 700], guard: [60, 140, 300, 520, 850], value: [50, 120, 260, 450, 750], nova: [40, 100, 220, 400, 700] },
  upRank: [1, 1, 1, 1, 1],
  trails: [["sparks", 80, 3], ["rainbow", 220, 5], ["plasma", 450, 8], ["stardust", 900, 12]],
  cosmetics: [[7, 120], [6, 300], [5, 650], [4, 1200]], // [count, price] common/rare/epic/legendary (coin-buyable, incl. booms)
  finishes: null,
  xpNeed: lv => 80 + lv * 40,
  runXP: (r, secs, newStars) => Math.floor(r.score / 10) + newStars * 25,
  rankCoins: lv => 40,
  titles: [1, 3, 6, 10, 15, 20],
  runCoins: (r, secs) => r.stars, freshRuns: 0,
  gift: claims => 30,
  missionRewards: [30, 60, 90], allBonus: 50,
  starCoins: w => 10 + 5 * w, worldNeed: [0, 15, 35, 60]
};
function AFTER(over) {
  const E = Object.assign({}, BEFORE, {
    name: "after",
    shipCost: { comet: 0, ember: 100, aurora: 250, halo: 500, nebula: 650, void: 1000, phantom: 1400 },
    shipRank: { comet: 1, ember: 2, aurora: 4, halo: 6, nebula: 9, void: 12, phantom: 16 },
    upRank: [1, 3, 6, 10, 15],                         // rank needed for upgrade level 1..5
    trails: [["sparks", 80, 3], ["rainbow", 220, 5], ["plasma", 450, 9], ["stardust", 900, 13]],
    xpNeed: lv => 50 + 20 * lv + 6 * lv * lv,
    runXP: (r, secs, newStars) => Math.min(400, 10 + secs + 2 * r.stars) + 25 * newStars,
    rankCoins: lv => lv <= 20 ? 30 + 5 * lv : 100,
    titles: [1, 3, 6, 10, 15, 20, 30, 40, 50],
    runCoins: (r, secs) => r.stars + Math.floor(secs / 15), freshRuns: 5,  // first 5 runs each day pay double run coins
    missionXP: [20, 30, 40, 30], runCap: 500,                                            // easy/medium/hard mission + all-clear
    gift: claims => [30, 35, 40, 45, 50, 60, 100][(claims - 1) % 7],     // advances per claim, never resets
    comeback: 50,                                                           // after a missed day, once per 7 days
    streakGrace: true,                                                      // 1 missed day per 7 is forgiven
    streakMilestones: { 3: 50, 7: "cos", 14: 150, 30: "cos", 60: "cos", 100: "cos" },
    weekly: [[5, 100], [10, 150], [15, 200]], weeklyCos: 15,
    mastery: { mins: [5, 15, 30, 60, 100], rewards: [50, "cos", 100, "cos", "cos"] },
    collection: [[5, 50], [10, 100], [15, 150], [20, 200], [25, "cos"]],
    worldNeed: [0, 15, 35, 50],
    finishes: [[300, 1], [700, 3], [1500, 5]]                              // per ship: price, mastery level needed
  });
  return Object.assign(E, over || {});
}

const ARCH = {
  casual: { runs: 3, miss: d => [4, 9, 11, 16, 18, 23, 25, 30, 32, 37, 39, 44, 46, 51, 53, 58].includes(d), levelShare: 0.5 },
  regular: { runs: 10, miss: d => [8, 22, 36, 50].includes(d), levelShare: 0.5 },
  strong: { runs: 25, miss: () => false, levelShare: 0.5 }
};
const DAY0 = 17; // 2026-11-10 is game day 17

function simulate(E, archName, days = 30, seed = 1) {
  const A = ARCH[archName], rng = mulberry32(hashStr(archName + E.name + seed));
  const s = { coins: 0, xp: 0, pilot: 1, owned: ["comet"], skin: "comet", up: { magnet: 0, guard: 0, value: 0, nova: 0 }, trails: ["none"],
    cos: [0, 0, 0, 0], earnedCos: 0, fin: {}, levels: {}, attempts: {}, rec: {}, ach: {}, streak: 0, lastDay: 0, graceUsed: -99, comebackDay: -99,
    claims: 0, runs: 0, minutes: 0, earned: 0, src: {}, flown: {}, mastery: {}, weekly: {}, milestones: {}, coll: {} };
  const log = [], events = [];
  const add = (k, v) => { s.coins += v; s.earned += v; s.src[k] = (s.src[k] || 0) + v; };
  const ev = (d, kind, what) => events.push({ d, kind, what });
  const totalStars = () => Object.values(s.levels).reduce((a, b) => a + b, 0);
  const worldOpen = w => totalStars() >= E.worldNeed[w];
  const levelOpen = n => { const w = Math.floor((n - 1) / 10); return worldOpen(w) && ((n - 1) % 10 === 0 || (s.levels[n - 1] || 0) >= 1); };
  const ups = () => Object.values(s.up).reduce((a, b) => a + b, 0);
  const tier = () => { const l = Math.max(...s.owned.map(id => LIVES[id])); return ups() >= 14 && l >= 4 ? 2 : (ups() >= 4 || l >= 4) ? 1 : 0; };
  const owned = () => s.cos.reduce((a, b) => a + b, 0) + s.earnedCos + Object.values(s.fin).reduce((a, b) => a + b, 0);
  const giveCos = (d, why) => { s.earnedCos++; ev(d, "cos", why); };

  function shop(d) {
    for (let g = 0; g < 60; g++) {
      const ships = Object.keys(E.shipCost).filter(id => !s.owned.includes(id) && s.pilot >= E.shipRank[id]).sort((a, b) => E.shipCost[a] - E.shipCost[b]);
      if (ships.length) { const id = ships[0]; if (s.coins >= E.shipCost[id]) { s.coins -= E.shipCost[id]; s.owned.push(id); s.skin = id; ev(d, "ship", id); continue; } return; }
      const opts = [];
      for (const k in s.up) if (s.up[k] < 5 && s.pilot >= E.upRank[s.up[k]]) opts.push({ k: "up", id: k, cost: E.upCosts[k][s.up[k]] });
      for (const [id, cost, rk] of E.trails) if (!s.trails.includes(id) && s.pilot >= rk) opts.push({ k: "trail", id, cost });
      E.cosmetics.forEach(([n, c], i) => { if (s.cos[i] < n) opts.push({ k: "cos", id: i, cost: c }); });
      if (E.finishes) for (const sh of s.owned) E.finishes.forEach(([c, m], i) => { if ((s.fin[sh] || 0) === i && (s.mastery[sh] || 0) >= m) opts.push({ k: "fin", id: sh, cost: c }); });
      opts.sort((a, b) => a.cost - b.cost);
      const o = opts[0];
      if (!o || s.coins < o.cost) return;
      s.coins -= o.cost;
      if (o.k === "up") { s.up[o.id]++; ev(d, "up", `${o.id} ${s.up[o.id]}`); }
      if (o.k === "trail") { s.trails.push(o.id); ev(d, "trail", o.id); }
      if (o.k === "cos") { s.cos[o.id]++; ev(d, "cos", "buy r" + o.id); }
      if (o.k === "fin") { s.fin[o.id] = (s.fin[o.id] || 0) + 1; ev(d, "fin", o.id + s.fin[o.id]); }
    }
  }
  function xp(d, amount) {
    s.xp += amount;
    while (s.xp >= E.xpNeed(s.pilot)) {
      s.xp -= E.xpNeed(s.pilot); s.pilot++; add("rank", E.rankCoins(s.pilot));
      if (E.titles.includes(s.pilot)) ev(d, "title", "rank " + s.pilot);
      ev(d, "rank", s.pilot);
    }
  }
  const TRO = [
    ["first", 10, () => s.runs >= 1], ["gate", 15, () => s.rec.gates >= 1], ["combo3", 15, () => s.rec.mult >= 3], ["combo5", 40, () => s.rec.mult >= 5],
    ["golden", 25, () => s.rec.golds >= 1], ["nova", 15, () => s.rec.powers >= 2], ["stars40", 40, () => s.rec.stars >= 40], ["close10", 30, () => s.rec.near >= 10],
    ["surv60", 20, () => s.rec.secs >= 60], ["surv120", 50, () => s.rec.secs >= 120], ["score2k", 30, () => s.rec.score >= 2500], ["score5k", 60, () => s.rec.score >= 5000],
    ["well", 25, () => s.rec.wells >= 1], ["flare", 25, () => s.rec.flares >= 1], ["boss", 50, () => s.rec.boss >= 1], ["ghost", 25, () => s.rec.ghostWins >= 1],
    ["flawless", 30, () => Object.values(s.levels).some(v => v >= 3)], ["explorer", 40, () => totalStars() >= E.worldNeed[1]], ["streak3", 30, () => s.streak >= 3],
    ["fleet", 30, () => s.owned.length >= 3], ["ace", 50, () => s.pilot >= 6]
  ];
  const trophies = d => { for (const [id, c, ok] of TRO) if (!s.ach[id] && ok()) { s.ach[id] = d; add("trophy", c); ev(d, "trophy", id); } };
  const rec = (k, v) => { s.rec[k] = Math.max(s.rec[k] || 0, v || 0); };
  function extras(d) {
    if (E.mastery) for (const id in s.flown) {
      const lv = E.mastery.mins.filter(m => s.flown[id] / 60 >= m).length;
      while ((s.mastery[id] || 0) < lv) { s.mastery[id] = (s.mastery[id] || 0) + 1; const rw = E.mastery.rewards[s.mastery[id] - 1]; ev(d, "mastery", id + s.mastery[id]); if (rw === "cos") giveCos(d, "mastery"); else add("mastery", rw); }
    }
    if (E.collection) for (const [n, rw] of E.collection) if (!s.coll[n] && owned() >= n) { s.coll[n] = 1; ev(d, "coll", n); if (rw === "cos") giveCos(d, "collection"); else add("collection", rw); }
  }

  for (let d = 1; d <= days; d++) {
    const gday = DAY0 + d - 1, e0 = events.length, earned0 = s.earned;
    if (A.miss(d)) {
      // streak: forgiven once per 7 days with grace; otherwise reset next time we play
      log.push({ d, played: false, pilot: s.pilot, earned: s.earned, coins: s.coins, stars: totalStars(), ships: s.owned.length, moments: 0, streak: s.streak });
      continue;
    }
    const gap = s.lastDay ? d - s.lastDay - 1 : 0;
    if (gap === 0) s.streak++;
    else if (E.streakGrace && gap === 1 && d - s.graceUsed >= 7) { s.graceUsed = d; s.streak++; ev(d, "grace", "streak saved"); }
    else s.streak = 1;
    s.lastDay = d;
    s.claims++; add("gift", E.gift(s.claims));
    if (E.comeback && gap >= 1 && d - s.comebackDay >= 7) { s.comebackDay = d; add("comeback", E.comeback); }
    if (E.streakMilestones && E.streakMilestones[s.streak] && !s.milestones[s.streak]) {
      s.milestones[s.streak] = 1; const m = E.streakMilestones[s.streak]; ev(d, "streakM", s.streak);
      if (m === "cos") giveCos(d, "streak"); else add("streak", m);
    }
    const MS = CR.missions(gday), done = {};
    let mins = 0, runsToday = 0;
    for (let k = 0; k < A.runs; k++) {
      let lvl = null;
      if (rng() < A.levelShare) {
        for (let n = 1; n <= LV.COUNT; n++) if (levelOpen(n) && s.levels[n] == null) { lvl = n; break; }
        if (!lvl) { let bS = 4; for (let n = 1; n <= LV.COUNT; n++) if (levelOpen(n) && (s.levels[n] || 0) < 3 && (s.attempts[n + ":d" + d] || 0) < 2 && (s.levels[n] || 0) < bS) { bS = s.levels[n] || 0; lvl = n; } }
      }
      let r, newStars = 0;
      const ti = tier();
      if (lvl) {
        const att = BANK.levels[archName][ti][lvl - 1]; r = att[Math.floor(rng() * att.length)];
        s.attempts[lvl + ":d" + d] = (s.attempts[lvl + ":d" + d] || 0) + 1; s.attempts[lvl] = (s.attempts[lvl] || 0) + 1;
        // Human persistence: after 3 failed tries, 30% chance per try to scrape 1 star (bots never aim for close calls)
        if (r.lvStars === 0 && !(s.levels[lvl] > 0) && s.attempts[lvl] > 3 && rng() < 0.3) r = Object.assign({}, r, { lvStars: 1 });
        const prev = s.levels[lvl] || 0; newStars = Math.max(0, r.lvStars - prev); s.levels[lvl] = Math.max(prev, r.lvStars);
        if (newStars) add("levelStars", newStars * E.starCoins(Math.floor((lvl - 1) / 10)));
        for (let w = 1; w < 4; w++) if (!s["w" + w] && worldOpen(w)) { s["w" + w] = d; ev(d, "world", w + 1); }
      } else {
        const bank = BANK.daily[archName][ti]; r = bank[Math.floor(rng() * bank.length)];
        if (r.score >= r.ghost) s.rec.ghostWins = (s.rec.ghostWins || 0) + 1;
      }
      const secs = Math.floor(r.t / 60);
      if (E.mastery) { /* mastery chasers rotate: fly the least-mastered owned ship once the current one reaches level 3 (then 5) */
        const m = id => s.mastery[id] || 0, goal = s.owned.every(id => m(id) >= 3) ? 5 : 3;
        if (m(s.skin) >= goal) { const nx = s.owned.filter(id => m(id) < goal).sort((a, b) => m(a) - m(b))[0]; if (nx) s.skin = nx; }
      }
      s.runs++; runsToday++;
      mins += (r.t / 60 + 12) / 60;
      s.flown[s.skin] = (s.flown[s.skin] || 0) + secs;
      { let c = E.runCoins(r, secs) * (runsToday <= E.freshRuns ? 2 : 1);
        if (E.runCap) { s.capDay = s.capDay === d ? d : (s.runToday = 0, d); c = Math.max(0, Math.min(c, E.runCap - s.runToday)); s.runToday += c; }
        add("run", c); }
      const val = { stars: r.stars, combo: r.mult, time: secs, near: r.near, power: r.powers, gates: r.gates, score: r.score };
      MS.forEach((m, i) => { const id = m.key.replace(/\d$/, ""); if (!done[i] && val[id] >= m.goal) { done[i] = 1; add("mission", E.missionRewards[i]); if (E.missionXP) xp(d, E.missionXP[i]); } });
      if (!done.all && done[0] && done[1] && done[2]) { done.all = 1; add("mission", E.allBonus); if (E.missionXP) xp(d, E.missionXP[3]); }
      ["gates", "mult", "golds", "powers", "stars", "near", "score", "wells", "flares", "boss"].forEach(k => rec(k, r[k]));
      rec("secs", secs);
      xp(d, E.runXP(r, secs, newStars));
      trophies(d);
      extras(d);
      shop(d);
    }
    if (E.weekly) {
      const W = s.weekly[Math.floor((d - 1) / 7)] = s.weekly[Math.floor((d - 1) / 7)] || { m: 0, paid: {} };
      W.m += [0, 1, 2].filter(i => done[i]).length;
      for (const [n, c] of E.weekly) if (W.m >= n && !W.paid[n]) { W.paid[n] = 1; add("weekly", c); ev(d, "weekly", n); }
      if (W.m >= E.weeklyCos && !W.paid.cos) { W.paid.cos = 1; giveCos(d, "weekly"); }
    }
    trophies(d); extras(d); shop(d);
    s.mDone = (s.mDone || 0) + [0, 1, 2].filter(i => done[i]).length; s.allDays = (s.allDays || 0) + (done.all ? 1 : 0);
    s.minutes += mins;
    const moments = events.slice(e0).filter(e => !["rank", "trophy", "grace"].includes(e.kind)).length;
    log.push({ d, played: true, ups: ups(), cosN: owned(), pilot: s.pilot, earned: s.earned, today: s.earned - earned0, coins: s.coins, stars: totalStars(), ships: s.owned.length, moments, streak: s.streak, mins });
  }
  return { s, log, events, E };
}

/* catalog value still unbought (coins) */
function remaining(E, s) {
  let v = 0;
  for (const id in E.shipCost) if (!s.owned.includes(id)) v += E.shipCost[id];
  for (const k in s.up) v += E.upCosts[k].slice(s.up[k]).reduce((a, b) => a + b, 0);
  for (const [id, c] of E.trails) if (!s.trails.includes(id)) v += c;
  E.cosmetics.forEach(([n, c], i) => v += (n - s.cos[i]) * c);
  if (E.finishes) for (const id in E.shipCost) E.finishes.forEach(([c], i) => { if ((s.fin[id] || 0) <= i) v += c; });
  return v;
}
function catalog(E) { return remaining(E, { owned: [], up: { magnet: 0, guard: 0, value: 0, nova: 0 }, trails: [], cos: [0, 0, 0, 0], fin: {} }) + 0; }

function summary(res) {
  const { s, log, events, E } = res;
  const first = (kind, what) => { const e = events.find(x => x.kind === kind && (what == null || String(x.what) === String(what))); return e ? e.d : "-"; };
  const played = log.filter(l => l.played);
  const dead = played.filter(l => l.moments === 0).length;
  let gapMax = 0, g = 0; for (const l of played) { if (l.moments === 0) { g++; gapMax = Math.max(gapMax, g); } else g = 0; }
  return {
    ships: Object.fromEntries(Object.keys(E.shipCost).filter(x => x !== "comet").map(id => [id, first("ship", id)])),
    worlds: [2, 3, 4].map(w => first("world", w)), legend: first("title", "rank 20"), rank: s.pilot, stars: Object.values(s.levels).reduce((a, b) => a + b, 0),
    earned: s.earned, bank: s.coins, unbought: remaining(E, s), minutes: Math.round(s.minutes), cpm: +(s.earned / s.minutes).toFixed(1),
    deadDays: dead, missionsPerDay: +(s.mDone / played.length).toFixed(2), allClearDays: s.allDays, playedDays: played.length, longestDry: gapMax, upsMaxed: Object.values(s.up).filter(v => v === 5).length,
    src: s.src
  };
}

module.exports = { simulate, BEFORE, AFTER, ARCH, summary, catalog, remaining };
if (require.main === module) {
  const E = process.argv[2] === "after" ? AFTER(process.argv[4] ? eval("(" + process.argv[4] + ")") : {}) : BEFORE, days = +process.argv[3] || 30;
  console.log("catalog coin value", catalog(E));
  for (const a of Object.keys(ARCH)) {
    const res = simulate(E, a, days);
    console.log(`\n=== ${a} (${E.name}) ===`);
    console.log("day: rank stars ships earned bank today moments");
    for (const l of res.log) if (l.d <= 30 || l.d % 5 === 0) console.log(`${l.d}${l.played ? "" : "(off)"}: ${l.pilot} ${l.stars} ${l.ships} ${l.earned} ${l.coins} ${l.today || 0} ${l.moments}`);
    console.log(JSON.stringify(summary(res)));
  }
}
