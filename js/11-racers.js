'use strict';

/* ============================================================================
   10. RACERS — one simulation, six competitors

   The human is racer 0. Everything below applies to all six equally: the same
   movement, the same hazards, the same collisions, the same respawns. The only
   difference between the human and the other five is where their decisions
   come from.
   ========================================================================== */
var AI_LEVELS = {
  /* look is capped at the track a racer can actually see ahead of itself, so
     no level is ever reacting to something off screen */
  easy:   { react: [0.34, 0.52], look: 9,  err: 0.34, aggr: 0.10, defend: 0.10,
            waves: 1, duck: 0.60, lead: 0.55, greed: 0.15 },
  normal: { react: [0.19, 0.30], look: 14, err: 0.16, aggr: 0.34, defend: 0.38,
            waves: 2, duck: 0.88, lead: 0.75, greed: 0.45 },
  hard:   { react: [0.11, 0.18], look: 19, err: 0.055, aggr: 0.60, defend: 0.70,
            waves: 3, duck: 0.97, lead: 0.95, greed: 0.78 },
  brutal: { react: [0.07, 0.11], look: 22, err: 0.015, aggr: 0.86, defend: 0.93,
            waves: 4, duck: 1.00, lead: 1.15, greed: 1.00 }
};
var AI_ORDER = ['easy', 'normal', 'hard', 'brutal'];
function aiLevel() { return AI_LEVELS[Settings.cpu] || AI_LEVELS.normal; }

function Racer(id, human, marbleKey) {
  this.id = id;
  this.human = !!human;
  this.marble = marbleKey;
  this.d = 0;
  this.lane = 1; this.xF = 0.5; this.fromF = 0.5; this.toF = 0.5; this.moveT = 1; this.dir = 0;
  this.crouch = false; this.crouchAmt = 0;
  this.crouchWas = false;        /* to catch the moment one begins */
  this.crouches = 0;             /* how many this racer has made this run */
  this.alive = true; this.spawnT = 1; this.immune = 0; this.immuneExt = 0;
  this.slow = 0;                 /* bump slowdown, seconds remaining */
  this.boostPower = 1;
  this.boost = 0;                /* speed-pad boost, seconds remaining */
  this.star = 0;
  this.floating = false;         /* in a bubble at all */
  this.bubble = 0;               /* guaranteed carry left, seconds */
  this.bubbleAge = 0;            /* how long it has been floating altogether */
  this.landing = 0;              /* seconds left of the drop, once it starts */
  this.rollHold = 0; this.coasting = false;
  this.entryD = 0;               /* how far back it still is on the starting roll */
  this.entryFrom = 0; this.entryDelay = 0;
  this.bumpCd = 0;               /* short guard against repeat contacts */
  this.hitFlash = 0;
  this.respawnT = 0; this.collisions = 0; this.finished = false;
  this.item = null; this.itemPickedAt = -10;
  this.result = 0;               /* the place it crossed the finish line in */
  this.rollV = 0;                /* metres a second left in the run-out */
  this.laneTime = CFG.LANE_TIME; /* seconds a column change takes, for this racer */
  this.dustT = 0; this.boostT = 0; this.dash = null; this.yOff = 0; this.scaleMul = 1;
  this.starTrail = [];           /* the ribbon a star lays on the track behind it */
  this.starT = 0;
  this.ai = human ? null : { next: 0, want: 1, duckFor: null, duckOk: true, seen: 0 };
}

Racer.prototype.laneF = function (l) { return (l + 0.5) / 3; };
/* off the ground in a bubble: carrying, waiting for a gap, or dropping */
Racer.prototype.inBubble = function () { return this.floating; };
/* nothing on the track can touch it — not a hazard, not another racer */
Racer.prototype.intangible = function () { return this.star > 0 || this.immune > 0 || this.inBubble(); };
Racer.prototype.place = function (lane, d) {
  this.lane = clamp(lane, 0, 2);
  this.xF = this.fromF = this.toF = this.laneF(this.lane);
  this.moveT = 1; this.dir = 0;
  this.crouch = false; this.crouchAmt = 0; this.crouchWas = false;
  this.alive = true; this.spawnT = 1;
  this.immune = 0; this.immuneExt = 0; this.slow = 0; this.bumpCd = 0;
  this.boostPower = 1;
  this.boost = 0; this.entryD = 0; this.floating = false; this.dash = null;
  this.star = 0; this.starTrail.length = 0; this.starT = 0;
  this.bubble = 0; this.bubbleAge = 0; this.landing = 0;
  this.coasting = false;
  this.rollV = 0; this.laneTime = CFG.LANE_TIME;
  this.yOff = 0; this.scaleMul = 1;
  if (d !== undefined) this.d = d;
  if (this.ai) { this.ai.next = 0; this.ai.duckFor = null; }
};
/* kept for the call sites that reset the human racer by lane alone */
Racer.prototype.reset = function (lane) { this.place(lane === undefined ? 1 : lane); };

/* How far off the ground the bubble is holding this racer, 0 to 1: it rises as
   the bubble forms and sets the racer down again just before it pops. */
Racer.prototype.floatK = function () {
  if (!this.floating) return 0;
  var up = clamp(this.bubbleAge / 0.30, 0, 1);
  var down = this.landing > 0 ? clamp(this.landing / CFG.BUBBLE_DROP, 0, 1) : 1;
  return Math.min(easeOutCubic(up), easeInOutCubic(down));
};
Racer.prototype.x = function () {
  var k = this.floatK();
  var sway = k ? playerRadius() * 0.10 * k * Math.sin(App.time * 1.6 + this.id * 2.1) : 0;
  return PF.x + this.xF * PF.w + sway;
};
/* Every racer is drawn where the world puts it. For the human that is its own
   mark exactly, because the camera rides it — its distance and the camera's
   are the same number — and once the camera stops at the finish line, this is
   what lets that racer roll out up the screen instead of dragging the line
   back down to itself. */
Racer.prototype.y = function () {
  var k = this.floatK();
  /* lifted clear of the track, with a slow bob on top of it */
  var lift = k ? playerRadius() * k * (1.30 + 0.13 * Math.sin(App.time * 2.4 + this.id)) : 0;
  return screenY(this.d + this.entryD) + this.yOff - lift;
};
Racer.prototype.onCamera = function () {
  var yn = yNof(this.d + this.entryD);
  return yn > -0.15 && yn < 1.15;
};
Racer.prototype.radiusPx = function () {
  return playerRadius() * this.scaleMul * (1 - CFG.CROUCH_SHRINK * this.crouchAmt);
};
Racer.prototype.radiusM = function () { return pxToMetres(this.radiusPx()); };
Racer.prototype.marbleDef = function () { return MARBLES[this.marble] || MARBLES.blue; };

/* the ink of the pad that shoved this racer. The star has its own light, and
   never borrows the pads' — the whole point of it is that it is not a pad. */
Racer.prototype.boostColor = function () {
  return this.boostPower > 1 ? '#704CF5' : BOOST_INK;
};
/* the star's colour this instant: the bubbles' blue, pink and yellow, off the
   shared race clock, so all six racers see the same one at the same moment */
Racer.prototype.starColor = function () { return 'rgb(' + starRGB(starPhase()) + ')'; };
/* how fast this racer is covering ground right now, as a fraction of the
   shared multiplier: a timed status effect, never a permanent change */
Racer.prototype.speedScale = function () {
  /* eliminated: the world stops dead for this racer and does not start again
     until it is back on the track. Everyone else carries on without it. */
  if (!this.alive) return this.coasting ? 1 : 0;
  if (this.star > 0) return CFG.STAR_SPEED;
  var s = 1;
  if (this.boost > 0) s *= 1 + (CFG.BOOST_SCALE - 1) * this.boostPower;
  if (this.slow > 0) s *= CFG.BUMP_SLOW_SCALE;
  return s;
};

/* the drawn size of the body. Ducking shrinks the whole marble evenly —
   it never flattens — and the only stretch left is the lane-change lean. */
Racer.prototype.dims = function () {
  var r = playerRadius() * this.scaleMul * (1 - CFG.CROUCH_SHRINK * this.crouchAmt);
  var m = this.moveT < 1 ? Math.sin(this.moveT * PI) : 0;
  return { rx: r * (1 + 0.16 * m), ry: r * (1 - 0.10 * m) };
};
/* the hitbox follows the drawn body */
Racer.prototype.box = function () {
  var r = this.radiusPx() * CFG.HITBOX_FORGIVE;
  return { x: this.x(), y: this.y(), rx: r, ry: r };
};

/* a lane change, routed through the bump rules so two racers can never end up
   sharing a column */
Racer.prototype.setLane = function (n) {
  n = clamp(n, 0, 2);
  if (n === this.lane) return false;
  return Race.move(this, n > this.lane ? 1 : -1);
};
/* the animation half of a lane change, once the world has agreed to it */
Racer.prototype.slideTo = function (lane, dir, quiet) {
  this.dir = dir;
  this.lane = lane;
  this.fromF = this.xF; this.toF = this.laneF(lane); this.moveT = 0;
  if (!quiet && this.onCamera()) {
    if (this.human) Sound.play(dir > 0 ? 'laneR' : 'laneL');
    var r = playerRadius();
    this.dash = VFX.startDash(this.x(), this.y(), dir, this.dims().rx, this.marbleDef().color);
    VFX.burst(this.x() - dir * r * 0.5, this.y() + r * 0.5, this.human ? 7 : 4, {
      color: '#000', dir: PI / 2 - dir * 0.9, spMin: 60, spMax: 210,
      sizeMax: 2.6, lifeMax: .34, streak: true, a0: .6, world: true
    });
  }
};

Racer.prototype.update = function (dt, active) {
  if (this.slow > 0) this.slow = Math.max(0, this.slow - dt);
  if (this.boost > 0) this.boost = Math.max(0, this.boost - dt);
  if (this.bumpCd > 0) this.bumpCd = Math.max(0, this.bumpCd - dt);
  if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

  /* lane interpolation with a soft overshoot */
  if (this.moveT < 1) {
    this.moveT = Math.min(1, this.moveT + dt / (this.laneTime || CFG.LANE_TIME));
    var e = easeOutBack(this.moveT) * 0.12 + easeOutQuint(this.moveT) * 0.88;
    this.xF = lerp(this.fromF, this.toF, e);
    if (this.dash) { this.dash.x1 = this.x(); this.dash.y = this.y(); }
    if (this.moveT >= 1) this.dash = null;
  } else { this.xF = this.toF; }

  /* a boosted racer throws off sparks in the pad's colour */
  if (active && this.alive && this.boost > 0 && !Settings.reduced && this.onCamera()) {
    this.boostT -= dt;
    if (this.boostT <= 0) {
      this.boostT = this.human ? 0.035 : 0.07;
      var bd = this.dims();
      VFX.parts.push({
        x: this.x() + rand(-bd.rx, bd.rx), y: this.y() + bd.ry * 0.7,
        vx: rand(-30, 30), vy: rand(140, 340), life: 0, max: rand(.2, .4),
        size: rand(1.6, 3.2), color: this.boostColor(), drag: 1.6, grav: 0,
        streak: true, a0: .95, w: true
      });
    }
  }

  /* a starred racer does none of that: it lays a ribbon of its own colours
     down the track and sheds light rather than pad streaks */
  this.updateStar(dt, active);

  /* dust kicked up along the ground while crouching */
  if (active && this.alive && this.crouchAmt > 0.55 && !Settings.reduced && this.onCamera()) {
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = this.human ? 0.045 : 0.09;
      var dd = this.dims();
      VFX.parts.push({
        x: this.x() + rand(-dd.rx, dd.rx), y: this.y() + dd.ry * 0.8,
        vx: rand(-40, 40), vy: rand(30, 110), life: 0, max: rand(.22, .4),
        size: rand(1.2, 2.6), color: '#000', drag: 2.2, grav: 0,
        streak: false, a0: .45, w: true
      });
    }
  }

  /* nothing to duck under when you are over the top of it */
  if (this.inBubble()) this.crouch = false;

  /* One tally mark per duck, counted where every racer's crouch settles rather
     than at the keyboard, so a rival's counts the same as the player's and a
     crouch the bubble just cancelled counts for nobody. */
  if (this.crouch && !this.crouchWas) this.crouches++;
  this.crouchWas = this.crouch;

  /* crouch easing */
  var target = (this.crouch && this.alive) ? 1 : 0;
  this.crouchAmt = approach(this.crouchAmt, target, CFG.CROUCH_RATE, dt);
  if (this.crouchAmt < 0.002) this.crouchAmt = 0;
  if (this.crouchAmt > 0.998) this.crouchAmt = 1;

  /* respawn pop-in */
  if (this.spawnT < 1) this.spawnT = Math.min(1, this.spawnT + dt / 0.42);

  /* immunity */
  if (this.immune > 0) {
    this.immune -= dt;
    if (this.immune <= 0) {
      if (Race.dangerNow(this) && this.immuneExt < CFG.IMMUNITY_MAX_EXT) {
        this.immune = CFG.IMMUNITY_EXTEND;
        this.immuneExt += CFG.IMMUNITY_EXTEND;
      } else {
        this.immune = 0; this.immuneExt = 0;
        if (this.human) {
          Sound.play('immuneEnd');
          /* nothing to mark while the bubble still has them: the shell is the
             signal, and a ring under it would only read as noise */
          if (!this.inBubble()) {
            VFX.ripple(this.x(), this.y(), playerRadius(), playerRadius() * 2.1, '#000', .45, 1.6);
          }
        }
      }
    }
  }
};

/* The ribbon a starred marble leaves behind it. Its samples are kept in world
   coordinates — a distance down the course and a column across it — so the
   trail stays on the ground it was laid on however the camera moves, the way
   everything else on this track does. It is the marble's own colour cycle,
   walking back up the ribbon, so the trail and the marble are plainly the
   same effect and neither is the speed pad's. */
Racer.prototype.updateStar = function (dt, active) {
  var head = this.d + this.entryD;
  for (var i = this.starTrail.length - 1; i >= 0; i--) {
    var s = this.starTrail[i];
    s.t += dt;
    /* the ribbon is a length of track rather than a number of seconds, so it
       is the same band of colour at 1.00x as it is at the ceiling; the half
       second is only there to sweep it up behind a racer that has stopped */
    if (head - s.d >= CFG.STAR_TRAIL || s.t >= 0.5) this.starTrail.splice(i, 1);
  }
  if (!active || this.star <= 0 || !this.alive || this.inBubble()) return;
  this.starTrail.push({ d: head, xF: this.xF, rF: this.dims().rx / PF.w, t: 0 });
  if (this.starTrail.length > 90) this.starTrail.shift();
  if (Settings.reduced || !this.onCamera()) return;

  this.starT -= dt;
  if (this.starT > 0) return;
  this.starT = this.human ? 0.045 : 0.09;
  var d = this.dims();
  VFX.twinkle(this.x() + rand(-d.rx, d.rx) * 1.25, this.y() + rand(-d.ry, d.ry) * 1.25, {
    vx: rand(-40, 40), vy: rand(70, 200),
    color: 'rgb(' + starRGB(starPhase() + rand(0, 0.4)) + ')',
    sizeMax: this.human ? 5.4 : 4, world: true
  });
};
/* drawn under every marble, so six trails and six racers never fight */
Racer.prototype.drawStarTrail = function () {
  var n = this.starTrail.length;
  if (n < 2) return;
  var head = this.d + this.entryD;
  var pts = [], i, s, k;
  for (i = n - 1; i >= 0; i--) {                   /* head first, tail last */
    s = this.starTrail[i];
    k = clamp(1 - (head - s.d) / CFG.STAR_TRAIL, 0, 1);
    pts.push({ x: PF.x + s.xF * PF.w, y: screenY(s.d), w: s.rF * PF.w * k });
  }
  if (pts[0].y < PF.y - PF.h * 0.4 || pts[pts.length - 1].y > PF.y + PF.h * 1.4) return;
  var phase = starPhase();
  ctx.save();
  /* twice over: a wide haze with a bright core inside it, because a single
     band of pale colour disappears into white paper */
  for (var pass = 0; pass < 2; pass++) {
    var wide = pass === 0;
    ctx.globalAlpha = wide ? 0.18 : 0.92;
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var aw = a.w * (wide ? 1.5 : 0.74), bw = b.w * (wide ? 1.5 : 0.74);
      ctx.fillStyle = 'rgb(' + starRGB(phase + i * 0.05) + ')';
      ctx.beginPath();
      ctx.moveTo(a.x - aw, a.y); ctx.lineTo(a.x + aw, a.y);
      ctx.lineTo(b.x + bw, b.y); ctx.lineTo(b.x - bw, b.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
};

Racer.prototype.draw = function () {
  if (!this.alive || !this.onCamera()) return;
  var x = this.x(), y = this.y();
  var pop = this.spawnT < 1 ? easeOutBack(this.spawnT) : 1;

  var m = this.moveT < 1 ? Math.sin(this.moveT * PI) : 0;
  var d = this.dims();
  var rx = d.rx * pop, ry = d.ry * pop;
  var rr = Math.min(rx, ry);
  var tilt = this.dir * m * 0.20;

  var alpha = 1;
  /* inside the bubble the marble is solid: the shell is the signal, and a
     blinking marble underneath it would only read as noise */
  if (this.immune > 0 && !this.inBubble() && this.star <= 0) {
    alpha = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(App.time * 26));
  }

  var bk = this.boost > 0 ? clamp(this.boost / CFG.BOOST_TIME, 0, 1) : 0;
  /* the star's own strength, guttering over its last second so that running
     out of it is something you can see coming */
  var sk = this.star > 0 ? (this.star >= 1 ? 1 : 0.4 + 0.6 * this.star) : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(tilt);

  /* boosted: a pad-coloured flare around the marble for as long as the shove lasts */
  if (bk > 0) {
    var puls = Settings.reduced ? 1 : 0.72 + 0.28 * Math.sin(App.time * 22);
    var rgb = this.boostPower > 1 ? '112,76,245' : '245,197,24';
    var gl = ctx.createRadialGradient(0, 0, rr * 0.45, 0, 0, rr * 2.15);
    gl.addColorStop(0, 'rgba(' + rgb + ',' + (0.46 * bk * puls).toFixed(3) + ')');
    gl.addColorStop(0.55, 'rgba(' + rgb + ',' + (0.20 * bk * puls).toFixed(3) + ')');
    gl.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = gl;
    ctx.fillRect(-rr * 2.3, -rr * 2.3, rr * 4.6, rr * 4.6);
  }

  /* a star burns instead: a corona of its own light turning behind the marble,
     inside a halo of the colour it is cycling through. No pad can put this on
     you, and it looks like nothing a pad does. */
  if (sk > 0) {
    var sPuls = Settings.reduced ? 1 : 0.88 + 0.12 * Math.sin(App.time * 7.5);
    var srgb = starRGB(starPhase());
    var sh = ctx.createRadialGradient(0, 0, rr * 0.5, 0, 0, rr * 2.9);
    sh.addColorStop(0, 'rgba(' + srgb + ',' + (0.44 * sk).toFixed(3) + ')');
    sh.addColorStop(0.6, 'rgba(' + srgb + ',' + (0.18 * sk).toFixed(3) + ')');
    sh.addColorStop(1, 'rgba(' + srgb + ',0)');
    ctx.fillStyle = sh;
    ctx.fillRect(-rr * 3, -rr * 3, rr * 6, rr * 6);
    ctx.globalAlpha = alpha * 0.7 * sk;
    starPath(0, 0, rr * 2.5 * sPuls, 0.30, Settings.reduced ? 0 : App.time * 1.1, 6);
    ctx.fillStyle = starGradient(-rr * 2, rr * 2, rr * 2, -rr * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  /* body */
  var mb = this.marbleDef();
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, 0, TAU);
  ctx.fillStyle = this.star > 0 ? starGradient(-rx, -ry, rx, ry) : mb.color; ctx.fill();

  /* the device inside it, turning with the ground this racer has covered */
  var r0 = Math.max(1, rr);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, 0, TAU);
  ctx.clip();
  ctx.scale(Math.max(0.05, rx / r0), Math.max(0.05, ry / r0));
  /* on the ground it rolls with the track; carried, it turns slowly in the air */
  if (this.inBubble()) {
    ctx.rotate(this.rollHold * CFG.ROLL_RATE + App.time * 0.55);
  } else {
    ctx.rotate((this.d + this.entryD) * CFG.ROLL_RATE);
  }
  drawMarblePattern(mb.pattern, r0);
  ctx.restore();

  /* the outline belongs to the marble, so the body is laid down again here:
     restore() gives back the transform and the clip but not the path, and
     the device's path would otherwise be the thing that got stroked */
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, 0, TAU);
  ctx.lineWidth = Math.max(1.4, rr * 0.085);
  ctx.strokeStyle = '#000'; ctx.stroke();

  /* a rim of the same light on the marble itself, so the body reads as lit
     rather than merely coloured */
  if (sk > 0) {
    ctx.globalAlpha = alpha * sk;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(1, rx * 1.16), Math.max(1, ry * 1.16), 0, 0, TAU);
    ctx.lineWidth = Math.max(1.2, rr * 0.13);
    ctx.strokeStyle = starGradient(-rx, -ry, rx, ry);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  /* and a boosted marble trails chevrons behind it, pointing the way the pad
     sent it — the pads' own mark, which the star never wears */
  if (bk > 0) {
    ctx.strokeStyle = this.boostColor();
    ctx.lineWidth = Math.max(1.4, rr * 0.16);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var b = 0; b < 3; b++) {
      var off = rr * (1.20 + b * 0.54) + Math.sin(App.time * 16 - b) * rr * 0.07;
      var bw = rr * (0.62 - b * 0.13);
      ctx.globalAlpha = alpha * bk * (0.9 - b * 0.24);
      ctx.beginPath();
      ctx.moveTo(-bw, off + rr * 0.22);
      ctx.lineTo(0, off - rr * 0.10);
      ctx.lineTo(bw, off + rr * 0.22);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }

  /* a racer knocked out of shape by a bump wears it for the two seconds it
     lasts: a broken ring that rocks with the marble */
  if (this.slow > 0) {
    ctx.globalAlpha = alpha * 0.55 * clamp(this.slow / CFG.BUMP_SLOW_TIME, 0, 1);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1.2, rr * 0.10);
    ctx.lineCap = 'round';
    var sp = App.time * 5;
    for (var k = 0; k < 3; k++) {
      var a0 = sp + k * TAU / 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 1.34, ry * 1.34, 0, a0, a0 + 0.72);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
  }

  ctx.restore();
  ctx.globalAlpha = 1;

  if (this.inBubble()) this.drawBubble();
};

/* The soap film of drawSoapRect, drawn round a circle instead of a rectangle:
   the same halo, the same film, the same three tints sliding round the rim,
   the same two highlights, every weight proportional to the radius. The marble
   shows through the middle in place of the mystery square's "?" — the racer
   inside is the whole point of this one. */
Racer.prototype.drawBubble = function () {
  var base = playerRadius() * 1.38;                          /* it hugs the marble */
  var k = this.landing > 0 ? 1 - clamp(this.landing / CFG.BUBBLE_DROP, 0, 1) : 0;
  var pop = this.spawnT < 1 ? easeOutBack(this.spawnT) : 1;
  var t = App.time * 1.4 + this.id * 2.1;                    /* its own phase */
  var r = base * pop * (1 + Math.sin(t * 1.3) * 0.045) * (1 + 0.09 * easeInCubic(k));
  var x = this.x(), y = this.y();
  if (r < 2) return;

  ctx.save();
  ctx.globalAlpha = 1 - k * 0.22;

  /* the halo it sits in */
  var glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.6);
  glow.addColorStop(0, 'rgba(180,225,255,0.30)');
  glow.addColorStop(1, 'rgba(180,225,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4);

  /* soap film: clear in the middle, bright at the edge */
  var film = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  film.addColorStop(0,    'rgba(255,255,255,0.05)');
  film.addColorStop(0.62, 'rgba(190,230,255,0.14)');
  film.addColorStop(0.88, 'rgba(255,255,255,0.42)');
  film.addColorStop(1,    'rgba(255,255,255,0.08)');
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = film; ctx.fill();

  /* thin-film colour sliding around the rim */
  ctx.lineWidth = Math.max(1.2, r * 0.11);
  for (var i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x, y, r - ctx.lineWidth * 0.4, t * 0.6 + i * 2.1, t * 0.6 + i * 2.1 + 1.5);
    ctx.strokeStyle = SOAP_TINTS[i];
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.8, r * 0.055);
  ctx.stroke();

  /* highlights */
  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y - r * 0.40, r * 0.26, r * 0.16, -0.7, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + r * 0.42, y + r * 0.34, r * 0.10, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
};

/* ---------------------------------------------------------------------------
   world-space collision: an ellipse (the racer) against a box (the hazard),
   both measured in metres and playfield fractions rather than pixels, so the
   answer is the same wherever the camera happens to be looking
   ------------------------------------------------------------------------- */
function racerHits(p, o, fromD) {
  var capX = colW() * 0.10 / PF.w, capM = pxToMetres(colW() * 0.10);
  var sx = Math.min(o.wF * CFG.OBSTACLE_FORGIVE, capX);
  var sm = Math.min(o.hM * CFG.OBSTACLE_FORGIVE, capM);
  var x0 = o.cxF - o.wF / 2 + sx, x1 = o.cxF + o.wF / 2 - sx;
  var d0 = o.wd + sm, d1 = o.wd + o.hM - sm;
  if (x1 <= x0 || d1 <= d0) return false;
  var rx = p.radiusPx() * CFG.HITBOX_FORGIVE / PF.w;
  var rm = p.radiusM() * CFG.HITBOX_FORGIVE;
  /* Stars travel fast: test the swept distance so thin hazards cannot tunnel
     between frames. Ordinary contacts retain their existing hitbox. */
  var d = fromD === undefined ? p.d : clamp((d0 + d1) / 2, Math.min(fromD, p.d), Math.max(fromD, p.d));
  var nx = clamp(p.xF, x0, x1), nd = clamp(d, d0, d1);
  var ex = (p.xF - nx) / rx, em = (d - nd) / rm;
  return ex * ex + em * em <= 1;
}

/* One slot, three equally likely items; effects refresh rather than stack. */
var ITEM_KINDS = ['falseMystery', 'boost', 'star'];

/* ============================================================================
   RACE — the shared simulation every racer runs inside
   ========================================================================== */
var Player = null;          /* the human racer, once the grid is built */

var Race = {
  racers: [], human: null, camD: 0, clock: 0, standings: [], finishOrder: [], entryT: 0,
  camLock: false,
  parkRot: 0,          /* which column the parked staircase starts in */

  build: function () {
    this.racers.length = 0;
    var human = new Racer(0, true, Settings.marble);
    this.racers.push(human);
    this.human = human;
    for (var i = 1; i < CFG.RACERS; i++) this.racers.push(new Racer(i, false, 'blue'));
    Player = human;
    this.assignMarbles();
    return human;
  },

  /* the five rivals take the marbles the human did not, so no two racers on
     screen at once look alike */
  assignMarbles: function () {
    this.human.marble = MARBLES[Settings.marble] ? Settings.marble : 'blue';
    var pool = [], i;
    for (i = 0; i < MARBLE_ORDER.length; i++) {
      if (MARBLE_ORDER[i] !== this.human.marble) pool.push(MARBLE_ORDER[i]);
    }
    for (i = 1; i < this.racers.length; i++) {
      this.racers[i].marble = pool[(i - 1) % pool.length];
    }
  },

  /* ---------- the starting grid ---------- */
  reset: function () {
    if (!this.racers.length) this.build();
    this.clock = 0;
    this.finishOrder.length = 0;
    this.assignMarbles();
    /* front row alongside the human, second row tucked in behind */
    var grid = [
      { lane: 1, back: 0 },      /* the human keeps the position it always had */
      { lane: 0, back: 0 }, { lane: 2, back: 0 },
      { lane: 0, back: 1 }, { lane: 1, back: 1 }, { lane: 2, back: 1 }
    ];
    for (var i = 0; i < this.racers.length; i++) {
      var g = grid[i % grid.length];
      var p = this.racers[i];
      p.place(g.lane, -g.back * CFG.GRID_ROW);
      p.item = null; p.itemPickedAt = -10;
      p.collisions = 0; p.finished = false; p.respawnT = 0; p.hitFlash = 0;
      p.result = 0; p.rollV = 0; p.laneTime = CFG.LANE_TIME;
      p.crouches = 0; p.crouchWas = false;
      /* they roll up onto the grid rather than appearing on it */
      p.entryFrom = -CFG.ENTRY_DIST;
      p.entryD = p.entryFrom;
      p.entryDelay = i * CFG.ENTRY_STAGGER;
      if (p.ai) { p.ai.next = rand(0, 0.3); p.ai.want = g.lane; p.ai.duckFor = null; }
    }
    this.entryT = 0;
    this.camLock = false;
    this.parkRot = 0;
    this.camD = this.human.d;
    this.rank();
  },

  /* the countdown roll: every racer eases up into its slot and settles there
     well before GO, turning as it comes so it reads as rolling rather than
     sliding. Nothing else about them is live while this runs. */
  updateEntry: function (dt) {
    this.entryT += dt;
    for (var i = 0; i < this.racers.length; i++) {
      var p = this.racers[i];
      if (!p.entryFrom) continue;
      var k = clamp((this.entryT - p.entryDelay) / CFG.ENTRY_TIME, 0, 1);
      p.entryD = p.entryFrom * (1 - easeOutCubic(k));
      if (k >= 1) { p.entryD = 0; p.entryFrom = 0; }
    }
  },

  /* the order racers actually crossed, which is not the order they are
     standing in once the leaders have stopped */
  finish: function (p) {
    if (p.result) return;
    this.finishOrder.push(p);
    p.result = this.finishOrder.length;
  },
  leadD: function () {
    var m = -1e9;
    for (var i = 0; i < this.racers.length; i++) {
      if (!this.racers[i].finished) m = Math.max(m, this.racers[i].d);
    }
    return m === -1e9 ? this.human.d : m;
  },
  trailD: function () {
    var m = 1e9;
    for (var i = 0; i < this.racers.length; i++) {
      if (!this.racers[i].finished) m = Math.min(m, this.racers[i].d);
    }
    return Math.min(m === 1e9 ? this.human.d : m, this.human.d);
  },
  drawRacers: function () {
    var i;
    /* every ribbon first: six trails under six marbles, never through them */
    for (i = 0; i < this.racers.length; i++) this.racers[i].drawStarTrail();
    for (i = 0; i < this.racers.length; i++) {
      if (!this.racers[i].human) this.racers[i].draw();
    }
    this.human.draw();
  },
  /* Anyone over the line is ahead of anyone still on the track, and stays in
     the place it crossed in — once the leaders have rolled out and stopped,
     the distances alone no longer say who is winning. */
  rank: function () {
    this.standings = this.racers.slice().sort(function (a, b) {
      if (a.result && b.result) return a.result - b.result;
      if (a.result !== b.result) return a.result ? -1 : 1;
      return b.d - a.d;
    });
    for (var i = 0; i < this.standings.length; i++) this.standings[i].pos = i + 1;
  },
  /* a racer close enough beside another for contact to make sense */
  beside: function (p, lane, ignore) {
    for (var i = 0; i < this.racers.length; i++) {
      var q = this.racers[i];
      if (q === p || q === ignore || !q.alive || q.finished) continue;
      if (q.lane !== lane) continue;
      if (Math.abs(q.d - p.d) > CFG.BUMP_RANGE) continue;
      return q;
    }
    return null;
  },

  /* ---------- bumping ----------------------------------------------------
     A racer moving into an occupied column shoves whoever is there one column
     further the same way. If that column is taken too, the shove carries on
     down the line. If it runs out of track, the racer on the end is destroyed
     exactly as though it had hit a hazard. */
  move: function (p, dir) {
    var target = p.lane + dir;
    if (target < 0 || target > 2) return false;
    var blocker = this.beside(p, target);

    if (!blocker) { p.slideTo(target, dir); return true; }

    /* an immune racer is neither a target nor an obstacle: it is intangible
       until its immunity runs out, so nobody can farm a fresh respawn */
    if (blocker.intangible() || p.intangible()) { p.slideTo(target, dir); return true; }
    if (p.bumpCd > 0) return false;

    /* work out the whole chain before moving anyone */
    var chain = [blocker], guard = 0;
    while (guard++ < 4) {
      var last = chain[chain.length - 1];
      var next = last.lane + dir;
      if (next < 0 || next > 2) break;                 /* the end of the track */
      var occ = this.beside(last, next);
      if (!occ || occ.intangible()) break;
      chain.push(occ);
    }

    p.bumpCd = CFG.BUMP_COOLDOWN;
    p.slideTo(target, dir);

    /* push from the far end back, so nobody lands on anybody */
    for (var i = chain.length - 1; i >= 0; i--) {
      var q = chain[i];
      var to = q.lane + dir;
      q.bumpCd = CFG.BUMP_COOLDOWN;
      if (to < 0 || to > 2) {
        this.destroy(q, 'edge');                       /* shoved off the track */
      } else {
        q.slideTo(to, dir, true);
        this.slowDown(q);
      }
    }
    this.bumpFX(p, blocker, dir);
    return true;
  },
  /* the speed pad: a short, timed push, refreshed rather than stacked */
  shoveForward: function (p, o) {
    p.boostPower = o && o.kind === 'superBoost' ? CFG.SUPER_BOOST_POWER : 1;
    p.boost = CFG.BOOST_TIME;
    var ink = p.boostColor();
    var pale = p.boostPower > 1 ? '#E4DCFF' : '#FFF3B0';
    if (o) o.flash = CFG.BOOST_FLASH;          /* the pad lights up as it fires */
    if (p.human) { Sound.play('boost'); VFX.addShake(7); }
    else if (p.onCamera()) Sound.play('boostFar');
    if (!p.onCamera()) return;
    var x = p.x(), y = p.y(), r = playerRadius();
    var big = p.human ? 1 : 0.55;

    /* two rings racing out of it, a pale flash inside them, and a fan of
       streaks thrown up the track behind the racer */
    VFX.ripple(x, y, r * 0.4, r * 5.0 * big, ink, .55, 3.6);
    VFX.ripple(x, y, r * 0.3, r * 3.0 * big, pale, .4, 2.2);
    VFX.burst(x, y, Math.round(28 * big), { color: ink, dir: -PI / 2,
      spMin: 240, spMax: 700, sizeMax: 4.4, lifeMax: .66, streak: true, world: true });
    VFX.burst(x, y, Math.round(12 * big), { color: pale,
      spMin: 90, spMax: 320, sizeMax: 3.2, lifeMax: .5, world: true });
    if (p.human) {
      /* and the lane it happened in flares for a moment */
      VFX.ripple(x, y, r * 1.2, r * 8, ink, .22, 6);
    }
  },
  /* The star lighting up. Deliberately nothing like shoveForward above: no pad
     to flash, no fan of streaks up the track, no chevrons. Rings of its own
     colour close on the marble and a wheel of twinkles goes out around it. */
  starFX: function (p) {
    if (p.human) { Sound.play('star'); VFX.addShake(6); }
    else if (p.onCamera()) Sound.play('starFar');
    if (!p.onCamera()) return;
    var x = p.x(), y = p.y(), r = playerRadius(), big = p.human ? 1 : 0.6;
    VFX.ripple(x, y, r * 0.5, r * 4.6 * big, p.starColor(), .6, 3.4);
    VFX.ripple(x, y, r * 0.3, r * 2.6 * big, '#FFFFFF', .42, 2);
    if (Settings.reduced) return;
    var n = Math.round(14 * big);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU + rand(-0.2, 0.2), sp = rand(120, 340);
      VFX.twinkle(x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: 'rgb(' + starRGB(starPhase() + i / n) + ')',
        sizeMin: 3, sizeMax: 6.5, lifeMax: .7, drag: 2.4, world: true });
    }
  },
  /* and the light going out: a ring closing back onto the marble, so the
     instant that racer can be touched again is one you can see */
  starSpent: function (p) {
    if (!p.alive || p.finished || !p.onCamera()) return;
    var r = playerRadius();
    VFX.ripple(p.x(), p.y(), r * 2.4, r * 0.8, p.starColor(), .42, 2.2);
    if (p.human) Sound.play('immuneEnd');
  },
  /* Nothing on this track simply disappears. A hazard that is destroyed — run
     through by a star, or a dropped trap spending itself on the racer it
     caught — comes apart where it stood, in its own ink. */
  breakUp: function (o, by) {
    if (!o.onCamera()) return;
    /* a hazard is ink, a dropped square is film: each breaks in its own colour */
    VFX.smash(o, { ink: o.kind === 'falseMystery' ? BUBBLE_INK : '#000',
      color: by ? by.starColor() : BUBBLE_INK });
    if (!by) return;                  /* the racer it caught is the sound */
    if (by.human) { VFX.addShake(6); Sound.play('smash'); }
    else Sound.play('smashFar');
  },

  /* The first racer to reach it consumes it for the whole field. */
  mysteryTake: function (p, o) {
    var index = Obstacles.list.indexOf(o);
    if (index < 0 || Race.clock >= o.expiresAt) return;
    Obstacles.list.splice(index, 1);
    if (!p.item) {
      p.item = pick(ITEM_KINDS);
      p.itemPickedAt = Race.clock;
    }
    if (p.onCamera()) {
      var r = o.rect(), x = r.x + r.w / 2, y = r.y + r.h / 2;
      VFX.pickups.push({ cxF: o.cxF, wd: o.wd, wF: o.wF, hM: o.hM,
        start: Race.clock, human: p.human });
      if (!Settings.reduced) {
        VFX.burst(x, y, 18, { color: '#78dfff', spMax: 180, lifeMax: .45, world: true });
        VFX.ripple(x, y, r.w / 3, r.w * 1.5, '#bd8de8', .4, 2);
      }
    }
    if (p.human) Sound.play('mystery');
    else if (p.onCamera()) Sound.play('mysteryFar');
  },
  /* One slot, spent outright: whatever was in it goes off at once and the
     slot is empty again, whichever item it was holding. */
  useItem: function (p) {
    var active = App.state === ST.PLAYING || App.state === ST.RESPAWNING ||
      App.state === ST.FINISH || App.state === ST.COMPLETED;
    if (App.blocked || !active ||
        !p.alive || p.finished || p.inBubble() ||
        ITEM_KINDS.indexOf(p.item) < 0) return false;
    if (p.item === 'star') {
      p.item = null;
      p.star = CFG.STAR_TIME;
      p.slow = 0;
      this.starFX(p);
      return true;
    }
    /* the bolt: the yellow pad's shove exactly, refreshed rather than stacked
       like every other one, and with no pad on the track to light up */
    if (p.item === 'boost') { p.item = null; this.shoveForward(p, null); return true; }
    var h = pxToMetres(colW()) * CFG.MYSTERY_SIZE;
    // Leave a full marble radius of clearance behind the actual moving racer.
    var wd = p.d - pxToMetres(playerRadius()) - h - 0.4;
    var o = new Obstacle('falseMystery', p.xF, CFG.MYSTERY_SIZE / 3,
      h, false, [p.lane], wd);
    Obstacles.list.push(o);
    Obstacles.list.sort(function (a, b) { return a.wd - b.wd; });
    p.item = null;
    return true;
  },
  slowDown: function (q) {
    if (q.star > 0) return;
    /* refreshed, never stacked */
    q.slow = CFG.BUMP_SLOW_TIME;
  },
  bumpFX: function (p, q, dir) {
    var x = (p.x() + q.x()) * 0.5, y = (p.y() + q.y()) * 0.5;
    if (!p.onCamera() && !q.onCamera()) return;
    var r = playerRadius();
    VFX.ripple(x, y, r * 0.5, r * 3.0, q.marbleDef().color, .38, 2.4);
    VFX.ripple(x, y, r * 0.4, r * 2.0, '#000', .3, 1.4);
    VFX.burst(x, y, 12, { color: '#000', dir: dir > 0 ? 0 : PI, spMin: 90, spMax: 320,
      sizeMax: 3.4, lifeMax: .4, streak: true, world: true });
    if (p.human || q.human) { VFX.addShake(5); Sound.play('bump'); }
    else if (Math.abs(q.d - Race.camD) < CFG.METERS_VISIBLE) Sound.play('bumpFar');
  },

  /* ---------- destruction and respawn ---------- */
  destroy: function (p, cause) {
    if (!p.alive || p.finished || p.intangible()) return;
    p.alive = false;
    p.coasting = false;
    p.crouchAmt = 0;
    p.collisions++;
    p.lastCause = cause;
    p.respawnT = CFG.RESPAWN_DELAY;
    p.slow = 0;
    var x = p.x(), y = p.y(), r = playerRadius();
    if (p.human) {
      Run.collisions++;
      Sound.play('hit');
      VFX.addShake(13);
      App.set(ST.RESPAWNING);
    } else if (p.onCamera()) {
      Sound.play('hitFar');
      VFX.addShake(3);
    }
    if (p.onCamera()) {
      var n = p.human ? 26 : 14;
      VFX.burst(x, y, n, { color: '#000', spMin: 120, spMax: 420, sizeMin: 2, sizeMax: 5.5, lifeMax: .75 });
      VFX.ripple(x, y, r * 0.6, r * 4.2, '#000', .5, 3);
      VFX.ripple(x, y, r * 0.6, r * 3.4, p.marbleDef().color, .42, 2.2);
      if (cause === 'edge') VFX.ripple(x, y, r * 0.6, r * 2.6, accent(1), .32, 1.5);
    }
  },

  /* how much clear track a lane offers this racer, in metres */
  clearance: function (p, lane) {
    var best = 60;
    var list = Obstacles.list;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (!o.harmful || !o.blocks(lane)) continue;
      if (o.wd + o.hM < p.d) continue;                 /* already behind */
      var gap = o.wd - p.d - p.radiusM();
      if (gap < 0) gap = 0;
      if (o.crouch) gap = gap * 2 + 6;                 /* duckable is barely a threat */
      if (gap < best) best = gap;
    }
    /* another racer sitting there is not somewhere to appear */
    if (this.beside(p, lane)) best = Math.min(best, 1);
    return best;
  },

  /* A racer comes back exactly where it went down, wrapped in a bubble. The
     bubble is what makes that safe: nothing can touch it, and it carries the
     racer into open track before setting it down. */
  tryRespawn: function (p) {
    /* back in the column it went down in — picking a better one would be a
       decision made on the racer's behalf, and the bubble covers the safety */
    var d = p.d, lane = p.lane;
    p.place(lane);
    p.d = d;
    p.spawnT = 0;
    p.immune = CFG.IMMUNITY_TIME;
    p.immuneExt = 0;
    p.floating = true;
    p.bubble = CFG.BUBBLE_TIME;
    p.bubbleAge = 0; p.landing = 0;
    p.rollHold = d;                 /* the angle it left the ground at */
    if (p.human) {
      Sound.play('respawn');
      App.set(ST.PLAYING);
    }
    if (p.onCamera()) {
      var x = p.x(), y = p.y(), r = playerRadius();
      VFX.ripple(x, y, r * 3.0, r * 1.2, BUBBLE_INK, .5, 2.2);
    }
    return true;
  },

  /* The bubble makes no decisions. It lifts the racer over the top of the
     track, keeps everything off them while it carries them, and lets go once
     there is somewhere to land — where they steer it is their own business. */
  carryBubble: function (p, dt) {
    p.bubbleAge += dt;

    if (p.landing > 0) {                       /* on the way down */
      p.landing = Math.max(0, p.landing - dt);
      if (p.landing <= 0) this.popBubble(p);
      return;
    }
    if (p.bubble > 0) {
      p.bubble = Math.max(0, p.bubble - dt);
      if (p.bubble > 0) return;              /* still inside the guaranteed carry */
    }

    /* the carry is up: wait for open track underneath, but never hang on */
    var room = CFG.BASE_SPEED * Run.mult * CFG.LAND_LEAD;
    if (p.bubbleAge < CFG.BUBBLE_MAX && this.clearance(p, p.lane) < room) return;
    p.landing = CFG.BUBBLE_DROP;
  },
  popBubble: function (p) {
    p.floating = false; p.bubble = 0; p.landing = 0; p.bubbleAge = 0;
    /* however long it floated, the racer lands with the usual moment of grace */
    p.immune = Math.max(p.immune, CFG.IMMUNITY_TIME * 0.5);
    if (!p.onCamera()) return;
    var x = p.x(), y = p.y(), r = playerRadius();
    if (p.human) Sound.play('pop'); else Sound.play('popFar');
    for (var i = 0; i < (Settings.reduced ? 3 : 9); i++) {
      var a = rand(0, TAU), sp = rand(70, 240);
      VFX.parts.push({
        x: x + Math.cos(a) * r * 1.7, y: y + Math.sin(a) * r * 1.7,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(.25, .5), size: rand(1.4, 3.2),
        color: BUBBLE_INK, drag: 2.2, grav: 0, streak: false, a0: .8
      });
    }
  },

  /* is this racer inside — or about to be inside — something lethal? */
  dangerNow: function (p) {
    if (!p.alive) return false;
    var near = Obstacles.near(p.d, 3, 2);
    for (var i = 0; i < near.length; i++) {
      var o = near[i];
      if (!o.harmful) continue;
      if (o.crouch && p.crouch) continue;
      if (racerHits(p, o)) return true;
      if (!o.crouch && o.blocks(p.lane)) {
        var gap = o.wd - p.d - p.radiusM();
        if (gap > 0 && gap < 2.5) return true;
      }
    }
    return false;
  },

  /* ---------- per frame ---------- */
  tickClock: function (dt) { this.clock += dt; },

  update: function (dt, mult) {
    var i, p;

    /* decisions first, so every racer moves on the same world state */
    for (i = 0; i < this.racers.length; i++) {
      p = this.racers[i];
      if (p.finished) continue;
      if (p.inBubble()) { this.carryBubble(p, dt); continue; }   /* hands off, both ways */
      if (p.ai && p.alive) AI.think(p, dt);
    }

    /* then movement, collisions and respawns */
    for (i = 0; i < this.racers.length; i++) {
      p = this.racers[i];
      /* over the line: out of play, rolling out onto the mark its place
         earned rather than racing for one it can no longer take */
      if (p.finished) { Run.rollOut(p, dt); continue; }

      var fromD = p.d;
      p.d += CFG.BASE_SPEED * mult * p.speedScale() * dt;
      p.update(dt, true);

      if (p.alive && !p.inBubble()) {        /* over the top of all of it */
        var near = Obstacles.near(p.d, 2, p.star > 0 ? 2 + p.d - fromD : 2);
        for (var k = 0; k < near.length; k++) {
          var o = near[k];
          if (!o.harmful) {
            /* Pads act once per racer; mystery squares leave the world on contact. */
            if (!o.seen[p.id] && racerHits(p, o)) {
              o.seen[p.id] = 1;
              if (o.kind === 'mystery') this.mysteryTake(p, o);
              else this.shoveForward(p, o);
            }
            continue;
          }
          if (p.star > 0) {
            if (racerHits(p, o, fromD)) {
              var hazardIndex = Obstacles.list.indexOf(o);
              if (hazardIndex >= 0) {
                Obstacles.list.splice(hazardIndex, 1);
                this.breakUp(o, p);
              }
            }
            continue;
          }
          if (p.immune > 0) continue;
          if (o.crouch && p.crouch) continue;
          if (racerHits(p, o)) {
            if (o.kind === 'falseMystery') {
              var trapIndex = Obstacles.list.indexOf(o);
              if (trapIndex < 0) continue;
              Obstacles.list.splice(trapIndex, 1);
              this.breakUp(o, null);
            }
            this.destroy(p, 'hazard'); break;
          }
        }
      }
      /* Collision protection covers the movement just simulated. Pauses and
         resume countdowns do not spend any of the five active seconds. */
      if (p.star > 0) {
        p.star = Math.max(0, p.star - dt);
        if (p.star < 1e-9) { p.star = 0; this.starSpent(p); }
      }
      if (!p.alive) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) this.tryRespawn(p);
      }
    }

    /* two racers must never settle into the same column at the same distance */
    this.separate();
    if (!this.camLock) this.camD = this.human.d;
    this.rank();
  },

  /* if a shove and a slowdown ever leave two racers overlapping in the same
     column, ease them apart along the track rather than letting them merge */
  separate: function () {
    for (var i = 0; i < this.racers.length; i++) {
      var a = this.racers[i];
      if (!a.alive || a.finished || a.inBubble() || a.star > 0) continue;
      for (var j = i + 1; j < this.racers.length; j++) {
        var b = this.racers[j];
        if (!b.alive || b.finished || b.inBubble() || b.star > 0) continue;
        if (a.lane !== b.lane) continue;
        var gap = a.d - b.d;
        var need = (a.radiusM() + b.radiusM()) * 0.92;
        if (Math.abs(gap) >= need) continue;
        var push = (need - Math.abs(gap)) * 0.5;
        var s = gap === 0 ? (a.id < b.id ? 1 : -1) : (gap > 0 ? 1 : -1);
        a.d += push * s; b.d -= push * s;
      }
    }
  }
};
