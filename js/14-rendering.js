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
/* the two inks the place readout takes on for a moment when it changes.
   A strictly black-and-white run keeps its ink and flashes on weight alone. */
var POS_GAIN_INK = '#0E9E57', POS_LOSS_INK = '#D93A2B';
function posFlashInk(dir) {
  if (!ACCENT) return '#000';
  return dir < 0 ? POS_LOSS_INK : POS_GAIN_INK;
}
/* the respawn bubble */
var BUBBLE_INK = '#8FE3F0';

/* ---------------------------------------------------------------------------
   THE FINISH LINE — a band of the same soap film the mystery squares and the
   respawn bubbles are made of, laid across all three columns. It is a thing on
   the track like any other: it lives at a world distance, it comes up over the
   horizon with the ground, and racers roll over it rather than into it.
   ------------------------------------------------------------------------- */
function drawFinishLine() {
  var L = Run.line; if (!L) return;
  var depth = Run.lineDepth();
  var h = metresToPx(depth);
  var y = screenY(L.d + depth);
  /* off camera, with a band's worth of margin so its halo is never cut off
     the frame before the band that casts it is */
  if (y - h > PF.y + PF.h || y + h * 2 < PF.y) return;

  /* it breathes on the shared race clock, so every racer sees the same band
     doing the same thing at the same moment */
  var t = Settings.reduced ? 0 : Race.clock * 1.4;
  var bh = h * (Settings.reduced ? 1 : 1 + Math.sin(t * 1.3) * 0.045);
  drawSoapRect(PF.x, y + (h - bh) / 2, PF.w, bh,
    { t: t, halo: soapPulse(0), glints: 3 });
}

/* The bolt a mystery square can be carrying: the yellow pad's own face, cut to
   the shape of the shove it hands out. Drawn in a unit box and scaled, so the
   same bolt serves the slot on a phone and on a desktop corridor alike. */
var BOLT = [[0.62, 0], [0.05, 0.56], [0.40, 0.56], [0.30, 1],
            [0.95, 0.42], [0.55, 0.42]];
function drawBolt(cx, cy, size) {
  var w = size * 0.62, h = size, x0 = cx - w / 2, y0 = cy - h / 2, i;
  /* the glow the pads wear, so the slot reads as loaded at a glance */
  if (!Settings.reduced) {
    var glow = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, size * 0.85);
    glow.addColorStop(0, 'rgba(245,197,24,0.42)');
    glow.addColorStop(1, 'rgba(245,197,24,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
  }
  ctx.beginPath();
  for (i = 0; i < BOLT.length; i++) {
    var px = x0 + BOLT[i][0] * w, py = y0 + BOLT[i][1] * h;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  var g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, '#FFE680');
  g.addColorStop(0.42, BOOST_INK);
  g.addColorStop(1, '#D89400');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.4, size * 0.07);
  ctx.strokeStyle = '#000';
  ctx.stroke();
}

function drawStar(x, y, size) {
  var r = size / 2;
  ctx.save();
  starPath(x, y, r, 0.46, 0, 5);
  ctx.fillStyle = starGradient(x - r, y - r, x + r, y + r);
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, size * 0.045);
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.restore();
}

function itemSlotRect() {
  var size = clamp(Math.min(VIEW.w, VIEW.h) * .12, 52, 76);
  return { x: VIEW.w - INSET.r - size - 18, y: VIEW.h - INSET.b - size - 18,
    w: size, h: size };
}
function drawItemSlot() {
  if (App.state !== ST.PLAYING && App.state !== ST.RESPAWNING &&
      App.state !== ST.COUNTDOWN && App.state !== ST.PAUSED) return;
  var r = itemSlotRect();
  ctx.save();
  ctx.fillStyle = 'rgba(30,35,45,0.18)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  drawSoapRect(r.x, r.y, r.w, r.h, { t: Settings.reduced ? 0 : Race.clock, halo: 0 });
  if (Player.item === 'boost') {
    drawBolt(r.x + r.w / 2, r.y + r.h / 2, r.w * .56);
  } else if (Player.item === 'star') {
    drawStar(r.x + r.w / 2, r.y + r.h / 2, r.w * .72);
  } else if (Player.item) {
    var s = r.w * .55;
    Obstacles.drawMystery({ kind: 'falseMystery', wd: 0 },
      { x: r.x + (r.w - s) / 2, y: r.y + (r.h - s) / 2, w: s, h: s });
  }
  ctx.restore();
}
/* A slim white race-length line, with a dark backing for the paper track.
   All six dots and the covered section use exactly the same metre scale. */
function raceLadderRect() {
  var slot = itemSlotRect();
  var top = Math.max(hudTop() + 145, PF.y + PF.h * .28);
  var bottom = Math.min(slot.y - 24, PF.y + PF.h - 48);
  var height = Math.max(24, Math.min(300, bottom - top));
  return { x: Math.min(VIEW.w - INSET.r - 22, PF.x + PF.w + 26),
    top: top + Math.max(0, bottom - top - height) / 2, height: height };
}
function raceLadderY(distance, g, span) {
  return g.top + g.height * (1 - clamp((distance - span.from) / Math.max(1, span.to - span.from), 0, 1));
}
function drawRaceLadder() {
  var g = raceLadderRect(), span = Run.raceSpan(), foot = g.top + g.height;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(25,30,40,.48)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(g.x, g.top); ctx.lineTo(g.x, foot); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(g.x, foot);
  ctx.lineTo(g.x, raceLadderY(Player.finished ? span.to : Player.d, g, span)); ctx.stroke();
  [0, .5, 1].forEach(function (k) {
    var y = g.top + g.height * k, w = k === .5 ? 3 : 5;
    ctx.strokeStyle = 'rgba(25,30,40,.65)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(g.x - w, y); ctx.lineTo(g.x + w, y); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  });
  /* Draw the human last so its ring remains visible when the field bunches. */
  Race.racers.filter(function (p) { return !p.human; }).concat([Player]).forEach(function (p) {
    var y = raceLadderY(p.finished ? span.to : p.d, g, span);
    ctx.globalAlpha = p.alive ? 1 : .4;
    ctx.beginPath(); ctx.arc(g.x, y, p.human ? 5.5 : 4, 0, TAU);
    ctx.fillStyle = p.star > 0 ? 'rgb(' + starRGB(starPhase()) + ')' : p.marbleDef().color;
    ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.3; ctx.stroke();
    if (p.human) {
      ctx.beginPath(); ctx.arc(g.x, y, 8, 0, TAU);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  });
  ctx.restore();
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
  /* Where this racer stands in a field of six, and the colour that arrives
     with a change of place: one ink for a place taken, another for a place
     lost, crossfading back to the resting colour over POS_FLASH seconds. The
     resting text fades out underneath as the flash fades in, so the readout
     changes colour rather than thickening. */
  var pos = (Player && Player.pos) ? Player.pos : 1;
  var posTxt = t('position') + ' ' + pos + '/' + Race.racers.length;
  var posX = PF.x + pad, posY = top + s1 * 2.45;
  var posA = pos === 1 ? 0.9 : 0.5;
  var fk = Run.posFlash > 0 ? easeOutCubic(Run.posFlash) : 0;
  if (fk < 1) {
    tracked(posTxt, posX, posY, s2, 600, 0.12, 'left',
      pos === 1 ? accent(1, 46) : '#000', posA * (1 - fk));
  }
  if (fk > 0) tracked(posTxt, posX, posY, s2, 600, 0.12, 'left', posFlashInk(Run.posDir), fk * 0.95);

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

  /* The final stage counts the 500 metres up to the line being planted. After
     that the only number worth a readout is the track left to the line — and
     once this racer is over it there is nothing left to count at all. */
  if (Run.finalActive && !(Player && Player.finished)) {
    var label, k;
    if (Run.line) {
      var left = Math.max(0, Math.ceil(Run.line.d - Player.d));
      var runIn = Math.max(1e-6, Run.line.d - Run.line.from);
      label = t('toLine') + ' \u2014 ' + numFmt(left) + ' ' + t('meters');
      k = clamp((Player.d - Run.line.from) / runIn, 0, 1);
    } else {
      var prog = Math.min(CFG.FINAL_DISTANCE, Math.floor(Run.finalProgress()));
      label = t('final') + ' \u2014 ' + prog + ' / ' + CFG.FINAL_DISTANCE + ' ' + t('meters');
      k = prog / CFG.FINAL_DISTANCE;
    }
    var fs = clamp(PF.w * 0.032, 11, 15);
    var by = PF.y + PF.h - (IS_MOBILE ? INSET.b + 26 : 24);
    tracked(label, PF.x + PF.w / 2, by, fs, 700, 0.14, 'center', '#000', 0.9);
    /* thin progress rule under the label */
    var bw = Math.min(PF.w * 0.5, 220);
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
  drawFinishLine();               /* on the track, and under everything on it */
  drawHorizon();
  drawEdges();
  VFX.drawDashes();
  VFX.drawRipples();
  Race.drawRacers();
  Obstacles.drawOverhead();       /* a barrier you duck under passes over you */
  VFX.drawParticles();

  ctx.restore();

  /* desktop framing: two hairlines that hold the corridor on a wide screen */
  if (!IS_MOBILE) {
    ctx.globalAlpha = 0.13; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PF.x + .5, PF.y); ctx.lineTo(PF.x + .5, PF.y + PF.h);
    ctx.moveTo(PF.x + PF.w - .5, PF.y); ctx.lineTo(PF.x + PF.w - .5, PF.y + PF.h);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawHUD();
  drawRaceLadder();
  drawItemSlot();
  VFX.drawPickups();
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
