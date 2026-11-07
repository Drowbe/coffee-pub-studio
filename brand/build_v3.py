import os, re, shutil, io
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

B = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.join(B, 'v3')

LIGHT = dict(navy='#14243B', teal='#0B7A84', coral='#F26B52', sea='#8FD0D3', soft='#D5EEEE', cream='#FBF6EC')
DARK = dict(navy='#F4ECDD', teal='#5CC8CF', coral='#FF8264', sea='#2F8A93', soft='#1F4A57', cream='#0E1A2B')

PRODUCTS = ['collaborator', 'blacksmith', 'squire', 'minstrel', 'cartographer', 'showrunner', 'chameleon', 'foundry']
NAMES = dict(collaborator='Collaborator', blacksmith='Blacksmith', squire='Squire', minstrel='Minstrel',
             cartographer='Cartographer', showrunner='Showrunner', studio='Coffee Pub Studio')


def write(path, s):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(s)


def svg(label, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" '
            'aria-label="%s mark">\n<title>%s mark</title>\n%s\n</svg>\n' % (label, label, body))


# ---------------------------------------------------------------- Rising v3
def rising():
    src = os.path.join(B, 'v1', 'dir-2')
    out = os.path.join(V3, 'dir-11')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(src):
        if not f.endswith('.svg'):
            continue
        s = open(os.path.join(src, f), encoding='utf-8').read()
        # product glyph: same size, lowered so it sits right on the cup rim
        s = re.sub(r'translate\(([\d.]+) 3\) scale\(0\.88\)', r'translate(\1 8) scale(0.88)', s)
        # studio spark: same size, lowered
        s = s.replace('translate(29 19)', 'translate(29 22)')
        s = s.replace('cx="47" cy="10"', 'cx="49" cy="14"')
        s = s.replace('h-6.5', 'h-10')
        open(os.path.join(out, f), 'w', encoding='utf-8').write(s)


# ---------------------------------------------------------------- Quartet v3 (only Squire changes)
def quartet():
    src = os.path.join(B, 'v1', 'dir-4')
    out = os.path.join(V3, 'dir-12')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(src):
        shutil.copy(os.path.join(src, f), os.path.join(out, f))
    # Squire: drop the two quarter-circles (Univision look); use triangle + diamond from the kit
    for dark, P in (('', LIGHT), ('-dark', DARK)):
        body = (
            '<g transform="translate(3 3)" fill="%(navy)s"><rect width="28" height="28" rx="3"/></g>\n'
            '<g transform="translate(33 3)" fill="%(coral)s"><circle cx="14" cy="14" r="14"/></g>\n'
            '<g transform="translate(3 33)" fill="%(navy)s"><path d="M0 0h28L0 28z"/></g>\n'
            '<g transform="translate(33 33)" fill="%(teal)s"><path d="M14 0L28 14L14 28L0 14z"/></g>' % P)
        write(os.path.join(out, 'product-squire%s.svg' % dark), svg('Squire', body))


# ---------------------------------------------------------------- Letter Tile v3
def load_font():
    f = TTFont(os.path.join(B, '..', 'site', 'assets', 'fonts', 'fraunces', 'latin.woff2'))
    if 'fvar' in f:
        lim = {}
        for a in f['fvar'].axes:
            lim[a.axisTag] = 700 if a.axisTag == 'wght' else a.defaultValue
        f = instancer.instantiateVariableFont(f, lim)
    return f


FONT = None


def word_path(text, cx, cy, width, capcentre=False):
    """Outline `text`, scaled so its ink is `width` wide, centred on (cx, cy)."""
    gs = FONT.getGlyphSet()
    cmap = FONT.getBestCmap()
    upm = FONT['head'].unitsPerEm
    x = 0
    items = []
    for ch in text:
        gn = cmap[ord(ch)]
        items.append((gn, x))
        x += gs[gn].width
    bp = BoundsPen(gs)
    for gn, ox in items:
        gs[gn].draw(TransformPen(bp, (1, 0, 0, 1, ox, 0)))
    x0, y0, x1, y1 = bp.bounds
    if capcentre:
        bc = BoundsPen(gs)
        gs[items[0][0]].draw(bc)
        y0, y1 = 0, bc.bounds[3]
    s = width / (x1 - x0)
    pen = SVGPathPen(gs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
    tx = cx - ((x0 + x1) / 2) * s
    ty = cy + ((y0 + y1) / 2) * s
    for gn, ox in items:
        gs[gn].draw(TransformPen(pen, (s, 0, 0, -s, tx + ox * s, ty)))
    return pen.getCommands()


def letter_tile():
    out = os.path.join(V3, 'dir-13')
    marks = dict(studio=('CP', 'navy'), collaborator=('Co', 'navy'), blacksmith=('Bl', 'navy'),
                 squire=('Sq', 'teal'), minstrel=('Mi', 'teal'), cartographer=('Ca', 'teal'),
                 showrunner=('Sh', 'sea'))
    for key, (letters, col) in marks.items():
        for dark, P in (('', LIGHT), ('-dark', DARK)):
            d = word_path(letters, 27, 32.5, 30)
            mid = 'lt%s%s' % (key, 'd' if dark else 'l')
            body = (
                '<defs><mask id="%s"><rect width="64" height="64" fill="#fff"/><path fill="#000" d="%s"/></mask></defs>\n'
                '<rect x="3" y="8" width="48" height="48" rx="11" fill="%s" mask="url(#%s)"/>\n'
                '<path d="M50 22h3.5a8.5 8.5 0 0 1 0 20H50" fill="none" stroke="%s" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'
                % (mid, d, P[col], mid, P['coral']))
            write(os.path.join(out, ('studio-mark%s.svg' if key == 'studio' else 'product-' + key + '%s.svg') % dark),
                  svg(NAMES[key], body))


# ---------------------------------------------------------------- Joint v3
G = 3  # one line width for border ring, joint and diamond ring
# joint profiles: path from (32, 8.5) to (32, 55.5), after the initial M
PROFILES = dict(
    collaborator='L32 17L44 13V51L32 47',
    blacksmith='V21H45V43H32',
    squire='C46 16 18 24 32 32C46 40 18 48 32 55.5',
    minstrel='L42 17L22 28L42 38L22 49L32 55.5',
    cartographer='V19L46 32L32 45',
    showrunner='V16H44V30H20V44H32',
)
PAIRS = dict(collaborator=('navy', 'teal'), blacksmith=('navy', 'sea'), squire=('teal', 'sea'),
             minstrel=('teal', 'soft'), cartographer=('navy', 'soft'), showrunner=('teal', 'navy'),
             studio=('navy', 'teal'))


def joint_mark(key, P, tag):
    mid = 'j%s%s' % (key[:4], tag)
    left, right = PAIRS[key]
    if key == 'studio':
        split_fill = 'V55.5'
        stroke_d = 'M32 8.5V55.5M32 21H40A8 8 0 0 1 40 37H32'
        dx = 19
    else:
        split_fill = PROFILES[key]
        # fills follow the same path; stroke path begins at M32 8.5
        stroke_d = 'M32 8.5' + split_fill
        dx = 32
    # make sure fill path ends at 32,55.5
    lf = 'M4 4H32V8.5%s%sV60H4Z' % ('' if key == 'studio' else '', split_fill if key != 'studio' else 'V55.5')
    rf = 'M60 4H32V8.5%sV60H60Z' % (split_fill if key != 'studio' else 'V55.5')
    # coral diamond: side 10, ring side 16 (gap = G)
    s_in, s_out = 10, 10 + 2 * G
    t = 'rotate(45 %s 32)' % dx
    body = (
        '<defs><clipPath id="%(m)sc"><rect x="4" y="4" width="56" height="56" rx="9"/></clipPath>\n'
        '<mask id="%(m)s"><rect width="64" height="64" fill="#fff"/>'
        '<rect x="8.5" y="8.5" width="47" height="47" rx="5.5" fill="none" stroke="#000" stroke-width="%(g)s"/>'
        '<path d="%(sd)s" fill="none" stroke="#000" stroke-width="%(g)s" stroke-linecap="round" stroke-linejoin="round"/>'
        '<rect x="%(ox)s" y="%(oy)s" width="%(so)s" height="%(so)s" fill="#000" transform="%(t)s"/></mask></defs>\n'
        '<g clip-path="url(#%(m)sc)" mask="url(#%(m)s)"><path d="%(lf)s" fill="%(lc)s"/><path d="%(rf)s" fill="%(rc)s"/></g>\n'
        '<rect x="%(ix)s" y="%(iy)s" width="%(si)s" height="%(si)s" rx="1" fill="%(co)s" transform="%(t)s"/>'
    ) % dict(m=mid, g=G, sd=stroke_d, ox=dx - s_out / 2, oy=32 - s_out / 2, so=s_out, t=t, lf=lf, rf=rf,
             lc=P[left], rc=P[right], ix=dx - s_in / 2, iy=32 - s_in / 2, si=s_in, co=P['coral'])
    return svg(NAMES[key], body)


def joint():
    out = os.path.join(V3, 'dir-14')
    for key in PAIRS:
        for dark, P in (('', LIGHT), ('-dark', DARK)):
            fn = ('studio-mark%s.svg' if key == 'studio' else 'product-' + key + '%s.svg') % dark
            write(os.path.join(out, fn), joint_mark(key, P, 'd' if dark else 'l'))


# ---------------------------------------------------------------- contact sheet
DIRS = [
    ('v1', 'Round one (archived)', [
        ('dir-1', 'Mug Top', 'Dropped: mug top reads as a duck head.'),
        ('dir-2', 'Cup & Rising', 'Liked: close, but glyph too far from cup. Reworked in v3.'),
        ('dir-3', 'Doorway', 'Dropped: reads as a tombstone.'),
        ('dir-4', 'Tile Quartet', 'Liked: interesting. Squire looked like Univision. Reworked in v3.'),
        ('dir-5', 'Pub Sign', 'Dropped as a sign; the two-letter boxes were liked and carry into v3.')]),
    ('v2', 'Round two (archived)', [
        ('dir-6', 'Cup & Rising v2', 'Rejected: cup flattened, glyphs oversized.'),
        ('dir-7', 'Tile Quartet v2', 'Rejected: lost its character.'),
        ('dir-8', 'Letter Tile', 'Single letter; the two-letter version is preferred. Reworked in v3.'),
        ('dir-9', 'Pegboard', 'No.'),
        ('dir-10', 'Joint', 'Interesting. Line widths and round cup/handle reworked in v3.')]),
    ('v3', 'Round three (archived)', [
        ('dir-11', 'Cup & Rising v3', 'Better. Carried into v4 unchanged.'),
        ('dir-12', 'Tile Quartet v3', 'Better. Carried into v4 unchanged.'),
        ('dir-13', 'Letter Tile v3', 'Rejected: handle not asked for.'),
        ('dir-14', 'Joint v3', 'Rejected: lost the character of Joint, overcomplicated.')]),
    ('v4', 'Round four (archived): four marks only', [
        ('dir-11', 'Cup & Rising', 'v3 as approved. Foundry Modules uses the Squire shield; Chameleon has a simpler glyph.'),
        ('dir-12', 'Tile Quartet', 'v3 as approved. Circle, square and quarter-pie only; no half circles; no shape two-coloured.'),
        ('dir-13', 'Letter Tile', 'v2 tile and coral square. Pub-sign letters: capital first letter, smaller lowercase second, cut out.'),
        ('dir-14', 'Joint', 'Every line enters top-centre and leaves bottom-centre, symmetric, one line width. Coral dot instead of the diamond. Foundry: rounded dovetail. Studio: round handle. Showrunner: straight line into the ring around the dot.')]),
    ('v5', 'Round five (archived): marks next to the product names', [
        ('dir-15', 'Cup & Rising', 'Same as v4.'),
        ('dir-16', 'Tile Quartet', 'Same as v4, but Chameleon lower-left tile is now a pie-circle too.'),
        ('dir-17', 'Joint', 'Same as v4, but Showrunner is a single chevron from top-centre to bottom-centre, the vertical lead-ins removed.'),
        ('dir-18', 'Roundel (new)', 'Inspired by your references: one disc, one cut-out symbol, one coral dot. Studio: open C. Chameleon: spiral tail. Showrunner: play. Foundry Modules: die (v5), shield (v6).')]),
    ('v6', 'Round six (current): one-line names', [
        ('dir-19', 'Cup & Rising', 'Same as v5.'),
        ('dir-20', 'Tile Quartet', 'Same as v5, but Gaming is now two quarter-pies on top (an arch) over two squares: a door.'),
        ('dir-21', 'Joint', 'Same as v5.'),
        ('dir-22', 'Roundel', 'Same as v5, but Gaming is a shield instead of a hexagon.')]),
]


def img(path, rel, size, cls=''):
    return '<img src="%s" width="%d" height="%d" alt="">' % (rel, size, size) if os.path.exists(path) else ''


def sheet():
    h = ['<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coffee Pub Studio brand marks</title>'
         '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><style>'
         '@font-face{font-family:Fraunces;src:url(fonts/fraunces-latin.woff2) format("woff2");font-weight:100 900}'
         '@font-face{font-family:Figtree;src:url(fonts/figtree-latin.woff2) format("woff2");font-weight:300 900}'
         'body{margin:0;background:#F3E9D4;color:#14243B;font:16px/1.5 Figtree,system-ui,sans-serif;padding:32px 24px 64px}'
         'h1,h2,h3{font-family:Fraunces,Georgia,serif;margin:0}h1{font-size:34px}'
         'nav a{margin-right:18px;font-weight:600}section.ver{max-width:1240px;margin:0 auto 20px}'
         '.ver>h2{font-size:30px;border-bottom:2px solid #D4C29B;padding-bottom:6px;margin:44px 0 18px}'
         '.dir{margin-bottom:28px}.dir h3{font-size:22px}.note{color:#475569;margin:0 0 10px}'
         '.pair{display:grid;grid-template-columns:1fr 1fr;border-radius:14px;overflow:hidden;border:1px solid #D4C29B}'
         '.p{padding:16px 20px}.l{background:#FBF6EC}.d{background:#0E1A2B}'
         '.row{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}.row.s{margin-top:12px;align-items:center;gap:10px}'
         'figure{margin:0;text-align:center;font-size:11px;opacity:.9}.d figure{color:#F4ECDD}'
         '.wm{font-size:30px;line-height:1;white-space:nowrap}.wm b{font:700 1em/1 Fraunces,Georgia,serif}.lock.one{margin:12px 0}.tl{font:600 11px Figtree,sans-serif;opacity:.6;margin:14px 0 2px;text-transform:uppercase;letter-spacing:.12em}.wm.tA i{font:500 1em/1 Figtree,sans-serif;font-style:normal;color:#0B7A84}.d .wm.tA i{color:#5CC8CF}.wm.tB i{font:600 .5em/1 Figtree,sans-serif;font-style:normal;letter-spacing:.24em;text-transform:uppercase;color:#0B7A84;margin-left:6px}.d .wm.tB i{color:#5CC8CF}.wm.tC i{font:600 1em/1 Figtree,sans-serif;font-style:normal;color:#E0553C}.d .wm.tC i{color:#FF8264}'
         '.lock{display:flex;align-items:center;gap:14px;margin:10px 0}.lock .cp{font:700 30px/1 Fraunces,Georgia,serif}.lock .sub{font:600 13px/1.2 Figtree,sans-serif;letter-spacing:.28em;margin-top:6px}.d .lock{color:#F4ECDD}'
         '@media(max-width:800px){.pair{grid-template-columns:1fr}}'
         '</style></head><body><section class="ver"><h1>Coffee Pub Studio brand marks</h1>'
         '<nav><a href="#v1">v1</a><a href="#v2">v2</a><a href="#v3">v3</a><a href="#v4">v4</a><a href="#v5">v5</a><a href="#v6">v6 (current)</a></nav></section>']
    for ver, vt, dirs in DIRS:
        h.append('<section class="ver" id="%s"><h2>%s: %s</h2>' % (ver, ver, vt))
        for d, title, note in dirs:
            base = os.path.join(B, ver, d)
            if not os.path.isdir(base):
                continue
            if ver == 'v6':
                h.append('<div class="dir"><h3>%s</h3><p class="note">%s</p><div class="pair">' % (title, note))
                for dark, cls in (('', 'l'), ('-dark', 'd')):
                    h.append('<div class="p %s">' % cls)
                    for key in V4M:
                        third = 'Studio' if key == 'studio' else V4N[key].replace('Coffee Pub ', '')
                        h.append('<div class="lock one"><img src="%s/%s/%s" width="64" height="64" alt=""><div class="wm tA"><b>Coffee Pub</b> <i>%s</i></div></div>' % (ver, d, fname(key, dark), third))
                    h.append('</div>')
                h.append('</div></div>')
                if d == 'dir-22':
                    h.append('<div class="dir"><h3>Name treatments (Roundel marks)</h3><p class="note">Same words, three ways to handle weight, case and colour. Pick one and I will apply it everywhere.</p><div class="pair">')
                    for dark, cls in (('', 'l'), ('-dark', 'd')):
                        h.append('<div class="p %s">' % cls)
                        for tcls, tname in (('tA', 'A: weight'), ('tB', 'B: case'), ('tC', 'C: accent (coral)')):
                            h.append('<div class="tl">%s</div>' % tname)
                            for key in V4M:
                                third = 'Studio' if key == 'studio' else V4N[key].replace('Coffee Pub ', '')
                                h.append('<div class="lock one"><img src="%s/%s/%s" width="48" height="48" alt=""><div class="wm %s"><b>Coffee Pub</b> <i>%s</i></div></div>' % (ver, d, fname(key, dark), tcls, third))
                        h.append('</div>')
                    h.append('</div></div>')
                    h.append('<div class="dir"><h3>Tile Quartet with the coral name: mark size against text size</h3><p class="note">Text fixed at 32 px. Marks at 40, 56, 72 and 96 px.</p><div class="pair">')
                    for dark, cls in (('', 'l'), ('-dark', 'd')):
                        h.append('<div class="p %s">' % cls)
                        for msz, fsz in ((40, 32), (56, 32), (72, 32), (96, 32)):
                            h.append('<div class="tl">mark %d / text %d</div>' % (msz, fsz))
                            for key in V4M:
                                third = 'Studio' if key == 'studio' else V4N[key].replace('Coffee Pub ', '')
                                h.append('<div class="lock one" style="gap:%dpx"><img src="v6/dir-20/%s" width="%d" height="%d" alt=""><div class="wm tC" style="font-size:%dpx"><b>Coffee Pub</b> <i>%s</i></div></div>' % (max(10, msz // 5), fname(key, dark), msz, msz, fsz, third))
                        h.append('</div>')
                    h.append('</div></div>')
                continue
            if ver == 'v5':
                h.append('<div class="dir"><h3>%s</h3><p class="note">%s</p><div class="pair">' % (title, note))
                for dark, cls in (('', 'l'), ('-dark', 'd')):
                    h.append('<div class="p %s">' % cls)
                    for key in V4M:
                        sub = 'STUDIO' if key == 'studio' else V4N[key].replace('Coffee Pub ', '').upper()
                        h.append('<div class="lock"><img src="%s/%s/%s" width="64" height="64" alt=""><div><div class="cp">Coffee Pub</div><div class="sub">%s</div></div></div>' % (ver, d, fname(key, dark), sub))
                    h.append('</div>')
                h.append('</div></div>')
                continue
            prods = sorted(f[8:-4] for f in os.listdir(base) if f.startswith('product-') and not f.endswith('-dark.svg'))
            order = [p for p in PRODUCTS + ['studioapp'] if p in prods]
            h.append('<div class="dir"><h3>%s</h3><p class="note">%s</p><div class="pair">' % (title, note))
            for dark, cls in (('', 'l'), ('-dark', 'd')):
                h.append('<div class="p %s"><div class="row">' % cls)
                if os.path.exists(os.path.join(base, 'studio-mark%s.svg' % dark)):
                    h.append('<figure><img src="%s/%s/studio-mark%s.svg" width="64" height="64" alt="">'
                             '<figcaption>Studio</figcaption></figure>' % (ver, d, dark))
                for p in order:
                    h.append('<figure><img src="%s/%s/product-%s%s.svg" width="64" height="64" alt="">'
                             '<figcaption>%s</figcaption></figure>' % (ver, d, p, dark, p))
                h.append('</div><div class="row s">')
                for sz in (32, 16):
                    for p in ['studio'] + order[:3]:
                        fn = 'studio-mark%s.svg' % dark if p == 'studio' else 'product-%s%s.svg' % (p, dark)
                        if os.path.exists(os.path.join(base, fn)):
                            h.append('<img src="%s/%s/%s" width="%d" height="%d" alt="">' % (ver, d, fn, sz, sz))
                h.append('</div></div>')
            h.append('</div></div>')
        h.append('</section>')
    h.append('</body></html>')
    write(os.path.join(B, 'index.html'), ''.join(h))


# ================================================================ v4: only four marks
V4 = os.path.join(B, 'v4')
V4M = ['studio', 'chameleon', 'showrunner', 'foundry']
V4N = dict(studio='Coffee Pub Studio', chameleon='Coffee Pub Chameleon', showrunner='Coffee Pub Showrunner',
           foundry='Coffee Pub Gaming')


def fname(key, dark):
    return ('studio-mark%s.svg' if key == 'studio' else 'product-' + key + '%s.svg') % dark


def svg4(key, body):
    return svg(V4N[key], body)


def glyph(key, P):
    if key == 'chameleon':
        return ('<path d="M16 1C21 8 24 14 24 21C24 27 20 31 16 31C12 31 8 27 8 21C8 14 11 8 16 1Z" fill="%(navy)s"/>'
                '<circle cx="7.5" cy="16" r="6" fill="%(navy)s"/><circle cx="24.5" cy="16" r="6" fill="%(navy)s"/>'
                '<circle cx="7.5" cy="16" r="3.6" fill="%(cream)s"/><circle cx="24.5" cy="16" r="3.6" fill="%(cream)s"/>'
                '<circle cx="7.5" cy="16" r="1.7" fill="%(coral)s"/><circle cx="24.5" cy="16" r="1.7" fill="%(coral)s"/>' % P)
    if key == 'foundry':
        return ('<path d="M16 2L28 9V23L16 30L4 23V9z" fill="%(navy)s"/>'
                '<path d="M16 9L22.5 20.5H9.5z" fill="%(coral)s" stroke="%(cream)s" stroke-width="1.4" stroke-linejoin="round"/>'
                '<path d="M16 2V9M28 9L22.5 20.5M4 9L9.5 20.5M16 30V25M28 23L22.5 20.5M4 23L9.5 20.5" stroke="%(cream)s" stroke-width="1.2"/>' % P)
    return ''


def rising4():
    out = os.path.join(V4, 'dir-11')
    src = os.path.join(V3, 'dir-11')
    os.makedirs(out, exist_ok=True)
    for dark, P in (('', LIGHT), ('-dark', DARK)):
        shutil.copy(os.path.join(src, 'studio-mark%s.svg' % dark), os.path.join(out, 'studio-mark%s.svg' % dark))
        s = open(os.path.join(src, 'product-studioapp%s.svg' % dark), encoding='utf-8').read()
        write(os.path.join(out, 'product-showrunner%s.svg' % dark), s.replace('Studio app mark', 'Coffee Pub Showrunner mark'))
        s = open(os.path.join(src, 'product-squire%s.svg' % dark), encoding='utf-8').read()
        head, rest = s.split('<g transform="translate(14.92 8) scale(0.88)">')
        cup = head
        for key in ('chameleon',):
            ttl = V4N[key]
            c = cup.replace('Squire mark', ttl + ' mark')
            write(os.path.join(out, 'product-%s%s.svg' % (key, dark)),
                  c + '<g transform="translate(14.92 8) scale(0.88)">' + glyph(key, P) + '</g>\n</svg>\n')


def foundry_shield():
    for dark in ('', '-dark'):
        s = open(os.path.join(V3, 'dir-11', 'product-squire%s.svg' % dark), encoding='utf-8').read()
        write(os.path.join(V4, 'dir-11', 'product-foundry%s.svg' % dark), s.replace('Squire mark', 'Coffee Pub Foundry Modules mark'))


def quartet4():
    out = os.path.join(V4, 'dir-12')
    src = os.path.join(V1_4 := os.path.join(B, 'v1', 'dir-4'))
    os.makedirs(out, exist_ok=True)
    for dark, P in (('', LIGHT), ('-dark', DARK)):
        shutil.copy(os.path.join(src, 'studio-mark%s.svg' % dark), os.path.join(out, 'studio-mark%s.svg' % dark))
        s = open(os.path.join(src, 'product-studioapp%s.svg' % dark), encoding='utf-8').read()
        write(os.path.join(out, 'product-showrunner%s.svg' % dark), s.replace('M14 0a14 14 0 0 1 0 28z', 'M0 0h28a28 28 0 0 1-28 28z').replace('Studio app mark', 'Coffee Pub Showrunner mark'))
        shutil.copy(os.path.join(V3, 'dir-12', 'product-blacksmith%s.svg' % dark),
                    os.path.join(out, 'product-foundry%s.svg' % dark))
        body = (
            '<g transform="translate(3 3)" fill="%(teal)s"><circle cx="14" cy="14" r="14"/></g>\n'
            '<g transform="translate(33 3)" fill="%(coral)s"><circle cx="14" cy="14" r="14"/></g>\n'
            '<g transform="translate(3 33)" fill="%(navy)s"><rect width="28" height="28" rx="3"/></g>\n'
            '<g transform="translate(33 33)" fill="%(teal)s"><path d="M0 0h28a28 28 0 0 1-28 28z"/></g>' % P)
        write(os.path.join(out, 'product-chameleon%s.svg' % dark), svg4('chameleon', body))


L4 = dict(studio=('Cp', 'navy'), chameleon=('Ch', 'teal'), showrunner=('Sh', 'navy'), foundry=('Fm', 'sea'))


def letter4():
    out = os.path.join(V4, 'dir-13')
    for key, (letters, col) in L4.items():
        for dark, P in (('', LIGHT), ('-dark', DARK)):
            d = word_path(letters, 30, 30, 30, True)
            mid = 'l4%s%s' % (key[:3], 'd' if dark else 'l')
            body = ('<defs><mask id="%s"><rect width="64" height="64" fill="#fff"/>'
                    '<rect x="40.5" y="40.5" width="22" height="22" rx="6" fill="#000"/><path fill="#000" d="%s"/></mask></defs>'
                    '<rect x="3" y="3" width="54" height="54" rx="11" fill="%s" mask="url(#%s)"/>'
                    '<rect x="44" y="44" width="15" height="15" rx="3.5" fill="%s"/>' % (mid, d, P[col], mid, P['coral']))
            write(os.path.join(out, fname(key, dark)), svg4(key, body))


W4 = 4
J4 = dict(chameleon=('M32 4C54 12 10 52 32 60', 'navy', 'teal'),
          showrunner=('M32 4V60', 'navy', 'sea'),
          foundry=('M32 4V16L47 11V53L32 48V60', 'teal', 'sea'),
          studio=('M32 4V13A19 19 0 0 1 32 51V60', 'navy', 'teal'))


def joint4(out=None, only=None, over=None):
    out = out or os.path.join(V4, 'dir-14')
    for key, (pd, lc, rc) in dict(J4, **(over or {})).items():
        if only and key not in only:
            continue
        for dark, P in (('', LIGHT), ('-dark', DARK)):
            mid = 'j4%s%s' % (key[:3], 'd' if dark else 'l')
            m = re.match(r'M(\d+) 4(.*?)(\d+) 60$', pd.replace('V60', 'L32 60')) if False else None
            pts = pd
            x0 = re.match(r'M([\d.]+) 4', pd).group(1)
            xe = re.search(r'([\d.]+) 48$|([\d.]+) 60$', pd)
            # fills follow the joint path; end x is the last x on the path
            ex = re.findall(r'[\d.]+', pd)[-2] if pd.endswith(' 60') or pd.endswith('V60') is False else '32'
            if key == 'studio':
                ex = '32'
            elif key == 'chameleon':
                ex = '32'
            elif key == 'showrunner':
                ex = '28'
            elif key == 'foundry':
                ex = '44'
            rest = pd[1 + len(x0) + 2:]  # after "Mx 4"
            lf = 'M4 4H%s%s V60 H4Z' % (x0, rest)
            rf = 'M60 4H%s%s V60 H60Z' % (x0, rest)
            so = 10 + 2 * W4
            sp, cap = pd, 'round'
            ring = '<circle cx="32" cy="32" r="%s" fill="#000"/>' % (6 + W4)
            body = (
                '<defs><mask id="%(m)s"><rect x="4" y="4" width="56" height="56" rx="7" fill="#fff"/>'
                '<path d="%(sp)s" fill="none" stroke="#000" stroke-width="%(w)s" stroke-linejoin="round" stroke-linecap="%(cap)s"/>'
                '%(ring)s</mask></defs>'
                '<g mask="url(#%(m)s)"><path d="%(lf)s" fill="%(lc)s"/><path d="%(rf)s" fill="%(rc)s"/></g>'
                '<circle cx="32" cy="32" r="6" fill="%(co)s"/>'
            ) % dict(m=mid, sp=sp, cap=cap, ring=ring, pd=pd, w=W4, o=32 - so / 2, so=so, lf=lf, rf=rf, lc=P[lc], rc=P[rc], co=P['coral'])
            write(os.path.join(out, fname(key, dark)), svg4(key, body))



# ================================================================ v5: v4 kept, plus a roundel family
V5 = os.path.join(B, 'v5')


def roundel_body(key, P, mid, shield=False):
    disc = '<circle cx="32" cy="32" r="28" fill="%(navy)s"/>' % P
    dot = '<circle cx="%s" cy="%s" r="%s" fill="%s"/>'
    if key == 'studio':    # open C ring, coral dot in the opening
        g = ('<path d="M42.5 21.5A15 15 0 1 0 42.5 42.5" fill="none" stroke="%(cream)s" stroke-width="6" stroke-linecap="round"/>' % dict(P, cream=P['cream2']))
        d = dot % (45, 32, 4.5, P['coral'])
    elif key == 'chameleon':  # spiral tail, coral eye at the centre
        g = ('<path d="M32 32A4 4 0 0 1 24 32A8 8 0 0 1 40 32A12 12 0 0 1 16 32A16 16 0 0 1 48 32" fill="none" stroke="%s" stroke-width="4" stroke-linecap="round"/>' % P['cream2'])
        d = dot % (32, 32, 4.5, P['coral'])
    elif key == 'showrunner':  # rounded play triangle
        g = '<path d="M22 18L47 32L22 46z" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>' % (P['cream2'], P['cream2'])
        d = dot % (32, 32, 4.5, P['coral'])
    elif shield:           # gaming: shield outline
        g = '<path d="M32 13L47 19V33C47 42 40 48 32 51C24 48 17 42 17 33V19z" fill="none" stroke="%s" stroke-width="4.5" stroke-linejoin="round"/>' % P['cream2']
        d = dot % (32, 31, 4.5, P['coral'])
    else:                  # foundry: hexagon (die) outline
        g = '<path d="M32 14L47.6 23V41L32 50L16.4 41V23z" fill="none" stroke="%s" stroke-width="4.5" stroke-linejoin="round"/>' % P['cream2']
        d = dot % (32, 32, 4.5, P['coral'])
    return disc + g + d


def roundel5(out=None, shield=False):
    out = out or os.path.join(V5, 'dir-18')
    for key in V4M:
        for dark, P in (('', LIGHT), ('-dark', DARK)):
            Q = dict(P, cream2=(LIGHT['cream'] if not dark else DARK['cream']))
            if dark:
                Q = dict(P, navy=DARK['navy'], cream2=DARK['cream'])
            write(os.path.join(out, fname(key, dark)), svg4(key, roundel_body(key, Q, key, shield)))


def build_v5():
    for src, dst in (('dir-11', 'dir-15'), ('dir-12', 'dir-16'), ('dir-14', 'dir-17')):
        d = os.path.join(V5, dst)
        if os.path.isdir(d):
            shutil.rmtree(d)
        shutil.copytree(os.path.join(V4, src), d)
    for dark, P in (('', LIGHT), ('-dark', DARK)):
        body = (
            '<g transform="translate(3 3)" fill="%(teal)s"><circle cx="14" cy="14" r="14"/></g>\n'
            '<g transform="translate(33 3)" fill="%(coral)s"><circle cx="14" cy="14" r="14"/></g>\n'
            '<g transform="translate(3 33)" fill="%(navy)s"><path d="M28 0V28A28 28 0 0 1 0 0z"/></g>\n'
            '<g transform="translate(33 33)" fill="%(teal)s"><path d="M0 0h28a28 28 0 0 1-28 28z"/></g>' % P)
        write(os.path.join(V5, 'dir-16', 'product-chameleon%s.svg' % dark), svg4('chameleon', body))
    joint4(out=os.path.join(V5, 'dir-17'), only=['showrunner'],
           over=dict(showrunner=('M32 4L50 32L32 60', 'navy', 'sea')))
    roundel5()


# ================================================================ v6
V6 = os.path.join(B, 'v6')


def build_v6():
    for src, dst in (('dir-15', 'dir-19'), ('dir-16', 'dir-20'), ('dir-17', 'dir-21')):
        d = os.path.join(V6, dst)
        if os.path.isdir(d):
            shutil.rmtree(d)
        shutil.copytree(os.path.join(V5, src), d)
    # Quartet, Gaming: two quarter-pies on top (an arch, like a door), two squares below
    for dark, P in (('', LIGHT), ('-dark', DARK)):
        body = (
            '<g transform="translate(3 3)" fill="%(navy)s"><path d="M28 28V0A28 28 0 0 0 0 28z"/></g>\n'
            '<g transform="translate(33 3)" fill="%(coral)s"><path d="M0 28V0A28 28 0 0 1 28 28z"/></g>\n'
            '<g transform="translate(3 33)" fill="%(navy)s"><rect width="28" height="28" rx="3"/></g>\n'
            '<g transform="translate(33 33)" fill="%(teal)s"><rect width="28" height="28" rx="3"/></g>' % P)
        write(os.path.join(V6, 'dir-20', 'product-foundry%s.svg' % dark), svg4('foundry', body))
    quartet6()
    roundel5(out=os.path.join(V6, 'dir-22'), shield=True)


R = 2.5   # one corner radius for squares and pies
S = 24    # cell size; 3 + 24 + 2 + 24 + 3 = 56, so the mark sits on whole pixels at 56 px


def cell(x, y, color, inner):
    return '<g transform="translate(%s %s)" fill="%s">%s</g>' % (x, y, color, inner)


def circ():
    return '<circle cx="%d" cy="%d" r="%d"/>' % (S // 2, S // 2, S // 2)


def sq():
    # a path with true arcs, so every renderer (browsers, PDF, PNG export) draws identical corners
    return ('<path d="M%(r)s 0H%(a)s A%(r)s %(r)s 0 0 1 %(s)s %(r)s V%(a)s A%(r)s %(r)s 0 0 1 %(a)s %(s)s H%(r)s '
            'A%(r)s %(r)s 0 0 1 0 %(a)s V%(r)s A%(r)s %(r)s 0 0 1 %(r)s 0z"/>' % dict(r=R, s=S, a=S - R))


def pie(angle):
    """Quarter pie, radius S, every corner filleted with radius R using true arcs (no strokes).
    angle 0 = pivot bottom-right, 90 = bottom-left, 180 = top-left, 270 = top-right."""
    import math
    r = R
    yc = S - math.sqrt((S - r) ** 2 - r * r)       # fillet centre on the straight edge side
    cx = S - r
    k = S / (S - r)
    tx = S + (cx - S) * k                          # tangent point on the big arc
    ty = S + (yc - S) * k
    f = lambda v: ('%.3f' % v).rstrip('0').rstrip('.')
    d = ('M%s %sL%s %sA%s %s 0 0 0 %s %sA%s %s 0 0 0 %s %sA%s %s 0 0 0 %s %sL%s %sA%s %s 0 0 0 %s %sz' % (
        f(S), f(S - r), f(S), f(yc), f(r), f(r), f(tx), f(ty),
        f(S), f(S), f(ty), f(tx),
        f(r), f(r), f(yc), f(S), f(S - r), f(S), f(r), f(r), f(S), f(S - r)))
    return '<path transform="rotate(%d %d %d)" d="%s"/>' % (angle, S // 2, S // 2, d)


def quartet6():
    out = os.path.join(V6, 'dir-20')
    g = 3 + S + 2
    for dark, P in (('', LIGHT), ('-dark', DARK)):
        n, t, c = P['navy'], P['teal'], P['coral']
        marks = dict(
            studio=[cell(3, 3, n, pie(0)), cell(g, 3, c, circ()), cell(3, g, t, circ()), cell(g, g, n, pie(180))],
            chameleon=[cell(3, 3, t, circ()), cell(g, 3, c, circ()), cell(3, g, n, pie(270)), cell(g, g, t, pie(180))],
            showrunner=[cell(3, 3, n, circ()), cell(g, 3, c, circ()), cell(3, g, t, sq()), cell(g, g, n, pie(180))],
            foundry=[cell(3, 3, n, pie(0)), cell(g, 3, c, pie(90)), cell(3, g, n, sq()), cell(g, g, t, sq())],
        )
        for key, parts in marks.items():
            body = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56" role="img" '
                    'aria-label="%s mark">\n<title>%s mark</title>\n%s\n</svg>\n' % (V4N[key], V4N[key], '\n'.join(parts)))
            write(os.path.join(out, fname(key, dark)), body)


FONT = load_font()
rising(); quartet(); letter_tile(); joint(); sheet()
rising4(); foundry_shield(); quartet4(); letter4(); joint4(); build_v5(); build_v6(); sheet()
print('ok')
