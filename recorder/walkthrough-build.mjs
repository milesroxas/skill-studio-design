// Builds the walkthrough reel from the takes in ./out/walkthrough: each step's
// shot page and data, the cut list the lime wipe runs on, and film.html. `all`
// also copies the takes into the reel's assets. `--visual` builds the version
// with no words of its own (../walkthrough-visual): no captions, no notes, and
// the mark alone for the opening and the close.
//   node walkthrough-build.mjs [all] [--visual]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
const TAKES = join(HERE, 'out', 'walkthrough')
const VISUAL = process.argv.includes('--visual')
const FILM = new URL(VISUAL ? '../walkthrough-visual' : '../walkthrough', import.meta.url).pathname
const ALL = process.argv.includes('all')
mkdirSync(join(FILM, 'assets'), { recursive: true })
mkdirSync(join(FILM, 'shots'), { recursive: true })

/** The opening card, then each step under the lime wipe, then the close. */
const OPENING = VISUAL ? 2.2 : 3.4
const CLOSING = VISUAL ? 2.8 : 4.2
const WIPE = { up: 0.4, off: 0.1, go: 0.4 }
const EDGE = 0.05
const LEAD = EDGE + WIPE.off + WIPE.go // a shot's zero comes once the wipe is off it
const TAIL = WIPE.up + EDGE // and it runs on under the next wipe

/**
 * The seven steps of the guide, as the app names them. remap: [shot time,
 * take time], a number or a press ('down1+0.2'). focus: the boxes the recorder
 * measured, by name; `t` is when the camera moves on, `cut` swaps instead of
 * sliding. rings and pills point at measured boxes. A shot is long enough to
 * read its caption and what it lifts, and moves on once that is read.
 */
const STEPS = [
  {
    name: 'read',
    title: 'Read the skill',
    say: 'A skill is a page of rules for an agent. This one writes thank-you notes.',
    length: 6.9,
    // Its intro, the rules (the camera cuts while the editor scrolls), then the guide's yellow way on.
    remap: [[0, 0.1], [4.9, 5.0], [5.2, 5.5], ['down0+0.55', 'down0+0.55'], [6.9, 'down0+0.8']],
    focus: [{ box: 'intro' }, { t: 1.75, dur: 0.75, cut: true, box: 'rules' }, { t: 4.95, dur: 0.4, cut: true, box: 'next' }],
    rings: [{ box: 'vague', in: 2.7, out: 4.95, pad: 5 }],
    pills: [{ box: 'vague', side: 'right', text: 'Vague on purpose', in: 3.0, out: 4.95 }],
  },
  {
    name: 'cases',
    title: 'Read the cases',
    say: 'Three real requests. Each says what a good note does, and checks it.',
    length: 6.5,
    remap: [[0, 0.1], [6.5, 6.6]],
    focus: [{ box: 'task' }, { t: 2.85, dur: 0.95, cut: true, box: 'checks' }],
    rings: [{ box: 'two', in: 3.9, out: 9, pad: 4 }],
    pills: [{ box: 'two', side: 'down', text: 'The rule it tests', in: 4.1, out: 9 }],
    cursorOut: [0, 0.05],
  },
  {
    name: 'run',
    title: 'Run the skill',
    say: 'An agent writes a note for each case, then Jev grades every note.',
    length: 6.6,
    // Run opens its panel; Start a run; the wait for the notes and the grades is quickened.
    remap: [[0, 0.1], ['down1+0.35', 'down1+0.35'], ['down1+0.8', 'down1+2.5'], [6.6, 'down1+4.6']],
    focus: [{ box: 'popover' }, { t: 'down1+0.4', dur: 0.4, cut: true, box: 'scored' }],
    pills: [{ box: 'switcher', side: 'right', text: 'v0 scores 83', in: 'down1+0.9', out: 9 }],
  },
  {
    name: 'results',
    title: 'Read what the notes missed',
    say: 'The vague length rule let every note run to four sentences.',
    length: 7.2,
    remap: [[0, 0.05], [7.2, 7.25]],
    focus: [{ box: 'missed' }, { t: 3.05, dur: 0.95, cut: true, box: 'note' }],
    rings: [{ box: 'miss', in: 0.6, out: 3.05, pad: 5 }],
    pills: [{ box: 'miss', side: 'right', text: 'Missed', in: 0.8, out: 3.05 }],
    cursorOut: [0, 0.05],
  },
  {
    name: 'edit',
    title: 'Tighten one rule',
    say: '“A reasonable length” measures nothing. Give it a number, then save.',
    length: 8.6,
    // The vague rule beside the exact one; swap it in; the rules (cut while the editor scrolls); Save.
    remap: [[0, 0.1], [6.9, 7.0], [7.1, 'down1-0.75'], ['down1+0.25', 'down1+0.25'], [8.6, 'down1+0.9']],
    focus: [{ box: 'tighten' }, { t: 'down0+0.5', dur: 1.55, cut: true, box: 'exact' }, { t: 6.9, dur: 0.35, cut: true, box: 'save' }],
    rings: [{ box: 'newrule', in: 'down0+1.9', out: 6.9, pad: 5 }],
    pills: [{ box: 'newrule', side: 'down', text: 'Exact: a number the agent can count', in: 'down0+2.1', out: 6.9 }],
  },
  {
    name: 'rerun',
    title: 'Run it again',
    say: 'Same cases, new rule: any difference is your edit.',
    length: 6.0,
    remap: [[0, 0.1], ['down1+0.35', 'down1+0.35'], ['down1+0.8', 'down1+2.4'], [6.0, 'down1+4.6']],
    focus: [{ box: 'popover' }, { t: 'down1+0.4', dur: 0.4, cut: true, box: 'scored' }],
    pills: [{ box: 'switcher', side: 'right', text: 'v1 scores 100', in: 'down1+0.9', out: 9 }],
  },
  {
    name: 'compare',
    title: 'Pick the better note',
    say: 'Read v0 beside v1, then say which is better. That is the loop.',
    length: 10.2,
    // Both outputs' scores, both notes (cut while it scrolls), B is better, the guide done.
    remap: [[0, 0.05], [8.3, 8.35], [8.7, 'down0+1.4'], [10.2, 'down0+2.9']],
    focus: [{ box: 'lift' }, { t: 2.95, dur: 0.95, cut: true, box: 'notes' }, { t: 6.95, dur: 0.35, cut: true, box: 'pick' }, { t: 8.3, dur: 0.4, cut: true, box: 'done' }],
    pills: [
      { box: 'gain', side: 'right', text: 'Every case, 83 to 100', in: 0.6, out: 2.95 },
      { box: 'short', side: 'down', text: '18 words, two sentences', in: 4.3, out: 6.95 },
    ],
  },
]

const round = (n) => Math.round(n * 10000) / 10000

/** A take time: a number, or a press it is tied to, such as 'down1+0.35'. */
function takeAt(at, events) {
  if (typeof at === 'number') return at
  const m = /^(down|up)(\d+)([+-][\d.]+)?$/.exec(at)
  if (!m) throw new Error(`Not a take time: ${at}`)
  const hit = events.filter((e) => e.kind === m[1])[Number(m[2])]
  if (!hit) throw new Error(`No ${m[1]} number ${m[2]} in the take`)
  return round(hit.t + Number(m[3] ?? 0))
}

/** A shot time given as a press: the shot time the remap puts that take time at. */
function shotAt(at, remap, events) {
  if (typeof at === 'number') return at
  const tau = takeAt(at, events)
  for (let i = 1; i < remap.length; i += 1) {
    const [a, va] = remap[i - 1]
    const [b, vb] = remap[i]
    if (tau <= vb) return round(vb === va ? a : a + ((b - a) * (tau - va)) / (vb - va))
  }
  return remap.at(-1)[0]
}

const boxOf = (f, name, events) => {
  const found = events.filter((e) => e.kind === 'box' && e.name === name).at(-1)
  if (!found) throw new Error(`${f.name}: no box named ${name} in the take`)
  return { x: round(found.x), y: round(found.y), w: round(found.w), h: round(found.h) }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

let clock = OPENING
const shots = []
const CUTS = []
for (const [index, f] of STEPS.entries()) {
  if (ALL) copyFileSync(join(TAKES, `${f.name}.mp4`), join(FILM, 'assets', `${f.name}.mp4`))
  const raw = JSON.parse(readFileSync(join(TAKES, `${f.name}.json`), 'utf8'))
  const plan = JSON.parse(readFileSync(join(TAKES, `${f.name}.plan.json`), 'utf8'))
  // A shot time may be a press too ('down1+0.8'): the shot time the press falls at, running
  // 1:1 from the point before it, plus the offset. So a wait after a press can be squeezed.
  const remap = []
  for (const [u, at] of f.remap) {
    const tau = takeAt(at, raw.events)
    if (typeof u === 'number') {
      remap.push([u, tau])
      continue
    }
    const m = /^(down|up)(\d+)([+-][\d.]+)?$/.exec(u)
    const press = takeAt(`${m[1]}${m[2]}`, raw.events)
    const [pu, ptau] = remap.at(-1)
    remap.push([round(pu + (press - ptau) + Number(m[3] ?? 0)), tau])
  }
  for (let i = 1; i < remap.length; i += 1)
    if (remap[i][1] < remap[i - 1][1] || remap[i][0] < remap[i - 1][0]) throw new Error(`${f.name}: time runs back at ${i}: ${JSON.stringify(remap)}`)
  if (remap.at(-1)[1] > raw.length + 0.01) throw new Error(`${f.name}: the take is ${raw.length} s, the cut wants ${remap.at(-1)[1]}`)
  const at = (v) => shotAt(v, remap, raw.events)
  const focus = f.focus.map(({ box, t, dur, cut }) => ({
    ...(t === undefined ? {} : { t: at(t), dur }),
    ...(cut ? { cut } : {}),
    ...boxOf(f, box, raw.events),
  }))
  const events = raw.events
    .filter((e) => ['move', 'down', 'mark'].includes(e.kind))
    .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])))
  const data = {
    length: f.length,
    remap,
    focus,
    events,
    plan,
    ...(VISUAL ? {} : { caption: { n: `${String(index + 1).padStart(2, '0')}/${String(STEPS.length).padStart(2, '0')}`, title: f.title, say: f.say } }),
  }
  if (f.cursorOut) data.cursorOut = f.cursorOut
  const rings = (f.rings ?? []).map((r) => {
    const b = boxOf(f, r.box, raw.events)
    const p = r.pad ?? 4
    return `<div class="ring" data-x="${round(b.x - p)}" data-y="${round(b.y - p)}" data-w="${round(b.w + p * 2)}" data-h="${round(b.h + p * 2)}" data-in="${at(r.in)}" data-out="${at(r.out)}"></div>`
  })
  const pills = (VISUAL ? [] : (f.pills ?? [])).map((p) => {
    const b = boxOf(f, p.box, raw.events)
    const [x, y] = {
      right: [b.x + b.w + 6, b.y + b.h / 2],
      left: [b.x - 6, b.y + b.h / 2],
      down: [b.x + 24, b.y + b.h + 4],
      up: [b.x + 24, b.y - 4],
    }[p.side]
    return `<div class="pill" data-dir="${p.side}" data-x="${round(x)}" data-y="${round(y)}" data-in="${at(p.in)}" data-out="${at(p.out)}">${esc(p.text)}</div>`
  })
  writeFileSync(
    join(FILM, 'shots', `${f.name}.js`),
    `// The ${f.name} step. remap: [seconds into the shot, seconds into assets/${f.name}.mp4].
// focus: the part of the app lifted off the plan, in the app's 1200 × 750, and when it changes.
// events: where the pointer went, in take time. plan: the screen traced as shapes when it was filmed.
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
${[...rings, ...pills].map((n) => `  ${n}\n`).join('')}</div>
<script type="module">
import { shot } from './kit.js'
import data from './shots/${f.name}.js'

window.film = shot({ data, video: 'assets/${f.name}.mp4', lead: ${round(LEAD)}, tail: ${round(TAIL)} })
</script>
</body>
</html>
`,
  )
  // The lime is fully up at `clock`; the shot starts just before it and runs to just past the next cut.
  CUTS.push(round(clock))
  const length = LEAD + f.length + TAIL
  shots.push({ id: f.name, at: round(clock - EDGE), length: round(length) })
  clock += WIPE.off + WIPE.go + f.length + WIPE.up
}
CUTS.push(round(clock))
const TOTAL = round(clock + WIPE.off + WIPE.go + CLOSING)

writeFileSync(
  join(FILM, 'wipes.js'),
  `// The film's one transition. A wipe at a cut c: the lime comes up over [c - up, c],
// holds for \`off\`, and goes up off the frame over the next \`go\` seconds. Written by the build.
export const WIPE = ${JSON.stringify(WIPE)}
export const CUTS = ${JSON.stringify(CUTS)}
`,
)

const closeAt = round(CUTS.at(-1) - EDGE)
// Scenes overlap a little under each wipe, so they take turns on two tracks.
const scenes = [
  { id: 'open', src: 'open.html', at: 0, length: round(OPENING + EDGE) },
  ...shots.map((c) => ({ ...c, src: `${c.id}.html` })),
  { id: 'close', src: 'close.html', at: closeAt, length: round(TOTAL - closeAt) },
]
const track = (odd) =>
  scenes
    .filter((_, i) => i % 2 === (odd ? 1 : 0))
    .map((c) => `  <iframe id="${c.id}" src="${c.src}#t=0,${c.length}"${c.at ? ` at="${c.at}"` : ''}></iframe>`)
    .join('\n')
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
  <iframe id="wipes" src="wipes.html#t=0,${TOTAL}"></iframe>
</section>
<section>
${track(false)}
</section>
<section>
${track(true)}
</section>
<section>
  <iframe id="stage" src="stage.html#t=0,${TOTAL}"></iframe>
</section>
</body>
</html>
`,
)
// The opening and the close run as long as their clips.
const cardLength = { open: round(OPENING + EDGE), close: round(TOTAL - closeAt) }
for (const [name, length] of Object.entries(cardLength)) {
  const file = join(FILM, `${name}.html`)
  writeFileSync(file, readFileSync(file, 'utf8').replace(/card\(\{ duration: [^,]+,/, `card({ duration: ${length},`))
}
console.log({ TOTAL, CUTS, shots: shots.map((s) => `${s.id}@${s.at}`) })
