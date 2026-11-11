/**
 * Stills for the Skill Studio work page on milesroxas.com: one PNG per state,
 * at 2x, in ./out/stills. The sample skills come from the app's own guide-shots
 * seed; the editor's AI actions are answered by stills-bin/claude, so no model
 * runs. Jev is real when the checkout's .env holds a TypeSafe key.
 *   ./node_modules/.bin/tsx ../skill-studio-design/recorder/stills.ts [names]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, appReady, connect, launch, scratch, sleep } from './lib.ts'

const W = 1360
const H = 850
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out/stills`
mkdirSync(OUT, { recursive: true })
const ONLY = process.argv[2]?.split(',')
const want = (name: string) => !ONLY || ONLY.includes(name)

const s = scratch()
writeFileSync(join(s.profile, 'window.json'), JSON.stringify({ x: 40, y: 40, width: W, height: H }))
process.env.SKILL_STUDIO_HOME = s.home
const { sample } = await import(join(ROOT, 'scripts/guide-shots/seed.ts'))

// The weak rule the editor shots select, after rule 06, as record.ts does.
const WEAK = 'Try to mention dates when it makes sense.'
const SKILL = join(s.home, 'work/acme-app/.agents/skills/release-notes/SKILL.md')
const ANCHOR = '- State only what the request says. A guessed detail in a release note becomes a support promise.\n'
const text = readFileSync(SKILL, 'utf8')
if (!text.includes(ANCHOR)) throw new Error('The seed skill changed: rule 06 is not where the stills expect it.')
writeFileSync(SKILL, text.replace(ANCHOR, `${ANCHOR}- ${WEAK}\n`))

const STUB_LOG = join(s.dir, 'stub.log')
const { app, port } = await launch(s.home, s.profile, { PATH: `${HERE}stills-bin:${process.env.PATH}`, REEL_STUB_LOG: STUB_LOG })

const q = JSON.stringify
const starts = (label: string, sel = 'button') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}) && b.getBoundingClientRect().width > 0)`
const line = (t: string) => `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(t)}))`
const POPOVER = `document.querySelector('[data-slot="popover-content"]')`

try {
  const page = await connect(port)
  await appReady(page)
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  const waitFor = async (expr: string, ms = 30000) => {
    for (let i = 0; i < ms / 100; i += 1) {
      if (await page.run(`Boolean(${expr})`).catch(() => false)) return
      await sleep(100)
    }
    throw new Error(`Never showed: ${expr}`)
  }
  const settle = (ms = 900) => page.run(`document.fonts.ready.then(() => new Promise((d) => setTimeout(d, ${ms})))`)
  const park = async () => {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  }
  const snap = async (name: string) => {
    await settle(400)
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(String(data), 'base64'))
    console.log(`out/stills/${name}.png`)
  }
  const go = async (route: string) => {
    await page.run(`window.location.hash = ${q(route)}`)
    await settle()
  }
  const mouse = (type: string, x: number, y: number, extra = {}) =>
    page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
  const at = async (find: string, dx = 0.5, dy = 0.5) => {
    const r = (await page.run(`(() => { const e = ${find}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width * ${dx}, y: r.y + r.height * ${dy} } })()`)) as { x: number; y: number } | null
    if (!r) throw new Error(`Nothing matches ${find}`)
    return r
  }
  const click = async (find: string) => {
    const p = await at(find)
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
    await mouse('mousePressed', p.x, p.y)
    await mouse('mouseReleased', p.x, p.y)
    await settle(500)
  }
  /** Drag across the weak rule's words: the editor's selection tools open. */
  const selectWeak = async () => {
    await go('#/editor')
    await page.run(`${line(WEAK)}.scrollIntoView({ block: 'center' })`)
    await settle(400)
    const ends = (await page.run(`(() => {
      const l = ${line(WEAK)}
      const walker = document.createTreeWalker(l, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      let first = null, last = null
      while (walker.nextNode()) {
        const n = walker.currentNode
        const i = n.textContent.indexOf('Try')
        if (i >= 0 && !first) { range.setStart(n, i); range.setEnd(n, i + 1); first = range.getBoundingClientRect() }
      }
      range.selectNodeContents(l)
      const rs = [...range.getClientRects()].filter((r) => r.width > 0)
      last = rs.at(-1)
      return { a: { x: first.left + 1, y: first.top + first.height / 2 }, b: { x: last.right + 2, y: last.top + last.height / 2 } }
    })()`)) as { a: { x: number; y: number }; b: { x: number; y: number } }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ends.a.x, y: ends.a.y })
    await mouse('mousePressed', ends.a.x, ends.a.y)
    for (let k = 1; k <= 12; k += 1)
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ends.a.x + ((ends.b.x - ends.a.x) * k) / 12, y: ends.a.y + ((ends.b.y - ends.a.y) * k) / 12, button: 'left', buttons: 1 })
    await mouse('mouseReleased', ends.b.x, ends.b.y)
    await waitFor(POPOVER)
    await settle(600)
  }
  const escape = async () => {
    for (const type of ['rawKeyDown', 'keyUp'])
      await page.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await settle(300)
  }

  await settle(1500)
  if (want('library')) {
    await go('#/library')
    await park()
    await snap('library')
  }
  await page.run(`${starts(sample.skill, 'button,a')}.click()`)
  await settle()
  if (want('settings')) {
    await go('#/settings')
    await park()
    await snap('settings')
    const sections = (await page.run(`[...document.querySelectorAll('main h2, main h3, main section > div > p:first-child, main [class*="font-medium"]')].map((e) => e.textContent.trim()).filter((t) => t && t.length < 40)`)) as string[]
    console.log('settings sections:', sections.join(' | '))
    let n = 0
    for (const label of ['Claude', 'Models', 'Model', 'Jev', 'TypeSafe']) {
      const found = await page.run(`(() => { const e = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && e.textContent.trim() === ${q(label)}); if (!e) return false; e.scrollIntoView({ block: 'start' }); return true })()`)
      if (!found) continue
      n += 1
      await settle(500)
      await park()
      await snap(`settings-${label.toLowerCase()}`)
    }
    if (!n) console.log('no AI section label found')
  }
  if (want('results')) {
    await go(`#/results?case=${sample.case}`)
    await park()
    await snap('results')
    await page.run(`${starts('Word diff')}.click()`)
    await settle()
    await park()
    await snap('results-diff')
    await page.run(`${starts('Side by side')}.click()`)
    await settle()
    await click(starts('Mark as met'))
    await park()
    await snap('results-marked')
  }
  if (want('editor')) {
    await go('#/editor')
    await park()
    await snap('editor')
    await selectWeak()
    await snap('editor-tools')
    await click(starts('Suggest changes'))
    await waitFor(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Best practice')); return b && !b.disabled && !${POPOVER}?.querySelector('[aria-busy="true"]') })()`, 120000)
    await settle(600)
    await snap('editor-rewrites')
    await escape()
    await selectWeak()
    await click(starts('Auto refine'))
    await settle(4000)
    await snap('editor-refine')
    await escape()
  }
  if (want('replaced')) {
    await selectWeak()
    await click(starts('Auto refine'))
    await waitFor(starts('Replace'), 60000)
    await settle(800)
    await click(starts('Replace'))
    await settle(800)
    await park()
    await snap('editor-replaced')
    await page.run(`${starts('Changes')}.click()`)
    await settle(1200)
    await park()
    await snap('editor-changes')
    await page.run(`${starts('Formatted')}.click()`)
    await settle(600)
  }
  if (want('improve')) {
    await selectWeak()
    await click(starts('Help me improve'))
    await settle(4000)
    await snap('improve-question')
    const composer = `[...document.querySelectorAll('textarea')].find((t) => t.placeholder?.startsWith('Answer'))`
    const answers = ['Only when a change starts or stops on a set day, like a removal.', 'In the title, so it is the first thing they read.']
    for (const answer of answers) {
      if (!(await page.run(`Boolean(${composer})`))) break
      await click(composer)
      await page.send('Input.insertText', { text: answer })
      for (const type of ['keyDown', 'keyUp'])
        await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined })
      await settle(4000)
      await snap(`improve-${answers.indexOf(answer) + 2}`)
    }
  }
  console.log(`stand-in claude: ${readFileSync(STUB_LOG, 'utf8').split('\n').filter(Boolean).length} calls`)
  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) {
    app.kill()
    await new Promise((done) => app.once('exit', done))
  }
  s.remove()
}
