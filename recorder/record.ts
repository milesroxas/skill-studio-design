/**
 * Films the reel's beats on the app: one mp4, one event log and one traced plan
 * per beat, in ./out. Four chapters, as a skill is worked on: the library (find,
 * create, resume), the editor and its AI (lint, chat, suggest), cases (case,
 * run) and results (design, diff, lift). Each beat starts already on its
 * screen; typing runs on a steady clock. Every box the film moves its camera to
 * is measured here, on the screen as it is at that moment (frame()).
 *   node record.ts [beat,beat]   (from recorder/, with the app's tsx; see README)
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
// The guide's sample, and two landing-pages runs whose pages the results scene compares.
const { sample, design } = await import('./reel-seed.ts')
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out`
const ONLY = process.argv[2]

// The write shot improves a weak rule: it stands in the skill's files as they are
// now, after rule 06, so the editor opens on it. The stand-in claude answers
// Suggest changes for exactly this rule (bin/claude).
// Jev reads each rewrite against it and warns when one drops a fact, so the
// rewrites (bin/claude) keep all it says: the limit and the why. Only the hedge
// goes. The stand-in's notes keep to it, so the new version scores no lower.
const WEAK = 'Try to keep paragraphs short, because readers skim release notes.'
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
  const go = async (find: string, opts: { dx?: number; dy?: number; pause?: number; hold?: number; t?: number } = {}) => {
    // The screen as it stands before each click, so the beat's part holds what it shows.
    await part()
    await d.move(await d.at(find, opts.dx, opts.dy), opts.t)
    await sleep(opts.pause ?? 70)
    await d.click(opts.hold)
  }
  /**
   * Log a named box for the camera: the union of `finds`, padded, then grown
   * until no line of text and no control crosses its edge, so nothing the film
   * shows is cut. It stays inside the window. Without `grow` it is the union as
   * it is: for a part with its own edges, such as a bar.
   */
  const frame = async (name: string, finds: string[], pad = 16, grow = true, seed?: { x: number; y: number; w: number; h: number }) => {
    const r = (await page.run(`(() => {
      const targets = [${finds.join(',')}].filter(Boolean)
      const rs = targets.map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      const seed = ${JSON.stringify(seed ?? null)}
      if (seed) rs.push({ left: seed.x, top: seed.y, right: seed.x + seed.w, bottom: seed.y + seed.h, width: seed.w, height: seed.h })
      if (!rs.length) return null
      // The box stays inside the scroll area the first target is in: past its edge the app itself hides what is there.
      let sc = targets[0] ? (targets[0].nodeType ? targets[0] : targets[0].commonAncestorContainer) : null
      if (sc && sc.nodeType !== 1) sc = sc.parentElement
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
    const box = r as Box
    if (name === 'part') beatPart = box
    else await part(box)
  }
  type Box = { x: number; y: number; w: number; h: number }
  /** The beat's part so far: every box measured in it, as one. */
  let beatPart: Box | null = null
  /**
   * The beat's one part, which the film shows all beat: every box measured in
   * it as one, grown against the screen each time a box is added and once more
   * as the beat ends, so no line the screen shows at any of those moments is
   * cut where its edge falls. A grown box only gets larger.
   */
  const part = async (add?: Box) => {
    const all = [beatPart, add].filter(Boolean) as Box[]
    if (!all.length) return
    const x0 = Math.min(...all.map((b) => b.x))
    const y0 = Math.min(...all.map((b) => b.y))
    const x1 = Math.max(...all.map((b) => b.x + b.w))
    const y1 = Math.max(...all.map((b) => b.y + b.h))
    await frame('part', [], 0, true, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
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
  const report = async (name: string) => {
    await part()
    beatPart = null
    console.log(name, JSON.stringify(await d.end()))
  }
  const want = (name: string) => !ONLY || ONLY.split(',').includes(name)

  /** Open a skill from the library, off camera. */
  const openSkill = async (name: string) => {
    await page.run(`window.location.hash = '#/library'`)
    await sleep(800)
    await page.run(`${starts(name, 'main button, main a')}.click()`)
    await sleep(1000)
  }
  const SEARCH = `document.querySelector('input[aria-label="Search skills"]')`
  /** The smallest block round `find` that is at least `w` px wide: a section, a panel. */
  const wide = (find: string, w = 600, h = 0) =>
    `(() => { let e = ${find}; while (e && (e.getBoundingClientRect().width < ${w} || e.getBoundingClientRect().height < ${h})) e = e.parentElement; return e })()`
  const CHAT = wide(`document.querySelector('[aria-label="New conversation"]')`, 300, 600)
  const ADD = `[...document.querySelectorAll('button')].find((b) => /^AddAdding/.test(b.textContent.trim()) && b.closest('[aria-label="New conversation"]') === null && ${CHAT}?.contains(b))`
  const WEAK_LINE = line(WEAK)

  // ── 1. Library: find a skill, start a new one, pick one back up. ──

  // Search narrows the library as it is typed.
  if (want('find')) {
    await prep('find', '#/library', async () => {
      await page.run(`(() => { const i = ${SEARCH}; i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await toTop()
    })
    Object.assign(d.cursor, { x: 760, y: 420 })
    await d.begin('find')
    await frame('library', [SEARCH, starts('New skill', 'main button'), textIn(exact('In progress')), `[...document.querySelectorAll('main button, main a')].filter((b) => b.textContent.trim().startsWith('unit-tests'))[0]`])
    await sleep(300)
    await go(SEARCH, { dx: 0.3 })
    await sleep(150)
    await d.type('release', 85)
    await sleep(1400)
    await report('find')
    await snap('find-end')
  }

  // New skill: its form, a name typed, a template picked. Cancelled off camera.
  if (want('create')) {
    await prep('create', '#/library', async () => {
      await page.run(`(() => { const i = ${SEARCH}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await toTop()
    })
    Object.assign(d.cursor, { x: 900, y: 300 })
    await d.begin('create')
    await frame('top', [SEARCH, starts('New skill', 'main button'), textIn(exact('In progress'))])
    await sleep(200)
    await go(starts('New skill', 'main button'))
    await sleep(700)
    await frame('form', [textIn(exact('New skill', 'main h1, main h2, main h3')), 'document.getElementById("ns-name")', starts('Create skill', 'main button'), exact('Design', 'main button, main [role=radio]')])
    await d.move(await d.at('document.getElementById("ns-name")', 0.2), 0.4)
    await d.type('launch-email', 70)
    await sleep(250)
    await go(exact('Writing', 'main button, main [role=radio]'))
    await sleep(1200)
    await report('create')
    await snap('create-end')
    await page.run(`${starts('Cancel', 'main button')}?.click()`)
    await sleep(600)
  }

  // In progress: the skills with cases or runs. One opens where it was left.
  if (want('resume')) {
    await prep('resume', '#/library', async () => {
      await toTop()
    })
    Object.assign(d.cursor, { x: 900, y: 600 })
    await d.begin('resume')
    await frame('library', [SEARCH, starts('New skill', 'main button'), textIn(exact('In progress')), `[...document.querySelectorAll('main button, main a')].filter((b) => b.textContent.trim().startsWith('unit-tests'))[0]`])
    // A moment to read the list, a hover on the skill picked back up, then the click.
    await sleep(700)
    await d.move(await d.at(starts(sample.skill, 'main button, main a'), 0.3), 0.8)
    await sleep(600)
    await go(starts(sample.skill, 'main button, main a'), { dx: 0.3, t: 0.15 })
    await sleep(1000)
    await report('resume')
    await snap('resume-end')
  }

  // ── 2. Editor: the writing checks, the assistant, Suggest changes. ──

  /** The editor on the rules, the weak rule in view. */
  const onRules = async () => {
    await toTop()
    await d.move({ x: 700, y: 500 }, 0.2)
    await x.scroll(300, 0.3)
    await sleep(500)
  }

  // A hedge in the weak rule is underlined; hovering it says what the checks found.
  if (want('lint')) {
    await openSkill(sample.skill)
    await prep('lint', '#/editor', onRules)
    Object.assign(d.cursor, { x: 900, y: 640 })
    await d.begin('lint')
    await sleep(500)
    await d.move(await d.at(`${WEAK_LINE}.querySelector('.cm-md-flag')`, 0.5, 0.6), 0.6)
    await sleep(900)
    await frame('check', [textIn(exact('Rules', 'main *')), `document.querySelector('[aria-label="Writing check"]')`, textIn(WEAK_LINE)])
    await snap('lint-check')
    await sleep(1800)
    await report('lint')
    await snap('lint-end')
    await d.move({ x: 1100, y: 700 }, 0.2)
  }

  // The assistant: asked which rules are vague, it names the weak one and offers a case.
  if (want('chat')) {
    await prep('chat', '#/editor', onRules)
    Object.assign(d.cursor, { x: 900, y: 300 })
    await d.begin('chat')
    await go(`document.querySelector('header [aria-label="Assistant"], [aria-label="Assistant"]')`)
    await sleep(800)
    await frame('panel', [CHAT], 0, false)
    await go(starts('Which rules in', 'button'), { dx: 0.3 })
    const added = `(() => { const b = ${ADD}; return Boolean(b && !b.disabled && !document.querySelector('[aria-label="Stop"]')) })()`
    for (let i = 0; ; i += 1) {
      if (await page.run(added)) break
      if (i > 300) { await snap('chat-fail'); throw new Error('The assistant never answered.') }
      await sleep(100)
    }
    await sleep(700)
    await frame('reply', [CHAT], 0, false)
    await snap('chat-reply')
    await go(ADD)
    await sleep(1400)
    await report('chat')
    await snap('chat-end')
    await page.run(`document.querySelector('[aria-label="Close the assistant"]')?.click()`)
    await sleep(600)
  }

  // Suggest changes: the rule's number selects it; three rewrites; Best practice takes its place.
  if (want('suggest')) {
    const BETTER = 'Keep each paragraph to two sentences or fewer.'
    await prep('suggest', '#/editor', onRules)
    writeFileSync(`${OUT}/suggest.old.json`, JSON.stringify(await page.run(RULE(WEAK))))
    Object.assign(d.cursor, { x: 900, y: 660 })
    await d.begin('suggest')
    await sleep(300)
    await go(`${WEAK_LINE}.querySelector('.cm-md-rulenum')`)
    await sleep(900)
    await frame('tools', [POPOVER, textIn(WEAK_LINE)], 6)
    await snap('suggest-tools')
    await sleep(900)
    await go(starts('Suggest changes'))
    const written = `(() => { const b = ${holding('Best practice')}; return Boolean(b && !b.disabled && !${POPOVER}?.querySelector('[aria-busy="true"]')) })()`
    for (let i = 0; ; i += 1) {
      if (await page.run(written)) break
      if (i > 300) throw new Error('The rewrites never came in.')
      await sleep(100)
    }
    await sleep(300)
    await frame('rewrites', [POPOVER, textIn(WEAK_LINE)], 6)
    await snap('suggest-rewrites')
    await sleep(1500)
    await go(holding('Best practice'), { dx: 0.3, dy: 0.3 })
    await sleep(900)
    writeFileSync(`${OUT}/suggest.new.json`, JSON.stringify(await page.run(RULE(BETTER))))
    await frame('better', [textIn(exact('Rules', 'main *')), textIn(line('Start with a one-line title')), textIn(line(BETTER))])
    await sleep(1400)
    await report('suggest')
    await snap('suggest-end')
    // Off camera: save, so the run beat keeps these files as v2.
    await page.run(`${starts('Save', 'main button')}.click()`)
    await sleep(1200)
  }

  // ── 3. Cases: write a case once; every version runs it. ──

  if (want('case')) {
    await prep('case', '#/cases', toTop)
    Object.assign(d.cursor, { x: 700, y: 400 })
    await d.begin('case')
    await frame('list', [`document.querySelector('[aria-label="Add a case"]')`, `[...${wide(`document.querySelector('[aria-label="Add a case"]')`, 200, 500)}.querySelectorAll('a, button')].at(-1)`])
    await sleep(400)
    await go(`document.querySelector('[aria-label="Add a case"]')`)
    await sleep(700)
    await go('document.getElementById("case-prompt")', { dx: 0.2, dy: 0.3 })
    await frame('form', [`document.getElementById("case-prompt")`, `document.getElementById("case-title")`, starts('Add case', 'main button'), textIn(exact('New case', 'main *'))])
    await d.type('Write a release note: dark mode is on for every account from today.', 34)
    await sleep(250)
    await go('document.getElementById("case-title")', { dx: 0.2 })
    await d.type('Dark mode for everyone', 45)
    await sleep(300)
    await go(starts('Add case', 'main button'))
    await sleep(1000)
    await frame('saved', [`document.querySelector('[aria-label="Add a case"]')`, `[...${wide(`document.querySelector('[aria-label="Add a case"]')`, 200, 500)}.querySelectorAll('a, button')].at(-1)`])
    await sleep(1200)
    await report('case')
    await snap('case-end')
  }

  // ── 4. Results: two designs, two notes word for word, the lift. ──

  // The pricing page v0 drew, then v1's: the same case, flipped in one frame.
  if (want('design')) {
    await openSkill(design.skill)
    const STAGE = `document.querySelector('[aria-label="Output in view"]')`
    const side = (k: string) => `[...${STAGE}.querySelectorAll('button, [role=radio]')].find((b) => b.textContent.trim().startsWith(${q(k)}))`
    await prep('design', `#/results?case=${design.case}`, async () => {
      await toTop()
      await page.run(`${side('A')}.click()`)
      await sleep(900)
    })
    Object.assign(d.cursor, { x: 800, y: 420 })
    await d.begin('design')
    await frame('stage', [wide(`document.querySelector('main iframe')`, 500, 300), STAGE], 8)
    await sleep(1000)
    await go(side('B'))
    await sleep(1600)
    await go(side('A'))
    await sleep(900)
    await go(side('B'))
    await sleep(1400)
    await report('design')
    await snap('design-end')
    await openSkill(sample.skill)
  }

  // v0 against v1, word for word.
  if (want('diff')) {
    await prep('diff', `#/results?case=${sample.case}`, toTop)
    Object.assign(d.cursor, { x: 860, y: 230 })
    await d.begin('diff')
    await frame('head', [starts('Side by side', 'main button'), `document.querySelector('[aria-label="Output B"]')`, starts('The prompt and its checks', 'main button')])
    await sleep(300)
    await go(starts('Word diff', 'main button'))
    await sleep(500)
    writeFileSync(`${OUT}/diff.diff.json`, JSON.stringify(await page.run(DIFF)))
    await frame('diff', [`[...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === 'Diff').map((e) => { let b = e; while (b && b.getBoundingClientRect().height < 300) b = b.parentElement; return b })[0]`], 12)
    await sleep(1600)
    await report('diff')
    await snap('diff-end')
  }

  // The version lift: every version on one scale.
  if (want('lift')) {
    await prep('lift', '#/results?view=all')
    writeFileSync(`${OUT}/lift.lift.json`, JSON.stringify(await page.run(LIFT)))
    Object.assign(d.cursor, { x: 1100, y: 700 })
    await d.begin('lift')
    await frame('lift', [`document.querySelector('figure[aria-label^="Version lift"]')`], 20)
    await sleep(3000)
    await report('lift')
    await snap('lift-end')
  }

  // Run, filmed last: it leaves a run behind. The files changed in the suggest
  // beat, so Run keeps them as v2 and runs every case on them.
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
    await go(`[...${POPOVER}.querySelectorAll('button')].find((b) => /^Run \\d|^Start/.test(b.textContent.trim()))`)
    await sleep(300)
    await d.move({ x: 700, y: 560 }, 0.35)
    await snap('run-started')
    await sleep(2500)
    await frame('versions', [exact('Versions', 'main *'), starts('v2 · Short paragraphs', 'main button'), starts('v0 · First draft', 'main button')])
    await snap('run-mid')
    await sleep(2000)
    await report('run')
    await snap('run-end')
    const calls = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8').split('\n').filter((l) => l && !l.startsWith('auth') && !l.includes('--json-schema') && !l.includes('--system-prompt')) : []
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
