# The Help me improve panel from the 4x still, cut to what the mockup shows.
from PIL import Image, ImageDraw
S = 4
im = Image.open('../../recorder/out/stills-4x/improve-3.png').convert('RGB')
x0, x1 = 1001, 1360
# css px: header, question and answer, draft and checks, Replace selection
slices = [(0, 50), (211, 353), (402, 689), (792, 847)]
h = sum(b - a for a, b in slices)
out = Image.new('RGB', ((x1 - x0) * S, h * S), (14, 15, 18))
y = 0
for a, b in slices:
    part = im.crop((x0 * S, a * S, x1 * S, b * S))
    if 50 < a < 790:  # the scroll area: paint its scrollbar out
        ImageDraw.Draw(part).rectangle(((1350 - x0) * S, 0, (x1 - x0) * S, part.height), fill=(14, 15, 18))
    out.paste(part, (0, y * S))
    y += b - a
out.save('panel.png', optimize=True)
print(out.size, h)
