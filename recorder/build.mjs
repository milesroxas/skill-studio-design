// Builds the reel: each chapter's bumper page and its beats' pages with their data, the
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
 * 120 BPM. A 4 s opening; four chapters, each a 4 s bumper then its beats cut
 * end to end; the close. Every change of chapter is a cut under the full lime
 * wipe; the beats inside a chapter cut straight from one to the next.
 */
const OPENING = 4
const CLOSING = 6 // From the close's lime fully up to the film's end.
const BUMP = 4 // A bumper's share of its block; the first beat is cut in here.
const WIPE = { up: 0.4, off: 0.1, go: 0.4 }
const EDGE = 0.05 // Scenes overlap this much either side of a cut, under the full sheet.
const LEAD = WIPE.off + WIPE.go + EDGE // A chapter's first beat starts once the wipe is off it,
const BEATS = (c) => c.block - BUMP - LEAD - 0.25 // and its beats run this long before the next wipe covers them.
const GROUND = 'rgb(13, 15, 19)' // The app's fill as the film draws the footage, read off an unencoded frame (look).

/**
 * The four chapters, as a skill is worked on: find it, sharpen it, test it,
 * see what changed. Each has a bumper (what it says) and beats (what it
 * shows), one filmed take each (record.ts). A beat's `len` is its film
 * seconds and `screen` the skeleton the window draws round it (kit.js). Its
 * part is one box for the whole beat, so nothing on screen changes size: the
 * union of the boxes the recorder measured under the names in `focus` (each
 * grown so no line of text or control is cut, record.ts frame()), or a box
 * given by hand (x, y, w, h). Remap footage times are tied to presses where
 * they can be ('down1+0.35'), so a re-film keeps the pacing.
 */
const CHAPTERS = [
  {
    name: 'library',
    block: 15,
    head: [{ text: 'FIND ANY SKILL.', tones: [[9, 15, 'key']] }],
    why: 'FIND ONE, START ONE, OR PICK ONE BACK UP.',
    beats: [
      // The library; the search narrows it as "release" is typed.
      { name: 'find', screen: 'library', len: 3.2, remap: [[0, 'down0-0.55'], [0.55, 'down0'], [1.35, 'down0+0.8'], [3.2, 'down0+2.05']], focus: ['part'] },
      // New skill opens its form; a name is typed and a template picked.
      {
        name: 'create',
        screen: 'library',
        len: 3.6,
        // It ends as the template's description settles, with no hold after the pick.
        remap: [[0, 'down0-0.45'], [0.45, 'down0'], [0.75, 'down0+0.3'], [0.8, 'down0+0.85'], [2.6, 'down1-0.15'], [3.0, 'down1+0.25'], [3.6, 'down1+0.85']],
        focus: ['part'],
      },
      // In progress: the skills being worked on. One is picked back up.
      // Framed as the search beat is (record.ts), so the library holds still across the cut. Its
      // part box is measured after the click, on the editor it opens, so the library box stands in.
      // The list is read, release-notes is hovered and clicked; the app opens the editor
      // a tenth of a second later, so the footage holds on the click and the wipe takes it there.
      { name: 'resume', screen: 'library', len: 3.4, remap: [[0, 0], [2.6, 'down0'], [2.65, 'down0+0.05'], [3.4, 'down0+0.05']], focus: ['library'] },
    ],
  },
  {
    name: 'editor',
    block: 17,
    head: [{ text: 'SHARPEN EVERY RULE.', tones: [[14, 19, 'key']] }],
    why: 'WRITING CHECKS, AN ASSISTANT AND REWRITES.',
    beats: [
      // The checks underline a hedge in rule 07; the pointer rests on it and the note says why.
      { name: 'lint', screen: 'editor', len: 2.4, remap: [[0, 0.6], [2.4, 3.0]], focus: ['part'] },
      // The assistant, asked which rules are vague, names rule 07 and offers a case; it is added.
      // Its panel is the window's right column: framed by hand from its head down past the starters.
      {
        name: 'chat',
        screen: 'chat',
        len: 3.8,
        remap: [[0, 'down0+0.9'], [0.6, 'down1'], [1.8, 'down1+1.5'], [2.3, 'down2-0.15'], [2.55, 'down2+0.1'], [3.8, 'down2+1.35']],
        focus: [{ x: 840, y: 0, w: 360, h: 456 }],
      },
      // Rule 07's number selects it; Suggest changes gives three rewrites; Best practice
      // takes its place (down2), and the camera moves down onto the editor, where the old
      // rule gives way to the new one (kit.js swapUp). Right after the press the app shows
      // the popout again for a frame as it closes: the footage jumps to a clean frame.
      {
        name: 'suggest',
        screen: 'editor',
        len: 6.0,
        remap: [[0, 'down0-0.3'], [0.3, 'down0'], [1.2, 'down0+1.15'], [1.45, 'down1-0.05'], [1.6, 'down1+0.85'], [2.9, 'down2'], [2.96, 'down2+0.06'], [2.98, 'down2+0.7'], [6.0, 'down2+0.7']],
        focus: ['part'],
        swap: { on: 2.97, start: 4.0 },
        cursorOut: [3.0, 3.3],
      },
    ],
  },
  {
    name: 'cases',
    block: 15,
    head: [{ text: 'TEST EVERY VERSION.', tones: [[5, 19, 'key']] }],
    why: 'WRITE A CASE ONCE. RUN IT ON EVERY EDIT.',
    beats: [
      // A case is added: its prompt and title typed (quickened), then it joins the list.
      {
        name: 'case',
        screen: 'cases',
        len: 6.0,
        remap: [[0, 'down0-0.6'], [0.6, 'down0'], [1.0, 'down1-0.2'], [1.2, 'down1+0.05'], [2.4, 'down1+2.4'], [2.8, 'down2'], [3.45, 'down2+1.0'], [3.9, 'down3'], [4.25, 'down3+0.35'], [6.0, 'down3+2.2']],
        // The form moves up a row once the case is saved, so no one measured moment
        // holds both layouts: 500 falls clear of every line in each (read off the takes).
        focus: [{ x: 224, y: 40, w: 968, h: 460 }],
      },
      // Run opens its panel on every case; the run is named and started, and v2 joins
      // the versions. down0 Run, down1 the name field, down2 Start.
      {
        name: 'run',
        screen: 'editor',
        len: 4.2,
        remap: [[0, 'down0-0.4'], [0.5, 'down0+0.1'], [0.8, 'down1-0.15'], [2.1, 'down1+1.15'], [2.4, 'down2-0.17'], [2.7, 'down2+0.13'], [3.3, 'down2+1.73'], [4.2, 'down2+2.73']],
        focus: ['part'],
      },
    ],
  },
  {
    name: 'results',
    block: 16,
    head: [{ text: 'DID THE EDIT HELP?', tones: [[13, 18, 'key']] }],
    why: 'PAGES, WORDS AND SCORES, V0 AGAINST V1.',
    beats: [
      // The pricing page v0 drew, then v1's, flipped in one frame: B, back to A, B.
      {
        name: 'design',
        screen: 'results',
        len: 4.0,
        remap: [[0, 0.8], [0.8, 'down0'], [2.0, 'down0+1.2'], [2.25, 'down1'], [2.7, 'down1+0.45'], [2.95, 'down2'], [4.0, 'down2+1.05']],
        focus: ['part'],
      },
      // Word diff is pressed: the panel empties and the diff is set into it line by line
      // (kit.js), as the camera moves down onto it.
      {
        name: 'diff',
        screen: 'results',
        len: 3.8,
        remap: [[0, 'down0-0.48'], [0.5, 'down0+0.02'], [0.54, 'down0+0.27'], [3.8, 'down0+2.12']],
        focus: ['part'],
        diff: { on: 0.52, start: 0.72, step: 0.2, rise: 0.36, mark: 0.22, across: 0.3 },
      },
      // The version lift builds up (kit.js) and holds: the film's last word before the close.
      // The camera frames what the figure draws, `pad` all round (liftBox); the pointer has nothing to do.
      { name: 'lift', screen: 'overview', len: 3.4, remap: [[0, 0], [3.4, 2.9]], focus: ['lift'], lift: { pad: 32 }, cursorIn: [99, 100] },
    ],
  },
]
for (const c of CHAPTERS) {
  const sum = c.beats.reduce((n, b) => n + b.len, 0)
  if (Math.abs(sum - BEATS(c)) > 1e-6) throw new Error(`${c.name}: its beats run ${sum.toFixed(2)} s, its block holds ${BEATS(c).toFixed(2)} s`)
}

/** Where each block starts, where the close's lime is fully up, and the film's length. */
const BLOCKS = CHAPTERS.map((_, i) => OPENING + CHAPTERS.slice(0, i).reduce((sum, c) => sum + c.block, 0))
const END = BLOCKS.at(-1) + CHAPTERS.at(-1).block
const TOTAL = END + CLOSING
const CLOSE_AT = END - WIPE.up

/** The cuts the wipe layer makes. The opening and the close make their own. */
const CUTS = BLOCKS.flatMap((b, i) => (i ? [b, b + BUMP] : [b + BUMP]))

/**
 * A beat's part: one box, the union of the boxes the recorder measured under
 * the names its focus lists (the last of each name), or the box it gives by hand.
 */
function focusOf(f, events) {
  const boxes = f.focus.map((entry) => {
    if (typeof entry !== 'string') return entry
    const found = events.filter((e) => e.kind === 'box' && e.name === entry).at(-1)
    if (!found) throw new Error(`${f.name}: no box named ${entry} in the footage`)
    return found
  })
  const x0 = Math.min(...boxes.map((b) => b.x))
  const y0 = Math.min(...boxes.map((b) => b.y))
  const x1 = Math.max(...boxes.map((b) => b.x + b.w))
  const y1 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: round(x0), y: round(y0), w: round(x1 - x0), h: round(y1 - y0) }
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
    { cols: 5, size: 's', events: [{ at, text: `0${index + 1}/0${CHAPTERS.length}`, stagger: 0.02, spin: 4 }] },
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
let seed = 0
for (const [index, c] of CHAPTERS.entries()) {
  const block = BLOCKS[index]

  // The bumper.
  const bump = bumperOf(c, index)
  writeFileSync(join(FILM, `bump-${c.name}.html`), bump.html)
  clips.bumpers.push({ id: `bump-${c.name}`, at: block - EDGE, length: BUMP_LEN })
  if (ONLY === 'all' || ONLY === 'audio') writeWav(join(FILM, 'assets', `sfx-bump-${c.name}.wav`), sfx(bump.hits, BUMP_LEN, 20 + index))

  // The beats, end to end: the first comes in under the bumper's wipe, the last
  // runs on under the next one, and between them each cuts straight to the next.
  let at = block + BUMP - EDGE
  for (const [k, f] of c.beats.entries()) {
    const first = k === 0
    const last = k === c.beats.length - 1
    const lead = first ? LEAD : 0
    // The last ends just past the next cut, under the full sheet.
    const tail = last ? EDGE * 2 + 0.25 : 0
    if (ONLY === 'all') copyFileSync(join(HERE, 'out', `${f.name}.mp4`), join(FILM, 'assets', `${f.name}.mp4`))
    const raw = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.json`), 'utf8'))
    const remap = f.remap.map(([u, t]) => [u, footageAt(t, raw.events)])
    for (let i = 1; i < remap.length; i += 1)
      if (remap[i][1] < remap[i - 1][1] || remap[i][0] < remap[i - 1][0]) throw new Error(`${f.name}: time runs back at ${i}`)
    if (remap.at(-1)[1] > raw.length) throw new Error(`${f.name}: the footage is ${raw.length} s`)
    if (Math.abs(remap.at(-1)[0] - f.len) > 1e-6) throw new Error(`${f.name}: its remap ends at ${remap.at(-1)[0]}, not ${f.len}`)
    const events = raw.events
      .filter((e) => ['move', 'down', 'mark'].includes(e.kind))
      .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).map(([key, v]) => [key, typeof v === 'number' ? round(v) : v])))
    const prev = c.beats[k - 1]
    const next = c.beats[k + 1]
    const data = { length: f.len, screen: f.screen, remap, focus: focusOf(f, raw.events), events }
    // A beat with another after it in its chapter goes before the cut; what the
    // next screen draws differently fades out and back in across it.
    if (next) data.exit = true
    if (prev && prev.screen !== f.screen) data.fadeIn = true
    if (next && next.screen !== f.screen) data.fadeOut = true
    if (f.lift) {
      data.lift = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.lift.json`), 'utf8'))
      data.lift.ground = GROUND
      data.lift.frame = liftBox(data.lift, f.lift.pad)
      data.focus = data.lift.frame
    }
    if (f.swap) {
      const read = (n) => JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.${n}.json`), 'utf8'))
      const [was, now] = [read('old'), read('new')]
      if (!was?.pieces.length || !now?.pieces.length) throw new Error(`${f.name}: no rule traced`)
      data.swap = { old: was, new: now, ground: GROUND }
      data.swapAt = { on: f.swap.on, start: f.swap.start }
      // The box was measured round the new rule. The old one stands there first and
      // can run a line longer: grow the box so it holds the old rule with the same margin.
      const foot = (pieces) => Math.max(...pieces.map((p) => p.y + p.h))
      const box = data.focus
      if (box.y < foot(now.pieces) && box.y + box.h > foot(now.pieces)) {
        const margin = box.y + box.h - foot(now.pieces)
        box.h = round(Math.max(box.h, foot(was.pieces) + margin - box.y))
      }
    }
    if (f.cursorIn) data.cursorIn = f.cursorIn
    if (f.cursorOut) data.cursorOut = f.cursorOut
    if (f.diff) {
      const diff = JSON.parse(readFileSync(join(HERE, 'out', `${f.name}.diff.json`), 'utf8'))
      // Only a green fill marks added text (oklab with a negative a): a run inside some other filled box is shared text.
      for (const p of diff.pieces) if (p.kind === 'ins' && !/oklab\([\d.]+ -/.test(p.bg ?? '')) p.kind = 'same'
      data.diff = diff
      data.diffAt = f.diff
    }
    writeFileSync(
      join(FILM, 'shots', `${f.name}.js`),
      `// The ${f.name} beat. remap: [seconds into the beat, seconds into assets/${f.name}.mp4].
// focus: the part of the app lifted off the window, in the app's 1200 × 750. screen: the skeleton round it.
// events: where the pointer went, in footage time.
export default ${JSON.stringify(data)}\n`,
    )
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
</div>
<script type="module">
import { shot } from './kit.js'
import data from './shots/${f.name}.js'

window.film = shot({ data, video: 'assets/${f.name}.mp4', lead: ${round(lead)}, tail: ${round(tail)}${first ? '' : ', cutIn: true'} })
</script>
</body>
</html>
`,
    )
    const length = lead + f.len + tail
    clips.shots.push({ id: f.name, at, length })

    // The beat's sounds, in its own time: each press, release and key, a frame after
    // the input, when the footage shows it.
    // Typing the cut quickens keeps one key sound every KEY_GAP at most, so every
    // beat types at the same cadence however fast its footage runs.
    const KEY_GAP = 0.06
    const hits = []
    let lastKey = -Infinity
    for (const e of raw.events) {
      if (e.t < remap[0][1] || e.t > remap.at(-1)[1]) continue
      const t = lead + filmTime(remap, e.t) + 0.02
      if (e.kind === 'down') hits.push({ t, kind: 'press' })
      if (e.kind === 'up') hits.push({ t, kind: 'release' })
      if (e.kind === 'key' && t - lastKey >= KEY_GAP) {
        hits.push({ t, kind: 'keydown', ch: e.ch })
        lastKey = t
      }
    }
    if ((ONLY === 'all' || ONLY === 'audio') && hits.length) writeWav(join(FILM, 'assets', `sfx-${f.name}.wav`), sfx(hits, lead + f.len + (last ? 0.3 : 0), seed))
    if (hits.length) clips.shots.at(-1).sound = true
    seed += 1
    at += length
  }
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
${CHAPTERS.map((c, i) => sound(`sfx-bump-${c.name}`, BLOCKS[i] - EDGE, 0.62)).join('\n')}
</section>
<section>
${clips.shots.filter((c) => c.sound).map((c) => sound(`sfx-${c.id}`, c.at, 0.55)).join('\n')}
</section>
<section>
  <audio id="music" src="assets/music.wav" volume="0.74"></audio>
</section>
</body>
</html>
`,
  )
console.log([...clips.bumpers, ...clips.shots].sort((a, b) => a.at - b.at).map((c) => `${c.id} ${round(c.at)}–${round(c.at + c.length)}`).join('\n'), `\ncuts ${CUTS.join(' ')}; close at ${CLOSE_AT}, film ${TOTAL}s`)
