/*
 * bitforge — minimal DOM / canvas stub for headless smoke-testing app.js under jsc.
 *
 * Just enough of `document` / `window` / `localStorage` for app.js's init() to run
 * and its draw functions to execute. It is NOT a real DOM — it exists so we can
 * catch element-ID typos, BF-method typos, and init-time runtime errors without a
 * browser. Install it BEFORE loading js/app.js; app.js registers init as the
 * DOMContentLoaded handler (we force readyState="loading"), and the test invokes it.
 */
(function (root) {
  "use strict";

  function makeCtx() {
    return {
      fillStyle: "", strokeStyle: "", lineWidth: 1,
      fillRect: function () {}, strokeRect: function () {}, clearRect: function () {},
      beginPath: function () {}, moveTo: function () {}, lineTo: function () {},
      stroke: function () {}, fill: function () {}, drawImage: function () {},
      getImageData: function () { return { data: [] }; },
      fillText: function () {}
    };
  }

  var els = {};
  function makeEl(id) {
    return {
      id: id,
      _ctx: null,
      addEventListener: function () {},
      removeEventListener: function () {},
      classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
      value: "", max: "", checked: false, hidden: true, textContent: "",
      style: {}, clientWidth: 400, clientHeight: 300,
      width: 0, height: 0,
      parentElement: { clientWidth: 400 },
      getAttribute: function (n) { return this["data-" + n] != null ? this["data-" + n] : null; },
      setAttribute: function (n, v) { this[n] = v; },
      getContext: function () { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; },
      getBoundingClientRect: function () { return { left: 0, top: 0, width: this.width, height: this.height }; },
      toBlob: function (cb) { cb && cb(null); },
      focus: function () {}, blur: function () {}, click: function () {}
    };
  }

  var documentStub = {
    readyState: "loading",
    _ready: null,
    addEventListener: function (name, cb) { if (name === "DOMContentLoaded") this._ready = cb; },
    getElementById: function (id) { return els[id] || (els[id] = makeEl(id)); },
    querySelectorAll: function () { return []; },
    createElement: function () { return makeEl("__tmp__"); },
    body: { appendChild: function () {}, removeChild: function () {} }
  };

  root.document = documentStub;
  root.window = { addEventListener: function () {} };

  var store = {};
  root.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };

  root.Image = function () { this.naturalWidth = 0; this.naturalHeight = 0; };
  root.URL = { createObjectURL: function () { return "blob:stub"; }, revokeObjectURL: function () {} };
  root.Blob = function (parts, opts) { this.parts = parts; this.type = opts && opts.type; };

  root.__stub = {
    els: els,
    runInit: function () { documentStub._ready(); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
