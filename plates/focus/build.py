# Focus mockups for the Skill Studio work page: one part of the app at full
# fidelity, cut from a 4x still, lifted with one shadow over a skeleton of the
# screen it lives on. Every length is on the 8 px grid, every artboard keeps 8%
# clear on each side, and each HTML file embeds its picture so it needs nothing
# else. Stills: ../../recorder/out/stills (STILLS_SCALE=4) and
# ../../recorder/out/walkthrough/edit-start.png (walkthrough-still.ts).
#   python3 build.py && node render.mjs
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
STILLS = HERE / '../../recorder/out/stills'
S = 4  # pixels per css px in the stills

# The app's dark tokens (src/renderer/styles.css).
G1 = 'oklch(0.21 0.01 267.3)'  # --muted: skeleton bars
G2 = 'oklch(0.25 0.01 267.3)'  # --border: rules, dividers, a selected line
BG = 'oklch(0.155 0.01 267.3)'  # --background
SB = 'oklch(0.125 0.01 267.3)'  # --sidebar
PANEL_BG = (14, 15, 18)


def png64(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def cut(still, x, y, w, h):
    im = Image.open(still).convert('RGB')
    return im.crop((round(x * S), round(y * S), round((x + w) * S), round((y + h) * S)))


def splice(still, x0, x1, rows, scrollbar=None):
    """Rows of one column of a still, stacked; a scrollbar column painted out."""
    im = Image.open(still).convert('RGB')
    h = sum(b - a for a, b in rows)
    out = Image.new('RGB', ((x1 - x0) * S, h * S), PANEL_BG)
    y = 0
    for a, b in rows:
        part = im.crop((x0 * S, a * S, x1 * S, b * S))
        if scrollbar:  # paint out the scrollbar's thumb, and only it
            px = part.load()
            for xx in range((scrollbar - x0) * S, part.width):
                for yy in range(part.height):
                    if sum(px[xx, yy]) > 150:
                        px[xx, yy] = PANEL_BG
        out.paste(part, (0, y * S))
        y += b - a
    return out


def b(x, y, w, h=16, c=G1, r=None):
    r = h // 2 if r is None else r
    return f'<i style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{c};border-radius:{r}px"></i>'


def line(x, y, w=None, h=None):
    """A 1 px divider: horizontal with w, vertical with h."""
    return f'<i style="left:{x}px;top:{y}px;width:{w or 1}px;height:{h or 1}px;background:{G2}"></i>'


def window(x, y, w, h, side, head, run=False, nav=0, foot=None):
    """The app window: sidebar, top bar and their skeletons, absolute on the artboard."""
    parts = [
        f'<i style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{BG};border-radius:24px;box-shadow:inset 0 0 0 1px {G2}"></i>',
        f'<i style="left:{x + 1}px;top:{y + 1}px;width:{side - 1}px;height:{h - 2}px;background:{SB};border-radius:23px 0 0 23px"></i>',
        line(x + side, y, h=h),
        line(x + side, y + head, w=w - side),
        # sidebar: the skill switcher, three screens, then Library, Guide, Settings
        b(x + 24, y + 32, 104), b(x + 24, y + 56, 72, 8),
    ]
    for i, wd in enumerate((48, 64, 56)):
        yy = y + 104 + i * 40
        if nav == i + 1:
            parts.append(b(x + 12, yy - 12, side - 24, 40, G1, 8))
        parts += [b(x + 24, yy, 16, 16, G2 if nav == i + 1 else G1, 4), b(x + 48, yy, wd, 16, G2 if nav == i + 1 else G1)]
    for i, wd in enumerate((56, 48, 64)):
        yy = y + h - 112 + i * 32
        if foot == i:
            parts.append(b(x + 12, yy - 8, side - 24, 32, G1, 8))
        parts += [b(x + 24, yy, 16, 16, G2 if foot == i else G1, 4), b(x + 48, yy, wd, 16, G2 if foot == i else G1)]
    # top bar: back, forward, the screen's name; Run, Help, Assistant
    hy = y + (head - 16) // 2
    parts += [b(x + side + 24, hy, 16, 16, r=8), b(x + side + 56, hy, 16, 16, r=8), b(x + side + 96, hy, 72)]
    parts += [b(x + w - 96, hy - 4, 24, 24, r=12), b(x + w - 56, hy - 4, 24, 24, r=12)]
    if run:
        parts.append(b(x + w - 216, hy - 8, 96, 32, G1, 8))
    return parts


def focal(im, x, y, w, h, radius=16, fade=0):
    """The one part at full fidelity: one shadow, a hairline, nothing else."""
    mask = f'-webkit-mask-image:linear-gradient(to bottom,#000 {h - fade}px,transparent {h}px);mask-image:linear-gradient(to bottom,#000 {h - fade}px,transparent {h}px);' if fade else ''
    shadow_h = h - fade if fade else h
    return (
        f'<i style="left:{x}px;top:{y}px;width:{w}px;height:{shadow_h}px;border-radius:{radius}px;box-shadow:0 32px 96px -16px rgba(0,0,0,0.85)"></i>'
        f'<i style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;border-radius:{radius}px;overflow:hidden;{mask}'
        f'background:#0e0f12 url(data:image/png;base64,{png64(im)}) 0 0 / {w}px {h}px no-repeat;'
        f'outline:1px solid rgba(244,242,235,0.1)"></i>'
    )


def page(name, w, h, parts, label):
    html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Skill Studio: {label}</title><style>
html, body {{ margin: 0; background: #0b0c0b; }}
.art {{ position: relative; width: {w}px; height: {h}px; overflow: hidden;
  background: radial-gradient(110% 90% at 18% 0%, #1c1d1b 0%, #121312 45%, #0b0c0b 100%); }}
i {{ position: absolute; display: block; }}
</style></head><body><div class="art" role="img" aria-label="{label}">
{''.join(parts)}
</div></body></html>'''
    (HERE / f'{name}.html').write_text(html)
    return {'name': name, 'w': w, 'h': h}


def rules(x, y, widths, step=40):
    out = []
    for i, wd in enumerate(widths):
        out += [b(x, y + i * step, 16, 16, r=4), b(x + 32, y + i * step, wd)]
    return out


built = []

# 1. Library (Image Statement, 16:9): the In progress list.
p = window(128, 136, 1344, 624, 176, 64, foot=0)
p += [b(344, 224, 320, 40, r=8), b(680, 224, 144, 40, r=8), b(1288, 232, 24, 24, r=12), b(1328, 224, 112, 40, r=8)]
p += [b(344, 648, 104, 16), b(464, 652, 72, 8)]
p += [b(344, 688, 120, 16), b(344, 712, 208, 8), b(704, 688, 64, 16)]
p += [b(856, 684, 56, 24, r=6), b(920, 684, 56, 24, r=6), b(984, 684, 56, 24, r=6), b(1288, 688, 48, 16), b(1416, 688, 24, 16, r=4)]
p.append(focal(cut(STILLS / 'library.png', 244, 137.5, 1093, 335), 344, 280, 1096, 336))
built.append(page('skill-studio-intro-library', 1600, 900, p, 'Library, In progress'))

# 2. Results (Full Media, 16:9): the two outputs side by side, scores and what was missed.
p = window(128, 136, 1344, 624, 176, 64, run=True, nav=3)
p.append(line(528, 200, h=560))
p += [b(328, 224, 64, 16)]
for i in range(4):
    yy = 272 + i * 64
    p += [b(328, 272 + i * 64, 160 - (i % 2) * 24, 16), b(328, yy + 24, 40, 24, r=6), b(384, yy + 24, 40, 24, r=6), b(440, yy + 28, 32, 16)]
p += [b(560, 224, 320, 24, r=8), b(1264, 220, 152, 32, r=8)]
p += [b(560, 272, 16, 16, r=4), b(592, 272, 200, 16), b(560, 304, 16, 16, r=4), b(592, 304, 320, 16)]
p.append(focal(cut(STILLS / 'results.png', 508, 219, 825, 316), 560, 352, 880, 336, fade=48))
built.append(page('skill-studio-one-screen', 1600, 900, p, 'Results, two outputs compared'))

# 3. Correct the grader (Split Content Narrow, 3:2, 5:4 on phones): one output's card.
p = window(136, 136, 1360, 816, 176, 64, run=True, nav=3)
p.append(line(536, 200, h=752))
p += [b(336, 232, 64, 16)]
for i in range(4):
    yy = 280 + i * 64
    p += [b(336, yy, 152 - (i % 2) * 24, 16), b(336, yy + 24, 40, 24, r=6), b(392, yy + 24, 40, 24, r=6), b(448, yy + 28, 32, 16)]
p += [b(568, 232, 320, 24, r=8), b(1296, 228, 152, 32, r=8)]
# the other output, as a skeleton card
p.append(f'<i style="left:1272px;top:304px;width:192px;height:600px;border-radius:16px;box-shadow:inset 0 0 0 1px {G2}"></i>')
p += [b(1296, 328, 24, 24, r=6), b(1336, 332, 104, 16), b(1336, 360, 96, 8), line(1272, 400, w=192)]
p += [b(1296, 424, 40, 8), b(1296, 440, 48, 16), b(1360, 424, 40, 8), b(1360, 440, 48, 16), line(1272, 480, w=192)]
p += [b(1296, 504, 112, 16), b(1296, 544, 72, 16), line(1272, 584, w=192), b(1296, 608, 88, 32, r=8)]
p += [b(1296, 672, 144, 24, r=8), b(1296, 712, 144, 16), b(1296, 744, 120, 16), b(1296, 776, 136, 16)]
p.append(focal(cut(STILLS / 'results-marked.png', 516, 179, 396.5, 382), 568, 280, 672, 648, radius=20))
built.append(page('skill-studio-mark-met', 1632, 1088, p, 'A miss marked as met'))

# 4. Walkthrough (Split Content Narrow, 3:2): the Tighten this rule card.
p = window(136, 160, 1360, 768, 224, 64, run=True, nav=1)
p += [b(160, 560, 88, 12), b(304, 560, 32, 12)]
p += [b(160 + i * 48, 592, 40, 8, G2 if i < 2 else G1, 4) for i in range(4)]
p += [b(160, 624, 128, 16), b(160, 656, 176, 8), b(160, 672, 120, 8)]
p += [b(392, 248, 80, 16), b(488, 252, 48, 8), b(1160, 240, 304, 32, r=8)]
p += [b(480, 560, 896, 104, G1, 12), b(504, 584, 48, 8, G2), b(504, 608, 280, 8, G2), b(504, 632, 560, 8, G2)]
p += [b(480, 704, 200, 24, r=8), b(480, 752, 152, 16), b(480, 792, 640, 16), b(480, 824, 480, 16), b(480, 856, 560, 16)]
wt = HERE / '../../recorder/out/walkthrough/edit-start.png'
r = json.loads((wt.parent / 'edit-start.rects.json').read_text())['[aria-label="Tighten this rule"]']
p.append(focal(cut(wt, r['x'] - 16, r['y'] - 16, r['w'] + 32, r['h'] + 32), 480, 288, 896, 248))
built.append(page('skill-studio-walkthrough', 1632, 1088, p, 'Walkthrough, Tighten this rule'))

# 5. Selection tools (Split Image Offset small, 3:2): the popover over a selected rule.
p = window(136, 160, 1360, 768, 224, 64, run=True, nav=1)
p += [b(392, 248, 112, 24, r=8)]
p += rules(392, 296, (640, 704, 576, 688, 600, 656, 560, 624, 680), step=40)[:4]
p += [b(384, 752, 560, 32, G1, 8), b(392, 760, 16, 16, G2, 4), b(424, 760, 496, 16, G2)]
p += [b(392, 816, 112, 24, r=8), b(392, 864, 480, 16)]
p.append(focal(cut(STILLS / 'editor-tools.png', 446.2, 296.8, 440, 219), 424, 384, 704, 352, radius=20))
built.append(page('skill-studio-selection-tools', 1632, 1088, p, 'Writing checks and three actions on a selected rule'))

# 6. Auto refine (Feature Tabs, 16:9, 3:2 below lg): the proposed fix.
p = window(128, 136, 1344, 624, 176, 64, run=True, nav=1)
p += [b(336, 224, 112, 24, r=8)]
p += rules(336, 272, (880, 960, 832, 944, 904, 864, 920, 896, 936, 880), step=40)[:20]
p += [b(328, 704, 560, 32, G1, 8), b(336, 712, 16, 16, G2, 4), b(368, 712, 496, 16, G2)]
p.append(focal(cut(STILLS / 'editor-refine.png', 446.2, 178.8, 440, 337), 448, 168, 680, 520, radius=20))
built.append(page('skill-studio-auto-refine', 1600, 900, p, 'Auto refine, the proposed fix'))

# 7. Suggest changes (Feature Tabs, 16:9): three rewrites.
p = window(128, 136, 1344, 624, 176, 64, run=True, nav=1)
p += [b(336, 224, 112, 24, r=8)]
p += rules(336, 272, (880, 960, 832, 944, 904, 864, 920, 896, 936), step=40)
p += [b(328, 640, 560, 32, G1, 8), b(336, 648, 16, 16, G2, 4), b(368, 648, 496, 16, G2)]
p += [b(336, 704, 112, 24, r=8)]
p.append(focal(cut(STILLS / 'editor-rewrites.png', 346.2, 138.8, 640, 377), 400, 152, 800, 472, radius=16))
built.append(page('skill-studio-suggest-changes', 1600, 900, p, 'Suggest changes, three rewrites'))

# 8. Help me improve (Feature Tabs, 16:9): the side panel asking its first question.
p = window(152, 176, 1272, 544, 176, 56, run=True, nav=1)
p.append(line(1424 - 592, 176, h=544))
p += [b(360, 248, 200, 24, r=8), b(360, 296, 424, 16), b(360, 328, 360, 16)]
p += [b(360, 392, 96, 24, r=8)]
p += rules(360, 440, (392, 360, 376, 328), step=40)[:8]
p += [b(352, 600, 400, 32, G1, 8), b(360, 608, 16, 16, G2, 4), b(392, 608, 336, 16, G2)]
q = STILLS / 'improve-question.png'
p.append(focal(splice(q, 1001, 1360, [(0, 240), (686, 792)], scrollbar=1351), 808, 152, 640, 616))
built.append(page('skill-studio-help-me-improve', 1600, 900, p, 'Help me improve, one question at a time'))

(HERE / 'mockups.json').write_text(json.dumps(built, indent=1) + '\n')
print('\n'.join(m['name'] for m in built))
