#!/usr/bin/env python3
"""
bitforge — TTF verifier (macOS builtins only: python3 + jsc + CoreText).

The app's own unit tests parse the TTF with their own in-file reader, which
can share a bug with the builder. This tool is an INDEPENDENT oracle: it
loads the font in a real font engine (CoreText, via ctypes) and checks it
against ground truth.

Two modes (picked by the input file):

  verify-ttf.py  font.bitforge
      Builds the TTF with the app's own js/ttf.js (run under jsc), then:
        - CoreText must accept the font (CGFont + CTFont both created);
        - unitsPerEm / family name are sensible;
        - cmap: every inked code maps to a non-empty glyph, every blank
          code maps to glyph 0, space (0x20) keeps its own slot;
        - every mapped glyph advances exactly w*upx font units;
        - every inked glyph's ink bounding box is EXACTLY what the
          .bitforge pixels imply;
        - (soft) bitmap-rendering each glyph at 1 px/unit reproduces the
          exact ink pixel count.

  verify-ttf.py  font.ttf
      Loads an existing TTF and checks: it loads in CoreText, metadata is
      readable, and per-glyph metrics reported by CoreText match the file's
      own glyf/hmtx tables (self-consistency).

Exit codes: 0 = all checks passed, 1 = one or more checks failed,
            2 = usage or environment error.

No third-party dependencies. Python 3.8+ (uses only ctypes/json/struct).
"""

import base64
import ctypes
import ctypes.util
import json
import os
import struct
import subprocess
import sys
import tempfile

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

JSC = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"

FRAMEWORKS = {
    "CF": "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
    "CG": "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
    "CT": "/System/Library/Frameworks/CoreText.framework/CoreText",
}


def die_env(msg):
    print("environment error: %s" % msg, file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------------------
# ctypes bindings (CoreFoundation / CoreGraphics / CoreText)
# ---------------------------------------------------------------------------

class CGPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]


class CGRect(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double),
                ("w", ctypes.c_double), ("h", ctypes.c_double)]


class CGAffineTransform(ctypes.Structure):
    _fields_ = [("a", ctypes.c_double), ("b", ctypes.c_double),
                ("c", ctypes.c_double), ("d", ctypes.c_double),
                ("tx", ctypes.c_double), ("ty", ctypes.c_double)]


CFIndex = ctypes.c_long
UniChar = ctypes.c_uint16
CGGlyph = ctypes.c_uint32


class CFRange(ctypes.Structure):
    _fields_ = [("location", CFIndex), ("length", CFIndex)]


IDENT = CGAffineTransform(1, 0, 0, 1, 0, 0)

# Constants
K_CF_STRING_ENCODING_UTF8 = 0x08000100
K_CF_URL_POSIX_PATH_STYLE = 0
K_CG_FONT_ORIENTATION_DEFAULT = 0
K_CG_IMAGE_ALPHA_NONE = 0      # 8 bpc grayscale, 1 byte/px
K_CF_TRUE = 1

CF = None
CG = None
CT = None


def load_frameworks():
    global CF, CG, CT
    libs = {}
    for name, path in FRAMEWORKS.items():
        try:
            libs[name] = ctypes.CDLL(path)  # also serves as the existence check
        except OSError as e:
            die_env("framework not loadable: %s (%s)" % (path, e))
    CF, CG, CT = libs["CF"], libs["CG"], libs["CT"]

    CF.CFAllocatorGetDefault.restype = ctypes.c_void_p
    CF.CFAllocatorGetDefault.argtypes = []

    CF.CFStringCreateWithCString.restype = ctypes.c_void_p
    CF.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]

    CF.CFDataCreate.restype = ctypes.c_void_p
    CF.CFDataCreate.argtypes = [ctypes.c_void_p, ctypes.c_void_p, CFIndex]

    CF.CFStringGetCString.restype = ctypes.c_uint32
    CF.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, CFIndex, ctypes.c_uint32]

    CF.CFRelease.argtypes = [ctypes.c_void_p]
    CF.CFRelease.restype = None

    CG.CGDataProviderCreateWithCFData.restype = ctypes.c_void_p
    CG.CGDataProviderCreateWithCFData.argtypes = [ctypes.c_void_p]

    CG.CGFontCreateWithDataProvider.restype = ctypes.c_void_p
    CG.CGFontCreateWithDataProvider.argtypes = [ctypes.c_void_p]

    CG.CGColorSpaceCreateDeviceGray.restype = ctypes.c_void_p
    CG.CGColorSpaceCreateDeviceGray.argtypes = []

    CG.CGColorCreateGenericRGB.restype = ctypes.c_void_p
    CG.CGColorCreateGenericRGB.argtypes = [ctypes.c_double] * 4

    CG.CGBitmapContextCreate.restype = ctypes.c_void_p
    CG.CGBitmapContextCreate.argtypes = [ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32,
                                         ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32]

    CG.CGBitmapContextGetData.restype = ctypes.c_void_p
    CG.CGBitmapContextGetData.argtypes = [ctypes.c_void_p]

    CG.CGContextSetShouldAntialias.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    CG.CGContextSetShouldAntialias.restype = None
    CG.CGContextSetFillColorWithColor.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    CG.CGContextSetFillColorWithColor.restype = None
    CG.CGContextFillRect.argtypes = [ctypes.c_void_p, CGRect]
    CG.CGContextFillRect.restype = None
    CG.CGContextSetTextPosition.argtypes = [ctypes.c_void_p, ctypes.c_double, ctypes.c_double]
    CG.CGContextSetTextPosition.restype = None

    CT.CTFontCreateWithGraphicsFont.restype = ctypes.c_void_p
    CT.CTFontCreateWithGraphicsFont.argtypes = [ctypes.c_void_p, ctypes.c_double,
                                                ctypes.POINTER(CGAffineTransform), ctypes.c_uint32]

    CT.CTFontGetUnitsPerEm.restype = CFIndex
    CT.CTFontGetUnitsPerEm.argtypes = [ctypes.c_void_p]

    CT.CTFontCopyPostScriptName.restype = ctypes.c_void_p
    CT.CTFontCopyPostScriptName.argtypes = [ctypes.c_void_p]

    CT.CTFontCopyFullName.restype = ctypes.c_void_p
    CT.CTFontCopyFullName.argtypes = [ctypes.c_void_p]

    CT.CTFontGetGlyphsForCharacters.restype = ctypes.c_uint32
    CT.CTFontGetGlyphsForCharacters.argtypes = [ctypes.c_void_p, ctypes.POINTER(UniChar),
                                                ctypes.POINTER(CGGlyph), CFIndex]

    CT.CTFontGetAdvancesForGlyphs.restype = None
    CT.CTFontGetAdvancesForGlyphs.argtypes = [ctypes.c_void_p, ctypes.c_int32,
                                              ctypes.POINTER(CGGlyph), ctypes.POINTER(CGPoint), CFIndex]

    # Signature: CTFontGetBoundingRectsForGlyphs(font, orientation, glyphs,
    # bounds, count) — 5 args. (There is NO CGAffineTransform parameter; an
    # extra one here used to shift `count` to a pointer value → OOB read /
    # segfault in get_glyph_bboxes.)
    CT.CTFontGetBoundingRectsForGlyphs.restype = None
    CT.CTFontGetBoundingRectsForGlyphs.argtypes = [ctypes.c_void_p, ctypes.c_int32,
                                                   ctypes.POINTER(CGGlyph),
                                                   ctypes.POINTER(CGRect), CFIndex]

    # NOTE: this macOS build does not export CTLineCreateWithGlyphString;
    # we draw via an attributed string (kCTFontAttributeName) instead.
    CT.CTFontCreateCopyWithAttributes.restype = ctypes.c_void_p
    CT.CTFontCreateCopyWithAttributes.argtypes = [ctypes.c_void_p, ctypes.c_double,
                                                   ctypes.c_void_p, ctypes.c_void_p]
    CF.CFAttributedStringCreateMutable.restype = ctypes.c_void_p
    CF.CFAttributedStringCreateMutable.argtypes = [ctypes.c_void_p, CFIndex]
    CF.CFAttributedStringReplaceString.argtypes = [ctypes.c_void_p, CFRange, ctypes.c_void_p]
    CF.CFAttributedStringReplaceString.restype = None
    CF.CFAttributedStringSetAttribute.restype = ctypes.c_uint32
    CF.CFAttributedStringSetAttribute.argtypes = [ctypes.c_void_p, CFRange, ctypes.c_void_p, ctypes.c_void_p]

    CT.CTLineCreateWithAttributedString.restype = ctypes.c_void_p
    CT.CTLineCreateWithAttributedString.argtypes = [ctypes.c_void_p]

    CT.CTLineDraw.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    CT.CTLineDraw.restype = None


# Everything CoreFoundation-created must stay alive; append to this list.
_KEEPALIVE = []


def cfstring_to_py(ref):
    if not ref:
        return None
    buf = ctypes.create_string_buffer(8192)
    ok = CF.CFStringGetCString(ref, buf, 8192, K_CF_STRING_ENCODING_UTF8)
    CF.CFRelease(ref)
    return buf.value.decode("utf-8", "replace") if ok else None


def load_ctfont(path):
    """Load a .ttf into CoreText. Returns (ctfont, err)."""
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as e:
        return None, "cannot read %s: %s" % (path, e)
    if not data:
        return None, "empty file"
    buf = ctypes.create_string_buffer(data, len(data))
    _KEEPALIVE.append(buf)
    cfdata = CF.CFDataCreate(CF.CFAllocatorGetDefault(), buf, len(data))
    if not cfdata:
        return None, "CFDataCreate failed"
    _KEEPALIVE.append(cfdata)
    provider = CG.CGDataProviderCreateWithCFData(cfdata)
    if not provider:
        return None, "CGDataProviderCreateWithCFData failed"
    _KEEPALIVE.append(provider)
    cgfont = CG.CGFontCreateWithDataProvider(provider)
    if not cgfont:
        return None, "CGFontCreateWithDataProvider failed — CoreGraphics rejected the font file"
    _KEEPALIVE.append(cgfont)
    ctfont = CT.CTFontCreateWithGraphicsFont(cgfont, 1.0, ctypes.byref(IDENT), 0)
    if not ctfont:
        return None, "CTFontCreateWithGraphicsFont failed — CoreText rejected the font"
    _KEEPALIVE.append(ctfont)
    return ctfont, None


def glyph_for(ctfont, code):
    chars = (UniChar * 1)(code)
    glyphs = (CGGlyph * 1)()
    CT.CTFontGetGlyphsForCharacters(ctfont, chars, glyphs, 1)
    return glyphs[0]


def advance_for(ctfont, glyph):
    g = (CGGlyph * 1)(glyph)
    a = (CGPoint * 1)()
    CT.CTFontGetAdvancesForGlyphs(ctfont, K_CG_FONT_ORIENTATION_DEFAULT, g, a, 1)
    return a[0].x


def bbox_for(ctfont, glyph):
    g = (CGGlyph * 1)(glyph)
    r = (CGRect * 1)()
    CT.CTFontGetBoundingRectsForGlyphs(ctfont, K_CG_FONT_ORIENTATION_DEFAULT,
                                       g, r, 1)
    return r[0]


def render_dark_count(ctfont, code, width, height, base):
    """Render one code at 1 px per source pixel (font size = height),
    antialiasing off, and count dark pixels. Returns int or None on error.
    (Drawn via an attributed string — this macOS lacks
    CTLineCreateWithGlyphString in the CoreText export.)"""
    space = CG.CGColorSpaceCreateDeviceGray()
    if not space:
        return None
    _KEEPALIVE.append(space)
    ctx = CG.CGBitmapContextCreate(None, width, height, 8, width, space, K_CG_IMAGE_ALPHA_NONE)
    if not ctx:
        return None
    _KEEPALIVE.append(ctx)
    CG.CGContextSetShouldAntialias(ctx, 0)
    # The context starts UNINITIALIZED (zeroed = BLACK in an ALPHA_NONE gray
    # context) — clear it to white, or every pixel reads as "ink" (the
    # "got 128" bug: whole cell dark regardless of the glyph).
    white = CG.CGColorCreateGenericRGB(1, 1, 1, 1)
    _KEEPALIVE.append(white)
    CG.CGContextSetFillColorWithColor(ctx, white)
    CG.CGContextFillRect(ctx, CGRect(0, 0, width, height))
    color = CG.CGColorCreateGenericRGB(0, 0, 0, 1)
    _KEEPALIVE.append(color)
    CG.CGContextSetFillColorWithColor(ctx, color)
    # Baseline at y = height - base puts source row 0 (top) at canvas top.
    CG.CGContextSetTextPosition(ctx, 0.0, float(height - base))

    text = CF.CFStringCreateWithCString(CF.CFAllocatorGetDefault(),
                                       chr(code).encode("utf-8"), K_CF_STRING_ENCODING_UTF8)
    if not text:
        return None
    _KEEPALIVE.append(text)
    mstr = CF.CFAttributedStringCreateMutable(CF.CFAllocatorGetDefault(), 0)
    if not mstr:
        return None
    _KEEPALIVE.append(mstr)
    CF.CFAttributedStringReplaceString(mstr, CFRange(0, 0), text)
    kfont = ctypes.c_void_p.in_dll(CT, "kCTFontAttributeName")
    # Scale the font to size = height: em (height*upx units) = height px,
    # so 1 source pixel = exactly 1 device pixel. (Drawing the size-1.0
    # font directly makes the whole glyph ~1/height px tall — with AA off
    # it degenerates to a single pixel, the "got 1" bug.)
    scaled = CT.CTFontCreateCopyWithAttributes(ctfont, float(height), None, None)
    if not scaled:
        return None
    _KEEPALIVE.append(scaled)
    if not CF.CFAttributedStringSetAttribute(mstr, CFRange(0, 1), kfont, scaled):
        return None
    line = CT.CTLineCreateWithAttributedString(mstr)
    if not line:
        return None
    _KEEPALIVE.append(line)
    CT.CTLineDraw(line, ctx)
    data = CG.CGBitmapContextGetData(ctx)
    if not data:
        return None
    try:
        buf = (ctypes.c_uint8 * (width * height)).from_address(data)
        return sum(1 for v in buf if v < 128)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Ground truth from a .bitforge project (mirrors js/ttf.js: upxOf, baselineOf)
# ---------------------------------------------------------------------------

def upx_of(height):
    k = int(1024 / height + 0.5)  # JS Math.round semantics
    return 1 if k < 1 else k


def baseline_of(blob):
    h = blob["h"]
    off = None
    for g in (blob.get("g") or []):
        if isinstance(g, dict) and g.get("o") == "h" and g.get("label") == "base" \
                and isinstance(g.get("off"), int):
            off = g["off"]
            break
    if off is None:
        off = h - 3
    return max(1, min(h - 1, off))


def ground_truth(blob):
    w, h = blob["w"], blob["h"]
    d = blob["d"]
    upx = upx_of(h)
    base = baseline_of(blob)
    per = {}
    for code in range(256):
        cells = []
        row = code * h
        for y in range(h):
            for x in range(w):
                if d[row * w + y * w + x]:
                    cells.append((x, y))
        if not cells:
            per[code] = None
            continue
        xs = [c[0] for c in cells]
        ys = [c[1] for c in cells]
        per[code] = {
            "ink": len(cells),
            "xMin": min(xs) * upx,
            "xMax": (max(xs) + 1) * upx,
            "yTop": (base - min(ys)) * upx,
            "yBot": (base - max(ys) - 1) * upx,
        }
    return {"w": w, "h": h, "upx": upx, "base": base, "per": per}


# ---------------------------------------------------------------------------
# Build a TTF with the app's own code (jsc), exactly like the app does
# ---------------------------------------------------------------------------

def build_ttf_via_jsc(proj_path, repo_root):
    with open(proj_path) as f:
        try:
            proj = json.load(f)
        except ValueError as e:
            return None, None, "not valid JSON: %s" % e
    if not isinstance(proj, dict) or proj.get("app") != "bitforge" \
            or proj.get("kind") != "font-project":
        return None, None, "not a bitforge project file"
    blob = proj.get("font")
    if not isinstance(blob, dict):
        return None, None, "missing font blob"
    for core_mod, ttf_mod in (("js/core.js", "js/ttf.js"),):
        if not os.path.exists(os.path.join(repo_root, core_mod)) \
                or not os.path.exists(os.path.join(repo_root, ttf_mod)):
            return None, None, "app sources not found under %s" % repo_root

    js = []
    js.append('load("%s");' % os.path.join(repo_root, "js", "core.js"))
    js.append('load("%s");' % os.path.join(repo_root, "js", "ttf.js"))
    js.append("var blob = %s;" % json.dumps(blob))
    js.append('var proj = {app:"bitforge", kind:"font-project", version:%s, font:blob};'
              % json.dumps(proj.get("version", 1)))
    js.append("var r = BF.objFromProject(proj);")
    js.append('if (!r.ok) { print("BFERROR " + r.error); throw new Error(r.error); }')
    js.append('var b = BF_TTF.build(r.font, r.font.name || "bitforge");')
    js.append("print(BF_TTF.base64(b));")

    tmp = tempfile.mkdtemp(prefix="bfverify-")
    jsfile = os.path.join(tmp, "build.js")
    with open(jsfile, "w") as f:
        f.write("\n".join(js) + "\n")

    try:
        p = subprocess.run([JSC, jsfile], capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        return None, None, "jsc not found at %s" % JSC
    except subprocess.TimeoutExpired:
        return None, None, "jsc timed out"
    lines = [l.strip() for l in p.stdout.splitlines() if l.strip()]
    for l in lines:
        if l.startswith("BFERROR"):
            return None, None, "builder error: %s" % l[len("BFERROR"):].strip()
    if not lines:
        return None, None, "jsc produced no output (exit %s): %s" % (p.returncode, p.stderr.strip()[:400])
    try:
        ttf_bytes = base64.b64decode(lines[-1], validate=True)
    except Exception as e:
        return None, None, "bad base64 from jsc: %s" % e
    ttf_path = os.path.join(tmp, "font.ttf")
    with open(ttf_path, "wb") as f:
        f.write(ttf_bytes)
    return ttf_path, tmp, None


# ---------------------------------------------------------------------------
# Minimal sfnt reader for the bare-.ttf self-consistency mode
# ---------------------------------------------------------------------------

def sfnt_tables(buf):
    if len(buf) < 4 or struct.unpack_from(">I", buf, 0)[0] != 0x00010000:
        raise ValueError("not a TrueType (sfnt 0x00010000) file")
    n = struct.unpack_from(">H", buf, 4)[0]
    tables = {}
    for i in range(n):
        o = 12 + i * 16
        tag = buf[o:o + 4].decode("latin1")
        off, length = struct.unpack_from(">II", buf, o + 8)
        tables[tag] = (off, length)
    return tables


def parse_glyph_bbox(buf, off, end):
    """(xMin,yMin,xMax,yMax) in font units, or None for an empty glyph,
    or 'composite' when the record is a composite (unsupported here)."""
    if off >= end or end - off < 2:
        return None
    n = struct.unpack_from(">h", buf, off)[0]
    if n < 0:
        return "composite"
    if n == 0:
        return None
    if end - off < 10:
        return None
    return struct.unpack_from(">4h", buf, off + 2)


# ---------------------------------------------------------------------------
# Checking + reporting
# ---------------------------------------------------------------------------

class Report:
    def __init__(self):
        self.hard = []   # (name, ok, detail)
        self.soft = []   # (name, ok, detail)

    def add(self, name, ok, detail, soft=False):
        (self.soft if soft else self.hard).append((name, ok, detail))

    def print_(self):
        for name, ok, detail in self.hard + self.soft:
            tag = "ok  " if ok else "FAIL"
            suffix = "  (soft)" if (name, ok, detail) in self.soft else ""
            print("[%s] %s%s" % (tag, name, suffix))
            if not ok:
                print("       %s" % detail)

    @property
    def failed(self):
        return [n for n, ok, d in self.hard if not ok]


def fmt_codes(codes, limit=24):
    s = ", ".join("0x%02X" % c for c in codes[:limit])
    if len(codes) > limit:
        s += ", +%d more" % (len(codes) - limit)
    return s


def check_bitforge_mode(ttf_path, gt, expected_family):
    rep = Report()
    ctfont, err = load_ctfont(ttf_path)
    if err:
        rep.add("font loads in CoreText", False, err)
        rep.print_()
        return rep

    w, h, upx, base = gt["w"], gt["h"], gt["upx"], gt["base"]
    upem_exp = upx * h
    per = gt["per"]
    inked = [c for c in range(256) if per[c]]
    blank = [c for c in range(256) if not per[c] and c != 0x20]
    # Glyph count of the built font: slot 0 (.notdef) + inked codes + space.
    nglyphs_file = len(set(inked) | {0x20}) + 1

    rep.add("font loads in CoreText (CGFont + CTFont)", True, "accepted by CoreGraphics + CoreText")

    # -- unitsPerEm ---------------------------------------------------------
    upem = CT.CTFontGetUnitsPerEm(ctfont)
    rep.add("unitsPerEm", upem == upem_exp,
            "got %s, expected %s (upx=%d × height=%d)" % (upem, upem_exp, upx, h))

    # -- names --------------------------------------------------------------
    ps = cfstring_to_py(CT.CTFontCopyPostScriptName(ctfont))
    full = cfstring_to_py(CT.CTFontCopyFullName(ctfont))
    ps_exp = "".join(ch for ch in expected_family if ch.isalnum() or ch in "_-") or "Bitforge"
    rep.add("family name", bool(ps) and ps == ps_exp,
            "PS name %r, full name %r (expected PS %r)" % (ps, full, ps_exp))

    # -- cmap ----------------------------------------------------------------
    # Dogfooding rule (DECISIONS #82): blank codes are left UNMAPPED on
    # purpose, so the renderer falls back per-codepoint. The engine may
    # resolve an unmapped code to glyph 0, to another EMPTY glyph (e.g. the
    # space slot), or to an out-of-range index — all fine. What is NOT fine:
    # a blank code resolving to an INKED glyph (it would render ink).
    # So the semantic check is: inked codes → glyph with ink; blank codes →
    # glyph with NO ink (empty bbox).
    def ink_area(g):
        if g >= nglyphs_file:      # out of range → renderer clamps to .notdef
            return 0.0
        r = bbox_for(ctfont, g)
        return r.w * r.h
    bad_mapped, bad_blank = [], []
    for c in inked + ([0x20] if 0x20 not in inked else []):
        if c == 0x20:
            continue              # space has no ink; checked in the blank loop below
        if ink_area(glyph_for(ctfont, c)) <= 0:
            bad_mapped.append(c)
    for c in blank + [0x20, 0x100, 0xffff]:
        if ink_area(glyph_for(ctfont, c)) > 0:
            bad_blank.append(c)
    rep.add("cmap: inked codes map to inked glyphs, blanks never to ink",
            not bad_mapped and not bad_blank,
            ("inked→no ink: %s; " % fmt_codes(bad_mapped) if bad_mapped else "") +
            ("blanks→INKED: %s" % fmt_codes(bad_blank) if bad_blank else "") or "detail")
    if not (bad_mapped or bad_blank):
        rep.hard[-1] = ("cmap: inked codes map to inked glyphs, blanks never to ink", True,
                        "%d inked → inked glyphs, %d blank codes + space + 0x100/0xFFFF never ink" % (len(inked), len(blank)))

    # -- advances -------------------------------------------------------------
    adv_exp_units = w * upx
    adv_exp = adv_exp_units / float(upem_exp)  # text space at size 1.0
    bad_adv = []
    glyph_set = set()
    for c in inked + ([0x20] if 0x20 not in inked else []):
        glyph_set.add(glyph_for(ctfont, c))
    glyph_set.add(0)  # .notdef (builder gives it the same advance)
    for g in sorted(glyph_set):
        a = advance_for(ctfont, g)
        if abs(a - adv_exp) > 1e-9:
            bad_adv.append((g, a))
    rep.add("advances", not bad_adv,
            "expected %s units (%s text-space at size 1) per glyph; mismatches: %s"
            % (adv_exp_units, adv_exp, bad_adv[:10]) if bad_adv else
            "all %d checked glyphs advance %s units" % (len(glyph_set), adv_exp_units))
    if not bad_adv:
        rep.hard[-1] = (rep.hard[-1][0], True, "all %d checked glyphs advance %s units" % (len(glyph_set), adv_exp_units))

    # -- ink bounding boxes ---------------------------------------------------
    bad_bbox = []
    for c in inked:
        g = glyph_for(ctfont, c)
        r = bbox_for(ctfont, g)
        exp = per[c]
        got = (r.x * upem_exp, r.y * upem_exp, (r.x + r.w) * upem_exp, (r.y + r.h) * upem_exp)
        want = (exp["xMin"], exp["yBot"], exp["xMax"], exp["yTop"])
        if any(abs(g - e) > 1e-6 for g, e in zip(got, want)):
            bad_bbox.append((c, got, want))
    rep.add("ink bounding boxes (exact, in font units)", not bad_bbox,
            "mismatches (code, got, expected): %s" % bad_bbox[:8] if bad_bbox else
            "all %d inked glyphs match their pixel-derived boxes exactly" % len(inked))
    if not bad_bbox:
        rep.hard[-1] = (rep.hard[-1][0], True,
                        "all %d inked glyphs match their pixel-derived boxes exactly" % len(inked))

    # -- bitmap render (soft) ---------------------------------------------------
    soft_ok, soft_bad, soft_err = 0, [], None
    for c in inked:
        n = render_dark_count(ctfont, c, w, h, base)
        if n is None:
            soft_err = "render context unavailable for 0x%02X" % c
            break
        if n == per[c]["ink"]:
            soft_ok += 1
        else:
            soft_bad.append((c, n, per[c]["ink"]))
    if soft_err:
        rep.add("bitmap render pixel counts", False, soft_err, soft=True)
    else:
        rep.add("bitmap render pixel counts (1 px/unit, AA off)", not soft_bad,
                "mismatches (code, got, expected): %s" % soft_bad[:8] if soft_bad else
                "%d/%d glyphs rasterize to exactly their ink pixel count" % (soft_ok, len(inked)),
                soft=True)
        if not soft_bad:
            rep.soft[-1] = (rep.soft[-1][0], True,
                            "%d/%d glyphs rasterize to exactly their ink pixel count" % (soft_ok, len(inked)))
    return rep


def check_ttf_mode(ttf_path):
    rep = Report()
    with open(ttf_path, "rb") as f:
        buf = f.read()

    ctfont, err = load_ctfont(ttf_path)
    if err:
        rep.add("font loads in CoreText", False, err)
        rep.print_()
        return rep
    rep.add("font loads in CoreText (CGFont + CTFont)", True, "accepted by CoreGraphics + CoreText")

    try:
        tables = sfnt_tables(buf)
    except ValueError as e:
        rep.add("sfnt structure", False, str(e))
        rep.print_()
        return rep
    rep.add("sfnt structure (table directory)", True,
            "%d tables: %s" % (len(tables), ", ".join(sorted(tables))))

    for tag in ("cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name"):
        if tag not in tables:
            rep.add("required table '%s' present" % tag, False, "missing")
            rep.print_()
            return rep

    upem = struct.unpack_from(">H", buf, tables["head"][0] + 18)[0]
    if upem <= 0:
        rep.add("unitsPerEm", False, "invalid %s" % upem)
        rep.print_()
        return rep
    upem_ct = CT.CTFontGetUnitsPerEm(ctfont)
    rep.add("unitsPerEm", upem_ct == upem, "file says %s, CoreText says %s" % (upem, upem_ct))

    ps = cfstring_to_py(CT.CTFontCopyPostScriptName(ctfont))
    rep.add("family name readable", bool(ps), "PS name %r" % ps)

    num_glyphs = struct.unpack_from(">H", buf, tables["maxp"][0] + 4)[0]
    rep.add("numGlyphs", num_glyphs >= 1, "file says %d" % num_glyphs)

    loca_off, loca_len = tables["loca"]
    loca_fmt = struct.unpack_from(">h", buf, tables["head"][0] + 42)[0]
    stride = 4 if loca_fmt == 1 else 2
    if loca_len != (num_glyphs + 1) * stride:
        rep.add("loca table size", False, "len %s, expected %s (%d offsets × %s)"
                % (loca_len, (num_glyphs + 1) * stride, num_glyphs + 1, stride))
        rep.print_()
        return rep
    offs = [struct.unpack_from(">I" if stride == 4 else ">H", buf, loca_off + i * stride)[0]
            for i in range(num_glyphs + 1)]
    if stride == 2:
        offs = [o * 16 for o in offs]

    glyf_off, glyf_len = tables["glyf"]
    nhm = struct.unpack_from(">H", buf, tables["hhea"][0] + 34)[0]
    hmtx_off, hmtx_len = tables["hmtx"]

    bad_adv, bad_bbox, skipped = [], [], []
    for i in range(num_glyphs):
        g = (CGGlyph * 1)(i)
        adv_units = struct.unpack_from(">H", buf, hmtx_off + 2 * min(i, nhm - 1))[0] if hmtx_len >= 2 * min(i, nhm - 1) + 2 else None
        if adv_units is not None:
            a = advance_for(ctfont, i)
            want = adv_units / float(upem)
            if abs(a - want) > 1e-9:
                bad_adv.append((i, a, want))
        bbox = parse_glyph_bbox(buf, glyf_off + offs[i], glyf_off + offs[i + 1])
        if bbox == "composite":
            skipped.append(i)
            continue
        r = bbox_for(ctfont, i)
        if bbox is None:
            want = (0.0, 0.0, 0.0, 0.0)
        else:
            xMin, yMin, xMax, yMax = bbox
            want = (xMin / float(upem), yMin / float(upem),
                    (xMax - xMin) / float(upem), (yMax - yMin) / float(upem))
        got = (r.x, r.y, r.w, r.h)
        if any(abs(g - e) > 1e-9 for g, e in zip(got, want)):
            bad_bbox.append((i, got, want))

    rep.add("advances match hmtx (all %d glyphs)" % num_glyphs, not bad_adv,
            "mismatches (glyph, CoreText, hmtx-based): %s" % bad_adv[:8] if bad_adv else
            "all %d glyphs" % num_glyphs)
    if not bad_adv:
        rep.hard[-1] = (rep.hard[-1][0], True, "all %d glyphs" % num_glyphs)
    rep.add("ink boxes match glyf outlines (all %d glyphs)" % num_glyphs, not bad_bbox,
            "mismatches (glyph, CoreText, glyf-based): %s" % bad_bbox[:8] if bad_bbox else
            "all %d glyphs" % num_glyphs)
    if not bad_bbox:
        rep.hard[-1] = (rep.hard[-1][0], True, "all %d glyphs" % num_glyphs)
    if skipped:
        rep.add("composite glyphs", True,
                "%d composite glyph(s) skipped (not expected from bitforge; check if unexpected): %s"
                % (len(skipped), fmt_codes(skipped, 16)))
    return rep


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) != 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__.strip())
        sys.exit(0 if len(sys.argv) == 2 else 2)

    path = os.path.abspath(sys.argv[1])
    if not os.path.exists(path):
        die_env("file not found: %s" % path)

    try:
        load_frameworks()
    except SystemExit:
        raise
    except Exception as e:
        die_env("could not load CoreText bindings: %s" % e)

    if path.endswith(".bitforge"):
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(path) as f:
            try:
                proj = json.load(f)
            except ValueError as e:
                die_env("not valid JSON: %s" % e)
        blob = (proj or {}).get("font") if isinstance(proj, dict) else None
        if not isinstance(blob, dict):
            die_env("not a bitforge project (missing font blob)")
        name = blob.get("n") or "unnamed"
        ttf_path, tmp, err = build_ttf_via_jsc(path, repo_root)
        if err:
            die_err = err
            print("FAIL  build TTF via js/ttf.js (jsc): %s" % die_err)
            sys.exit(1)
        gt = ground_truth(blob)
        print("bitforge TTF verifier — .bitforge → TTF (js/ttf.js via jsc) → CoreText")
        print("font: %s  (%d×%d, upx=%d, baseline row=%d, unitsPerEm=%d)"
              % (name, gt["w"], gt["h"], gt["upx"], gt["base"], gt["upx"] * gt["h"]))
        print("built: %s (%d bytes)" % (ttf_path, os.path.getsize(ttf_path)))
        print()
        rep = check_bitforge_mode(ttf_path, gt, name if isinstance(name, str) else "bitforge")
        rep.print_()
        failed = rep.failed
        print()
        if failed:
            print("RESULT: FAIL — %d check(s) failed: %s" % (len(failed), "; ".join(failed)))
            sys.exit(1)
        soft = [n for n, ok, d in rep.soft if not ok]
        print("RESULT: PASS — all %d hard checks passed%s"
              % (len(rep.hard), ("; %d soft check(s) reported issues: %s" % (len(soft), "; ".join(soft))) if soft else ""))
        sys.exit(0)

    if path.endswith((".ttf", ".otf")):
        print("bitforge TTF verifier — existing TTF → CoreText (self-consistency)")
        print("file: %s (%d bytes)" % (path, os.path.getsize(path)))
        print()
        rep = check_ttf_mode(path)
        rep.print_()
        print()
        if rep.failed:
            print("RESULT: FAIL — %d check(s) failed: %s" % (len(rep.failed), "; ".join(rep.failed)))
            sys.exit(1)
        print("RESULT: PASS — all %d checks passed" % len(rep.hard))
        sys.exit(0)

    die_env("unrecognized input (want a .bitforge or .ttf file): %s" % path)


if __name__ == "__main__":
    main()
