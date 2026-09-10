'use strict';

/* ============================================================================
   8. THE WORLD — one canonical course, measured in metres

   Everything on the track lives at a world distance, not at a screen position.
   A racer at world distance d meets the hazard at 250 m when, and only when,
   that racer's own d reaches 250. The camera is a separate concern: it rides
   the human racer, and the mapping below is the only place the two meet.
   ========================================================================== */
function yNof(wd) { return CFG.PLAYER_Y - (wd - Race.camD) / CFG.METERS_VISIBLE; }
function screenY(wd) { return PF.y + yNof(wd) * PF.h; }
function metresToPx(m) { return m / CFG.METERS_VISIBLE * PF.h; }
function pxToMetres(px) { return px / PF.h * CFG.METERS_VISIBLE; }
function laneCenterF(l) { return (l + 0.5) / 3; }

/* wd  : world distance of the near edge — the first part a racer meets
   hM  : length along the track, in metres
   cxF : centre, fraction of playfield width      wF : width, same units      */
function Obstacle(kind, cxF, wF, hM, crouch, lanes, wd) {
  this.kind = kind; this.cxF = cxF; this.wF = wF; this.hM = hM;
  this.crouch = !!crouch; this.lanes = lanes; this.wd = wd;
  this.move = null;               /* set for moving squares */
  this.lastCxF = cxF;
  this.harmful = true;            /* false for the boost pad, which helps you */
  this.flash = 0;                 /* a pad lights up for a moment when it fires */
  this.seen = {};                 /* which racers this one has already acted on */
}
/* Moving squares travel between two neighbouring columns, so the third column
   is always a guaranteed way through. Their position is a function of the
   shared race clock and their own phase — never of any one racer — so all six
   racers see the same hazard in the same column at the same instant. */
Obstacle.prototype.advance = function () {
  var m = this.move;
  if (!m) return;
  this.lastCxF = this.cxF;
  var k = 0.5 - 0.5 * Math.cos((Race.clock / m.period + m.phase) * TAU);
  this.cxF = lerp(laneCenterF(m.a), laneCenterF(m.b), k);
};
Obstacle.prototype.rect = function () {
  var w = this.wF * PF.w;
  return { x: PF.x + this.cxF * PF.w - w / 2, y: screenY(this.wd + this.hM),
    w: w, h: metresToPx(this.hM) };
};
Obstacle.prototype.blocks = function (lane) { return this.lanes.indexOf(lane) >= 0; };

/* The rare pad's two colours, and the ramp that runs between them. A sample is
   taken at a position along the pad plus a phase, so a gradient built from a
   run of samples reads as one band of colour travelling the length of it. The
   cosine keeps the ends of a cycle equal, so the band never snaps back. */
var SUPER_PURPLE = [164, 53, 245], SUPER_BLUE = [22, 139, 255];
function superRGB(p) {
  var k = 0.5 - 0.5 * Math.cos(p * TAU);
  return Math.round(lerp(SUPER_PURPLE[0], SUPER_BLUE[0], k)) + ',' +
         Math.round(lerp(SUPER_PURPLE[1], SUPER_BLUE[1], k)) + ',' +
         Math.round(lerp(SUPER_PURPLE[2], SUPER_BLUE[2], k));
}
/* how far the band has travelled: off the shared race clock, so every racer
   sees the same colours at the same instant. Reduced motion holds it still. */
function superPhase() { return Settings.reduced ? 0 : Race.clock * 0.42; }

var Obstacles = {
  list: [],
  clear: function () { this.list.length = 0; },

  /* factory: sizes derive from the column width, so they scale everywhere */
  spawn: function (entry, wd) {
    if (wd === undefined) wd = Race.camD + CFG.METERS_VISIBLE * CFG.PLAYER_Y + 2;
    var colM = pxToMetres(colW());     /* one column width, in metres */
    var out = [];
    if (entry.kind === 'square') {
      out.push(new Obstacle('square', laneCenterF(entry.lane), 0.78 / 3, colM * 0.78, false, [entry.lane], wd));
    } else if (entry.kind === 'twin') {
      for (var i = 0; i < entry.lanes.length; i++) {
        var l = entry.lanes[i];
        out.push(new Obstacle('square', laneCenterF(l), 0.78 / 3, colM * 0.78, false, [l], wd));
      }
    } else if (entry.kind === 'bar2') {
      out.push(new Obstacle('bar2', (entry.lane + 1) / 3, 1.88 / 3, colM * 0.54, entry.crouch,
        [entry.lane, entry.lane + 1], wd));
    } else if (entry.kind === 'bar3') {
      out.push(new Obstacle('bar3', 0.5, 1, colM * 0.50, true, [0, 1, 2], wd));
    } else if (entry.kind === 'boost' || entry.kind === 'superBoost') {
      var strong = entry.kind === 'superBoost';
      var bs = new Obstacle(entry.kind, laneCenterF(entry.lane), (strong ? 0.42 : 0.58) / 3,
        colM * (strong ? 0.42 : 1.15),
        false, [entry.lane], wd);
      bs.harmful = false;
      out.push(bs);
    } else if (entry.kind === 'mover' || entry.kind === 'shuttle') {
      var mv = new Obstacle('mover', laneCenterF(entry.lane),
        0.74 / 3, colM * 0.74, false, entry.lanes, wd);
      mv.move = { a: entry.lane, b: entry.to, phase: Math.random(),
        period: entry.kind === 'shuttle' ? CFG.SHUTTLE_PERIOD : CFG.MOVER_PERIOD };
      out.push(mv);
    }
    for (var j = 0; j < out.length; j++) this.list.push(out[j]);
    return out;
  },

  /* the world only advances its own moving parts; nothing here depends on any
     racer's position, and nothing is thrown away until every racer is past */
  update: function (dt) {
    var behind = Race.trailD() - 12;
    for (var i = this.list.length - 1; i >= 0; i--) {
      var o = this.list[i];
      o.advance();
      if (o.flash > 0) o.flash = Math.max(0, o.flash - dt);
      if (o.wd + o.hM < behind) this.list.splice(i, 1);
    }
  },

  /* the hazards a racer could be touching or about to touch */
  near: function (d, ahead, behind) {
    var out = [];
    for (var i = 0; i < this.list.length; i++) {
      var o = this.list[i];
      if (o.wd > d + ahead) continue;
      if (o.wd + o.hM < d - (behind || 3)) continue;
      out.push(o);
    }
    return out;
  },

  draw: function () {
    var top = Race.camD + CFG.METERS_VISIBLE * (CFG.PLAYER_Y + 0.1);
    var bot = Race.camD - CFG.METERS_VISIBLE * (1.1 - CFG.PLAYER_Y);
    for (var i = 0; i < this.list.length; i++) {
      var o = this.list[i];
      if (o.wd > top || o.wd + o.hM < bot) continue;      /* off camera */
      var r = o.rect();
      /* a moving square drags a short afterimage so its travel reads instantly */
      if (o.move && !Settings.reduced) {
        var d = o.cxF - o.lastCxF;
        if (Math.abs(d) > 1e-5) {
          ctx.fillStyle = '#000';
          for (var g = 1; g <= 3; g++) {
            ctx.globalAlpha = 0.13 - g * 0.03;
            ctx.fillRect(r.x - d * PF.w * g * 3.2, r.y, r.w, r.h);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (!o.harmful) { this.drawBoost(o, r); continue; }
      ctx.fillStyle = '#000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (o.crouch) this.drawChevrons(o, r);
    }
  },
  /* yellow pads and compact purple-blue pads share the forward chevrons */
  drawBoost: function (o, r) {
    var strong = o.kind === 'superBoost';
    var phase = strong ? superPhase() : 0;
    /* the small pad's whole presence — halo included — is that travelling band */
    var rgb = strong ? superRGB(0.25 - phase) : '245,197,24';
    /* a glow around it, so it is worth spotting from further up the track */
    if (!Settings.reduced) {
      var pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(Race.clock * 4.2 + o.wd));
      var spread = r.w * 0.75;
      var halo = ctx.createRadialGradient(
        r.x + r.w / 2, r.y + r.h / 2, r.w * 0.3,
        r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + spread);
      halo.addColorStop(0, 'rgba(' + rgb + ',' + (0.40 * pulse).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = halo;
      ctx.fillRect(r.x - spread, r.y - spread, r.w + spread * 2, r.h + spread * 2);
    }

    var g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
    if (strong) {
      /* purple running into blue down the face of the pad, the whole ramp
         sliding along it as the clock turns */
      for (var st = 0; st <= 8; st++) {
        var sf = st / 8;
        g.addColorStop(sf, 'rgb(' + superRGB(sf * 0.5 - phase) + ')');
      }
    } else {
      g.addColorStop(0, '#FFE680');
      g.addColorStop(0.42, BOOST_INK);
      g.addColorStop(1, '#D89400');
    }
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    /* a highlight travelling across the face, off the shared clock so every
       racer sees the same glint at the same moment */
    if (!Settings.reduced) {
      var k = (Race.clock * 0.7) % 1;
      var bx = r.x - r.w * 0.7 + k * r.w * 2.4;
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = strong ? '#EEE8FF' : '#FFFBE0';
      ctx.beginPath();
      ctx.moveTo(bx, r.y + r.h);
      ctx.lineTo(bx + r.w * 0.20, r.y + r.h);
      ctx.lineTo(bx + r.w * 0.50, r.y);
      ctx.lineTo(bx + r.w * 0.30, r.y);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* just fired: the whole face lights up and fades back down */
    if (o.flash > 0) {
      var f = o.flash / CFG.BOOST_FLASH;
      ctx.globalAlpha = 0.85 * f;
      ctx.fillStyle = strong ? '#F3ECFF' : '#FFFDEB';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    }

    var lw = Math.max(1.4, r.w * 0.05);
    ctx.strokeStyle = '#000'; ctx.lineWidth = lw;
    ctx.strokeRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw);

    /* arrows stacked up the length of it, pointing the way you are going */
    var cx = r.x + r.w / 2;
    var aw = r.w * 0.24, ah = r.w * 0.20, gap = r.h * 0.26;
    ctx.strokeStyle = strong ? '#FFF' : '#000';
    ctx.lineWidth = Math.max(2, r.w * 0.09);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var cy = r.y + r.h * 0.5 + (i - 1) * gap + ah * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - aw, cy); ctx.lineTo(cx, cy - ah); ctx.lineTo(cx + aw, cy);
      ctx.stroke();
    }
  },
  /* redrawn over a ducking racer so it genuinely reads as passing underneath */
  drawOverhead: function () {
    for (var n = 0; n < Race.racers.length; n++) {
      var p = Race.racers[n];
      if (!p.alive || p.crouchAmt < 0.02 || !p.onCamera()) continue;
      var b = p.box(), top = b.y - b.ry * 2.2, bot = b.y + b.ry * 2.2;
      for (var i = 0; i < this.list.length; i++) {
        var o = this.list[i];
        if (!o.crouch) continue;
        var r = o.rect();
        if (r.y > bot || r.y + r.h < top) continue;
        ctx.fillStyle = '#000';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        this.drawChevrons(o, r);
      }
    }
  },
  /* white chevrons = "you may pass under this by crouching" */
  drawChevrons: function (o, r) {
    var n = o.kind === 'bar3' ? 3 : 2;
    var cw = Math.min(r.w / (n + 1), colW()) * 0.30;
    var ch = cw * 0.62;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, cw * 0.26);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var cx = r.x + r.w * (i + 0.5) / n;
      var cy = r.y + r.h * 0.5 - ch * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - cw, cy); ctx.lineTo(cx, cy + ch); ctx.lineTo(cx + cw, cy);
      ctx.stroke();
    }
  }
};
