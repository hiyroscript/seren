'use strict';

/* ============================================================================
   12. RENDERING
   ========================================================================== */
function setFont(size, weight) { ctx.font = (weight || 600) + ' ' + size.toFixed(1) + 'px ' + FONT; }

/* letter-spaced text, drawn glyph by glyph (ctx.letterSpacing is not universal) */
function tracked(text, x, y, size, weight, spacing, align, color, alpha) {
  setFont(size, weight);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  var sp = size * spacing, total = 0, i, ch;
  for (i = 0; i < text.length; i++) total += ctx.measureText(text[i]).width + (i < text.length - 1 ? sp : 0);
  var sx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
  ctx.fillStyle = color || '#000';
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  for (i = 0; i < text.length; i++) {
    ch = text[i];
    ctx.fillText(ch, sx, y);
    sx += ctx.measureText(ch).width + sp;
  }
  ctx.globalAlpha = 1;
  return total;
}

/* ---------- iris / screen transitions ---------- */
var Iris = { mode: null, t: 0, dur: 0, x: 0, y: 0, r0: 0, cover: 0, after: null };
function coverRadius(x, y) {
  return Math.max(Math.hypot(x, y), Math.hypot(VIEW.w - x, y),
                  Math.hypot(x, VIEW.h - y), Math.hypot(VIEW.w - x, VIEW.h - y)) + 4;
}
function irisIn(x, y, r0, after) {
  Iris.mode = 'in'; Iris.t = 0; Iris.dur = CFG.IRIS_IN;
  Iris.x = x; Iris.y = y; Iris.r0 = r0; Iris.cover = coverRadius(x, y); Iris.after = after || null;
}
function irisOut(x, y) {
  Iris.mode = 'out'; Iris.t = 0; Iris.dur = CFG.IRIS_OUT;
  Iris.x = x; Iris.y = y; Iris.r0 = 0; Iris.cover = coverRadius(x, y); Iris.after = null;
}
function updateIris(dt) {
  if (!Iris.mode) return;
  Iris.t += dt;
  if (Iris.t >= Iris.dur) {
    var fn = Iris.after; Iris.mode = null; Iris.after = null;
    if (fn) fn();
  }
}
function drawIris() {
  if (!Iris.mode) return;
  var k = clamp(Iris.t / Iris.dur, 0, 1);
  ctx.fillStyle = '#000';
  if (Iris.mode === 'in') {
    var r = lerp(Iris.r0, Iris.cover, easeInCubic(k));
    ctx.beginPath(); ctx.arc(Iris.x, Iris.y, r, 0, TAU); ctx.fill();
  } else {
    var ro = lerp(0, Iris.cover, easeOutCubic(k));
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.w, VIEW.h);
    ctx.arc(Iris.x, Iris.y, ro, 0, TAU);
    ctx.fill('evenodd');
  }
}

/* ---------- splash ---------- */
var Splash = { t: 0 };
function drawSplash() {
  var T = CFG.SPLASH_TIME, t0 = Splash.t;
  var veil = t0 > T - 0.55 ? clamp(1 - (t0 - (T - 0.55)) / 0.55, 0, 1) : 1;
  ctx.globalAlpha = veil;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  ctx.globalAlpha = 1;
  var textA = clamp(t0 / 0.6, 0, 1) * (t0 > T - 0.9 ? clamp(1 - (t0 - (T - 0.9)) / 0.5, 0, 1) : 1) * veil;
  var size = clamp(Math.min(VIEW.w, VIEW.h) * 0.028, 10.5, 15);
  var y = VIEW.h - INSET.b - Math.max(64, VIEW.h * 0.11);
  tracked('a game by hiyroscript', VIEW.w / 2, y, size, 400, 0.24, 'center', '#fff', textA);
}

/* ---------- home screen ---------- */
var HOME_FX = {};
function fx(id) {
  if (!HOME_FX[id]) HOME_FX[id] = { hover: 0, press: 0 };
  return HOME_FX[id];
}
var HOME_DEF = [
  { id: 'howto', ang: -0.98, rf: 0.52, color: '#F2B705', text: '#000', key: 'circleHowTo' },
  { id: 'settings', ang: 2.24, rf: 0.52, color: '#3B5BDB', text: '#fff', key: 'circleSettings' },
  { id: 'marble', ang: -1.95, rf: 0.52, color: '#F2600C', text: '#fff', key: 'circleMarble' },
  { id: 'cpu', ang: 1.35, rf: 0.52, color: '#7A3FF2', text: '#fff', key: 'circleCpu', tf: 0.74 },
  { id: 'deco1', ang: -2.55, rf: 0.20, color: '#0FA3A3', text: null },
  { id: 'deco2', ang: 0.62, rf: 0.135, color: '#E5487B', text: null }
];
function homeCircles() {
  var base = Math.min(VIEW.w, VIEW.h);
  var cx = VIEW.w / 2, cy = VIEW.h / 2;
  var R = clamp(base * 0.215, 70, 175);
  var out = [{ id: 'start', x: cx, y: cy, r: R, color: '#000', text: '#fff', big: true }];
  var ring = Math.min(R * 2.05,
    Math.max(R * 1.45, Math.min(VIEW.w / 2 - R * 0.6 - 10, VIEW.h / 2 - R * 0.6 - 10)));
  for (var i = 0; i < HOME_DEF.length; i++) {
    var d = HOME_DEF[i], r = R * d.rf;
    var f = 1 + (d.rf > 0.4 ? 0 : 0.12);
    out.push({
      id: d.id, r: r, color: d.color, text: d.text, key: d.key, tf: d.tf,
      x: clamp(cx + Math.cos(d.ang) * ring * f, r + 8, VIEW.w - r - 8),
      y: clamp(cy + Math.sin(d.ang) * ring * f, r + 8 + INSET.t, VIEW.h - r - 8 - INSET.b)
    });
  }
  return out;
}
/* independent floating motion per circle */
function homeFloat(c, i) {
  var tt = App.time;
  if (c.big) return { x: 0, y: Math.sin(tt * 0.9) * 5, s: 1 + Math.sin(tt * 1.15) * 0.012 };
  return {
    x: Math.cos(tt * (0.5 + i * 0.13) + i * 2.1) * (5 + i * 1.6),
    y: Math.sin(tt * (0.62 + i * 0.11) + i * 1.3) * (7 + i * 1.8),
    s: 1 + Math.sin(tt * (1.1 + i * 0.2) + i) * 0.02
  };
}
function drawHome() {
  var list = homeCircles();
  for (var i = 0; i < list.length; i++) {
    var c = list[i], f = fx(c.id), fl = homeFloat(c, i);
    var scale = fl.s * (1 + f.hover * 0.055 - f.press * 0.075);
    var x = c.x + fl.x, y = c.y + fl.y, r = c.r * scale;

    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = c.color; ctx.fill();

    if (c.big) {
      tracked('SEREN', x, y - r * 0.13, clamp(r * 0.29, 16, 46), 700, 0.34, 'center', '#fff', 1);
      tracked(t('start'), x, y + r * 0.42, clamp(r * 0.125, 9, 15), 600, 0.22, 'center', 'rgba(255,255,255,.72)', 1);
    } else if (c.text && c.key) {
      var lines = t(c.key), fs = clamp(r * 0.25, 8.5, 14) * (c.tf || 1);
      for (var k = 0; k < lines.length; k++) {
        tracked(lines[k], x, y + (k - (lines.length - 1) / 2) * fs * 1.45, fs, 600, 0.12, 'center', c.text, 1);
      }
    }
  }
}

/* ---------- gameplay scene ---------- */
/* the ground itself: a lit column under the player, rungs and dashed dividers
   that scroll with the world, so speed is legible even on an empty stretch */
var RUNG_M = 3.4, DASH_M = 2.2;

/* walk the rungs of a given world spacing from the bottom of the field upward */
function eachRung(stepM, fn) {
  var d0 = Race.camD;
  var k = Math.floor((d0 + (CFG.PLAYER_Y - 1.06) * CFG.METERS_VISIBLE) / stepM);
  for (var n = 0; n < 48; n++, k++) {
    var yN = CFG.PLAYER_Y - (k * stepM - d0) / CFG.METERS_VISIBLE;
    if (yN < -0.04) break;
    if (yN > 1.04) continue;
    fn(PF.y + yN * PF.h, k);
  }
}

function drawTrack() {
  var lw = Math.max(1, Math.min(2, PF.w * 0.0035));
  var cw = colW();

  /* the column the player is running in, so the eye always knows where it is */
  if (Player.alive) {
    ctx.fillStyle = accent(ACCENT ? 0.06 : 0.03);
    ctx.fillRect(PF.x + Player.xF * PF.w - cw / 2, PF.y, cw, PF.h);
  }

  /* rungs: short bars inside each column, brighter every fourth */
  var inset = cw * 0.16;
  eachRung(RUNG_M, function (y, k) {
    var strong = (k % 4 === 0);
    ctx.fillStyle = strong ? 'rgba(0,0,0,.13)' : 'rgba(0,0,0,.055)';
    var h = strong ? Math.max(1.5, lw * 1.4) : Math.max(1, lw);
    for (var c = 0; c < 3; c++) {
      ctx.fillRect(PF.x + c * cw + inset, y, cw - inset * 2, h);
    }
  });

  /* dividers: a whisper of a line, with a scrolling dashed rhythm on top */
  ctx.strokeStyle = '#000';
  ctx.lineWidth = lw;
  ctx.globalAlpha = 0.10;
  for (var i = 1; i < 3; i++) {
    var x = Math.round(PF.x + PF.w * i / 3) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, PF.y); ctx.lineTo(x, PF.y + PF.h); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  var dashH = DASH_M / CFG.METERS_VISIBLE * PF.h * 0.55;
  eachRung(DASH_M, function (y) {
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    for (var i = 1; i < 3; i++) {
      ctx.fillRect(Math.round(PF.x + PF.w * i / 3) - lw / 2, y, Math.max(1, lw), dashH);
    }
  });
}

/* obstacles emerge from the distance instead of popping in at the edge */
function drawHorizon() {
  var h = PF.h * 0.17;
  var g = ctx.createLinearGradient(0, PF.y, 0, PF.y + h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,.78)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(PF.x, PF.y, PF.w, h);
}

/* the corridor tightens as the run accelerates */
function drawEdges() {
  var k = speedK();
  var a = 0.05 + 0.10 * k;
  var w = PF.w * (0.06 + 0.05 * k);
  var g = ctx.createLinearGradient(PF.x, 0, PF.x + w, 0);
  g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(PF.x, PF.y, w, PF.h);
  var g2 = ctx.createLinearGradient(PF.x + PF.w, 0, PF.x + PF.w - w, 0);
  g2.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(PF.x + PF.w - w, PF.y, w, PF.h);
}
/* the speed pad: the one warm thing on the track */
var BOOST_INK = '#F5C518';
/* the respawn bubble */
var BUBBLE_INK = '#8FE3F0';

/* the finish wall's palette: solid, saturated, and never two at once */
var WALL_COLORS = ['#E5484D', '#F5A524', '#30A46C', '#00A2C7', '#3E63DD', '#8E4EC6'];
var WALL_HOLD = 0.40, WALL_FADE = 0.52;   /* seconds held, seconds crossfading */

function drawFinishWall() {
  var w = Run.wall; if (!w) return;
  var bottom = Run.wallEdgeY();         /* the face, wherever the camera is */
  if (!(bottom > -1)) return;

  /* One blank slab, one colour at a time: it holds, then crossfades into the
     next. Painted well past every edge of the screen so that a shake, a notch
     or a desktop margin can never uncover a strip of the world beside it. */
  var over = 96, x = -over, y = -over, w = VIEW.w + over * 2, h = bottom + over;
  var cyc = (WALL_HOLD + WALL_FADE) * (Settings.reduced ? 1.7 : 1);
  var p = App.time / cyc;
  var i = Math.floor(p) % WALL_COLORS.length;
  var into = (p - Math.floor(p)) * cyc - WALL_HOLD * (Settings.reduced ? 1.7 : 1);
  var mix = easeInOutCubic(clamp(into / (WALL_FADE * (Settings.reduced ? 1.7 : 1)), 0, 1));

  ctx.fillStyle = WALL_COLORS[i];
  ctx.fillRect(x, y, w, h);
  if (mix > 0) {
    ctx.globalAlpha = mix;
    ctx.fillStyle = WALL_COLORS[(i + 1) % WALL_COLORS.length];
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
}

function drawHUD() {
  var pad = IS_MOBILE ? INSET.l + 16 : 14;
  var top = hudTop() + 8;
  var pulse = easeOutCubic(Run.hudPulse);
  var s1 = clamp(PF.w * 0.042, 13, 21) * (1 + 0.15 * pulse);
  var s2 = clamp(PF.w * 0.028, 10, 13);
  tracked(numFmt(Run.distance) + ' ' + t('meters'), PF.x + pad, top + s1 * 0.4, s1, 600, 0.05, 'left',
    pulse > 0.03 ? accent(1, 46) : '#000', 0.82 + 0.18 * pulse);
  /* the game's speed, and only that: it steps up with the climb and holds
     there. A boost or a shove moves the racer, not the speed of the run, and
     a readout that jumped about with them was reporting the wrong thing. */
  tracked(Run.mult.toFixed(2) + 'x', PF.x + pad, top + s1 * 1.5, s2, 500, 0.12, 'left', '#000', 0.42);
  /* where this racer stands in a field of six */
  var pos = (Player && Player.pos) ? Player.pos : 1;
  tracked(t('position') + ' ' + pos + '/' + Race.racers.length,
    PF.x + pad, top + s1 * 2.45, s2, 600, 0.12, 'left',
    pos === 1 ? accent(1, 46) : '#000', pos === 1 ? 0.9 : 0.5);

  /* The ducks this run, in a pane of smoked glass. Square whatever the count
     grows to: the side is taken from the widest of the digits and the base
     size, so three figures sit in it as comfortably as one. */
  var ducks = String((Player && Player.crouches) ? Player.crouches : 0);
  var ds = clamp(PF.w * 0.030, 11, 14);
  setFont(ds, 700);
  var side = Math.max(s1 * 1.55, ctx.measureText(ducks).width + ds * 1.4);
  var bx = PF.x + pad, by0 = top + s1 * 3.05;
  ctx.fillStyle = 'rgba(0,0,0,0.09)';
  ctx.fillRect(bx, by0, side, side);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by0 + 0.5, side - 1, side - 1);
  /* the chevron the track uses to mean "duck", so the number needs no label */
  var chw = side * 0.17, chy = by0 + side * 0.30;
  ctx.strokeStyle = '#000'; ctx.globalAlpha = 0.34;
  ctx.lineWidth = Math.max(1.4, side * 0.055);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + side / 2 - chw, chy - chw * 0.52);
  ctx.lineTo(bx + side / 2, chy + chw * 0.52);
  ctx.lineTo(bx + side / 2 + chw, chy - chw * 0.52);
  ctx.stroke();
  ctx.globalAlpha = 1;
  tracked(ducks, bx + side / 2, by0 + side * 0.66, ds, 700, 0.06, 'center', '#000', 0.7);

  if (Run.finalActive) {
    var prog = Math.min(CFG.FINAL_DISTANCE, Math.floor(Run.finalProgress()));
    var label = t('final') + ' \u2014 ' + prog + ' / ' + CFG.FINAL_DISTANCE + ' ' + t('meters');
    var fs = clamp(PF.w * 0.032, 11, 15);
    var by = PF.y + PF.h - (IS_MOBILE ? INSET.b + 26 : 24);
    tracked(label, PF.x + PF.w / 2, by, fs, 700, 0.14, 'center', '#000', 0.9);
    /* thin progress rule under the label */
    var bw = Math.min(PF.w * 0.5, 220), k = prog / CFG.FINAL_DISTANCE;
    ctx.globalAlpha = 0.16; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PF.x + PF.w / 2 - bw / 2, by + fs); ctx.lineTo(PF.x + PF.w / 2 + bw / 2, by + fs); ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(PF.x + PF.w / 2 - bw / 2, by + fs); ctx.lineTo(PF.x + PF.w / 2 - bw / 2 + bw * k, by + fs); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawCountdown() {
  if (App.state !== ST.COUNTDOWN) return;
  var phase = Run.countT / CFG.COUNT_STEP;
  var label = Run.countLabel();
  var pop = easeOutBack(clamp(phase / 0.34, 0, 1));
  var a = phase > 0.7 ? clamp(1 - (phase - 0.7) / 0.3, 0, 1) : 1;
  var size = Math.min(PF.w * 0.30, PF.h * 0.20);
  var isGo = Run.countIdx >= 3;
  ctx.save();
  ctx.translate(PF.x + PF.w / 2, PF.y + PF.h * 0.42);
  ctx.scale(pop * (isGo ? 1 + (1 - a) * 0.25 : 1), pop * (isGo ? 1 + (1 - a) * 0.25 : 1));
  tracked(label, 0, 0, isGo ? size * 0.62 : size, 700, isGo ? 0.2 : 0.06, 'center', '#000', a * 0.92);
  ctx.restore();
}

function drawScene() {
  var sh = VFX.shake;
  var ox = sh ? rand(-sh, sh) : 0, oy = sh ? rand(-sh, sh) : 0;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.save();
  ctx.beginPath(); ctx.rect(PF.x, PF.y, PF.w, PF.h); ctx.clip();

  drawTrack();
  VFX.drawSpeedLines();
  Obstacles.draw();
  drawHorizon();
  drawEdges();
  if (!Run.wall) {
    VFX.drawDashes();
    VFX.drawRipples();
    Race.drawRacers();
    Obstacles.drawOverhead();     /* a barrier you duck under passes over you */
    VFX.drawParticles();
  }

  ctx.restore();

  /* the wall cuts off the whole screen, corridor framing included, so it is
     drawn unclipped, and the player rides on its face until it absorbs him */
  if (Run.wall) {
    drawFinishWall();
    VFX.drawRipples();
    Race.drawRacers();
    VFX.drawParticles();
  }

  /* desktop framing: two hairlines that hold the corridor on a wide screen */
  if (!IS_MOBILE && !Run.wall) {
    ctx.globalAlpha = 0.13; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PF.x + .5, PF.y); ctx.lineTo(PF.x + .5, PF.y + PF.h);
    ctx.moveTo(PF.x + PF.w - .5, PF.y); ctx.lineTo(PF.x + PF.w - .5, PF.y + PF.h);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawHUD();
  drawCountdown();
  ctx.restore();
}

function render() {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  var s = App.state;
  if (s === ST.LANG) { /* white page under the panel */ }
  else if (s === ST.SPLASH) { if (Settings.lang) drawHome(); drawSplash(); }
  else if (s === ST.HOME || s === ST.HOWTO || s === ST.MARBLE || s === ST.CPU) {
    drawHome(); VFX.drawRipples(); VFX.drawParticles();
  }
  else if (s === ST.SETTINGS) {
    if (App.prev === ST.HOME || App.prev === ST.HOWTO) drawHome(); else drawScene();
  } else drawScene();
  drawIris();
}
