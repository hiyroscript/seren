'use strict';

/* ============================================================================
   4. AUDIO — every sound is synthesised with the Web Audio API.
   No files, no music: short, soft, tonal feedback only.
   ========================================================================== */
var Sound = {
  ctx: null, master: null, noiseBuf: null, ready: false,

  init: function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.level();
      this.master.connect(this.ctx.destination);
      /* one shared noise buffer for impacts */
      var len = Math.floor(this.ctx.sampleRate * 0.4);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.ready = true;
    } catch (e) { this.ready = false; }
  },
  /* mobile browsers only allow audio after a gesture */
  unlock: function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
  },
  level: function () { return Settings.muted ? 0 : clamp(Settings.volume, 0, 1) * 0.55; },
  apply: function () {
    if (!this.master) return;
    try { this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.02); }
    catch (e) { this.master.gain.value = this.level(); }
  },

  tone: function (o) {
    if (!this.ready || this.ctx.state === 'suspended') return;
    var c = this.ctx, t0 = c.currentTime + (o.delay || 0);
    var dur = o.dur || 0.12, peak = (o.peak === undefined ? 0.3 : o.peak);
    if (peak <= 0) return;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  },
  noise: function (o) {
    if (!this.ready || !this.noiseBuf || this.ctx.state === 'suspended') return;
    var c = this.ctx, t0 = c.currentTime + (o.delay || 0), dur = o.dur || 0.16;
    var src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    src.buffer = this.noiseBuf;
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.cut || 1400, t0);
    if (o.cut2) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.cut2), t0 + dur);
    g.gain.setValueAtTime(Math.max(0.0001, o.peak || 0.25), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  },

  play: function (name) {
    if (!this.ready) return;
    switch (name) {
      case 'ui':        this.tone({ f0: 620, f1: 640, dur: .07, type: 'sine', peak: .16 }); break;
      case 'uiBack':    this.tone({ f0: 420, f1: 380, dur: .09, type: 'sine', peak: .14 }); break;
      case 'start':
        this.tone({ f0: 392, dur: .12, type: 'triangle', peak: .2 });
        this.tone({ f0: 587, dur: .22, type: 'triangle', peak: .18, delay: .09 });
        break;
      case 'count':     this.tone({ f0: 494, dur: .1, type: 'sine', peak: .2 }); break;
      case 'go':
        this.tone({ f0: 660, f1: 990, dur: .26, type: 'triangle', peak: .24 });
        this.tone({ f0: 990, dur: .18, type: 'sine', peak: .1, delay: .05 });
        break;
      case 'laneL':     this.tone({ f0: 330, f1: 280, dur: .06, type: 'triangle', peak: .13 }); break;
      case 'laneR':     this.tone({ f0: 350, f1: 410, dur: .06, type: 'triangle', peak: .13 }); break;
      case 'crouchIn':  this.tone({ f0: 240, f1: 150, dur: .1, type: 'sine', peak: .15 }); break;
      case 'crouchOut': this.tone({ f0: 190, f1: 300, dur: .09, type: 'sine', peak: .11 }); break;
      case 'speedUp':
        this.tone({ f0: 523, dur: .1, type: 'triangle', peak: .14 });
        this.tone({ f0: 784, dur: .18, type: 'triangle', peak: .13, delay: .08 });
        break;
      case 'pop':
        this.tone({ f0: 1400, f1: 420, dur: .1, type: 'sine', peak: .13 });
        this.noise({ dur: .07, peak: .1, cut: 4200, cut2: 900 });
        break;
      case 'popFar':
        this.tone({ f0: 1200, f1: 420, dur: .08, type: 'sine', peak: .05 });
        break;
      case 'boost':
        this.tone({ f0: 320, f1: 880, dur: .22, type: 'triangle', peak: .17 });
        this.tone({ f0: 640, f1: 1760, dur: .18, type: 'sine', peak: .09, delay: .04 });
        break;
      case 'boostFar':
        this.tone({ f0: 300, f1: 760, dur: .14, type: 'sine', peak: .06 });
        break;
      case 'bump':
        this.noise({ dur: .12, peak: .3, cut: 1600, cut2: 400 });
        this.tone({ f0: 220, f1: 130, dur: .16, type: 'square', peak: .16 });
        break;
      case 'bumpFar':
        this.tone({ f0: 200, f1: 140, dur: .1, type: 'sine', peak: .07 });
        break;
      case 'hitFar':
        this.noise({ dur: .13, peak: .1, cut: 1200, cut2: 260 });
        break;
      case 'hit':
        this.noise({ dur: .22, peak: .34, cut: 2200, cut2: 200 });
        this.tone({ f0: 150, f1: 52, dur: .3, type: 'sine', peak: .3 });
        break;
      case 'respawn':
        this.tone({ f0: 300, f1: 620, dur: .22, type: 'sine', peak: .17 });
        break;
      case 'immuneEnd':
        this.tone({ f0: 720, dur: .06, type: 'sine', peak: .1 });
        this.tone({ f0: 900, dur: .08, type: 'sine', peak: .09, delay: .07 });
        break;
      case 'finalStage':
        this.tone({ f0: 196, dur: .5, type: 'triangle', peak: .16 });
        this.tone({ f0: 294, dur: .5, type: 'triangle', peak: .13, delay: .1 });
        this.tone({ f0: 392, dur: .7, type: 'sine', peak: .12, delay: .2 });
        break;
      case 'suction':
        this.tone({ f0: 880, f1: 90, dur: 1.15, type: 'sawtooth', peak: .11 });
        this.noise({ dur: 1.1, peak: .12, cut: 900, cut2: 120 });
        break;
      case 'complete':
        this.tone({ f0: 523, dur: .3, type: 'triangle', peak: .2 });
        this.tone({ f0: 659, dur: .3, type: 'triangle', peak: .18, delay: .1 });
        this.tone({ f0: 784, dur: .34, type: 'triangle', peak: .17, delay: .2 });
        this.tone({ f0: 1047, dur: .6, type: 'sine', peak: .15, delay: .3 });
        break;
    }
  }
};
