/**
 * Starts the app on the mock home: a fresh home from seed.ts (the social-post
 * sample), `st serve` on it with the stand-in claude first on PATH, and Chrome
 * on the served page. Everything it starts, `close()` stops.
 *
 * The app is the skill-studio checkout in SKILL_STUDIO, built (`pnpm build`)
 * and with no uncommitted changes in src, so what is filmed is a release.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

export const KIT = fileURLToPath(new URL('.', import.meta.url))
export const ROOT = process.env.SKILL_STUDIO ?? '/Users/milesroxas/SITES/tools/skill-studio-video-src'
const TSX = join(ROOT, 'node_modules/.bin/tsx')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** The app's build must match its source, or the film shows code that is not the release. */
function checkBuild() {
  const git = (...args) => spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).stdout.trim()
  const dirty = git('status', '--porcelain', 'src')
  if (dirty) throw new Error(`The app checkout has uncommitted changes in src:\n${dirty}`)
  const head = Number(git('log', '-1', '--format=%ct'))
  const built = Number(spawnSync('stat', ['-f', '%m', join(ROOT, 'out/renderer/index.html')], { encoding: 'utf8' }).stdout.trim())
  if (!built || built < head) throw new Error('The app build is older than its last commit: run pnpm build in the app.')
  return git('log', '-1', '--format=%h %s')
}

/**
 * @param {object} o
 * @param {number} o.width   viewport, CSS px
 * @param {number} o.height
 * @param {number} [o.scale] device scale factor
 * @param {'dark'|'light'} [o.scheme]
 * @param {string} [o.answers]  the stand-in's answers (JSON); kit/answers.json by default
 * @param {(skill: {dir: string, file: string, home: string}) => void} [o.prepare]  edit the home before the app starts
 * @param {number} [o.port]
 * @param {boolean} [o.runs]  write the sample runs (default true; false for a quick home)
 */
export async function start({ width, height, scale = 1, scheme = 'dark', answers = join(KIT, 'answers.json'), prepare, port = Number(process.env.PORT ?? 4471), runs = true }) {
  const busy = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim()
  if (busy) throw new Error(`Port ${port} is taken:\n${busy}`)
  console.log(`app: ${checkBuild()}`)
  const work = join(KIT, '.work')
  rmSync(work, { recursive: true, force: true })
  const home = join(work, 'home')
  const gates = join(work, 'gates')
  mkdirSync(home, { recursive: true })
  mkdirSync(gates, { recursive: true })
  const stubLog = join(work, 'stub.log')
  writeFileSync(stubLog, '')
  const env = {
    ...process.env,
    SKILL_STUDIO: ROOT,
    SKILL_STUDIO_HOME: home,
    PATH: `${join(KIT, 'bin')}:${process.env.PATH}`,
    SHELL: join(KIT, 'bin/login-shell'),
    FILM_ANSWERS: answers,
    FILM_GATES: gates,
    FILM_STUB_LOG: stubLog,
    ...(runs ? {} : { SEED_NO_RUNS: '1' }),
  }
  // The stand-in must be the claude the app finds, or a real model runs on the user's account.
  const found = spawnSync('/bin/sh', ['-c', 'command -v claude'], { env, encoding: 'utf8' }).stdout.trim()
  if (found !== join(KIT, 'bin/claude')) throw new Error(`claude resolves to ${found}, not the stand-in.`)
  const seeded = spawnSync(TSX, ['--tsconfig', join(ROOT, 'tsconfig.json'), join(KIT, 'seed.ts')], { env, cwd: ROOT, encoding: 'utf8' })
  if (seeded.status !== 0) throw new Error(`seed failed:\n${seeded.stderr}`)
  const dir = seeded.stdout.trim().split('\n').at(-1)
  const skill = { dir, file: join(dir, 'SKILL.md'), home }
  if (prepare) prepare(skill)

  const server = spawn(TSX, ['--tsconfig', join(ROOT, 'tsconfig.json'), 'src/interfaces/cli/st.ts', 'serve', '--port', String(port)], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let serverLog = ''
  const url = await new Promise((done, fail) => {
    const read = (chunk) => {
      serverLog += chunk.toString()
      const hit = /Skill Studio: (\S+)/.exec(serverLog)
      if (hit) done(hit[1])
    }
    server.stdout.on('data', read)
    server.stderr.on('data', read)
    server.on('exit', (code) => fail(new Error(`st serve quit (${code}):\n${serverLog}`)))
  })
  server.removeAllListeners('exit')

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--font-render-hinting=none'] })
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: scheme })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('page error:', e.message))

  const stubCalls = () => readFileSync(stubLog, 'utf8').split('\n').filter(Boolean)
  return {
    url,
    page,
    context,
    browser,
    home,
    skill,
    stubCalls,
    /** Let the stand-in's reply of this kind go: rewrites, refine, improve or chat. */
    open: (kind) => writeFileSync(join(gates, kind), ''),
    /** Throws unless the stand-in answered at least `min` calls. */
    assertStub(min = 1) {
      if (stubCalls().length < min) throw new Error(`The stand-in claude answered ${stubCalls().length} calls; expected ${min}.`)
    },
    /** Open the sample skill's editor, as a reader does from the Library. */
    async openEditor() {
      await page.goto(url)
      await page.waitForSelector('nav[aria-label="App"]', { timeout: 30000 })
      await page.getByText('social-post').first().click()
      await page.waitForTimeout(800)
      await page.evaluate(() => (location.hash = '#/editor'))
      await page.waitForSelector('.cm-md-rulenum')
    },
    /**
     * Scroll the editor until the line holding `text` stands `y` px down the
     * window. The editor draws only lines near the view, so it scrolls to find it.
     */
    async scrollEditor(text, y) {
      const ok = await page.evaluate(async ({ text, y }) => {
        const scroller = (el) => {
          let box = el.parentElement
          while (box && !(box.scrollHeight > box.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
          return box
        }
        const find = () => [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(text))
        const box = scroller(document.querySelector('.cm-content'))
        for (let i = 0; i < 40 && !find(); i += 1) {
          box.scrollTop += 200
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        }
        const line = find()
        if (!line) return false
        box.scrollTop += line.getBoundingClientRect().top - y
        return true
      }, { text, y })
      if (!ok) throw new Error(`No line holds ${text}`)
      await page.waitForTimeout(100)
    },
    async close() {
      await browser.close().catch(() => {})
      server.kill()
    },
  }
}
