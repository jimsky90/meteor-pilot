const { CR, play } = require("./load");
const PROFILES = JSON.parse(process.argv[2]);
const N = +process.argv[3] || 30;
const cfg = CR.loadoutCfg("comet", {});
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
for (const [name, P] of Object.entries(PROFILES)) {
  const T = [], S = [], ST = [], NR = [], MM = [], PW = [], GT = [];
  const t0 = Date.now();
  for (let d = 1; d <= N; d++) {
    const w = CR.makeWorld("comet-" + d);
    const r = play(w, cfg, P, name + d);
    T.push(r.t / 60); S.push(r.score); ST.push(r.stars); NR.push(r.near); MM.push(r.maxMult); PW.push(r.powers); GT.push(r.gates);
  }
  console.log(name, "secs p25/50/75", q(T, .25).toFixed(0), q(T, .5).toFixed(0), q(T, .75).toFixed(0), "| score", q(S, .25), q(S, .5), q(S, .75),
    "| stars", q(ST, .5), "| near", q(NR, .5), "| mult", q(MM, .5), "| pow", q(PW, .5), "| gates", q(GT, .5), `(${Date.now() - t0}ms)`);
}
