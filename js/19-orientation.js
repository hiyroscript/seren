'use strict';

/* ============================================================================
   ORIENTATION GATE
   ========================================================================== */
function checkOrientation() {
  var bad = null;
  if (IS_MOBILE) { if (VIEW.w > VIEW.h * 1.02) bad = 'rotate'; }
  else if (VIEW.h > VIEW.w || VIEW.w < 620) bad = 'landscape';

  App.blocked = !!bad;
  var p = document.getElementById('panel-orient');
  if (bad) {
    document.getElementById('orientTitle').textContent = t(bad === 'rotate' ? 'rotate' : 'landscape');
    document.getElementById('orientNote').textContent = t(bad === 'rotate' ? 'rotateNote' : 'landscapeNote');
    p.classList.add('show');
    Input.releaseAll();
    if (Player) Player.crouch = false;
  } else {
    p.classList.remove('show');
  }
  syncChrome();
}
