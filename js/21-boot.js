'use strict';

/* ============================================================================
   WIRING + BOOT
   ========================================================================== */
function wireEvents() {
  /* pointer */
  canvas.addEventListener('pointerdown', function (e) { Input.onDown(e); }, { passive: true });
  window.addEventListener('pointermove', function (e) { Input.onMove(e); }, { passive: true });
  window.addEventListener('pointerup', function (e) { Input.onUp(e); }, { passive: true });
  window.addEventListener('pointercancel', function (e) { Input.onUp(e); }, { passive: true });

  /* keyboard */
  window.addEventListener('keydown', Input.onKeyDown);
  window.addEventListener('keyup', Input.onKeyUp);
  window.addEventListener('blur', function () { Input.releaseAll(); });

  /* stop the browser from scrolling, zooming or pulling to refresh */
  document.addEventListener('touchmove', function (e) {
    if (e.target === canvas || !e.target.closest || !e.target.closest('.panel')) {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  window.addEventListener('contextmenu', function (e) { if (e.target === canvas) e.preventDefault(); });

  /* layout */
  var rt = null;
  function onResize() {
    clearTimeout(rt);
    layout();
    rt = setTimeout(layout, 220);      /* mobile browser chrome settles late */
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () { setTimeout(onResize, 60); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { Input.releaseAll(); pauseGame(); }
    else { lastTS = 0; Sound.unlock(); }
  });

  /* pause button */
  document.getElementById('pauseBtn').addEventListener('click', function (e) {
    e.stopPropagation(); pauseGame();
  });

  /* language select */
  var langBtns = document.querySelectorAll('[data-lang]');
  for (var i = 0; i < langBtns.length; i++) {
    langBtns[i].addEventListener('click', function () {
      Sound.unlock(); Sound.play('start');
      setLanguage(this.getAttribute('data-lang'));
      Screens.show(null);
      App.set(ST.HOME);
      irisOut(VIEW.w / 2, VIEW.h / 2);
    });
  }

  /* panel actions */
  document.getElementById('ui').addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    Sound.unlock();
    if (act === 'howto-back') { Sound.play('uiBack'); Screens.show(null); App.set(ST.HOME); }
    else if (act === 'marble-back') { Sound.play('uiBack'); Screens.show(null); App.set(ST.HOME); }
    else if (act === 'cpu-back') { Sound.play('uiBack'); Screens.show(null); App.set(ST.HOME); }
    else if (act === 'settings-back') {
      Sound.play('uiBack');
      if (App.prev === ST.PAUSED) { App.set(ST.PAUSED); Screens.show('pause'); }
      else { App.set(ST.HOME); Screens.show(null); }
    }
    else if (act === 'resume') resumeGame();
    else if (act === 'restart') restartRun();
    else if (act === 'pause-settings') { Sound.play('ui'); App.prev = ST.PAUSED; App.set(ST.SETTINGS); Screens.show('settings'); }
    else if (act === 'home') goHome(App.state === ST.COMPLETED);
    else if (act === 'again') { Screens.show(null); Sound.play('start'); Run.begin(); irisOut(VIEW.w / 2, VIEW.h / 2); }
  });

  /* marble selection */
  document.querySelector('.marbles').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-marble]') : null;
    if (!b) return;
    var id = b.getAttribute('data-marble');
    if (!MARBLES[id]) return;
    Settings.marble = id;
    Settings.save();
    syncMarbleUI();
    Sound.unlock(); Sound.play('ui');
  });

  /* cpu intelligence */
  document.getElementById('cpuList').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-cpu]') : null;
    if (!b) return;
    var id = b.getAttribute('data-cpu');
    if (!AI_LEVELS[id]) return;
    Settings.cpu = id;
    Settings.save();
    syncCpuUI();
    Sound.unlock(); Sound.play('ui');
  });

  /* settings controls */
  document.getElementById('segLang').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setLanguage(b.getAttribute('data-v')); Sound.play('ui');
  });
  document.getElementById('segFx').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Settings.effects = b.getAttribute('data-v'); Settings.save(); syncSettingsUI(); Sound.play('ui');
  });
  document.getElementById('volRange').addEventListener('input', function () {
    Settings.volume = clamp(this.value / 100, 0, 1);
    if (Settings.muted && Settings.volume > 0) { Settings.muted = false; syncSettingsUI(); }
    Sound.unlock(); Sound.apply(); Settings.save();
  });
  document.getElementById('volRange').addEventListener('change', function () { Sound.play('ui'); });
  document.getElementById('muteBtn').addEventListener('click', function () {
    Settings.muted = !Settings.muted; Settings.save(); syncSettingsUI(); Sound.unlock(); Sound.apply();
    if (!Settings.muted) Sound.play('ui');
  });
}

function startSplash() {
  Splash.t = 0;
  App.set(ST.SPLASH);
}

function boot() {
  document.getElementById('langTitle').innerHTML =
    'Choose your language<br><span style="opacity:.5">Choisissez votre langue</span>';
  document.getElementById('langNote').textContent =
    'You can change this later in Settings. \u00B7 Vous pourrez la changer dans les Paramètres.';

  layout();
  if (!MARBLES[Settings.marble]) Settings.marble = 'blue';
  if (!AI_LEVELS[Settings.cpu]) Settings.cpu = 'normal';
  syncSettingsUI();
  syncMarbleUI();
  syncCpuUI();
  applyI18n();
  wireEvents();

  if (Settings.lang) setLanguage(Settings.lang);
  startSplash();
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
