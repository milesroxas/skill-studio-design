/**
 * Films the reel's five click-throughs on the app: one mp4, one event log and
 * one traced plan per shot, in ./out. Each shot starts already on its screen;
 * typing runs on a steady clock. The shots follow the app's loop: improve a
 * weak rule with the editor's Suggest changes, run the new version, see the
 * lift, compare two outputs word for word, then correct Jev and pick the
 * better one. Every box the film moves its camera to is measured here, on the
 * screen as it is at that moment (frame()).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, appReady, connect, director, extras, launch, scratch, sleep } from './lib.ts'
import { DIFF, LIFT, RULE, SKETCH } from './sketch.ts'

// Film only the app as it is: refuse a build older than the newest commit to its source.
const built = statSync(join(ROOT, 'out/main/index.js')).mtimeMs
const committed = Number(execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct', '--', 'src'], { encoding: 'utf8' }).trim()) * 1000
const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'src'], { encoding: 'utf8' }).trim()
if (built < committed || dirty)
  throw new Error(`The build in ${ROOT}/out is older than its source${dirty ? ' (uncommitted changes in src)' : ''}: run pnpm build there first.`)
console.log(`Filming ${execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim()}`)

const s = scratch()
process.env.SKILL_STUDIO_HOME = s.home
const { sample } = await import(join(ROOT, 'scripts/guide-shots/seed.ts'))
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out`
const ONLY = process.argv[2]

// The write shot improves a weak rule: it stands in the skill's files as they are
// now, after rule 06, so the editor opens on it. The stand-in claude answers
// Suggest changes for exactly this rule (bin/claude).
// Jev reads each rewrite against it and warns when one drops a fact, so the
// rewrites (bin/claude) keep all it says: the limit and the why. Only the hedge
// goes. The stand-in's notes keep to it, so the new version scores no lower.
const WEAK = 'Try to keep each paragraph to two sentences or fewer, because readers skim release notes.'
const SKILL = join(s.home, 'work/acme-app/.agents/skills/release-notes/SKILL.md')
const ANCHOR = '- State only what the request says. A guessed detail in a release note becomes a support promise.\n'
const text = readFileSync(SKILL, 'utf8')
if (!text.includes(ANCHOR)) throw new Error('The seed skill changed: rule 06 is not where the reel expects it.')
writeFileSync(SKILL, text.replace(ANCHOR, `${ANCHOR}- ${WEAK}\n`))

// REEL_PACE speeds the stand-in claude up, so the run's count moves inside the shot.
// It logs each call to REEL_STUB_LOG, so the run shot can prove no real agent ran.
const STUB_LOG = join(s.dir, 'stub.log')
const { app, port } = await launch(s.home, s.profile, { PATH: `${HERE}bin:${process.env.PATH}`, REEL_PACE: '0.3', REEL_STUB_LOG: STUB_LOG })

const q = JSON.stringify
/** A button by the start of its text: a busy button carries its busy label in its text too. */
const starts = (label: string, sel = 'button') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}))`
/** A button whose text holds `label` anywhere. */
const holding = (label: string, sel = 'button') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.includes(${q(label)}))`
const line = (text: string) =>
  `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(text)}))`
/** The smallest element on screen in main whose own text is exactly `text`. */
const exact = (text: string, sel = 'main *') =>
  `[...document.querySelectorAll(${q(sel)})].filter((e) => e.textContent.trim() === ${q(text)} && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0).sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0]`
/** The text inside what `find` gives, as a box: its own box can be wider than its words. */
const textIn = (find: string) =>
  `(() => { const e = ${find}; if (!e) return null; const r = document.createRange(); r.selectNodeContents(e); return r })()`
const POPOVER = `document.querySelector('[data-slot="popover-content"]')`

try {
  const page = await connect(port)
  await appReady(page)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await sleep(1500)
  await page.run(`${starts(sample.skill, 'button,a')}.click()`)
  await sleep(900)
  for (const route of ['#/editor', '#/cases', `#/results?case=${sample.case}`, '#/results?view=all']) {
    await page.run(`window.location.hash = ${q(route)}`)
    await sleep(700)
  }
  const d = director(page, OUT)
  const x = extras(page, d, (e) => d.log(e))
  /** Where a letter of an editor line is: `at` 'start' before its first letter, 'end' past its last. */
  const lineAt = (text: string, at: 'start' | 'end') =>
    page.run(`(() => {
      const l = ${line(text)}
      const range = document.createRange()
      range.selectNodeContents(l)
      const rs = [...range.getClientRects()].filter((r) => r.width > 0)
      if (${q(at)} === 'end') {
        const r = rs.at(-1)
        return { x: r.right + 3, y: r.top + r.height / 2 }
      }
      // The rule's own first letter: the list marker before it is hidden, and is not the rule.
      const walker = document.createTreeWalker(l, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const i = node.textContent.indexOf(${q(text)}.slice(0, 6))
        if (i < 0) continue
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const r = range.getBoundingClientRect()
        return { x: r.left + 0.5, y: r.top + r.height / 2 }
      }
      return null
    })()`) as Promise<{ x: number; y: number }>
  const go = async (find: string, opts: { dx?: number; dy?: number; pause?: number; hold?: number; t?: number } = {}) => {
    await d.move(await d.at(find, opts.dx, opts.dy), opts.t)
    await sleep(opts.pause ?? 70)
    await d.click(opts.hold)
  }
  /** Press at `from`, drag to `to` over `seconds` with the button held, and let go: a selection. */
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, seconds = 0.6) => {
    await d.move(from)
    await sleep(80)
    d.log({ kind: 'down', x: from.x, y: from.y })
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
    const t0 = d.now()
    d.log({ kind: 'move', x0: from.x, y0: from.y, x: to.x, y: to.y, t1: t0 + seconds })
    const start = Date.now()
    for (;;) {
      const u = Math.min(1, (Date.now() - start) / (seconds * 1000))
      const k = u * u * (3 - 2 * u)
      d.cursor.x = from.x + (to.x - from.x) * k
      d.cursor.y = from.y + (to.y - from.y) * k
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d.cursor.x, y: d.cursor.y, button: 'left', buttons: 1 })
      if (u >= 1) break
      await sleep(14)
    }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 })
    d.log({ kind: 'up', x: to.x, y: to.y })
  }
  /**
   * Log a named box for the camera: the union of `finds`, padded, then grown
   * until no line of text and no control crosses its edge, so nothing the film
   * shows is cut. It stays inside the window. Without `grow` it is the union as
   * it is: for a part with its own edges, such as a bar.
   */
  const frame = async (name: string, finds: string[], pad = 16, grow = true) => {
    const r = (await page.run(`(() => {
      const targets = [${finds.join(',')}].filter(Boolean)
      const rs = targets.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      if (!rs.length) return null
      // The box stays inside the scroll area the first target is in: past its edge the app itself hides what is there.
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
      let b = {
        l: Math.max(lim.l, core.l - ${pad}),
        t: Math.max(lim.t, core.t - ${pad}),
        r: Math.min(lim.r, core.r + ${pad}),
        b: Math.min(lim.b, core.b + ${pad}),
      }
      // Seen at all: not wholly under something drawn over it, such as a popover.
      const seen = (el, r) => [0.05, 0.5, 0.95].some((k) => {
        const hit = document.elementFromPoint(r.left + r.width * k, r.top + r.height / 2)
        return hit && (hit === el || el.contains(hit) || hit.contains(el))
      })
      // What must never be cut: each line of visible text, and each control.
      const solid = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!node.textContent.trim() || !node.parentElement.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5 && seen(node.parentElement, r)) { r.why = node.textContent.trim().slice(0, 30); solid.push(r) }
      }
      for (const e of document.querySelectorAll('button, input, textarea, [role=radio], [role=checkbox], select'))
        if (e.checkVisibility()) { const r = e.getBoundingClientRect(); if (r.width && r.height && seen(e, r)) { r.why = e.tagName + ' ' + e.textContent.trim().slice(0, 20); solid.push(r) } }
      const crosses = (r) => r.left < b.r && r.right > b.l && r.top < b.b && r.bottom > b.t && (r.left < b.l || r.right > b.r || r.top < b.t || r.bottom > b.b)
      const why = []
      for (let pass = 0; pass < (${grow} ? 30 : 0); pass += 1) {
        let grew = false
        for (const r of solid) if (crosses(r)) {
          why.push(r.why + ' @' + [r.left, r.top, r.width, r.height].map(Math.round).join(','))
          // Take it in, with a little air, when that stays in the scroll area; otherwise
          // leave it out: the edge moves back to just short of it, never into what the targets need.
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
      return { x: b.l, y: b.t, w: b.r - b.l, h: b.b - b.t, grew: [rs.map((r) => [r.left, r.top, r.width, r.height].map(Math.round).join(',')).join(' ; '), ...why.slice(0, 12)] }
    })()`)) as (Record<string, number> & { grew?: string[] }) | null
    if (!r) throw new Error(`No box for ${name}`)
    if (process.env.REEL_DEBUG) console.log(name, r.grew)
    delete r.grew
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
  /** Every scroller in the screen back at its top, as a screen opened fresh would be. */
  const toTop = () => page.run(`document.querySelectorAll('main, main *').forEach((e) => { if (e.scrollTop) e.scrollTop = 0 })`)
  const snap = async (name: string) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(String(data), 'base64'))
  }
  const report = async (name: string) => console.log(name, JSON.stringify(await d.end()))
  const want = (name: string) => !ONLY || ONLY.split(',').includes(name)

  // 1. Write: select a weak rule; Suggest changes offers three rewrites; Best
  // practice takes its place. The film shows only the rewrites and the rule
  // replaced. Saved off camera.
  if (want('write')) {
    const BETTER = 'Keep each paragraph to two sentences or fewer.'
    await prep('write', '#/editor', async () => {
      await d.move({ x: 700, y: 500 }, 0.2)
      await x.scroll(260, 0.3)
      await sleep(500)
    })
    // The rule as it stands, so the film can set the rewrite in over it.
    writeFileSync(`${OUT}/write.old.json`, JSON.stringify(await page.run(RULE(WEAK))))
    Object.assign(d.cursor, { x: 900, y: 660 })
    await d.begin('write')
    await frame('rules', [textIn(exact('Rules', 'main *')), textIn(line('Start with a one-line title')), textIn(line(WEAK))])
    await sleep(500)
    await drag(await lineAt(WEAK, 'start'), await lineAt(WEAK, 'end'), 0.7)
    await sleep(600)
    await frame('tools', [POPOVER, textIn(line(WEAK))], 6)
    await snap('write-tools')
    await sleep(1500)
    await go(starts('Suggest changes'))
    // The cards show at once and say "Writing…" until the rewrites are in and Jev has
    // read them: wait for the first card to turn pickable and the popout to stop.
    const written = `(() => { const b = ${holding('Best practice')}; return Boolean(b && !b.disabled && !${POPOVER}?.querySelector('[aria-busy="true"]')) })()`
    for (let i = 0; ; i += 1) {
      if (await page.run(written)) break
      if (i > 300) throw new Error('The rewrites never came in.')
      await sleep(100)
    }
    await sleep(300)
    await frame('rewrites', [POPOVER, textIn(line(WEAK))], 6)
    await snap('write-rewrites')
    await sleep(1800)
    await go(holding('Best practice'), { dx: 0.3, dy: 0.3 })
    await sleep(900)
    writeFileSync(`${OUT}/write.new.json`, JSON.stringify(await page.run(RULE(BETTER))))
    await frame('better', [textIn(exact('Rules', 'main *')), textIn(line('Start with a one-line title')), textIn(line(BETTER))])
    await sleep(1400)
    await report('write')
    await snap('write-end')
    // Off camera: save, so the run shot keeps these files as v2.
    await page.run(`${starts('Save', 'main button')}.click()`)
    await sleep(1200)
  }

  // 2. Results: the version lift, then the runs under it; one opens.
  if (want('results')) {
    await prep('results', '#/results?view=all')
    // The version lift, as it is drawn: every text, the ribbon, the rule under it, so the film can build it up.
    writeFileSync(`${OUT}/results.lift.json`, JSON.stringify(await page.run(LIFT)))
    Object.assign(d.cursor, { x: 760, y: 560 })
    await d.begin('results')
    await frame('lift', [`document.querySelector('figure[aria-label^="Version lift"]')`], 20)
    await sleep(1200)
    d.mark('scroll0')
    await x.scroll(250, 0.25)
    d.mark('scroll1')
    await sleep(250)
    await frame('rows', [textIn(exact('Mean', 'main *')), starts('v0 · Claude Sonnet', 'main button'), starts('v1 · Claude Sonnet', 'main button')])
    await go(starts('v1 · Claude Sonnet', 'main button'), { dx: 0.3 })
    await sleep(700)
    await frame('open', [textIn(exact('Mean', 'main *')), starts('v1 · Claude Sonnet', 'main button'), starts('Changes since this run', 'main button')])
    await sleep(1800)
    await report('results')
    await snap('results-end')
  }

  // 3. Pick: Jev missed a rule the output kept; mark it met, then pick the better output.
  if (want('pick')) {
    await prep('pick', `#/results?case=${sample.case}`, async () => {
      await page.run(`${starts('Side by side', 'main button')}.click()`)
      await sleep(300)
      await toTop()
      // The cards' titles just under the case's header, so the cards fit above the bar
      // once a verdict is marked. The header stays put over the scroll area: measure from its foot.
      await page.run(`(() => {
        const t = ${exact('v0 · First draft', 'main *')}
        const head = ${starts('Side by side', 'main button')}.closest('header, [class*="border-b"]') ?? ${starts('Side by side', 'main button')}
        let sc = t
        while (sc && !(['auto', 'scroll'].includes(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement
        if (sc) sc.scrollTop += t.getBoundingClientRect().top - head.getBoundingClientRect().bottom - 76
      })()`)
    })
    Object.assign(d.cursor, { x: 760, y: 380 })
    await d.begin('pick')
    await sleep(300)
    await go(starts('Mark as met', 'main button'))
    await sleep(1100)
    // Measured once marked: the card is at its longest then.
    // Both cards from their titles and scores down to the verdict just marked.
    await frame('cards', [textIn(exact('v0 · First draft', 'main *')), textIn(exact('v1 · Lead with the change', 'main *')), starts('Take back', 'main button')])
    // The bar is a row with its own edges: framed as it is.
    await frame('bar', [`(() => { let e = ${exact('Which is better?', 'main *')}; while (e && e.getBoundingClientRect().width < 640) e = e.parentElement; return e })()`], 0, false)
    await go(starts('B is better', 'main button'))
    await sleep(1400)
    await report('pick')
    await snap('pick-end')
  }

  // 4. Compare: v0 against v1, word for word.
  if (want('compare')) {
    await prep('compare', `#/results?case=${sample.case}`, async () => {
      await toTop()
    })
    Object.assign(d.cursor, { x: 860, y: 230 })
    await d.begin('compare')
    await frame('head', [starts('Side by side', 'main button'), starts('Edit case', 'main button'), `document.querySelector('[aria-label="Output B"]')`, starts('The prompt and its checks', 'main button')])
    await sleep(300)
    await go(starts('Word diff', 'main button'))
    await sleep(500)
    writeFileSync(`${OUT}/compare.diff.json`, JSON.stringify(await page.run(DIFF)))
    await frame('diff', [`[...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === 'Diff').map((e) => { let b = e; while (b && b.getBoundingClientRect().height < 300) b = b.parentElement; return b })[0]`], 12)
    await sleep(1600)
    await report('compare')
    await snap('compare-end')
  }

  // 5. Run, filmed last: it leaves a run behind. The files changed in the write
  // shot, so Run is yellow and keeps them as v2; the run is named, then started.
  if (want('run')) {
    await prep('run', '#/editor')
    Object.assign(d.cursor, { x: 860, y: 300 })
    await d.begin('run')
    await sleep(150)
    await go(starts('Run v'))
    await sleep(450)
    await frame('panel', [POPOVER, starts('Run v')], 6)
    await go('document.getElementById("run-name")', { dx: 0.3 })
    await d.type('Short paragraphs', 60)
    await sleep(200)
    await go(starts('Start a run'))
    await sleep(300)
    await d.move({ x: 700, y: 560 }, 0.35)
    await snap('run-started')
    await sleep(2500)
    await frame('versions', [exact('Versions', 'main *'), starts('v2 · Short paragraphs', 'main button'), starts('v0 · First draft', 'main button')])
    await snap('run-mid')
    await sleep(2000)
    await report('run')
    await snap('run-end')
    const calls = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8').split('\n').filter((l) => l && !l.startsWith('auth') && !l.includes('--json-schema')) : []
    if (!calls.length)
      throw new Error('The run did not reach the stand-in claude: a real agent may have run. Check the PATH the app used.')
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
