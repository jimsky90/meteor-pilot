const { CR, play } = require("./load");
const P = {"speed":6,"lapse0":0.002,"lapseGrow":0.00005,"lapseLen":14,"every":4,"horizon":50,"noise":1.5,"greed":1.2};
const cfg = CR.loadoutCfg("comet", {});
const hits = {};
for (let d = 1; d <= 40; d++) {
  const w = CR.makeWorld("comet-" + d);
  const r = play(w, cfg, P, "s" + d);
  for (const h of r.hitIds) { const k = typeof h === "string" ? h.replace(/\d+/g, "") : "rock"; const sec = Math.floor((typeof h === "string" ? +h.replace(/\D/g, "") : 0) / 60); hits[k] = (hits[k] || 0) + 1; }
}
console.log(hits);
