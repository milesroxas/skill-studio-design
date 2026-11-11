// Plates for the Skill Studio work page: real app stills, edited. The window is
// dimmed so only the part a block talks about reads at full strength, lifted
// off the screen it sits on. One PNG per plate at 2x, from plates.json.
//   node render.mjs [name,...]   (Playwright resolves from the milesroxas-site checkout)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(process.env.PLAYWRIGHT_FROM ?? join(process.env.HOME, 'SITES/milesroxas-site/package.json'))
const { chromium } = require('playwright')
const spec = JSON.parse(readFileSync(join(HERE, 'plates.json'), 'utf8'))
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })
const only = process.argv[2]?.split(',')

const STAGE = '#0d0e0d'
const PAPER = '244, 242, 235'
const SIGNAL = '#f0f059'

function plateHtml(p) {
  const still = (src) => pathToFileURL(resolve(HERE, spec.stills, src)).href
  const b = p.base
  const cw = b.cssWidth ?? 1360
  const ch = b.cssHeight ?? 850
  const frame = b.frame !== false
  const win = { left: b.left, top: b.top, w: cw * b.scale, h: ch * b.scale }
  const radius = 14
  const pieces = (p.pieces ?? []).map((pc) => {
    const to = pc.to ?? { left: b.left, top: b.top, scale: b.scale }
    const src = pc.src ?? b.src
    const s = to.scale
    const pw = (pc.cssWidth ?? cw) * s
    const ph = (pc.cssHeight ?? ch) * s
    const lift = pc.lift ?? 1
    const card = pc.card
      ? `box-shadow: 0 0 0 1px rgba(${PAPER}, 0.12), 0 40px 80px -24px rgba(0,0,0,0.85), 0 12px 24px -8px rgba(0,0,0,0.6);`
      : `box-shadow: 0 0 0 1px rgba(${PAPER}, ${lift > 1 ? 0.1 : 0}), 0 ${lift > 1 ? 28 : 0}px ${lift > 1 ? 56 : 0}px -16px rgba(0,0,0,0.8);`
    const at = pc.to ? { left: to.left, top: to.top } : { left: b.left + pc.x * s, top: b.top + pc.y * s }
    return `<div class="piece" style="left:${at.left}px; top:${at.top}px; width:${pc.w * s}px; height:${pc.h * s}px; border-radius:${pc.r * s}px; background-image:url('${still(src)}'); background-size:${pw}px ${ph}px; background-position:${-pc.x * s}px ${-pc.y * s}px; transform:scale(${lift}); ${card}"></div>`
  })
  const marks = (p.marks ?? []).map((m) => `<div class="mark" style="left:${b.left + m.x * b.scale}px; top:${b.top + m.y * b.scale}px; width:${m.w * b.scale}px; height:${m.h * b.scale}px"></div>`)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${p.w}px; height: ${p.h}px; overflow: hidden; background: ${STAGE}; }
  .plate { position: relative; width: 100%; height: 100%; overflow: hidden;
    background: radial-gradient(110% 90% at 18% 0%, #1c1d1b 0%, #121312 45%, #0b0c0b 100%); }
  .win { position: absolute; left: ${win.left}px; top: ${win.top}px; width: ${win.w}px; height: ${win.h}px;
    border-radius: ${frame ? radius : 0}px; overflow: hidden;
    ${frame ? `box-shadow: 0 0 0 1px rgba(${PAPER}, 0.09), 0 50px 100px -30px rgba(0,0,0,0.9);` : ''} }
  .win img { width: 100%; height: 100%; display: block; filter: brightness(0.32) saturate(0.5); }
  .veil { position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(120% 100% at 50% 40%, transparent 55%, rgba(0,0,0,0.35) 100%); }
  .piece { position: absolute; background-repeat: no-repeat; transform-origin: 50% 50%; }
  .mark { position: absolute; background: ${SIGNAL}; border-radius: 2px; box-shadow: 0 0 12px rgba(240,240,89,0.45); }
  .grain { position: absolute; inset: 0; opacity: 0.05; mix-blend-mode: overlay; pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  </style></head><body><div class="plate">
  <div class="win"><img src="${still(b.src)}"></div>
  <div class="veil"></div>
  ${pieces.join('\n')}
  ${marks.join('\n')}
  <div class="grain"></div>
  </div></body></html>`
}

const browser = await chromium.launch()
try {
  for (const p of spec.plates) {
    if (only && !only.includes(p.name)) continue
    const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 2 })
    const file = join(OUT, `${p.name}.html`)
    writeFileSync(file, plateHtml(p))
    await page.goto(pathToFileURL(file).href)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())))
    await page.screenshot({ path: join(OUT, `${p.name}.png`) })
    await page.close()
    console.log(`out/${p.name}.png`)
  }
} finally {
  await browser.close()
}
