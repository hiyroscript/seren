'use strict';

/* ============================================================================
   7. VFX — particles, ripples, speed lines, screen shake
   ========================================================================== */
var VFX = {
  pickups: [],
  parts: [], ripples: [], lines: [], shake: 0, shakeT: 0, moteAcc: 0,

  scale: function () { return Settings.reduced ? 0.35 : 1; },


  /* everything that belongs to the track scrolls with it */
  scrollWorld: function (dy) {
    var i;
    for (i = 0; i < this.parts.length; i++) if (this.parts[i].w) this.parts[i].y += dy;
    for (i = 0; i < this.ripples.length; i++) if (this.ripples[i].w) this.ripples[i].y += dy;
  },

  /* ---- ambient specks: texture in the empty track, never noise ---- */
  motes: function (dt, mult) {
    if (Settings.reduced) return;
    /* mult is the speed the ground is actually running at, which is zero while
       a dead racer waits: no ground moving, no specks laid down */
    this.moteAcc += Math.max(0, 5 + (mult - 1) * 9) * dt;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      this.parts.push({
        x: PF.x + rand(4, PF.w - 4), y: PF.y - rand(4, 30),
        vx: rand(-8, 8), vy: rand(10, 40), life: 0, max: rand(1.6, 2.6),
        size: rand(1, 2.3), color: '#000', drag: 0.2, grav: 0, streak: false,
        a0: rand(.10, .22), w: true
      });
    }
  },
  /* ---- an obstacle sweeping past the player ---- */
  whoosh: function (r, near, ducked) {
    if (Settings.reduced) return;
    var y = r.y + r.h * 0.5;
    for (var side = 0; side < 2; side++) {
      var x = side ? r.x + r.w : r.x;
      this.parts.push({
        x: x, y: y, vx: (side ? 1 : -1) * rand(120, 260), vy: rand(-30, 30),
        life: 0, max: rand(.18, .3), size: rand(1.6, 3), color: '#000',
        drag: 3.4, grav: 0, streak: true, a0: .5
      });
    }
    if (near) {
      if (!ducked) this.ripple(near.x, near.y, playerRadius() * 0.9, playerRadius() * 2.6, accent(1), .34, 1.6);
      this.burst(near.x, near.y, 6, { color: accent(1), spMin: 60, spMax: 220,
        sizeMax: 2.6, lifeMax: .32, streak: true });
    }
  },

  /* ---- a hazard coming apart ----
     Ink on this track is never simply deleted: a hazard that is destroyed
     breaks. Its face is split into shards that fly out of it, spinning and
     falling with the ground they broke on, and a ring goes out through the
     track in the colour of whatever broke it. Every piece is a world particle,
     so the wreckage scrolls away with the course rather than hanging in the
     air where the camera happens to be looking. */
  smash: function (o, opt) {
    opt = opt || {};
    var r = o.rect ? o.rect() : o;
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    /* the rings are measured against a column, never against the hazard: a
       barrier across the whole track would otherwise throw a ring the width of
       the playfield and read as the world ending rather than as a wall going */
    var span = clamp(Math.max(r.w, r.h), colW() * 0.5, colW()), ink = opt.ink || '#000';
    this.ripple(cx, cy, span * 0.22, span * 1.30, ink, .34, 2.6);
    if (opt.color) this.ripple(cx, cy, span * 0.16, span * 1.05, opt.color, .46, 3.4);
    this.burst(cx, cy, 10, { color: opt.color || ink, spMin: 110, spMax: 380,
      sizeMax: 3.2, lifeMax: .5, streak: true, world: true });
    if (Settings.reduced) return;

    /* the face, cut into pieces: never finer than a few px on a phone, and
       never coarser than a few pieces across, whatever shape the hazard is */
    var cell = Math.max(5, Math.min(r.w, r.h) * 0.36);
    var cols = clamp(Math.round(r.w / cell), 1, 8);
    var rows = clamp(Math.round(r.h / cell), 1, 4);
    var sw = r.w / cols, sh = r.h / rows;
    for (var iy = 0; iy < rows; iy++) {
      for (var ix = 0; ix < cols; ix++) {
        var px = r.x + sw * (ix + 0.5), py = r.y + sh * (iy + 0.5);
        var off = Math.hypot(px - cx, py - cy);
        var a = off < 1 ? rand(0, TAU) : Math.atan2(py - cy, px - cx) + rand(-.5, .5);
        var sp = rand(50, 130) * (0.6 + off / Math.max(1, span));
        this.parts.push({
          x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(20, 90),
          life: 0, max: rand(.28, .5), size: 0, color: ink,
          drag: 2.1, grav: rand(240, 460), a0: .85, w: true,
          shard: true, sw: sw * rand(.58, .88), sh: sh * rand(.58, .88),
          rot: rand(0, TAU), spin: rand(-8, 8)
        });
      }
    }
  },
  /* ---- the star's sparks: its own light, not the pad's streaks ---- */
  twinkle: function (x, y, opt) {
    opt = opt || {};
    this.parts.push({
      x: x, y: y, vx: opt.vx || 0, vy: opt.vy || 0,
      life: 0, max: rand(opt.lifeMin || .26, opt.lifeMax || .5),
      size: rand(opt.sizeMin || 2.4, opt.sizeMax || 5.2),
      color: opt.color || '#fff', drag: opt.drag === undefined ? 1.5 : opt.drag,
      grav: 0, a0: opt.a0 === undefined ? .95 : opt.a0, w: opt.world !== false,
      spark: true, rot: rand(0, TAU), spin: rand(-5, 5)
    });
  },

  burst: function (x, y, n, opt) {
    opt = opt || {};
    n = Math.max(1, Math.round(n * this.scale()));
    for (var i = 0; i < n; i++) {
      var a = opt.dir !== undefined ? opt.dir + rand(-0.9, 0.9) : rand(0, TAU);
      var sp = rand(opt.spMin || 90, opt.spMax || 320);
      this.parts.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: rand(opt.lifeMin || .3, opt.lifeMax || .7),
        size: rand(opt.sizeMin || 2, opt.sizeMax || 5),
        color: opt.color || '#000', drag: opt.drag || 2.6,
        grav: opt.grav || 0, streak: !!opt.streak, a0: opt.a0, w: !!opt.world
      });
    }
  },
  ripple: function (x, y, r0, r1, color, dur, width) {
    this.ripples.push({ x: x, y: y, r0: r0, r1: r1, t: 0,
      dur: dur || .55, color: color || '#000', w: width || 2 });
  },
  /* ---- the dash a marble throws off as it crosses to another column ----
     A single horizontal streak, laid from the column it left to its own
     trailing edge. It exists only for the switch and the moment after it. */
  dashes: [],
  /* the dash is handed back to the racer that started it: six racers change
     column at once, and a single shared "live" dash meant all but the last of
     them stopped being followed and never got drawn */
  startDash: function (x, y, dir, r, color) {
    var d = { x0: x, x1: x, y: y, dir: dir, r: r, t: 0, max: CFG.DASH_TIME,
      color: color || marble().color };
    this.dashes.push(d);
    if (this.dashes.length > 12) this.dashes.shift();
    return d;
  },
  drawDashes: function () {
    if (!this.dashes.length) return;
    for (var i = 0; i < this.dashes.length; i++) {
      var d = this.dashes[i], f = 1 - d.t / d.max;
      ctx.fillStyle = d.color;
      var head = d.x1 - d.dir * d.r * 0.82;      /* the marble's trailing edge */
      if ((head - d.x0) * d.dir <= 1) continue;  /* nothing to draw yet */
      var hh = d.r * 0.42 * (0.32 + 0.68 * f);   /* thins as it goes */
      var th = hh * 0.16;
      ctx.globalAlpha = 0.58 * f * f;
      ctx.beginPath();
      ctx.moveTo(d.x0, d.y - th);
      ctx.lineTo(head, d.y - hh);
      ctx.lineTo(head, d.y + hh);
      ctx.lineTo(d.x0, d.y + th);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  addShake: function (m) { if (Settings.reduced) return; this.shake = Math.max(this.shake, m); },

  update: function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      var d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = this.ripples.length - 1; i >= 0; i--) {
      var r = this.ripples[i]; r.t += dt;
      if (r.t >= r.dur) this.ripples.splice(i, 1);
    }
    for (i = this.dashes.length - 1; i >= 0; i--) {
      var d = this.dashes[i]; d.t += dt;
      if (d.t >= d.max) this.dashes.splice(i, 1);
    }
    for (i = this.lines.length - 1; i >= 0; i--) {
      var l = this.lines[i]; l.y += l.v * dt; l.life += dt;
      if (l.life > l.max || l.y > PF.y + PF.h + 100) this.lines.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 26);
  },
  clear: function () {
    this.pickups.length = 0;
    this.parts.length = 0; this.ripples.length = 0; this.lines.length = 0;
    this.dashes.length = 0; this.shake = 0; this.moteAcc = 0;
  },

  drawPickups: function () {
    for (var i = this.pickups.length - 1; i >= 0; i--) {
      var p = this.pickups[i], k = (Race.clock - p.start) / 0.55;
      if (k >= 1) { this.pickups.splice(i, 1); continue; }
      var slot = itemSlotRect(), size = p.wF * PF.w;
      var x = PF.x + p.cxF * PF.w, y = screenY(p.wd + p.hM / 2);
      if (p.human && !Settings.reduced) {
        var f = easeOutCubic(k);
        x = lerp(x, slot.x + slot.w / 2, f);
        y = lerp(y, slot.y + slot.h / 2, f);
      }
      ctx.save();
      ctx.globalAlpha = 1 - k;
      var s = Settings.reduced ? size : size * (1 + Math.sin(k * PI) * .25);
      Obstacles.drawMystery({ wd: p.wd, kind: 'mystery' },
        { x: x - s / 2, y: y - s / 2, w: s, h: s });
      ctx.restore();
    }
  },
  drawParticles: function () {
    var i, p, a;
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i];
      a = 1 - p.life / p.max;
      ctx.globalAlpha = a * (p.a0 === undefined ? 1 : p.a0);
      ctx.fillStyle = p.color;
      if (p.streak) {
        var len = clamp(Math.hypot(p.vx, p.vy) * 0.035, 3, 40);
        var ang = Math.atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
        ctx.fillRect(-len, -p.size * 0.35, len, p.size * 0.7);
        ctx.restore();
      } else if (p.shard) {
        /* a piece of something broken: it keeps its own size and turns as it
           falls, so the wreckage reads as the hazard rather than as dust */
        var w = p.sw * (0.45 + a * 0.55), h = p.sh * (0.45 + a * 0.55);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.spin * p.life);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      } else if (p.spark) {
        /* a four-point twinkle rather than a dot: the star's light reads as
           its own even when a single speck of it is all that is left */
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.spin * p.life);
        starPath(0, 0, p.size * a * 1.6, 0.34, 0, 4);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
  drawRipples: function () {
    for (var i = 0; i < this.ripples.length; i++) {
      var r = this.ripples[i], k = r.t / r.dur;
      ctx.globalAlpha = (1 - k) * (r.fade ? .32 : .8);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.w * (1 - k * .5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, easeOutCubic(k)), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  drawSpeedLines: function () {
    for (var i = 0; i < this.lines.length; i++) {
      var l = this.lines[i];
      ctx.strokeStyle = l.c;
      ctx.globalAlpha = l.a * (1 - l.life / l.max);
      ctx.lineWidth = l.w;
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, l.y + l.len); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  spawnSpeedLine: function (mult) {
    if (Settings.reduced) return;
    /* exactly the speed of the ground, boosts and all: a streak that ran at
       some pace of its own would read as the track lying about how fast it
       is moving */
    var world = Run.speedN() * PF.h;               /* pixels per second of the world */
    var hot = ACCENT && Math.random() < 0.34;
    this.lines.push({
      x: PF.x + rand(6, PF.w - 6), y: PF.y - rand(20, 140),
      len: rand(20, 80) * clamp(0.6 + mult * 0.5, 0.6, 2.6), v: world,
      a: hot ? rand(.20, .42) : rand(.05, .13),
      w: hot ? rand(1, 2.2) : rand(.7, 1.4),
      c: hot ? accent(1, 56) : '#000', life: 0, max: 2.2
    });
  }
};
