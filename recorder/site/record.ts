/**
 * Films and photographs the screens the portfolio case study shows, on the
 * current app: stills as PNG and short clips as MP4, in ./out. Same recorder
 * as the reel (../lib.ts), without the reel's camera plan.
 *   SKILL_STUDIO=<checkout> pnpm exec tsx --tsconfig tsconfig.json .../record.ts [shot,shot]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, appReady, connect, director, extras, launch, scratch, sleep } from '../lib.ts'

const s = scratch()
process.env.SKILL_STUDIO_HOME = s.home
// Film at a window whose ratio matches the block, so the whole frame is the asset and
// nothing is cropped. WINDOW_W/WINDOW_H override the recorder's default 1200x750.
const WIN_W = Number(process.env.WINDOW_W ?? 1200)
const WIN_H = Number(process.env.WINDOW_H ?? 750)
writeFileSync(join(s.profile, 'window.json'), JSON.stringify({ x: 40, y: 40, width: WIN_W, height: WIN_H }))
const { sample } = await import(join(ROOT, 'scripts/guide-shots/seed.ts'))
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out`
mkdirSync(OUT, { recursive: true })
const ONLY = process.argv[2]
// The judge's bar: a 66% vote falls under 0.7, so the Compare still shows a vote left out.
const bench = join(s.home, 'work/acme-app/.agents/skills/release-notes/evals/bench.json')
const current = existsSync(bench) ? JSON.parse(readFileSync(bench, 'utf8')) : {}
writeFileSync(bench, JSON.stringify({ ...current, sure: 0.7 }, null, 2))
const { app, port } = await launch(s.home, s.profile, { PATH: `${HERE}bin:${process.env.PATH}` })

const q = JSON.stringify
const btn = (label: string, n = 0) =>
  `[...document.querySelectorAll('button, a')].filter((b) => b.textContent.trim() === ${q(label)})[${n}]`
const starts = (label: string, sel = 'main button') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}))`
const line = (text: string) =>
  `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(text)}))`

try {
  const page = await connect(port)
  await appReady(page)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await sleep(1500)
  const snap = async (name: string) => {
    await sleep(700)
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(String(data), 'base64'))
  }
  const hideToast = () =>
    page.run(`document.querySelectorAll('div[role="status"].fixed').forEach((e) => e.style.setProperty('visibility', 'hidden', 'important'))`)
  const goTo = async (route: string, ms = 900) => {
    await page.run(`window.location.hash = ${q(route)}`)
    await sleep(ms)
  }
  const want = (name: string) => !ONLY || ONLY.split(',').includes(name)
  const buttons = () =>
    page.run(`JSON.stringify([...document.querySelectorAll('[role="dialog"] button, [data-radix-popper-content-wrapper] button, aside button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim().slice(0, 40)))`)

  if (want('library')) await snap('library')
  await page.run(`${starts(sample.skill, 'button,a')}.click()`)
  await sleep(900)
  for (const route of ['#/edit', '#/cases', '#/generate', '#/blind', '#/compare', '#/overview']) await goTo(route, 600)
  await hideToast()
  const d = director(page, OUT)
  const x = extras(page, d, (e) => d.log(e))
  const go = async (find: string, opts: { dx?: number; dy?: number; pause?: number; hold?: number; t?: number } = {}) => {
    await d.move(await d.at(find, opts.dx, opts.dy), opts.t)
    await sleep(opts.pause ?? 70)
    await d.click(opts.hold)
  }
  const [r0] = sample.compare.a.split('/')
  const [r1] = sample.compare.b.split('/')

  if (want('stills')) {
    await goTo('#/overview')
    await snap('overview')
    await goTo('#/versions')
    await snap('versions')
    await goTo('#/cases')
    await snap('cases')
    await goTo(`#/compare?${new URLSearchParams({ a: `${r0}/sync-fix-s1`, b: `${r1}/sync-fix-s2` })}`)
    await snap('compare-unsure')
    await goTo('#/insights')
    await snap('agreement')
  }

  /** Select rule 03 in the Editor (click at its start, Shift+End), so the popout opens over it. */
  const selectRule = async () => {
    const l = line('under 120 words')
    await go(l, { dx: 0.012, dy: 0.5 })
    await sleep(350)
    await x.key('Home', 'Home', 36)
    await sleep(120)
    await x.key('End', 'End', 35, 8)
    await sleep(900)
  }

  if (want('editor')) {
    await goTo('#/edit', 1200)
    Object.assign(d.cursor, { x: 700, y: 500 })
    await selectRule()
    await snap('editor-menu')
    console.log('menu', await buttons())
    await go(btn('Help me improve'))
    await sleep(6000)
    await snap('improve')
    console.log('improve', await buttons())
    await page.run(`document.querySelector('[aria-label="Close the assistant"]')?.click()`)
    await sleep(600)
  }

  if (want('rewrites')) {
    await goTo('#/edit', 1200)
    await page.run(`document.activeElement?.blur?.()`)
    Object.assign(d.cursor, { x: 700, y: 500 })
    await d.begin('rewrites')
    await sleep(500)
    await selectRule()
    await sleep(500)
    await go(btn('Suggest changes'))
    await sleep(5200)
    console.log('rewrites', await buttons())
    await snap('rewrites')
    const pick = `[...document.querySelectorAll('[data-radix-popper-content-wrapper] button')].filter((b) => /^(Use|Apply|Replace|Put)/.test(b.textContent.trim()))[1]`
    const has = await page.run(`Boolean(${pick})`)
    if (has) {
      await go(pick)
      await sleep(1600)
    } else await sleep(1200)
    console.log('rewrites', JSON.stringify(await d.end()))
    await snap('rewrites-end')
  }

  if (want('results')) {
    await goTo('#/overview', 1200)
    Object.assign(d.cursor, { x: 760, y: 560 })
    await d.begin('results')
    await sleep(1000)
    await x.scroll(250, 0.25)
    await sleep(300)
    await go(starts('v1 · Claude Sonnet'), { dx: 0.3 })
    await sleep(2600)
    console.log('results', JSON.stringify(await d.end()))
  }

  if (want('blind')) {
    try {
      await goTo('#/blind', 1200)
      console.log('blind buttons', await buttons())
      Object.assign(d.cursor, { x: 1000, y: 330 })
      await d.begin('blind')
      await sleep(700)
      await go(btn('4'))
      await sleep(140)
      await go(btn('Good', 0))
      await sleep(120)
      await go(btn('Bad', 1))
      await sleep(120)
      await go(btn('Good', 2))
      await sleep(200)
      // The button reads "Save and reveal" before the reveal, "Save" after; its text may carry a busy label.
      const reveal = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Save and reveal')) || [...document.querySelectorAll('button')].find((b) => /^Save(?!\\s*case)/.test(b.textContent.trim()))`
      await go(reveal)
      await sleep(2600)
      console.log('blind', JSON.stringify(await d.end()))
      await snap('blind-end')
    } catch (e) {
      console.log('blind failed:', (e as Error).message)
    }
  }

  if (want('compare')) {
    await goTo(`#/compare?${new URLSearchParams(sample.compare)}`, 1200)
    Object.assign(d.cursor, { x: 860, y: 230 })
    await d.begin('compare')
    await sleep(700)
    await go(btn('Word diff'))
    await sleep(1800)
    await go(btn('B is better'))
    await sleep(2000)
    console.log('compare', JSON.stringify(await d.end()))
  }

  if (want('run')) {
    await goTo('#/generate', 1200)
    console.log('generate', await page.run(`JSON.stringify([...document.querySelectorAll('main button')].map((b) => b.textContent.trim().slice(0, 30)))`))
    Object.assign(d.cursor, { x: 860, y: 260 })
    await d.begin('run')
    await sleep(700)
    const name = await page.run(`Boolean(document.getElementById("gen-name"))`)
    if (name) {
      await go('document.getElementById("gen-name")', { dx: 0.3 })
      await d.type('Date in the title', 60)
      await sleep(300)
    }
    await go(starts('Start a run'))
    await sleep(400)
    await d.move({ x: 800, y: 430 }, 0.35)
    await x.scroll(1200, 0.6)
    await sleep(5000)
    console.log('run', JSON.stringify(await d.end()))
    await snap('run-end')
  }

  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) {
    app.kill()
    await new Promise((done) => app.once('exit', done))
  }
  s.remove()
}
