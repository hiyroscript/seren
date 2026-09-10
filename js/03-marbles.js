'use strict';

/* ============================================================================
   MARBLES — four bodies, each with its own white device inside. The devices
   are deliberately asymmetric so the spin is unmistakable while running.
   ========================================================================== */
var MARBLES = {
  blue:   { color: '#2F63E0', ink: '#fff', pattern: 'square' },
  red:    { color: '#DE3B3B', ink: '#fff', pattern: 'heart' },
  green:  { color: '#12A05B', ink: '#fff', pattern: 'triangle' },
  yellow: { color: '#EFA80B', ink: '#000', pattern: 'star' },
  pink:   { color: '#E8467C', ink: '#fff', pattern: 'cateye' },
  purple: { color: '#8B4FD8', ink: '#fff', pattern: 'diamond' }
};
var MARBLE_ORDER = ['blue', 'red', 'green', 'yellow', 'pink', 'purple'];
function marble() { return MARBLES[Settings.marble] || MARBLES.blue; }

/* Drawn into a circle of radius R, already clipped to the body and turned by
   the roll. Every device is off-centre or pointed so that its rotation reads
   at a glance; all of them sit well inside R so nothing is ever clipped. */
function drawMarblePattern(kind, R) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  if (kind === 'square') {
    var h = R * 0.46;
    ctx.rect(-h, -h, h * 2, h * 2);
    ctx.fill();
  } else if (kind === 'triangle') {
    var t = R * 0.68;
    ctx.moveTo(0, -t);
    ctx.lineTo(t * 0.866, t * 0.5);
    ctx.lineTo(-t * 0.866, t * 0.5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'diamond') {
    ctx.moveTo(0, -R * 0.74);
    ctx.lineTo(R * 0.42, 0);
    ctx.lineTo(0, R * 0.74);
    ctx.lineTo(-R * 0.42, 0);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'heart') {
    var S = R * 0.62;
    ctx.moveTo(0, S * 0.98);
    ctx.bezierCurveTo(-S * 1.20, S * 0.08, -S * 0.88, -S * 1.00, 0, -S * 0.34);
    ctx.bezierCurveTo(S * 0.88, -S * 1.00, S * 1.20, S * 0.08, 0, S * 0.98);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'star') {
    var ro = R * 0.72, ri = R * 0.30;
    for (var i = 0; i < 10; i++) {
      var a = -PI / 2 + i * PI / 5, rr = (i % 2) ? ri : ro;
      var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'cateye') {
    /* a lens with a slit cut out of it, so it reads as an eye either way up */
    var L = R * 0.80, B = R * 0.40;
    ctx.moveTo(-L, 0);
    ctx.quadraticCurveTo(0, -B * 1.7, L, 0);
    ctx.quadraticCurveTo(0, B * 1.7, -L, 0);
    ctx.closePath();
    ctx.moveTo(0, -B * 0.72);
    ctx.ellipse(0, 0, R * 0.11, B * 0.72, 0, 0, TAU);
    ctx.fill('evenodd');
  }
}
