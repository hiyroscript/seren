'use strict';

/* ============================================================================
   MAIN LOOP
   ========================================================================== */
var lastTS = 0;
function update(dt) {
  App.time += dt;
  updateIris(dt);
  VFX.update(dt);

  for (var id in HOME_FX) {
    var f = HOME_FX[id];
    f.hover = approach(f.hover, f.hoverTarget || 0, 14, dt);
    f.press = approach(f.press, f.pressTarget || 0, 16, dt);
  }

  if (App.state === ST.SPLASH) {
    Splash.t += dt;
    if (Splash.t >= CFG.SPLASH_TIME) {
      /* the language question comes after the title card, never before it */
      if (!Settings.lang) { App.set(ST.LANG); Screens.show('lang'); }
      else App.set(ST.HOME);
    }
    return;
  }
  if (App.blocked) return;

  Input.tick(dt);

  if (App.state === ST.PLAYING || App.state === ST.RESPAWNING) {
    var want = Input.crouchHeld && Player.alive && !Player.inBubble();
    if (want !== Player.crouch) {
      Player.crouch = want;
      Sound.play(want ? 'crouchIn' : 'crouchOut');
      if (want && !Settings.reduced) {
        var pr = playerRadius();
        VFX.burst(Player.x(), Player.y() + pr * 0.6, 9,
          { color: '#000', dir: PI / 2, spMax: 160, sizeMax: 2.6, lifeMax: .38, world: true });
      }
    }
  }
  if (inRun() || App.state === ST.COMPLETED) Run.update(dt);
}

function frame(ts) {
  requestAnimationFrame(frame);
  var now = ts / 1000;
  var dt = lastTS ? now - lastTS : 1 / 60;
  lastTS = now;
  if (!(dt > 0)) dt = 1 / 60;        /* a clock that jumps back must not rewind the world */
  if (dt > 0.05) dt = 0.05;          /* never let a stalled tab teleport it forward */
  update(dt);
  render();
}
