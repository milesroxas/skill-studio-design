// Builds the reel: each feature's bumper page and shot page with its data, the
// cut list the lime wipe runs on, the sound stems, the music and (only when
// asked for by name) film.html. `all` also copies the filmed clips from ./out
// into the reel's assets.
//   node build.mjs pages | audio | film | all
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { music, sfx, writeWav } from './audio.mjs'
import { cues, plan } from '../reel/flap.js'
import { OPEN } from '../reel/open-board.js'

const HERE = new URL('.', import.meta.url).pathname
const FILM = new URL('../reel', import.meta.url).pathname
const ONLY = process.argv[2] ?? 'pages'
mkdirSync(join(FILM, 'assets'), { recursive: true })

/**
 * 120 BPM. A 4 s opening; five features of 9 s, each a 4 s bumper then a 5 s
 * shot; the close. Every change of scene is a cut under the full lime wipe.
 */
const TOTAL = 55
const BLOCKS = [4, 13, 22, 31, 40]
const BUMP = 4 // A bumper's share of its block; the shot is cut in here.
const END = 49 // The close's lime is fully up here.
const WIPE = { up: 0.4, off: 0.1, go: 0.4 }
const EDGE = 0.05 // Scenes overlap this much either side of a cut, under the full sheet.
const LEAD = WIPE.off + WIPE.go + EDGE // A shot's own zero comes once the wipe is off it,
const SHOT = 4.2 // and it runs this long before the next wipe covers it.
const CLOSE_AT = END - WIPE.up

/** The cuts the wipe layer makes. The opening and the close make their own. */
const CUTS = BLOCKS.flatMap((b, i) => (i ? [b, b + BUMP] : [b + BUMP]))

/** The five features: what the bumper says, and what the shot shows. Boxes are in the app's 1200 × 750. */
const FEATURES = [
  {
    name: 'write',
    head: [{ text: 'WRITE THE RULES.', tones: [[10, 16, 'key']] }],
    why: 'EACH ONE SAYS WHY.',
    // Typing runs 1:1, so each key's sound lands on its letter. After Save, the bar holds.
    remap: [[0, 0.95], [2.71, 3.66], [3.25, 4.5], [3.4, 4.65], [4.2, 5.45]],
    // The bar's box is centred on what is in it: SKILL.md at 516 to Save's last letter at 1153, the controls 56 to 88.
    focus: [{ x: 500, y: 200, w: 690, h: 372 }, { t: 2.75, dur: 0.45, cut: true, x: 496, y: 49.5, w: 677, h: 45 }],
    notes: '',
  },
  {
    name: 'run',
    head: [{ text: 'RUN REAL AGENTS.', tones: [[9, 16, 'key']] }],
    why: 'CLAUDE CODE AND CURSOR DO THE WORK.',
    remap: [[0, 0.4], [0.3, 0.7], [1.34, 1.74], [1.9, 2.42], [2.25, 2.71], [2.7, 3.1], [2.8, 4.3], [4.2, 6.4]],
    focus: [
      { x: 470, y: 64, w: 720, h: 118 },
      { t: 1.45, dur: 0.45, cut: true, x: 470, y: 672, w: 720, h: 76 },
      { t: 2.5, dur: 0.5, cut: true, x: 240, y: 578, w: 940, h: 172 },
    ],
    notes: '',
  },
  {
    name: 'results',
    head: [{ text: 'SCORE EVERY ANSWER.', tones: [[12, 19, 'key']] }],
    why: 'ONE SCALE, SO VERSIONS COMPARE.',
    // The lift builds up (kit.js), then the list of runs; a run opens and the camera moves in on it.
    remap: [[0, 0], [1.5, 1.15], [1.95, 1.6], [2.5, 2.45], [4.2, 4.15]],
    focus: [
      { x: 240, y: 62, w: 940, h: 150 },
      { t: 1.5, dur: 0.45, cut: true, x: 190, y: 236, w: 1000, h: 312 },
      { t: 2.62, dur: 0.6, x: 230, y: 464, w: 946, h: 268 },
    ],
    lift: true,
    notes: '',
  },
  {
    name: 'blind',
    head: [{ text: 'RATE IT ??????', tones: [[8, 14, 'dim']] }, { text: 'RATE IT BLIND.', tones: [[8, 14, 'key']] }],
    why: "YOUR CALL FIRST. THE JUDGE'S AFTER.",
    remap: [[0, 0.45], [2.4, 3.6], [4.2, 5.4]],
    // The output's head stops at its column's edge, 858: the box ends short of it.
    focus: [{ x: 866, y: 60, w: 330, h: 386 }, { t: 2.5, dur: 0.5, cut: true, x: 234, y: 38, w: 620, h: 160 }],
    notes: `<div class="ring" data-x="799" data-y="55" data-w="50" data-h="34" data-in="2.95" data-out="4.2"></div>
<div class="pill" data-dir="down" data-tail="236" data-x="824" data-y="92" data-in="3.05" data-out="4.2">The judge said <b>71</b></div>`,
  },
  {
    name: 'compare',
    head: [{ text: 'SEE WHAT STAYED.', tones: [[9, 16, 'dim']] }, { text: 'SEE WHAT CHANGED.', tones: [[9, 17, 'key']] }],
    why: 'V0 AGAINST V1, WORD FOR WORD.',
    // Word diff is pressed: the panel empties at once and the diff is set into it
    // line by line (kit.js). The camera holds still, so the panel keeps its size.
    remap: [[0, 0.3], [0.5, 0.8], [0.54, 1.05], [4.2, 2.3]],
    focus: [{ x: 240, y: 66, w: 940, h: 560 }],
    diff: { on: 0.52, start: 0.72, step: 0.2, rise: 0.36, mark: 0.22, across: 0.3 },
    notes: '',
  },
]

const filmTime = (remap, tau) => {
  for (let i = 1; i < remap.length; i += 1) {
    const [a, va] = remap[i - 1]
    const [b, vb] = remap[i]
    if (tau <= vb) return vb === va ? a : a + ((b - a) * (tau - va)) / (vb - va)
  }
  return remap.at(-1)[0]
}

const round = (n) => Math.round(n * 10000) / 10000

/** Where a bumper's board stands, and the rows it shows, in the bumper's own time. */
const BOARD = { x: 150, y: 400 }
const BUMP_LEN = BUMP + EDGE * 2
function boardOf(f, index) {
  const at = EDGE + 0.35 // once the wipe's going edge has cleared the board
  const head = [{ at: at + 0.04, ...f.head[0], stagger: 0.026, spin: 6 }]
  if (f.head[1]) head.push({ at: at + 0.75, ...f.head[1], stagger: 0.03, spin: 8 })
  return [
    { cols: 5, size: 's', events: [{ at, text: `0${index + 1}/0${FEATURES.length}`, stagger: 0.02, spin: 4 }] },
    { cols: Math.max(...f.head.map((h) => h.text.length)), size: 'l', space: 24, events: head },
    { cols: f.why.length, size: 's', space: 28, events: [{ at: at + (f.head[1] ? 0.95 : 0.4), text: f.why, stagger: 0.009, spin: 5 }] },
  ]
}

function bumperOf(f, index) {
  const rows = boardOf(f, index)
  const seed = 101 + index
  const hits = cues(rows, plan(rows, seed), BOARD.x)
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="kit.css">
</head>
<body>
<div class="stage">
  <div class="bump">
    <div class="board" style="left: ${BOARD.x}px; top: ${BOARD.y}px"></div>
  </div>
</div>
<script type="module">
import { bumper } from './bumper.js'

const rows = ${JSON.stringify(rows)}
window.film = bumper({ duration: ${round(BUMP_LEN)}, seed: ${seed}, rows })
</script>
</body>
</html>
`
  return { html, hits }
}

writeFileSync(
  join(FILM, 'wipes.js'),
  `// The film's one transition. A wipe at a cut c: the lime comes up over [c - up, c],
// holds for \`off\`, and goes up off the frame over the next \`go\` seconds. Written by the build.
export const WIPE = ${JSON.stringify(WIPE)}
export const CUTS = ${JSON.stringify(CUTS)}
`,
)

const clips = { bumpers: [], shots: [] }
for (const [index, f] of FEATURES.entries()) {
  const block = BLOCKS[index]

  // The bumper.
  const bump = bumperOf(f, index)
  writeFileSync(join(FILM, `bump-${f.name}.html`), bump.html)
  clips.bumpers.push({ id: `bump-${f.name}`, at: block - EDGE, length: BUMP_LEN })
  if (ONLY === 'all' || ONLY === 'audio') writeWav(join(FILM, 'assets', `sfx-bump-${f.name}.wav`), sfx(bump.hits, BUMP_LEN, 20 + index))

  // The shot.
  if (ONLY === 'all') copyFileSync(join(HERE, 'out', `${f.name}.mp4`), join(FILM, 'assets', `${f.name}.mp4`))
  const raw = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.json`), 'utf8'))
  const traced = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.plan.json`), 'utf8'))
  const remap = f.remap
  for (let i = 1; i < remap.length; i += 1)
    if (remap[i][1] < remap[i - 1][1] || remap[i][0] < remap[i - 1][0]) throw new Error(`${f.name}: time runs back at ${i}`)
  if (remap.at(-1)[1] > raw.length) throw new Error(`${f.name}: the footage is ${raw.length} s`)
  const events = raw.events
    .filter((e) => ['move', 'down', 'mark'].includes(e.kind))
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])))
  const data = { length: SHOT, remap, focus: f.focus, events, plan: traced }
  if (f.lift) data.lift = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.lift.json`), 'utf8'))
  if (f.diff) {
    const diff = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.diff.json`), 'utf8'))
    // Only green text is added text: a run inside some other filled box is shared text.
    for (const p of diff.pieces) if (p.kind === 'ins' && !/ 150\)/.test(p.color)) p.kind = 'same'
    data.diff = diff
    data.diffAt = f.diff
  }
  writeFileSync(
    join(FILM, 'shots', `${f.name}.js`),
    `// The ${f.name} shot. remap: [seconds into the shot, seconds into assets/${f.name}.mp4].
// focus: the part of the app lifted off the plan, in the app's 1200 × 750, and when it changes.
// events: where the pointer went, in footage time. plan: the screen traced as shapes when it was filmed.
export default ${JSON.stringify(data)}\n`,
  )
  // It ends just past the next cut, under the full sheet.
  const tail = 9 - BUMP + EDGE * 2 - LEAD - SHOT
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
${f.notes ? `${f.notes}\n` : ''}</div>
<script type="module">
import { shot } from './kit.js'
import data from './shots/${f.name}.js'

window.film = shot({ data, video: 'assets/${f.name}.mp4', lead: ${round(LEAD)}, tail: ${round(tail)} })
</script>
</body>
</html>
`,
  )
  const length = LEAD + SHOT + tail
  clips.shots.push({ id: f.name, at: block + BUMP - EDGE, length })

  // The shot's sounds, in its own time: each press, release and key, a frame after
  // the input, when the footage shows it.
  const hits = []
  for (const e of raw.events) {
    if (e.t < remap[0][1] || e.t > remap.at(-1)[1]) continue
    const t = LEAD + filmTime(remap, e.t) + 0.02
    if (e.kind === 'down') hits.push({ t, kind: 'press' })
    if (e.kind === 'up') hits.push({ t, kind: 'release' })
    if (e.kind === 'key') hits.push({ t, kind: 'keydown', ch: e.ch })
  }
  if ((ONLY === 'all' || ONLY === 'audio') && hits.length) writeWav(join(FILM, 'assets', `sfx-${f.name}.wav`), sfx(hits, LEAD + SHOT + 0.3, index))
}

if (ONLY === 'all' || ONLY === 'audio') {
  writeWav(join(FILM, 'assets', 'sfx-open.wav'), sfx(cues(OPEN.rows, plan(OPEN.rows, OPEN.seed), OPEN.x), 3.6, 9))
  writeWav(join(FILM, 'assets', 'music.wav'), music({ total: TOTAL, blocks: BLOCKS, end: END }))
}

// film.html is Studio's too once it exists: it is written only when asked for by name.
const clip = (c) => `  <iframe id="${c.id}" src="${c.id}.html#t=0,${round(c.length)}" at="${round(c.at)}"></iframe>`
const sound = (id, atTime, volume) => `  <audio id="${id}" src="assets/${id}.wav"${atTime ? ` at="${round(atTime)}"` : ''} volume="${volume}"></audio>`
if (ONLY === 'film')
  writeFileSync(
    join(FILM, 'film.html'),
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920, height=1080">
</head>
<body>
<section>
  <iframe id="wipes" src="wipes.html#t=0,${round(CUTS.at(-1) + WIPE.off + WIPE.go + 0.1)}"></iframe>
</section>
<section>
  <iframe id="open" src="open.html#t=0,${round(BLOCKS[0] + WIPE.off + WIPE.go + EDGE)}"></iframe>
  <iframe id="close" src="close.html#t=0,${round(TOTAL - CLOSE_AT)}" at="${round(CLOSE_AT)}"></iframe>
</section>
<section>
${clips.bumpers.map(clip).join('\n')}
</section>
<section>
${clips.shots.map(clip).join('\n')}
</section>
<section>
  <iframe id="stage" src="stage.html#t=0,${TOTAL}"></iframe>
</section>
<section>
${sound('sfx-open', 0, 0.62)}
${FEATURES.map((f, i) => sound(`sfx-bump-${f.name}`, BLOCKS[i] - EDGE, 0.62)).join('\n')}
</section>
<section>
${FEATURES.map((f, i) => sound(`sfx-${f.name}`, BLOCKS[i] + BUMP - EDGE, 0.55)).join('\n')}
</section>
<section>
  <audio id="music" src="assets/music.wav" volume="0.74"></audio>
</section>
</body>
</html>
`,
  )
console.log([...clips.bumpers, ...clips.shots].sort((a, b) => a.at - b.at).map((c) => `${c.id} ${round(c.at)}–${round(c.at + c.length)}`).join('\n'), `\ncuts ${CUTS.join(' ')}; close at ${CLOSE_AT}, film ${TOTAL}s`)
