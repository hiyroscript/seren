'use strict';

/* ============================================================================
   11. RUN — the game itself: speed, distance, collision, respawn, finale
   ========================================================================== */
var Run = {
  distance: 0, mult: 1, speedTimer: 0, collisions: 0, playT: 0,
  hudPulse: 0, milestone: 0,
  finalActive: false, finalStart: 0,
  wall: null, seq: null, lineAcc: 0,
  countT: 0, countIdx: 0, gridStart: false,

  /* ---------- lifecycle ---------- */
  begin: function () {
    this.distance = 0; this.mult = 1; this.speedTimer = 0; this.collisions = 0;
    this.hudPulse = 0; this.milestone = 0;
    this.playT = 0; this.finalActive = false; this.finalStart = 0;
    this.wall = null; this.seq = null; this.lineAcc = 0;
    Obstacles.clear(); VFX.clear();
    Race.reset();
    Gen.reset(0);
    Input.releaseAll();
    this.startCountdown(true);
  },
  startCountdown: function (full) {
    this.countIdx = full ? 0 : 3;
    this.countT = 0;
    this.gridStart = !!full;      /* only the start of a race spreads the grid */
    App.set(ST.COUNTDOWN);
    Sound.play(this.countIdx === 3 ? 'go' : 'count');
  },
  countLabel: function () {
    return ['3', '2', '1', t('go')][clamp(this.countIdx, 0, 3)];
  },

  speedN: function () { return CFG.BASE_SPEED * this.mult / CFG.METERS_VISIBLE; },
  /* what the camera is actually doing, which is what the HUD reports */
  shownMult: function () { return this.mult * (Player ? Player.speedScale() : 1); },

  /* ---------- per frame ---------- */
  update: function (dt) {
    if (App.state === ST.COUNTDOWN) {
      /* nobody races until GO — but they do roll up onto the grid */
      Race.updateEntry(dt);
      for (var i = 0; i < Race.racers.length; i++) Race.racers[i].update(dt, false);
      this.countT += dt;
      while (this.countT >= CFG.COUNT_STEP) {
        this.countT -= CFG.COUNT_STEP;
        this.countIdx++;
        if (this.countIdx >= 4) {
          this.countT = 0;
          /* six racers start shoulder to shoulder: give the grid a moment to
             spread before anyone can be shoved out of it. Coming back from a
             pause is not a start — the field is long since spread, and grace
             handed out there would make the pause button a shield. */
          if (this.gridStart) {
            for (var g = 0; g < Race.racers.length; g++) {
              Race.racers[g].immune = CFG.GRID_IMMUNITY;
            }
          }
          App.set(ST.PLAYING);
          return;
        }
        Sound.play(this.countIdx === 3 ? 'go' : 'count');
      }
      return;
    }

    if (App.state === ST.FINISH || App.state === ST.COMPLETED) { this.updateFinish(dt); return; }
    if (App.state !== ST.PLAYING && App.state !== ST.RESPAWNING) return;

    this.playT += dt;
    if (this.hudPulse > 0) this.hudPulse = Math.max(0, this.hudPulse - dt * 2.4);

    /* --- speed progression -------------------------------------------------
       Every step is derived from the running total of active play rather than
       from an accumulator that is topped up and drained, so step n lands at
       exactly n x 20s and no rounding can pull one early or push it late. --- */
    this.speedTimer += dt;
    if (this.mult < CFG.SPEED_MAX - 1e-9) {
      var steps = Math.floor(this.speedTimer / CFG.SPEED_STEP_TIME);
      var want = Math.round(Math.min(CFG.SPEED_MAX, 1 + steps * CFG.SPEED_STEP) * 100) / 100;
      if (want > this.mult) { this.mult = want; this.onSpeedUp(); }
    }

    /* --- the world, then the racers in it --- */
    var before = Player.d;
    Race.tickClock(dt);
    Obstacles.update(dt);
    Gen.update(dt, this.mult, Race.leadD());
    Race.update(dt, this.mult);

    /* the camera rides the human racer: everything drawn scrolls by exactly
       as much ground as that racer covered */
    var moved = Player.d - before;
    this.distance = Player.d;
    VFX.scrollWorld(metresToPx(moved));
    VFX.motes(dt, this.mult);
    this.passFX();

    var ms = Math.floor(this.distance / 100);
    if (ms > this.milestone) { this.milestone = ms; this.hudPulse = 1; }

    /* --- ambient speed lines --- */
    this.lineAcc += (0.34 + (this.mult - 1) * 1.6) * 40 * dt;
    while (this.lineAcc >= 1) { this.lineAcc -= 1; VFX.spawnSpeedLine(this.mult); }

    /* --- final stage --- */
    if (!this.finalActive && this.mult >= CFG.SPEED_MAX - 1e-9) this.enterFinal();
    if (this.finalActive && !this.wall && this.finalProgress() >= CFG.FINAL_DISTANCE) {
      Gen.stop();
      /* placed ahead of whoever leads, so no racer is ever behind the wall */
      this.wall = { d: Race.leadD() + CFG.SUCTION_DISTANCE + 22 };
    }
    if (this.wall) {
      this.retireFinishers();
      if (this.wallGap() <= CFG.SUCTION_DISTANCE) this.beginFinish();
    }
  },

  /* a rival that reaches the wall has finished its race */
  retireFinishers: function () {
    for (var i = 0; i < Race.racers.length; i++) {
      var p = Race.racers[i];
      if (p.human || p.finished) continue;
      if (p.d >= this.wall.d) { p.finished = true; p.alive = false; Race.finish(p); }
    }
  },

  finalProgress: function () { return Math.max(0, this.distance - this.finalStart); },

  /* an obstacle sweeping past the player: air displacement, and a spark
     when it goes by close enough to be felt */
  passFX: function () {
    if (Settings.reduced) return;
    var px = Player.x(), py = Player.y(), pr = playerRadius();
    var list = Obstacles.list;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.passed || o.wd + o.hM > Player.d) continue;
      o.passed = true;
      var r = o.rect(), near = null;
      /* carried over the top of it is not squeezing past it */
      if (Player.alive && !Player.inBubble()) {
        var gap = Math.max(r.x - px, px - (r.x + r.w));
        if (gap < pr * 1.5) near = { x: px, y: py };     /* squeezed by, or ducked under */
      }
      VFX.whoosh(r, near);
    }
  },

  onSpeedUp: function () {
    Sound.play('speedUp');
    var x = PF.x + PF.w / 2, y = PF.y + PF.h * CFG.PLAYER_Y;
    VFX.burst(x, y, 18, { color: accent(1), spMin: 120, spMax: 500,
      sizeMax: 3.4, lifeMax: .6, streak: true, world: true });
  },

  enterFinal: function () {
    this.finalActive = true;
    this.finalStart = this.distance;
    Sound.play('finalStage');
    VFX.ripple(PF.x + PF.w / 2, PF.y + PF.h * 0.5, PF.w * 0.05, PF.w * 1.25, accent(1), 1.0, 3);
    VFX.ripple(PF.x + PF.w / 2, PF.y + PF.h * 0.5, PF.w * 0.05, PF.w * 0.9, '#000', .8, 1.6);
    VFX.addShake(4);
  },

  /* ---------- finish sequence ---------- */
  /* metres of open track still between the player and the face of the wall */
  wallGap: function () {
    if (!this.wall) return Infinity;
    return this.wall.d - Player.d;
  },
  /* The face of the wall, in screen pixels. Up to the finish it is simply
     where the world puts it. Once the camera locks it is pinned just above the
     frame — the racer travels the last hundred metres up to it, rather than it
     being dragged down to the racer — and after that it sweeps over everything. */
  wallEdgeY: function () {
    if (!this.wall) return -1e9;
    if (this.seq) return this.seq.edge;
    return screenY(this.wall.d);
  },
  wallCovered: function () {
    return !!this.wall && this.wallEdgeY() >= VIEW.h + 24;
  },

  beginFinish: function () {
    if (App.state === ST.FINISH || App.state === ST.COMPLETED) return;
    App.set(ST.FINISH);
    Gen.stop();
    Sound.play('suction');
    if (!Player.alive) {                 /* never end the run with no player on screen */
      var d = Player.d;
      Player.place(1); Player.d = d; Player.spawnT = 1;
    }
    Player.crouch = false;
    Player.coasting = false;
    Player.floating = false;             /* the finish takes over from the bubble */
    Player.bubble = 0; Player.landing = 0; Player.bubbleAge = 0;
    Player.immune = 999;                 /* the finish is not a place to die */
    /* the world holds still from here: the last hundred metres are the racer's
       to cover, and the camera stays put to show them covering it */
    Race.camLock = true;
    this.seq = {
      t: 0, k: 0, fromX: Player.x(), startD: Player.d,
      edge: PF.y - PF.h * 0.02, soundDone: false, particleT: 0
    };
  },

  updateFinish: function (dt) {
    var s = this.seq;
    if (!s || !this.wall) return;
    s.t += dt;

    /* everything else carries on: the rivals keep racing, the hazards keep
       moving. Only the camera has stopped, so on screen the world holds still
       and the racer is the thing that moves. */
    Race.tickClock(dt);
    Obstacles.update(dt);
    Race.update(dt, this.mult);
    this.retireFinishers();
    this.distance = Player.d;

    var home = PF.y + CFG.PLAYER_Y * PF.h;
    var r = playerRadius();
    /* how much of the last hundred metres this racer has actually covered.
       Kept one-way: a rival nudging it clear during separation must not make
       the glide stutter backwards. */
    s.k = Math.max(s.k, clamp((Player.d - s.startD) / CFG.SUCTION_DISTANCE, 0, 1));
    var k = s.k, e = easeInCubic(k);

    Player.xF = (lerp(s.fromX, PF.x + PF.w / 2, e) - PF.x) / PF.w;
    Player.yOff = lerp(home, s.edge - r * 0.9, e) - home;
    Player.scaleMul = 1 - 0.97 * e;
    Player.moveT = 1; Player.toF = Player.xF; Player.fromF = Player.xF;

    /* everything loose on the track is dragged the same way */
    var tx = PF.x + PF.w / 2, ty = Math.max(s.edge, PF.y - PF.h * 0.12);
    s.particleT -= dt;
    if (s.particleT <= 0 && Player.alive) {
      s.particleT = 0.02;
      var n = Settings.reduced ? 1 : 2 + Math.round(k * 2);
      for (var i = 0; i < n; i++) {
        var ang = rand(0, TAU), dist = rand(PF.w * 0.35, PF.w * 0.95);
        var px = tx + Math.cos(ang) * dist, py = home + Math.sin(ang) * dist * 0.8;
        var toA = Math.atan2(ty - py, tx - px);
        var sp = rand(400, 780) * (0.6 + k * 0.8);
        VFX.parts.push({
          x: px, y: py, vx: Math.cos(toA) * sp, vy: Math.sin(toA) * sp,
          life: 0, max: rand(.35, .6), size: rand(1.5, 3.4), color: '#000',
          drag: -0.9, grav: 0, streak: true
        });
      }
    }
    if (!Settings.reduced && Player.alive) VFX.addShake(0.6 + 2.4 * k);

    /* absorbed: the racer is gone, and the slab comes down over the rest */
    if (e >= 0.97 && Player.alive) {
      if (!s.soundDone) { s.soundDone = true; Sound.play('complete'); }
      Player.alive = false;
      Player.coasting = true;
      Player.respawnT = 1e9;
      Race.finish(Player);
    }
    if (!Player.alive) {
      s.edge += metresToPx(CFG.BASE_SPEED * this.mult * dt * 1.4);
    }
    if (App.state === ST.FINISH && !Player.alive && (this.wallCovered() || s.t >= 14)) {
      App.set(ST.COMPLETED);
      Screens.showComplete();
    }
  }
};
