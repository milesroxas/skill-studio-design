/**
 * Films the cases teaser's two shots on the app: one rule added to the skill,
 * then each of the two briefs written before and after it, word for word. Writes one mp4,
 * one event log and one traced plan per shot into ./out/teaser. Run it from the
 * skill-studio checkout with its tsx, so the seed's aliases resolve:
 *   cd ../skill-studio && ./node_modules/.bin/tsx ../skill-studio-design/recorder/teaser.ts [shot,shot]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, appReady, connect, director, extras, launch, scratch, sleep } from './lib.ts'
import { DIFF, LIFT, SKETCH } from './sketch.ts'

// Film only the app as it is: refuse a build older than the newest commit to its source.
const built = statSync(join(ROOT, 'out/main/index.js')).mtimeMs
const committed = Number(execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct', '--', 'src'], { encoding: 'utf8' }).trim()) * 1000
const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim()
if (built < committed || dirty)
  throw new Error(`The build in ${ROOT}/out is older than its source${dirty ? ' (uncommitted changes in src)' : ''}: run pnpm build there first.`)
console.log(`Filming ${execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim()}`)

const s = scratch()
process.env.SKILL_STUDIO_HOME = s.home
// The teaser's own sample, a brand voice skill (teaser-seed.ts), not the guide's.
const { sample, RULE } = await import('./teaser-seed.ts')
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out/teaser`
mkdirSync(OUT, { recursive: true })
const ONLY = process.argv[2]
const { app, port } = await launch(s.home, s.profile, { PATH: `${HERE}bin:${process.env.PATH}` })

const q = JSON.stringify
const btn = (label: string, n = 0) =>
  `[...document.querySelectorAll('main button, main a')].filter((b) => b.textContent.trim() === ${q(label)})[${n}]`
const starts = (label: string, sel = 'main button') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}))`
const aria = (label: string) => `document.querySelector('[aria-label=${q(label)}]')`
const exact = (text: string, sel = 'main *') =>
  `[...document.querySelectorAll(${q(sel)})].filter((e) => e.textContent.trim() === ${q(text)}).sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]`

try {
  const page = await connect(port)
  await appReady(page)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await sleep(1500)
  await page.run(`${starts(sample.skill, 'button,a')}.click()`)
  await sleep(900)
  for (const route of ['#/edit', '#/cases', '#/generate', '#/blind', '#/compare', '#/insights', '#/overview']) {
    await page.run(`window.location.hash = ${q(route)}`)
    await sleep(700)
  }
  await page.run(`document.querySelectorAll('div[role="status"].fixed').forEach((e) => e.style.setProperty('visibility', 'hidden', 'important'))`)
  const d = director(page, OUT)
  const x = extras(page, d, (e) => d.log(e))
  const go = async (find: string, opts: { dx?: number; dy?: number; pause?: number; hold?: number; t?: number } = {}) => {
    await d.move(await d.at(find, opts.dx, opts.dy), opts.t)
    await sleep(opts.pause ?? 70)
    await d.click(opts.hold)
  }
  const union = async (name: string, finds: string[], pad = 12) => {
    const r = (await page.run(`(() => {
      const rs = [${finds.join(',')}].filter(Boolean).map((e) => e.getBoundingClientRect())
      if (!rs.length) return null
      const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top))
      const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom))
      return { x: x0 - ${pad}, y: y0 - ${pad}, w: x1 - x0 + ${pad * 2}, h: y1 - y0 + ${pad * 2} }
    })()`)) as Record<string, number> | null
    if (!r) throw new Error(`No box for ${name}`)
    d.log({ kind: 'box', name, ...r })
  }
  const snap = async (name: string) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(String(data), 'base64'))
  }
  const prep = async (name: string, route: string, setup?: () => Promise<void>) => {
    await page.run(`window.location.hash = ${q(route)}`)
    await sleep(900)
    await setup?.()
    await sleep(400)
    writeFileSync(`${OUT}/${name}.plan.json`, JSON.stringify(await page.run(SKETCH)))
    await snap(`${name}-start`)
  }
  const report = async (name: string) => console.log(name, JSON.stringify(await d.end()))
  const want = (name: string) => !ONLY || ONLY.split(',').includes(name)

  // 1. Compare (filmed first): each brief's v0 draft against its v1 draft, word for word, held.
  // Word diff is on before the take, and the diff is captured so the film can build it up.
  for (const [i, name] of ['compare', 'compare-email'].entries()) {
    if (!want(name)) continue
    const pair = sample.compare[i]
    await prep(name, `#/compare?${new URLSearchParams(pair).toString()}`, async () => {
      await page.run(`${btn('Word diff')}.click()`)
      await sleep(500)
    })
    writeFileSync(`${OUT}/${name}.diff.json`, JSON.stringify(await page.run(DIFF)))
    Object.assign(d.cursor, { x: 1150, y: 700 })
    await d.begin(name)
    await sleep(4500)
    await report(name)
    await snap(`${name}-end`)
  }

  // 2. Editor: one new rule after the last, and save. Rules are CodeMirror lines drawn as a numbered list.
  if (want('write')) {
    const rule = (text: string) => `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(text)}))`
    const last = rule('End with one clear next step')
    // The bar's Save carries its busy label in the same button.
    const save = `[...document.querySelectorAll('main button')].find((b) => b.textContent.trim().replace('Saving…', '') === 'Save')`
    await prep('write', '#/edit', async () => {
      await page.run(`${last}.scrollIntoView({ block: 'center' })`)
      await sleep(300)
    })
    Object.assign(d.cursor, { x: 900, y: 640 })
    await d.begin('write')
    await union('rules', [rule('Lead with what the reader'), last, save], 18)
    await sleep(250)
    // The end of the last rule's text.
    await go(last, { dx: 0.97, dy: 0.5 })
    await sleep(80)
    await x.key('End', 'End', 35)
    await sleep(150)
    await d.type('\n', 55)
    await sleep(150)
    await d.type(RULE.replace(/^- /, ''), 52)
    await sleep(350)
    await union('added', [rule('Write short, casual')], 10)
    await go(save)
    await sleep(1600)
    await report('write')
    await snap('write-end')
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
