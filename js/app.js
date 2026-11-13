/*
 * bitforge — app.js
 * DOM / canvas wiring. Depends on `BF` from core.js.
 *
 * Structure:
 *   state, helpers, font lifecycle, rendering (canvas), editor interaction,
 *   file ops (PNG/Verilog), persistence (localStorage), tabs, init.
 *
 * The whole thing is wrapped so it only touches `document` inside init(),
 * which is gated on `typeof document !== "undefined"`. That lets `jsc js/app.js`
 * parse + smoke-load it headlessly (see docs/TESTING.md) without a browser.
 */
(function () {
  "use strict";

  var LS_KEY = "bitforge.font.v1";

  // ---------- state ----------
  var state = {
    font: null,        // BF font
    selected: 0,       // selected codepoint (0..255)
    scale: 8,
    bold: false,
    italic: false,
    baseline: 5,
    activeTab: "edit",
    history: [],       // undo: [{ code, snap }]
    redo: []           // redo: [{ code, snap }]
  };
  var editing = null;  // active editor stroke
  var el = {};

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { if (isNaN(n)) n = lo; if (n < lo) n = lo; if (n > hi) n = hi; return n; }
  function hex2(n) { var h = (n & 0xff).toString(16).toUpperCase(); if (h.length < 2) h = "0" + h; return "0x" + h; }
  function printable(cp) { return (cp >= 0x20 && cp <= 0x7e) ? String.fromCharCode(cp) : ""; }
  function selLabel() { var c = state.selected, p = printable(c); return p ? hex2(c) + " · " + p : hex2(c); }

  var toastTimer = null;
  function toast(msg, isErr) {
    el.toast.textContent = msg;
    el.toast.classList.toggle("error", !!isErr);
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3200);
  }

  // ---------- font lifecycle ----------
  function setFont(font) {
    state.font = font;
    state.history = [];
    state.redo = [];
    state.baseline = clamp(state.baseline, 0, font.height - 1);
    el.pvBaseline.max = String(font.height - 1);
    el.pvBaseline.value = String(state.baseline);
    redrawAll();
    saveLS();
  }

  function newFont() {
    var w = parseInt(prompt("Glyph width (px):", state.font ? state.font.width : "8"), 10);
    if (isNaN(w)) return;
    var h = parseInt(prompt("Glyph height (px):", state.font ? state.font.height : "16"), 10);
    if (isNaN(h)) return;
    var v = BF.validateDims(w, h);
    if (!v.ok) { toast(v.error, true); return; }
    if (!confirm("Start a new blank " + w + "×" + h + " font? Unsaved changes are lost.")) return;
    setFont(BF.makeFont(w, h));
    toast("New " + w + "×" + h + " font");
  }

  // ---------- persistence (localStorage) ----------
  function saveLS() {
    try {
      var f = state.font;
      localStorage.setItem(LS_KEY, JSON.stringify({
        w: f.width, h: f.height,
        d: Array.prototype.slice.call(f.data)
      }));
    } catch (e) { /* quota / privacy mode — ignore */ }
  }
  function loadLS() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!BF.validateDims(o.w, o.h).ok) return null;
      var font = BF.makeFont(o.w, o.h);
      var d = font.data;
      for (var i = 0; i < d.length && i < o.d.length; i++) d[i] = o.d[i] ? 1 : 0;
      return font;
    } catch (e) { return null; }
  }

  // ---------- rendering (canvas) ----------
  // Draw one glyph, ink-only, at integer scale. opts: { bold, italic, baseline, red }.
  function drawGlyphTo(ctx, code, px, py, scale, opts) {
    opts = opts || {};
    var f = state.font;
    if (opts.red) {
      ctx.fillStyle = "#e00000";
      ctx.fillRect(px, py, f.width * scale, f.height * scale);
      return;
    }
    ctx.fillStyle = "#111";
    var passes = opts.bold ? [0, 1] : [0]; // artificial bold: also draw +1px right
    for (var p = 0; p < passes.length; p++) {
      var shift = passes[p];
      for (var y = 0; y < f.height; y++) {
        var rowOff = opts.italic ? BF.slantRowOffset(y, f.height, opts.baseline) : 0;
        var base = ((code * f.height) + y) * f.width;
        for (var x = 0; x < f.width; x++) {
          if (f.data[base + x]) {
            ctx.fillRect(px + (x + rowOff + shift) * scale, py + y * scale, scale, scale);
          }
        }
      }
    }
  }

  function editorScale() {
    var m = Math.max(state.font.width, state.font.height);
    var s = Math.floor(360 / m);
    return clamp(s, 6, 40);
  }

  // Pin a canvas's CSS size to its internal pixel size so 1 internal px = 1 CSS px.
  // Keeps cells square and makes pointer->cell mapping exact: without this, flexbox
  // stretches/shrinks the canvas to fit the panel and the click position desyncs.
  function setCanvasSize(c, w, h) {
    c.width = w; c.height = h;
    c.style.width = w + "px";
    c.style.height = h + "px";
  }

  function slantExtent() {
    var f = state.font, min = 0, max = 0;
    if (state.italic) {
      for (var y = 0; y < f.height; y++) {
        var o = BF.slantRowOffset(y, f.height, state.baseline);
        if (o < min) min = o;
        if (o > max) max = o;
      }
    }
    return { min: min, max: max };
  }

  function drawEditor() {
    var f = state.font, c = el.editor, ctx = c.getContext("2d");
    var s = editorScale();
    setCanvasSize(c, f.width * s, f.height * s);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#e2e2e2"; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= f.width; gx++) { ctx.moveTo(gx * s + 0.5, 0); ctx.lineTo(gx * s + 0.5, c.height); }
    for (var gy = 0; gy <= f.height; gy++) { ctx.moveTo(0, gy * s + 0.5); ctx.lineTo(c.width, gy * s + 0.5); }
    ctx.stroke();
    ctx.fillStyle = "#111";
    for (var y = 0; y < f.height; y++)
      for (var x = 0; x < f.width; x++)
        if (BF.getPixel(f, state.selected, x, y)) ctx.fillRect(x * s, y * s, s, s);
  }

  function drawSelector() {
    var f = state.font, c = el.selector, ctx = c.getContext("2d");
    var cell = 16;
    setCanvasSize(c, 16 * cell, 16 * cell);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    var ms = clamp(Math.floor((cell - 2) / Math.max(f.width, f.height)), 1, cell - 2);
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      var ox = col * cell + ((cell - f.width * ms) >> 1);
      var oy = row * cell + ((cell - f.height * ms) >> 1);
      drawGlyphTo(ctx, code, ox, oy, ms, {});
    }
    var sc = state.selected;
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
    ctx.strokeRect((sc % 16) * cell + 1, ((sc / 16) | 0) * cell + 1, cell - 2, cell - 2);
  }

  function drawPvGlyph() {
    var f = state.font, c = el.pvGlyph, ctx = c.getContext("2d");
    var s = state.scale, e = slantExtent();
    var boldExtra = state.bold ? 1 : 0;
    var pad = 1;
    var wpx = f.width + (e.max + boldExtra) - e.min + pad * 2;
    var hpx = f.height + pad * 2;
    setCanvasSize(c, Math.ceil(wpx * s), Math.ceil(hpx * s));
    ctx.clearRect(0, 0, c.width, c.height);
    // faint outline of the nominal glyph cell
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
    ctx.strokeRect((pad - e.min) * s + 0.5, (pad) * s + 0.5, f.width * s - 1, f.height * s - 1);
    drawGlyphTo(ctx, state.selected, (pad - e.min) * s, pad * s, s,
      { bold: state.bold, italic: state.italic, baseline: state.baseline });
  }

  function drawPvText() {
    var f = state.font, c = el.pvTextCanvas, ctx = c.getContext("2d");
    var s = state.scale;
    var wrap = el.pvTextCanvas.parentElement;
    var parentW = (wrap && wrap.clientWidth) || 400;
    var maxCols = clamp(Math.floor((parentW - 32) / (f.width * s)), 4, 128);
    var rawLines = el.pvText.value.split("\n");
    var rows = [];
    for (var li = 0; li < rawLines.length; li++) {
      var items = BF.parseMarkup(rawLines[li]);
      if (items.length === 0) { rows.push([]); continue; }
      for (var i = 0; i < items.length; i++) {
        var row = rows.length ? rows[rows.length - 1] : null;
        if (row === null || row.length >= maxCols) { row = []; rows.push(row); }
        row.push(items[i]);
      }
    }
    if (rows.length === 0) rows.push([]);
    var cols = 0;
    for (var r = 0; r < rows.length; r++) if (rows[r].length > cols) cols = rows[r].length;
    var e = slantExtent();
    var boldExtra = state.bold ? 1 : 0;
    var pad = 2;
    var wpx = cols * f.width + (e.max + boldExtra) - e.min + pad * 2;
    var hpx = rows.length * f.height + pad * 2;
    setCanvasSize(c, Math.ceil(wpx * s), Math.ceil(hpx * s));
    ctx.clearRect(0, 0, c.width, c.height);
    for (r = 0; r < rows.length; r++) {
      for (var i2 = 0; i2 < rows[r].length; i2++) {
        var it = rows[r][i2];
        var gx = (pad + i2 * f.width - e.min) * s;
        var gy = (pad + r * f.height) * s;
        drawGlyphTo(ctx, it.ok ? it.code : -1, gx, gy, s,
          { bold: it.bold, italic: it.italic, baseline: state.baseline, red: !it.ok });
      }
    }
  }

  function drawAtlas() {
    var f = state.font, c = el.atlas, ctx = c.getContext("2d");
    var s = clamp(Math.floor(640 / (16 * f.width)), 1, 8);
    setCanvasSize(c, 16 * f.width * s, 16 * f.height * s);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      drawGlyphTo(ctx, code, col * f.width * s, row * f.height * s, s, {});
    }
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 1; ctx.beginPath();
    for (var i = 0; i <= 16; i++) {
      var gx = i * f.width * s + 0.5; ctx.moveTo(gx, 0); ctx.lineTo(gx, c.height);
      var gy = i * f.height * s + 0.5; ctx.moveTo(0, gy); ctx.lineTo(c.width, gy);
    }
    ctx.stroke();
  }

  function redrawAll() {
    updateSelHeader();
    updateDims();
    drawSelector();
    drawEditor();
    drawPvGlyph();
    drawPvText();
    drawAtlas();
  }
  function updateSelHeader() {
    el.selHeader.textContent = selLabel();
    el.editLabel.textContent = "glyph " + selLabel();
  }
  function updateDims() {
    el.dims.textContent = "W:" + state.font.width + "  H:" + state.font.height;
  }

  // ---------- editor interaction ----------
  function snapshotGlyph(code) {
    var f = state.font, out = [];
    for (var y = 0; y < f.height; y++)
      for (var x = 0; x < f.width; x++) out.push(BF.getPixel(f, code, x, y));
    return out;
  }
  function restoreGlyph(code, snap) {
    var f = state.font;
    for (var i = 0; i < snap.length; i++)
      BF.setPixel(f, code, i % f.width, (i / f.width) | 0, snap[i]);
  }

  function editorPos(evt) {
    var c = el.editor, r = c.getBoundingClientRect();
    var s = editorScale();
    return { x: Math.floor((evt.clientX - r.left) / s), y: Math.floor((evt.clientY - r.top) / s) };
  }

  function applyPaint(x, y, v) {
    if (BF.getPixel(state.font, editing.code, x, y) !== v) {
      BF.setPixel(state.font, editing.code, x, y, v);
      editing.changed = true;
    }
    drawEditor();
  }

  function onEditorDown(evt) {
    var p = editorPos(evt);
    var code = state.selected;
    var cur = BF.getPixel(state.font, code, p.x, p.y);
    var paintValue = (evt.button === 2 || evt.shiftKey) ? 0 : (cur ? 0 : 1);
    editing = { code: code, paintValue: paintValue, snapshot: snapshotGlyph(code), changed: false };
    applyPaint(p.x, p.y, paintValue);
    evt.preventDefault();
  }
  function onEditorMove(evt) {
    if (!editing) return;
    var p = editorPos(evt);
    applyPaint(p.x, p.y, editing.paintValue);
    evt.preventDefault();
  }
  function onEditorUp() {
    if (!editing) return;
    if (editing.changed) {
      state.history.push({ code: editing.code, snap: editing.snapshot });
      if (state.history.length > 100) state.history.shift();
      state.redo = [];
    }
    editing = null;
    redrawAll();
    saveLS();
  }

  function undo() {
    if (!state.history.length) return;
    var entry = state.history.pop();
    state.redo.push({ code: entry.code, snap: snapshotGlyph(entry.code) });
    restoreGlyph(entry.code, entry.snap);
    redrawAll();
    saveLS();
  }
  function redo() {
    if (!state.redo.length) return;
    var entry = state.redo.pop();
    state.history.push({ code: entry.code, snap: snapshotGlyph(entry.code) });
    restoreGlyph(entry.code, entry.snap);
    redrawAll();
    saveLS();
  }

  function selectGlyph(code) {
    state.selected = clamp(code, 0, 255);
    updateSelHeader();
    drawSelector();
    drawEditor();
    drawPvGlyph();
  }

  function doJump() {
    var v = el.jump.value.trim();
    if (!v) return;
    var code;
    if (v.length === 1) code = v.charCodeAt(0);
    else if (/^0x[0-9a-f]{1,2}$/i.test(v)) code = parseInt(v.slice(2), 16);
    else if (/^[0-9a-f]{1,2}$/i.test(v)) code = parseInt(v, 16);
    else { toast("Jump: one char, or hex (e.g. 41 / 0x41)", true); return; }
    el.jump.value = "";
    el.jump.blur();
    selectGlyph(code);
  }

  // ---------- file ops ----------
  function onOpenClick() { el.filePng.click(); }
  function onPngFile(evt) {
    var file = evt.target.files && evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); importPngImage(img); };
    img.onerror = function () { URL.revokeObjectURL(url); toast("Could not load that PNG", true); };
    img.src = url;
  }

  function importPngImage(img) {
    var W = img.naturalWidth, H = img.naturalHeight;
    if (W % 16 !== 0 || H % 16 !== 0) {
      toast("PNG must be a 16×16 atlas — dims " + W + "×" + H + " aren't multiples of 16", true);
      return;
    }
    var cw = W / 16, ch = H / 16;
    if (!BF.validateDims(cw, ch).ok) { toast("Unsupported glyph size " + cw + "×" + ch, true); return; }
    var font = BF.makeFont(cw, ch);
    var tmp = document.createElement("canvas");
    tmp.width = W; tmp.height = H;
    var tctx = tmp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(img, 0, 0);
    var data = tctx.getImageData(0, 0, W, H).data;
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      for (var y = 0; y < ch; y++) {
        for (var x = 0; x < cw; x++) {
          var px = ((row * ch + y) * W + (col * cw + x)) * 4;
          if (BF.isInk(data[px], data[px + 1], data[px + 2], data[px + 3]))
            BF.setPixel(font, code, x, y, 1);
        }
      }
    }
    setFont(font);
    toast("Imported " + cw + "×" + ch + " font from " + W + "×" + H + " PNG");
  }

  function exportPng() {
    var f = state.font, transparent = el.chkPngTransparent.checked;
    var W = 16 * f.width, H = 16 * f.height;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    if (!transparent) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = "#000";
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      for (var y = 0; y < f.height; y++)
        for (var x = 0; x < f.width; x++)
          if (BF.getPixel(f, code, x, y)) ctx.fillRect(col * f.width + x, row * f.height + y, 1, 1);
    }
    c.toBlob(function (blob) {
      if (blob) downloadBlob(blob, "bitforge-atlas.png");
      else toast("PNG export failed", true);
    }, "image/png");
  }

  function exportVerilog() {
    downloadText(BF.toVerilog(state.font), "bitforge-font.mem");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadText(text, filename) {
    downloadBlob(new Blob([text], { type: "text/plain" }), filename);
  }

  // ---------- tabs ----------
  function setActiveTab(name) {
    state.activeTab = name;
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++)
      tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === name);
    var panels = document.querySelectorAll(".panel");
    for (i = 0; i < panels.length; i++)
      panels[i].classList.toggle("active", panels[i].id === "panel-" + name);
    redrawAll();
  }

  // ---------- init ----------
  function init() {
    el = {
      selHeader: $("sel-header"), jump: $("jump"), btnJump: $("btn-jump"), selector: $("selector"),
      dims: $("dims"),
      btnNew: $("btn-new"), btnOpen: $("btn-open"), filePng: $("file-png"),
      btnExportPng: $("btn-export-png"), btnExportVerilog: $("btn-export-verilog"),
      chkPngTransparent: $("chk-png-transparent"),
      btnClear: $("btn-clear"), btnUndo: $("btn-undo"), btnRedo: $("btn-redo"),
      editor: $("editor"), editLabel: $("edit-label"),
      pvScale: $("pv-scale"), pvBold: $("pv-bold"), pvItalic: $("pv-italic"), pvBaseline: $("pv-baseline"),
      pvGlyph: $("pv-glyph"), pvText: $("pv-text"), pvTextCanvas: $("pv-text-canvas"),
      atlas: $("atlas"), toast: $("toast")
    };

    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++)
      tabs[i].addEventListener("click", function () { setActiveTab(this.getAttribute("data-tab")); });

    el.btnNew.addEventListener("click", newFont);
    el.btnOpen.addEventListener("click", onOpenClick);
    el.filePng.addEventListener("change", onPngFile);
    el.btnExportPng.addEventListener("click", exportPng);
    el.btnExportVerilog.addEventListener("click", exportVerilog);

    el.btnClear.addEventListener("click", function () {
      var code = state.selected;
      state.history.push({ code: code, snap: snapshotGlyph(code) });
      if (state.history.length > 100) state.history.shift();
      BF.clearGlyph(state.font, code);
      state.redo = [];
      redrawAll();
      saveLS();
    });
    el.btnUndo.addEventListener("click", undo);
    el.btnRedo.addEventListener("click", redo);

    el.editor.addEventListener("mousedown", onEditorDown);
    el.editor.addEventListener("mousemove", onEditorMove);
    window.addEventListener("mouseup", onEditorUp);
    el.editor.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    el.btnJump.addEventListener("click", doJump);
    el.jump.addEventListener("keydown", function (e) { if (e.key === "Enter") doJump(); });

    el.pvScale.addEventListener("input", function () {
      state.scale = clamp(parseInt(this.value, 10) || 1, 1, 64);
      drawPvGlyph(); drawPvText();
    });
    el.pvBold.addEventListener("change", function () { state.bold = this.checked; drawPvGlyph(); });
    el.pvItalic.addEventListener("change", function () { state.italic = this.checked; drawPvGlyph(); drawPvText(); });
    el.pvBaseline.addEventListener("input", function () {
      state.baseline = clamp(parseInt(this.value, 10) || 0, 0, state.font.height - 1);
      drawPvGlyph(); drawPvText();
    });
    el.pvText.addEventListener("input", function () { drawPvText(); });

    window.addEventListener("keydown", function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (k === "y") { e.preventDefault(); redo(); }
    });

    state.scale = clamp(parseInt(el.pvScale.value, 10) || 8, 1, 64);
    var font = loadLS() || BF.makeFont(8, 16);
    state.baseline = clamp(parseInt(el.pvBaseline.value, 10) || 5, 0, font.height - 1);
    setFont(font);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
