'use strict';

/* ============================================================================
   9. PROCEDURAL GENERATOR
   Every hazard is rolled independently — kind, column and spacing are all
   random, so the track never repeats an authored phrase. It is written into
   the world *ahead of whichever racer leads*, and once written it is fixed:
   random when created, canonical afterwards.
   ========================================================================== */
function allBut(blocked) {
  var out = [];
  for (var l = 0; l < 3; l++) if (blocked.indexOf(l) < 0) out.push(l);
  return out.length ? out : [0, 1, 2];
}
/* worst case number of lanes a racer may have to cross between two entries */
function laneDistance(from, to) {
  var worst = 0;
  for (var i = 0; i < from.length; i++) {
    var best = 9;
    for (var j = 0; j < to.length; j++) best = Math.min(best, Math.abs(from[i] - to[j]));
    worst = Math.max(worst, best);
  }
  return worst;
}
function E_square(lane) {
  return { kind: 'square', lane: lane, crouch: false, safe: allBut([lane]) };
}
function E_twin(a, b) {
  return { kind: 'twin', lanes: [a, b], crouch: false, safe: allBut([a, b]) };
}
function E_bar2(start, crouchable) {
  return { kind: 'bar2', lane: start, crouch: crouchable,
    safe: crouchable ? [0, 1, 2] : allBut([start, start + 1]) };
}
function E_bar3() { return { kind: 'bar3', crouch: true, safe: [0, 1, 2] }; }
/* the boost pad blocks nothing at all — it is somewhere to aim for */
function E_boost(lane, strong) {
  return { kind: strong ? 'superBoost' : 'boost', lane: lane, crouch: false, safe: [0, 1, 2] };
}
function E_mover(a, b, shuttle) {
  var lo = Math.min(a, b), hi = Math.max(a, b), span = [];
  for (var l = lo; l <= hi; l++) span.push(l);
  return { kind: shuttle ? 'shuttle' : 'mover', lane: a, to: b, lanes: span,
    crouch: false, safe: allBut(span) };
}

/* the roll table: weights shift with speed, nothing else is scripted */
var KINDS = [
  { id: 'square',  min: 1.00, w: function (m) { return 30; },
    make: function (last) { return E_square(rollLane(last)); } },
  { id: 'twin',    min: 1.05, w: function (m) { return 11; },
    make: function () { var a = randInt(0, 2), b = pick(allBut([a])); return E_twin(a, b); } },
  { id: 'bar2',    min: 1.05, w: function (m) { return 12; },
    make: function () { return E_bar2(randInt(0, 1), false); } },
  { id: 'bar2c',   min: 1.10, w: function (m) { return 9; },
    make: function () { return E_bar2(randInt(0, 1), true); } },
  { id: 'bar3',    min: 1.00, w: function (m) { return 11; }, wall: true,
    make: function () { return E_bar3(); } },
  { id: 'mover',   min: 1.15, w: function (m) { return 9 + (m - 1.15) * 12; },
    make: function () {
      var a = randInt(0, 2), b;
      if (a === 1) b = Math.random() < .5 ? 0 : 2; else b = 1;   /* always adjacent */
      return E_mover(a, b, false);
    } },
  { id: 'shuttle', min: 1.35, w: function (m) { return 5 + (m - 1.35) * 10; },
    make: function () { var a = randInt(0, 1); return E_mover(a, a + 1, true); } },
  /* uncommon, but often enough to be worth watching for */
  { id: 'boost',   min: 1.00, w: function (m) { return 4; },
    make: function (last) { return E_boost(rollLane(last)); } },
  { id: 'superBoost', min: 1.00, w: function (m) { return 1; },
    make: function (last) { return E_boost(rollLane(last), true); } }
];
function rollLane(last) {
  var l = randInt(0, 2);
  if (l === last && Math.random() < 0.55) l = pick(allBut([last]));
  return l;
}

var Gen = {
  queue: [], frontier: 0, sinceWall: 99, lastKind: '', lastLane: -1, enabled: false,

  reset: function (from) {
    this.queue.length = 0; this.sinceWall = 99;
    this.lastKind = ''; this.lastLane = -1; this.enabled = true;
    this.frontier = (from || 0) + CFG.METERS_VISIBLE * 0.9;   /* a clear start line */
  },
  stop: function () { this.enabled = false; },

  /* spacing, in seconds of travel. The fair-gap floor below still guarantees
     everything is passable; this only tightens the stretches that were roomier
     than they had to be. */
  gapScale: function (mult) { return lerp(1.08, 0.86, clamp((mult - 1) / 1, 0, 1)); },
  rollGap: function () {
    if (Math.random() < 0.09) return rand(1.6, 2.1);       /* the odd breather */
    return rand(0.58, 1.32);
  },

  roll: function (mult) {
    var pool = [], total = 0, i, k, w;
    for (i = 0; i < KINDS.length; i++) {
      k = KINDS[i];
      if (mult + 1e-6 < k.min) continue;
      if (k.wall && this.sinceWall < CFG.WALL_COOLDOWN) continue;
      w = Math.max(1, k.w(mult));
      if (k.id === this.lastKind) w *= 0.35;          /* no two-in-a-row habits */
      if (k.wall) w *= clamp(this.sinceWall / (CFG.WALL_COOLDOWN * 1.6), 0.2, 1.4);
      pool.push({ k: k, w: w }); total += w;
    }
    if (!pool.length) return KINDS[0];
    var r = Math.random() * total;
    for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool[i].k; }
    return pool[pool.length - 1].k;
  },

  refill: function (mult) {
    while (this.queue.length < 3) {
      var k = this.roll(mult);
      var e = k.make(this.lastLane);
      e.gap = (k.id === 'boost' || k.id === 'superBoost') ? rand(1.9, 2.6) : this.rollGap();
      e.wall = !!k.wall;
      this.lastKind = k.id;
      this.lastLane = (e.lane === undefined) ? -1 : e.lane;
      if (k.wall) this.sinceWall = 0;
      this.queue.push(e);
    }
  },

  /* the fair gap, in seconds, between two consecutive entries */
  fairGap: function (a, b) {
    var g = CFG.REACTION_BASE + laneDistance(a.safe, b.safe) * CFG.REACTION_LANE;
    if (a.crouch) g += CFG.CROUCH_RELEASE;
    if (a.kind === 'mover' || a.kind === 'shuttle') g += CFG.CROUCH_RELEASE;
    if (a.kind === 'superBoost') g *= 1 + (CFG.BOOST_SCALE - 1) * CFG.SUPER_BOOST_POWER;
    else if (a.kind === 'boost') g *= CFG.BOOST_SCALE;   /* they will arrive faster */
    return g;
  },

  /* author the course ahead of whoever is leading — not ahead of the camera */
  update: function (dt, mult, leadD) {
    if (!this.enabled) return;
    this.sinceWall += dt;
    this.refill(mult);
    var horizon = leadD + CFG.WORLD_AHEAD;
    var guard = 0;
    while (this.frontier < horizon && guard++ < 40) {
      var e = this.queue.shift();
      this.refill(mult);
      var next = this.queue[0];
      Obstacles.spawn(e, this.frontier);
      var gap = e.gap * this.gapScale(mult);
      gap = Math.max(gap, this.fairGap(e, next));
      this.frontier += gap * CFG.BASE_SPEED * mult;   /* seconds of travel -> metres */
    }
  }
};
