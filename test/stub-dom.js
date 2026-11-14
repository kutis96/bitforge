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
      _listeners: {},
      addEventListener: function (t, cb) { (this._listeners[t] = this._listeners[t] || []).push(cb); },
      removeEventListener: function () {},
      classList: { toggle: function () {}, add: function () {}, remove: function () {}, contains: function () { return false; } },
      value: "", max: "", checked: false, hidden: true, textContent: "",
      style: {}, clientWidth: 400, clientHeight: 300,
      width: 0, height: 0,
      parentElement: { clientWidth: 400 },
      getAttribute: function (n) {
        if (this[n] != null) return this[n];
        return this["data-" + n] != null ? this["data-" + n] : null;
      },
      setAttribute: function (n, v) { this[n] = v; },
      appendChild: function () {},
      insertBefore: function () {},
      getContext: function () { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; },
      getBoundingClientRect: function () { return { left: 0, top: 0, width: this.width, height: this.height }; },
      // Passes the stub's fake blob (null by default = rasterization failed).
      // Tests set __stub.blob to exercise the success path (see copy-glyph tests).
      toBlob: function (cb) { cb && cb(root.__stub.blob || null); },
      focus: function () {}, blur: function () {}, click: function () {}
    };
  }

  // Fake element lists so app.js's querySelectorAll loops actually execute
  // under jsc (they previously returned [], silently skipping the code).
  var tabEls = null, gaddEls = null;
  function buildLists() {
    if (tabEls) return;
    tabEls = [];
    var tabs = ["edit", "preview", "atlas"];
    for (var i = 0; i < tabs.length; i++) {
      var t = makeEl("tab-" + tabs[i]);
      t["data-tab"] = tabs[i];
      tabEls.push(t);
    }
    gaddEls = [];
    var gkeys = ["ascender", "cap", "xheight", "baseline", "descender", "left", "right", "hnew", "vnew"];
    for (var j = 0; j < gkeys.length; j++) {
      var b = makeEl("gbtn-" + gkeys[j]);
      b["data-g"] = gkeys[j];
      gaddEls.push(b);
    }
  }

  var documentStub = {
    readyState: "loading",
    _ready: null,
    // Settable by tests to exercise the shortcut dispatcher's input suppression
    // (typing "e" in the jump field must not switch tabs).
    activeElement: null,
    addEventListener: function (name, cb) { if (name === "DOMContentLoaded") this._ready = cb; },
    getElementById: function (id) { return els[id] || (els[id] = makeEl(id)); },
    querySelectorAll: function (sel) {
      buildLists();
      if (sel === ".tab") return tabEls;
      if (sel === ".gadd button") return gaddEls;
      return [];
    },
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

  // jsc lacks these browser globals (toast() uses clearTimeout)
  if (!root.clearTimeout) root.clearTimeout = function () {};
  if (!root.setTimeout) root.setTimeout = function () { return 0; };

  root.Image = function () { this.naturalWidth = 0; this.naturalHeight = 0; };
  root.URL = { createObjectURL: function () { return "blob:stub"; }, revokeObjectURL: function () {} };
  root.Blob = function (parts, opts) { this.parts = parts; this.type = opts && opts.type; };
  root.FileReader = function () { this.result = ""; };
  root.FileReader.prototype.readAsText = function () {};
  // Clipboard API surface: off by default (exercises the download fallback);
  // tests flip it on with __stub.setClipboard("available"). The stub's write()
  // returns a synchronously-settling thenable so tests stay deterministic
  // (no microtask flushing under jsc).
  root.navigator = { clipboard: null };
  root.ClipboardItem = function (o) { this.data = o; };

  root.__stub = {
    els: els,
    runInit: function () { documentStub._ready(); },
    blob: null,            // fake canvas.toBlob result (null = failed)
    clipboardCalls: [],    // ClipboardItem arrays passed to navigator.clipboard.write
    setClipboard: function (mode) {
      if (mode === "available")
        root.navigator.clipboard = { write: function (items) {
          root.__stub.clipboardCalls.push(items);
          return { then: function (ok) { ok && ok(); return this; } };
        } };
      else root.navigator.clipboard = null;
    },
    // Invoke event handlers registered on an element (for testing click wiring).
    dispatch: function (id, type, evt) {
      var x = els[id];
      if (!x || !x._listeners) return;
      var ls = x._listeners[type] || [];
      for (var i = 0; i < ls.length; i++) ls[i].call(x, evt);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
