/**
 * One still for the work page's walkthrough plate: a first launch taken through
 * the four-step walkthrough to "Tighten one rule", at 2x, in
 * ./out/walkthrough/edit-start.jpg. The stand-in claude in ./bin answers the run.
 *   node walkthrough-still.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { H, W, connect, launch, scratch, sleep } from './lib.ts'

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
const btn = (label: string, sel = 'button, a') =>
  `[...document.querySelectorAll(${q(sel)})].find((b) => b.textContent.trim().startsWith(${q(label)}) && !b.disabled)`
const NEXT = btn('Next:', 'header button, header a')
const RUN = `[...document.querySelectorAll('header button')].find((b) => /^Run v/.test(b.textContent.trim()) && !b.disabled)`
const POPOVER = `document.querySelector('[data-slot="popover-content"]')`
const START = `[...(${POPOVER}?.querySelectorAll('button') ?? [])].find((b) => /^Run \\d+ case/.test(b.textContent.trim()) && !b.disabled)`

try {
  let page = await connect(port)
  const waitFor = async (expr: string, ms = 30000) => {
    for (let i = 0; i < ms / 100; i += 1) {
      if (await page.run(`Boolean(${expr})`).catch(() => false)) return
      await sleep(100)
    }
    throw new Error(`Never showed: ${expr}`)
  }
  const gotIt = () =>
    page.run(`[...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Got it').forEach((b) => b.click())`)

  await waitFor(btn('Try it on a sample skill'))
  await page.run(`${btn('Try it on a sample skill')}.click()`)
  await sleep(2500)
  page.close()
  page = await connect(port)
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: Number(process.env.STILLS_SCALE ?? 2), mobile: false })
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
  await waitFor(RUN)
  await gotIt()
  await page.run(`${RUN}.click()`)
  await waitFor(START)
  await page.run(`${START}.click()`)
  await waitFor(`(${NEXT})?.textContent.includes('Read the results')`, 180000)
  await sleep(800)
  await page.run(`${NEXT}.click()`)
  await waitFor(`location.hash.startsWith('#/results')`)
  await sleep(1500)
  await waitFor(`(${NEXT})?.textContent.includes('Tighten')`)
  await page.run(`${NEXT}.click()`)
  await waitFor(btn('Use the exact rule'))
  await gotIt()
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  await page.run(`document.fonts.ready.then(() => new Promise((d) => setTimeout(d, 1200)))`)
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/edit-start.png`, Buffer.from(String(data), 'base64'))
  const rects = await page.run(`Object.fromEntries(['[aria-label="Tighten this rule"]', 'section[aria-label="Walkthrough"]', 'nav[aria-label="App"]', 'header', '.cm-editor'].map((s) => { const e = document.querySelector(s); const r = e?.getBoundingClientRect(); return [s, r && { x: r.x, y: r.y, w: r.width, h: r.height }] }))`)
  writeFileSync(`${OUT}/edit-start.rects.json`, JSON.stringify(rects, null, 1))
  console.log('out/walkthrough/edit-start.png')
  const calls = existsSync(STUB_LOG) ? readFileSync(STUB_LOG, 'utf8').split('\n').filter(Boolean) : []
  if (!calls.some((c) => !c.startsWith('auth'))) throw new Error('The run did not reach the stand-in claude.')
  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) {
    app.kill()
    await new Promise((done) => app.once('exit', done))
  }
  s.remove()
}
