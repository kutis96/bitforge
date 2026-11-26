/* bitforge — theme / dark mode (chunk [W], DECISIONS #79).
 * Needs the DOM stub + app.js loaded (see test/run.js ordering).
 * The pure resolution matrix, the default, the headless apply, the
 * persisted choice, live system-scheme reactivity, and import pickup. */

function bfThemeSave() { return globalThis.localStorage.getItem("bitforge.settings.v1"); }
function bfThemeRestore(oldSetting) {
  if (oldSetting == null) globalThis.localStorage.removeItem("bitforge.settings.v1");
  else globalThis.localStorage.setItem("bitforge.settings.v1", oldSetting);
}

test("theme: resolveTheme pure matrix (explicit wins, auto follows, bogus -> auto)", function () {
  var rt = globalThis.__stub.app.resolveTheme;
  assertEqual(rt("light", false), "light", "explicit light, light system");
  assertEqual(rt("light", true), "light", "explicit light, dark system (wins)");
  assertEqual(rt("dark", false), "dark", "explicit dark, light system (wins)");
  assertEqual(rt("dark", true), "dark", "explicit dark, dark system");
  assertEqual(rt("auto", false), "light", "auto, light system");
  assertEqual(rt("auto", true), "dark", "auto, dark system");
  assertEqual(rt(undefined, true), "dark", "missing setting behaves like auto");
  assertEqual(rt("bogus", false), "light", "unknown setting behaves like auto");
});

test("theme: default setting is auto; headless apply resolves light and tags <html>", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  assertEqual(app.settingsGet("theme"), "auto", "default theme setting = auto");
  app.chooseTheme("auto"); // normalize through the real path (idempotent)
  assertEqual(document.documentElement.getAttribute("data-theme"), "light",
    "no matchMedia in the stub -> auto falls back to light");
  assertEqual(app.state.theme, "light", "state.theme tracks the resolved theme");
  assert(els["mi-theme-auto"].classList.contains("active"), "auto menu item marked active");
  assert(!els["mi-theme-light"].classList.contains("active"), "light menu item not active");
  assert(!els["mi-theme-dark"].classList.contains("active"), "dark menu item not active");
});

test("theme: choosing dark persists the setting, retags <html>, moves the menu check", function () {
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var saved = bfThemeSave();
  try {
    app.chooseTheme("dark");
    assertEqual(app.settingsGet("theme"), "dark", "setting persisted");
    assertEqual(document.documentElement.getAttribute("data-theme"), "dark", "data-theme = dark");
    assertEqual(app.state.theme, "dark", "state.theme = dark");
    assert(els["mi-theme-dark"].classList.contains("active"), "dark menu item active");
    assert(!els["mi-theme-auto"].classList.contains("active"), "auto menu item inactive");
    assertEqual(app.themeColors().ink, "#e6e6e6", "dark canvas palette: light ink");
    app.chooseTheme("light");
    assertEqual(document.documentElement.getAttribute("data-theme"), "light", "back to light");
    assertEqual(app.themeColors().bg, "#fff", "light canvas palette: white bg (pre-[W] literal)");
    // Invalid choice is a no-op.
    app.chooseTheme("neon");
    assertEqual(app.settingsGet("theme"), "light", "bogus choice ignored");
  } finally { bfThemeRestore(saved); app.applyTheme(); }
});

test("theme: auto follows live system-scheme changes (matchMedia change event)", function () {
  var app = globalThis.__stub.app;
  var savedSetting = bfThemeSave();
  var oldWindow = globalThis.window;
  var mq = { matches: true, _l: null, addEventListener: function (t, cb) { if (t === "change") this._l = cb; } };
  globalThis.window = { addEventListener: function () {}, matchMedia: function (q) {
    if (q === "(prefers-color-scheme: dark)") return mq; return { matches: false, addEventListener: function () {} };
  } };
  try {
    app.watchSystemTheme(); // re-arm on our fake mq (init armed nothing under the stub)
    app.chooseTheme("auto");
    assertEqual(app.state.theme, "dark", "auto + dark system -> dark");
    assertEqual(document.documentElement.getAttribute("data-theme"), "dark", "data-theme = dark");
    mq.matches = false; mq._l(); // system switches to light
    assertEqual(app.state.theme, "light", "auto re-resolves light on change event");
    assertEqual(document.documentElement.getAttribute("data-theme"), "light", "data-theme = light");
    // An explicit choice must NOT follow the system afterwards.
    app.chooseTheme("light");
    mq.matches = true; mq._l();
    assertEqual(app.state.theme, "light", "explicit light ignores the dark system");
  } finally {
    globalThis.window = oldWindow;
    bfThemeRestore(savedSetting);
    app.applyTheme();
  }
});

test("theme: a .bitforge import carrying theme=dark is applied (DECISIONS #79)", function () {
  var app = globalThis.__stub.app;
  var savedSetting = bfThemeSave();
  var savedFont = globalThis.localStorage.getItem("bitforge.font.v1");
  try {
    var before = app.settingsGet("theme");
    app.applyImportedSettings({ theme: before === "dark" ? "light" : "dark" });
    assertEqual(document.documentElement.getAttribute("data-theme"), app.settingsGet("theme"),
      "imported explicit theme applied to <html>");
    assertEqual(app.state.theme, app.settingsGet("theme"), "imported explicit theme in state");
  } finally {
    if (savedSetting == null) globalThis.localStorage.removeItem("bitforge.settings.v1");
    else globalThis.localStorage.setItem("bitforge.settings.v1", savedSetting);
    if (savedFont == null) globalThis.localStorage.removeItem("bitforge.font.v1");
    else globalThis.localStorage.setItem("bitforge.font.v1", savedFont);
    app.applyTheme(); // restores the previous theme; redraws on change
  }
});

test("theme: preview surfaces — inverted is relative to the theme (DECISIONS #87)", function () {
  var app = globalThis.__stub.app;
  var savedSetting = bfThemeSave();
  var savedInverted = app.settingsGet("inverted");
  try {
    // Light theme: default black-on-white; inverted = white-on-black.
    app.chooseTheme("light");
    app.setInverted(false);
    assertEqual(app.pvSurfaceDark(), false, "light + default -> light surface");
    assertEqual(app.inkColor(), "#111", "light: black ink");
    assertEqual(app.bgColor(), "#fff", "light: white bg");
    app.setInverted(true);
    assertEqual(app.inkColor(), "#eee", "light inverted: light ink");
    assertEqual(app.bgColor(), "#111", "light inverted: dark bg");
    // Dark theme: default white-on-black; inverted flips back to black-on-white.
    app.chooseTheme("dark");
    app.setInverted(false);
    assertEqual(app.pvSurfaceDark(), true, "dark + default -> dark surface");
    assertEqual(app.inkColor(), "#eee", "dark: light ink by default");
    assertEqual(app.bgColor(), "#111", "dark: dark bg by default");
    app.setInverted(true);
    assertEqual(app.inkColor(), "#111", "dark inverted: black ink");
    assertEqual(app.bgColor(), "#fff", "dark inverted: white bg");
    // The rendered surface actually follows (bg fill of the preview canvas).
    var els = globalThis.__stub.els;
    els["pv-text"].value = "x";
    var ctx = els["pv-text-canvas"]._ctx;
    var n0 = ctx.rects.length;
    app.drawPvText();
    assert(ctx.rects.slice(n0).indexOf("#fff") >= 0, "dark + inverted fills the light bg (#fff)");
  } finally {
    app.setInverted(savedInverted);
    bfThemeRestore(savedSetting);
    app.applyTheme();
  }
});

test("theme: selector mini-glyph ink follows the theme (DECISIONS #79)", function () {
  // Regression: the selector called drawGlyphTo() with no color, inheriting
  // its #111 default — black mini-glyphs, unreadable on the dark background.
  var app = globalThis.__stub.app, els = globalThis.__stub.els;
  var savedSetting = bfThemeSave();
  try {
    BF.setPixel(app.state.font, 65, 0, 0, 1); // one ink pixel for the selector to draw

    app.chooseTheme("dark");
    app.redrawAll(); // deterministic redraw in the dark state (whatever it was before)
    var selCtx = els["selector"]._ctx;
    var n0 = selCtx.rects.length;
    app.redrawAll();
    var darkFresh = selCtx.rects.slice(n0);
    assert(darkFresh.indexOf("#e6e6e6") >= 0, "dark: selector mini-glyphs drawn in light ink");
    assert(darkFresh.indexOf("#111") < 0, "dark: no black glyph ink left on the selector");

    app.chooseTheme("light");
    app.redrawAll();
    var n1 = selCtx.rects.length;
    app.redrawAll();
    var lightFresh = selCtx.rects.slice(n1);
    assert(lightFresh.indexOf("#111") >= 0, "light: selector mini-glyphs drawn in black ink");
    assert(lightFresh.indexOf("#e6e6e6") < 0, "light: no dark-ink on the selector");
  } finally {
    BF.setPixel(app.state.font, 65, 0, 0, 0);
    bfThemeRestore(savedSetting);
    app.applyTheme();
  }
});
