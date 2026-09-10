'use strict';

/* ============================================================================
   AI — the five rivals think with the same information a person has: the
   track they can see ahead of them, and where everybody near them is.
   ========================================================================== */
var AI = {
  think: function (p, dt) {
    var L = aiLevel();
    var a = p.ai;

    /* crouching is judged every frame — it is a timing decision, not a plan —
       but each racer only commits once, and the weaker ones sometimes don't */
    this.duck(p, L);

    a.next -= dt;
    if (a.next > 0) return;
    a.next = rand(L.react[0], L.react[1]);

    /* one temperament per decision, not one per lane: a racer that fancies a
       shove this instant must weigh every column with the same nerve */
    a.brave = Math.random() < L.aggr;

    var best = p.lane, bestCost = 1e9, here = 0;
    for (var l = 0; l < 3; l++) {
      var c = this.cost(p, l, L, a.brave);
      if (l === p.lane) here = c;
      if (c < bestCost) { bestCost = c; best = l; }
    }
    a.want = best;
    a.intent = false;
    if (best !== p.lane && here - bestCost > 0.5) {
      /* did it pick that column *because* somebody was standing in it? */
      a.intent = a.brave && !!Race.beside(p, best);
      p.setLane(p.lane + (best > p.lane ? 1 : -1));
    }
  },

  /* what a lane is worth to this racer: lower is better */
  cost: function (p, lane, L, brave) {
    var cost = 0;
    var speed = CFG.BASE_SPEED * Run.mult;
    var look = L.look;
    var list = Obstacles.list, waves = 0, lastWd = -1e9;

    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      var gap = o.wd - p.d;
      if (gap < -o.hM || gap > look) continue;
      if (o.wd - lastWd > 1.5) { waves++; lastWd = o.wd; }
      if (waves > L.waves) break;
      if (!o.blocks(lane)) continue;
      var prox = 1 - clamp(gap / look, 0, 1);          /* nearer hurts more */
      var weight = 1 / waves;                          /* the wave in front matters most */
      if (!o.harmful) {
        /* worth steering into, and the sharper racers know it — though a
           mystery square is a gamble rather than a pad, and pulls at them
           accordingly */
        cost -= (o.kind === 'mystery' ? 4.5 : 8) * prox * weight * L.greed;
        continue;
      }
      if (o.crouch) {
        cost += 4 * prox * weight * (1 - L.duck);      /* a reliable ducker barely cares */
      } else {
        cost += 46 * prox * weight;
      }
    }

    /* the edge is where a shove kills you */
    if (lane === 0 || lane === 2) {
      /* the only neighbour of either edge is the middle */
      cost += 1.2 * L.defend;
      if (Race.beside(p, 1)) cost += 2.0 * L.defend;
    }

    /* crossing costs a little: standing still is a decision too */
    cost += Math.abs(lane - p.lane) * 0.9;

    if (lane !== p.lane) {
      var occ = Race.beside(p, lane);
      if (occ) {
        if (occ.immune > 0) {
          cost += 6;                                   /* intangible: pointless */
        } else {
          /* would shoving them help? worth most when it ends their race */
          var to = occ.lane + (lane > p.lane ? 1 : -1);
          var value = (to < 0 || to > 2) ? 9 : 4.2;
          if (to >= 0 && to <= 2 && Race.clearance(occ, to) < 4) value = 6.5;
          if (occ.d > p.d) value *= 1.3;               /* shove whoever is beating you */
          if (brave) cost -= value * L.aggr;
          else cost += 3;                              /* not feeling brave */
        }
      }
    }

    /* mistakes, in proportion to how good this racer is meant to be */
    cost += rand(0, L.err * 26);
    return cost;
  },

  /* duck when the wave in front of this racer can only be passed underneath */
  duck: function (p, L) {
    var a = p.ai;
    var lead = CFG.BASE_SPEED * Run.mult * L.lead;     /* how early they commit */
    var need = null;
    var near = Obstacles.near(p.d, Math.max(lead, 3), 1);
    for (var i = 0; i < near.length; i++) {
      var o = near[i];
      if (!o.crouch || !o.blocks(p.lane)) continue;
      if (o.wd + o.hM < p.d - p.radiusM()) continue;
      if (!need || o.wd < need.wd) need = o;
    }
    if (!need) { p.crouch = false; a.duckFor = null; return; }
    if (a.duckFor !== need) {
      a.duckFor = need;
      a.duckOk = Math.random() < L.duck;               /* the weak ones miss some */
    }
    p.crouch = a.duckOk && (need.wd - p.d) <= lead;
  }
};
/* the starting field is built once, at load, exactly where the single-file
   version built it: after the AI table above and before the run system */
Race.build();
