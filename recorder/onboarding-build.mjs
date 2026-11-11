// Builds the onboarding teaser's data from the take in ./out/onboarding and
// copies the take into the film's assets.
//   node onboarding-build.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
const TAKE = join(HERE, 'out', 'onboarding')
const FILM = new URL('../onboarding', import.meta.url).pathname
const round = (n) => Math.round(n * 1000) / 1000

/**
 * The cut: [seconds into the film, seconds into the take]. Every animation the
 * app plays runs at close to its own speed; only the waits between them are
 * squeezed. Each step ends on its press of the way forward.
 */
const CUT = [
  // The cover: the mark, the headline, the slab across "works", then See how it works.
  [[1.45, 1.65], [0.25, 0.65], [0.85, 0.95]],
  // 01 Write the rules.
  [[1.2, 1.35], [0.25, 0.88], [0.6, 0.72]],
  // 02 Run it on a real task: the note writes itself and Jev marks it.
  [[2.0, 2.3], [0.3, 0.7], [0.45, 0.55]],
  // 03 Compare, then fix: the score counts up and v1 is picked.
  [[1.85, 2.1], [0.3, 0.45], [0.45, 0.55]],
  // Setup 01 Find your skills, 02 Connect a model.
  [[0.8, 0.9], [0.15, 0.55], [0.45, 0.55]],
  [[0.8, 0.9], [0.15, 0.55], [0.45, 0.55]],
  // Setup 03 Add Jev: the pointer comes to rest on Start the walkthrough.
  [[0.45, 0.5], [0.25, 0.65], [0.6, 0.5]],
]
const START = 0.1

const take = JSON.parse(readFileSync(join(TAKE, 'welcome.json'), 'utf8'))
const remap = [[0, START]]
for (const step of CUT)
  for (const [out, inTake] of step) {
    const [a, b] = remap.at(-1)
    remap.push([round(a + out), round(b + inTake)])
  }
if (remap.at(-1)[1] > take.length) throw new Error(`The cut runs past the take (${take.length} s)`)

const events = take.events
  .filter((e) => ['move', 'down', 'up'].includes(e.kind))
  .map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])))
const begin = take.events.find((e) => e.name === 'begin')

mkdirSync(join(FILM, 'assets'), { recursive: true })
mkdirSync(join(FILM, 'shots'), { recursive: true })
copyFileSync(join(TAKE, 'welcome.mp4'), join(FILM, 'assets', 'welcome.mp4'))
const data = { w: take.w, h: take.h, length: remap.at(-1)[0], remap, start: { x: begin.x, y: begin.y }, events }
writeFileSync(
  join(FILM, 'shots', 'welcome.js'),
  `// The welcome take. remap: [seconds into the shot, seconds into assets/welcome.mp4].
// events: where the pointer went and when it pressed, in take time, in the window's ${take.w} x ${take.h}.
export default ${JSON.stringify(data)}\n`,
)
console.log({ length: data.length, take: take.length, used: remap.at(-1)[1] })
