/**
 * Films the onboarding teaser: the welcome window a first launch opens, from
 * its ink cover through the three tour steps and the three setup steps. One
 * take into ./out/onboarding: welcome.mp4 (the window at 2x), welcome.json
 * (its pointer moves and clicks) and a still of each screen. `probe` only takes
 * the stills.
 *   node onboarding.ts [probe]
 *
 * The app runs on a scratch home that holds four skills, so the first setup
 * step finds them. The stand-in claude answers "Connect a model"; Jev is real,
 * from TYPESAFE_API_KEY or the checkout's .env, and shows only where its key
 * comes from.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, connect, director, launch, scratch, sleep } from './lib.ts'

// Film only the app as it is: refuse a build older than the newest commit to its source.
const built = statSync(join(ROOT, 'out/main/index.js')).mtimeMs
const committed = Number(execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct', '--', 'src'], { encoding: 'utf8' }).trim()) * 1000
const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim()
if (built < committed || dirty)
  throw new Error(`The build in ${ROOT}/out is older than its source${dirty ? ' (uncommitted changes in src)' : ''}: run pnpm build there first.`)
console.log(`Filming ${execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim()}`)

const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out/onboarding`
mkdirSync(OUT, { recursive: true })
const PROBE = process.argv[2] === 'probe'

const s = scratch()
const SKILLS: Array<[string, string]> = [
  ['release-notes', 'Writes release notes people read.'],
  ['brand-voice', 'Keeps copy in the house voice.'],
  ['code-review', 'Reviews a diff the way the team does.'],
  ['meeting-notes', 'Turns a call into decisions and owners.'],
]
for (const [name, description] of SKILLS) {
  const dir = join(s.home, '.claude/skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n- Be specific.\n`)
}
// The real Claude config stays out of the take.
const claudeConfig = join(s.dir, 'claude')
mkdirSync(claudeConfig)
// The stand-in logs each call, so the take can prove the real claude never answered.
const STUB_LOG = join(s.dir, 'stub.log')

const { app, port } = await launch(s.home, s.profile, {
  PATH: `${HERE}bin:${process.env.PATH}`,
  CLAUDE_CONFIG_DIR: claudeConfig,
  REEL_STUB_LOG: STUB_LOG,
})

const q = JSON.stringify
const button = (label: string) =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${q(label)}) && !b.disabled)`
/** The step's way forward: the last button in the step's foot. */
const NEXT = `[...document.querySelectorAll('main section > div:last-child button')].at(-1)`

try {
  const page = await connect(port)
  const waitFor = async (expr: string, ms = 10000) => {
    for (let i = 0; i < ms / 50; i += 1) {
      if (await page.run(`Boolean(${expr})`).catch(() => false)) return
      await sleep(50)
    }
    throw new Error(`Never showed: ${expr}`)
  }
  await waitFor(button('See how it works'))
  const size = (await page.run(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`)) as { w: number; h: number; dpr: number }
  console.log('window', size)
  const snap = async (name: string) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(String(data), 'base64'))
  }
  // Each setup step has its answer before the take reaches it.
  const settled = `!document.querySelector('main')?.textContent.match(/Loading|Looking for|Checking for/)`

  const d = director(page, OUT)
  const go = async (find: string, t?: number) => {
    await d.move(await d.at(find), t)
    await sleep(60)
    await d.click(80)
  }

  if (PROBE) {
    await sleep(2500)
    await snap('p0-cover')
    await page.run(`${button('See how it works')}.click()`)
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await sleep(n > 3 ? 1500 : 3200)
      await waitFor(settled)
      await snap(`p${n}`)
      if (n < 6) await page.run(`${NEXT}.click()`)
    }
  } else {
    // The pointer waits off the cover's button, low on the right.
    Object.assign(d.cursor, { x: 640, y: 520 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 520, button: 'none' })
    await d.begin('welcome')
    // Opened again under the camera, so the cover plays its entrance in the take.
    await page.run('location.reload()').catch(() => {})
    await waitFor(button('See how it works'))
    d.mark('cover')
    await sleep(2300)
    await go(button('See how it works'), 0.75)
    d.mark('tour-1')
    await sleep(2300)
    await go(NEXT, 0.5)
    d.mark('tour-2')
    await sleep(3000)
    await go(NEXT, 0.35)
    d.mark('tour-3')
    await sleep(2600)
    await go(NEXT, 0.35)
    d.mark('setup-1')
    await waitFor(settled)
    await sleep(1500)
    await go(NEXT, 0.35)
    d.mark('setup-2')
    await waitFor(settled)
    await sleep(1500)
    await go(NEXT, 0.35)
    d.mark('setup-3')
    await waitFor(settled)
    await sleep(1200)
    // Rest on the last step's way forward, without pressing it.
    await d.move(await d.at(NEXT), 0.4)
    await sleep(1400)
    const made = await d.end()
    console.log('welcome', JSON.stringify(made))
    await snap('welcome-end')
    // The take's own facts: the window's size and scale, beside the director's log.
    const log = JSON.parse(readFileSync(`${OUT}/welcome.json`, 'utf8'))
    writeFileSync(`${OUT}/welcome.json`, JSON.stringify({ ...log, w: size.w, h: size.h, dpr: size.dpr }, null, 1))
  }

  const calls = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8').split('\n').filter(Boolean) : []
  console.log('stand-in claude calls:', calls)
  if (!calls.some((c) => c.startsWith('auth')))
    throw new Error('The stand-in claude was never asked who is signed in: the real one may have answered. Check the PATH the app used.')
  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) {
    app.kill()
    await new Promise((done) => app.once('exit', done))
  }
  s.remove()
}
