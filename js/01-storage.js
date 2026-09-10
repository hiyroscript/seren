'use strict';

/* ============================================================================
   1. STORAGE — always safe, never throws if localStorage is blocked/cleared
   ========================================================================== */
var Store = {
  ok: (function () {
    try { localStorage.setItem('__seren_t', '1'); localStorage.removeItem('__seren_t'); return true; }
    catch (e) { return false; }
  })(),
  get: function (k, d) {
    if (!this.ok) return d;
    try { var v = localStorage.getItem('seren.' + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) {
    if (!this.ok) return;
    try { localStorage.setItem('seren.' + k, JSON.stringify(v)); } catch (e) { /* quota / private mode */ }
  }
};
