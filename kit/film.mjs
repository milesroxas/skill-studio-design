/**
 * Films the real app on the mock home, one frame at a time, from a film
 * folder's scenes.mjs (see kit/README.md for its shape).
 *
 * The page's clock is paused and stepped 1/60 s per frame (timers, rAF, the
 * job polling), and every CSS animation and transition is paused and seeked
 * to the same time, so nothing depends on how fast a frame is taken. Mouse and
 * keys are real input sent between frames; the cursor drawn over the page is
 * the macOS arrow, hand or I-beam, picked from what is under it. When the app
 * is still waiting on Jev or the stand-in claude at the moment the script
 * wants the answer, the clock runs on unseen (timers only) until it lands.
 *
 *   node kit/film.mjs <film> stills 1.2,4,9.5   PNGs of those film times, in <film>/out/stills
 *   node kit/film.mjs <film> video <film>/out/name-30s.mp4
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { KIT, start } from './app.mjs'

const FPS = 60
const DT = 1000 / FPS

const [filmDir, mode = 'stills', arg = ''] = process.argv.slice(2)
if (!filmDir) throw new Error('Usage: node kit/film.mjs <film folder> stills <t,t,...> | video <out.mp4>')
const FILM = resolve(filmDir)
const film = await import(pathToFileURL(join(FILM, 'scenes.mjs')).href)
const { SCENES } = film
// The frame: the whole window by default, so nothing the app draws is cut.
const VIEW = film.VIEW ?? { width: 1200, height: 800 }
const DSF = Number(process.env.DSF ?? film.DSF ?? 2.4)
const CROP = film.CROP ?? { x: 0, y: 0, width: VIEW.width, height: VIEW.height }
const OUT_W = Math.round(CROP.width * DSF)
const OUT_H = Math.round(CROP.height * DSF)
if (OUT_W % 2 || OUT_H % 2 || Math.max(OUT_W, OUT_H) > 4096) throw new Error(`Frame ${OUT_W}x${OUT_H}: sides must be even and at most 4096.`)
const wantStills = mode === 'stills' ? arg.split(',').filter(Boolean).map(Number) : []

const cursorPng = (name) => `data:image/png;base64,${readFileSync(join(KIT, 'cursors', `${name}.png`)).toString('base64')}`
const CURSORS = {
  arrow: { src: cursorPng('arrow'), w: 28, h: 40, hx: 5, hy: 5 },
  hand: { src: cursorPng('hand'), w: 32, h: 32, hx: 12, hy: 8, shadow: true },
  ibeam: { src: cursorPng('ibeam'), w: 23, h: 22, hx: 12, hy: 11 },
}

/** Runs in the page: the animation clock, the cursor overlay. */
function pageKit(cursors) {
  const film = { t: 0 }
  const adopt = (a) => {
    if (a.__b !== undefined) return
    // Already running before the film's clock took over: keep its place.
    a.__b = film.t - (Number(a.currentTime) || 0)
    a.pause()
  }
  film.step = (dt) => {
    film.t += dt
    for (const a of document.getAnimations()) {
      if (a.__b === undefined) {
        // Born during the last frame: one frame in.
        a.__b = film.t - dt
        a.pause()
      }
      const local = film.t - a.__b
      const end = a.effect?.getComputedTiming().endTime ?? 0
      if (Number.isFinite(end) && local >= end) {
        if (a.playState !== 'finished') a.finish()
      } else a.currentTime = local
    }
  }
  film.adoptAll = () => document.getAnimations().forEach(adopt)
  const img = document.createElement('img')
  img.id = 'film-cursor'
  img.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;display:none'
  document.documentElement.append(img)
  let kind = ''
  film.cursor = (x, y, show, force) => {
    if (!show) {
      img.style.display = 'none'
      return
    }
    let next = force
    if (!next) {
      const el = document.elementFromPoint(x, y)
      const c = el ? getComputedStyle(el).cursor : 'auto'
      next = c === 'pointer' ? 'hand' : c === 'text' ? 'ibeam' : 'arrow'
      // A disabled button is no link.
      if (next === 'hand' && el.closest('button:disabled')) next = 'arrow'
    }
    const k = cursors[next]
    if (next !== kind) {
      kind = next
      img.src = k.src
      img.style.width = `${k.w}px`
      img.style.height = `${k.h}px`
      img.style.filter = k.shadow ? 'drop-shadow(0 1px 1px rgb(0 0 0/.45))' : 'none'
    }
    img.style.display = 'block'
    img.style.transform = `translate(${x - k.hx}px, ${y - k.hy}px)`
  }
  // The lens: everything but the focus fades to skeleton bars in the app's own greys and dims.
  // It is drawn over the page from the page's own rects; the app's DOM is never touched.
  const lens = document.createElement('div')
  lens.id = 'film-lens'
  lens.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden'
  document.documentElement.append(lens)
  // The dim: a canvas over everything, with a rounded hole cut for each focus element.
  const hole = document.createElement('canvas')
  hole.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'
  const RES = 3
  hole.width = innerWidth * RES
  hole.height = innerHeight * RES
  const ink = hole.getContext('2d')
  const pool = []
  let used = 0
  const piece = () => {
    if (used < pool.length) return pool[used++]
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:0;top:0'
    lens.insertBefore(el, hole)
    pool.push(el)
    used += 1
    return el
  }
  lens.append(hole)
  const transparent = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c) || / \/ 0\)$/.test(c)
  film.lens = ({ exprs, t, pad, bar, dim }) => {
    used = 0
    const els = exprs.map((e) => { try { return new Function(`return (${e})`)() } catch { return null } }).filter(Boolean)
    let F = null
    for (const el of els) {
      const b = el.getBoundingClientRect()
      if (!b.width || !b.height) continue
      F = F ? { l: Math.min(F.l, b.left), t: Math.min(F.t, b.top), r: Math.max(F.r, b.right), b: Math.max(F.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom }
    }
    ink.clearRect(0, 0, hole.width, hole.height)
    if (t > 0.001) {
      const Rs = els.map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height)
      // The dim's holes, padded; bars stop at the element's own edge.
      const Ps = Rs.map((b) => ({ l: b.left - pad, t: b.top - pad, r: b.right + pad, b: b.bottom + pad }))
      const Es = Rs.map((b) => ({ l: b.left, t: b.top, r: b.right, b: b.bottom }))
      const alphas = new Map()
      const alphaOf = (el) => {
        if (alphas.has(el)) return alphas.get(el)
        let a = 1
        for (let e = el; e; e = e.parentElement) a *= Number(getComputedStyle(e).opacity)
        alphas.set(el, a)
        return a
      }
      const inFocus = (node) => els.some((el) => el.contains(node))
      const bgs = new Map()
      const bgOf = (el) => {
        if (bgs.has(el)) return bgs.get(el)
        // Every background from the element up to the first opaque one, layered as the page layers them,
        // so a cover over a translucent badge hides its text as well as one over the page does.
        const layers = []
        for (let e = el; e; e = e.parentElement) {
          const v = getComputedStyle(e).backgroundColor
          if (transparent(v)) continue
          layers.push(v)
          if (!/\/ ?0?\.\d|rgba\(/.test(v)) break
        }
        if (!layers.length || /\/ ?0?\.\d|rgba\(/.test(layers.at(-1))) layers.push(getComputedStyle(document.documentElement).backgroundColor || '#0a0c11')
        const c = layers.map((v, i) => (i === layers.length - 1 ? v : `linear-gradient(${v}, ${v})`)).join(', ')
        bgs.set(el, c)
        return c
      }
      const clips = new Map()
      const clipOf = (el) => {
        if (clips.has(el)) return clips.get(el)
        let c = { l: 0, t: 0, r: innerWidth, b: innerHeight }
        for (let e = el.parentElement; e; e = e.parentElement) {
          const o = getComputedStyle(e)
          if (o.overflowX !== 'visible' || o.overflowY !== 'visible') {
            const b = e.getBoundingClientRect()
            c = { l: Math.max(c.l, b.left), t: Math.max(c.t, b.top), r: Math.min(c.r, b.right), b: Math.min(c.b, b.bottom) }
          }
        }
        clips.set(el, c)
        return c
      }
      const draw = (r, owner, round) => {
        const c = clipOf(owner)
        let l = Math.max(r.left, c.l), rt = Math.min(r.right, c.r), tp = Math.max(r.top, c.t), bt = Math.min(r.bottom, c.b)
        if (rt - l < 1 || bt - tp < 1) return
        // Covered by something that is neither it nor the focus: that thing draws its own bars.
        const cx = (l + rt) / 2
        const cy = (tp + bt) / 2
        const under = Es.some((P) => cx > P.l && cx < P.r && cy > P.t && cy < P.b)
        const hit = document.elementFromPoint(cx, cy)
        // Covered by something solid that is neither it nor the focus: that thing draws its own bars.
        if (!under && hit && !owner.contains(hit) && !hit.contains(owner) && alphaOf(hit) > 0.98) return
        const alpha = t * alphaOf(owner)
        // A line mostly level with a focus element keeps the parts beside it; one that only grazes it is barred whole.
        let parts = [[l, rt]]
        for (const P of Es) {
          if (Math.min(bt, P.b) - Math.max(tp, P.t) <= (bt - tp) * 0.5) continue
          parts = parts.flatMap(([a, z]) => [[a, Math.min(z, P.l)], [Math.max(a, P.r), z]].filter(([x, y]) => y - x >= 1))
        }
        const h = bt - tp
        for (const [a, z] of parts) {
          if (z - a < 1) continue
          const cover = piece()
          cover.style.cssText = `position:absolute;left:${a - 1}px;top:${tp}px;width:${z - a + 2}px;height:${h}px;background:${bgOf(owner)};opacity:${t * Math.min(1, alphaOf(owner) * 2)};border-radius:0`
          const bh = round ? h : Math.max(4, Math.round(h * 0.5))
          const b = piece()
          b.style.cssText = `position:absolute;left:${a}px;top:${tp + (h - bh) / 2}px;width:${z - a}px;height:${bh}px;background:${bar};opacity:${alpha};border-radius:${round ? 4 : bh / 2}px`
        }
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const range = document.createRange()
      while (walker.nextNode()) {
        const n = walker.currentNode
        if (!n.textContent.trim() || inFocus(n)) continue
        const owner = n.parentElement
        if (!owner || owner.closest('#film-lens, #film-cursor') || !owner.checkVisibility?.()) continue
        range.selectNodeContents(n)
        for (const r of range.getClientRects()) if (r.width > 0.5) draw(r, owner, false)
      }
      for (const el of document.querySelectorAll('svg, img, kbd')) {
        if (el.id === 'film-cursor' || inFocus(el) || el.closest('#film-lens') || !el.checkVisibility?.()) continue
        const r = el.getBoundingClientRect()
        if (r.width > 2 && r.width < 64) draw(r, el, true)
      }
      ink.globalCompositeOperation = 'source-over'
      ink.fillStyle = `rgb(0 0 0 / ${dim * t})`
      ink.fillRect(0, 0, hole.width, hole.height)
      ink.globalCompositeOperation = 'destination-out'
      ink.fillStyle = '#000'
      for (const P of Ps) {
        ink.beginPath()
        ink.roundRect(P.l * RES, P.t * RES, (P.r - P.l) * RES, (P.b - P.t) * RES, 12 * RES)
        ink.fill()
      }
    }
    for (let i = used; i < pool.length; i += 1) pool[i].style.display = 'none'
    return F && { x: F.l, y: F.t, w: F.r - F.l, h: F.b - F.t }
  }
  window.__film = film
}

const app = await start({ ...VIEW, scale: DSF, answers: film.ANSWERS, prepare: film.prepare })
const { page } = app
const cdp = await page.context().newCDPSession(page)
let encoder = null
let failed = null

try {
  await page.clock.install({ time: new Date('2026-11-16T15:40:00') })
  if (film.open) await film.open(app)
  else await app.openEditor()
  await page.evaluate(() => document.fonts.ready)
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))
  console.log('fonts loaded:', [...new Set(fonts)].join(', '))
  await page.waitForTimeout(800)
  await page.evaluate(pageKit, CURSORS)
  await page.clock.pauseAt(new Date('2026-11-16T15:41:00'))
  await page.evaluate(() => window.__film.adoptAll())

  if (mode === 'video') {
    mkdirSync(join(arg, '..'), { recursive: true })
    encoder = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14',
      '-profile:v', 'high', '-level', '5.2', '-movflags', '+faststart', '-an', arg], { stdio: ['pipe', 'inherit', 'inherit'] })
  }
  if (mode === 'stills') mkdirSync(join(FILM, 'out/stills'), { recursive: true })
  console.log(`frame: ${OUT_W}x${OUT_H} (${VIEW.width}x${VIEW.height} at ${DSF}x)`)

  // The film's state, shared by every scene.
  let frame = 0
  let crop = { x: CROP.x, y: CROP.y }
  const cur = { x: VIEW.width + 60, y: VIEW.height + 60, show: false, force: null }
  let pressed = false
  let clips = 0
  let lastClip = ''
  // The lens and the camera. The camera is a 3:2 window onto the page, eased toward its
  // target with a critically damped spring, so it starts and stops softly.
  const lensState = { exprs: [], t: 0, target: 0, rate: 1 / 0.6, pad: 10, zoom: 2.2, margin: 56, bar: 'rgb(255 255 255 / 0.075)', dim: 0.45 }
  const aspect = CROP.width / CROP.height
  const full = { x: CROP.x + CROP.width / 2, y: CROP.y + CROP.height / 2, w: CROP.width }
  const cam = { ...full, vx: 0, vy: 0, vw: 0, smooth: 0.42 }
  let camTarget = { ...full }
  let focusRect = null
  const damp = (key, vkey, to, dt) => {
    // Critically damped spring (Game Programming Gems 4, 1.10).
    const omega = 2 / cam.smooth
    const x = omega * dt
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    const change = cam[key] - to
    const temp = (cam[vkey] + omega * change) * dt
    cam[vkey] = (cam[vkey] - omega * temp) * exp
    cam[key] = to + (change + temp) * exp
  }
  const targetFor = (r) => {
    if (!r || lensState.target === 0) return { ...full }
    const m = lensState.margin
    let w = Math.max(r.w + 2 * m, (r.h + 2 * m) * aspect, CROP.width / lensState.zoom)
    w = Math.min(w, CROP.width)
    const h = w / aspect
    const x = Math.min(Math.max(r.x + r.w / 2, CROP.x + w / 2), CROP.x + CROP.width - w / 2)
    const y = Math.min(Math.max(r.y + r.h / 2, CROP.y + h / 2), CROP.y + CROP.height - h / 2)
    return { x, y, w }
  }
  const pending = new Set(wantStills.map((t) => Math.round(t * FPS)))
  const filmTime = () => frame / FPS

  /** One frame: clocks forward, input, cursor, capture. */
  async function step(input) {
    await page.clock.runFor(DT)
    if (input) await input()
    await page.mouse.move(cur.x, cur.y)
    const probe = await page.evaluate(({ dt, x, y, show, force, cx, cy, cw, ch, lens }) => {
      window.__film.step(dt)
      window.__film.cursor(x, y, show, force)
      const focus = window.__film.lens(lens)
      // Nothing the film shows may cross the crop's edge.
      const out = []
      for (const el of document.querySelectorAll('[data-slot="popover-content"], [role="dialog"]')) {
        const b = el.getBoundingClientRect()
        if (b.width && (b.left < cx - 0.5 || b.right > cx + cw + 0.5 || b.top < cy - 0.5 || b.bottom > cy + ch + 0.5)) out.push([Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)])
      }
      return { out, focus }
    }, { dt: DT, ...cur, cx: crop.x, cy: crop.y, cw: CROP.width, ch: CROP.height, lens: { exprs: lensState.exprs, t: smooth(lensState.t), pad: lensState.pad, bar: lensState.bar, dim: lensState.dim } })
    const clipped = probe.out
    focusRect = probe.focus
    // The lens fades toward its target; the camera follows the focus.
    const dl = lensState.rate / FPS
    lensState.t = lensState.target > lensState.t ? Math.min(lensState.target, lensState.t + dl) : Math.max(lensState.target, lensState.t - dl)
    camTarget = targetFor(focusRect)
    damp('x', 'vx', camTarget.x, 1 / FPS)
    damp('y', 'vy', camTarget.y, 1 / FPS)
    damp('w', 'vw', camTarget.w, 1 / FPS)
    if (clipped.length) {
      const key = JSON.stringify(clipped)
      if (key !== lastClip) console.log(`  CLIPPED at ${filmTime().toFixed(2)}s: ${key}`)
      lastClip = key
      clips += 1
    } else lastClip = ''
    const capture = mode === 'video' || pending.has(frame)
    if (capture) {
      const h = cam.w / aspect
      const clip = { x: cam.x - cam.w / 2, y: cam.y - h / 2, width: cam.w, height: h, scale: OUT_W / cam.w }
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip })
      const png = Buffer.from(data, 'base64')
      if (mode === 'video') {
        if (!encoder.stdin.write(png)) await new Promise((done) => encoder.stdin.once('drain', done))
      } else {
        const name = `t${filmTime().toFixed(2)}`
        writeFileSync(join(FILM, 'out/stills', `${name}.png`), png)
        console.log(`out/stills/${name}.png`)
        pending.delete(frame)
      }
    }
    frame += 1
    if (frame % 120 === 0) process.stdout.write(`  ${filmTime().toFixed(1)}s\n`)
  }

  const smooth = (u) => u * u * (3 - 2 * u)
  const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)
  const where = async (find, dx = 0.5, dy = 0.5) => {
    const r = await page.evaluate(({ find, dx, dy }) => {
      const el = new Function(`return (${find})`)()
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width * dx, y: b.y + b.height * dy }
    }, { find, dx, dy })
    if (!r) throw new Error(`Nothing on screen for ${find}`)
    return r
  }

  const f = {
    get t() {
      return filmTime()
    },
    async wait(sec) {
      const n = Math.round(sec * FPS)
      for (let i = 0; i < n; i += 1) await step()
    },
    /** Glide to a point on a bowed path, eased in and out. `bow` is the share of the distance it bends by. */
    async glide(to, sec = 0.6, bow = 0.1) {
      const from = { x: cur.x, y: cur.y }
      const dx = to.x - from.x
      const dy = to.y - from.y
      // Bend to the right of travel: a hand's arc.
      const mid = { x: from.x + dx / 2 - dy * bow, y: from.y + dy / 2 + dx * bow }
      cur.show = true
      const n = Math.max(1, Math.round(sec * FPS))
      for (let i = 1; i <= n; i += 1) {
        const u = ease(i / n)
        cur.x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * mid.x + u * u * to.x
        cur.y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * mid.y + u * u * to.y
        await step()
      }
    },
    async glideTo(find, sec, opts = {}) {
      const p = await where(find, opts.dx ?? 0.5, opts.dy ?? 0.5)
      await f.glide({ x: p.x + (opts.ox ?? 0), y: p.y + (opts.oy ?? 0) }, sec, opts.bow)
    },
    /** Press and release where the cursor is: down for 5 frames. */
    async click() {
      await step(() => page.mouse.down())
      pressed = true
      for (let i = 0; i < 4; i += 1) await step()
      await step(() => page.mouse.up())
      pressed = false
    },
    /** Type at `cps` characters a second, on the film's clock. */
    async type(text, cps = 40) {
      const chars = [...text]
      let i = 0
      const t0 = frame
      while (i < chars.length) {
        const due = Math.floor(((frame - t0 + 1) / FPS) * cps)
        const batch = chars.slice(i, Math.max(i, due))
        i += batch.length
        await step(batch.length ? async () => {
          for (const ch of batch) await (ch === '\n' ? page.keyboard.press('Enter') : page.keyboard.type(ch))
        } : undefined)
      }
    },
    /** Time passes with no frame taken: for setting up a scene between cuts. */
    async unseen(sec, input) {
      const n = Math.max(1, Math.round(sec * FPS))
      for (let i = 0; i < n; i += 1) {
        await page.clock.runFor(DT)
        if (i === 0 && input) await input()
        await page.evaluate((dt) => window.__film.step(dt), DT)
      }
    },
    async key(name) {
      await step(() => page.keyboard.press(name))
    },
    /** Let the app catch up unseen when `cond` is not yet true: timers run, nothing animates, no frame is taken. */
    async until(cond, label, maxSec = 180) {
      const deadline = Date.now() + maxSec * 1000
      let hidden = 0
      while (!(await page.evaluate((c) => Boolean(new Function(`return (${c})`)()), cond))) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`)
        await page.clock.runFor(100)
        hidden += 100
        await new Promise((done) => setTimeout(done, 60))
      }
      if (hidden) console.log(`  ${label}: caught up ${(hidden / 1000).toFixed(1)}s unseen at ${filmTime().toFixed(2)}s`)
    },
    /** Off the frame, bottom right: where the cursor enters from and leaves to. */
    offstage(side = 'right') {
      // Just outside where the camera is headed, so the cursor enters the frame at once.
      const w = camTarget.w
      const h = w / aspect
      return side === 'right'
        ? { x: camTarget.x + w / 2 + 30, y: camTarget.y + h * 0.4 }
        : { x: camTarget.x + w * 0.28, y: camTarget.y + h / 2 + 40 }
    },
    park(side) {
      Object.assign(cur, f.offstage(side), { show: false })
    },
    /**
     * Focus on what `exprs` give (JS expressions for elements; their union is the focus):
     * the camera moves in, everything else fades to skeleton and dims. Options: `zoom`
     * (the most it magnifies), `margin` around the focus in the frame, `pad` of the clear hole.
     */
    focus(exprs, opts = {}) {
      Object.assign(lensState, { exprs: [].concat(exprs), target: 1 }, opts)
    },
    /** Back to the whole app at full fidelity. */
    unfocus(opts = {}) {
      Object.assign(lensState, { target: 0 }, opts)
    },
    /** Jump the lens and camera to their targets: for a scene's first frame after a cut. */
    async settleLens() {
      lensState.t = lensState.target
      const r = await page.evaluate((l) => window.__film.lens(l), { exprs: lensState.exprs, t: smooth(lensState.t), pad: lensState.pad, bar: lensState.bar, dim: lensState.dim })
      Object.assign(cam, targetFor(r), { vx: 0, vy: 0, vw: 0 })
    },
    setCrop(c) {
      crop = { ...crop, ...c }
    },
    where,
    page,
    app,
  }

  for (const scene of SCENES) {
    if (scene.setup) await scene.setup(f)
    const at = filmTime()
    await scene.film(f)
    console.log(`${scene.name}: ${at.toFixed(2)}s to ${filmTime().toFixed(2)}s`)
  }
  app.assertStub(film.STUB_CALLS ?? 1)
  // Each reply came from the answer the film meant: a reply matched by the wrong entry reads as real.
  const calls = app.stubCalls()
  if (calls.some((c) => c.includes('NO ANSWER'))) throw new Error(`The stand-in had no answer:\n${calls.join('\n')}`)
  if (film.STUB_EXPECT && JSON.stringify(calls) !== JSON.stringify(film.STUB_EXPECT))
    throw new Error(`The stand-in answered\n${calls.join('\n')}\nnot\n${film.STUB_EXPECT.join('\n')}`)
  if (clips) throw new Error(`${clips} frames show a popover past the crop's edge.`)
  console.log(`film: ${filmTime().toFixed(2)}s, ${frame} frames; stand-in calls: ${app.stubCalls().length}`)
  if (pending.size) console.log(`not reached: ${[...pending].map((n) => (n / FPS).toFixed(2)).join(', ')}`)
} catch (error) {
  failed = error
  console.error(error)
  await page.screenshot({ path: join(FILM, 'out/failure.png') }).catch(() => {})
} finally {
  if (encoder) {
    encoder.stdin.end()
    await new Promise((done) => encoder.on('exit', done))
  }
  await app.close()
  if (failed) process.exit(1)
}
