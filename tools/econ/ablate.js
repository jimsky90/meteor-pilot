const { simulate, BEFORE, AFTER, summary } = require("./econ");
const A = AFTER();
const pick = (...ks) => Object.fromEntries(ks.map(k => [k, A[k]]));
const STEPS = [
  ["1 XP & rank rework", pick("xpNeed", "runXP", "missionXP", "rankCoins", "titles")],
  ["2 Ship prices + rank gates", pick("shipCost", "shipRank", "upRank", "trails")],
  ["3 Run coins, Fresh Fuel, cap", pick("runCoins", "freshRuns", "runCap")],
  ["4 Weekly mission ladder", pick("weekly", "weeklyCos")],
  ["5 Ship mastery + finishes", pick("mastery", "finishes")],
  ["6 Gift ladder, streak saver+milestones, comeback", pick("gift", "comeback", "streakGrace", "streakMilestones")],
  ["7 Collection milestones", pick("collection")],
  ["8 World 4 at 50 stars", pick("worldNeed")]
];
let E = Object.assign({}, BEFORE, { name: "before" });
const row = (label, E) => {
  const out = [label];
  for (const a of ["casual", "regular", "strong"]) {
    const S = summary(simulate(E, a, 30)), S60 = summary(simulate(E, a, 60));
    out.push(`${a}: rank30 ${S.rank}, Legend d${S.legend}, phantom d${S.ships.phantom}, earned ${S.earned}, unspent ${S.bank}, dead ${S.deadDays}/${S.playedDays}, dry ${S.longestDry}, W4 d${S.worlds[2]}, unbought60 ${S60.unbought}, bank60 ${S60.bank}`);
  }
  console.log(out.join("\n   "));
};
row("0 before", E);
for (const [label, ch] of STEPS) { E = Object.assign({}, E, ch, { name: "after" }); row(label, E); }
