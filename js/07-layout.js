'use strict';

/* ============================================================================
   6. LAYOUT — canvas sizing, safe areas, playfield rectangle
   ========================================================================== */
var canvas = document.getElementById('stage');
var ctx = canvas.getContext('2d', { alpha: false });
var VIEW = { w: 1, h: 1, dpr: 1 };
var PF = { x: 0, y: 0, w: 1, h: 1 };      /* playfield rect, CSS pixels */
var INSET = { t: 0, b: 0, l: 0, r: 0 };
var FONT = '"Helvetica Neue","Inter",system-ui,-apple-system,"Segoe UI",Arial,sans-serif';

function readInsets() {
  var probe = document.getElementById('insetProbe');
  if (!probe) return;
  var cs = getComputedStyle(probe);
  INSET.t = parseFloat(cs.paddingTop) || 0;
  INSET.b = parseFloat(cs.paddingBottom) || 0;
  INSET.l = parseFloat(cs.paddingLeft) || 0;
  INSET.r = parseFloat(cs.paddingRight) || 0;
}

function layout() {
  readInsets();
  var vw = Math.max(1, window.innerWidth);
  var vh = Math.max(1, window.innerHeight);
  if (window.visualViewport && IS_MOBILE) {
    vw = Math.max(1, Math.round(window.visualViewport.width));
    vh = Math.max(1, Math.round(window.visualViewport.height));
  }
  VIEW.w = vw; VIEW.h = vh;
  VIEW.dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);

  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  canvas.width = Math.round(vw * VIEW.dpr);
  canvas.height = Math.round(vh * VIEW.dpr);
  ctx.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0);

  if (IS_MOBILE) {
    /* phone: the playfield is the whole screen; HUD respects the notch */
    PF.x = 0; PF.y = 0; PF.w = vw; PF.h = vh;
  } else {
    /* desktop: a centred portrait corridor, never stretched across ultrawide */
    var h = Math.min(vh - 40, 1000);
    var w = Math.min(h * 0.74, vw - 80, 780);
    h = Math.min(h, w / 0.5);
    PF.w = Math.max(240, w); PF.h = Math.max(320, h);
    PF.x = Math.round((vw - PF.w) / 2);
    PF.y = Math.round((vh - PF.h) / 2);
  }
  positionPauseButton();
  checkOrientation();
}

function colW() { return PF.w / 3; }
function laneCenterX(lane) { return PF.x + PF.w * (lane + 0.5) / 3; }
function playerRadius() { return colW() * CFG.PLAYER_R; }
function hudTop() { return PF.y + (IS_MOBILE ? INSET.t + 14 : 12); }

function positionPauseButton() {
  var b = document.getElementById('pauseBtn');
  b.style.left = Math.round(PF.x + PF.w - 42 - (IS_MOBILE ? INSET.r + 12 : 12)) + 'px';
  b.style.top = Math.round(hudTop() - 4) + 'px';
}
