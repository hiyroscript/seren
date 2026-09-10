'use strict';

/* ============================================================================
   SEREN
   A minimalist three-column parkour game. No dependencies, no build step.

   The systems below live in js/00-utils.js .. js/21-boot.js and are loaded in
   that order by index.html. They are classic scripts sharing one global scope,
   exactly as they did when this was a single file.

   Systems, in order:
     0. utilities        7. player
     1. storage          8. obstacles
     2. localization     9. procedural generator
     3. settings        10. run / game logic
     4. audio           11. rendering
     5. layout          12. input
     6. vfx             13. screens + boot
   ========================================================================== */

/* ============================================================================
   0. UTILITIES
   ========================================================================== */
var PI = Math.PI, TAU = PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }
function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function easeOutBack(t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
/* frame-rate independent approach-to-target */
function approach(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
