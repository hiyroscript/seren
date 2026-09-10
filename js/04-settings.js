'use strict';

/* ============================================================================
   3. SETTINGS
   ========================================================================== */
var prefersReduced = false;
try { prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

var Settings = {
  lang: Store.get('lang', null),
  volume: clamp(Store.get('volume', 0.7), 0, 1),
  muted: !!Store.get('muted', false),
  effects: Store.get('effects', prefersReduced ? 'reduced' : 'full'),
  marble: Store.get('marble', 'blue'),
  cpu: Store.get('cpu', 'normal'),
  save: function () {
    Store.set('lang', this.lang); Store.set('volume', this.volume);
    Store.set('muted', this.muted); Store.set('effects', this.effects);
    Store.set('marble', this.marble); Store.set('cpu', this.cpu);
  },
  get reduced() { return this.effects === 'reduced'; }
};
