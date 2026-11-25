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
      // fillStyle of every fillRect, in call order (DECISIONS #79 tests assert
      // the theme-aware glyph ink drawn on the editor/selector canvases).
      rects: [],
      // [x, y] of every moveTo/lineTo, in call order (DECISIONS #86 tests
      // assert WHERE lines are drawn, e.g. a guide at the far cell edge).
      path: [],
      fillRect: function (x, y, w, h) { this.rects.push(this.fillStyle); }, strokeRect: function () {}, clearRect: function () {},
      beginPath: function () {}, moveTo: function (x, y) { this.path.push([x, y]); }, lineTo: function (x, y) { this.path.push([x, y]); },
      stroke: function () {}, fill: function () {}, drawImage: function () {},
      save: function () {}, restore: function () {}, setLineDash: function () {},
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
      // Real (tiny) class tracking so tests can assert e.g. the active status button.
      classList: (function () {
        var set = {};
        return {
          toggle: function (c, force) {
            var want = (force == null) ? !set[c] : !!force;
            if (want) set[c] = true; else delete set[c];
            return want;
          },
          add: function (c) { set[c] = true; },
          remove: function (c) { delete set[c]; },
          contains: function (c) { return !!set[c]; }
        };
      })(),
      value: "", max: "", checked: false, hidden: true, textContent: "",
      style: {}, clientWidth: 400, clientHeight: 300,
      width: 0, height: 0,
      parentElement: { clientWidth: 400 },
      getAttribute: function (n) {
        if (this[n] != null) return this[n];
        return this["data-" + n] != null ? this["data-" + n] : null;
      },
      setAttribute: function (n, v) { this[n] = v; },
      // Minimal real child tracking: tests inspect rows built via
      // createElement/appendChild (QA table, guide chips). Setting innerHTML
      // clears the children, like the real DOM.
      _children: [],
      _html: "",
      get children() { return this._children; },
      get firstChild() { return this._children.length ? this._children[0] : null; },
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = String(v); this._children.length = 0; },
      appendChild: function (c) { this._children.push(c); return c; },
      insertBefore: function (c, ref) {
        var i = ref ? this._children.indexOf(ref) : -1;
        if (i < 0) this._children.push(c); else this._children.splice(i, 0, c);
        return c;
      },
      removeChild: function (c) {
        var i = this._children.indexOf(c);
        if (i >= 0) this._children.splice(i, 1);
        return c;
      },
      getContext: function () { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; },
      getBoundingClientRect: function () { return { left: 0, top: 0, width: this.width, height: this.height }; },
      // Passes the stub's fake blob (null by default = rasterization failed).
      // Tests set __stub.blob to exercise the success path (see copy-glyph tests).
      toBlob: function (cb) { cb && cb(root.__stub.blob || null); },
      focus: function () {}, blur: function () {},
      // downloadBlob() sets a.download and clicks; record the filename so
      // tests can assert export names (DECISIONS #70).
      click: function () { if (this.download != null) root.__stub.downloads.push(this.download); }
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
    // DOMContentLoaded is special (init); other names (mousedown/keydown) are
    // stored so tests can exercise document-level paths via __stub.docDispatch.
    addEventListener: function (name, cb) {
      if (name === "DOMContentLoaded") this._ready = cb;
      else { this._listeners = this._listeners || ({}); this._listeners[name] = cb; }
    },
    getElementById: function (id) { return els[id] || (els[id] = makeEl(id)); },
    querySelectorAll: function (sel) {
      buildLists();
      if (sel === ".tab") return tabEls;
      if (sel === ".gadd button") return gaddEls;
      return [];
    },
    createElement: function () { return makeEl("__tmp__"); },
    body: { appendChild: function () {}, removeChild: function () {} },
    // Theme target (DECISIONS #79): app.js sets data-theme on <html>; the
    // stub records it so tests can assert the resolved theme.
    documentElement: {
      _attrs: {},
      setAttribute: function (n, v) { this._attrs[n] = String(v); },
      getAttribute: function (n) { return Object.prototype.hasOwnProperty.call(this._attrs, n) ? this._attrs[n] : null; },
      removeAttribute: function (n) { delete this._attrs[n]; }
    }
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
  // confirm() for replace-on-import flows: answers "yes" by default; tests
  // flip it with __stub.setConfirm(false) to simulate the user canceling.
  var confirmAnswer = true;
  root.confirm = function () { return confirmAnswer; };

  root.__stub = {
    els: els,
    runInit: function () { documentStub._ready(); },
    downloads: [],         // filenames passed to a.download + click()
    blob: null,            // fake canvas.toBlob result (null = failed)
    setConfirm: function (v) { confirmAnswer = v != null ? !!v : true; },
    clipboardCalls: [],    // ClipboardItem arrays passed to navigator.clipboard.write
    setClipboard: function (mode) {
      if (mode === "available")
        root.navigator.clipboard = {
          write: function (items) {
            root.__stub.clipboardCalls.push(items);
            return { then: function (ok) { ok && ok(); return this; } };
          },
          // read(): resolves with __stub.clipboardRead (a list of fake
          // ClipboardItems with { types, getType }), or rejects when
          // __stub.clipboardReadError is set (permission denial).
          read: function () {
            return { then: function (ok, err) {
              if (root.__stub.clipboardReadError) { err && err(new Error("denied")); return this; }
              ok && ok(root.__stub.clipboardRead || []);
              return this;
            } };
          }
        };
      else root.navigator.clipboard = null;
    },
    clipboardRead: [],      // items returned by the stub's clipboard.read()
    clipboardReadError: false,
    // Invoke a document-level listener (menu mousedown-close, Escape close).
    // NOTE: the stub does not model the DOM tree — for the menu "inside" walk
    // to reach the container, set the target's parentElement chain in the test
    // (e.g. els["mi-x"].parentElement = els["menu-file"]).
    docDispatch: function (name, evt) {
      var cb = documentStub._listeners && documentStub._listeners[name];
      if (cb) cb.call(documentStub, evt);
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
