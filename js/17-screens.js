'use strict';

/* ============================================================================
   SCREENS + CHROME
   ========================================================================== */
var Screens = {
  ids: ['lang', 'howto', 'marble', 'cpu', 'settings', 'pause'],
  show: function (id) {
    for (var i = 0; i < this.ids.length; i++) {
      var el = document.getElementById('panel-' + this.ids[i]);
      if (el) el.classList.toggle('show', this.ids[i] === id);
    }
  }
};

function syncChrome() {
  document.getElementById('finishActions').hidden = App.state !== ST.COMPLETED || App.blocked;
  var b = document.getElementById('pauseBtn');
  var visible = (App.state === ST.PLAYING || App.state === ST.RESPAWNING || App.state === ST.COUNTDOWN);
  b.classList.toggle('show', visible && !App.blocked);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', App.state === ST.SPLASH ? '#000000' : '#ffffff');
}

/* ---------- pause / resume / navigation ---------- */
var pausedFrom = null;
function pauseGame() {
  if (!(App.state === ST.PLAYING || App.state === ST.RESPAWNING || App.state === ST.COUNTDOWN)) return;
  pausedFrom = App.state;
  App.set(ST.PAUSED);
  Input.releaseAll();
  Player.crouch = false;
  Screens.show('pause');
  Sound.play('ui');
}
function resumeGame() {
  if (App.state !== ST.PAUSED) return;
  Screens.show(null);
  Input.releaseAll();
  Sound.play('ui');
  /* whatever grace a racer was carrying when the run stopped does not come
     back with it: the pause button is not a shield. The bubble is untouched —
     it is the respawn carrying on, not immunity. */
  for (var i = 0; i < Race.racers.length; i++) {
    Race.racers[i].immune = 0;
    Race.racers[i].immuneExt = 0;
  }
  if (pausedFrom === ST.COUNTDOWN) App.set(ST.COUNTDOWN);
  else Run.startCountdown(false);
}
function restartRun() {
  Screens.show(null);
  Sound.play('ui');
  Run.begin();
}
function goHome(fromBlack) {
  Screens.show(null);
  Sound.play('uiBack');
  var cx = VIEW.w / 2, cy = VIEW.h / 2;
  var finish = function () {
    Obstacles.clear(); VFX.clear(); Gen.stop();
    Run.seq = null; Run.line = null; Run.finalActive = false;
    Race.camLock = false;
    Player.reset(1);
    App.set(ST.HOME);
    irisOut(cx, cy);
  };
  if (fromBlack) finish();
  else irisIn(cx, cy, 0, finish);
}
