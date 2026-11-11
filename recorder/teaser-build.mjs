// Builds the cases teaser from the takes in ./out/teaser: each shot's data and
// page, and (only when asked for by name) film.html. `all` also copies the
// takes into the teaser's assets.
//   node teaser-build.mjs pages | film | all
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
const TAKES = join(HERE, 'out', 'teaser')
const FILM = new URL('../teaser', import.meta.url).pathname
const ONLY = process.argv[2] ?? 'pages'

/**
 * Three shots: one rule added to the skill, then the launch post and the client
 * email each written before and after it, their diffs built up word by word. Between two shots the window holds still: the
 * lifted part sinks back, the screen erases, the sidebar's highlight moves on,
 * and the next screen draws in (kit.js). The last shot hands back to the first,
 * so the film loops without a seam.
 */
const INTRO = 0.55
const OUTRO = 0.8
const round = (n) => Math.round(n * 10000) / 10000
const at = round

/** Boxes are in the app's 1200 × 750. remap: [seconds into the shot, seconds into the take]. */
/** How each diff builds: lines rise in turn, then strikes and marks are drawn along each line. */
const BUILD = { on: -0.3, start: 0.45, step: 0.16, rise: 0.35, mark: 0.25, across: 0.4, ground: '#101116', bottom: 750 }

const SHOTS = [
  {
    name: 'write',
    length: 3.4,
    // Only the rules: the new one is typed in as rule 06, then ringed and held.
    remap: [[0, 0.55], [0.4, 0.95], [2.2, 3.45], [3.4, 4.3]],
    focus: [{ x: 500, y: 350, w: 690, h: 300 }],
    notes: `<div class="ring" data-x="506" data-y="610" data-w="345" data-h="30" data-in="2.25" data-out="9"></div>`,
  },
  {
    name: 'compare',
    length: 3.9,
    // The launch post, v0 against v1, built up word by word and held. The A and B labels stay in frame.
    remap: [[0, 0.3], [3.9, 4.2]],
    focus: [{ x: 240, y: 55, w: 950, h: 455 }],
    diff: BUILD,
    cursor: false,
    notes: `<div class="pill" data-dir="right" data-x="570" data-y="389" data-in="2.55" data-out="9">Sharper</div>`,
  },
  {
    name: 'compare-email',
    length: 3.9,
    // The client email, the same way: its greeting and sign-off are where the new rule shows.
    remap: [[0, 0.3], [3.9, 4.2]],
    focus: [{ x: 240, y: 55, w: 950, h: 505 }],
    diff: BUILD,
    // Its captured box stops at the longest line; the panel is as wide as the post's.
    diffBox: { x: 262, w: 908, h: 284 },
    cursor: false,
    notes: `<div class="pill" data-dir="right" data-x="390" data-y="290" data-in="2.2" data-out="9">Too casual</div>`,
  },
]

/** The sidebar every shot shares, traced from the first: its shapes, and each nav item's label as a bar. */
const plans = Object.fromEntries(SHOTS.map((f) => [f.name, JSON.parse(readFileSync(join(TAKES, `${f.name}.plan.json`), 'utf8'))]))
const first = plans[SHOTS[0].name]
const SIDE = 230
const labels = {}
for (const [name, row] of Object.entries(first.nav)) {
  if (row.h > 40) continue // the skill picker, not a nav item
  for (const plan of Object.values(plans)) {
    const bar = plan.blocks.find((b) => b[0] >= 30 && b[0] < 60 && b[5] !== 'icon' && Math.abs(b[1] + b[3] / 2 - row.y) < 6)
    if (bar) {
      labels[name] = bar
      break
    }
  }
}
const font = first.active.font
const sidebar = {
  blocks: first.blocks.filter((b) => b[0] < SIDE && !(b[0] >= 30 && b[0] < 60 && b[5] !== 'icon' && Object.values(first.nav).some((r) => r.h <= 40 && Math.abs(b[1] + b[3] / 2 - r.y) < 6))),
  labels,
  nav: first.nav,
  active: { x: first.active.x, h: first.active.h, size: parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 13), weight: /^(\d{3})/.exec(font)?.[1] ?? 500 },
}

const clips = []
let clock = 0
for (const [index, f] of SHOTS.entries()) {
  if (ONLY === 'all') copyFileSync(join(TAKES, `${f.name}.mp4`), join(FILM, 'assets', `${f.name}.mp4`))
  const raw = JSON.parse(readFileSync(join(TAKES, `${f.name}.json`), 'utf8'))
  const traced = plans[f.name]
  const remap = f.remap.map(([a, b]) => [at(a), b])
  for (let i = 1; i < remap.length; i += 1)
    if (remap[i][1] < remap[i - 1][1] || remap[i][0] < remap[i - 1][0]) throw new Error(`${f.name}: time runs back at ${i}`)
  if (remap.at(-1)[1] > raw.length) throw new Error(`${f.name}: the take is ${raw.length} s`)
  const events = raw.events
    .filter((e) => ['move', 'down', 'mark'].includes(e.kind))
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])))
  const focus = f.focus.map((x) => (x.t === undefined ? x : { ...x, t: at(x.t), dur: at(x.dur) }))
  const prev = SHOTS[(index + SHOTS.length - 1) % SHOTS.length].name
  const data = { length: f.length, most: f.most, cursor: f.cursor, remap, focus, events, plan: { blocks: traced.blocks }, sidebar, from: plans[prev].active.name, to: traced.active.name }
  if (f.lift) data.lift = JSON.parse(readFileSync(join(TAKES, `${f.name}.lift.json`), 'utf8'))
  if (f.diff) {
    const diff = JSON.parse(readFileSync(join(TAKES, `${f.name}.diff.json`), 'utf8'))
    // Only green is added text (green type, or a green fill: oklab with a negative a);
    // a run inside some other filled box is shared text.
    const green = (p) => / 150\)/.test(p.color) || /oklab\([\d.]+ -/.test(p.bg ?? '')
    for (const p of diff.pieces) if (p.kind === 'ins' && !green(p)) p.kind = 'same'
    data.diff = f.diffBox ? { ...diff, box: { ...diff.box, ...f.diffBox } } : diff
    const { ground, bottom, ...times } = f.diff
    data.diffAt = { ground, bottom, ...Object.fromEntries(Object.entries(times).map(([k, v]) => [k, at(v)])) }
  }
  writeFileSync(
    join(FILM, 'shots', `${f.name}.js`),
    `// The ${f.name} shot. remap: [seconds into the shot, seconds into assets/${f.name}.mp4].
// focus: the part of the app lifted off the plan, in the app's 1200 × 750, and when it changes.
// events: where the pointer went, in take time. plan: the screen traced as shapes when it was filmed.
// sidebar: the window's sidebar, the same in every shot; from, to: the nav items its highlight moves between.
export default ${JSON.stringify(data)}\n`,
  )
  const notes = (f.notes ?? '').replace(/data-in="([\d.]+)"/g, (_, v) => `data-in="${at(+v)}"`)
  writeFileSync(
    join(FILM, `${f.name}.html`),
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="kit.css">
</head>
<body>
<div class="stage">
${notes ? `${notes}\n` : ''}</div>
<script type="module">
import { shot } from './kit.js'
import data from './shots/${f.name}.js'

window.film = shot({ data, video: 'assets/${f.name}.mp4', intro: ${INTRO}, outro: ${OUTRO} })
</script>
</body>
</html>
`,
  )
  const length = INTRO + f.length + OUTRO
  clips.push({ id: f.name, at: round(clock), length: round(length) })
  clock += length
}

const TOTAL = round(clock)
// film.html is Studio's too once it exists: it is written only when asked for by name.
if (ONLY === 'film' || ONLY === 'all')
  writeFileSync(
    join(FILM, 'film.html'),
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920, height=1280">
</head>
<body>
<section>
${clips.map((c) => `  <iframe id="shot-${c.id}" src="${c.id}.html#t=0,${c.length}"${c.at ? ` at="${c.at}"` : ''}></iframe>`).join('\n')}
</section>
<section>
  <iframe id="ground" src="stage.html#t=0,${TOTAL}"></iframe>
</section>
</body>
</html>
`,
  )
console.log({ TOTAL, clips, labels: Object.keys(labels) })
