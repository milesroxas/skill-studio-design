/** Looks at the screens the portfolio shots will use, on the current app, and prints what is clickable. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, appReady, connect, launch, scratch, sleep } from '../lib.ts'

const s = scratch()
process.env.SKILL_STUDIO_HOME = s.home
const { sample } = await import(join(ROOT, 'scripts/guide-shots/seed.ts'))
const HERE = new URL('.', import.meta.url).pathname
const OUT = `${HERE}out/explore`
mkdirSync(OUT, { recursive: true })
const { app, port } = await launch(s.home, s.profile, { PATH: `${HERE}bin:${process.env.PATH}` })
const q = JSON.stringify
const press = (page: any, label: string, sel = 'button') =>
  page.run(`(() => { const b = [...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)})); b?.click(); return Boolean(b) })()`)
try {
  const page = await connect(port)
  await appReady(page)
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  const shot = async (name: string) => {
    await sleep(900)
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
    writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(String(data), 'base64'))
    const labels = await page.run(`JSON.stringify([...document.querySelectorAll('main button, main a, [role="dialog"] button, aside button')].slice(0,80).map((b) => b.tagName[0] + ':' + (b.getAttribute('aria-label') || b.textContent.trim().slice(0, 40))))`).catch(() => '[]')
    console.log(name, labels)
  }
  await sleep(1500)
  await shot('library')
  console.log('open', await press(page, sample.skill, 'button,a'))
  await sleep(800)
  const [r0] = sample.compare.a.split('/')
  const [r1] = sample.compare.b.split('/')
  const unsure = new URLSearchParams({ a: `${r0}/sync-fix-s1`, b: `${r1}/sync-fix-s2` }).toString()
  for (const [name, route] of [['versions', '#/versions'], ['compare-unsure', `#/compare?${unsure}`], ['insights', '#/insights'], ['edit', '#/edit']] as const) {
    await page.run(`window.location.hash = ${q(route)}`)
    await shot(name)
  }
  // Select rule 03 through the DOM: CodeMirror follows the document selection.
  const selected = await page.run(`(() => {
    const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('under 120 words'))
    if (!line) return 'no line'
    line.scrollIntoView({ block: 'center' })
    const r = line.getBoundingClientRect()
    const range = document.createRange(); range.selectNodeContents(line)
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, text: line.textContent })
  })()`)
  console.log('selected', selected)
  await shot('edit-selected')
  console.log('suggest', await press(page, 'Suggest changes'))
  await sleep(4000)
  await shot('edit-rewrites')
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(500)
  await page.run(`(() => {
    const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('under 120 words'))
    const range = document.createRange(); range.selectNodeContents(line)
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
  })()`)
  await sleep(600)
  console.log('improve', await press(page, 'Help me improve'))
  await sleep(5000)
  await shot('edit-improve')
  console.log('refine', await (async () => {
    await page.run(`(() => {
      const line = [...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes('under 120 words'))
      const range = document.createRange(); range.selectNodeContents(line)
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range)
    })()`)
    await sleep(600)
    return press(page, 'Auto refine')
  })())
  await sleep(4000)
  await shot('edit-refine')
  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) { app.kill(); await new Promise((done) => app.once('exit', done)) }
  s.remove()
}
