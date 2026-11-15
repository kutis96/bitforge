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
    redo: [],          // redo: [{ code, snap }]
    glocked: true,     // guidelines locked (can't drag) by default
    ref: null,         // reference glyph code for the editor underlay (session-only)
    inverted: false,   // preview surfaces: white on black
    fontVersion: 0     // bumped on every font mutation; drives QA staleness
  };
  var editing = null;   // active editor stroke
  var guideDrag = null; // active guideline drag: { g, moved }
  var atlasGeo = { s: 1, pad: 0, colW: 8 }; // last drawAtlas geometry (click mapping)
  var el = {};

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function clamp(n, lo, hi) { if (isNaN(n)) n = lo; if (n < lo) n = lo; if (n > hi) n = hi; return n; }
  function hex2(n) { var h = (n & 0xff).toString(16).toUpperCase(); if (h.length < 2) h = "0" + h; return "0x" + h; }
  function printable(cp) { return (cp >= 0x20 && cp <= 0x7e) ? String.fromCharCode(cp) : ""; }
  function selLabel() { var c = state.selected, p = printable(c); return p ? hex2(c) + " · " + p : hex2(c); }

  var toastTimer = null, lastToast = null;
  function toast(msg, isErr) {
    lastToast = msg;
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
    state.fontVersion = 0;
    state.baseline = clamp(state.baseline, 0, font.height - 1);
    syncRenderControls();
    qaReset();
    redrawAll();
    renderGuideList();
    saveLS();
  }

  // Every font mutation (stroke end, clear, shift, status change) bumps this;
  // a QA report is "stale" whenever the version moved since its last refresh.
  function bumpFontVersion() {
    state.fontVersion++;
    updateQaBadge();
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
        d: Array.prototype.slice.call(f.data),
        g: f.guidelines,
        s: Array.prototype.slice.call(f.status),
        si: f.silences
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
      if (Array.isArray(o.g)) {
        font.guidelines = [];
        for (var k = 0; k < o.g.length; k++) {
          var e = o.g[k];
          if (e && (e.o === "h" || e.o === "v") && isFinite(e.off) && e.off === (e.off | 0))
            font.guidelines.push({ o: e.o, off: e.off, label: String(e.label != null ? e.label : e.o), color: String(e.color != null ? e.color : "#444444") });
        }
      }
      if (Array.isArray(o.s) && o.s.length === BF.NUM_GLYPHS) {
        for (var m = 0; m < BF.NUM_GLYPHS; m++) {
          var sv = o.s[m];
          font.status[m] = (sv === 1 || sv === 2) ? sv : 0;
        }
      }
      // Silenced QA checks per glyph (DECISIONS #59): { checkId: { code: true } }.
      // Only known check ids and integer codes 0..255 survive sanitizing.
      if (o.si && typeof o.si === "object") {
        var known = {};
        for (var qi = 0; qi < qaChecks.length; qi++) known[qaChecks[qi].id] = 1;
        for (var sid in o.si) {
          if (!known.hasOwnProperty(sid) || !o.si.hasOwnProperty(sid)) continue;
          var sm = {};
          for (var ckey in o.si[sid]) {
            var cv = +ckey;
            if (o.si[sid].hasOwnProperty(ckey) && isFinite(cv) && cv === (cv | 0) && cv >= 0 && cv < BF.NUM_GLYPHS)
              sm[cv] = true;
          }
          font.silences[sid] = sm;
        }
      }
      return font;
    } catch (e) { return null; }
  }

  // ---------- settings (small persistable UI values) ----------
  // ALL small persistable UI values go through this API (DECISIONS #40), never
  // raw localStorage. New persistable value: add it to settingsDefaults.
  var SETTINGS_KEY = "bitforge.settings.v1";
  var settingsDefaults = {
    pvText: "",
    pngBg: "solid",       // "solid" | "transparent" — last-used PNG export background
    pvScale: 8,
    pvBold: false,
    pvItalic: false,
    pvBaseline: 5,
    inverted: false,
    qaShowSilenced: false // QA tab: show silenced violations in the table
  };
  var settingsCache = null;
  function loadSettings() {
    var out = {};
    for (var k in settingsDefaults) out[k] = settingsDefaults[k];
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k2 in settingsDefaults) {
          if (!(k2 in o)) continue;
          var want = typeof settingsDefaults[k2], v = o[k2];
          if (want === "boolean" && typeof v === "boolean") out[k2] = v;
          else if (want === "number" && typeof v === "number" && isFinite(v)) out[k2] = v;
          else if (want === "string" && typeof v === "string") out[k2] = v;
        }
      }
    } catch (e) { /* corrupted -> defaults */ }
    return out;
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch (e) { /* ignore */ }
  }
  function settingsGet(k) { return settingsCache[k]; }
  function settingsSet(k, v) { settingsCache[k] = v; saveSettings(); }

  // ---------- shortcut registry (DECISIONS #35) ----------
  // The ONLY way to bind an app shortcut: shortcuts.register({combo, description, handler}).
  // The reference card is rendered from this registry, so it cannot drift.
  // combo syntax: "Key" | "Ctrl+Key" | "Ctrl+Shift+Key" (⌘ counts as Ctrl; letters lowercase).
  var shortcuts = {
    list: [],
    register: function (o) { this.list.push(o); },
    comboOf: function (evt) {
      var parts = [];
      if (evt.ctrlKey || evt.metaKey) parts.push("Ctrl");
      if (evt.altKey) parts.push("Alt");
      if (evt.shiftKey) parts.push("Shift");
      var k = evt.key || "";
      // On macOS, Option+letter types an accented character (Option+N => "\u2229"),
      // so for Alt combos prefer the layout-independent evt.code ("KeyN" -> "n").
      if (evt.altKey && typeof evt.code === "string" && /^Key[A-Z]$/.test(evt.code))
        k = evt.code.slice(3).toLowerCase();
      if (k.length === 1) k = k.toLowerCase();
      parts.push(k);
      return parts.join("+");
    },
    dispatch: function (evt) {
      var t = document.activeElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      var combo = shortcuts.comboOf(evt);
      var i;
      for (i = 0; i < shortcuts.list.length; i++)
        if (shortcuts.list[i].combo === combo) { shortcuts.list[i].handler(evt); evt.preventDefault(); return; }
      // Symbols like "?" need Shift to type; retry the bare combo for those.
      if (combo.indexOf("Shift+") === 0) {
        var bare = combo.slice(6);
        if (bare.length === 1 && !/[a-z0-9]/.test(bare)) {
          for (i = 0; i < shortcuts.list.length; i++)
            if (shortcuts.list[i].combo === bare) { shortcuts.list[i].handler(evt); evt.preventDefault(); return; }
        }
      }
    }
  };

  function toggleKeysCard() { el.keysCard.hidden = !el.keysCard.hidden; }
  function renderKeysCard() {
    var ul = el.keysList;
    ul.innerHTML = "";
    for (var i = 0; i < shortcuts.list.length; i++) {
      var li = document.createElement("li");
      var b = document.createElement("b"); b.textContent = shortcuts.list[i].combo;
      var sp = document.createElement("span"); sp.textContent = "  " + shortcuts.list[i].description;
      li.appendChild(b); li.appendChild(sp);
      ul.appendChild(li);
    }
  }

  function shiftGlyphAction(dx, dy) {
    var code = state.selected;
    var snap = snapshotGlyph(code);
    var res = BF.shiftGlyph(state.font, code, dx, dy);
    if (!res.changed) return;
    state.history.push({ code: code, snap: snap });
    if (state.history.length > 100) state.history.shift();
    state.redo = [];
    redrawAll();
    saveLS();
    bumpFontVersion();
    if (res.clipped > 0) toast("Shift clipped " + res.clipped + " px", true);
  }

  // ---------- glyph status (DECISIONS #38/#39) ----------
  function setStatus(code, st) {
    state.font.status[code] = (st === 1 || st === 2) ? st : 0;
    bumpFontVersion();
    drawAtlas(); drawSelector();
    renderGlyphStatus();
    saveLS();
  }

  // Status pumping (DECISIONS #54): D cycles the current glyph's status
  // (unf -> wip -> done -> unf); Shift+D marks it done and moves on.
  function cycleStatusAction() {
    setStatus(state.selected, (state.font.status[state.selected] + 1) % 3);
  }
  function doneNextAction() {
    var code = state.selected;
    if (state.font.status[code] !== 2) setStatus(code, 2);
    if (code >= 255) { toast("Already at the last glyph (0xFF)"); return; }
    selectGlyph(code + 1);
  }

  // Edit-tab status buttons: highlight the one matching the selected glyph.
  function renderGlyphStatus() {
    if (!el.stUnfinished) return; // before init
    var st = state.font.status[state.selected];
    el.stUnfinished.classList.toggle("active", st === 0);
    el.stWip.classList.toggle("active", st === 1);
    el.stDone.classList.toggle("active", st === 2);
  }

  // Map a pointer event on the atlas canvas to a glyph code (or null).
  function atlasCellAt(evt) {
    if (!el.atlas) return null;
    var r = el.atlas.getBoundingClientRect();
    var x = evt.clientX - r.left, y = evt.clientY - r.top;
    var g = atlasGeo;
    var col = Math.floor((x - g.pad * g.s) / (g.colW * g.s));
    var row = Math.floor(y / (state.font.height * g.s));
    if (col < 0 || col > 15 || row < 0 || row > 15) return null;
    return row * 16 + col;
  }

  // Floating 3-choice status menu (right-click on the atlas).
  var statusMenu = null;
  function closeStatusMenu() {
    if (statusMenu && statusMenu.parentNode) statusMenu.parentNode.removeChild(statusMenu);
    statusMenu = null;
  }
  function openStatusMenu(code, clientX, clientY) {
    closeStatusMenu();
    statusMenu = document.createElement("div");
    statusMenu.className = "status-menu";
    statusMenu.style.left = clientX + "px";
    statusMenu.style.top = clientY + "px";
    var names = ["unfinished", "wip", "done"];
    for (var i = 0; i < 3; i++) (function (st, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        setStatus(code, st);
        closeStatusMenu();
      });
      statusMenu.appendChild(b);
    })(i, names[i]);
    document.body.appendChild(statusMenu);
  }

  // ---------- QA tab (DECISIONS #41/#42/#59) ----------
  // Checks are data: each is { id, name, severity ("info"|"warning"),
  // silenceable, run(font) -> rows[] }; row = { check, codes (string),
  // detail, code? (int => clickable) }. qaComputeRows stamps each row with
  // checkId / severity / silenceable / silenced (from font.silences).
  //
  // Status icons (set C, user-picked): ok = dark green check circle,
  // info = grey i circle, warn = red triangle, sil = grey slashed circle.
  function qaIcon(kind) {
    var c = kind === "ok" ? "#2e7d32" : kind === "warn" ? "#cc3333" : kind === "sil" ? "#999999" : "#888888";
    var s = 'stroke="' + c + '"', f = 'fill="' + c + '"';
    var head = '<svg class="qa-svg" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">';
    if (kind === "ok")
      return head + '<circle cx="7" cy="7" r="5.4" fill="none" ' + s + ' stroke-width="1.4"/>' +
        '<path d="M4.3 7.3l1.9 1.9 3.5-4.1" fill="none" ' + s + ' stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (kind === "warn")
      return head + '<path d="M7 2.4 12.5 11.6H1.5Z" fill="none" ' + s + ' stroke-width="1.4" stroke-linejoin="round"/>' +
        '<path d="M7 6.1v2.5" fill="none" ' + s + ' stroke-width="1.4" stroke-linecap="round"/>' +
        '<circle cx="7" cy="10.05" r="0.75" ' + f + '/></svg>';
    if (kind === "sil")
      return head + '<circle cx="7" cy="7" r="5.4" fill="none" ' + s + ' stroke-width="1.4"/>' +
        '<path d="M3.2 3.2l7.6 7.6" fill="none" ' + s + ' stroke-width="1.4" stroke-linecap="round"/></svg>';
    return head + '<circle cx="7" cy="7" r="5.4" fill="none" ' + s + ' stroke-width="1.4"/>' +
      '<circle cx="7" cy="4.5" r="0.85" ' + f + '/>' +
      '<path d="M7 6.7v3.2" fill="none" ' + s + ' stroke-width="1.4" stroke-linecap="round"/></svg>';
  }
  function codeLabel(code) { var p = printable(code); return p ? hex2(code) + " \u00b7 " + p : hex2(code); }
  function codeList(codes) {
    var s = "";
    for (var i = 0; i < codes.length; i++) s += (i ? ", " : "") + codeLabel(codes[i]);
    return s;
  }
  var qaChecks = [
    {
      id: "duplicates", name: "duplicate glyphs", severity: "warning", silenceable: false,
      run: function (f) {
        var groups = BF.findDuplicates(f), rows = [];
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          rows.push({ check: "duplicate glyphs", codes: codeList(g.codes),
            detail: g.codes.length + " identical bitmaps (" + g.ink + " ink px)", code: g.codes[0] });
        }
        return rows;
      }
    },
    {
      id: "leftto", name: "what's left to draw", severity: "info", silenceable: false,
      run: function (f) {
        var c = BF.statusCounts(f), rows = [];
        rows.push({ check: "what's left to draw", codes: "\u2014",
          detail: "done " + c.all.done + "/256 \u00b7 wip " + c.all.wip + " \u00b7 unfinished " + c.all.unfinished +
                  "   (printable: done " + c.printable.done + "/95, wip " + c.printable.wip + ")" });
        var st, code;
        for (st = 0; st < 2; st++) // list unfinished first, then wip
          for (code = 0; code < 256; code++)
            if (f.status[code] === st)
              rows.push({ check: "what's left to draw", codes: codeLabel(code), detail: st === 0 ? "unfinished" : "wip", code: code });
        return rows;
      }
    },
    {
      // Edge-ink lint (DECISIONS #46): ink on the outermost cell row/col
      // collides with neighbours at zero spacing. Silenceable per glyph —
      // box-drawing / pseudo-graphics touch edges by design.
      id: "edge", name: "edge-ink", severity: "warning", silenceable: true,
      run: function (f) {
        var rows = [], code, e;
        for (code = 0; code < 256; code++) {
          e = BF.edgeInk(f, code);
          if (e.length === 0) continue;
          rows.push({ check: "edge-ink", codes: codeLabel(code),
            detail: "ink touches the " + e.join(" + ") + (e.length === 1 ? " edge" : " edges"), code: code });
        }
        return rows;
      }
    },
    {
      // Guideline violations (DECISIONS #47): ink outside the bound guides
      // (asc/desc/L/R only — the other guides are reference lines). The
      // detail names the crossed guide by its label + the overshoot in px.
      // Silenceable per glyph.
      id: "guides", name: "guideline violations", severity: "warning", silenceable: true,
      run: function (f) {
        var rows = [], code, v;
        for (code = 0; code < 256; code++) {
          v = BF.guideViolations(f, code);
          if (v.length === 0) continue;
          var parts = [];
          for (var i = 0; i < v.length; i++) {
            var dir = v[i].bound === "top" ? "above" : v[i].bound === "bottom" ? "below" :
                      v[i].bound === "left" ? "left of" : "right of";
            parts.push(v[i].over + "px " + dir + " the \"" + v[i].label + "\" guide");
          }
          rows.push({ check: "guideline violations", codes: codeLabel(code), detail: "ink " + parts.join("; "), code: code });
        }
        return rows;
      }
    }
  ];
  var qaLastVersion = null; // fontVersion the current table was computed at
  function qaComputeRows() {
    var rows = [];
    for (var i = 0; i < qaChecks.length; i++) {
      var chk = qaChecks[i], rs = chk.run(state.font);
      for (var j = 0; j < rs.length; j++) {
        rs[j].checkId = chk.id;
        rs[j].severity = chk.severity;
        rs[j].silenceable = chk.silenceable;
        rs[j].silenced = !!(chk.silenceable && rs[j].code != null &&
          state.font.silences[chk.id] && state.font.silences[chk.id][rs[j].code]);
      }
      rows = rows.concat(rs);
    }
    return rows;
  }
  function qaStale() { return qaLastVersion !== null && qaLastVersion !== state.fontVersion; }
  function updateQaBadge() {
    if (!el.qaBadge) return;
    el.qaBadge.hidden = !qaStale();
    if (qaStale()) el.qaBadge.textContent = "stale \u2014 press Refresh";
  }
  function qaReset() {
    qaLastVersion = null;
    if (el.qaEmpty) { el.qaEmpty.hidden = false; el.qaEmpty.innerHTML = "Press <b>Refresh checks</b> to run the QA checks."; }
    if (el.qaTable) el.qaTable.hidden = true;
    if (el.qaTbody) el.qaTbody.innerHTML = "";
    if (el.qaSummary) { el.qaSummary.hidden = true; el.qaSummary.innerHTML = ""; }
    updateQaBadge();
  }
  // Summary strip: one line per check — icon of the worst ACTIVE severity
  // (ok when clean, silenced when everything is silenced) + counts.
  function renderQaSummary(rows) {
    var html = "";
    for (var i = 0; i < qaChecks.length; i++) {
      var id = qaChecks[i].id, act = 0, sil = 0, warn = false;
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].checkId !== id) continue;
        if (rows[j].silenced) sil++;
        else { act++; if (rows[j].severity === "warning") warn = true; }
      }
      var icon = act === 0 ? (sil > 0 ? "sil" : "ok") : (warn ? "warn" : "info");
      html += '<div class="qa-sum-row">' + qaIcon(icon) + " <b>" + qaChecks[i].name + "</b> \u2014 " + act +
        (sil > 0 ? " (" + sil + " silenced)" : "") + "</div>";
    }
    el.qaSummary.innerHTML = html;
    el.qaSummary.hidden = false;
  }
  function qaRefresh() {
    qaLastVersion = state.fontVersion;
    var rows = qaComputeRows();
    var showSil = !!settingsGet("qaShowSilenced");
    var active = [], silenced = [], shown;
    for (var i = 0; i < rows.length; i++) (rows[i].silenced ? silenced : active).push(rows[i]);
    renderQaSummary(rows);
    shown = showSil ? active.concat(silenced) : active;
    el.qaEmpty.hidden = shown.length > 0;
    el.qaTable.hidden = shown.length === 0;
    if (shown.length === 0)
      el.qaEmpty.innerHTML = (silenced.length > 0 && !showSil)
        ? silenced.length + " violation" + (silenced.length === 1 ? "" : "s") + " silenced \u2014 tick \u201cshow silenced\u201d to see them."
        : "No violations.";
    el.qaTbody.innerHTML = "";
    for (i = 0; i < shown.length; i++) (function (row) {
      var tr = document.createElement("tr");
      if (row.silenced) tr.className = "qa-sil";
      var td1 = document.createElement("td");
      td1.textContent = row.check;
      var ic = document.createElement("span"); ic.className = "qa-ic";
      ic.innerHTML = qaIcon(row.silenced ? "sil" : (row.severity === "warning" ? "warn" : "info"));
      td1.insertBefore(ic, td1.firstChild);
      var td2 = document.createElement("td");
      if (row.code != null) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "qa-code"; b.textContent = row.codes;
        b.addEventListener("click", function () { selectGlyph(row.code); setActiveTab("edit"); });
        td2.appendChild(b);
      } else {
        td2.textContent = row.codes;
      }
      var td3 = document.createElement("td"); td3.textContent = row.detail;
      var td4 = document.createElement("td");
      if (row.silenceable && row.code != null) {
        var sb = document.createElement("button");
        sb.type = "button"; sb.className = "qa-silbtn";
        sb.textContent = row.silenced ? "un-silence" : "silence";
        (function (cid, code) { sb.addEventListener("click", function () { toggleSilence(cid, code); }); })(row.checkId, row.code);
        td4.appendChild(sb);
      }
      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
      el.qaTbody.appendChild(tr);
    })(shown[i]);
    updateQaBadge();
  }
  // Silencing a (check, glyph) pair (DECISIONS #59): stored per-font in
  // font.silences, persisted with the font, never exported. The UI only
  // offers it for silenceable checks; toggling is a font mutation (the stale
  // badge follows) and the report re-renders immediately.
  function toggleSilence(checkId, code) {
    var f = state.font;
    if (!f.silences[checkId]) f.silences[checkId] = {};
    if (f.silences[checkId][code]) delete f.silences[checkId][code];
    else f.silences[checkId][code] = true;
    bumpFontVersion();
    saveLS();
    qaRefresh();
  }

  // ---------- rendering (canvas) ----------
  // Draw one glyph, ink-only, at integer scale.
  // opts: { bold, italic, baseline, red, color } — color overrides the ink color
  // (e.g. the reference-glyph underlay is drawn in gray).
  function drawGlyphTo(ctx, code, px, py, scale, opts) {
    opts = opts || {};
    var f = state.font;
    if (opts.red) {
      ctx.fillStyle = "#e00000";
      ctx.fillRect(px, py, f.width * scale, f.height * scale);
      return;
    }
    ctx.fillStyle = opts.color || "#111";
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

  // Ink + background colors for the preview surfaces (inverted = white on black,
  // how the font will look in a real terminal; editor/sidebar stay black-on-white).
  function inkColor() { return state.inverted ? "#eee" : "#111"; }
  function bgColor() { return state.inverted ? "#111" : "#fff"; }

  // Glyph status tints (DECISIONS #39): WIP = light peach, unfinished = light
  // pastel blue, done = plain background. Dark variants for inverted surfaces.
  function statusTint(st, inverted) {
    if (inverted) return st === 1 ? "#3a2a22" : (st === 0 ? "#20293a" : null);
    return st === 1 ? "#ffe8dd" : (st === 0 ? "#eef4ff" : null);
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
    // reference glyph underlay (Shift-click in the sidebar), behind the ink
    if (state.ref != null && state.ref !== state.selected) {
      drawGlyphTo(ctx, state.ref, 0, 0, s, { color: "#b5b5b5" });
    }
    ctx.fillStyle = "#111";
    for (var y = 0; y < f.height; y++)
      for (var x = 0; x < f.width; x++)
        if (BF.getPixel(f, state.selected, x, y)) ctx.fillRect(x * s, y * s, s, s);
    // guidelines (per-font, shared; drawn on top so always visible)
    var gs = f.guidelines;
    for (var gi = 0; gi < gs.length; gi++) {
      var g = gs[gi];
      ctx.strokeStyle = g.color; ctx.lineWidth = 1; ctx.beginPath();
      if (g.o === "h") { var gy2 = g.off * s + 0.5; ctx.moveTo(0, gy2); ctx.lineTo(c.width, gy2); }
      else { var gx2 = g.off * s + 0.5; ctx.moveTo(gx2, 0); ctx.lineTo(gx2, c.height); }
      ctx.stroke();
    }
  }

  function drawSelector() {
    var f = state.font, c = el.selector, ctx = c.getContext("2d");
    var cell = 16;
    setCanvasSize(c, 16 * cell, 16 * cell);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    var ms = clamp(Math.floor((cell - 2) / Math.max(f.width, f.height)), 1, cell - 2);
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      var tint = statusTint(f.status[code], false);
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(col * cell, row * cell, cell, cell); }
      var ox = col * cell + ((cell - f.width * ms) >> 1);
      var oy = row * cell + ((cell - f.height * ms) >> 1);
      drawGlyphTo(ctx, code, ox, oy, ms, {});
    }
    var sc = state.selected;
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
    ctx.strokeRect((sc % 16) * cell + 1, ((sc / 16) | 0) * cell + 1, cell - 2, cell - 2);
    if (state.ref != null) {
      ctx.strokeStyle = "#888"; ctx.lineWidth = 2;
      ctx.strokeRect((state.ref % 16) * cell + 2, ((state.ref / 16) | 0) * cell + 2, cell - 4, cell - 4);
    }
  }

  // (The single-glyph zoom canvas was removed in [L.6]; the selected glyph is
  // already visible large in the Edit tab, and the text sample below covers
  // bold/italic at any scale.)

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
    ctx.fillStyle = bgColor(); ctx.fillRect(0, 0, c.width, c.height);
    for (r = 0; r < rows.length; r++) {
      for (var i2 = 0; i2 < rows[r].length; i2++) {
        var it = rows[r][i2];
        var gx = (pad + i2 * f.width - e.min) * s;
        var gy = (pad + r * f.height) * s;
        drawGlyphTo(ctx, it.ok ? it.code : -1, gx, gy, s,
          { bold: it.bold, italic: it.italic, baseline: state.baseline, red: !it.ok, color: inkColor() });
      }
    }
  }

  function drawAtlas() {
    var f = state.font, c = el.atlas, ctx = c.getContext("2d");
    var s = clamp(Math.floor(640 / (16 * f.width)), 1, 8);
    // Atlas honors the current bold/slant (DECISIONS #37): add column spacing for
    // slant spill / bold overdraw, and a left pad so left-spill isn't clipped.
    var e = slantExtent();
    var boldExtra = state.bold ? 1 : 0;
    var extra = (state.italic || state.bold) ? e.max + boldExtra : 0;
    var pad = state.italic ? -e.min : 0;
    var colW = f.width + extra;
    setCanvasSize(c, (pad + 16 * colW) * s, 16 * f.height * s);
    atlasGeo = { s: s, pad: pad, colW: colW }; // for click -> cell mapping
    ctx.fillStyle = bgColor(); ctx.fillRect(0, 0, c.width, c.height);
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      var cx = (pad + col * colW) * s, cy = row * f.height * s;
      var tint = statusTint(f.status[code], state.inverted);
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(cx, cy, f.width * s, f.height * s); }
      drawGlyphTo(ctx, code, cx, cy, s,
        { bold: state.bold, italic: state.italic, baseline: state.baseline, color: inkColor() });
    }
    ctx.strokeStyle = state.inverted ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"; ctx.lineWidth = 1; ctx.beginPath();
    for (var i = 0; i <= 16; i++) {
      var gx = (pad + i * colW) * s + 0.5; ctx.moveTo(gx, 0); ctx.lineTo(gx, c.height);
      var gy = i * f.height * s + 0.5; ctx.moveTo(0, gy); ctx.lineTo(c.width, gy);
    }
    ctx.stroke();
  }

  function redrawAll() {
    updateSelHeader();
    renderGlyphStatus();
    drawSelector();
    drawEditor();
    drawPvText();
    drawAtlas();
  }
  function updateSelHeader() {
    el.selHeader.textContent = selLabel();
    el.editLabel.textContent = "glyph " + selLabel();
  }

  // ---------- guidelines (per-font, shared across glyphs) ----------
  var GUIDE_PRESETS = {
    // Bound guides take their labels from BF.GUIDE_BOUND_LABELS (core.js) —
    // that table decides which guides act as QA bounds (chunk N.3).
    ascender:  { label: BF.GUIDE_BOUND_LABELS.top,    o: "h", color: "#888888", off: function (f) { return 1; } },
    cap:       { label: "cap",  o: "h", color: "#2255cc", off: function (f) { return Math.max(1, Math.round(f.height * 0.12)); } },
    xheight:   { label: "x",    o: "h", color: "#2255cc", off: function (f) { return Math.round(f.height * 0.40); } },
    baseline:  { label: "base", o: "h", color: "#dd2222", off: function (f) { return f.height - 3; } },
    descender: { label: BF.GUIDE_BOUND_LABELS.bottom, o: "h", color: "#888888", off: function (f) { return f.height - 1; } },
    left:      { label: BF.GUIDE_BOUND_LABELS.left,   o: "v", color: "#cc8800", off: function (f) { return 1; } },
    right:     { label: BF.GUIDE_BOUND_LABELS.right,  o: "v", color: "#cc8800", off: function (f) { return f.width - 1; } },
    hnew:      { label: "H",    o: "h", color: "#444444", off: function (f) { return Math.round(f.height / 2); } },
    vnew:      { label: "V",    o: "v", color: "#444444", off: function (f) { return Math.round(f.width / 2); } }
  };

  function addGuide(key) {
    var p = GUIDE_PRESETS[key];
    if (!p) return;
    var max = p.o === "h" ? state.font.height : state.font.width;
    state.font.guidelines.push({ o: p.o, off: clamp(p.off(state.font), 0, max - 1), label: p.label, color: p.color });
    renderGuideList(); drawEditor(); saveLS();
  }
  function deleteGuide(idx) {
    state.font.guidelines.splice(idx, 1);
    renderGuideList(); drawEditor(); saveLS();
  }
  function renderGuideList() {
    var box = el.glist;
    if (!box) return;
    box.innerHTML = "";
    var gs = state.font.guidelines;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      var chip = document.createElement("span");
      chip.className = "gchip";
      chip.style.borderColor = g.color;
      var lab = document.createElement("b"); lab.textContent = g.label;
      var off = document.createElement("i"); off.textContent = " " + g.off;
      var del = document.createElement("button"); del.className = "gdel"; del.textContent = "\u00d7";
      (function (idx) { del.addEventListener("click", function () { deleteGuide(idx); }); })(i);
      chip.appendChild(lab); chip.appendChild(off); chip.appendChild(del);
      box.appendChild(chip);
    }
    if (gs.length === 0) {
      var none = document.createElement("span"); none.className = "gnone"; none.textContent = "no guides";
      box.appendChild(none);
    }
  }
  function guidelineAt(evt) {
    var f = state.font, c = el.editor, r = c.getBoundingClientRect();
    var s = editorScale();
    var dx = evt.clientX - r.left, dy = evt.clientY - r.top;
    var best = null, bestD = 4; // display-px hit threshold
    var gs = f.guidelines;
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i];
      var d = (g.o === "h") ? Math.abs(dy - g.off * s) : Math.abs(dx - g.off * s);
      if (d <= bestD) { bestD = d; best = g; }
    }
    return best;
  }
  function moveGuide(evt) {
    var f = state.font, c = el.editor, r = c.getBoundingClientRect();
    var s = editorScale();
    var g = guideDrag.g;
    var v = (g.o === "h") ? Math.round((evt.clientY - r.top) / s) : Math.round((evt.clientX - r.left) / s);
    v = clamp(v, 0, ((g.o === "h") ? f.height : f.width) - 1);
    if (v !== g.off) { g.off = v; guideDrag.moved = true; drawEditor(); renderGuideList(); }
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
    // Guideline drag (only when unlocked and the pointer is on a guideline).
    if (!state.glocked) {
      var g = guidelineAt(evt);
      if (g) { guideDrag = { g: g, moved: false }; evt.preventDefault(); return; }
    }
    var p = editorPos(evt);
    var code = state.selected;
    var cur = BF.getPixel(state.font, code, p.x, p.y);
    var paintValue = (evt.button === 2 || evt.shiftKey) ? 0 : (cur ? 0 : 1);
    editing = { code: code, paintValue: paintValue, snapshot: snapshotGlyph(code), changed: false };
    applyPaint(p.x, p.y, paintValue);
    evt.preventDefault();
  }
  function onEditorMove(evt) {
    if (guideDrag) { moveGuide(evt); evt.preventDefault(); return; }
    if (!state.glocked) {
      var g = guidelineAt(evt);
      el.editor.style.cursor = g ? (g.o === "h" ? "row-resize" : "col-resize") : "default";
    }
    if (!editing) return;
    var p = editorPos(evt);
    applyPaint(p.x, p.y, editing.paintValue);
    evt.preventDefault();
  }
  function onEditorUp() {
    if (guideDrag) { if (guideDrag.moved) saveLS(); guideDrag = null; return; }
    if (!editing) return;
    if (editing.changed) {
      state.history.push({ code: editing.code, snap: editing.snapshot });
      if (state.history.length > 100) state.history.shift();
      state.redo = [];
      bumpFontVersion();
    }
    editing = null;
    redrawAll();
    saveLS();
  }

  // Shared by the Edit-tab button and the Edit-menu item (DECISIONS #51).
  function clearGlyphAction() {
    var code = state.selected;
    state.history.push({ code: code, snap: snapshotGlyph(code) });
    if (state.history.length > 100) state.history.shift();
    BF.clearGlyph(state.font, code);
    state.redo = [];
    redrawAll();
    saveLS();
    bumpFontVersion();
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
    renderGlyphStatus();
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

  function exportPng(bgMode) {
    // bgMode "solid"/"transparent" (from the File-menu items) remembers the
    // choice; a bare call (Ctrl+S) exports with the remembered mode.
    if (bgMode === "solid" || bgMode === "transparent") settingsSet("pngBg", bgMode);
    var f = state.font, transparent = settingsGet("pngBg") === "transparent";
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

  // BDF import/export (DECISIONS #43). Import is text, not canvas — a
  // different path from onPngFile. Status/guidelines start fresh on import
  // because setFont() builds the font from parsed data only.
  function onOpenBdfClick() { el.fileBdf.click(); }
  function onBdfFile(evt) {
    var file = evt.target.files && evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    var done = function (text) { importBdfText(text, file.name); };
    if (typeof file.text === "function") {
      file.text().then(done, function () { toast("Could not read " + file.name, true); });
    } else {
      var r = new FileReader();
      r.onload = function () { done(String(r.result)); };
      r.onerror = function () { toast("Could not read " + file.name, true); };
      r.readAsText(file);
    }
  }
  // Returns true on success; toasts the error and returns false on malformed input.
  function importBdfText(text, name) {
    var p;
    try { p = BF.parseBDF(text); }
    catch (e) { toast(e.message || "BDF: malformed file", true); return false; }
    var font = BF.makeFont(p.width, p.height);
    var d = font.data;
    for (var i = 0; i < d.length && i < p.data.length; i++) d[i] = p.data[i] ? 1 : 0;
    setFont(font);
    toast("Imported " + p.width + "\u00d7" + p.height + " font from BDF" + (name ? " (" + name + ")" : ""));
    return true;
  }

  function exportBdf() {
    downloadText(BF.toBDF(state.font), "bitforge-font.bdf");
  }

  // Copy glyph to clipboard (DECISIONS #44): PNG at 16 display px per glyph
  // pixel, black ink on transparent background; download fallback when the
  // clipboard API is unavailable (e.g. file:// without a secure context).
  var COPY_SCALE = 16;
  function glyphCanvas(code, scale) {
    var f = state.font;
    var c = document.createElement("canvas");
    c.width = f.width * scale; c.height = f.height * scale;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    for (var y = 0; y < f.height; y++)
      for (var x = 0; x < f.width; x++)
        if (BF.getPixel(f, code, x, y)) ctx.fillRect(x * scale, y * scale, scale, scale);
    return c;
  }
  function copyGlyphToClipboard() {
    var code = state.selected;
    var name = "bitforge-glyph-" + hex2(code).replace("0x", "").toLowerCase() + ".png";
    var c = glyphCanvas(code, COPY_SCALE);
    c.toBlob(function (blob) {
      if (!blob) { toast("Could not rasterize the glyph", true); return; }
      var clip = (typeof navigator !== "undefined") ? navigator.clipboard : null;
      if (clip && typeof clip.write === "function" && typeof ClipboardItem !== "undefined") {
        clip.write([new ClipboardItem({ "image/png": blob })]).then(function () {
          toast("Copied " + selLabel() + " to clipboard");
        }, function () {
          downloadBlob(blob, name);
          toast("Clipboard write blocked \u2014 glyph downloaded as " + name, true);
        });
      } else {
        downloadBlob(blob, name);
        toast("Clipboard unavailable \u2014 glyph downloaded as " + name, true);
      }
    }, "image/png");
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

  // ---------- render controls (Preview + Atlas share one state) ----------
  // DECISIONS #52: the Atlas tab has its own bold/italic/baseline/inverted
  // controls, but they drive the SAME state as the Preview tab's. The setters
  // write state + settings, then syncRenderControls() pushes the values back
  // into both control sets so neither can show a stale checked/unchecked state.
  function setBold(v) { state.bold = v; settingsSet("pvBold", v); syncRenderControls(); drawPvText(); drawAtlas(); }
  function setItalic(v) { state.italic = v; settingsSet("pvItalic", v); syncRenderControls(); drawPvText(); drawAtlas(); }
  function setInverted(v) { state.inverted = v; settingsSet("inverted", v); syncRenderControls(); drawPvText(); drawAtlas(); }
  function setBaseline(v) {
    state.baseline = clamp(parseInt(v, 10), 0, state.font.height - 1);
    settingsSet("pvBaseline", state.baseline);
    syncRenderControls(); drawPvText(); drawAtlas();
  }
  function syncRenderControls() {
    if (!el.pvBold || !state.font) return; // before init / before the first setFont
    el.pvBold.checked = state.bold;        el.atBold.checked = state.bold;
    el.pvItalic.checked = state.italic;    el.atItalic.checked = state.italic;
    el.pvInverted.checked = state.inverted; el.atInverted.checked = state.inverted;
    el.pvBaseline.value = String(state.baseline); el.atBaseline.value = String(state.baseline);
    el.pvBaseline.max = String(state.font.height - 1); el.atBaseline.max = String(state.font.height - 1);
  }

  // ---------- menu bar (DECISIONS #51) ----------
  // Desktop-style File/Edit dropdowns. Mouse-driven: click a menu title to
  // open/toggle, hover to switch while one is open, outside mousedown or
  // Escape to close. The document-level close listeners are no-ops under the
  // jsc stub (document.addEventListener only captures DOMContentLoaded there).
  var openMenu = null, menuEls = [];
  function closeMenus() {
    for (var i = 0; i < menuEls.length; i++) menuEls[i].classList.remove("open");
    openMenu = null;
  }
  function showMenu(m) {
    closeMenus();
    m.classList.add("open");
    openMenu = m;
    if (m === el.menuAbout) renderAboutInfo(); // fresh numbers each open
  }
  function toggleMenu(m) { if (openMenu === m) closeMenus(); else showMenu(m); }
  function hoverMenu(m) { if (openMenu !== m) showMenu(m); }

  // About menu: live font info (dims moved here from the toolbar, DECISIONS #55).
  function renderAboutInfo() {
    var f = state.font, c = BF.statusCounts(f), ink = 0, code;
    for (code = 0; code < BF.NUM_GLYPHS; code++) ink += BF.inkCount(f, code);
    el.aboutFontInfo.textContent =
      f.width + " \u00d7 " + f.height + " px \u00b7 256 glyphs \u00b7 " + ink + " ink px\n" +
      "done " + c.all.done + " \u00b7 wip " + c.all.wip + " \u00b7 unfinished " + c.all.unfinished;
  }
  function openAboutModal() { el.aboutModal.hidden = false; }
  function closeAboutModal() { el.aboutModal.hidden = true; }

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
      filePng: $("file-png"), fileBdf: $("file-bdf"),
      menuFile: $("menu-file"), menuEdit: $("menu-edit"), menuAbout: $("menu-about"),
      mbFile: $("mb-file"), mbEdit: $("mb-edit"), mbAbout: $("mb-about"),
      aboutFontInfo: $("about-font-info"), miAboutBitforge: $("mi-about-bitforge"),
      aboutTitle: $("about-title"), aboutModal: $("about-modal"), aboutClose: $("about-close"),
      miNew: $("mi-new"), miOpenPng: $("mi-open-png"), miOpenBdf: $("mi-open-bdf"),
      miExportPngSolid: $("mi-export-png-solid"), miExportPngTransparent: $("mi-export-png-transparent"),
      miExportBdf: $("mi-export-bdf"), miExportVerilog: $("mi-export-verilog"),
      miUndo: $("mi-undo"), miRedo: $("mi-redo"), miClearGlyph: $("mi-clear-glyph"), miCopyGlyph: $("mi-copy-glyph"),
      miCycleStatus: $("mi-cycle-status"), miDoneNext: $("mi-done-next"),
      btnClear: $("btn-clear"), btnUndo: $("btn-undo"), btnRedo: $("btn-redo"),
      stUnfinished: $("st-unfinished"), stWip: $("st-wip"), stDone: $("st-done"),
      editor: $("editor"), editLabel: $("edit-label"),
      glock: $("glock"), glist: $("glist"),
      pvScale: $("pv-scale"), pvBold: $("pv-bold"), pvItalic: $("pv-italic"), pvBaseline: $("pv-baseline"),
      pvInverted: $("pv-inverted"),
      atBold: $("at-bold"), atItalic: $("at-italic"), atBaseline: $("at-baseline"), atInverted: $("at-inverted"),
      pvText: $("pv-text"), pvTextCanvas: $("pv-text-canvas"),
      atlas: $("atlas"), toast: $("toast"),
      keysCard: $("keys-card"), keysList: $("keys-list"),
      btnKeys: $("btn-keys"), btnKeysClose: $("btn-keys-close"),
      qaRefresh: $("btn-qa-refresh"), qaBadge: $("qa-badge"), qaTable: $("qa-table"),
      qaTbody: $("qa-tbody"), qaEmpty: $("qa-empty"), qaSummary: $("qa-summary"),
      qaShowSilenced: $("qa-show-silenced")
    };

    // Version stamp (DECISIONS #56): modal head + browser tab, from the single
    // BF.VERSION source in core.js.
    el.aboutTitle.textContent = "bitforge " + BF.VERSION;
    document.title = "bitforge " + BF.VERSION;

    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++)
      tabs[i].addEventListener("click", function () { setActiveTab(this.getAttribute("data-tab")); });

    el.filePng.addEventListener("change", onPngFile);
    el.fileBdf.addEventListener("change", onBdfFile);

    // Menu bar: titles (open/toggle + hover-switch) and items (action + close).
    menuEls = [el.menuFile, el.menuEdit, el.menuAbout];
    var menuPairs = [[el.menuFile, el.mbFile], [el.menuEdit, el.mbEdit], [el.menuAbout, el.mbAbout]];
    for (var mp = 0; mp < menuPairs.length; mp++)
      (function (cont, btn) {
        btn.addEventListener("click", function () { toggleMenu(cont); });
        btn.addEventListener("mouseenter", function () { hoverMenu(cont); });
      })(menuPairs[mp][0], menuPairs[mp][1]);
    // "Inside" walks up from the target: it may be the menu container, its
    // title, or any of its ITEMS. (The old check only knew container/title —
    // so a mousedown on an item closed the menu before the item's click
    // could fire, and the browser swallowed the click entirely: every menu
    // item was dead in the real browser, headless tests never saw it because
    // the stub ignored document-level listeners. Fixed 2026-11-14, user-report.)
    function menuContains(cont, t) {
      var n = t;
      while (n) { if (n === cont) return true; n = n.parentElement; }
      return false;
    }
    document.addEventListener("mousedown", function (e) {
      var inside = false;
      for (var i = 0; i < menuPairs.length; i++)
        if (menuContains(menuPairs[i][0], e.target)) inside = true;
      if (!inside) closeMenus();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeMenus(); closeAboutModal(); }
    });
    function menuItem(id, fn) {
      el[id].addEventListener("click", function () { closeMenus(); fn(); });
    }
    menuItem("miNew", newFont);
    menuItem("miOpenPng", onOpenClick);
    menuItem("miOpenBdf", onOpenBdfClick);
    menuItem("miExportPngSolid", function () { exportPng("solid"); });
    menuItem("miExportPngTransparent", function () { exportPng("transparent"); });
    menuItem("miExportBdf", exportBdf);
    menuItem("miExportVerilog", exportVerilog);
    menuItem("miUndo", undo);
    menuItem("miRedo", redo);
    menuItem("miClearGlyph", clearGlyphAction);
    menuItem("miCycleStatus", cycleStatusAction);
    menuItem("miDoneNext", doneNextAction);
    menuItem("miCopyGlyph", copyGlyphToClipboard);
    menuItem("miAboutBitforge", openAboutModal);

    // About modal: close via the × button or a click on the backdrop itself
    // (document-level outside-click / Escape are handled above; browser-only
    // under the jsc stub).
    el.aboutClose.addEventListener("click", closeAboutModal);
    el.aboutModal.addEventListener("mousedown", function (e) {
      if (e.target === el.aboutModal) closeAboutModal();
    });

    // Edit-tab status buttons (DECISIONS #50): mark the current glyph, then
    // move on to the next one (arrows / atlas click). Re-clicking the active
    // state is a no-op so it doesn't bump the font version for nothing.
    var stBtns = [
      [el.stUnfinished, 0], [el.stWip, 1], [el.stDone, 2]
    ];
    for (var si = 0; si < stBtns.length; si++)
      (function (btn, st) { btn.addEventListener("click", function () {
        if (state.font.status[state.selected] !== st) setStatus(state.selected, st);
      }); })(stBtns[si][0], stBtns[si][1]);

    el.btnClear.addEventListener("click", clearGlyphAction);
    el.btnUndo.addEventListener("click", undo);
    el.btnRedo.addEventListener("click", redo);

    el.editor.addEventListener("mousedown", onEditorDown);
    el.editor.addEventListener("mousemove", onEditorMove);
    window.addEventListener("mouseup", onEditorUp);
    el.editor.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    // guidelines: lock toggle + preset add buttons
    el.glock.checked = state.glocked;
    el.glock.addEventListener("change", function () {
      state.glocked = this.checked;
      el.editor.style.cursor = "default";
    });
    var gbtns = document.querySelectorAll(".gadd button");
    for (var gi = 0; gi < gbtns.length; gi++)
      gbtns[gi].addEventListener("click", function () { addGuide(this.getAttribute("data-g")); });

    el.btnJump.addEventListener("click", doJump);
    el.jump.addEventListener("keydown", function (e) { if (e.key === "Enter") doJump(); });

    // atlas selector: click a mini-glyph to select it; Shift-click sets the
    // reference glyph (editor underlay), Shift-click again clears it
    el.selector.style.cursor = "pointer";
    el.selector.addEventListener("click", function (evt) {
      var r = this.getBoundingClientRect();
      var col = Math.floor((evt.clientX - r.left) / 16);
      var row = Math.floor((evt.clientY - r.top) / 16);
      if (row < 0 || row > 15 || col < 0 || col > 15) return;
      var code = row * 16 + col;
      if (evt.shiftKey) {
        state.ref = (state.ref === code) ? null : code;
        drawSelector(); drawEditor();
        return;
      }
      selectGlyph(code);
    });

    // atlas: left-click selects, right-click opens the status menu (suppress the
    // browser context menu)
    el.atlas.style.cursor = "pointer";
    el.atlas.addEventListener("click", function (evt) {
      var code = atlasCellAt(evt);
      if (code != null) selectGlyph(code);
    });
    el.atlas.addEventListener("contextmenu", function (evt) {
      evt.preventDefault();
      var code = atlasCellAt(evt);
      if (code != null) openStatusMenu(code, evt.clientX, evt.clientY);
    });
    document.addEventListener("click", closeStatusMenu);

    el.qaRefresh.addEventListener("click", qaRefresh);
    el.qaShowSilenced.addEventListener("change", function () {
      settingsSet("qaShowSilenced", this.checked);
      qaRefresh();
    });

    el.pvScale.addEventListener("input", function () {
      state.scale = clamp(parseInt(this.value, 10) || 1, 1, 64);
      settingsSet("pvScale", state.scale);
      drawPvText();
    });
    function bindToggle(id, fn) { el[id].addEventListener("change", function () { fn(this.checked); }); }
    bindToggle("pvBold", setBold); bindToggle("atBold", setBold);
    bindToggle("pvItalic", setItalic); bindToggle("atItalic", setItalic);
    bindToggle("pvInverted", setInverted); bindToggle("atInverted", setInverted);
    function bindBaselineInput(id) { el[id].addEventListener("input", function () { setBaseline(this.value); }); }
    bindBaselineInput("pvBaseline"); bindBaselineInput("atBaseline");
    el.pvText.addEventListener("input", function () { settingsSet("pvText", this.value); drawPvText(); });

    // shortcut card
    el.btnKeys.addEventListener("click", toggleKeysCard);
    el.btnKeysClose.addEventListener("click", toggleKeysCard);

    // shortcut registry (DECISIONS #35) — the card and the behavior share this list
    var navDirs = [
      ["ArrowLeft", "left", "Previous glyph"],
      ["ArrowRight", "right", "Next glyph"],
      ["ArrowUp", "up", "Glyph one row up"],
      ["ArrowDown", "down", "Glyph one row down"],
      ["Home", "rowStart", "Start of row"],
      ["End", "rowEnd", "End of row"],
      ["PageUp", "top", "First glyph (0x00)"],
      ["PageDown", "bottom", "Last glyph (0xFF)"]
    ];
    for (var ni = 0; ni < navDirs.length; ni++)
      shortcuts.register({ combo: navDirs[ni][0], description: navDirs[ni][2],
        handler: (function (dir) { return function () { selectGlyph(BF.navigate(state.selected, dir)); }; })(navDirs[ni][1]) });

    // File ops + tabs (DECISIONS #48). Ctrl+N / Ctrl+O are reserved by the
    // browser (new window / open file — not interceptable), hence Alt there.
    shortcuts.register({ combo: "Alt+n", description: "New blank font", handler: newFont });
    shortcuts.register({ combo: "Alt+o", description: "Open PNG atlas", handler: onOpenClick });
    shortcuts.register({ combo: "Alt+Shift+o", description: "Open BDF font", handler: onOpenBdfClick });
    shortcuts.register({ combo: "Ctrl+s", description: "Export PNG (last-used bg)", handler: function () { exportPng(); } });
    shortcuts.register({ combo: "Ctrl+Shift+s", description: "Export Verilog ROM", handler: exportVerilog });
    shortcuts.register({ combo: "Alt+Shift+s", description: "Export BDF font", handler: exportBdf });
    shortcuts.register({ combo: "e", description: "Show the Edit tab", handler: function () { setActiveTab("edit"); } });
    shortcuts.register({ combo: "p", description: "Show the Preview tab", handler: function () { setActiveTab("preview"); } });
    shortcuts.register({ combo: "a", description: "Show the Atlas tab", handler: function () { setActiveTab("atlas"); } });
    shortcuts.register({ combo: "q", description: "Show the QA tab", handler: function () { setActiveTab("qa"); } });
    shortcuts.register({ combo: "Ctrl+q", description: "QA tab + run checks", handler: function () { setActiveTab("qa"); qaRefresh(); } });
    shortcuts.register({ combo: "d", description: "Cycle glyph status (unf \u2192 wip \u2192 done)", handler: cycleStatusAction });
    shortcuts.register({ combo: "Shift+d", description: "Mark done & move to next glyph", handler: doneNextAction });
    shortcuts.register({ combo: "Ctrl+ArrowLeft", description: "Shift glyph left", handler: function () { shiftGlyphAction(-1, 0); } });
    shortcuts.register({ combo: "Ctrl+ArrowRight", description: "Shift glyph right", handler: function () { shiftGlyphAction(1, 0); } });
    shortcuts.register({ combo: "Ctrl+ArrowUp", description: "Shift glyph up", handler: function () { shiftGlyphAction(0, -1); } });
    shortcuts.register({ combo: "Ctrl+ArrowDown", description: "Shift glyph down", handler: function () { shiftGlyphAction(0, 1); } });
    shortcuts.register({ combo: "Ctrl+z", description: "Undo", handler: undo });
    shortcuts.register({ combo: "Ctrl+Shift+z", description: "Redo", handler: redo });
    shortcuts.register({ combo: "Ctrl+y", description: "Redo", handler: redo });
    shortcuts.register({ combo: "?", description: "Toggle this card", handler: toggleKeysCard });
    window.addEventListener("keydown", function (e) { shortcuts.dispatch(e); });
    renderKeysCard();

    settingsCache = loadSettings();
    var font = loadLS() || BF.makeFont(8, 16);
    state.scale = clamp(settingsGet("pvScale") | 0, 1, 64);
    state.bold = !!settingsGet("pvBold");
    state.italic = !!settingsGet("pvItalic");
    state.inverted = !!settingsGet("inverted");
    state.baseline = clamp(settingsGet("pvBaseline") | 0, 0, font.height - 1);
    el.pvScale.value = String(state.scale);
    el.pvText.value = settingsGet("pvText");
    el.qaShowSilenced.checked = !!settingsGet("qaShowSilenced");
    setFont(font); // setFont -> syncRenderControls (state.font must exist first)
  }

  // Test seam: only under the jsc DOM stub (harmless in the browser). Lets the
  // headless tests drive the shortcut registry, status and QA and inspect state.
  if (typeof globalThis !== "undefined" && globalThis.__stub)
    globalThis.__stub.app = { state: state, shortcuts: shortcuts, selectGlyph: selectGlyph, toggleKeysCard: toggleKeysCard,
      setStatus: setStatus, qaRefresh: qaRefresh, qaRows: qaComputeRows, qaStale: qaStale, atlasCellAt: atlasCellAt,
      toggleSilence: toggleSilence, qaChecks: qaChecks,
      importBdfText: importBdfText, exportBdf: exportBdf,
      copyGlyph: copyGlyphToClipboard, glyphCanvas: glyphCanvas,
      getLastToast: function () { return lastToast; },
      exportPng: exportPng, settingsGet: settingsGet, settingsSet: settingsSet };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
