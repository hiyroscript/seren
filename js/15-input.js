'use strict';

/* ============================================================================
   13. INPUT — keyboard, mouse and a gesture system built around one rule:
   a lane change needs a decisive, deliberate swipe. Crouching is a dedicated
   button, so a hold and a swipe can never be confused for one another.
   ========================================================================== */
/* pointer ids are normalised to strings: object keys are strings, so a promoted
   pointer would otherwise never match its own pointerup */
function pid(e) { return String(e.pointerId === undefined ? 'mouse' : e.pointerId); }

var Input = {
  crouchHeld: false,
  crouchKeys: {},
  pointers: {},          /* id -> {x,y,x0,y0,t0,lx,ly,lt,swiped,crouching} */
  crouchHold: 0,         /* keeps a quick flick down readable */
  laneLock: 0,           /* two fingers can never spend one swipe twice */

  /* a swipe must travel this far before it counts as intent */
  swipeDist: function () { return Math.max(46, Math.min(VIEW.w, VIEW.h) * 0.090); },
  SWIPE_WINDOW: 0.45,    /* seconds: a slow drag is not a swipe */
  SWIPE_RATIO: 1.4,      /* one axis must clearly beat the other */
  REANCHOR: 0.12,        /* a finger that pauses starts a fresh swipe from there */
  MIN_CROUCH: 0.30,      /* a flick down still ducks long enough to matter */
  LANE_COOLDOWN: 0.09,

  releaseAll: function () {
    this.crouchHeld = false; this.crouchKeys = {};
    this.pointers = {}; this.crouchHold = 0; this.laneLock = 0;
  },

  /* gameplay input is dead until the countdown has fully finished */
  canPlay: function () {
    if (App.blocked) return false;
    if (Player && Player.inBubble()) return false;   /* a passenger until it lets go */
    return App.state === ST.PLAYING || App.state === ST.RESPAWNING;
  },
  canPause: function () {
    return !App.blocked && (App.state === ST.PLAYING || App.state === ST.RESPAWNING ||
                            App.state === ST.COUNTDOWN);
  },
  move: function (dir) {
    if (!this.canPlay() || !Player.alive) return;
    Player.setLane(Player.lane + dir);
  },

  /* crouch is held for as long as a finger that swiped down stays on the glass */
  anyFingerDown: function () {
    for (var k in this.pointers) if (this.pointers[k].crouching) return true;
    return false;
  },
  anyKeyCrouch: function () {
    for (var k in this.crouchKeys) if (this.crouchKeys[k]) return true;
    return false;
  },
  updateHold: function () {
    this.crouchHeld = this.anyFingerDown() || this.anyKeyCrouch() || this.crouchHold > 0;
  },
  tick: function (dt) {
    /* the floor is measured from the swipe, so lifting after a long hold
       stands the player up at once */
    if (this.crouchHold > 0) this.crouchHold = Math.max(0, this.crouchHold - dt);
    if (this.laneLock > 0) this.laneLock = Math.max(0, this.laneLock - dt);
    this.updateHold();
  },

  /* start a fresh swipe measurement from the current point */
  anchor: function (p, x, y) {
    p.x0 = x; p.y0 = y; p.t0 = App.time; p.swiped = false; p.dirX = 0; p.peak = x;
  },

  onDown: function (e) {
    Sound.unlock();
    var id = pid(e);

    if (App.state === ST.SPLASH) { Splash.t = Math.max(Splash.t, CFG.SPLASH_TIME - 0.5); return; }
    if (App.state === ST.HOME && Iris.mode !== 'in') { Home.press(e.clientX, e.clientY); return; }
    if (!this.canPlay()) return;

    this.pointers[id] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY,
      lx: e.clientX, ly: e.clientY, lt: App.time, t0: App.time,
      swiped: false, crouching: false, dirX: 0, peak: e.clientX };
  },
  onMove: function (e) {
    var id = pid(e);
    if (App.state === ST.HOME && e.pointerType === 'mouse') Home.hover(e.clientX, e.clientY);
    var p = this.pointers[id];
    if (!p) return;
    var now = App.time, need = this.swipeDist();
    var rest = now - p.lt;              /* how long this finger has been still */

    if (p.swiped) {
      /* the flick is spent. It renews only when the finger clearly reverses or
         comes to rest — so one long drag is still one column, but a second
         deliberate flick works even with the finger never leaving the glass. */
      p.peak = p.dirX > 0 ? Math.max(p.peak, e.clientX) : Math.min(p.peak, e.clientX);
      var back = p.dirX > 0 ? p.peak - e.clientX : e.clientX - p.peak;
      if (back > need * 0.32 || rest > 0.10) this.anchor(p, e.clientX, e.clientY);
    } else if (rest > this.REANCHOR && Math.hypot(e.clientX - p.lx, e.clientY - p.ly) < 4) {
      /* a finger that paused starts its next gesture from where it stopped */
      this.anchor(p, e.clientX, e.clientY);
    }
    p.x = e.clientX; p.y = e.clientY;
    p.lx = e.clientX; p.ly = e.clientY; p.lt = now;

    var dx = e.clientX - p.x0, dy = e.clientY - p.y0;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    var quick = (now - p.t0) <= this.SWIPE_WINDOW;
    if (!quick) return;

    /* swipe DOWN, then keep the finger on the glass: that is the crouch */
    if (!p.crouching && dy > 0 && ady >= need && ady > adx * this.SWIPE_RATIO) {
      p.crouching = true;
      this.crouchHold = this.MIN_CROUCH;
      this.updateHold();
      /* measure again from here, so a flick sideways still steers while ducked */
      this.anchor(p, e.clientX, e.clientY);
      return;
    }
    /* a decisive sideways swipe changes column, exactly one column per flick */
    if (!p.swiped && adx >= need && adx > ady * this.SWIPE_RATIO && this.laneLock <= 0) {
      p.swiped = true;
      p.dirX = dx > 0 ? 1 : -1;
      p.peak = e.clientX;
      this.laneLock = this.LANE_COOLDOWN;
      this.move(p.dirX);
    }
  },
  onUp: function (e) {
    var id = pid(e);
    var p = this.pointers[id];
    if (App.state === ST.HOME) { Home.release(e.clientX, e.clientY); }
    if (!p) return;
    delete this.pointers[id];
    this.updateHold();
  },

  onKeyDown: function (e) {
    Sound.unlock();
    var k = e.key;
    if (k === 'Escape') {
      if (App.state === ST.PAUSED) resumeGame();
      else if (Input.canPause()) pauseGame();
      e.preventDefault();
      return;
    }
    if (k === ' ' || k === 'Spacebar') e.preventDefault();
    if (App.state === ST.HOME && (k === 'Enter' || k === ' ')) { Home.activate('start'); return; }
    if (!Input.canPlay()) return;
    if (e.repeat) { if (k === ' ' || k === 's' || k === 'S' || k === 'ArrowDown') Input.crouchKeys[k] = true; return; }

    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'q' || k === 'Q') { Input.move(-1); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { Input.move(1); e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === ' ' || k === 'Spacebar') {
      Input.crouchKeys[k] = true; e.preventDefault();
    }
  },
  onKeyUp: function (e) {
    delete Input.crouchKeys[e.key];
    Input.updateHold();
  }
};
