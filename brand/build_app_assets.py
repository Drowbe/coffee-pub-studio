"""Mark-only icon assets for the Showrunner desktop app (no product name in any image).
Run:  python -I build_app_assets.py   (needs PyMuPDF; reads ../brand-kit/svg, so run build_kit.py first)"""
import os, re, shutil
import fitz

B = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(B, '..', 'brand-kit', 'svg')
OUT = os.path.join(B, 'app-assets', 'showrunner')
SITE = os.path.join(B, '..', 'site', 'assets', 'brand', 'app', 'showrunner')


def src(name):
    return open(os.path.join(KIT, name), encoding='utf-8').read()


def inner(svg):
    return re.sub(r'<title>.*?</title>', '', re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1), flags=re.S).strip()


def render(svg, px, alpha):
    doc = fitz.open(stream=svg.encode('utf-8'), filetype='svg')
    page = doc[0]
    z = px / page.rect.width
    return page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=alpha).tobytes('png')


def save(name, data, mode='wb'):
    p = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if mode == 'wb':
        open(p, 'wb').write(data)
    else:
        open(p, 'w', encoding='utf-8').write(data)


if os.path.isdir(OUT):
    shutil.rmtree(OUT)

# 1. Square app icon, full bleed, opaque. The OS applies its own corner mask, so none is drawn here.
for name, bg, mark in (('app-icon', '#FBF6EC', 'coffee-pub-showrunner-mark.svg'),
                       ('app-icon-dark', '#0E1A2B', 'coffee-pub-showrunner-mark-dark.svg')):
    s = 1024 * 0.68 / 56
    t = (1024 - 56 * s) / 2
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
           '<rect width="1024" height="1024" fill="%s"/><g transform="translate(%.2f %.2f) scale(%.4f)">%s</g></svg>'
           % (bg, t, t, s, inner(src(mark))))
    save(name + '.svg', svg, 'w')
    save(name + '-1024.png', render(svg, 1024, False))

# 2. White mark, solid #FFFFFF on transparent: SVG and PNGs at 2x or larger
white = src('coffee-pub-showrunner-mark-white.svg')
save('mark-white.svg', white, 'w')
for px in (128, 256, 512, 1024):
    save('mark-white-%d.png' % px, render(white, px, True))

# 3. Tray / menu bar icons
black = white.replace('#FFFFFF', '#000000')
save('mark-black.svg', black, 'w')
for px in (16, 24, 32, 48):                       # Windows and Linux trays (white)
    save('tray/tray-white-%d.png' % px, render(white, px, True))
save('tray/trayTemplate.png', render(black, 22, True))        # macOS menu bar, "Template" = the OS recolours it
save('tray/trayTemplate@2x.png', render(black, 44, True))

save('README.txt', '''Showrunner app icons (mark only, no product name in any file)

app-icon-1024.png        1024 x 1024, opaque, full bleed, light (cream) background. The mark fills about 68% so it survives the OS corner mask.
app-icon-dark-1024.png   Same on the dark navy background.
app-icon.svg / app-icon-dark.svg   Vector sources of the two icons.
mark-white.svg           Solid #FFFFFF on transparent, for the app menu. mark-white-128/256/512/1024.png are the same at larger sizes.
mark-black.svg           Solid #000000 on transparent, source for the macOS template image.
tray/trayTemplate.png, trayTemplate@2x.png   macOS menu bar (22 and 44 px, black on transparent; macOS recolours "Template" images for light and dark menu bars).
tray/tray-white-16/24/32/48.png              Windows and Linux tray (white on transparent).

Do not recolour the shapes. The mark is crispest at 56 px and multiples of 56 (112, 224, 448, 896).
''', 'w')

shutil.rmtree(SITE, ignore_errors=True)
shutil.copytree(OUT, SITE)
print(sorted(os.listdir(OUT)))
