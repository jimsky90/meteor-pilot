const { simulate, BEFORE, AFTER, ARCH, summary, catalog } = require("./econ");
const BANK = require("./bank.json");
const days = +process.argv[2] || 30;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
console.log("## run distributions (tier 0 = Comet, no upgrades; tier 2 = Void + 4/4/4/4)");
for (const a of Object.keys(ARCH)) for (const ti of [0, 2]) {
  const R = BANK.daily[a][ti];
  const f = k => `${q(R.map(r => r[k]), .25)}/${q(R.map(r => r[k]), .5)}/${q(R.map(r => r[k]), .75)}`;
  const secs = R.map(r => Math.floor(r.t / 60));
  console.log(`| ${a} t${ti} | ${q(secs, .25)}/${q(secs, .5)}/${q(secs, .75)} | ${f("score")} | ${f("stars")} | ${f("near")} | ${q(R.map(r => r.mult), .5)} | ${(R.filter(r => r.score >= r.ghost).length / R.length * 100).toFixed(0)}% | ${(R.filter(r => r.boss > 0).length / R.length * 100).toFixed(0)}% |`);
}
for (const E of [BEFORE, AFTER()]) {
  console.log(`\n## ${E.name}  (catalog ${catalog(E)})`);
  for (const a of Object.keys(ARCH)) {
    const res = simulate(E, a, days), S = summary(res);
    console.log(`\n### ${a}`);
    console.log("| Day | Rank | Ships | Level ★ | Upgr. | Cosmetics | Coins earned (total) | Unspent |");
    for (const l of res.log) if ([1, 3, 7, 14, 21, 30, 45, 60, 90].includes(l.d)) {
      const L = l.played ? l : res.log.slice(0, l.d).filter(x => x.played).pop();
      console.log(`| ${l.d} | ${L.pilot} | ${L.ships}/7 | ${L.stars} | ${L.ups || 0}/20 | ${L.cosN || 0} | ${L.earned} | ${L.coins} |`);
    }
    console.log(JSON.stringify(S));
  }
}
