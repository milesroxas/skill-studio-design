/**
 * Films the walkthrough reel: the guided walkthrough a first launch ends on,
 * the Thank-you note skill taken once round the loop, one shot per guide step.
 * Each shot is one mp4, one event log (pointer, presses, measured boxes) and
 * one traced plan in ./out/walkthrough. The steps run in order in one session,
 * so each starts where the last left off; what happens between them (the
 * guide's own Next button, a banner dismissed) happens off camera.
 *   node walkthrough.ts
 *
 * A first launch on a scratch home: the welcome is clicked through, unfilmed.
 * The stand-in claude writes the notes (bin/claude): four sentences under the
 * vague rule, two under the exact one. Jev is real and grades them.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, connect, director, extras, launch, scratch, sleep } from './lib.ts'
import { SKETCH } from './sketch.ts'

// Film only the app as it is: refuse a build older than the newest commit to its source.
const built = statSync(join(ROOT, 'out/main/index.js')).mtimeMs
const committed = Number(execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct', '--', 'src'], { encoding: 'utf8' }).trim()) * 1000
const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim()
if (built < committed || dirty)
  throw new Error(`The build in ${ROOT}/out is older than its source${dirty ? ' (uncommitted changes in src)' : ''}: run pnpm build there first.`)
console.log(`Filming ${execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim()}`)

const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out/walkthrough`
mkdirSync(OUT, { recursive: true })

const s = scratch()
const claudeConfig = join(s.dir, 'claude')
mkdirSync(claudeConfig)
const STUB_LOG = join(s.dir, 'stub.log')
const { app, port } = await launch(s.home, s.profile, {
  PATH: `${HERE}bin:${process.env.PATH}`,
  CLAUDE_CONFIG_DIR: claudeConfig,
  REEL_PACE: '0.5',
  REEL_STUB_LOG: STUB_LOG,
})

const q = JSON.stringify
/** A button or link by the start of its text, enabled. */
const btn = (label: string, sel = 'button, a') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}) && !b.disabled)`
const NEXT = btn('Next:', 'header button, header a')
const RUN = `[...document.querySelectorAll('header button')].find((b) => /^Run v/.test(b.textContent.trim()) && !b.disabled)`
const POPOVER = `document.querySelector('[data-slot="popover-content"]')`
const line = (text: string) => `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(text)}))`
const RULES_HEAD = `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.trim() === 'Rules')`
/** The smallest visible element in `sel` whose text holds `text`. */
const has = (text: string, sel = 'main *') =>
  `[...document.querySelectorAll(${q(sel)})].filter((e) => e.textContent.includes(${q(text)}) && e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]`
/** A field whose value holds `text`. */
const field = (text: string) =>
  `[...document.querySelectorAll('main textarea, main input')].find((e) => e.value.includes(${q(text)}))`
/** The text inside what `find` gives, as a box: its own box can be wider than its words. */
const textIn = (find: string) =>
  `(() => { const e = ${find}; if (!e) return null; const r = document.createRange(); r.selectNodeContents(e); return r })()`
/** The smallest visible element in main whose own text is exactly `text`. */
const exact = (text: string) =>
  `[...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === ${q(text)} && e.getBoundingClientRect().width > 0).sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]`
const SWITCHER = `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('thank-you-note') && /v\\d/.test(b.textContent))`
const GUIDE = `document.querySelector('section[aria-label="Walkthrough"]')`

try {
  let page = await connect(port)
  const waitFor = async (expr: string, ms = 20000) => {
    for (let i = 0; i < ms / 100; i += 1) {
      if (await page.run(`Boolean(${expr})`).catch(() => false)) return
      await sleep(100)
    }
    throw new Error(`Never showed: ${expr}`)
  }

  // Through the welcome to the walkthrough's start, unfilmed.
  await waitFor(btn('See how it works'))
  await page.run(`${btn('See how it works')}.click()`)
  const forward = `[...document.querySelectorAll('main section > div:last-child button')].at(-1)`
  for (let i = 0; i < 3; i += 1) {
    await sleep(500)
    await page.run(`${forward}.click()`)
  }
  for (let i = 0; i < 3; i += 1) {
    await sleep(900)
    await waitFor(`!document.querySelector('main')?.textContent.match(/Loading|Looking for|Checking for/)`)
    await page.run(`${forward}.click()`)
  }
  await sleep(2500)
  page.close()
  page = await connect(port)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await waitFor(NEXT)
  await sleep(1200)

  const d = director(page, OUT)
  const x = extras(page, d, (e) => d.log(e))
  const go = async (find: string, opts: { dx?: number; dy?: number; pause?: number; t?: number } = {}) => {
    await d.move(await d.at(find, opts.dx, opts.dy), opts.t)
    await sleep(opts.pause ?? 80)
    await d.click(80)
  }
  /**
   * Log a named box for the camera: the union of `finds`, padded, then grown
   * until no line of text and no control crosses its edge (as record.ts does).
   */
  const frame = async (name: string, finds: string[], pad = 16, grow = true) => {
    const r = (await page.run(`(() => {
      const targets = [${finds.join(',')}].filter(Boolean)
      const rs = targets.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      if (!rs.length) return null
      let sc = targets[0].nodeType ? targets[0] : targets[0].commonAncestorContainer
      if (sc.nodeType !== 1) sc = sc.parentElement
      while (sc && sc !== document.body) {
        const o = getComputedStyle(sc).overflowY
        if ((o === 'auto' || o === 'scroll') && sc.scrollHeight > sc.clientHeight) break
        sc = sc.parentElement
      }
      const area = sc && sc !== document.body ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
      const lim = { l: Math.max(0, area.left), t: Math.max(0, area.top), r: Math.min(innerWidth, area.right), b: Math.min(innerHeight, area.bottom) }
      const core = {
        l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)),
        r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)),
      }
      let b = { l: Math.max(lim.l, core.l - ${pad}), t: Math.max(lim.t, core.t - ${pad}), r: Math.min(lim.r, core.r + ${pad}), b: Math.min(lim.b, core.b + ${pad}) }
      const seen = (el, r) => [0.05, 0.5, 0.95].some((k) => {
        const hit = document.elementFromPoint(r.left + r.width * k, r.top + r.height / 2)
        return hit && (hit === el || el.contains(hit) || hit.contains(el))
      })
      const solid = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!node.textContent.trim() || !node.parentElement.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5 && seen(node.parentElement, r)) solid.push(r)
      }
      for (const e of document.querySelectorAll('button, input, textarea, [role=radio], [role=checkbox], select'))
        if (e.checkVisibility()) { const r = e.getBoundingClientRect(); if (r.width && r.height && seen(e, r)) solid.push(r) }
      const crosses = (r) => r.left < b.r && r.right > b.l && r.top < b.b && r.bottom > b.t && (r.left < b.l || r.right > b.r || r.top < b.t || r.bottom > b.b)
      for (let pass = 0; pass < (${grow} ? 30 : 0); pass += 1) {
        let grew = false
        for (const r of solid) if (crosses(r)) {
          const next = { ...b }
          if (r.left < b.l) next.l = r.left - 6 >= lim.l ? r.left - 6 : Math.min(core.l, r.right + 6)
          if (r.right > b.r) next.r = r.right + 6 <= lim.r ? r.right + 6 : Math.max(core.r, r.left - 6)
          if (r.top < b.t) next.t = r.top - 6 >= lim.t ? r.top - 6 : Math.min(core.t, r.bottom + 6)
          if (r.bottom > b.b) next.b = r.bottom + 6 <= lim.b ? r.bottom + 6 : Math.max(core.b, r.top - 6)
          if (next.l === b.l && next.r === b.r && next.t === b.t && next.b === b.b) continue
          b = next
          grew = true
        }
        if (!grew) break
      }
      return { x: b.l, y: b.t, w: b.r - b.l, h: b.b - b.t }
    })()`)) as Record<string, number> | null
    if (!r) throw new Error(`No box for ${name}`)
    if (process.env.REEL_DEBUG) console.log(name, r)
    d.log({ kind: 'box', name, ...r })
  }
  /** A box as it is, with no growing: what a note or a ring points at. */
  const mark = async (name: string, find: string) => frame(name, [find], 0, false)
  const snap = async (name: string) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(String(data), 'base64'))
  }
  /** Banners each screen opens with are put away, off camera. */
  const gotIt = () => page.run(`[...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Got it').forEach((b) => b.click())`)
  const prep = async (name: string, setup?: () => Promise<void>) => {
    await gotIt()
    await sleep(500)
    await setup?.()
    await sleep(400)
    writeFileSync(`${OUT}/${name}.plan.json`, JSON.stringify(await page.run(SKETCH)))
    await snap(`${name}-start`)
  }
  const report = async (name: string) => {
    console.log(name, JSON.stringify(await d.end()))
    await snap(`${name}-end`)
  }
  /** Over the editor's text, where the wheel scrolls it. */
  // A fixed point: finding the editor by element would scroll it into view, past its banner.
  const overEditor = async () => d.move({ x: 760, y: 430 }, 0.35)
  const ran = (version: string) => `(${SWITCHER})?.textContent.match(/${version} · [^·]+· mean \\d+/)`

  // 1. Read the skill: its intro, then its rules, then the guide's yellow way on.
  await prep('read', async () => {
    await overEditor()
  })
  await d.begin('read')
  await frame('intro', [`document.querySelector('[aria-label="The walkthrough’s skill"]')`])
  await sleep(1800)
  await x.scroll(330, 0.7)
  await sleep(500)
  await frame('rules', [textIn(RULES_HEAD), textIn(line('Open with the person')), textIn(line('Keep the note to a reasonable length'))])
  await mark('vague', textIn(line('Keep the note to a reasonable length')))
  await sleep(2600)
  await frame('next', [NEXT, RUN], 14)
  await go(NEXT, { t: 0.6 })
  await sleep(900)
  await report('read')

  // 2. Read the cases: three requests; one with what a good note does, then its checks.
  await prep('cases')
  Object.assign(d.cursor, { x: 760, y: 420 })
  await d.begin('cases')
  await frame('task', [btn('A colleague covered a shift', 'main button'), btn('A review done overnight', 'main button'), field('Thank Priya'), field('Two sentences to Priya')])
  await mark('prompt', field('Thank Priya'))
  await sleep(2600)
  await d.move({ x: 760, y: 500 }, 0.3)
  await x.scroll(560, 0.8)
  await sleep(500)
  await frame('checks', [field('The note says Priya covered'), field('The note has exactly two sentences')])
  await mark('two', field('The note has exactly two sentences'))
  await sleep(2600)
  await report('cases')

  // 3. Run the skill: Run, Start a run, and v0 comes back with its score.
  await prep('run', () => page.run(`document.querySelectorAll('main, main *').forEach((e) => { if (e.scrollTop) e.scrollTop = 0 })`).then(() => {}))
  Object.assign(d.cursor, { x: 900, y: 300 })
  await d.begin('run')
  await frame('runbar', [RUN, NEXT].filter(Boolean), 14)
  await go(RUN, { t: 0.55 })
  await waitFor(POPOVER)
  await sleep(400)
  await frame('popover', [POPOVER, RUN], 2, false)
  await sleep(2200)
  await go(btn('Start a run'), { t: 0.4 })
  await waitFor(ran('v0'), 120000)
  await sleep(600)
  await frame('scored', [SWITCHER, btn('Results', 'nav a, nav button')], 10)
  await mark('switcher', SWITCHER)
  await sleep(2400)
  await report('run')

  // 4. Read what the notes missed: the score, the misses, then the note itself.
  await page.run(`${NEXT}.click()`)
  await waitFor(`location.hash.startsWith('#/results')`)
  await sleep(1000)
  await prep('results')
  Object.assign(d.cursor, { x: 1000, y: 520 })
  await d.begin('results')
  await frame('missed', [textIn(has('v0 · As written')), textIn(has('length: 43 words')), textIn(has('The note has exactly two sentences.'))])
  await mark('miss', textIn(has('The note has exactly two sentences.')))
  await sleep(3000)
  await d.move({ x: 900, y: 520 }, 0.3)
  await x.scroll(300, 0.7)
  await sleep(500)
  await frame('note', [textIn(has('Priya, thank you so much')), textIn(has('length: 43 words'))])
  await sleep(2800)
  await report('results')

  // 5. Tighten one rule: the vague rule beside the exact one, swap it in, save.
  await page.run(`${NEXT}.click()`)
  await waitFor(btn('Use the exact rule'))
  await sleep(800)
  await prep('edit')
  Object.assign(d.cursor, { x: 900, y: 560 })
  await d.begin('edit')
  await frame('tighten', [`document.querySelector('[aria-label="Tighten this rule"]')`])
  await sleep(3200)
  await go(btn('Use the exact rule'), { t: 0.5 })
  await sleep(700)
  await overEditor()
  await x.scroll(330, 0.7)
  await sleep(500)
  await frame('exact', [textIn(RULES_HEAD), textIn(line('Open with the person')), textIn(line('Write exactly two sentences'))])
  await mark('newrule', textIn(line('Write exactly two sentences')))
  await sleep(2600)
  const SAVE = btn('Save', 'main button')
  await frame('save', [textIn(has('SKILL.md', 'main *')), SAVE], 12)
  await go(SAVE, { t: 0.55 })
  await waitFor(`!(${SAVE})`)
  await sleep(1000)
  await report('edit')

  // 6. Run it again: same cases, the new rule, and v1 comes back.
  await prep('rerun')
  Object.assign(d.cursor, { x: 900, y: 300 })
  await d.begin('rerun')
  await frame('runbar', [RUN], 14)
  await go(RUN, { t: 0.55 })
  await waitFor(POPOVER)
  await sleep(400)
  await frame('popover', [POPOVER, RUN], 2, false)
  await sleep(1800)
  await go(btn('Start a run'), { t: 0.4 })
  await waitFor(ran('v1'), 120000)
  await sleep(600)
  await frame('scored', [SWITCHER, btn('Results', 'nav a, nav button')], 10)
  await mark('switcher', SWITCHER)
  await sleep(2400)
  await report('rerun')

  // 7. Pick the better note: v0 and v1 side by side, both notes, and B is better.
  await page.run(`${NEXT}.click()`)
  await waitFor(btn('B is better'))
  await sleep(1200)
  await prep('compare')
  Object.assign(d.cursor, { x: 900, y: 520 })
  await d.begin('compare')
  // Every case, v0 against v1: the score each version got.
  await frame('lift', [textIn(has('All cases')), textIn(has('v0 to v1')), textIn(has('A review done overnight'))], 12)
  await mark('gain', textIn(has('v0 to v1')))
  await sleep(3000)
  await d.move({ x: 840, y: 480 }, 0.3)
  await x.scroll(330, 0.7)
  await sleep(500)
  await frame('notes', [textIn(has('Priya, thank you so much')), textIn(has('Priya, thank you for covering'))])
  await mark('short', textIn(has('Priya, thank you for covering')))
  await sleep(3000)
  await frame('pick', [textIn(has('Which is better?')), btn('B is better')], 12)
  await go(btn('B is better'), { t: 0.55 })
  await sleep(1500)
  await frame('done', [GUIDE], 10)
  await sleep(2000)
  await report('compare')

  const calls = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8').split('\n').filter(Boolean) : []
  const runs = calls.filter((c) => !c.startsWith('auth'))
  console.log(`stand-in claude: ${calls.length} calls, ${runs.length} runs`)
  if (runs.length < 6) throw new Error('The runs did not reach the stand-in claude: a real agent may have run. Check the PATH the app used.')
  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) {
    app.kill()
    await new Promise((done) => app.once('exit', done))
  }
  s.remove()
}
