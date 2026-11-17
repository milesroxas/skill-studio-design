# Skill Studio's brand, for a social post

Taken from the app's design system (`docs/design/brand.md`, `color.md` and `copy.md` in the skill-studio repo). When they disagree with this file, they win.

Skill Studio looks like a print proof: ink on porcelain stock, hairline rules, one fluorescent mark for what is live.

## Color

These are all the colors. Use no other.

| Name | Hex | Use |
| --- | --- | --- |
| Ink | `#0A1020` | the image's ground, text on porcelain |
| Porcelain | `#F4F2EB` | text and the mark on ink, the ground of a light image |
| Signal | `#F0F059` | the slab under one word of the headline. One per image. |
| Hairline | Porcelain at 16% | the edge of the screenshot, a rule |
| Quiet text | Porcelain at 64% | the eyebrow, the line under the headline |

- No gradient, glow, glass blur, drop shadow on text, or second accent color.
- Yellow means live. The mark is never yellow.

## Type

- Geist for words, Geist Mono for the eyebrow and numbers such as the version. Both are in `assets/fonts`. No third typeface.
- Sentence case. No trailing period on the headline.

## The mark

`assets/mark.svg`: two identical ribbons. Never stretch, rotate, outline or recolor it: porcelain on ink, ink on porcelain. Clear space is 17.4% of its width on every side. At least 16px wide.

## The image

`scripts/render.mjs` makes the image from `assets/card.html`. Write a `post.json` beside `post.md`:

```json
{
  "size": "x",
  "eyebrow": "Skill Studio 0.17.0",
  "headline": "Split a rule that asks for too much",
  "slab": "Split",
  "line": "Suggest changes offers one rule for each thing it asks.",
  "shot": "split-up.png",
  "focus": [0.5, 0.4],
  "out": "post.png"
}
```

| Field | What it is |
| --- | --- |
| `size` | `x` (1200 x 675), `linkedin` (1200 x 627) or `square` (1080 x 1080). Rendered at 2x. |
| `eyebrow` | `Skill Studio` and the version, in mono |
| `headline` | 8 words or fewer: what the reader can now do |
| `slab` | the one word of the headline that sits on the yellow slab |
| `line` | one sentence under the headline, 14 words or fewer |
| `shot` | a screenshot of the feature, beside `post.json`. Left out, the mark stands in its place, cropped by the frame. |
| `focus` | the point of the screenshot to keep in view, as fractions of its width and height |
| `out` | where the PNG goes, beside `post.json` |

The headline sits on the left on ink. The screenshot sits on the right as a sheet with a hairline edge and no shadow, running off the frame's right and bottom edges. The mark sits in the bottom-left corner, porcelain.

## Voice

- Say what the reader does or sees, not how the app does it.
- Plain and specific. No "powerful", "seamless", "simply".
- Use the app's own words: "rule", "case", "run", "output", "Jev". Jev is Jev, never "the judge".
- Use the name on the control, in bold or quotes: **Suggest changes**, **Split up**.
