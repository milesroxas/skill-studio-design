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
 * 120 BPM. A 4 s opening; five features, each a 4 s bumper then its shot; the
 * close. A feature's block is 9 s unless it says otherwise. Every change of
 * scene is a cut under the full lime wipe.
 */
const OPENING = 4
const CLOSING = 6 // From the close's lime fully up to the film's end.
const BUMP = 4 // A bumper's share of its block; the shot is cut in here.
const WIPE = { up: 0.4, off: 0.1, go: 0.4 }
const EDGE = 0.05 // Scenes overlap this much either side of a cut, under the full sheet.
const LEAD = WIPE.off + WIPE.go + EDGE // A shot's own zero comes once the wipe is off it,
const shotOf = (f) => (f.block ?? 9) - BUMP - LEAD - 0.25 // and it runs this long before the next wipe covers it.

/**
 * The five features, in the order of the app's loop (write, run, compare): what
 * the bumper says, and what the shot shows. A focus entry names a box the
 * recorder measured on the screen as it was at that moment (record.ts frame()),
 * grown so no line of text or control is cut; `t` is when the camera moves to
 * it, in shot time, and `cut` swaps rather than slides. A slide between boxes of
 * different shapes crops lines on its way, so a change of shape is a cut.
 */
const FEATURES = [
  {
    name: 'write',
    block: 11,
    head: [{ text: 'WRITE BETTER SKILLS.', tones: [[6, 12, 'key']] }],
    why: 'AI TOOLS THAT SHARPEN EVERY RULE.',
    // It opens on the three rewrites Suggest changes gave for the selected rule;
    // Best practice is picked (down2), and the camera moves down onto the editor,
    // where the old rule gives way to the new one (kit.js swapUp), then holds.
    // Footage times are tied to the press, so a re-film keeps the pacing. Right
    // after the press the app shows the checks popout again for a frame as it
    // closes, and the caret blinks at the rule's end: the footage jumps to a
    // clean frame and holds it.
    remap: [[0, 'down2-2.3'], [2.3, 'down2'], [2.36, 'down2+0.06'], [2.38, 'down2+0.7'], [6.2, 'down2+0.7']],
    focus: [{ box: 'rewrites' }, { t: 2.55, dur: 0.8, box: 'better' }],
    // ground: the editor's fill as the film draws the footage, read off an unencoded frame (look).
    swap: { on: 2.37, start: 3.55, ground: 'rgb(13, 15, 19)' },
    cursorOut: [2.45, 2.75],
    notes: '',
  },
  {
    name: 'run',
    head: [{ text: 'RUN REAL AGENTS.', tones: [[9, 16, 'key']] }],
    why: 'CLAUDE CODE AND CURSOR DO THE WORK.',
    // Run opens its panel; the run is named, keys 1:1, and started. Then the
    // new version joins the list under the files.
    // The wait for the run is quickened, so v2 joins the list on camera, then holds.
    // down0 Run, down1 the name field, down2 Start a run.
    remap: [[0, 'down0-0.4'], [0.5, 'down0+0.1'], [0.8, 'down1-0.15'], [2.1, 'down1+1.15'], [2.4, 'down2-0.17'], [2.7, 'down2+0.13'], [3.3, 'down2+1.73'], [4.2, 'down2+2.73']],
    focus: [{ box: 'panel' }, { t: 2.65, dur: 0.45, cut: true, box: 'versions' }],
    notes: '',
  },
  {
    name: 'results',
    head: [{ text: 'DID THE EDIT HELP?', tones: [[13, 18, 'key']] }],
    why: 'EVERY VERSION ON ONE SCALE.',
    // The lift builds up (kit.js), then the list of runs; a run opens and the camera moves down to it.
    remap: [[0, 0], [1.5, 1.15], [1.95, 1.6], [2.5, 'down0+0.18'], [4.2, 'down0+1.88']],
    focus: [{ box: 'lift' }, { t: 1.5, dur: 0.45, cut: true, box: 'rows' }, { t: 2.62, dur: 0.6, box: 'open' }],
    // The camera frames what the figure draws, `pad` all round (liftBox), not the
    // figure's full column: the ribbon stops well short of its right edge.
    // ground: the page's fill as the film draws the footage, read off an unencoded frame (look).
    lift: { pad: 32, ground: 'rgb(13, 15, 19)' },
    // The lift is wide and the runs under it fill their column: both rest dead centre.
    pull: 0,
    // The pointer has nothing to do over the lift: it comes in as the camera cuts to the runs.
    cursorIn: [1.75, 1.95],
    notes: '',
  },
  {
    name: 'compare',
    head: [{ text: 'SEE WHAT STAYED.', tones: [[9, 16, 'dim']] }, { text: 'SEE WHAT CHANGED.', tones: [[9, 17, 'key']] }],
    why: 'V0 AGAINST V1, WORD FOR WORD.',
    // Word diff is pressed: the panel empties at once and the diff is set into it
    // line by line (kit.js), as the camera moves down onto the panel.
    remap: [[0, 'down0-0.48'], [0.5, 'down0+0.02'], [0.54, 'down0+0.27'], [4.2, 'down0+2.12']],
    focus: [{ box: 'head' }, { t: 0.6, dur: 0.6, box: 'diff' }],
    diff: { on: 0.52, start: 0.72, step: 0.2, rise: 0.36, mark: 0.22, across: 0.3 },
    notes: '',
  },
  {
    name: 'pick',
    head: [{ text: 'JEV CHECKS. YOU ?????', tones: [[16, 21, 'dim']] }, { text: 'JEV CHECKS. YOU PICK.', tones: [[16, 21, 'key']] }],
    why: 'YOUR PICK IS THE LAST WORD.',
    // A rule Jev called missed is marked met, and A's score follows; then B is picked.
    // down0 Mark as met, down1 B is better.
    remap: [[0, 'down0-0.5'], [1.7, 'down0+1.2'], [2.2, 'down1-0.1'], [4.2, 'down1+1.4']],
    focus: [{ box: 'cards' }, { t: 1.75, dur: 0.4, cut: true, box: 'bar' }],
    notes: '',
  },
]

/** Where each block starts, where the close's lime is fully up, and the film's length. */
const BLOCKS = FEATURES.map((_, i) => OPENING + FEATURES.slice(0, i).reduce((sum, f) => sum + (f.block ?? 9), 0))
const END = BLOCKS.at(-1) + (FEATURES.at(-1).block ?? 9)
const TOTAL = END + CLOSING
const CLOSE_AT = END - WIPE.up

/** The cuts the wipe layer makes. The opening and the close make their own. */
const CUTS = BLOCKS.flatMap((b, i) => (i ? [b, b + BUMP] : [b + BUMP]))

/**
 * A shot's focus with its named boxes filled in: an entry `{ box: 'name' }`
 * takes the box the recorder measured under that name, already grown so no
 * line of text or control crosses its edge.
 */
function focusOf(f, events) {
  return f.focus.map(({ box, ...entry }) => {
    if (!box) return entry
    const found = events.filter((e) => e.kind === 'box' && e.name === box).at(-1)
    if (!found) throw new Error(`${f.name}: no box named ${box} in the footage`)
    const { x, y, w, h } = found
    return { ...entry, x: round(x), y: round(y), w: round(w), h: round(h) }
  })
}

/**
 * The box round what the version lift draws: its words, and the ribbon down to
 * the dashed line of the run without the skill, the lowest thing in it. The
 * ribbon's own box runs on past that line, and the figure's column past the
 * ribbon, so neither frames it evenly. `pad` is the margin on every side.
 */
function liftBox(lift, pad) {
  const r = lift.ribbon
  const floors = [...lift.svg.html.matchAll(/<line [^>]*y1="([\d.]+)"/g)].map((m) => lift.svg.y + Number(m[1]))
  const x0 = Math.min(r.x, ...lift.texts.map((t) => t.x))
  const y0 = Math.min(r.y, ...lift.texts.map((t) => t.y))
  const x1 = Math.max(r.x + r.w, ...lift.texts.map((t) => t.x + t.w))
  const y1 = Math.max(...(floors.length ? floors : [r.y + r.h]), ...lift.texts.map((t) => t.y + t.h))
  return { x: round(x0 - pad), y: round(y0 - pad), w: round(x1 - x0 + pad * 2), h: round(y1 - y0 + pad * 2) }
}

/**
 * A footage time in a remap: a number, or a press it is tied to, such as
 * 'down1+0.35' (0.35 s after the second press), so pacing survives a re-film.
 */
function footageAt(at, events) {
  if (typeof at === 'number') return at
  const m = /^(down|up)(\d+)([+-][\d.]+)?$/.exec(at)
  if (!m) throw new Error(`Not a footage time: ${at}`)
  const hit = events.filter((e) => e.kind === m[1])[Number(m[2])]
  if (!hit) throw new Error(`No ${m[1]} number ${m[2]} in the footage`)
  return round(hit.t + Number(m[3] ?? 0))
}

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
  const remap = f.remap.map(([u, at]) => [u, footageAt(at, raw.events)])
  for (let i = 1; i < remap.length; i += 1)
    if (remap[i][1] < remap[i - 1][1] || remap[i][0] < remap[i - 1][0]) throw new Error(`${f.name}: time runs back at ${i}`)
  if (remap.at(-1)[1] > raw.length) throw new Error(`${f.name}: the footage is ${raw.length} s`)
  const events = raw.events
    .filter((e) => ['move', 'down', 'mark'].includes(e.kind))
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])))
  const SHOT = shotOf(f)
  const data = { length: SHOT, remap, focus: focusOf(f, raw.events), events, plan: traced }
  if (f.lift) {
    data.lift = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.lift.json`), 'utf8'))
    data.lift.ground = f.lift.ground
    const at = f.focus.findIndex((x) => x.box === 'lift')
    if (at >= 0) {
      data.lift.frame = liftBox(data.lift, f.lift.pad)
      data.focus[at] = { ...data.focus[at], ...data.lift.frame }
    }
    // The built-up figure goes when the footage is out of sight, mid way through the first cut.
    const cut = data.focus.find((x) => x.cut)
    if (cut) data.liftUntil = round(cut.t + cut.dur / 2)
  }
  if (f.swap) {
    const read = (n) => JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.${n}.json`), 'utf8'))
    const [was, now] = [read('old'), read('new')]
    if (!was?.pieces.length || !now?.pieces.length) throw new Error(`${f.name}: no rule traced`)
    data.swap = { old: was, new: now, ground: f.swap.ground }
    data.swapAt = { on: f.swap.on, start: f.swap.start }
    // The box was measured round the new rule. The old one stands there first and
    // can run a line longer: grow the box so it holds the old rule with the same margin.
    const foot = (pieces) => Math.max(...pieces.map((p) => p.y + p.h))
    for (const box of data.focus.filter((b) => b.t !== undefined && b.y < foot(now.pieces) && b.y + b.h > foot(now.pieces))) {
      const margin = box.y + box.h - foot(now.pieces)
      box.h = round(Math.max(box.h, foot(was.pieces) + margin - box.y))
    }
  }
  if (f.cursorIn) data.cursorIn = f.cursorIn
  if (f.cursorOut) data.cursorOut = f.cursorOut
  if (f.pull !== undefined) data.pull = f.pull
  if (f.diff) {
    const diff = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.diff.json`), 'utf8'))
    // Only a green fill marks added text (oklab with a negative a): a run inside some other filled box is shared text.
    for (const p of diff.pieces) if (p.kind === 'ins' && !/oklab\([\d.]+ -/.test(p.bg ?? '')) p.kind = 'same'
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
  const tail = (f.block ?? 9) - BUMP + EDGE * 2 - LEAD - SHOT
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
