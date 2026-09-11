'use strict';

/* ============================================================================
   LOCALISATION + SETTINGS UI
   ========================================================================== */
function applyI18n() {
  var nodes = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    var key = nodes[i].getAttribute('data-i18n');
    var v = t(key);
    if (typeof v === 'string') nodes[i].textContent = v;
  }
  /* the same lookup for the labels that are read rather than shown */
  var aria = document.querySelectorAll('[data-i18n-aria]');
  for (var n = 0; n < aria.length; n++) {
    var av = t(aria[n].getAttribute('data-i18n-aria'));
    if (typeof av === 'string') aria[n].setAttribute('aria-label', av);
  }
  document.getElementById('noteKeys').style.display = IS_MOBILE ? 'none' : '';
  if (!IS_MOBILE) {   /* the tutorial speaks the language of the device it is on */
    var a = document.querySelector('[data-i18n="htLanes"]');
    var b = document.querySelector('[data-i18n="htCrouch"]');
    if (a) a.textContent = t('htLanesKb');
    if (b) b.textContent = t('htCrouchKb');
  }
  /* a dialog already on screen changes language where it stands */
  if (Results.open) Results.fill();
  var op = document.getElementById('panel-orient');
  if (op.classList.contains('show')) checkOrientation();
}
function setLanguage(l) {
  Settings.lang = (l === 'fr') ? 'fr' : 'en';
  Settings.save();
  try { document.documentElement.lang = Settings.lang; } catch (e) {}
  applyI18n();
  syncSettingsUI();
  syncCpuUI();
}
function syncMarbleUI() {
  var opts = document.querySelectorAll('[data-marble]');
  for (var i = 0; i < opts.length; i++) {
    opts[i].setAttribute('aria-pressed',
      opts[i].getAttribute('data-marble') === Settings.marble ? 'true' : 'false');
  }
}
function syncCpuUI() {
  var opts = document.querySelectorAll('[data-cpu]');
  for (var i = 0; i < opts.length; i++) {
    opts[i].setAttribute('aria-pressed',
      opts[i].getAttribute('data-cpu') === Settings.cpu ? 'true' : 'false');
  }
  var key = 'd' + Settings.cpu.charAt(0).toUpperCase() + Settings.cpu.slice(1);
  var d = document.getElementById('cpuDesc');
  if (d) d.textContent = t(key);
}
function syncSettingsUI() {
  var segL = document.getElementById('segLang').children;
  for (var i = 0; i < segL.length; i++)
    segL[i].setAttribute('aria-pressed', segL[i].getAttribute('data-v') === Settings.lang ? 'true' : 'false');
  var segF = document.getElementById('segFx').children;
  for (var j = 0; j < segF.length; j++)
    segF[j].setAttribute('aria-pressed', segF[j].getAttribute('data-v') === Settings.effects ? 'true' : 'false');
  document.getElementById('volRange').value = Math.round(Settings.volume * 100);
  document.getElementById('muteBtn').setAttribute('aria-pressed', Settings.muted ? 'true' : 'false');
  document.body.classList.toggle('reduced', Settings.reduced);
}
