// Builds sample banks of bot runs: daily runs (60 seeds) and level attempts, per archetype and loadout tier.
const fs = require("fs");
const { CR, LV, play } = require("./load");
const PROF = {
  casual: { speed: 3, lapse0: 0.08, lapseGrow: 0.0015, lapseLen: 24, every: 7, horizon: 28, noise: 3, greed: 2.5 },
  regular: { speed: 3, lapse0: 0.03, lapseGrow: 0.0005, lapseLen: 22, every: 6, horizon: 34, noise: 3, greed: 2 },
  strong: { speed: 9, lapse0: 0.001, lapseGrow: 0.00003, lapseLen: 12, every: 3, horizon: 50, noise: 1, greed: 1.2 }
};
const TIERS = [
  { ship: "comet", up: {} },
  { ship: "nebula", up: { magnet: 1, guard: 2, value: 2, nova: 1 } },
  { ship: "void", up: { magnet: 4, guard: 4, value: 4, nova: 4 } }
];
const pick = (r, ghostScore) => ({ t: r.t, score: r.score, stars: r.stars, near: r.near, mult: r.maxMult, powers: r.powers, gates: r.gates,
  golds: r.golds, boss: r.bossesDown, wells: r.wells, flares: r.flares, lives: r.lives, cfgLives: r.cfg.lives, ghost: ghostScore });
const N = +process.argv[2] || 60, A = +process.argv[3] || 6;
const out = { daily: {}, levels: {} };
const ghosts = {};
for (let d = 1; d <= N; d++) ghosts[d] = CR.recordGhost(CR.makeWorld("comet-" + d)).score;
for (const [name, P] of Object.entries(PROF)) {
  out.daily[name] = []; out.levels[name] = [];
  TIERS.forEach((T, ti) => {
    const cfg = CR.loadoutCfg(T.ship, T.up), runs = [];
    for (let d = 1; d <= N; d++) { const w = CR.makeWorld("comet-" + d); runs.push(pick(play(w, cfg, P, name + ti + ":" + d), ghosts[d])); }
    out.daily[name][ti] = runs;
    const lv = [];
    for (let n = 1; n <= LV.COUNT; n++) {
      const L = LV.get(n), att = [];
      for (let a = 0; a < A; a++) {
        const c = Object.assign({}, cfg); c.lives = Math.max(1, c.lives - L.shieldCut);
        const r = play(L.world, c, P, `${name}${ti}:L${n}:${a}`, L.durT);
        const finished = r.alive || r.t >= L.durT;
        const res = LV.rate(L, r, finished);
        att.push(Object.assign(pick(r, 0), { lvStars: res.stars }));
      }
      lv.push(att);
    }
    out.levels[name][ti] = lv;
    const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
    console.log(name, "tier", ti, "daily median t", (med(runs.map(r => r.t)) / 60).toFixed(0), "score", med(runs.map(r => r.score)), "stars", med(runs.map(r => r.stars)),
      "| level mean ★ by world", [0, 1, 2, 3].map(w => (lv.slice(w * 10, w * 10 + 10).flat().reduce((s, x) => s + x.lvStars, 0) / (10 * A)).toFixed(2)).join(" "));
  });
}
fs.writeFileSync(__dirname + "/bank.json", JSON.stringify(out));
