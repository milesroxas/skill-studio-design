# Writes chat-panel.html: the Help me improve panel lifted off a skeleton of the Skill screen.
# One artboard, 1600 x 1280 (the 5:4 crop of the work page's Split Image Offset), every
# length on the 8 px grid, the panel image embedded so the file needs nothing else.
import base64
panel = base64.b64encode(open('panel.png', 'rb').read()).decode()

G1 = 'oklch(0.21 0.01 267.3)'   # --muted: skeleton bars
G2 = 'oklch(0.25 0.01 267.3)'   # --border: rules and the selected line
BG = 'oklch(0.155 0.01 267.3)'  # --background
SB = 'oklch(0.125 0.01 267.3)'  # --sidebar

def bar(x, y, w, h=16, c=G1, r=None):
    r = h // 2 if r is None else r
    return f'<i style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:{c};border-radius:{r}px"></i>'

side = [bar(24, 32, 104), bar(24, 56, 72, 8)]
for y, w in ((104, 48), (144, 64), (184, 56)):
    side += [bar(24, y, 16, 16, r=4), bar(48, y, w)]
for y, w in ((768, 56), (800, 48), (832, 64)):
    side += [bar(24, y, 16, 16, r=4), bar(48, y, w)]

ed = [bar(24, 24, 16), bar(56, 24, 16), bar(96, 24, 64)]
ed += [bar(40, 104, 200, 24, r=8)]
ed += [bar(40, y, w) for y, w in ((152, 424), (184, 392), (216, 240))]
ed += [bar(40, 280, 96, 24, r=8)]
rules = [(336, 392), (376, 360), (416, 376), (456, 328), (496, 384), (536, 344)]
for y, w in rules:
    ed += [bar(40, y, 16, 16, r=4), bar(72, y, w)]
ed += [bar(32, 568, 352, 32, G1, 8), bar(40, 576, 16, 16, G2, 4), bar(72, 576, 296, 16, G2)]
ed += [bar(40, 648, 112, 24, r=8)]
ed += [bar(40, y, w) for y, w in ((704, 280), (744, 200), (784, 256))]

html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Skill Studio chat panel</title><style>
html, body {{ margin: 0; background: #0b0c0b; }}
.art {{ position: relative; width: 1600px; height: 1280px; overflow: hidden;
  background: radial-gradient(110% 90% at 18% 0%, #1c1d1b 0%, #121312 45%, #0b0c0b 100%); }}
.win {{ position: absolute; left: 152px; top: 200px; width: 1272px; height: 880px; border-radius: 24px;
  overflow: hidden; background: {BG}; box-sizing: border-box; border: 1px solid {G2}; }}
.side {{ position: absolute; left: 0; top: 0; width: 176px; height: 100%; background: {SB}; border-right: 1px solid {G2}; box-sizing: border-box; }}
.ed {{ position: absolute; left: 176px; top: 0; width: 504px; height: 100%; }}
.ed::before {{ content: ''; position: absolute; left: 0; right: 0; top: 64px; height: 1px; background: {G2}; }}
.dock {{ position: absolute; left: 680px; top: 0; width: 592px; height: 100%; border-left: 1px solid {G2}; box-sizing: border-box; }}
i {{ position: absolute; display: block; }}
.panel {{ position: absolute; left: 808px; top: 164px; width: 640px; height: 952px; border-radius: 16px; overflow: hidden;
  background: #0e0f12 url(data:image/png;base64,{panel}) 0 0 / 640px 952px no-repeat;
  outline: 1px solid rgba(244, 242, 235, 0.1); box-shadow: 0 32px 96px -16px rgba(0, 0, 0, 0.85); }}
</style></head><body><div class="art">
<div class="win"><div class="side">{''.join(side)}</div><div class="ed">{''.join(ed)}</div><div class="dock"></div></div>
<div class="panel" role="img" aria-label="Help me improve in Skill Studio's side panel"></div>
</div></body></html>'''
open('chat-panel.html', 'w').write(html)
