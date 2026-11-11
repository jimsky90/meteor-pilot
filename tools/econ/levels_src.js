  function makeLevels(CR) {
    const TPS = CR.TPS;
    const WORLDS = [
      { name: "Neon Belt", need: 0, color: "#ff3ea5", shieldCut: 0, blurb: "Synthwave skies. Learn the ropes" },
      { name: "Red Circuit", need: 15, color: "#ff6a3d", shieldCut: 0, blurb: "Molten machines. Longer, faster runs" },
      { name: "Prism Rings", need: 35, color: "#7cf3ff", shieldCut: 0, blurb: "Ice and light. Solar flares join in" },
      { name: "Quantum Void", need: 60, color: "#b07bff", shieldCut: 1, blurb: "Reality glitches. One shield less" }
    ];
    const CYCLE = ["survive", "stars", "score", "close", "gates", "stars", "survive", "golden", "score", "finale"];
    const COUNT = WORLDS.length * 10;
    const cache = new Map();
    const round = (v, s) => Math.max(s, Math.round(v / s) * s);

    const GOALS = {
      survive: { text: L => `Reach the finish line`, of: () => 0 },
      finale: { text: L => `Survive ${L.dur}s and the Mothership`, of: () => 0 },
      stars: { text: L => `Grab ${L.goal} stars`, of: r => r.stars },
      score: { text: L => `Score ${L.goal.toLocaleString()} points`, of: r => r.score },
      close: { text: L => `Pull off ${L.goal} close calls`, of: r => r.near },
      gates: { text: L => `Fly through ${L.goal} gates`, of: r => r.gates },
      golden: { text: L => `Catch a golden star`, of: r => r.golds }
    };

    function pickSeed(n, type, durT) {
      for (let k = 0; k < 200; k++) {
        const seed = `lvl-${n}-${k}`, world = CR.makeWorld(seed);
        if (n <= 10) CR.setWells(world, []);
        if (type === "gates" && !(world.events[0].type === "gates")) continue;
        if (type === "golden" && !world.items.some(it => it.gold && it.t + 200 < durT && !world.swallow.has(it.id))) continue;
        if (type === "stars") {
          const avail = world.items.filter(it => it.kind === "star" && it.t + 180 < durT && !world.swallow.has(it.id)).length;
          if (avail < 8 + 2 * Math.floor((n - 1) / 10) || avail > 22) continue;
        }
        return { seed, world };
      }
      const seed = `lvl-${n}-0`; return { seed, world: CR.makeWorld(seed) };
    }

    /** Full definition of level n (1-based). Deterministic: same for every player. */
    function get(n) {
      if (cache.has(n)) return cache.get(n);
      const w = Math.floor((n - 1) / 10), i = (n - 1) % 10, type = CYCLE[i];
      let dur = Math.round(18 + w * 8 + i * 2);
      if (type === "gates") dur = Math.max(dur, 28);
      if (type === "finale") dur += 12;
      const durT = dur * TPS;
      const { seed, world } = pickSeed(n, type, durT);
      /* Finales end with a Mothership boss; tougher in later worlds. */
      if (type === "finale") CR.setBosses(world, [{ t0: durT - 22 * TPS, dur: 20 * TPS, lvl: w }]);
      else CR.setBosses(world, []); /* v27: the daily Mothership now comes at 1:00, so plain levels clear it out */
      /* Black holes start in the second world; Neon Belt stays a gentle introduction. */
      if (w === 0) CR.setWells(world, []);
      /* Solar flares start in the third world, early in the run, before the first black hole. */
      CR.setFlares(world, w >= 2 && type !== "finale" ? [14 * TPS] : []);
      const ghost = CR.recordGhost(world);
      const starsAvail = world.items.filter(it => it.kind === "star" && it.t + 180 < durT && !CR.hiddenAt(world, it.t) && !world.swallow.has(it.id)).length;
      const baseScore = Math.floor(durT / 6) + Math.round(starsAvail * 25 * 0.55);
      let goal = 0;
      if (type === "stars") goal = Math.max(3, Math.min(starsAvail - 2, Math.round(starsAvail * (0.4 + w * 0.05))));
      if (type === "score") goal = round(baseScore * (0.75 + w * 0.05), 50);
      if (type === "close") goal = 2 + w + Math.floor(i / 4);
      if (type === "gates") goal = 2 + (w >= 2 ? 1 : 0);
      if (type === "golden") goal = 1;
      const par = round(type === "score" ? goal * 1.2 : baseScore * (0.85 + w * 0.05), 50);
      const par3 = round(par * 1.3, 50);
      const L = { n, w, i, type, dur, durT, seed, world, ghost, goal, par, par3, shieldCut: WORLDS[w].shieldCut, finale: type === "finale" };
      L.goalText = GOALS[type].text(L);
      cache.set(n, L);
      return L;
    }

    /** How far the runner is on the goal: { have, need, met } */
    function progress(L, r) {
      if (L.type === "survive" || L.type === "finale") return { have: Math.min(r.t, L.durT), need: L.durT, met: r.t >= L.durT };
      const have = GOALS[L.type].of(r);
      return { have, need: L.goal, met: have >= L.goal };
    }

    /** Star rating for a finished level run. finished = reached the finish line alive. */
    function rate(L, r, finished) {
      const met = finished && progress(L, r).met;
      const checks = [
        { text: L.type === "survive" || L.type === "finale" ? "Reach the finish" : L.goalText + " and finish", ok: met },
        { text: `Score ${L.par.toLocaleString()}+`, ok: met && r.score >= L.par },
        /* v28 (audit #3): a hit no longer costs the third star if you score well or win the shield back */
        { text: `Full shields at the end, or score ${L.par3.toLocaleString()}+`, ok: met && (r.lives >= r.cfg.lives || r.score >= L.par3) }
      ];
      return { met, stars: met ? checks.filter(c => c.ok).length : 0, checks };
    }

    const total = levels => Object.values(levels).reduce((a, b) => a + b, 0);
    function worldOpen(levels, w) { return total(levels) >= WORLDS[w].need; }
    function levelOpen(levels, n) {
      const w = Math.floor((n - 1) / 10);
      if (!worldOpen(levels, w)) return false;
      return (n - 1) % 10 === 0 || (levels[n - 1] || 0) >= 1;
    }

    /* Pilot rank: XP from every run. */
    const xpNeed = lv => 80 + lv * 40;
    const RANKS = [[1, "Cadet"], [3, "Pilot"], [6, "Ace"], [10, "Captain"], [15, "Commander"], [20, "Legend"]];
    const rankName = lv => RANKS.filter(r => lv >= r[0]).pop()[1];
    function addXP(save, amount) {
      save.xp += amount;
      const ups = [];
      while (save.xp >= xpNeed(save.pilot)) { save.xp -= xpNeed(save.pilot); save.pilot++; ups.push(save.pilot); }
      return ups;
    }
    const runXP = (r, newLevelStars) => Math.floor(r.score / 10) + newLevelStars * 25;
    const levelUpCoins = () => 40; /* v26: flat, so ship unlocks stretch across the first week or so */

    return { WORLDS, COUNT, get, progress, rate, total, worldOpen, levelOpen, xpNeed, rankName, addXP, runXP, levelUpCoins };
  }
