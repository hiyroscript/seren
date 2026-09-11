'use strict';

/* ============================================================================
   11. RUN — the game itself: speed, distance, collision, respawn, finale
   ========================================================================== */
var Run = {
  distance: 0, mult: 1, speedTimer: 0, collisions: 0, playT: 0,
  hudPulse: 0, milestone: 0,
  posShown: 0, posFlash: 0, posDir: 0,   /* the place the HUD is reporting */
  finalActive: false, finalStart: 0,
  line: null, seq: null, lineAcc: 0,
  countT: 0, countIdx: 0, gridStart: false,

  /* ---------- lifecycle ---------- */
  begin: function () {
    this.distance = 0; this.mult = 1; this.speedTimer = 0; this.collisions = 0;
    this.hudPulse = 0; this.milestone = 0;
    this.posShown = 0; this.posFlash = 0; this.posDir = 0;
    this.playT = 0; this.finalActive = false; this.finalStart = 0;
    this.line = null; this.seq = null; this.lineAcc = 0;
    Obstacles.clear(); VFX.clear();
    Race.reset();
    Gen.reset(0);
    Input.releaseAll();
    Results.hide();
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

  /* what the ground under the human racer is actually doing: the run's own
     multiplier, and on top of it whatever that racer's status effects are
     worth this instant. Not what the HUD reports — the HUD reports the speed
     of the run, which a boost does not change. */
  groundMult: function () { return this.mult * (Player ? Player.speedScale() : 1); },
  /* that same ground speed in playfield heights per second — the one number
     every moving backdrop takes its pace from, so the specks and the streaks
     travel with the track rather than at some pace of their own */
  speedN: function () { return CFG.BASE_SPEED * this.groundMult() / CFG.METERS_VISIBLE; },

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
    this.tickWorld(dt);
    var ground = this.groundMult();     /* what that came to, boosts and all */
    VFX.motes(dt, ground);
    this.passFX();

    var ms = Math.floor(this.distance / 100);
    if (ms > this.milestone) { this.milestone = ms; this.hudPulse = 1; }

    /* --- ambient speed lines: laid down at the rate the ground is actually
       moving, so a boost thickens them and a stopped world stops them --- */
    this.lineAcc += Math.max(0, 0.34 + (ground - 1) * 1.6) * 40 * dt;
    while (this.lineAcc >= 1) { this.lineAcc -= 1; VFX.spawnSpeedLine(ground); }

    /* --- final stage --- */
    if (!this.finalActive && this.mult >= CFG.SPEED_MAX - 1e-9) this.enterFinal();
    if (this.finalActive && !this.line && this.finalProgress() >= CFG.FINAL_DISTANCE) this.plantLine();
  },

  /* One step of the world every racer shares: the clock, the hazards, the
     racers in them, and whoever that has just put over the line. The world
     scrolls by the camera's own travel — up to the finish that is the human
     racer's travel exactly, because the camera rides it, and after the finish
     the camera is the only thing on screen still moving. */
  tickWorld: function (dt) {
    var cam = Race.camD;
    Race.tickClock(dt);
    Obstacles.update(dt);
    Gen.update(dt, this.mult, Race.leadD());
    Race.update(dt, this.mult);
    this.checkCrossings();
    /* the run is as long as the track to the line: the run-out past it is not
       ground the racer had to earn */
    if (!Player.finished) this.distance = Player.d;
    this.trackPlace(dt);
    VFX.scrollWorld(metresToPx(Race.camD - cam));
  },

  /* The place readout answers to the standings, not to the frame. When the
     place this racer is standing in actually changes, the readout is handed a
     colour — one for a place taken, another for a place lost — and that colour
     fades back to the resting ink over POS_FLASH seconds. */
  trackPlace: function (dt) {
    if (this.posFlash > 0) this.posFlash = Math.max(0, this.posFlash - dt / CFG.POS_FLASH);
    var pos = (Player && Player.pos) ? Player.pos : 0;
    if (!pos) return;
    if (!this.posShown) { this.posShown = pos; return; }   /* the first read is not a change */
    if (pos === this.posShown) return;
    this.posDir = pos < this.posShown ? 1 : -1;
    this.posShown = pos;
    this.posFlash = 1;
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
      VFX.whoosh(r, near, o.crouch && Player.crouch);
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

  /* ---------- the finish line ---------------------------------------------
     The run ends at a line laid across the track rather than at a wall that
     swallows it. Racers cross it, and what crossing pays is a place. A
     finisher is out of play the instant it is over — nothing on the track can
     touch it, and nothing it was carrying comes over the line with it — and
     instead of stopping dead where it crossed it rolls out onto a mark its
     place earned: first place rolls furthest and every place behind stops one
     step earlier, in the column the staircase hands it, so the field parks in
     the order it finished and no two racers are ever aimed at the same piece
     of track.
     --------------------------------------------------------------------- */
  plantLine: function () {
    /* planted ahead of whoever leads, so no racer is ever behind the line, and
       far enough ahead that the course already authored stops short of it */
    this.line = { d: Race.leadD() + CFG.LINE_LEAD, from: this.distance };
    Gen.stopAt(this.line.d - CFG.LINE_CLEAR);   /* hazards up to the run-in, none past it */
  },

  /* one marble across, in metres. The band and every park measurement are in
     these, so the line reads the same against the racers, and the field parks
     the same way, whatever shape the playfield is. */
  marbleM: function () { return pxToMetres(playerRadius() * 2); },
  lineDepth: function () { return this.marbleM() * CFG.LINE_DEPTH; },
  parkLaneFor: function (place) { return (place - 1 + Race.parkRot) % 3; },
  /* measured from the far edge of the band, not from its face, so the last
     racer home comes to rest clear of the line rather than on top of it */
  parkDistFor: function (place) {
    var field = Race.racers.length;
    return this.line.d + this.lineDepth() + this.marbleM() *
      (CFG.PARK_BASE + (field - place) * CFG.PARK_STEP);
  },
  /* Where the camera settles to watch it: the stretch from the line to the
     furthest mark, centred. The whole parked field is on screen, and there is
     still track under the line to watch the rest of them come in on. */
  parkCamD: function () {
    return (this.line.d + this.parkDistFor(1)) / 2 -
      CFG.METERS_VISIBLE * (CFG.PLAYER_Y - 0.5);
  },
  /* The staircase can start in any of the three columns and still be a
     staircase, so it starts in whichever one the field is closest to already:
     ordering the racers by how far down the track they are guesses the
     finishing order well enough at the line, and the rotation that leaves the
     most of them in the column they are already in is the one that makes the
     fewest cut across the others on the way out. Picked once, by the first
     racer home, so every later finisher joins the same staircase. */
  pickParkRot: function () {
    var all = Race.racers.slice().sort(function (a, b) { return b.d - a.d; });
    var best = 0, bestCost = 1e9;
    for (var rot = 0; rot < 3; rot++) {
      var cost = 0;
      for (var i = 0; i < all.length; i++) if (all[i].lane !== (i + rot) % 3) cost++;
      if (cost < bestCost) { bestCost = cost; best = rot; }
    }
    return best;
  },

  /* whoever is over the line, in the order they got there */
  checkCrossings: function () {
    if (!this.line) return;
    for (var i = 0; i < Race.racers.length; i++) {
      var p = Race.racers[i];
      if (!p.finished && p.d >= this.line.d) this.cross(p);
    }
  },

  cross: function (p) {
    if (!Race.finishOrder.length) Race.parkRot = this.pickParkRot();
    /* what it was doing as it crossed is what it has to shed on the way out */
    p.rollV = CFG.BASE_SPEED * this.mult * (p.alive ? p.speedScale() : 1);
    p.finished = true;
    Race.finish(p);

    /* out of play, and clean: a shove, a boost, a bubble or a hit the same
       frame does not follow a racer over the line */
    p.alive = true; p.coasting = false; p.respawnT = 0; p.spawnT = 1;
    p.boost = 0; p.boostPower = 1; p.slow = 0; p.bumpCd = 0; p.hitFlash = 0;
    p.crouch = false;
    p.floating = false; p.bubble = 0; p.bubbleAge = 0; p.landing = 0;
    p.immune = 0; p.immuneExt = 0;
    p.dash = null; p.yOff = 0; p.scaleMul = 1;

    /* the column its place earned, and the long glide across onto it */
    p.laneTime = CFG.PARK_CROSS;
    var lane = this.parkLaneFor(p.result);
    if (lane !== p.lane) p.slideTo(lane, lane > p.lane ? 1 : -1, true);

    if (p.onCamera()) {
      var r = playerRadius();
      VFX.ripple(p.x(), p.y(), r * 0.7, r * 3.6, BUBBLE_INK, 0.5, 1.6);
      if (!Settings.reduced) {
        VFX.burst(p.x(), p.y(), p.human ? 16 : 8, {
          color: BUBBLE_INK, spMin: 90, spMax: 380, sizeMax: 3,
          lifeMax: .5, streak: true, world: true
        });
      }
    }
    if (p.human) this.beginFinish();
  },

  /* The run-out, taken outright the way a brake is: it can only ever slow a
     racer, so crossing the line never hands speed back. The last of it is
     below the speed anything can be seen moving at, so it is closed outright
     rather than eased forever — two pixels is nothing to look at, but it is
     the difference between the field being evenly spaced and being evenly
     spaced apart from one of them. */
  rollOut: function (p, dt) {
    if (this.line && p.result) {
      var rem = this.parkDistFor(p.result) - p.d;
      if (rem <= 0 || rem * CFG.PARK_EASE < pxToMetres(8)) {
        p.d += Math.max(0, rem); p.rollV = 0;
      } else {
        p.rollV = Math.min(p.rollV, rem * CFG.PARK_EASE);
        p.d += p.rollV * dt;
      }
    }
    p.update(dt, false);
  },

  /* ---------- the human racer's finish ---------- */
  beginFinish: function () {
    if (App.state === ST.FINISH || App.state === ST.COMPLETED) return;
    App.set(ST.FINISH);
    Sound.play('crossLine');
    Input.releaseAll();
    /* the camera stops riding the racer and settles on the line instead, so
       the run-out is something to watch rather than something to follow */
    Race.camLock = true;
    this.seq = { t: 0, hold: 0 };
    VFX.addShake(3);
  },

  updateFinish: function (dt) {
    var s = this.seq;
    if (!s || !this.line) return;
    s.t += dt;
    /* everything carries on: the rivals still on the track are still racing
       for the places that are left. Only the camera has stopped. */
    this.tickWorld(dt);
    Race.camD = approach(Race.camD, this.parkCamD(), 2.4, dt);
    if (App.state !== ST.FINISH) return;
    /* navigation waits for the racer to come to rest on its mark, and a beat
       longer, so the rest of the field can still be seen coming in */
    if (Player.rollV <= 0) s.hold += dt;
    if (s.hold >= CFG.PARK_HOLD || s.t >= 14) {
      App.set(ST.COMPLETED);
      Sound.play('complete');
      Screens.show(null);
      Results.show();
    }
  }
};
