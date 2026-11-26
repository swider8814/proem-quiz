#!/usr/bin/env python3
"""Generuje ikony aplikacji (favicon, ekran główny iOS/Android) do static/.

Motyw: żółty dymek z granatowym znakiem zapytania na granatowym tle aplikacji.

Użycie:  python3 scripts/generate-icons.py
Wymaga:  rsvg-convert (librsvg) i ImageMagick (convert) do favicon.ico.
"""
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'static', 'icons')

BG = '#1b1f3b'
YELLOW = '#ffc93c'

# Dymek na płótnie 512x512 (obrys: x 88–424, y 112–416)
BUBBLE = ('M150 112 h212 a62 62 0 0 1 62 62 v118 a62 62 0 0 1 -62 62 h-120 l-74 62 v-62 h-18 '
          'a62 62 0 0 1 -62 -62 v-118 a62 62 0 0 1 62 -62z')


def question(cx, cy, scale, stroke=36, dot=21):
    return (f'<g transform="translate({cx} {cy}) scale({scale})">'
            f'<path d="M-52 -46 a52 52 0 1 1 72 48 c-14 6 -20 15 -20 30 v16" fill="none" stroke="{BG}" '
            f'stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<circle cx="0" cy="98" r="{dot}" fill="{BG}"/></g>')


def art(stroke=36, dot=21):
    return f'<path d="{BUBBLE}" fill="{YELLOW}"/>' + question(256, 222, 0.82, stroke, dot)


def svg(size, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">{body}</svg>\n'


def scaled(k, body):
    """Skaluje rysunek względem środka płótna 512."""
    t = 256 * (1 - k)
    return f'<g transform="translate({t:g} {t:g}) scale({k:g})">{body}</g>'


# "any" – zaokrąglony kwadrat z przezroczystymi rogami (Android, manifest)
icon = svg(512, f'<rect width="512" height="512" rx="112" fill="{BG}"/>' + art())
# iOS sam zaokrągla rogi – pełne tło
apple = svg(512, f'<rect width="512" height="512" fill="{BG}"/>' + art())
# maskable – dymek pomniejszony, z zapasem w bezpiecznej strefie (koło r = 40%)
maskable = svg(512, f'<rect width="512" height="512" fill="{BG}"/>' + scaled(0.88, art()))
# favicon – dymek prawie na całe pole, grubszy pytajnik (czytelny w 16–32 px)
favicon = svg(512, f'<rect width="512" height="512" rx="104" fill="{BG}"/>'
              f'<g transform="translate(-77 -96) scale(1.3)">{art(stroke=50, dot=27)}</g>')


def write(path, content):
    with open(path, 'w') as f:
        f.write(content)
    return path


def png(src, dst, size):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), src, '-o', dst], check=True)


os.makedirs(OUT, exist_ok=True)
icon_svg = write(os.path.join(OUT, 'icon.svg'), icon)
fav_svg = write(os.path.join(OUT, 'favicon.svg'), favicon)
with tempfile.TemporaryDirectory() as tmp:
    apple_svg = write(os.path.join(tmp, 'apple.svg'), apple)
    mask_svg = write(os.path.join(tmp, 'maskable.svg'), maskable)

    png(icon_svg, os.path.join(OUT, 'icon-192.png'), 192)
    png(icon_svg, os.path.join(OUT, 'icon-512.png'), 512)
    png(apple_svg, os.path.join(OUT, 'apple-touch-icon.png'), 180)
    png(mask_svg, os.path.join(OUT, 'maskable-192.png'), 192)
    png(mask_svg, os.path.join(OUT, 'maskable-512.png'), 512)

    sizes = (16, 32, 48)
    for s in sizes:
        png(fav_svg, os.path.join(tmp, f'f{s}.png'), s)
    subprocess.run(['convert'] + [os.path.join(tmp, f'f{s}.png') for s in sizes]
                   + [os.path.join(ROOT, 'static', 'favicon.ico')], check=True)
print('OK')
