"""Build the Coffee Pub brand kit: SVG masters, PNG sizes, vector PDFs, icons, README.
Run:  python -I build_kit.py      (needs fontTools, PyMuPDF, Pillow)"""
import os, re, io, shutil, zipfile
import fitz
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

B = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(B, 'v6', 'dir-20')
KIT = os.path.join(B, '..', 'brand-kit')
FONTS = os.path.join(B, 'fonts')

NAMES = {  # file key, display third word, source key
    'studio': ('Studio', 'studio-mark'),
    'chameleon': ('Chameleon', 'product-chameleon'),
    'showrunner': ('Showrunner', 'product-showrunner'),
    'gaming': ('Gaming', 'product-foundry'),
}
NAVY, TEAL, CREAM, DNAVY = '#14243B', '#0B7A84', '#FBF6EC', '#0E1A2B'
VARIANTS = {  # suffix: (source suffix, text colour, name colour, mono colour or None)
    '': ('', NAVY, '#E0553C', None),
    '-dark': ('-dark', '#F4ECDD', '#FF8264', None),
    '-navy': ('', NAVY, NAVY, NAVY),
    '-white': ('', '#FFFFFF', '#FFFFFF', '#FFFFFF'),
}


def load(name, wght):
    f = TTFont(os.path.join(FONTS, name))
    if 'fvar' in f:
        lim = {a.axisTag: (wght if a.axisTag == 'wght' else a.defaultValue) for a in f['fvar'].axes}
        f = instancer.instantiateVariableFont(f, lim)
    return f


FR = load('fraunces-latin.woff2', 700)
FG = load('figtree-latin.woff2', 600)


def run(font, text, x, base, size, track=0.0):
    """Outline `text`; returns (path d, end x)."""
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font['head'].unitsPerEm
    k = size / upm
    pen = SVGPathPen(gs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    for ch in text:
        gn = cmap[ord(ch)]
        gs[gn].draw(TransformPen(pen, (k, 0, 0, -k, x, base)))
        x += gs[gn].width * k + track
    return pen.getCommands(), x


def inner(svg):
    m = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S)
    body = re.sub(r'<title>.*?</title>', '', m.group(1), flags=re.S).strip()
    return body


def mono(body, colour):
    return re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="%s"' % colour, body)


def mark_svg(title, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56" role="img" aria-label="%s">'
            '<title>%s</title>%s</svg>\n' % (title, title, body))


def lockup_svg(title, body, third, tcol, ncol):
    size = 32
    cap = FR['OS/2'].sCapHeight / FR['head'].unitsPerEm * size
    base = 28 + cap / 2
    d1, x = run(FR, 'Coffee Pub', 68, base, size, -0.32)
    sp = FR.getGlyphSet()[FR.getBestCmap()[32]].width * size / FR['head'].unitsPerEm
    d2, x = run(FG, third, x + sp, base, size, 0)
    w = round(x + 0.5, 1)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s 56" width="%s" height="56" role="img" aria-label="%s">'
            '<title>%s</title><g>%s</g><path fill="%s" d="%s"/><path fill="%s" d="%s"/></svg>\n'
            % (w, w, title, title, '<g transform="translate(0 0)">' + body + '</g>', tcol, d1, ncol, d2))


def write(path, data, mode='w'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if mode == 'wb':
        open(path, 'wb').write(data)
    else:
        open(path, 'w', encoding='utf-8').write(data)


def render(svg_text, width_px, transparent=True, bg=None):
    doc = fitz.open(stream=svg_text.encode('utf-8'), filetype='svg')
    page = doc[0]
    z = width_px / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=transparent)
    return pix.tobytes('png')


def pdf(svg_text):
    doc = fitz.open(stream=svg_text.encode('utf-8'), filetype='svg')
    return doc.convert_to_pdf()


MARK_SIZES = [16, 24, 32, 48, 56, 64, 96, 112, 128, 192, 224, 256, 448, 512, 896, 1024, 2048, 4096]
LOCK_WIDTHS = [240, 480, 960, 1920, 3840]

if os.path.isdir(KIT):
    shutil.rmtree(KIT)
files = []
for key, (third, srckey) in NAMES.items():
    for suf, (ssuf, tcol, ncol, mono_col) in VARIANTS.items():
        src = open(os.path.join(SRC, srckey + ssuf + '.svg'), encoding='utf-8').read()
        body = inner(src)
        if mono_col:
            body = mono(body, mono_col)
        label = 'Coffee Pub ' + third
        mk = mark_svg(label + ' mark', body)
        lk = lockup_svg(label, body, third, tcol, ncol)
        base = 'coffee-pub-%s' % key
        write(os.path.join(KIT, 'svg', '%s-mark%s.svg' % (base, suf)), mk)
        write(os.path.join(KIT, 'svg', '%s-lockup%s.svg' % (base, suf)), lk)
        write(os.path.join(KIT, 'pdf', '%s-mark%s.pdf' % (base, suf)), pdf(mk), 'wb')
        write(os.path.join(KIT, 'pdf', '%s-lockup%s.pdf' % (base, suf)), pdf(lk), 'wb')
        for s in MARK_SIZES:
            write(os.path.join(KIT, 'png', 'mark', '%s-mark%s-%d.png' % (base, suf, s)), render(mk, s), 'wb')
        for w in LOCK_WIDTHS:
            write(os.path.join(KIT, 'png', 'lockup', '%s-lockup%s-%d.png' % (base, suf, w)), render(lk, w), 'wb')

# app and favicon icons: Studio mark on a cream tile (light) with padding
studio = open(os.path.join(KIT, 'svg', 'coffee-pub-studio-mark.svg'), encoding='utf-8').read()
body = inner(studio)
tile = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72"><rect width="72" height="72" fill="%s"/>'
        '<g transform="translate(8 8)">%s</g></svg>' % (CREAM, body))
for name, s in (('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)):
    write(os.path.join(KIT, 'icons', name), render(tile, s, transparent=False), 'wb')
imgs = [Image.open(io.BytesIO(render(studio, s))).convert('RGBA') for s in (16, 32, 48, 64, 128, 256)]
buf = io.BytesIO()
imgs[-1].save(buf, format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
write(os.path.join(KIT, 'icons', 'favicon.ico'), buf.getvalue(), 'wb')
shutil.copy(os.path.join(KIT, 'svg', 'coffee-pub-studio-mark.svg'), os.path.join(KIT, 'icons', 'favicon.svg'))

readme = '''# Coffee Pub brand kit (draft, Tile Quartet)

Four marks: Coffee Pub Studio, Chameleon, Showrunner, Gaming (the Foundry module collection).

## Files
- `svg/` masters. Use these first. Marks are 56 x 56 units; lockups are 56 units tall. Text is outlined, so no fonts are needed.
- `pdf/` the same artwork as vector PDFs, for print.
- `png/mark/` marks at 16, 24, 32, 48, 56, 64, 96, 112, 128, 192, 224, 256, 448, 512, 896, 1024, 2048, 4096 px (transparent).
- `png/lockup/` lockups at 240, 480, 960, 1920, 3840 px wide (transparent).
- `icons/` favicon.ico, favicon.svg, apple-touch-icon.png (180), icon-192.png, icon-512.png.

## Variants (suffix)
- none: full colour for light backgrounds (cream or white).
- `-dark`: full colour for navy backgrounds (#0E1A2B).
- `-navy`: one colour, navy #14243B, for print and stamps.
- `-white`: one colour, white, for photos and dark backgrounds.

## Crisp sizes
The marks sit on whole pixels at 56 px and its multiples (56, 112, 224, 448, 896). Prefer those on screens. Everything else is fine, just very slightly softer.

## Use
- Clear space: keep at least one quarter of the mark's width clear on every side.
- Smallest sizes: mark 16 px, lockup 24 px tall.
- Do not recolour the shapes, rotate, or stretch.
- Lockup: mark at 56, "Coffee Pub" in Fraunces Bold 32, product name in Figtree SemiBold 32 (coral on light, light coral on dark), 12 px between mark and text.

## Colours
Navy #14243B, Teal #0B7A84, Coral #F26B52, Cream #F4ECDD (dark) / #FBF6EC (light), Dark background #0E1A2B, Dark teal #5CC8CF, Dark coral #FF8264, Name coral #E0553C on light.
'''
write(os.path.join(KIT, 'README.md'), readme)

zp = os.path.join(KIT, '..', 'brand-kit.zip')
with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, fs in os.walk(KIT):
        for f in fs:
            full = os.path.join(root, f)
            z.write(full, os.path.join('coffee-pub-brand-kit', os.path.relpath(full, KIT)))
n = sum(len(f) for _, _, f in os.walk(KIT))
print('files', n, 'zip KB', os.path.getsize(zp) // 1024)
