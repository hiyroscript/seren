'use strict';

/* ============================================================================
   HOME interaction
   ========================================================================== */
var Home = {
  hitAt: function (x, y) {
    var list = homeCircles();
    for (var i = list.length - 1; i >= 0; i--) {
      var c = list[i], fl = homeFloat(c, i);
      if (Math.hypot(x - (c.x + fl.x), y - (c.y + fl.y)) <= c.r * 1.06) return c;
    }
    return null;
  },
  hover: function (x, y) {
    var hit = this.hitAt(x, y);
    var list = homeCircles();
    for (var i = 0; i < list.length; i++) fx(list[i].id).hoverTarget = (hit && hit.id === list[i].id) ? 1 : 0;
    canvas.style.cursor = hit ? 'pointer' : 'default';
  },
  press: function (x, y) {
    var hit = this.hitAt(x, y);
    if (!hit) return;
    this.pressed = hit.id;
    fx(hit.id).pressTarget = 1;
    fx(hit.id).press = 0.7;
  },
  release: function (x, y) {
    var id = this.pressed;
    this.pressed = null;
    var list = homeCircles();
    for (var i = 0; i < list.length; i++) fx(list[i].id).pressTarget = 0;
    if (!id) return;
    var hit = this.hitAt(x, y);
    if (hit && hit.id === id) this.activate(id, hit);
  },
  activate: function (id, c) {
    if (Iris.mode === 'in') return;      /* a transition is already committed */
    if (!c) { var l = homeCircles(); for (var i = 0; i < l.length; i++) if (l[i].id === id) c = l[i]; }
    if (!c) return;
    Sound.unlock();
    var i2 = 0, list = homeCircles();
    for (var j = 0; j < list.length; j++) if (list[j].id === id) i2 = j;
    var fl = homeFloat(c, i2);
    VFX.ripple(c.x + fl.x, c.y + fl.y, c.r, c.r * 1.9, c.color, .6, 2);

    if (id === 'start') {
      Sound.play('start');
      irisIn(c.x + fl.x, c.y + fl.y, c.r * 0.96, function () {
        Run.begin();
        irisOut(VIEW.w / 2, VIEW.h / 2);
      });
    } else if (id === 'settings') {
      Sound.play('ui'); App.prev = ST.HOME; App.set(ST.SETTINGS); Screens.show('settings');
    } else if (id === 'howto') {
      Sound.play('ui'); App.set(ST.HOWTO); Screens.show('howto');
    } else if (id === 'marble') {
      Sound.play('ui'); App.set(ST.MARBLE); Screens.show('marble');
    } else if (id === 'cpu') {
      Sound.play('ui'); App.set(ST.CPU); Screens.show('cpu');
    } else {
      Sound.play('ui');
      VFX.burst(c.x + fl.x, c.y + fl.y, 10, { color: c.color, spMax: 180, sizeMax: 4 });
    }
  }
};
