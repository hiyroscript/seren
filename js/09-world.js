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
/* the stretch of course the camera can see, with a little margin either end */
function cameraSpan() {
  return { top: Race.camD + CFG.METERS_VISIBLE * (CFG.PLAYER_Y + 0.1),
           bot: Race.camD - CFG.METERS_VISIBLE * (1.1 - CFG.PLAYER_Y) };
}
/* whether this one is in it — the same test the draw loop makes, for the
   things that happen to a single obstacle rather than to all of them */
Obstacle.prototype.onCamera = function () {
  var s = cameraSpan();
  return this.wd <= s.top && this.wd + this.hM >= s.bot;
};

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
  nextFall: CFG.FALL_LEAD,
  clear: function () { this.list.length = 0; this.nextFall = CFG.FALL_LEAD; },

  /* factory: sizes derive from the column width, so they scale everywhere */
  spawn: function (entry, wd) {
    if (wd === undefined) wd = Race.camD + CFG.METERS_VISIBLE * CFG.PLAYER_Y + 2;
    var colM = pxToMetres(colW());     /* one column width, in metres */
    var out = [];
    if (entry.kind === 'fallingSquare') {
      var fs = new Obstacle('fallingSquare', laneCenterF(entry.lane), CFG.FALL_SIZE / 3,
        colM * CFG.FALL_SIZE, false, [entry.lane], wd);
      fs.fall = fs.fallMax = clamp(entry.fall || 2, .9, 3.2);
      fs.blast = 0;
      out.push(fs);
    } else if (entry.kind === 'square') {
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
    } else if (entry.kind === 'mystery') {
      /* compact, single-use pickup on the same canonical course as hazards */
      var my = new Obstacle('mystery', laneCenterF(entry.lane), CFG.MYSTERY_SIZE / 3,
        colM * CFG.MYSTERY_SIZE, false, [entry.lane], wd);
      my.harmful = false;
      my.expiresAt = Race.clock + CFG.MYSTERY_LIFETIME;
      out.push(my);
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
     racer's position, and pickups expire on the race clock; other entries stay until every racer is past */
  update: function (dt) {
    var behind = Race.trailD() - 12;
    for (var i = this.list.length - 1; i >= 0; i--) {
      var o = this.list[i];
      o.advance();
      if (o.kind === 'fallingSquare') {
        if (o.fall > 0) {
          o.fall = Math.max(0, o.fall - dt);
          if (o.fall === 0) { o.blast = .4; Race.breakUp(o, null); }
        } else {
          o.blast -= dt;
          if (o.blast <= 0) { this.list.splice(i, 1); continue; }
        }
      }
      if (o.flash > 0) o.flash = Math.max(0, o.flash - dt);
      if ((o.kind === 'mystery' && Race.clock >= o.expiresAt) ||
          o.wd + o.hM < behind) this.list.splice(i, 1);
    }
  },

  /* ------------------------------------------------------------------
     LOOSE SQUARES — the two things that are dropped onto the course rather
     than authored into it. A mystery square and a falling square arrive the
     same way: on their own clock, in any column, anywhere along the stretch
     the field is actually running, and only where there is room. The three
     routines below are that shared behaviour; Mysteries in the generator and
     rain() just below both go through them.
     ------------------------------------------------------------------ */

  /* how much track a square that will hurt keeps clear of any hazard, in
     metres at the speed the course is running: measured in seconds of travel,
     so it means the same thing at 1.00x as it does at the ceiling */
  clearM: function () { return CFG.FALL_CLEAR * CFG.BASE_SPEED * Run.mult; },

  /* the stretch one may appear on: from a little ahead of the racer at the
     back — anything behind that is ground nobody covers again, and the world
     sweeps it up — to the far edge of the authored course, and never past the
     run-in the finish line reserves for itself */
  band: function (hM, clearRow) {
    var lo = Race.trailD() + CFG.DROP_TAIL;
    var hi = Math.min(Race.leadD() + CFG.WORLD_AHEAD, Gen.limit);
    if (Run.line) hi = Math.min(hi, Run.line.d - CFG.LINE_CLEAR);
    /* one that will hurt stops short of the generator's frontier as well: the
       next authored row lands there, and the generator knows nothing of what
       has been dropped, so a square any nearer could be crowded by a hazard
       written after it */
    if (clearRow && Gen.enabled) hi = Math.min(hi, Gen.frontier - this.clearM());
    hi -= hM;
    return hi > lo ? { lo: lo, hi: hi } : null;
  },
  /* nothing is dropped on top of anything: not a hazard, not another pickup,
     and not a racer, which would be handed a square it never steered for.
     One that will hurt asks for more than its own footprint — the whole row,
     and clear track either side of it, because a square landing beside an
     authored hazard could close the last column anybody had left. */
  roomAt: function (wd, hM, lane, clearRow) {
    var i, list = this.list, pad = hM * 1.2, clear = clearRow ? this.clearM() : 0;
    for (i = 0; i < list.length; i++) {
      var o = list[i];
      var room = o.harmful ? Math.max(pad, clear) : pad;
      if (o.wd - room > wd + hM || o.wd + o.hM + room < wd) continue;
      if (clearRow && o.harmful) return false;
      if (o.blocks(lane)) return false;
    }
    for (i = 0; i < Race.racers.length; i++) {
      var p = Race.racers[i];
      if (p.finished || p.lane !== lane) continue;
      if (Math.abs(p.d - (wd + hM / 2)) < p.radiusM() + hM) return false;
    }
    return true;
  },
  /* twelve tries at a column and a place on that stretch; the first that has
     room takes the square. `make` turns the column it found into an entry. */
  drop: function (hM, clearRow, make) {
    var b = this.band(hM, clearRow);
    if (!b) return false;
    for (var i = 0; i < 12; i++) {
      var lane = randInt(0, 2), wd = rand(b.lo, b.hi);
      if (!this.roomAt(wd, hM, lane, clearRow)) continue;
      this.spawn(make(lane), wd);
      /* it can land anywhere along the course, and the course is read in
         order — so the list is put back in order behind it */
      this.list.sort(function (a, c) { return a.wd - c.wd; });
      return true;
    }
    return false;
  },

  /* Like Redline's meteors: a fixed road mark and an independent fall clock.
     Where one lands is aimed at nobody — it is weather, dropped onto the live
     course exactly as a mystery square is, and often enough that a clear
     stretch of track is never a promise. Nowhere clear to put one this instant
     is not a square skipped: the next moment is another place to try. */
  rain: function () {
    if (Race.clock < this.nextFall) return;
    var hM = pxToMetres(colW()) * CFG.FALL_SIZE;
    if (this.drop(hM, true, function (lane) {
      return { kind: 'fallingSquare', lane: lane, fall: rand(.9, 3.2) };
    })) this.nextFall = Race.clock + rand(CFG.FALL_GAP_MIN, CFG.FALL_GAP_MAX);
    else this.nextFall = Race.clock + 0.5;
  },

  drawFalling: function (o, r) {
    var x = r.x + r.w / 2, y = r.y + r.h / 2;
    ctx.save();
    if (o.fall > 0) {
      var progress = 1 - o.fall / o.fallMax;
      var period = lerp(.46, .13, progress);
      var on = Settings.reduced || (Race.clock % period) < period * .55;
      ctx.strokeStyle = '#D52B35'; ctx.fillStyle = '#D52B35';
      ctx.globalAlpha = on ? .2 : .08;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = on ? .9 : .4;
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      var ring = r.w * (.1 + .4 * (1 - progress));
      ctx.beginPath(); ctx.arc(x, y, ring, 0, TAU); ctx.stroke();
      var lead = Math.max(.2, o.fallMax * .66);
      if (o.fall < lead) {
        var k = o.fall / lead, altitude = PF.h * .5 * k;
        var size = r.w * .45 * (1 + k * .5);
        ctx.globalAlpha = .16 + (1 - k) * .2; ctx.fillStyle = '#000';
        ctx.fillRect(x - size / 2, y - size / 4, size, size / 2);
        ctx.globalAlpha = 1;
        ctx.fillRect(x - size / 2, y - altitude - size / 2, size, size);
      }
    } else {
      ctx.globalAlpha = clamp(o.blast / .4, 0, 1) * .6;
      ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      var spread = r.w * (1 - o.blast / .4) * .3;
      ctx.strokeRect(r.x - spread, r.y - spread, r.w + spread * 2, r.h + spread * 2);
    }
    ctx.restore();
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
    var span = cameraSpan(), top = span.top, bot = span.bot;
    for (var i = 0; i < this.list.length; i++) {
      var o = this.list[i];
      if (o.wd > top || o.wd + o.hM < bot) continue;      /* off camera */
      var r = o.rect();
      if (o.kind === 'fallingSquare') { this.drawFalling(o, r); continue; }
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
      if (o.kind === 'falseMystery') { this.drawMystery(o, r); continue; }
      if (!o.harmful) {
        if (o.kind === 'mystery') {
          ctx.save();
          ctx.globalAlpha = this.mysteryAlpha(o);
          this.drawMystery(o, r);
          ctx.restore();
        } else this.drawBoost(o, r);
        continue;
      }
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
  mysteryAlpha: function (o) {
    var left = o.expiresAt - Race.clock;
    if (left <= 0) return 0;
    if (left > CFG.MYSTERY_BLINK) return 1;
    /* Reduced motion uses a steady fade instead of blinking. */
    if (Settings.reduced) return left / CFG.MYSTERY_BLINK;
    return Math.floor((CFG.MYSTERY_BLINK - left) * 4) % 2 ? 0.2 : 1;
  },

  /* The mystery square: the soap film below, squared off and with a "?" where
     the marble would be. It breathes on the shared race clock, so all six
     racers see the same square. */
  drawMystery: function (o, r) {
    var t = Settings.reduced ? 0 : Race.clock * 1.4 + o.wd;
    var breathe = Settings.reduced ? 1 : 1 + Math.sin(t * 1.3) * 0.045;
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    var w = r.w * breathe, h = r.h * breathe;
    var x = cx - w / 2, y = cy - h / 2, rad = Math.min(w, h) / 2;
    if (rad < 2) return;

    /* its halo is brighter and breathing where the respawn bubble's is steady,
       because this one has to be worth spotting from the top of the screen on
       white paper, the same job the pads' glow does */
    drawSoapRect(x, y, w, h, { t: t, halo: soapPulse(o.wd) });

    ctx.save();
    if (o.kind === 'falseMystery') {
      ctx.translate(cx, cy); ctx.rotate(PI); ctx.translate(-cx, -cy);
    }
    /* the question mark, readable over paper and over film alike */
    setFont(rad * 1.15, 700);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, rad * 0.22); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(11,11,12,0.72)';
    ctx.strokeText('?', cx, cy + 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('?', cx, cy + 1);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
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

/* ============================================================================
   THE SOAP FILM

   The one skin every friendly thing on this track wears: the respawn bubble,
   the mystery square and the finish line. A soft blue halo outside it, a film
   that is clear in the middle and bright at the edge, three thin-film tints
   walking the rim, a white rim over a pale ink seat, and highlights sitting on
   the curve it would have if it had one.

   The bubble draws it round a circle, because there is a marble inside it
   (Racer.drawBubble). Everything else draws it round a rectangle, which is
   what this is. Every weight is proportional to `rad`, so the same skin holds
   together from a marble to the full width of the track, and the halo and the
   film are ellipses inscribed in the rectangle rather than circles, so a long
   band is lit along its length exactly as a square is lit into its corners.
   ========================================================================== */
var SOAP_TINTS = ['rgba(120,235,255,0.85)', 'rgba(255,140,225,0.7)', 'rgba(255,235,150,0.7)'];
/* The star and its marble share the bubble's blue, pink and yellow. Smooth
   interpolation closes the cycle without a jump; reduced motion freezes it. */
var STAR_TINTS = [[120,235,255], [255,140,225], [255,235,150]];
function starPhase() { return Settings.reduced ? 0 : Race.clock * 0.45; }
function starRGB(phase) {
  var p = ((phase % 1) + 1) % 1 * STAR_TINTS.length;
  var i = Math.floor(p), k = easeInOutCubic(p - i);
  var a = STAR_TINTS[i], b = STAR_TINTS[(i + 1) % STAR_TINTS.length];
  return a.map(function (v, c) { return Math.round(lerp(v, b[c], k)); }).join(',');
}
function starGradient(x0, y0, x1, y1) {
  var g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (var i = 0; i <= 6; i++) {
    g.addColorStop(i / 6, 'rgb(' + starRGB(starPhase() + i / 9) + ')');
  }
  return g;
}
/* The star's own outline, laid as a path and left for the caller to fill or
   stroke: the item in the slot, the corona a starred marble wears and the
   sparks it sheds are all this one shape at different sizes.
   `inner` is the waist as a fraction of `r`, `rot` turns it, `points` is how
   many it has — five for the item, six for the light around a marble. */
function starPath(x, y, r, inner, rot, points) {
  var n = (points || 5) * 2, k = r * (inner === undefined ? 0.46 : inner);
  ctx.beginPath();
  for (var i = 0; i < n; i++) {
    var a = -PI / 2 + (rot || 0) + i * TAU / n, rr = (i % 2) ? k : r;
    var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
/* how hard the halo is breathing this instant: off the shared race clock, so
   every racer sees the same thing glow at the same moment */
function soapPulse(phase) {
  if (Settings.reduced) return 0;
  return 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(Race.clock * 4.2 + (phase || 0)));
}
/* o.t     : the film's own clock, 0 to hold it still
   o.halo  : strength of the halo outside it, 0 for none
   o.rad   : the radius every weight is taken from  (default: the short side)
   o.glints: how many pairs of highlights to space along the long side       */
function drawSoapRect(x, y, w, h, o) {
  var hw = w / 2, hh = h / 2;
  var rad = o.rad || Math.min(hw, hh);
  if (rad < 2 || hw < 1 || hh < 1) return;
  var cx = x + hw, cy = y + hh, t = o.t || 0, i;

  /* the halo it sits in, held the same distance off every edge, so a band
     glows along its length rather than swelling into a cloud at its ends */
  if (o.halo > 0) {
    var gx = hw + rad * 1.1, gy = hh + rad * 1.1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(gx / gy, 1);
    var glow = ctx.createRadialGradient(0, 0, gy * 0.262, 0, 0, gy);
    glow.addColorStop(0, 'rgba(120,205,250,' + (0.46 * o.halo).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(120,205,250,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-gy, -gy, gy * 2, gy * 2);
    ctx.restore();
  }

  /* soap film: clear in the middle, bright at the edge */
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(hw / hh, 1);
  var film = ctx.createRadialGradient(0, 0, hh * 0.2, 0, 0, hh);
  film.addColorStop(0,    'rgba(255,255,255,0.05)');
  film.addColorStop(0.62, 'rgba(190,230,255,0.14)');
  film.addColorStop(0.88, 'rgba(255,255,255,0.42)');
  film.addColorStop(1,    'rgba(255,255,255,0.08)');
  ctx.fillStyle = film;
  ctx.fillRect(-hh, -hh, hh * 2, hh * 2);
  ctx.restore();

  /* thin-film colour walking around the rim: a dashed stroke carries the tints
     round a rectangle the way an arc sweeps them round a circle */
  var per = (w + h) * 2, lw = Math.max(1.2, rad * 0.22);
  /* A square's rim carries one run of each tint. A band's rim is many times
     longer, and one run stretched over it would read as a painted bar rather
     than as colour travelling, so it carries a run every few marbles instead —
     the same length of colour, repeated, and still walking at the same pace. */
  var segs = Math.max(1, Math.round(per / (rad * 14))), seg = per / segs;
  if (ctx.setLineDash) {
    ctx.save();
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.setLineDash([seg * 0.24, seg * 0.76]);
    for (i = 0; i < 3; i++) {
      ctx.lineDashOffset = -(t * 0.10 * per + (i / 3) * seg);
      ctx.strokeStyle = SOAP_TINTS[i];
      ctx.strokeRect(x + lw * 0.4, y + lw * 0.4, w - lw * 0.8, h - lw * 0.8);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(0.8, rad * 0.11);
  ctx.strokeRect(x, y, w, h);

  /* the pale ink line that seats it on the paper, the way every other thing on
     this track is seated */
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = Math.max(1, rad * 0.07);
  ctx.strokeRect(x, y, w, h);

  /* highlights. A square gets the one pair the bubble has; a band gets a pair
     per column it crosses, so the glints read the whole way along it. */
  var n = o.glints || 1;
  for (i = 0; i < n; i++) {
    var gc = n === 1 ? cx : x + w * (i + 0.5) / n;
    ctx.beginPath();
    ctx.ellipse(gc - rad * 0.34, cy - rad * 0.40, rad * 0.26, rad * 0.16, -0.7, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gc + rad * 0.42, cy + rad * 0.34, rad * 0.10, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
}
