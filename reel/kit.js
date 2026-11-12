// What every page of the reel shares: easing, and the shot player. A shot draws
// the app as a skeleton window and lifts one part of it, the filmed footage cut
// to that part, off its place, with the pointer over it. Every picture depends
// only on t.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, k) => a + (b - a) * k
/** How far t is from a to b, 0 to 1. */
export const span = (t, a, b) => clamp((t - a) / (b - a))
export const outExpo = (k) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k))
export const outCubic = (k) => 1 - (1 - k) ** 3
export const inCubic = (k) => k ** 3
export const inOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
export const inOutQuint = (k) => (k < 0.5 ? 16 * k ** 5 : 1 - (-2 * k + 2) ** 5 / 2)
export const outBack = (k, s = 1.7) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2
/**
 * A cubic bézier easing, as CSS draws it: x is time, y is progress. The film's
 * motion uses two: `mech`, a hard start and a hard stop, for anything that
 * travels; `snap`, all speed at once and a short brake, for anything that appears.
 */
export function bezier(x1, y1, x2, y2) {
  const at = (a, b, k) => 3 * a * k * (1 - k) ** 2 + 3 * b * k * k * (1 - k) + k ** 3
  const slope = (a, b, k) => 3 * a * (1 - k) ** 2 + 6 * (b - a) * k * (1 - k) + 3 * (1 - b) * k * k
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let k = x
    for (let i = 0; i < 8; i += 1) {
      const d = slope(x1, x2, k)
      if (Math.abs(d) < 1e-6) break
      k -= (at(x1, x2, k) - x) / d
    }
    k = Math.min(1, Math.max(0, k))
    return at(y1, y2, k)
  }
}
export const mech = bezier(0.82, 0, 0.12, 1)
export const snap = bezier(0.12, 0.9, 0.2, 1)

/** The pointer's own ease: the one the footage was filmed with. */
const glide = (u) => u * u * u * (u * (u * 6 - 15) + 10)

/** The Flow mark: two identical ribbons in a 184 × 152 box, the second 64 units below the first. */
export const MARK = [
  'M 0 56 H 64 C 104 56 104 0 144 0 H 184 V 32 H 144 C 104 32 104 88 64 88 H 0 Z',
  'M 0 120 H 64 C 104 120 104 64 144 64 H 184 V 96 H 144 C 104 96 104 152 64 152 H 0 Z',
]

export const fonts = () =>
  Promise.all([
    document.fonts.load('600 40px "Geist"'),
    document.fonts.load('500 20px "Geist Mono"'),
  ]).then(() => document.fonts.ready)

/**
 * The window on the stage, the same in every shot of the film, so a cut between
 * beats changes only what is on it. K is how much larger than the app (1200 × 750)
 * it is drawn. A beat's part sits where it is in the app, LIFT times larger, with
 * one shadow under it.
 */
const WINDOW = { x: 192, y: 56, w: 1536 }
const K = WINDOW.w / 1200
const WINDOW_H = 750 * K
const LIFT = 1.06

const el = (tag, cls, parent) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  parent?.append(node)
  return node
}

/** A value along keyframes [[at, value], …], straight between them. */
function along(keys, at) {
  if (at <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i += 1) {
    const [a, va] = keys[i - 1]
    const [b, vb] = keys[i]
    if (at <= b) return b === a ? vb : va + ((vb - va) * (at - a)) / (b - a)
  }
  return keys.at(-1)[1]
}

/**
 * The app as a skeleton: rounded bars with no words, in the app's two quiet
 * greys, on the 8 px grid of its 1200 × 750. The frame (sidebar, top bar) is the
 * same on every screen; `screen` picks what the content area holds and which
 * place in the sidebar is current. Returns the content layer, which fades on
 * its own when the screen changes at a cut.
 */
const SCREENS = {
  library: { nav: 'library', run: false },
  editor: { nav: 0, run: true },
  chat: { nav: 0, run: true },
  cases: { nav: 1, run: true },
  results: { nav: 2, run: true },
  overview: { nav: 2, run: true },
}
function skeleton(screen, parent) {
  const bar = (layer, x, y, w, h = 12, kind = 'bar', r = null) => {
    const node = el('i', `sb ${kind}`, layer)
    Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: `${r ?? h / 2}px` })
    return node
  }
  const rule = (layer, x, y, w, h) => bar(layer, x, y, w, h, 'rule', 0)
  const app = el('div', 'skel', parent)
  const s = SCREENS[screen] ?? SCREENS.editor

  // The frame: sidebar and top bar.
  const side = el('div', 'skel-side', app)
  bar(side, 168, 16, 32, 16, 'bar', 4)
  bar(side, 16, 64, 112, 12)
  bar(side, 16, 84, 64, 8)
  for (const [k, w] of [[0, 40], [1, 56], [2, 48]]) {
    bar(side, 16, 128 + k * 32, 16, 16, 'bar', 4)
    bar(side, 40, 130 + k * 32, w, 12)
  }
  for (const [k, w] of [[0, 56], [1, 40], [2, 56]]) {
    bar(side, 16, 656 + k * 32, 16, 16, 'bar', 4)
    bar(side, 40, 658 + k * 32, w, 12)
  }
  rule(app, 232, 48, 968, 1)
  bar(app, 256, 16, 16, 16)
  bar(app, 288, 16, 16, 16)
  bar(app, 320, 18, 72, 12)
  bar(app, 1120, 16, 16, 16)
  bar(app, 1152, 16, 16, 16)

  // What changes with the screen: the current place, and the content area.
  const content = el('div', 'skel-content', app)
  const navY = s.nav === 'library' ? 652 : 124 + s.nav * 32
  bar(content, 8, navY, 216, 24, 'pick', 6)
  if (s.run) bar(content, 1000, 12, 88, 24, 'bar', 6)

  const column = (x0) => rule(content, x0, 48, 1, 702)
  const lines = (x, y, widths, gap = 24, h = 10) => widths.forEach((w, i) => bar(content, x, y + i * gap, w, h))
  if (screen === 'library') {
    bar(content, 256, 72, 320, 32, 'field', 8)
    bar(content, 592, 72, 120, 32, 'field', 8)
    bar(content, 1056, 72, 112, 32, 'field', 8)
    for (const [top, rows] of [[144, 3], [480, 2]]) {
      bar(content, 256, top, 104, 16)
      bar(content, 376, top + 4, 200, 8)
      rule(content, 248, top + 48, 928, 1)
      for (let i = 0; i < rows; i += 1) {
        const y = top + 72 + i * 72
        bar(content, 256, y, 120, 12)
        lines(256, y + 24, [240, 200], 16, 8)
        bar(content, 576, y, 64, 12)
        for (const x of [784, 848, 912]) bar(content, x, y - 6, 56, 24, 'field', 6)
        bar(content, 1104, y, 48, 12)
      }
    }
  } else if (screen === 'editor' || screen === 'chat') {
    const right = screen === 'chat' ? 840 : 1200
    column(488)
    bar(content, 256, 72, 64, 16)
    bar(content, 248, 104, 224, 32, 'field', 8)
    bar(content, 256, 160, 144, 12)
    bar(content, 256, 224, 80, 14)
    lines(256, 256, [160, 96, 144, 96], 24)
    bar(content, 256, 384, 64, 14)
    for (const [x, y, w] of [[256, 416, 64], [328, 416, 104], [256, 456, 72], [336, 456, 104]]) bar(content, x, y, w, 28, 'field', 6)
    bar(content, 520, 68, 80, 12)
    bar(content, right - 344, 60, 232, 28, 'field', 6)
    rule(content, 488, 104, right - 488, 1)
    bar(content, 520, 136, 120, 18)
    lines(520, 176, [right - 640, right - 720], 24)
    bar(content, 520, 248, 72, 18)
    for (let i = 0; i < 7; i += 1) {
      bar(content, 520, 288 + i * 40, 16, 10)
      bar(content, 552, 288 + i * 40, Math.max(120, right - 640 - ((i * 53) % 160)), 10)
    }
    bar(content, 520, 584, 88, 18)
    lines(520, 624, [right - 760, right - 680, right - 820], 24)
    if (screen === 'chat') {
      column(840)
      bar(content, 864, 16, 80, 14)
      bar(content, 856, 648, 328, 88, 'field', 12)
    }
  } else if (screen === 'cases') {
    column(488)
    bar(content, 256, 72, 64, 16)
    for (let i = 0; i < 5; i += 1) {
      bar(content, 256, 112 + i * 56, 200 - ((i * 37) % 64), 12)
      bar(content, 256, 132 + i * 56, 120, 8)
    }
    bar(content, 520, 64, 240, 18)
    bar(content, 520, 120, 48, 14)
    bar(content, 520, 152, 56, 10)
    bar(content, 520, 168, 648, 72, 'field', 8)
    bar(content, 520, 264, 48, 10)
    bar(content, 520, 280, 648, 32, 'field', 8)
    bar(content, 520, 344, 40, 10)
    for (const [x, w] of [[520, 104], [632, 112]]) bar(content, x, 368, w, 32, 'field', 6)
    rule(content, 520, 440, 648, 1)
    bar(content, 520, 472, 200, 12)
  } else {
    column(488)
    bar(content, 256, 72, 64, 16)
    for (let i = 0; i < 3; i += 1) {
      bar(content, 256, 112 + i * 64, 120, 12)
      for (const [x, w] of [[256, 40], [312, 40], [368, 32]]) bar(content, x, 132 + i * 64, w, 16, 'field', 4)
    }
    bar(content, 520, 64, 240, 18)
    bar(content, 888, 60, 280, 28, 'field', 6)
    if (screen === 'overview') {
      bar(content, 520, 120, 648, 248, 'field', 12)
      rule(content, 520, 400, 648, 1)
      for (let i = 0; i < 4; i += 1) {
        bar(content, 520, 432 + i * 48, 200, 12)
        for (const x of [904, 984, 1064]) bar(content, x, 428 + i * 48, 48, 20, 'field', 4)
      }
    } else {
      lines(520, 120, [184, 280], 32)
      bar(content, 520, 184, 120, 28, 'field', 6)
      bar(content, 520, 232, 648, 472, 'field', 12)
    }
  }
  return content
}

/**
 * One beat. `data` is the beat's file under shots/: how long it lasts, the screen
 * it is on, how film time maps to footage time (remap), the part of the app it
 * lifts (focus, in the app's 1200 × 750) and where the pointer went. The part
 * stays the same size for the whole beat: it comes in lifting off its place in
 * the window, and, when another beat of its chapter follows (`exit`), settles
 * back and goes before the cut. A bumper's wipe reveals a chapter's first beat:
 * `lead` seconds come before its zero, and `tail` after its end, under the next
 * page's wipe. A beat that follows another of its chapter on a straight cut is
 * `cutIn`: the window is already there, and only what changed fades.
 */
export function shot({ data, video: src, lead = 0, tail = 0, cutIn = false }) {
  const stage = document.querySelector('.stage')
  const frame = el('div', 'window', stage)
  Object.assign(frame.style, { left: `${WINDOW.x}px`, top: `${WINDOW.y}px`, width: `${WINDOW.w}px`, height: `${WINDOW_H}px` })
  const inner = el('div', 'window-in', frame)
  inner.style.transform = `scale(${K})`
  const changing = skeleton(data.screen, inner)

  // The part: the footage, cut to the box in focus, the same box all beat.
  const box = data.focus
  const card = el('div', 'card', stage)
  const content = el('div', 'content', card)
  const video = el('video', '', content)
  Object.assign(video, { src, muted: true, playsInline: true, preload: 'auto' })
  const build = data.lift
    ? liftUp(data.lift, content, data.liftUntil ?? Infinity)
    : data.diff
      ? diffUp(data.diff, content, data.diffAt)
      : data.swap
        ? swapUp(data.swap, content, data.swapAt)
        : null

  // Where the part rests: over its own place in the window, LIFT times larger
  // about its centre, held inside the window's edge.
  const S = K * LIFT
  const W = box.w * S
  const H = box.h * S
  const cx = clamp(WINDOW.x + (box.x + box.w / 2) * K, WINDOW.x + 8 + W / 2, WINDOW.x + WINDOW.w - 8 - W / 2)
  const cy = clamp(WINDOW.y + (box.y + box.h / 2) * K, WINDOW.y + 8 + H / 2, WINDOW.y + WINDOW_H - 8 - H / 2)
  Object.assign(card.style, { left: `${cx - W / 2}px`, top: `${cy - H / 2}px`, width: `${W}px`, height: `${H}px` })
  content.style.transform = `scale(${S}) translate(${-box.x}px, ${-box.y}px)`

  const moves = data.events.filter((e) => e.kind === 'move')
  const start = data.events.find((e) => e.name === 'begin')
  const filmOf = (tau) => along(data.remap.map(([u, v]) => [v, u]), tau)
  const presses = data.events
    .filter((e) => e.kind === 'down')
    .map((e) => ({ ...e, u: filmOf(e.t) }))
    .filter((e) => e.t >= data.remap[0][1] && e.t <= data.remap.at(-1)[1])
  const ripples = presses.map((p) => {
    const node = el('div', 'ripple', content)
    node.style.left = `${p.x}px`
    node.style.top = `${p.y}px`
    return node
  })

  const cursor = el('div', 'cursor', stage)
  cursor.innerHTML =
    '<svg viewBox="0 0 34 42" width="34" height="42"><path d="M6 4v27.5l6.9-6.3 4.6 10.9 5-2.1-4.6-10.7H27z" fill="#141615" stroke="#f4f2eb" stroke-width="2.2" stroke-linejoin="round"/></svg>'

  /** Where the pointer is at footage time tau, in the app. */
  const pointer = (tau) => {
    let at = { x: start.x, y: start.y }
    for (const m of moves) {
      if (tau < m.t) break
      const k = glide(span(tau, m.t, m.t1))
      // A slight arc, as a hand draws: it bows off the straight line mid-way.
      const bow = Math.sin(Math.PI * k) * Math.min(26, Math.hypot(m.x - m.x0, m.y - m.y0) * 0.07)
      const side = Math.atan2(m.y - m.y0, m.x - m.x0) - Math.PI / 2
      at = {
        x: lerp(m.x0, m.x, k) + Math.cos(side) * bow,
        y: lerp(m.y0, m.y, k) + Math.sin(side) * bow,
      }
    }
    return at
  }

  const seek = (tau) =>
    new Promise((done) => {
      // The middle of a frame of the 30 fps footage, so a seek never lands on an edge.
      const at = Math.min((Math.floor(tau * 30) + 0.5) / 30, Math.max(0, video.duration - 0.02))
      if (Math.abs(video.currentTime - at) < 1e-4 && !video.seeking && video.readyState >= 2)
        return done()
      video.addEventListener('seeked', () => done(), { once: true })
      video.currentTime = at
    })

  const loaded = new Promise((done) => {
    if (video.readyState >= 2) done()
    else video.addEventListener('loadeddata', () => done(), { once: true })
  })

  const length = data.length
  return {
    duration: lead + length + tail,
    ready: Promise.all([loaded, fonts()]),
    async frame(t) {
      const u = t - lead
      const tau = along(data.remap, clamp(u, 0, length))
      await seek(tau)

      // The window settles as the chapter's wipe passes; a cut leaves it where it is.
      const settle = cutIn ? 0 : 1 - mech(span(t, 0, 0.55))
      frame.style.transform = `scale(${1 + settle * 0.03})`
      // What differs from the beat before or after fades, so a cut never jumps.
      changing.style.opacity = (data.fadeIn ? span(u, 0, 0.25) : 1) * (data.exit && data.fadeOut ? 1 - span(u, length - 0.25, length) : 1)

      // The part lifts off its place as it comes in, and settles back to go.
      const come = mech(span(u, cutIn ? 0 : -0.05, cutIn ? 0.45 : 0.5))
      const go = data.exit ? mech(span(u, length - 0.28, length - 0.02)) : 0
      const up = come * (1 - go)
      const scale = lerp(1 / LIFT, 1, up)
      card.style.opacity = Math.min(span(u, cutIn ? 0 : -0.05, cutIn ? 0.16 : 0.12), 1 - span(u, length - 0.14, length - 0.02) * (data.exit ? 1 : 0))
      card.style.transform = `translateY(${(1 - up) * 10}px) scale(${scale})`
      card.style.setProperty('--lift', up)

      /** A point of the app, on the stage, as the part shows it. */
      const place = (x, y) => [cx + (x - (box.x + box.w / 2)) * S * scale, cy + (1 - up) * 10 + (y - (box.y + box.h / 2)) * S * scale]

      // Over the part the pointer moves as the part shows it; off it, as the window does, and faint.
      const p = pointer(tau)
      const off = Math.hypot(Math.max(box.x - p.x, 0, p.x - box.x - box.w), Math.max(box.y - p.y, 0, p.y - box.y - box.h))
      const near = 1 - inOutCubic(span(off, 0, 120))
      const onPart = place(p.x, p.y)
      const px = lerp(WINDOW.x + p.x * K, onPart[0], near)
      const py = lerp(WINDOW.y + p.y * K, onPart[1], near)
      let press = 0
      presses.forEach((hit, i) => {
        const age = u - hit.u
        press = Math.max(press, age < 0 ? span(age, -0.07, 0) : 1 - outCubic(span(age, 0.06, 0.3)))
        const k = span(age, 0, 0.3)
        const node = ripples[i]
        node.style.setProperty('--r', lerp(5, 26, snap(k)))
        node.style.setProperty('--o', age < 0 || k >= 1 ? 0 : (1 - k) * 0.95)
        node.style.setProperty('--d', age < 0 ? 0 : (1 - span(age, 0, 0.22)) * 0.5)
      })
      cursor.style.transform = `translate(${px - 6}px, ${py - 4}px) scale(${1.12 - press * 0.16})`
      // It comes in once the part is up, and can leave once its work is done
      // (`cursorOut`), or wait off screen until it has some (`cursorIn`).
      const showing = data.cursorIn ? span(u, data.cursorIn[0], data.cursorIn[1]) : span(u, cutIn ? 0.1 : 0.15, cutIn ? 0.3 : 0.4)
      const gone = data.cursorOut ? 1 - span(u, data.cursorOut[0], data.cursorOut[1]) : 1
      cursor.style.opacity = showing * lerp(0, 1, near) * gone * (1 - go)

      build?.(u)
    },
  }
}

/**
 * The version lift on Results, built up in the order it is read: the words rise
 * in, the score counts up from the first version's mean to the latest, and the
 * ribbon is drawn left to right, from v0's level up to v1's. `lift` is the figure
 * as the app drew it, element by element; it stands over the footage's own
 * figure, in the app's coordinates, until `until`: by then the camera has cut
 * away and the footage has scrolled out from under it. The rule under the figure
 * is left out: the camera frames the figure's content, and the rule lies below it.
 * Returns render(u).
 */
function liftUp(lift, parent, until) {
  const layer = el('div', 'lift', parent)
  const f = lift.figure
  const patch = el('div', 'lift-ground', layer)
  // It covers the figure and all the camera frames round it (`lift.frame`), so no
  // edge of the app's own layout shows at the card's edge. Its fill is the page's
  // ground as the footage shows it (`lift.ground`): the video's colours come out a
  // shade apart from the app's own in CSS.
  const fr = lift.frame ?? f
  const x0 = Math.min(f.x - 4, fr.x - 2)
  const y0 = Math.min(f.y - 4, fr.y - 2)
  const x1 = Math.max(f.x + f.w + 4, fr.x + fr.w + 2)
  const y1 = Math.max(f.y + f.h + 2, fr.y + fr.h + 2)
  Object.assign(patch.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` })
  if (lift.ground) patch.style.background = lift.ground
  const r = lift.ribbon
  const band = el('div', 'lift-band', layer)
  Object.assign(band.style, { left: `${r.x}px`, top: `${r.y - 8}px`, width: `${r.w + 8}px`, height: `${r.h + 24}px` })
  const svgBox = el('div', '', band)
  Object.assign(svgBox.style, { position: 'absolute', left: `${lift.svg.x - r.x}px`, top: `${lift.svg.y - r.y + 8}px`, width: `${lift.svg.w}px`, height: `${lift.svg.h}px` })
  svgBox.innerHTML = lift.svg.html.replace('<svg ', `<svg width="${lift.svg.w}" height="${lift.svg.h}" style="overflow: visible; display: block" `)

  const first = lift.texts.find((x) => x.group === 'ribbon' && /^\d+$/.test(x.text))
  let order = 0
  const words = lift.texts.map((x) => {
    const inBand = x.group === 'ribbon'
    const mask = el('div', 'lift-mask', inBand ? band : layer)
    Object.assign(mask.style, {
      left: `${inBand ? x.x - r.x : x.x}px`,
      top: `${inBand ? x.y - r.y + 8 : x.y}px`,
      height: `${x.h}px`,
      width: `${x.w + 6}px`,
    })
    const span = el('span', '', mask)
    span.textContent = x.text
    Object.assign(span.style, {
      font: `${x.weight} ${x.size}px/${x.h}px ${x.mono ? 'var(--mono)' : 'var(--sans)'}`,
      letterSpacing: x.spacing === 'normal' ? '0' : x.spacing,
      color: x.color,
      fontVariantNumeric: 'tabular-nums',
    })
    const big = x.size > 40
    return { span, inBand, big, text: x.text, at: inBand ? 0 : 0.12 + order++ * 0.055 }
  })
  const from = Number(first?.text ?? 0)

  return (u) => {
    layer.style.visibility = u < until ? 'visible' : 'hidden'
    // The ribbon is drawn left to right with what stands in it.
    const k = mech(span(u, 0.32, 1.18))
    band.style.clipPath = `inset(-20px ${(1 - k) * 100}% -20px -20px)`
    for (const w of words) {
      if (w.inBand) continue
      w.span.style.transform = `translateY(${(1 - snap(span(u, w.at, w.at + 0.26))) * 105}%)`
      if (w.big) {
        const to = Number(w.text)
        w.span.textContent = String(Math.round(lerp(from, to, mech(span(u, 0.22, 1.18)))))
      }
    }
  }
}

/**
 * The word diff on Results, set line by line into an empty panel. When Word diff
 * is pressed the panel is empty; then each line rises in, a beat after the one
 * above, with the words both versions share and the words v1 dropped. A moment
 * later the changes are marked along the line, left to right: a dropped word
 * turns red as its strike is drawn, and an added word is printed into its green
 * mark as the mark is laid. Rises use `snap`; marks and strikes use `mech`.
 * `diff` is the view as the app drew it, one piece per line of each run of
 * text. Returns render(u).
 */
function diffUp(diff, parent, { on, start, step, rise, mark, across }) {
  const layer = el('div', 'lift', parent)
  const b = diff.box
  const patch = el('div', 'lift-ground', layer)
  // The diff sits on the fill of the box around it, as the app drew it, not the page's.
  Object.assign(patch.style, { left: `${b.x - 6}px`, top: `${b.y}px`, width: `${b.w + 12}px`, height: `${b.h}px`, background: diff.ground })
  const plain = diff.pieces.find((p) => p.kind === 'same')?.color ?? 'var(--paper)'
  const tops = [...new Set(diff.pieces.map((p) => Math.round(p.y)))].sort((a, c) => a - c)
  const lines = tops.map((y, i) => {
    const row = diff.pieces.filter((p) => Math.round(p.y) === y)
    const x0 = Math.min(...row.map((p) => p.x))
    const x1 = Math.max(...row.map((p) => p.x + p.w))
    return { y, x0, x1, at: start + i * step, box: el('div', 'diff-line', layer) }
  })
  const type = (node, p, color) => {
    node.textContent = p.text.replace(/\n$/, '')
    Object.assign(node.style, { font: `${p.weight} ${p.size}px/${p.h}px ${p.mono ? 'var(--mono)' : 'var(--sans)'}`, color })
  }
  const pieces = diff.pieces.map((p) => {
    const line = lines[tops.indexOf(Math.round(p.y))]
    const at = line.at + mark + ((p.x - line.x0) / Math.max(1, line.x1 - line.x0)) * across
    const place = (node, extra = {}) => Object.assign(node.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w + 2}px`, height: `${p.h}px`, ...extra })
    const tint = p.kind === 'same' ? null : el('div', 'diff-mark', line.box)
    if (tint) place(tint, { width: `${p.w}px`, background: p.bg })
    const word = el('div', 'lift-mask', line.box)
    place(word)
    const text = el('span', '', word)
    type(text, p, p.kind === 'del' ? plain : p.color)
    // A dropped word turns red over its plain self.
    const red = p.kind === 'del' ? el('span', 'diff-over', word) : null
    if (red) type(red, p, p.color)
    const strike = p.kind === 'del' ? el('div', 'diff-strike', line.box) : null
    if (strike) Object.assign(strike.style, { left: `${p.x}px`, top: `${p.y + p.h * 0.55}px`, width: `${p.w}px`, background: p.mark })
    return { ...p, at, tint, word, red, strike }
  })

  return (u) => {
    layer.style.visibility = u >= on ? 'visible' : 'hidden'
    for (const l of lines) {
      const k = snap(span(u, l.at, l.at + rise))
      l.box.style.opacity = k
      l.box.style.transform = `translateY(${(1 - k) * 10}px)`
    }
    for (const p of pieces) {
      const k = mech(span(u, p.at, p.at + 0.32))
      if (p.kind === 'del') {
        p.red.style.opacity = k
        p.tint.style.opacity = k
        p.strike.style.transform = `scaleX(${k})`
      } else if (p.kind === 'ins') {
        p.tint.style.transform = `scaleX(${k})`
        p.word.style.clipPath = `inset(-2px ${(1 - k) * 100}% -2px 0)`
      }
    }
  }
}

/**
 * A rule replaced in the editor. The footage already shows the new rule; over it
 * the old one stands until `start`. Then a strike is drawn through it, its words
 * leave upward one after another, and the new words rise in, a beat apart, onto
 * the same line. `swap` holds both rules as the app drew them, one piece per
 * line on screen, and the editor's ground. Nothing shows before `on`, while
 * the footage still has the popout over the line. Returns render(u).
 */
function swapUp(swap, parent, { on, start }) {
  const layer = el('div', 'lift swap', parent)
  const all = [...swap.old.pieces, ...swap.new.pieces]
  const x0 = Math.min(...all.map((p) => p.x))
  const y0 = Math.min(...all.map((p) => p.y))
  const x1 = Math.max(...all.map((p) => p.x + p.w))
  const y1 = Math.max(...all.map((p) => p.y + p.h))
  const patch = el('div', 'lift-ground', layer)
  // Wide enough to cover the caret at the end of the new rule too. Its fill is
  // the editor's ground as the footage shows it (`swap.ground`): the video's
  // colours come out a shade apart from the app's own in CSS. Soft edges hide the rest.
  Object.assign(patch.style, { left: `${x0 - 5}px`, top: `${y0 - 2}px`, width: `${x1 - x0 + 16}px`, height: `${y1 - y0 + 4}px`, background: swap.ground })
  let order = 0
  const words = (pieces, kind) =>
    pieces.flatMap((p) => {
      const row = el('div', 'swap-row', layer)
      Object.assign(row.style, { left: `${p.x}px`, top: `${p.y}px`, height: `${p.h}px`, font: `${p.weight} ${p.size}px/${p.h}px ${p.mono ? 'var(--mono)' : 'var(--sans)'}`, color: p.color, letterSpacing: p.spacing === 'normal' ? '0' : p.spacing })
      // One strike per line on screen, drawn from the first piece on it across the others.
      const same = pieces.filter((o) => Math.round(o.y) === Math.round(p.y))
      const strike = kind === 'old' && same[0] === p ? el('div', 'swap-strike', layer) : null
      const end = Math.max(...same.map((o) => o.x + o.w))
      if (strike) Object.assign(strike.style, { left: `${p.x}px`, top: `${p.y + p.h * 0.56}px`, width: `${end - p.x}px`, background: p.color })
      const list = (p.text.match(/\s*\S+/g) ?? []).map((word) => {
        const mask = el('span', 'swap-word', row)
        const inner = el('span', '', mask)
        inner.textContent = word
        return { inner, i: order++ }
      })
      return [{ row, strike, list }]
    })
  const before = words(swap.old.pieces, 'old')
  order = 0
  const after = words(swap.new.pieces, 'new')

  const render = (u) => {
    layer.style.visibility = u >= on ? 'visible' : 'hidden'
    const struck = mech(span(u, start, start + 0.32))
    for (const { row, strike, list } of before) {
      if (strike) {
        strike.style.transform = `scaleX(${struck})`
        strike.style.opacity = 1 - span(u, start + 0.36, start + 0.5)
      }
      row.style.opacity = lerp(1, 0.5, struck)
      for (const w of list) {
        const k = mech(span(u, start + 0.36 + w.i * 0.02, start + 0.56 + w.i * 0.02))
        w.inner.style.transform = `translateY(${-k * 105}%)`
      }
    }
    for (const { list } of after) {
      for (const w of list) {
        const k = snap(span(u, start + 0.66 + w.i * 0.035, start + 0.94 + w.i * 0.035))
        w.inner.style.transform = `translateY(${(1 - k) * 105}%)`
      }
    }
  }
  return render
}

/** The mark, as an SVG that pages animate stroke by stroke. */
export function mark(size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 184 152')
  svg.setAttribute('width', size)
  svg.setAttribute('height', (size * 152) / 184)
  for (const d of MARK) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'currentColor')
    svg.append(path)
  }
  return svg
}
