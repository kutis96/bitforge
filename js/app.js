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
    tool: "paint",     // editor tool: "paint" | "erase" | "select" (DECISIONS #75)
    selRect: null,     // { x, y, w, h } selection on the current glyph (session-only)
    inverted: false,   // preview surfaces: white on black
    theme: "light",    // RESOLVED theme in effect: "light" | "dark" (DECISIONS #79)
    fontVersion: 0     // bumped on every font mutation; drives QA staleness
  };
  var editing = null;   // active editor stroke
  var guideDrag = null; // active guideline drag: { g, moved }
  var selDrag = null;   // active selection gesture: { mode: "marquee"|"move", ax, ay, base?, preview, moved }
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
    applyDogfood(); // font identity changed → the dogfood face (if on) must follow
  }

  // Every font mutation (stroke end, clear, shift, status change) bumps this;
  // a QA report is "stale" whenever the version moved since its last refresh.
  function bumpFontVersion() {
    state.fontVersion++;
    updateQaBadge();
    scheduleDogfood(); // live dogfooding: rebuild the injected face (debounced)
  }

  // New font (DECISIONS #88): one modal form asks for width AND height at
  // once (the old flow was prompt → prompt → confirm). Same validation as
  // before (BF.validateDims, 1..1024); Create replaces the current font.
  function newDims() {
    return { w: parseInt(el.newW.value, 10), h: parseInt(el.newH.value, 10) };
  }
  function newRender() {
    var d = newDims();
    if (isNaN(d.w) || isNaN(d.h)) { el.newResult.textContent = "\u2014"; return; }
    var v = BF.validateDims(d.w, d.h);
    el.newResult.textContent = v.ok ? "\u2192 " + d.w + "\u00d7" + d.h : "invalid \u2014 " + v.error;
  }
  function openNewModal() {
    el.newW.value = String(state.font ? state.font.width : 8);
    el.newH.value = String(state.font ? state.font.height : 16);
    newRender();
    el.newModal.hidden = false;
    el.newW.focus();
  }
  function closeNewModal() { el.newModal.hidden = true; }
  function createNewFont() {
    var d = newDims();
    var v = BF.validateDims(d.w, d.h);
    if (!v.ok) { toast(v.error, true); return; }
    setFont(BF.makeFont(d.w, d.h));
    closeNewModal();
    toast("New " + d.w + "\u00d7" + d.h + " font");
  }

  // ---------- persistence (localStorage) ----------
  // The blob shape + all sanitizing live in core.js (BF.fontToBlob / 
  // BF.fontFromBlob, DECISIONS #64) and are shared with the project file.
  function knownCheckIds() {
    var out = [];
    for (var i = 0; i < qaChecks.length; i++) out.push(qaChecks[i].id);
    return out;
  }
  function saveLS() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(BF.fontToBlob(state.font)));
    } catch (e) { /* quota / privacy mode — ignore */ }
  }
  function loadLS() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return BF.fontFromBlob(JSON.parse(raw), knownCheckIds());
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
    qaShowSilenced: false, // QA tab: show silenced violations in the table
    pasteMode: "merge",    // "merge" | "replace" — blend for dragged selections (DECISIONS #76)
    theme: "auto",         // "light" | "dark" | "auto" — auto follows the system (DECISIONS #79)
    selCode: 0,            // last selected glyph (0–255) — restored on load & import (DECISIONS #80)
    dogfood: false,        // render the UI in the font being edited (DECISIONS #82)
    pvShowText: true,      // Preview: show the text box + markup note (DECISIONS #87)
    pvWrap: true,          // Preview: soft-wrap long lines; false = one long row + scrollbars (DECISIONS #87)
    pvInsert: false        // Preview: double-click a selector glyph to insert its \uXX (DECISIONS #87)
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
      // Check property (DECISIONS #83): ignoreEdges — edges this font reaches
      // on purpose (ROM-tight faces); toggled on the summary row.
      id: "edge", name: "edge-ink", severity: "warning", silenceable: true,
      props: { ignoreEdges: { label: "ignore", options: ["top", "bottom", "left", "right"] } },
      run: function (f) {
        var rows = [], code, e;
        for (code = 0; code < 256; code++) {
          e = BF.activeEdges(f, code);
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
    },
    {
      // Empty-printable lint (DECISIONS #74): a printable code with zero ink
      // is usually a pumping slip or an accidental Clear. Space (0x20) is the
      // sanctioned empty. Silenceable per glyph — a font may intentionally
      // leave codes empty. Detail flags the real mistake: marked *done*.
      id: "empty", name: "empty printable glyphs", severity: "info", silenceable: true,
      run: function (f) {
        var codes = BF.emptyPrintables(f), rows = [], i, c;
        for (i = 0; i < codes.length; i++) {
          c = codes[i];
          rows.push({ check: "empty printable glyphs", codes: codeLabel(c),
            detail: "no ink" + (f.status[c] === 2 ? " \u2014 marked done" : ""), code: c });
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
  // ---------- QA check properties (DECISIONS #83, chunk [AA]) ----------
  // Checks may declare `props: { key: { label, options: [...] } }` — a subset
  // multi-select. Values live PER-FONT in font.checkProps = { checkId: { key:
  // [options...] } } (makeFont inits {}; the blob's cp field + fontFromBlob
  // sanitizing carry it through localStorage and .bitforge). Toggling is a
  // font mutation — same pattern as toggleSilence.
  function qaPropInputId(checkId, key, opt) {
    return "qa-prop-" + checkId + "-" + key + "-" + opt;
  }
  function qaPropValue(font, checkId, key) {
    var cp = font.checkProps && font.checkProps[checkId];
    var v = cp && cp[key];
    return Array.isArray(v) ? v.slice() : [];
  }
  function onQaPropChange(checkId, key) {
    var decl = null;
    for (var i = 0; i < qaChecks.length; i++)
      if (qaChecks[i].id === checkId && qaChecks[i].props) { decl = qaChecks[i].props[key]; break; }
    if (!decl || !Array.isArray(decl.options)) return;
    var f = state.font, cur = qaPropValue(f, checkId, key), next = [];
    for (var j = 0; j < decl.options.length; j++) {
      var opt = decl.options[j];
      var input = document.getElementById(qaPropInputId(checkId, key, opt));
      if (input ? !!input.checked : cur.indexOf(opt) >= 0) next.push(opt);
    }
    var same = next.length === cur.length;
    if (same)
      for (var k = 0; k < next.length; k++) if (cur.indexOf(next[k]) < 0) { same = false; break; }
    if (same) return; // no-op: don't bump the version or re-render
    if (!f.checkProps) f.checkProps = {};
    if (!f.checkProps[checkId]) f.checkProps[checkId] = {};
    f.checkProps[checkId][key] = next;
    bumpFontVersion();
    saveLS();
    qaRefresh();
  }

  // Summary strip: one line per check — icon of the worst ACTIVE severity
  // (ok when clean, silenced when everything is silenced) + counts, and the
  // check's declared props rendered as inline checkboxes (DECISIONS #83).
  function renderQaSummary(rows) {
    var html = "";
    for (var i = 0; i < qaChecks.length; i++) {
      var chk = qaChecks[i], id = chk.id, act = 0, sil = 0, warn = false;
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].checkId !== id) continue;
        if (rows[j].silenced) sil++;
        else { act++; if (rows[j].severity === "warning") warn = true; }
      }
      var icon = act === 0 ? (sil > 0 ? "sil" : "ok") : (warn ? "warn" : "info");
      html += '<div class="qa-sum-row">' + qaIcon(icon) + " <b>" + chk.name + "</b> \u2014 " + act +
        (sil > 0 ? " (" + sil + " silenced)" : "") +
        (chk.props ? " " + qaPropsHtml(chk) : "") + "</div>";
    }
    el.qaSummary.innerHTML = html;
    el.qaSummary.hidden = false;
    wireQaProps();
  }
  // Declared props as inline checkbox chips; checked state re-derived from
  // the font on every render (the font is the source of truth).
  function qaPropsHtml(chk) {
    var f = state.font, out = "<span class=\"qa-props\">";
    for (var key in chk.props) {
      var decl = chk.props[key];
      if (!decl || !Array.isArray(decl.options)) continue;
      var cur = qaPropValue(f, chk.id, key);
      out += '<span class="qa-prop-label">' + decl.label + ":</span>";
      for (var i = 0; i < decl.options.length; i++) {
        var opt = decl.options[i];
        out += '<label class="qa-prop"><input type="checkbox" id="' + qaPropInputId(chk.id, key, opt) +
          "\"" + (cur.indexOf(opt) >= 0 ? " checked" : "") + "> " + opt + "</label>";
      }
    }
    return out + "</span>";
  }
  // Wire change listeners once per input id: the headless stub reuses element
  // objects across re-renders (the real DOM gets fresh nodes each time).
  function wireQaProps() {
    for (var i = 0; i < qaChecks.length; i++) {
      var chk = qaChecks[i];
      if (!chk.props) continue;
      for (var key in chk.props) {
        var decl = chk.props[key];
        if (!decl || !Array.isArray(decl.options)) continue;
        for (var j = 0; j < decl.options.length; j++) {
          var input = document.getElementById(qaPropInputId(chk.id, key, decl.options[j]));
          if (!input || input.__qaWired) continue;
          input.__qaWired = true;
          (function (cid, k) {
            input.addEventListener("change", function () { onQaPropChange(cid, k); });
          })(chk.id, key);
        }
      }
    }
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

  // Ink + background colors for the preview surfaces (Preview + Atlas render
  // canvases). THEME-RELATIVE (DECISIONS #87, amending #79): the DEFAULT surface
  // is black-on-white in the light theme and white-on-black in the dark theme;
  // the "inverted" checkbox flips relative to the resolved theme (works in Auto —
  // applyTheme() redraws on system-scheme change). Exports are NEVER themed:
  // the PNG/BDF/Verilog/TTF paths use fixed black ink by design.
  function pvSurfaceDark() { return (state.theme === "dark") !== state.inverted; }
  function inkColor() { return pvSurfaceDark() ? "#eee" : "#111"; }
  function bgColor() { return pvSurfaceDark() ? "#111" : "#fff"; }

  // ---------- theme (DECISIONS #79) ----------
  // `theme` is a persisted setting: "light" | "dark" | "auto" (default "auto").
  // auto follows the system/browser color scheme; an explicit choice always
  // wins. The resolved theme lands on <html data-theme> — the CSS custom
  // properties there re-skin the whole chrome; the canvas editing surfaces
  // (editor + selector) pick colors from themeColors() and are redrawn on
  // change. Exports are never themed (black ink, white/transparent bg).
  function resolveTheme(setting, prefersDark) {
    var s = (setting === "light" || setting === "dark") ? setting : "auto";
    return (s === "auto") ? (prefersDark ? "dark" : "light") : s;
  }
  function prefersDark() {
    try {
      if (typeof window !== "undefined" && typeof window.matchMedia === "function")
        return !!window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) { /* no matchMedia (headless) -> light */ }
    return false;
  }
  // Re-resolve + apply. Idempotent — safe to call after any settings import.
  // Must run after init() (it redraws and touches the menu elements).
  function applyTheme() {
    var t = resolveTheme(settingsGet("theme"), prefersDark());
    var changed = (t !== state.theme);
    state.theme = t;
    try {
      var docEl = document.documentElement;
      if (docEl && docEl.setAttribute) docEl.setAttribute("data-theme", t);
    } catch (e) { /* headless stub without documentElement */ }
    syncThemeMenu();
    if (changed) redrawAll();
  }
  // Follow system-scheme changes (guarded: no matchMedia under the jsc stub).
  function watchSystemTheme() {
    try {
      if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
        var q = window.matchMedia("(prefers-color-scheme: dark)");
        if (q && typeof q.addEventListener === "function")
          q.addEventListener("change", function () { applyTheme(); });
      }
    } catch (e) {}
  }
  function chooseTheme(t) {
    if (t !== "light" && t !== "dark" && t !== "auto") return;
    settingsSet("theme", t);
    applyTheme();
  }
  function syncThemeMenu() {
    var cur = settingsGet("theme");
    if (cur !== "light" && cur !== "dark") cur = "auto";
    var map = [["miThemeLight", "light"], ["miThemeDark", "dark"], ["miThemeAuto", "auto"]];
    for (var i = 0; i < map.length; i++) {
      var b = el[map[i][0]];
      if (b && b.classList) b.classList.toggle("active", cur === map[i][1]);
    }
  }
  // ---------- dogfooding (DECISIONS #82) ----------
  // Render the app UI in the font being edited. applyDogfood() (re)builds
  // the font as a minimal TTF (js/ttf.js), injects it as an @font-face
  // (family "bf-dogfood") in <style id="bf-dogfood">, and tags <html> with
  // data-dogfood. css/style.css applies the family to everything EXCEPT
  // #toolbar — the menu bar (and thus this toggle) always stays on the
  // system stack, so the user can reach the switch even with a blank font.
  // Blank glyphs are left UNMAPPED in the cmap on purpose: the browser then
  // falls back per-codepoint into the system stack (the dogfood safety rule).
  var dogfoodTimer = null;
  var dogfoodStyleEl = null;
  function dogfoodCSS() {
    return BF_TTF.buildFontFace(state.font, "bf-dogfood");
  }
  function applyDogfood() {
    var on = !!settingsGet("dogfood") && !!state.font;
    try {
      var docEl = document.documentElement;
      if (on) docEl.setAttribute("data-dogfood", "1");
      else if (docEl && docEl.removeAttribute) docEl.removeAttribute("data-dogfood");
      // Drop the previous <style> (tracked, and any stale one with the id).
      var old = null;
      try { old = document.getElementById("bf-dogfood"); } catch (e) { old = null; }
      if (old && old.parentNode && old.parentNode.removeChild) old.parentNode.removeChild(old);
      if (dogfoodStyleEl && dogfoodStyleEl.parentNode && dogfoodStyleEl.parentNode.removeChild)
        dogfoodStyleEl.parentNode.removeChild(dogfoodStyleEl);
      dogfoodStyleEl = null;
      if (on) {
        dogfoodStyleEl = document.createElement("style");
        dogfoodStyleEl.id = "bf-dogfood";
        dogfoodStyleEl.textContent = dogfoodCSS();
        (document.head || document.body).appendChild(dogfoodStyleEl);
      }
    } catch (e) { /* headless stub — setting + <html> tag + menu are the testable surface */ }
    syncDogfoodMenu();
  }
  // The font changed: rebuild the injected face. Debounced — bumps fire on
  // every stroke end, and building + base64-encoding a 256-slot TTF per tick
  // is wasteful; 400 ms after the last edit is "live" enough.
  function scheduleDogfood() {
    if (!settingsGet("dogfood")) return;
    clearTimeout(dogfoodTimer);
    dogfoodTimer = setTimeout(function () { applyDogfood(); }, 400);
  }
  function toggleDogfood() {
    settingsSet("dogfood", !settingsGet("dogfood"));
    applyDogfood();
  }
  function syncDogfoodMenu() {
    try {
      var b = el.miDogfood;
      if (b && b.classList) b.classList.toggle("active", !!settingsGet("dogfood"));
    } catch (e) { /* before init */ }
  }

  // Canvas palette for the themed editing surfaces (editor + selector).
  // Light values are the pre-[W] literals (#fff/#e2e2e2/#111/#b5b5b5/#888),
  // so the light look is pixel-identical to before dark mode existed.
  function themeColors() {
    var dark = (state.theme === "dark");
    return dark
      ? { bg: "#1d1d1d", grid: "#333333", ink: "#e6e6e6", refUnder: "#5f5f5f", selStroke: "#e6e6e6", selRef: "#8a8a8a" }
      : { bg: "#fff", grid: "#e2e2e2", ink: "#111", refUnder: "#b5b5b5", selStroke: "#111", selRef: "#888" };
  }

  // Glyph status tints (DECISIONS #39): WIP = light peach, unfinished = light
  // pastel blue, done = plain background. Dark variants for inverted surfaces.
  function statusTint(st, inverted) {
    if (inverted) return st === 1 ? "#3a2a22" : (st === 0 ? "#20293a" : null);
    return st === 1 ? "#ffe8dd" : (st === 0 ? "#eef4ff" : null);
  }

  function drawEditor() {
    var f = state.font, c = el.editor, ctx = c.getContext("2d");
    var s = editorScale();
    var tc = themeColors();
    setCanvasSize(c, f.width * s, f.height * s);
    ctx.fillStyle = tc.bg; ctx.fillRect(0, 0, c.width, c.height);
    // Grid lines sit on grid boundaries (between pixels). The far-edge boundary
    // (off = dim) draws INSIDE the canvas at dim*s-0.5 — dim*s+0.5 would be
    // off-canvas and invisible (DECISIONS #86).
    ctx.strokeStyle = tc.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= f.width; gx++) { var glx = Math.min(gx * s, c.width - 1) + 0.5; ctx.moveTo(glx, 0); ctx.lineTo(glx, c.height); }
    for (var gy = 0; gy <= f.height; gy++) { var gly = Math.min(gy * s, c.height - 1) + 0.5; ctx.moveTo(0, gly); ctx.lineTo(c.width, gly); }
    ctx.stroke();
    // reference glyph underlay (Shift-click in the sidebar), behind the ink
    if (state.ref != null && state.ref !== state.selected) {
      drawGlyphTo(ctx, state.ref, 0, 0, s, { color: tc.refUnder });
    }
    ctx.fillStyle = tc.ink;
    for (var y = 0; y < f.height; y++)
      for (var x = 0; x < f.width; x++)
        if (BF.getPixel(f, state.selected, x, y)) ctx.fillRect(x * s, y * s, s, s);
    // guidelines (per-font, shared; drawn on top so always visible)
    // A guide's offset is a grid boundary BETWEEN pixels: 0 = the near edge of
    // the cell, dim = the far edge (DECISIONS #86) — both valid positions. The
    // far edge draws inside the canvas (dim*s-0.5), like the grid above.
    var gs = f.guidelines;
    for (var gi = 0; gi < gs.length; gi++) {
      var g = gs[gi];
      ctx.strokeStyle = g.color; ctx.lineWidth = 1; ctx.beginPath();
      if (g.o === "h") { var gy2 = Math.min(g.off * s, c.height - 1) + 0.5; ctx.moveTo(0, gy2); ctx.lineTo(c.width, gy2); }
      else { var gx2 = Math.min(g.off * s, c.width - 1) + 0.5; ctx.moveTo(gx2, 0); ctx.lineTo(gx2, c.height); }
      ctx.stroke();
    }
    // selection (or the in-progress marquee) — over everything (DECISIONS #75)
    var sr = (selDrag && selDrag.preview) ? selDrag.preview : state.selRect;
    if (sr) {
      ctx.save();
      ctx.fillStyle = "rgba(34, 85, 204, 0.10)";
      ctx.fillRect(sr.x * s, sr.y * s, sr.w * s, sr.h * s);
      ctx.strokeStyle = "#2255cc"; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      ctx.strokeRect(sr.x * s + 0.5, sr.y * s + 0.5, sr.w * s - 1, sr.h * s - 1);
      ctx.restore();
    }
  }

  function drawSelector() {
    var f = state.font, c = el.selector, ctx = c.getContext("2d");
    var cell = 16;
    var tc = themeColors();
    setCanvasSize(c, 16 * cell, 16 * cell);
    ctx.fillStyle = tc.bg; ctx.fillRect(0, 0, c.width, c.height);
    var ms = clamp(Math.floor((cell - 2) / Math.max(f.width, f.height)), 1, cell - 2);
    for (var code = 0; code < 256; code++) {
      var col = code % 16, row = (code / 16) | 0;
      var tint = statusTint(f.status[code], state.theme === "dark");
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(col * cell, row * cell, cell, cell); }
      var ox = col * cell + ((cell - f.width * ms) >> 1);
      var oy = row * cell + ((cell - f.height * ms) >> 1);
      // Themed ink (DECISIONS #79): drawGlyphTo's #111 default would leave
      // the mini-glyphs black and unreadable on the dark selector background.
      drawGlyphTo(ctx, code, ox, oy, ms, { color: tc.ink });
    }
    var sc = state.selected;
    ctx.strokeStyle = tc.selStroke; ctx.lineWidth = 2;
    ctx.strokeRect((sc % 16) * cell + 1, ((sc / 16) | 0) * cell + 1, cell - 2, cell - 2);
    if (state.ref != null) {
      ctx.strokeStyle = tc.selRef; ctx.lineWidth = 2;
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
    // Soft-wrap is opt-OUT (DECISIONS #87): OFF = one long row, and the existing
    // `.canvas-wrap { overflow: auto }` supplies the scrollbars.
    var maxCols = settingsGet("pvWrap") ? clamp(Math.floor((parentW - 32) / (f.width * s)), 4, 128) : Infinity;
    // Newlines are break tokens from the parser (DECISIONS #63): every `nl`
    // item starts a new display row (empty lines render as empty rows) and
    // the markup state is NOT reset, so *bold* can span lines. maxCols still
    // soft-wraps long rows.
    var items = BF.parseMarkup(el.pvText.value);
    var rows = [[]];
    for (var i = 0; i < items.length; i++) {
      if (items[i].nl) { rows.push([]); continue; }
      var row = rows[rows.length - 1];
      if (row.length >= maxCols) { row = []; rows.push(row); } // soft-wrap (off: maxCols = Infinity)
      row.push(items[i]);
    }
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
      var tint = statusTint(f.status[code], pvSurfaceDark()); // theme-relative (DECISIONS #87)
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(cx, cy, f.width * s, f.height * s); }
      drawGlyphTo(ctx, code, cx, cy, s,
        { bold: state.bold, italic: state.italic, baseline: state.baseline, color: inkColor() });
    }
    ctx.strokeStyle = pvSurfaceDark() ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"; ctx.lineWidth = 1; ctx.beginPath();
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
    // that table decides which guides act as QA bounds (chunk N.3). Lines are
    // drawn on grid boundaries (BETWEEN pixels), and the QA flags ink outside
    // the line: above/left = index < off, below/right = index >= off
    // (DECISIONS #65). Each of the four presets leaves exactly 1px outside
    // the line (row 0 / row h-1 / col 0 / col w-1).
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
    // Valid range is 0..max INCLUSIVE: a guide sits between pixels, so the
    // far edge (off = max) is a real position (DECISIONS #86).
    var max = p.o === "h" ? state.font.height : state.font.width;
    state.font.guidelines.push({ o: p.o, off: clamp(p.off(state.font), 0, max), label: p.label, color: p.color });
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
      // Hit-test at the DRAWN position (far edge sits at dim*s-0.5, not dim*s+0.5)
      // so an edge guide stays grabbable (DECISIONS #86).
      var pos = (g.o === "h") ? Math.min(g.off * s, c.height - 1) : Math.min(g.off * s, c.width - 1);
      var d = (g.o === "h") ? Math.abs(dy - pos) : Math.abs(dx - pos);
      if (d <= bestD) { bestD = d; best = g; }
    }
    return best;
  }
  function moveGuide(evt) {
    var f = state.font, c = el.editor, r = c.getBoundingClientRect();
    var s = editorScale();
    var g = guideDrag.g;
    var v = (g.o === "h") ? Math.round((evt.clientY - r.top) / s) : Math.round((evt.clientX - r.left) / s);
    // 0..dim inclusive — the far edge is a valid guide position (DECISIONS #86).
    v = clamp(v, 0, (g.o === "h") ? f.height : f.width);
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
    // Select tool: start a marquee, or a move when the pointer is inside the
    // existing selection (DECISIONS #75).
    if (state.tool === "select") {
      evt.preventDefault();
      var r = state.selRect;
      if (r && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) {
        // Ctrl/Alt at drag START decides copy-vs-cut (initiate = what happens).
        selDrag = { mode: "move", copy: !!(evt.ctrlKey || evt.altKey), ax: p.x, ay: p.y, base: { x: r.x, y: r.y, w: r.w, h: r.h }, preview: null, moved: false };
      } else {
        selDrag = { mode: "marquee", ax: p.x, ay: p.y, preview: null, moved: false };
        setSel(null); // redrawing from scratch
      }
      return;
    }
    var code = state.selected;
    var cur = BF.getPixel(state.font, code, p.x, p.y);
    var paintValue = (state.tool === "erase" || evt.button === 2 || evt.shiftKey) ? 0 : (cur ? 0 : 1);
    editing = { code: code, paintValue: paintValue, snapshot: snapshotGlyph(code), changed: false };
    applyPaint(p.x, p.y, paintValue);
    evt.preventDefault();
  }
  function onEditorMove(evt) {
    if (guideDrag) { moveGuide(evt); evt.preventDefault(); return; }
    if (!state.glocked && state.tool !== "select") {
      var g = guidelineAt(evt);
      el.editor.style.cursor = g ? (g.o === "h" ? "row-resize" : "col-resize") : "default";
    }
    if (selDrag) { selMovePreview(evt); return; }
    if (!editing) return;
    var p = editorPos(evt);
    applyPaint(p.x, p.y, editing.paintValue);
    evt.preventDefault();
  }
  function onEditorUp() {
    if (guideDrag) { if (guideDrag.moved) saveLS(); guideDrag = null; return; }
    if (selDrag) { selDragUp(); return; }
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

  // Cell resize (DECISIONS #71): apply per-edge deltas; one full-font undo
  // step. Guidelines shift inside the core; the slant baseline is app state.
  function applyResize(d) {
    var before = BF.cloneFont(state.font);
    var res;
    try { res = BF.resizeFont(state.font, d); }
    catch (e) { toast(e.message || "Invalid resize", true); return false; }
    state.font = res.font;
    state.history.push({ full: before });
    if (state.history.length > 100) state.history.shift();
    state.redo = [];
    state.baseline = clamp(state.baseline + d.dTop, 0, state.font.height - 1);
    syncRenderControls();
    redrawAll();
    saveLS();
    bumpFontVersion();
    if (res.inkClipped > 0) toast("Resize clipped " + res.inkClipped + " px", true);
    return true;
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

  // ---------- glyph manipulation (DECISIONS #74) ----------
  function mirrorAction(axis) {
    var code = state.selected;
    state.history.push({ code: code, snap: snapshotGlyph(code) });
    if (state.history.length > 100) state.history.shift();
    BF.mirrorGlyph(state.font, code, axis);
    state.redo = [];
    redrawAll();
    saveLS();
    bumpFontVersion();
    toast(selLabel() + " mirrored " + (axis === "h" ? "left–right" : "up–down"));
  }

  // ---------- codepoint-target modal (shared, chunk [AE], DECISIONS #88) ----------
  // Replaces the browser prompt() for BOTH "Copy to codepoint…" and the
  // selection's "copy to…": one char or hex (the parseCodeInput grammar, same
  // as the jump field), live result readout, same-codepoint refusal; OK runs
  // the caller's continuation with the parsed code.
  var cpFrom = 0, cpOnOk = null;
  function openCodepointModal(title, note, from, onOk) {
    cpFrom = from; cpOnOk = onOk;
    el.cpTitle.textContent = title;
    el.cpNote.textContent = note;
    el.cpInput.value = "";
    cpRender();
    el.cpModal.hidden = false;
    el.cpInput.focus();
  }
  function closeCodepointModal() { el.cpModal.hidden = true; }
  function cpRender() {
    var to = parseCodeInput(el.cpInput.value);
    if (to === null) {
      el.cpResult.textContent = el.cpInput.value.trim()
        ? "invalid \u2014 one char, or hex (e.g. 61 or a)" : "\u2192 ?";
      return;
    }
    if (to === cpFrom) { el.cpResult.textContent = "same codepoint as the source"; return; }
    var p = printable(to);
    el.cpResult.textContent = "\u2192 " + hex2(to) + (p ? " \u00b7 " + p : "");
  }
  function cpOk() {
    var to = parseCodeInput(el.cpInput.value);
    if (to === null) { toast("one char, or hex (e.g. 61 or a)", true); return; }
    if (to === cpFrom) { toast("That's the same codepoint (" + selLabel() + ")", true); return; }
    var fn = cpOnOk; cpOnOk = null;
    closeCodepointModal();
    if (fn) fn(to);
  }

  // Glyph → Copy to codepoint… (DECISIONS #74): the modal above asks for the
  // target; OK duplicates the bitmap there and selects it (the usual
  // follow-up is shaping the new variant). Target status/silences are
  // untouched; one per-glyph undo step.
  function doCopyTo(to) {
    var from = state.selected;
    state.history.push({ code: to, snap: snapshotGlyph(to) });
    if (state.history.length > 100) state.history.shift();
    BF.copyGlyphTo(state.font, from, to);
    state.redo = [];
    saveLS();
    bumpFontVersion();
    selectGlyph(to);
    toast("Copied " + hex2(from) + " \u2192 " + hex2(to));
  }
  function copyToCodepointAction() {
    openCodepointModal("Copy to codepoint\u2026",
      "Duplicate " + selLabel() + "'s bitmap at another codepoint.",
      state.selected, doCopyTo);
  }

  // ---------- editor tools + selection (DECISIONS #75) ----------
  function setTool(t) {
    if (t !== "paint" && t !== "erase" && t !== "select") return;
    state.tool = t;
    if (t !== "select") clearSel();
    el.toolPaint.classList.toggle("active", t === "paint");
    el.toolErase.classList.toggle("active", t === "erase");
    el.toolSelect.classList.toggle("active", t === "select");
    el.editor.style.cursor = t === "select" ? "crosshair" : "default";
  }
  function setSel(rect) {
    state.selRect = rect;
    if (rect) {
      el.selinfo.textContent = rect.w + "\u00d7" + rect.h;
      el.selbar.hidden = false;
    } else {
      el.selinfo.textContent = "";
      el.selbar.hidden = true;
    }
    drawEditor();
  }
  function clearSel() {
    if (!state.selRect && !selDrag) return;
    state.selRect = null;
    selDrag = null;
    el.selbar.hidden = true;
    el.selinfo.textContent = "";
    drawEditor();
  }
  // Live preview while a marquee is drawn or a selection is being moved.
  function selMovePreview(evt) {
    evt.preventDefault();
    var p = editorPos(evt);
    var w = state.font.width, h = state.font.height;
    if (selDrag.mode === "marquee") {
      selDrag.preview = BF.normRect(selDrag.ax, selDrag.ay, p.x, p.y, w, h);
      selDrag.moved = selDrag.moved || p.x !== selDrag.ax || p.y !== selDrag.ay;
    } else {
      var b = selDrag.base;
      var nx = b.x + (p.x - selDrag.ax), ny = b.y + (p.y - selDrag.ay);
      nx = nx < 0 ? 0 : (nx > w - b.w ? w - b.w : nx);
      ny = ny < 0 ? 0 : (ny > h - b.h ? h - b.h : ny);
      selDrag.preview = { x: nx, y: ny, w: b.w, h: b.h };
      selDrag.moved = selDrag.moved || nx !== b.x || ny !== b.y;
    }
    drawEditor();
  }
  // Commit (or cancel) the active selection gesture on mouse-up.
  function selDragUp() {
    var d = selDrag; selDrag = null;
    if (d.mode === "marquee") {
      if (d.moved && d.preview) setSel(d.preview); else clearSel(); // plain click => deselect
    } else if (d.moved && d.preview && (d.preview.x !== d.base.x || d.preview.y !== d.base.y)) {
      // Plain drag = cut; Ctrl/Alt drag = copy (source kept) — DECISIONS #76.
      // Blend per the paste mode; off-cell ink is clipped either way.
      var code = state.selected;
      var snap = snapshotGlyph(code);
      var mode = pasteMode();
      var res = d.copy
        ? BF.rectMoveCopy(state.font, code, d.base, d.preview.x - d.base.x, d.preview.y - d.base.y, mode)
        : BF.rectMove(state.font, code, d.base, d.preview.x - d.base.x, d.preview.y - d.base.y, mode);
      state.history.push({ code: code, snap: snap });
      if (state.history.length > 100) state.history.shift();
      state.redo = [];
      bumpFontVersion();
      setSel(d.preview); // the selection follows its landing spot
      toast((d.copy ? "Copied " : "Moved ") + res.moved + " px"
        + (res.clipped ? " \u2014 " + res.clipped + " px clipped" : "")
        + (d.copy ? " \u2014 source kept" : ""));
    }
    redrawAll();
    saveLS();
  }
  // Paste mode for dragged selections (DECISIONS #76): "merge" (default) keeps
  // existing destination ink; "replace" makes the destination exactly the
  // selection's content (transparent parts erase). A setting, so it survives
  // reloads; the setting value is validated at the point of use.
  function pasteMode() { return settingsGet("pasteMode") === "replace" ? "replace" : "merge"; }
  function setPasteMode(m) {
    settingsSet("pasteMode", m === "replace" ? "replace" : "merge");
    syncPasteModeBtn();
  }
  function syncPasteModeBtn() { el.selPasteMode.textContent = "paste: " + pasteMode(); }

  // Fill / Clear / Invert the selection — one per-glyph undo step each.
  function selAction(name) {
    if (!state.selRect) { toast("Select a region first (S)", true); return; }
    var code = state.selected;
    var snap = snapshotGlyph(code);
    if (name === "fill") BF.rectFill(state.font, code, state.selRect, 1);
    else if (name === "clear") BF.rectFill(state.font, code, state.selRect, 0);
    else BF.rectInvert(state.font, code, state.selRect);
    state.history.push({ code: code, snap: snap });
    if (state.history.length > 100) state.history.shift();
    state.redo = [];
    bumpFontVersion();
    redrawAll();
    saveLS();
  }
  // The selection as a standalone canvas (for the clipboard copy).
  function selCanvas(rect, scale) {
    var f = state.font, c = state.selected;
    var cv = document.createElement("canvas");
    cv.width = rect.w * scale; cv.height = rect.h * scale;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#000";
    for (var y = 0; y < rect.h; y++)
      for (var x = 0; x < rect.w; x++)
        if (BF.getPixel(f, c, rect.x + x, rect.y + y)) ctx.fillRect(x * scale, y * scale, scale, scale);
    return cv;
  }
  function selCopy() {
    if (!state.selRect) { toast("Select a region first (S)", true); return; }
    var r = state.selRect;
    var name = "bitforge-sel-" + r.w + "x" + r.h + ".png";
    copyCanvasToClipboard(selCanvas(r, COPY_SCALE), name, "Copied the selection to clipboard");
  }
  // Paste the selection (exact pixels, same cell position) into another
  // codepoint — a copy, not a stamp; the target becomes the selection.
  function selPasteTo(to) {
    var from = state.selected;
    var snap = snapshotGlyph(to);
    BF.rectCopy(state.font, from, to, state.selRect);
    state.history.push({ code: to, snap: snap });
    if (state.history.length > 100) state.history.shift();
    state.redo = [];
    bumpFontVersion();
    saveLS();
    clearSel();
    selectGlyph(to); // selection is per-glyph; the target becomes the selection
    toast("Pasted selection " + hex2(from) + " \u2192 " + hex2(to));
  }
  function selCopyTo() {
    if (!state.selRect) { toast("Select a region first (S)", true); return; }
    openCodepointModal("Paste selection to\u2026",
      "Paste " + selLabel() + "'s selection (exact pixels) at another codepoint.",
      state.selected, selPasteTo);
  }

  // Full-font restore (resize undo/redo, DECISIONS #71). The snapshot is
  // cloned so the history never aliases the live font.
  function restoreFull(snap) {
    state.font = BF.cloneFont(snap);
    state.baseline = clamp(state.baseline, 0, state.font.height - 1);
    syncRenderControls();
  }
  function undo() {
    if (!state.history.length) return;
    var entry = state.history.pop();
    if (entry.full) {
      state.redo.push({ full: BF.cloneFont(state.font) });
      restoreFull(entry.full);
    } else {
      state.redo.push({ code: entry.code, snap: snapshotGlyph(entry.code) });
      restoreGlyph(entry.code, entry.snap);
    }
    redrawAll();
    saveLS();
  }
  function redo() {
    if (!state.redo.length) return;
    var entry = state.redo.pop();
    if (entry.full) {
      state.history.push({ full: BF.cloneFont(state.font) });
      restoreFull(entry.full);
    } else {
      state.history.push({ code: entry.code, snap: snapshotGlyph(entry.code) });
      restoreGlyph(entry.code, entry.snap);
    }
    redrawAll();
    saveLS();
  }

  function selectGlyph(code) {
    clearSel(); // the selection is per-glyph (DECISIONS #75)
    state.selected = clamp(code, 0, 255);
    settingsSet("selCode", state.selected); // DECISIONS #80: remember where the user left off
    updateSelHeader();
    drawSelector();
    drawEditor();
    renderGlyphStatus();
  }

  // Shared codepoint-input parser (jump field + "Copy to codepoint…"): one
  // char, or 1–2 hex digits with/without 0x. Returns the code, or null.
  function parseCodeInput(v) {
    v = String(v).trim();
    if (!v) return null;
    if (v.length === 1) return v.charCodeAt(0);
    if (/^0x[0-9a-f]{1,2}$/i.test(v)) return parseInt(v.slice(2), 16);
    if (/^[0-9a-f]{1,2}$/i.test(v)) return parseInt(v, 16);
    return null;
  }
  function doJump() {
    var code = parseCodeInput(el.jump.value);
    if (code === null) {
      if (el.jump.value.trim()) toast("Jump: one char, or hex (e.g. 41 / 0x41)", true);
      return;
    }
    el.jump.value = "";
    el.jump.blur();
    selectGlyph(code);
  }

  // ---------- file ops ----------
  function onOpenClick() { el.filePng.click(); }
  // Blob/File -> Image -> importPngImage (shared by file and clipboard import).
  // `baseName` (optional) becomes the imported font's name when given.
  function pngBlobToFont(blob, baseName) {
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); importPngImage(img, baseName); };
    img.onerror = function () { URL.revokeObjectURL(url); toast("Could not load that PNG", true); };
    img.src = url;
  }
  function onPngFile(evt) {
    var file = evt.target.files && evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    pngBlobToFont(file, baseName(file.name)); // a File is a Blob
  }
  // Import the first PNG image on the system clipboard (DECISIONS #66).
  // Deliberately NO Ctrl+V binding: PNG import replaces the whole font without
  // a confirm, so a stray paste must not be able to nuke the current work.
  function importPngFromClipboard() {
    var clip = (typeof navigator !== "undefined") ? navigator.clipboard : null;
    if (!clip || typeof clip.read !== "function") {
      toast("Clipboard read is not available in this browser", true);
      return false;
    }
    clip.read().then(function (items) {
      var item = null;
      for (var i = 0; i < items.length; i++)
        if (items[i] && items[i].types && items[i].types.indexOf("image/png") !== -1) { item = items[i]; break; }
      if (!item) { toast("No PNG image on the clipboard", true); return; }
      item.getType("image/png").then(function (blob) { pngBlobToFont(blob); },
        function () { toast("Could not read the clipboard PNG", true); });
    }, function () {
      toast("Clipboard read was denied or failed", true);
    });
    return true;
  }

  function importPngImage(img, baseName) {
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
    if (baseName) { var nm = BF.sanitizeFontName(baseName); if (nm) font.name = nm; }
    setFont(font);
    toast("Imported " + cw + "×" + ch + " font from " + W + "×" + H + " PNG" +
      (font.name !== "font" ? ' as "' + font.name + '"' : ""));
  }

  // Atlas PNG canvas (16×16 grid, 1px per glyph px, black ink) with the
  // remembered background. Shared by file export and clipboard copy.
  function atlasCanvas() {
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
    return c;
  }
  // File name without the extension (for deriving the font name on import).
  function baseName(fileName) {
    var n = String(fileName || "");
    var dot = n.lastIndexOf(".");
    if (dot > 0) n = n.slice(0, dot);
    return n;
  }

  function exportPng(bgMode) {
    // bgMode "solid"/"transparent" (from the File-menu items) remembers the
    // choice; a bare call (Ctrl+S) exports with the remembered mode.
    if (bgMode === "solid" || bgMode === "transparent") settingsSet("pngBg", bgMode);
    atlasCanvas().toBlob(function (blob) {
      if (blob) downloadBlob(blob, BF.filenameBase(state.font.name) + ".png");
      else toast("PNG export failed", true);
    }, "image/png");
  }
  // Copy the whole atlas PNG to the clipboard (DECISIONS #66): remembered
  // pngBg, same fallback as the glyph copy (download) when the clipboard
  // API is unavailable or the write is blocked.
  function copyPngToClipboard() {
    atlasCanvas().toBlob(function (blob) {
      if (!blob) { toast("Could not rasterize the atlas", true); return; }
      var clip = (typeof navigator !== "undefined") ? navigator.clipboard : null;
      if (clip && typeof clip.write === "function" && typeof ClipboardItem !== "undefined") {
        clip.write([new ClipboardItem({ "image/png": blob })]).then(function () {
          toast("Copied PNG atlas to clipboard");
        }, function () {
          downloadBlob(blob, BF.filenameBase(state.font.name) + ".png");
          toast("Clipboard write blocked — PNG atlas downloaded", true);
        });
      } else {
        downloadBlob(blob, BF.filenameBase(state.font.name) + ".png");
        toast("Clipboard unavailable — PNG atlas downloaded", true);
      }
    }, "image/png");
  }

  function exportVerilog() {
    downloadText(BF.toVerilog(state.font), BF.filenameBase(state.font.name) + ".mem");
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
    // Name: the BDF's own FONT line wins, else the source file's basename.
    var nm = (p.name != null && BF.sanitizeFontName(p.name)) ||
             (name != null && BF.sanitizeFontName(baseName(name)));
    if (nm) font.name = nm;
    var d = font.data;
    for (var i = 0; i < d.length && i < p.data.length; i++) d[i] = p.data[i] ? 1 : 0;
    setFont(font);
    toast("Imported " + p.width + "\u00d7" + p.height + " font from BDF" + (name ? " (" + name + ")" : ""));
    return true;
  }

  function exportBdf() {
    downloadText(BF.toBDF(state.font), BF.filenameBase(state.font.name) + ".bdf");
  }

  // TrueType export (DECISIONS #82): the same minimal TTF the dogfood mode
  // injects, as a file. The font's own name becomes the family name (and the
  // .ttf's basename), like every other export.
  function exportTtf() {
    var bytes;
    try { bytes = BF_TTF.build(state.font, state.font.name || "bitforge"); }
    catch (e) { toast((e && e.message) || "TTF: build failed", true); return; }
    downloadBlob(new Blob([bytes], { type: "font/ttf" }), BF.filenameBase(state.font.name) + ".ttf");
  }

  // ---------- project file (.bitforge) — DECISIONS #64 ----------
  // WIP snapshot: font (data + guidelines + status + silences) + settings.
  // PNG stays the primary interchange format for finalized fonts; this is
  // what carries the things a PNG can't (guidelines/status/silences/text).
  var PROJECT_EXT = ".bitforge";
  function projectExportText() {
    return JSON.stringify(BF.projectToObj(state.font, settingsCache), null, 2);
  }
  function exportProject() {
    downloadText(projectExportText(), BF.filenameBase(state.font.name) + PROJECT_EXT);
  }
  function onOpenProjectClick() { el.fileProject.click(); }
  function onProjectFile(evt) {
    var file = evt.target.files && evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    var done = function (text) { importProjectText(text, file.name); };
    if (typeof file.text === "function") {
      file.text().then(done, function () { toast("Could not read " + file.name, true); });
    } else {
      var r = new FileReader();
      r.onload = function () { done(String(r.result)); };
      r.onerror = function () { toast("Could not read " + file.name, true); };
      r.readAsText(file);
    }
  }
  // ---------- ask/confirm modal (shared, chunk [AE], DECISIONS #88) ----------
  // Replaces the browser confirm() for the two replace-the-font flows
  // (project import, sample load): title + text + a caller-set yes-label,
  // yes runs the caller's continuation, cancel/× just closes.
  var askOnYes = null;
  function openAskModal(title, text, yesLabel, onYes) {
    askOnYes = onYes;
    el.askTitle.textContent = title;
    el.askText.textContent = text;
    el.askYes.textContent = yesLabel;
    el.askModal.hidden = false;
  }
  function closeAskModal() { el.askModal.hidden = true; }
  function askConfirm() {
    var fn = askOnYes; askOnYes = null;
    closeAskModal();
    if (fn) fn();
  }

  // Returns true when the import is proceeding (the ask modal is open for the
  // user's Replace/Cancel); toasts the error and returns false on malformed.
  function importProjectText(text, name) {
    var o;
    try { o = JSON.parse(text); }
    catch (e) { toast("Project: not valid JSON", true); return false; }
    var p = BF.objFromProject(o, knownCheckIds());
    if (!p.ok) { toast("Project: " + p.error, true); return false; }
    openAskModal("Replace font?",
      "Replace the current font with the one from" + (name ? " " + name : "") + "? The project's settings are applied too.",
      "Replace", function () {
        setFont(p.font);
        if (p.settings) applyImportedSettings(p.settings);
        toast("Imported project" + (name ? " (" + name + ")" : ""));
      });
    return true;
  }
  // Apply imported settings: same per-key type rules as loadSettings.
  // Unknown keys are dropped; missing keys keep the current value.
  function applyImportedSettings(o) {
    var changed = false;
    for (var k in settingsDefaults) {
      if (!o.hasOwnProperty(k)) continue;
      var want = typeof settingsDefaults[k], v = o[k];
      var okv = (want === "boolean" && typeof v === "boolean") ||
        (want === "number" && typeof v === "number" && isFinite(v)) ||
        (want === "string" && typeof v === "string");
      if (okv) { settingsSet(k, v); changed = true; }
    }
    if (!changed) return;
    // Same restore path as init(): settings -> state + control elements.
    state.scale = clamp(settingsGet("pvScale") | 0, 1, 64);
    state.bold = !!settingsGet("pvBold");
    state.italic = !!settingsGet("pvItalic");
    state.inverted = !!settingsGet("inverted");
    state.baseline = clamp(settingsGet("pvBaseline") | 0, 0, state.font.height - 1);
    el.pvScale.value = String(state.scale);
    el.pvText.value = settingsGet("pvText");
    el.qaShowSilenced.checked = !!settingsGet("qaShowSilenced");
    syncRenderControls();
    redrawAll();
    applyTheme(); // the import may have carried a different `theme` (DECISIONS #79)
    applyDogfood(); // …or a different dogfood state (DECISIONS #82)
    // DECISIONS #80: an imported selCode re-selects the remembered glyph; a file
    // without the key (older projects) leaves the current selection untouched.
    if (o.hasOwnProperty("selCode")) selectGlyph(settingsGet("selCode") | 0);
  }

  // ---------- sample fonts (DECISIONS #78, supersedes #77's embedded registry) ----------
  // Samples are FILES on the server, not embedded: samples/manifest.json lists
  // them, each pointing at a samples/*.bitforge file (the same shape File > Export
  // project… produces). You add/rename/reorder samples by editing that folder —
  // no code change, no build step.
  //
  // We only ever try to load them when the page is SERVED over http(s): browsers
  // block fetch() of local files, so under file:// (and in the headless stub) the
  // "Load sample…" menu item is hidden and a first run starts blank — exactly the
  // pre-[V] behavior. This is the graceful degrade the user asked for.
  var fetchedSamples = [];     // validated: { id, name, description, default, font, settings }
  var samplesState = "idle";   // "idle" | "loading" | "ready" | "unavailable"

  function isServed() {
    var p = "";
    try { p = (typeof location !== "undefined" && location && location.protocol) ? location.protocol : ""; } catch (e) { p = ""; }
    return (p === "http:" || p === "https:") && typeof fetch === "function";
  }
  // Validate one fetched sample's text -> { ok, font, settings, name } | { ok: false, error }.
  function validateSampleText(entry, text) {
    if (typeof text !== "string") return { ok: false, error: "sample file missing" };
    var o;
    try { o = JSON.parse(text); }
    catch (e) { return { ok: false, error: "sample does not parse as JSON" }; }
    var p = BF.objFromProject(o, knownCheckIds());
    if (!p.ok) return { ok: false, error: p.error };
    var name = (entry && typeof entry.name === "string" && entry.name) ? entry.name : (entry && entry.id) || "sample";
    return { ok: true, font: p.font, settings: p.settings, name: name };
  }
  // PURE: given the manifest array and a sync textFor(file) -> text (throws/returns
  // nothing when a file is missing), build the validated sample list. Bad entries
  // are skipped (with a console note), never fatal — one broken sample must not
  // take the good ones down. This is the part the headless suite drives directly.
  function buildSamples(manifest, textFor) {
    if (!Array.isArray(manifest)) throw new Error("manifest is not an array");
    var out = [];
    for (var i = 0; i < manifest.length; i++) {
      var entry = manifest[i];
      if (!entry || typeof entry !== "object" || typeof entry.file !== "string") { warnSampleSkip(entry, "manifest entry has no file"); continue; }
      var text;
      try { text = textFor(entry.file); } catch (e) { warnSampleSkip(entry, (e && e.message) || e); continue; }
      var v = validateSampleText(entry, text);
      if (!v.ok) { warnSampleSkip(entry, v.error); continue; }
      out.push({ id: entry.id, name: v.name, description: entry.description, default: entry.default === true, font: v.font, settings: v.settings });
    }
    return out;
  }
  function warnSampleSkip(entry, msg) {
    if (typeof console !== "undefined" && console.warn) console.warn("bitforge: skipping sample " + ((entry && entry.id) || "?") + ": " + msg);
  }
  function sampleList() { return fetchedSamples; }
  function samplesStateNow() { return samplesState; }
  function defaultSample() {
    for (var i = 0; i < fetchedSamples.length; i++) if (fetchedSamples[i] && fetchedSamples[i].default === true) return fetchedSamples[i];
    return fetchedSamples.length ? fetchedSamples[0] : null;
  }
  // Async transport wrapper over the pure buildSamples: fetch the manifest, then
  // every referenced file (in parallel), then build synchronously. Degrades to
  // "unavailable" (and hides the menu item) when not served or when the manifest
  // can't be read; a partial manifest keeps its good entries.
  function fetchSamples() {
    if (samplesState === "ready" || samplesState === "loading") return Promise.resolve(fetchedSamples);
    if (!isServed()) { samplesState = "unavailable"; updateSampleMenu(); return Promise.resolve([]); }
    samplesState = "loading"; updateSampleMenu();
    return fetch("samples/manifest.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("manifest HTTP " + r.status); return r.json(); })
      .then(function (manifest) {
        if (!Array.isArray(manifest)) throw new Error("manifest is not an array");
        var files = [];
        for (var i = 0; i < manifest.length; i++) { var f = manifest[i] && manifest[i].file; if (typeof f === "string" && files.indexOf(f) === -1) files.push(f); }
        return Promise.all(files.map(function (f) {
          return fetch("samples/" + f, { cache: "no-store" })
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
            .then(function (text) { return { file: f, text: text }; })
            .catch(function (e) { return { file: f, error: (e && e.message) || String(e) }; });
        }))
          .then(function (results) {
            var byFile = {};
            for (var j = 0; j < results.length; j++) byFile[results[j].file] = results[j];
            var L = buildSamples(manifest, function (file) {
              var r = byFile[file];
              if (!r) throw new Error("file not fetched");
              if (r.error) throw new Error(r.error);
              return r.text;
            });
            fetchedSamples = L;
            samplesState = L.length ? "ready" : "unavailable";
            return L;
          });
      })
      .catch(function (err) { warnSampleSkip(null, (err && err.message) || err); fetchedSamples = []; samplesState = "unavailable"; return []; })
      .then(function () { updateSampleMenu(); return fetchedSamples; });
  }
  // Show/hide Project > Open sample… : visible only when we actually have samples.
  function updateSampleMenu() {
    if (el.miLoadSample) el.miLoadSample.hidden = !(samplesState === "ready" && fetchedSamples.length > 0);
  }
  function renderSampleModal() {
    el.sampleList.textContent = "";
    if (samplesState === "ready" && fetchedSamples.length) {
      el.sampleEmpty.hidden = true;
      for (var i = 0; i < fetchedSamples.length; i++)
        (function (idx, s) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "sample-item";
          if (typeof s.description === "string") b.title = s.description;
          var n = document.createElement("span");
          n.className = "s-name";
          n.textContent = s.name + (s.default === true ? "  (default)" : "");
          b.appendChild(n);
          if (typeof s.description === "string" && s.description) {
            var d = document.createElement("span");
            d.className = "s-desc";
            d.textContent = s.description;
            b.appendChild(d);
          }
          b.addEventListener("click", function () { closeSampleModal(); loadSample(idx); });
          el.sampleList.appendChild(b);
        })(i, fetchedSamples[i]);
    } else {
      el.sampleEmpty.hidden = false;
      el.sampleList.textContent = "";
    }
  }
  function openSampleModal() { renderSampleModal(); el.sampleModal.hidden = false; if (samplesState !== "ready") fetchSamples().then(renderSampleModal); }
  function closeSampleModal() { el.sampleModal.hidden = true; }
  function loadSample(idx) {
    var s = fetchedSamples[idx];
    if (!s) { toast("Unknown sample", true); return; }
    openAskModal("Open sample " + s.name + "?",
      "It replaces the current font; the sample's settings are applied too.",
      "Open", function () {
        setFont(s.font);
        if (s.settings) applyImportedSettings(s.settings);
        toast("Loaded sample " + s.name);
      });
  }
  // First-run preload (DECISIONS #78): only when SERVED and there's no saved font.
  // A saved font always wins; the identity guard below means this can't clobber a
  // font the user already opened/loaded. Under file:// it's a no-op (blank start).
  // Note: called only from init when there was NO saved font, so it does not
  // re-check localStorage (setFont() has already persisted the blank by then).
  function firstRunSamplePreload() {
    if (!isServed()) return Promise.resolve();
    var ref = state.font; // identity guard: never clobber a font the user changed
    return fetchSamples().then(function () {
      if (state.font !== ref) return; // the user opened/loaded a different font
      var s = defaultSample();
      if (!s) return;
      if (s.settings) applyImportedSettings(s.settings);
      setFont(s.font);
      toast("Loaded sample " + s.name + " (first run)");
    });
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
    copyCanvasToClipboard(glyphCanvas(code, COPY_SCALE), name, "Copied " + selLabel() + " to clipboard");
  }
  // Shared clipboard pipeline (glyph copy + selection copy, DECISIONS #75):
  // canvas -> PNG blob -> navigator.clipboard when available, download
  // fallback otherwise (e.g. file:// without a secure context).
  function copyCanvasToClipboard(cv, name, okMsg) {
    cv.toBlob(function (blob) {
      if (!blob) { toast("Could not rasterize the image", true); return; }
      var clip = (typeof navigator !== "undefined") ? navigator.clipboard : null;
      if (clip && typeof clip.write === "function" && typeof ClipboardItem !== "undefined") {
        clip.write([new ClipboardItem({ "image/png": blob })]).then(function () {
          toast(okMsg);
        }, function () {
          downloadBlob(blob, name);
          toast("Clipboard write blocked \u2014 downloaded as " + name, true);
        });
      } else {
        downloadBlob(blob, name);
        toast("Clipboard unavailable \u2014 downloaded as " + name, true);
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
  // DECISIONS #52/#62: the Atlas tab has its own bold/italic/baseline/inverted
  // controls driving the SAME state as the Preview tab's (bold/italic live on
  // the Atlas tab only; baseline/inverted/scale exist on both). The setters
  // write state + settings, then syncRenderControls() pushes the values back
  // into the control elements so none can show a stale checked state.
  function setBold(v) { state.bold = v; settingsSet("pvBold", v); syncRenderControls(); drawPvText(); drawAtlas(); }
  function setItalic(v) { state.italic = v; settingsSet("pvItalic", v); syncRenderControls(); drawPvText(); drawAtlas(); }
  function setInverted(v) { state.inverted = v; settingsSet("inverted", v); syncRenderControls(); drawPvText(); drawAtlas(); }

  // ---------- preview head controls (DECISIONS #87) ----------
  // Text box on/off: hide the textarea + markup note so the render stands alone.
  function setPvShowText(v) {
    settingsSet("pvShowText", v);
    syncPvVisibility();
  }
  function syncPvVisibility() {
    if (!el.pvText || !el.pvMarkupNote) return; // before init
    var show = !!settingsGet("pvShowText");
    el.pvText.hidden = !show;
    el.pvMarkupNote.hidden = !show;
  }
  // Wrap on/off: OFF disables soft-wrap (one long row; the canvas-wrap scrollbars take over).
  function setPvWrap(v) {
    settingsSet("pvWrap", v);
    drawPvText();
  }
  // Click-to-add: gate for selector double-click insertion (the handler reads it live).
  function setPvInsert(v) {
    settingsSet("pvInsert", v);
  }

  // Insert a \uXX sequence at the preview text box's cursor (DECISIONS #87):
  // replaces a selection, appends at the end otherwise; the cursor lands after
  // the insert. The setting + render follow, exactly like typing.
  function insertGlyphSeq(code) {
    var t = el.pvText;
    var h = (code & 0xff).toString(16).toUpperCase();
    if (h.length < 2) h = "0" + h;
    var seq = "\\u" + h;
    var len = t.value.length;
    var s = (typeof t.selectionStart === "number" && t.selectionStart >= 0) ? Math.min(t.selectionStart, len) : len;
    var e = (typeof t.selectionEnd === "number" && t.selectionEnd >= 0) ? Math.min(t.selectionEnd, len) : s;
    t.value = t.value.slice(0, s) + seq + t.value.slice(e);
    var pos = s + seq.length;
    try { t.focus(); t.setSelectionRange(pos, pos); } catch (err) { /* stub: no selection API */ }
    settingsSet("pvText", t.value);
    drawPvText();
  }
  function setBaseline(v) {
    state.baseline = clamp(parseInt(v, 10), 0, state.font.height - 1);
    settingsSet("pvBaseline", state.baseline);
    syncRenderControls(); drawPvText(); drawAtlas();
  }
  function syncRenderControls() {
    if (!el.pvInverted || !state.font) return; // before init / before the first setFont
    el.atBold.checked = state.bold;        el.atItalic.checked = state.italic;
    el.pvInverted.checked = state.inverted; el.atInverted.checked = state.inverted;
    el.pvBaseline.value = String(state.baseline); el.atBaseline.value = String(state.baseline);
    el.pvBaseline.max = String(state.font.height - 1); el.atBaseline.max = String(state.font.height - 1);
    el.pvWrap.checked = !!settingsGet("pvWrap");
    el.pvShowText.checked = !!settingsGet("pvShowText");
    el.pvInsert.checked = !!settingsGet("pvInsert");
    syncPvVisibility();
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
    if (m === el.menuFont) renderFontInfo(); // fresh numbers each open
  }
  function toggleMenu(m) { if (openMenu === m) closeMenus(); else showMenu(m); }
  function hoverMenu(m) { if (openMenu !== m) showMenu(m); }

  // Font menu + Properties modal share this live font info line
  // (DECISIONS #55 moved the dims here from the toolbar; #70 added the name;
  // #81 moved the info block from the About menu to the Font menu).
  function fontInfoText() {
    var f = state.font, c = BF.statusCounts(f), ink = 0, code;
    for (code = 0; code < BF.NUM_GLYPHS; code++) ink += BF.inkCount(f, code);
    return '"' + f.name + '" \u00b7 ' +
      f.width + " \u00d7 " + f.height + " px \u00b7 256 glyphs \u00b7 " + ink + " ink px\n" +
      "done " + c.all.done + " \u00b7 wip " + c.all.wip + " \u00b7 unfinished " + c.all.unfinished;
  }
  function renderFontInfo() { el.fontInfo.textContent = fontInfoText(); }
  function openAboutModal() { el.aboutModal.hidden = false; }
  function closeAboutModal() { el.aboutModal.hidden = true; }

  // ---------- modal infrastructure (chunk [AE], DECISIONS #88) ----------
  // Every modal backdrop shares the same close paths: the × button, its
  // Cancel button, a mousedown on the backdrop itself, and Escape. wireModal()
  // wires all of those and registers the backdrop so anyModalOpen() /
  // closeAllModals() treat all modals as ONE Escape layer. A new modal needs
  // only its markup (index.html), its el entries, and one wireModal() call in
  // init() — no more per-modal close boilerplate.
  var modalRegistry = [];
  function wireModal(backdrop, closers) {
    modalRegistry.push(backdrop);
    for (var i = 0; i < closers.length; i++)
      closers[i].addEventListener("click", function () { backdrop.hidden = true; });
    backdrop.addEventListener("mousedown", function (e) {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  }
  function anyModalOpen() {
    for (var i = 0; i < modalRegistry.length; i++) if (!modalRegistry[i].hidden) return true;
    return false;
  }
  function closeAllModals() {
    for (var i = 0; i < modalRegistry.length; i++) modalRegistry[i].hidden = true;
  }

  // ---------- Changelog / what's new (DECISIONS #73) ----------
  // The last-run version is app metadata, not a user setting: its own
  // localStorage key, never part of the .bitforge project file.
  var VERSION_KEY = "bitforge.version.v1";
  function whatsNew() {
    var stored = null;
    try { stored = localStorage.getItem(VERSION_KEY); } catch (e) { /* ignore */ }
    return BF.changelogSince(BF_CHANGELOG, stored);
  }
  function renderChangelogList(entries) {
    var list = el.clList, i, j, e, div, head, ul, li;
    list.innerHTML = "";
    for (i = 0; i < entries.length; i++) {
      e = entries[i];
      div = document.createElement("div"); div.className = "cl-entry";
      head = document.createElement("div"); head.className = "cl-head";
      head.textContent = e.version;
      if (e.date) {
        var d = document.createElement("span");
        d.className = "muted"; d.textContent = "  " + e.date;
        head.appendChild(d);
      }
      div.appendChild(head);
      ul = document.createElement("ul");
      for (j = 0; j < e.changes.length; j++) {
        li = document.createElement("li");
        li.innerHTML = BF.mdLite(e.changes[j]); // **bold** / `code` subset (DECISIONS #84), escape-first
        ul.appendChild(li);
      }
      div.appendChild(ul);
      list.appendChild(div);
    }
  }
  // whatsNewMode = "what's new since last run" (startup): only the given
  // entries + a "Full changelog…" switch. Otherwise: the full list (About menu).
  function openChangelogModal(entries, whatsNewMode) {
    if (whatsNewMode) {
      el.clTitle.textContent = "What\u2019s new in bitforge " + BF.VERSION;
      el.clFull.hidden = false;
      el.clOk.textContent = "OK";
      renderChangelogList(entries);
    } else {
      el.clTitle.textContent = "bitforge changelog";
      el.clFull.hidden = true;
      el.clOk.textContent = "Close";
      renderChangelogList(BF_CHANGELOG);
    }
    el.clModal.hidden = false;
  }
  function closeChangelogModal() { el.clModal.hidden = true; }

  // Font properties modal (DECISIONS #70): editable name + live info.
  // A name change is metadata, not a mutation: saveLS only — no QA staleness
  // bump, not undoable.
  function openPropsModal() {
    el.propsName.value = state.font.name;
    renderPropsInfo();
    el.propsModal.hidden = false;
    el.propsName.focus();
  }
  function closePropsModal() { el.propsModal.hidden = true; }
  function renderPropsInfo() { el.propsInfo.textContent = fontInfoText(); }
  function saveProps() {
    var nm = BF.sanitizeFontName(el.propsName.value);
    state.font.name = nm || "font";
    saveLS();
    closePropsModal();
    toast('Font name: "' + state.font.name + '"');
  }

  // Resize… modal (DECISIONS #71): per-edge deltas, live result readout, and
  // a confirming second Apply when the crop would clip ink.
  var rzArmed = false;
  function rzDeltas() {
    function v(id) { var n = parseInt(el[id].value, 10); return isNaN(n) ? 0 : n; }
    return { dTop: v("rzTop"), dBottom: v("rzBottom"), dLeft: v("rzLeft"), dRight: v("rzRight") };
  }
  function rzRender() {
    var d = rzDeltas();
    var newW = state.font.width + d.dLeft + d.dRight;
    var newH = state.font.height + d.dTop + d.dBottom;
    if (!BF.validateDims(newW, newH).ok) {
      el.rzResult.textContent = "invalid — new size out of range";
    } else if (newW === state.font.width && newH === state.font.height) {
      el.rzResult.textContent = "\u2192 " + newW + "\u00d7" + newH + " (no change)";
    } else {
      el.rzResult.textContent = "\u2192 " + newW + "\u00d7" + newH;
    }
  }
  // Warning list: printable char + hex per affected glyph (app convention).
  // The FULL list — some affected glyphs are expected to crop, others may
  // not be, and the user has to be able to see all of them (DECISIONS #72).
  function clipCodesText(codes) {
    var s = "", i, p;
    for (i = 0; i < codes.length; i++) {
      p = printable(codes[i]);
      s += (i ? ", " : "") + hex2(codes[i]) + (p ? " \u00b7 " + p : "");
    }
    return s;
  }
  function openResizeModal() {
    el.rzTop.value = "0"; el.rzBottom.value = "0"; el.rzLeft.value = "0"; el.rzRight.value = "0";
    rzArmed = false;
    el.rzWarn.hidden = true;
    rzRender();
    el.rzModal.hidden = false;
  }
  function closeResizeModal() { el.rzModal.hidden = true; }
  function applyResizeAction() {
    var d = rzDeltas();
    if (!d.dTop && !d.dBottom && !d.dLeft && !d.dRight) { closeResizeModal(); return; }
    if (!rzArmed) {
      var peek;
      try { peek = BF.resizeFont(state.font, d); }
      catch (e) { toast(e.message || "Invalid resize", true); return; }
      if (peek.inkClipped > 0) {
        rzArmed = true;
        el.rzWarn.hidden = false;
        var m = peek.clippedCodes.length;
        el.rzWarn.textContent = peek.inkClipped + " px of ink will be clipped on " + m + (m === 1 ? " glyph: " : " glyphs: ") + clipCodesText(peek.clippedCodes) + " — click Apply again to confirm";
        return;
      }
    }
    if (applyResize(d)) closeResizeModal();
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
      filePng: $("file-png"), fileBdf: $("file-bdf"), fileProject: $("file-project"),
      menuProject: $("menu-project"), menuFont: $("menu-font"), menuGlyph: $("menu-glyph"), menuApp: $("menu-app"),
      mbProject: $("mb-project"), mbFont: $("mb-font"), mbGlyph: $("mb-glyph"), mbApp: $("mb-app"),
      fontInfo: $("font-info"), miAboutBitforge: $("mi-about-bitforge"), miChangelog: $("mi-changelog"),
      clModal: $("cl-modal"), clClose: $("cl-close"), clTitle: $("cl-title"), clList: $("cl-list"), clFull: $("cl-full"), clOk: $("cl-ok"),
      aboutTitle: $("about-title"), aboutModal: $("about-modal"), aboutClose: $("about-close"),
      miNew: $("mi-new"), miOpenPng: $("mi-open-png"), miOpenBdf: $("mi-open-bdf"), miOpenProject: $("mi-open-project"), miLoadSample: $("mi-load-sample"), miImportPngClip: $("mi-import-png-clip"),
      miExportPngSolid: $("mi-export-png-solid"), miExportPngTransparent: $("mi-export-png-transparent"), miCopyPngClip: $("mi-copy-png-clip"),
      miExportBdf: $("mi-export-bdf"), miExportTtf: $("mi-export-ttf"), miExportVerilog: $("mi-export-verilog"), miExportProject: $("mi-export-project"),
      miDogfood: $("mi-dogfood"),
      miUndo: $("mi-undo"), miRedo: $("mi-redo"), miProps: $("mi-props"), miClearGlyph: $("mi-clear-glyph"), miCopyGlyph: $("mi-copy-glyph"),
      miMirrorH: $("mi-mirror-h"), miMirrorV: $("mi-mirror-v"), miCopyTo: $("mi-copy-to"),
      toolPaint: $("tool-paint"), toolErase: $("tool-erase"), toolSelect: $("tool-select"),
      selbar: $("selbar"), selinfo: $("selinfo"),
      selPasteMode: $("sel-pastemode"),
      selFill: $("sel-fill"), selClear: $("sel-clear"), selInvert: $("sel-invert"),
      selCopy: $("sel-copy"), selCopyTo: $("sel-copyto"), selX: $("sel-x"),
      miCycleStatus: $("mi-cycle-status"), miDoneNext: $("mi-done-next"),
      miThemeLight: $("mi-theme-light"), miThemeDark: $("mi-theme-dark"), miThemeAuto: $("mi-theme-auto"),
      propsModal: $("props-modal"), propsClose: $("props-close"), propsInfo: $("props-info"),
      sampleModal: $("sample-modal"), sampleClose: $("sample-close"), sampleList: $("sample-list"), sampleEmpty: $("sample-empty"),
      propsName: $("props-name"), propsSave: $("props-save"), propsCancel: $("props-cancel"),
      miResize: $("mi-resize"), rzModal: $("rz-modal"), rzClose: $("rz-close"), rzResult: $("rz-result"),
      rzWarn: $("rz-warn"), rzTop: $("rz-top"), rzBottom: $("rz-bottom"), rzLeft: $("rz-left"),
      rzRight: $("rz-right"), rzApply: $("rz-apply"), rzCancel: $("rz-cancel"),
      newModal: $("new-modal"), newClose: $("new-close"), newW: $("new-w"), newH: $("new-h"),
      newResult: $("new-result"), newCreate: $("new-create"), newCancel: $("new-cancel"),
      cpModal: $("cp-modal"), cpClose: $("cp-close"), cpTitle: $("cp-title"), cpNote: $("cp-note"),
      cpInput: $("cp-input"), cpResult: $("cp-result"), cpOk: $("cp-ok"), cpCancel: $("cp-cancel"),
      askModal: $("ask-modal"), askClose: $("ask-close"), askTitle: $("ask-title"),
      askText: $("ask-text"), askYes: $("ask-yes"), askCancel: $("ask-cancel"),
      btnClear: $("btn-clear"), btnUndo: $("btn-undo"), btnRedo: $("btn-redo"),
      stUnfinished: $("st-unfinished"), stWip: $("st-wip"), stDone: $("st-done"),
      editor: $("editor"), editLabel: $("edit-label"),
      glock: $("glock"), glist: $("glist"),
      pvScale: $("pv-scale"), pvBaseline: $("pv-baseline"),
      pvInverted: $("pv-inverted"),
      atBold: $("at-bold"), atItalic: $("at-italic"), atBaseline: $("at-baseline"), atInverted: $("at-inverted"),
      pvText: $("pv-text"), pvTextCanvas: $("pv-text-canvas"),
      pvWrap: $("pv-wrap"), pvShowText: $("pv-showtext"), pvInsert: $("pv-insert"), pvMarkupNote: $("pv-markup-note"),
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
    el.fileProject.addEventListener("change", onProjectFile);

    // Menu bar: titles (open/toggle + hover-switch) and items (action + close).
    menuEls = [el.menuProject, el.menuFont, el.menuGlyph, el.menuApp];
    var menuPairs = [[el.menuProject, el.mbProject], [el.menuFont, el.mbFont], [el.menuGlyph, el.mbGlyph], [el.menuApp, el.mbApp]];
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
      if (e.key === "Escape") {
        // Snapshot FIRST: whatever is open CLAIMS the Escape (closes itself)
        // and the selection must survive; only a fully idle Escape deselects.
        // (Pre-[AE] the open-check ran after the closes, so it was dead code
        // and Escape with a modal open also cleared the selection — the
        // documented intent was "Esc deselects when no menu or modal is open".)
        var i, menuBusy = false;
        for (i = 0; i < menuPairs.length; i++) if (menuPairs[i][0].classList.contains("open")) menuBusy = true;
        var modalBusy = anyModalOpen(), keysBusy = !el.keysCard.hidden;
        closeMenus();
        closeAllModals();
        if (menuBusy || modalBusy || keysBusy) return;
        if (state.selRect) clearSel();
      }
    });
    function menuItem(id, fn) {
      el[id].addEventListener("click", function () { closeMenus(); fn(); });
    }
    menuItem("miNew", openNewModal);
    menuItem("miOpenPng", onOpenClick);
    menuItem("miOpenBdf", onOpenBdfClick);
    menuItem("miOpenProject", onOpenProjectClick);
    menuItem("miLoadSample", openSampleModal);
    menuItem("miImportPngClip", importPngFromClipboard);
    menuItem("miExportPngSolid", function () { exportPng("solid"); });
    menuItem("miExportPngTransparent", function () { exportPng("transparent"); });
    menuItem("miCopyPngClip", copyPngToClipboard);
    menuItem("miExportBdf", exportBdf);
    menuItem("miExportTtf", exportTtf);
    menuItem("miExportProject", exportProject);
    menuItem("miExportVerilog", exportVerilog);
    menuItem("miUndo", undo);
    menuItem("miRedo", redo);
    menuItem("miProps", openPropsModal);
    menuItem("miResize", openResizeModal);
    menuItem("miClearGlyph", clearGlyphAction);
    menuItem("miMirrorH", function () { mirrorAction("h"); });
    menuItem("miMirrorV", function () { mirrorAction("v"); });
    menuItem("miCopyTo", copyToCodepointAction);
    menuItem("miCycleStatus", cycleStatusAction);
    menuItem("miDoneNext", doneNextAction);
    menuItem("miCopyGlyph", copyGlyphToClipboard);
    // Theme radio (DECISIONS #79): explicit choice wins over the system;
    // auto follows prefers-color-scheme (watchSystemTheme keeps it live).
    menuItem("miDogfood", toggleDogfood);
    menuItem("miThemeLight", function () { chooseTheme("light"); });
    menuItem("miThemeDark", function () { chooseTheme("dark"); });
    menuItem("miThemeAuto", function () { chooseTheme("auto"); });
    menuItem("miAboutBitforge", openAboutModal);
    menuItem("miChangelog", function () { openChangelogModal(BF_CHANGELOG, false); });

    // Modal close wiring (chunk [AE], DECISIONS #88): every backdrop shares
    // the same paths — × / Cancel button(s) / backdrop mousedown — wired once
    // via wireModal(); Escape treats all modals as one layer (handler above).
    // Action buttons (Save / Apply / Full changelog…) are wired separately.
    wireModal(el.aboutModal, [el.aboutClose]);
    wireModal(el.clModal, [el.clClose, el.clOk]);
    wireModal(el.propsModal, [el.propsClose, el.propsCancel]);
    wireModal(el.rzModal, [el.rzClose, el.rzCancel]);
    wireModal(el.sampleModal, [el.sampleClose]);
    wireModal(el.newModal, [el.newClose, el.newCancel]);
    wireModal(el.cpModal, [el.cpClose, el.cpCancel]);
    wireModal(el.askModal, [el.askClose, el.askCancel]);

    // Changelog: “Full changelog…” switches the what's-new view to the full list.
    el.clFull.addEventListener("click", function () { openChangelogModal(BF_CHANGELOG, false); });

    // Properties modal: Save applies the name (close paths are wireModal'd above).
    el.propsSave.addEventListener("click", saveProps);

    // Resize modal: Apply does the (possibly two-step) resize; live result readout.
    el.rzApply.addEventListener("click", applyResizeAction);
    var rzInputs = ["rzTop", "rzBottom", "rzLeft", "rzRight"];
    for (var rzi = 0; rzi < rzInputs.length; rzi++)
      el[rzInputs[rzi]].addEventListener("input", rzRender);

    // New-font modal (chunk [AE]): live size readout on input.
    el.newCreate.addEventListener("click", createNewFont);
    el.newW.addEventListener("input", newRender);
    el.newH.addEventListener("input", newRender);

    // Codepoint-target modal (chunk [AE]): live result on input; Enter = OK.
    el.cpOk.addEventListener("click", cpOk);
    el.cpInput.addEventListener("input", cpRender);
    el.cpInput.addEventListener("keydown", function (e) { if (e.key === "Enter") cpOk(); });

    // Ask/confirm modal (chunk [AE]).
    el.askYes.addEventListener("click", askConfirm);

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

    // Editor tools + selection actions (DECISIONS #75).
    el.toolPaint.addEventListener("click", function () { setTool("paint"); });
    el.toolErase.addEventListener("click", function () { setTool("erase"); });
    el.toolSelect.addEventListener("click", function () { setTool("select"); });
    el.selFill.addEventListener("click", function () { selAction("fill"); });
    el.selClear.addEventListener("click", function () { selAction("clear"); });
    el.selInvert.addEventListener("click", function () { selAction("invert"); });
    el.selCopy.addEventListener("click", selCopy);
    el.selCopyTo.addEventListener("click", selCopyTo);
    el.selX.addEventListener("click", clearSel);
    el.selPasteMode.addEventListener("click", function () {
      setPasteMode(pasteMode() === "merge" ? "replace" : "merge");
    });
    setTool("paint"); // sync the toolbar with the default tool

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
    // Double-click a selector glyph (Preview tab + "click to add" on): insert
    // its \uXX at the text box's cursor (DECISIONS #87). The preceding click(s)
    // already selected the glyph, so you get "selected + inserted".
    el.selector.addEventListener("dblclick", function (evt) {
      if (!settingsGet("pvInsert") || state.activeTab !== "preview") return;
      var r = this.getBoundingClientRect();
      var col = Math.floor((evt.clientX - r.left) / 16);
      var row = Math.floor((evt.clientY - r.top) / 16);
      if (row < 0 || row > 15 || col < 0 || col > 15) return;
      insertGlyphSeq(row * 16 + col);
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
    bindToggle("atBold", setBold);
    bindToggle("atItalic", setItalic);
    bindToggle("pvInverted", setInverted); bindToggle("atInverted", setInverted);
    bindToggle("pvWrap", setPvWrap);
    bindToggle("pvShowText", setPvShowText);
    bindToggle("pvInsert", setPvInsert);
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
    shortcuts.register({ combo: "Alt+n", description: "New blank font", handler: openNewModal });
    shortcuts.register({ combo: "Alt+o", description: "Open PNG atlas", handler: onOpenClick });
    shortcuts.register({ combo: "Alt+Shift+o", description: "Open BDF font", handler: onOpenBdfClick });
    shortcuts.register({ combo: "Alt+p", description: "Open project file", handler: onOpenProjectClick });
    shortcuts.register({ combo: "Ctrl+s", description: "Export PNG (last-used bg)", handler: function () { exportPng(); } });
    shortcuts.register({ combo: "Ctrl+Shift+s", description: "Export Verilog ROM", handler: exportVerilog });
    shortcuts.register({ combo: "Alt+Shift+s", description: "Export BDF font", handler: exportBdf });
    shortcuts.register({ combo: "Alt+Shift+t", description: "Export TTF font", handler: exportTtf });
    shortcuts.register({ combo: "Alt+Shift+p", description: "Export project file", handler: exportProject });
    shortcuts.register({ combo: "Alt+Shift+c", description: "Copy PNG atlas to clipboard", handler: copyPngToClipboard });
    shortcuts.register({ combo: "e", description: "Show the Edit tab", handler: function () { setActiveTab("edit"); } });
    shortcuts.register({ combo: "p", description: "Show the Preview tab", handler: function () { setActiveTab("preview"); } });
    shortcuts.register({ combo: "a", description: "Show the Atlas tab", handler: function () { setActiveTab("atlas"); } });
    shortcuts.register({ combo: "q", description: "Show the QA tab", handler: function () { setActiveTab("qa"); } });
    shortcuts.register({ combo: "Ctrl+q", description: "QA tab + run checks", handler: function () { setActiveTab("qa"); qaRefresh(); } });
    shortcuts.register({ combo: "d", description: "Cycle glyph status (unf \u2192 wip \u2192 done)", handler: cycleStatusAction });
    shortcuts.register({ combo: "Shift+d", description: "Mark done & move to next glyph", handler: doneNextAction });
    shortcuts.register({ combo: "h", description: "Mirror glyph left–right", handler: function () { mirrorAction("h"); } });
    shortcuts.register({ combo: "v", description: "Mirror glyph up–down", handler: function () { mirrorAction("v"); } });
    shortcuts.register({ combo: "c", description: "Copy glyph to codepoint…", handler: copyToCodepointAction });
    shortcuts.register({ combo: "b", description: "Paint tool", handler: function () { setTool("paint"); } });
    shortcuts.register({ combo: "s", description: "Select tool (marquee)", handler: function () { setTool("select"); } });
    shortcuts.register({ combo: "f", description: "Fill the selection (selection active)", handler: function () { selAction("fill"); } });
    shortcuts.register({ combo: "x", description: "Clear the selection (selection active)", handler: function () { selAction("clear"); } });
    shortcuts.register({ combo: "i", description: "Invert the selection (selection active)", handler: function () { selAction("invert"); } });
    shortcuts.register({ combo: "Ctrl/Alt + drag selection", description: "Copy the selection to a new spot (source kept) — plain drag moves it (cut)" });
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
    // DECISIONS #78: saved font > blank. A served first run (no saved font) then
    // preloads the default sample asynchronously (below); file:// starts blank.
    var savedFont = loadLS();
    var font = savedFont || BF.makeFont(8, 16);
    // DECISIONS #80: reopen where the user left off (default 0; clamped).
    state.selected = clamp(settingsGet("selCode") | 0, 0, 255);
    state.scale = clamp(settingsGet("pvScale") | 0, 1, 64);
    state.bold = !!settingsGet("pvBold");
    state.italic = !!settingsGet("pvItalic");
    state.inverted = !!settingsGet("inverted");
    state.baseline = clamp(settingsGet("pvBaseline") | 0, 0, font.height - 1);
    el.pvScale.value = String(state.scale);
    el.pvText.value = settingsGet("pvText");
    el.qaShowSilenced.checked = !!settingsGet("qaShowSilenced");
    syncPasteModeBtn(); // paste-mode button label (after loadSettings — init order!)
    setFont(font); // setFont -> syncRenderControls (state.font must exist first)

    // Theme (DECISIONS #79): after loadSettings + setFont (init order!),
    // resolve the theme setting, tag <html>, and re-skin the canvases.
    watchSystemTheme();
    applyTheme();

    // Changelog (DECISIONS #73): remember this run's version, and if the
    // user is on a newer bitforge than before, show what has changed since
    // their last run (first run = no stored version = full changelog).
    var newEntries = whatsNew();
    try { localStorage.setItem(VERSION_KEY, BF.VERSION); } catch (e) { /* ignore */ }
    if (newEntries.length) openChangelogModal(newEntries, true);

    // DECISIONS #78: first-run default sample (served only; a saved font already
    // won, and the identity guard inside prevents clobbering a later user load).
    if (!savedFont) firstRunSamplePreload();
  }

  // Test seam: only under the jsc DOM stub (harmless in the browser). Lets the
  // headless tests drive the shortcut registry, status and QA and inspect state.
  if (typeof globalThis !== "undefined" && globalThis.__stub)
    globalThis.__stub.app = { state: state, shortcuts: shortcuts, selectGlyph: selectGlyph, toggleKeysCard: toggleKeysCard,
      setStatus: setStatus, qaRefresh: qaRefresh, qaRows: qaComputeRows, qaStale: qaStale, atlasCellAt: atlasCellAt,
      toggleSilence: toggleSilence, qaChecks: qaChecks, guidePresets: GUIDE_PRESETS,
      addGuide: addGuide, moveGuide: moveGuide, guidelineAt: guidelineAt, drawEditor: drawEditor,
      qaPropValue: qaPropValue, qaPropInputId: qaPropInputId, onQaPropChange: onQaPropChange,
      importBdfText: importBdfText, exportBdf: exportBdf,
      importProjectText: importProjectText, projectExportText: projectExportText, exportProject: exportProject,
      copyPngToClipboard: copyPngToClipboard, importPngFromClipboard: importPngFromClipboard,
      copyGlyph: copyGlyphToClipboard, glyphCanvas: glyphCanvas, applyResize: applyResize,
      mirrorAction: mirrorAction, copyToCodepointAction: copyToCodepointAction, parseCodeInput: parseCodeInput,
      setTool: setTool, setSel: setSel, clearSel: clearSel, selAction: selAction, selCopyTo: selCopyTo,
      // chunk [AE] in-app dialogs (DECISIONS #88): drive the three shared modals
      openNewModal: openNewModal, closeNewModal: closeNewModal, createNewFont: createNewFont, newRender: newRender,
      openCodepointModal: openCodepointModal, closeCodepointModal: closeCodepointModal, cpRender: cpRender, cpOk: cpOk,
      openAskModal: openAskModal, closeAskModal: closeAskModal, askConfirm: askConfirm,
      anyModalOpen: anyModalOpen, closeAllModals: closeAllModals,
      pasteMode: pasteMode, setPasteMode: setPasteMode,
      onEditorDown: onEditorDown, onEditorMove: onEditorMove, onEditorUp: onEditorUp,
      getLastToast: function () { return lastToast; },
      exportPng: exportPng, settingsGet: settingsGet, settingsSet: settingsSet,
      settingsDefaults: function () { return settingsDefaults; },
      resolveTheme: resolveTheme, chooseTheme: chooseTheme, applyTheme: applyTheme,
      watchSystemTheme: watchSystemTheme, redrawAll: redrawAll,
      syncThemeMenu: syncThemeMenu, themeColors: themeColors,
      pvSurfaceDark: pvSurfaceDark, inkColor: inkColor, bgColor: bgColor,
      setInverted: setInverted, setPvShowText: setPvShowText, syncPvVisibility: syncPvVisibility,
      setPvWrap: setPvWrap, setPvInsert: setPvInsert, insertGlyphSeq: insertGlyphSeq,
      drawPvText: drawPvText, drawAtlas: drawAtlas,
      exportTtf: exportTtf,
      dogfoodCSS: dogfoodCSS, applyDogfood: applyDogfood, toggleDogfood: toggleDogfood,
      syncDogfoodMenu: syncDogfoodMenu, scheduleDogfood: scheduleDogfood,
      dogfoodStyle: function () { return dogfoodStyleEl; },
      whatsNew: whatsNew, openChangelogModal: openChangelogModal, closeChangelogModal: closeChangelogModal,
      changelogVersionKey: VERSION_KEY,
      sampleList: sampleList, defaultSample: defaultSample, samplesState: samplesStateNow,
      validateSampleText: validateSampleText, buildSamples: buildSamples, isServed: isServed,
      fetchSamples: fetchSamples, firstRunSamplePreload: firstRunSamplePreload,
      setSamples: function (list, st) { fetchedSamples = list || []; samplesState = st || (list && list.length ? "ready" : "unavailable"); updateSampleMenu(); },
      applyImportedSettings: applyImportedSettings,
      openSampleModal: openSampleModal, closeSampleModal: closeSampleModal, loadSample: loadSample };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
