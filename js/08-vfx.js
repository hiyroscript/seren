'use strict';

/* ============================================================================
   7. VFX — particles, ripples, speed lines, screen shake
   ========================================================================== */
var VFX = {
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
  whoosh: function (r, near) {
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
      this.ripple(near.x, near.y, playerRadius() * 0.9, playerRadius() * 2.6, accent(1), .34, 1.6);
      this.burst(near.x, near.y, 6, { color: accent(1), spMin: 60, spMax: 220,
        sizeMax: 2.6, lifeMax: .32, streak: true });
    }
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
    this.parts.length = 0; this.ripples.length = 0; this.lines.length = 0;
    this.dashes.length = 0; this.shake = 0; this.moteAcc = 0;
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
    /* exactly the speed of the ground, boosts and all: nothing on screen may
       exaggerate, or lag behind, the multiplier the HUD is reporting */
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
