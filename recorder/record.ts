/**
 * Films the reel's five click-throughs on the redesigned app: one mp4, one event
 * log and one traced plan per shot, in ./out. Each shot starts already on its
 * screen; typing runs on a steady clock.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, appReady, connect, director, extras, launch, scratch, sleep } from './lib.ts'
import { DIFF, LIFT, SKETCH } from './sketch.ts'

const s = scratch()
process.env.SKILL_STUDIO_HOME = s.home
const { sample } = await import(join(ROOT, 'scripts/guide-shots/seed.ts'))
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out`
const ONLY = process.argv[2]
const { app, port } = await launch(s.home, s.profile, { PATH: `${HERE}bin:${process.env.PATH}` })

const q = JSON.stringify
const btn = (label: string, n = 0) =>
  `[...document.querySelectorAll('main button, main a')].filter((b) => b.textContent.trim() === ${q(label)})[${n}]`
const starts = (label: string, sel = 'main button') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}))`
const aria = (label: string) => `document.querySelector('[aria-label=${q(label)}]')`
const line = (text: string) =>
  `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(text)}))`
/** The smallest element in main whose own text is exactly `text`. */
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
  // The app's toast pill stays out of the film: it covers what the shot is about.
  await page.run(`document.querySelectorAll('div[role="status"].fixed').forEach((e) => e.style.setProperty('visibility', 'hidden', 'important'))`)
  const d = director(page, OUT)
  const x = extras(page, d, (e) => d.log(e))
  const go = async (find: string, opts: { dx?: number; dy?: number; pause?: number; hold?: number; t?: number } = {}) => {
    await d.move(await d.at(find, opts.dx, opts.dy), opts.t)
    await sleep(opts.pause ?? 70)
    await d.click(opts.hold)
  }
  /** Log the union of several elements' boxes, padded, as a named box. */
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
  const prep = async (name: string, route: string, setup?: () => Promise<void>) => {
    await page.run(`window.location.hash = ${q(route)}`)
    await sleep(900)
    await setup?.()
    await sleep(400)
    writeFileSync(`${OUT}/${name}.plan.json`, JSON.stringify(await page.run(SKETCH)))
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${OUT}/${name}-start.jpg`, Buffer.from(String(data), 'base64'))
  }
  const snap = async (name: string) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(String(data), 'base64'))
  }
  const report = async (name: string) => console.log(name, JSON.stringify(await d.end()))
  const want = (name: string) => !ONLY || ONLY.split(',').includes(name)

  // 1. Write: add a rule, with its reason, and save.
  if (want('write')) {
    const last = line('State only what the request says')
    await prep('write', '#/edit', async () => {
      await d.move({ x: 700, y: 500 }, 0.2)
      await x.scroll(260, 0.3)
      await sleep(500)
    })
    Object.assign(d.cursor, { x: 900, y: 640 })
    await d.begin('write')
    await union('rules', [line('Start with a one-line title'), last, btn('Save')], 18)
    await union('bar', [exact('SKILL.md', 'main span, main div, main p'), btn('Save')], 0)
    await sleep(250)
    await go(last, { dx: 0.92, dy: 0.5 })
    await x.key('End', 'End', 35)
    await sleep(120)
    await d.type('\n', 55)
    await sleep(140)
    await d.type('Put the date in the title. Readers plan by it.', 55)
    await sleep(250)
    await go(btn('Save'))
    await sleep(1600)
    await report('write')
    await snap('write-end')
  }

  // 2. Results: one scale; the version lift.
  if (want('results')) {
    await prep('results', '#/overview')
    // The version lift, as it is drawn: every text, the ribbon, the rule under it, so the film can build it up.
    writeFileSync(`${OUT}/results.lift.json`, JSON.stringify(await page.run(LIFT)))
    Object.assign(d.cursor, { x: 760, y: 560 })
    await d.begin('results')
    await sleep(1200)
    d.mark('scroll0')
    await x.scroll(250, 0.25)
    d.mark('scroll1')
    await sleep(250)
    await union('rows', [exact('Run', 'main *'), starts('v1 · Claude Sonnet'), exact('Flags')], 14)
    await go(starts('v1 · Claude Sonnet'), { dx: 0.3 })
    await sleep(700)
    await union('open', [starts('v1 · Claude Sonnet'), `[...document.querySelectorAll('main *')].filter((e) => /^breaking-api-s\\d$/.test(e.textContent.trim())).at(-1)`, exact('Regrade')], 14)
    await sleep(1800)
    await report('results')
    await snap('results-end')
  }

  // 3. Rate blind: your mark first, then the judge's.
  if (want('blind')) {
    await prep('blind', '#/blind')
    Object.assign(d.cursor, { x: 1000, y: 330 })
    await d.begin('blind')
    await union('rating', [exact('Your rating'), btn('5'), btn('Bad', 4)], 14)
    await sleep(200)
    await go(btn('4'))
    await sleep(100)
    await go(btn('Good', 0))
    await sleep(90)
    await go(btn('Bad', 1))
    await sleep(90)
    await go(btn('Good', 2))
    await sleep(120)
    await go(btn('Save and reveal'))
    await sleep(500)
    await union('judge', [exact('71', 'main span, main div, main b, main strong')], 0)
    await union('header', [exact('71', 'main span, main div, main b, main strong'), `${exact('Rated', 'main button, main span, main div')}`], 14)
    await sleep(1400)
    await report('blind')
    await snap('blind-end')
  }

  // 4. Compare: v0 against v1, word for word, and a vote.
  if (want('compare')) {
    // The pair opens set: v0 against v1, so the shot is the diff and the vote, no picker.
    await prep('compare', `#/compare?${new URLSearchParams(sample.compare).toString()}`)
    Object.assign(d.cursor, { x: 860, y: 230 })
    await d.begin('compare')
    await sleep(300)
    await go(btn('Word diff'))
    await sleep(500)
    writeFileSync(`${OUT}/compare.diff.json`, JSON.stringify(await page.run(DIFF)))
    await sleep(1000)
    await go(btn('B is better'))
    await sleep(1200)
    await report('compare')
    await snap('compare-end')
  }

  // 5. New run, filmed last: it leaves a run behind.
  if (want('run')) {
    await prep('run', '#/generate')
    Object.assign(d.cursor, { x: 860, y: 260 })
    await d.begin('run')
    await union('form', ['document.getElementById("gen-name")', aria('Model of writer 1'), aria('Agent of writer 1'), starts('Add a writer')], 16)
    await union('start', [btn('Start a run')], 10)
    await sleep(150)
    await go('document.getElementById("gen-name")', { dx: 0.3 })
    await d.type('Date in the title', 60)
    await sleep(150)
    await go(btn('Start a run'))
    await sleep(250)
    await d.move({ x: 800, y: 430 }, 0.35)
    await x.scroll(1200, 0.6)
    await sleep(300)
    await snap('run-started')
    await union('jobs', [`${exact('Jobs', 'main h2, main h3, main *')}?.parentElement`], 10).catch((e) => console.log('no jobs box', e.message))
    await sleep(3000)
    await snap('run-mid')
    await sleep(1500)
    await report('run')
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
