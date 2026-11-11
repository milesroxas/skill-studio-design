// What every page of the cases teaser shares, from the reel's kit laid out for a
// 1920 × 1280 frame: easing, and the shot player. A shot draws
// the app as shapes, traced from the real screen when it was filmed, and lifts
// one part of it off that plan as filmed footage, with a pointer and notes over
// it. Every picture depends only on t.

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

/** The plan's window on the stage; K is how much larger than the app it is drawn. */
const WINDOW = { x: 64, y: 80, w: 1792 }
const K = WINDOW.w / 1200
/** Where a lifted part comes to rest, and the most room it takes. */
const HERO = { x: 960, y: 640, w: 1780, h: 1170, most: 2.6, left: 50, right: 1870, top: 45, bottom: 1235 }

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

/** The blocks of one screen, as elements inside `parent`. */
function blocks(list, parent) {
  return list.map(([x, y, w, h, r, kind, extra]) => {
    const node = el('div', `sk ${kind ?? ''}`, parent)
    Object.assign(node.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      borderRadius: `${r}px`,
    })
    if (kind === 'area') node.style.background = extra
    if (kind === 'box') node.style.background = `rgba(244, 242, 235, ${extra})`
    return node
  })
}

/**
 * When one block of the screen is drawn, 0 to 1, as the screen redraws left to
 * right (and a little top to bottom): each block scales in from its left edge.
 */
const sweep = (b) => (b[0] / 1200) * 0.75 + (b[1] / 750) * 0.25
const TRACE = { spread: 0.2, dur: 0.25 }

/**
 * One shot. `data` is the shot's file under shots/: how long it lasts, the
 * screen it shows, how film time maps to footage time (remap), the part of the
 * app it lifts and when that part changes (focus, in the app's 1200 × 750), and
 * where the pointer went. The window and its sidebar never leave the frame:
 * `intro` seconds before the shot's zero, the sidebar's highlight slides from
 * the screen before (`data.from`) to this one and the screen draws itself in;
 * `outro` seconds after its end, the lifted part sinks back into the screen,
 * dissolves into its shapes, and the screen erases, for the next one to draw.
 */
export function shot({ data, video: src, intro = 0.55, outro = 0.8 }) {
  const stage = document.querySelector('.stage')
  const frame = el('div', 'window', stage)
  const card = el('div', 'card', stage)
  const L = data.length

  // The sidebar: the same in every shot, so the window holds still across them.
  const side = el('div', 'plan', frame)
  const mark = el('div', 'sk hilite', side)
  const rows = data.sidebar.nav
  const rowOf = (name) => rows[name] ?? rows[data.to]
  const labels = {}
  blocks(data.sidebar.blocks.filter((x) => !x[7]), side)
  for (const [name, bar] of Object.entries(data.sidebar.labels)) {
    const [node] = blocks([bar], side)
    const text = el('div', 'nav-name', side)
    text.textContent = name
    const a = data.sidebar.active
    Object.assign(text.style, { left: `${a.x}px`, top: `${rows[name].y - a.h / 2}px`, height: `${a.h}px`, fontSize: `${a.size}px`, lineHeight: `${a.h}px`, fontWeight: a.weight })
    labels[name] = { bar: node, text }
  }

  // The screen itself, drawn and erased block by block.
  const plan = el('div', 'plan', frame)
  const traced = data.plan.blocks.filter((x) => x[0] >= 230)
  const nodes = blocks(traced, plan).map((node, i) => ({ node, at: sweep(traced[i]) * TRACE.spread }))
  const traceIn = intro - 0.55
  const traceOut = L + 0.36

  // The lifted part: the footage, cut to the part in focus.
  const content = el('div', 'content', card)
  const video = el('video', '', content)
  Object.assign(video, { src, muted: true, playsInline: true, preload: 'auto' })
  for (const ring of document.querySelectorAll('.ring')) content.append(ring)
  const build = data.lift ? liftUp(data.lift, content) : data.diff ? diffUp(data.diff, content, data.diffAt) : null

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

  // Notes stand over the lifted part, and the pointer over everything.
  const pills = [...document.querySelectorAll('.pill')]
  const rings = [...content.querySelectorAll('.ring')]
  stage.append(...pills)
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

  /**
   * The part of the app in focus at film time u: the box the lifted part takes
   * (`x, y, w, h`), and what of the footage shows in it (`see`, and how clearly, `clear`).
   * A change of focus slides across the app, or, with `cut`, swaps one part for
   * another while the box changes shape: the footage dips out and back in.
   */
  const focus = (u) => {
    let now = { ...data.focus[0], see: data.focus[0], clear: 1 }
    for (const next of data.focus.slice(1)) {
      if (u < next.t) break
      const raw = span(u, next.t, next.t + next.dur)
      const k = mech(raw)
      const box = { x: lerp(now.x, next.x, k), y: lerp(now.y, next.y, k), w: lerp(now.w, next.w, k), h: lerp(now.h, next.h, k) }
      now = next.cut
        ? { ...box, see: raw < 0.5 ? now.see : next, clear: raw >= 1 ? 1 : raw < 0.5 ? 1 - span(raw, 0, 0.42) : span(raw, 0.58, 1) }
        : { ...box, see: box, clear: 1 }
    }
    return now
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

  return {
    duration: Math.round((intro + L + outro) * 1000) / 1000,
    ready: Promise.all([loaded, fonts()]),
    async frame(t) {
      const u = t - intro
      const tau = along(data.remap, clamp(u, 0, L))
      await seek(tau)

      // The highlight slides to this screen's item, as a click on it would move it.
      const go = mech(span(t, 0, 0.4))
      const from = rowOf(data.from)
      const to = rowOf(data.to)
      Object.assign(mark.style, { left: `${to.x}px`, top: `${lerp(from.y, to.y, go) - to.h / 2}px`, width: `${to.w}px`, height: `${to.h}px`, borderRadius: '4px' })
      for (const [name, l] of Object.entries(labels)) {
        const on = name === data.to ? span(t, 0.2, 0.42) : name === data.from ? 1 - span(t, 0, 0.22) : 0
        l.text.style.opacity = on
        l.bar.style.opacity = 1 - on
      }

      // The screen draws in left to right, and erases the same way.
      for (const n of nodes) {
        const k = mech(span(t, traceIn + n.at, traceIn + n.at + TRACE.dur)) * (1 - mech(span(u, traceOut + n.at, traceOut + n.at + TRACE.dur)))
        n.node.style.transform = `scaleX(${k})`
        n.node.style.opacity = k
      }

      // The part lifts off the screen, and at the end sinks back into it; the plan dims under it.
      const part = focus(u)
      const lift = mech(span(u, -0.05, 0.5)) * (1 - mech(span(u, L + 0.02, L + 0.4)))
      // Everything but the lifted part steps back: the screen more, the sidebar less.
      plan.style.opacity = lerp(1, 0.3, lift)
      side.style.opacity = lerp(1, 0.55, lift)

      const home = {
        x: WINDOW.x + (part.x + part.w / 2) * K,
        y: WINDOW.y + (part.y + part.h / 2) * K,
      }
      const most = Math.min(HERO.w / part.w, HERO.h / part.h, data.most ?? HERO.most)
      const scale = Math.exp(lerp(Math.log(K), Math.log(most), lift))
      const w = part.w * scale
      const h = part.h * scale
      // It rests near the middle, drawn a little toward where it came from.
      const big = { w: part.w * most, h: part.h * most }
      const rest = {
        x: clamp(lerp(HERO.x, home.x, 0.18), HERO.left + big.w / 2, HERO.right - big.w / 2),
        y: clamp(lerp(HERO.y, home.y, 0.18), HERO.top + big.h / 2, HERO.bottom - big.h / 2),
      }
      const left = lerp(home.x, rest.x, lift) - w / 2
      const top = lerp(home.y, rest.y, lift) - h / 2
      // Down in its place, the footage dissolves into the shapes it was traced as.
      Object.assign(card.style, {
        transform: `translate(${left}px, ${top}px)`,
        width: `${w}px`,
        height: `${h}px`,
        opacity: span(u, -0.1, 0.08) * (1 - span(u, L + 0.3, L + 0.45)),
      })
      // What shows is centred in the box, so a part swapped in mid-change stays put while the box moves.
      const see = part.see
      content.style.transform = `translate(${w / 2}px, ${h / 2}px) scale(${scale}) translate(${-(see.x + see.w / 2)}px, ${-(see.y + see.h / 2)}px)`
      content.style.opacity = part.clear
      /** A point of the app, on the stage, as the lifted part shows it. */
      const place = (x, y) => [
        left + w / 2 + (x - (see.x + see.w / 2)) * scale,
        top + h / 2 + (y - (see.y + see.h / 2)) * scale,
      ]

      // Over the lifted part the pointer moves as the part shows it; well clear of it, as the plan does.
      const p = pointer(tau)
      const off = Math.hypot(Math.max(part.x - p.x, 0, p.x - part.x - part.w), Math.max(part.y - p.y, 0, p.y - part.y - part.h))
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
      // Off the part, the pointer is on the dimmed plan: it dims with it.
      // A shot that is only held (`cursor: false`) shows no pointer.
      cursor.style.opacity = data.cursor === false ? 0 : span(u, 0.1, 0.4) * (1 - span(u, L - 0.1, L + 0.15)) * lerp(0.2, 1, near)

      // Notes and rings come and go on their own times, anchored in the app; all are gone before the part sinks.
      for (const pill of pills) {
        const d = pill.dataset
        const out = Math.min(+d.out, L)
        const inK = snap(span(u, +d.in, +d.in + 0.2))
        const outK = mech(span(u, out - 0.14, out))
        const [ax, ay] = place(+d.x, +d.y)
        const gap = 20
        const pw = pill.offsetWidth
        const ph = pill.offsetHeight
        const tailAt = +(d.tail ?? 28)
        pill.style.setProperty('--tail', `${tailAt - 7}px`)
        const at = {
          up: [ax - tailAt, ay - ph - gap],
          down: [ax - tailAt, ay + gap],
          left: [ax - pw - gap, ay - ph / 2],
          right: [ax + gap, ay - ph / 2],
        }[d.dir]
        // A note drops in like a flap, hinged at its top edge, and folds back up to go.
        pill.style.transformOrigin = '50% 0'
        pill.style.transform = `translate(${at[0]}px, ${at[1]}px) perspective(500px) rotateX(${-90 * (1 - inK) + 90 * outK}deg)`
        pill.style.opacity = inK > 0 && outK < 1 ? 1 : 0
      }
      build?.(u)
      for (const ring of rings) {
        const d = ring.dataset
        const inK = snap(span(u, +d.in, +d.in + 0.18))
        const grow = lerp(10, 0, inK)
        ring.style.left = `${+d.x - grow}px`
        ring.style.top = `${+d.y - grow}px`
        ring.style.width = `${+d.w + grow * 2}px`
        ring.style.height = `${+d.h + grow * 2}px`
        ring.style.opacity = u >= +d.in && u < Math.min(+d.out, L - 0.05) ? 1 : 0
      }
    },
  }
}

/**
 * The version lift on Results, built up in the order it is read: the rule under
 * it draws, the words rise in, the score counts up from the first version's mean
 * to the latest, and the ribbon is drawn left to right, from v0's level up to v1's.
 * `lift` is the figure as the app drew it, element by element; it stands over the
 * footage's own figure, in the app's coordinates. Returns render(u).
 */
function liftUp(lift, parent) {
  const layer = el('div', 'lift', parent)
  const f = lift.figure
  const patch = el('div', 'lift-ground', layer)
  Object.assign(patch.style, { left: `${f.x - 4}px`, top: `${f.y - 4}px`, width: `${f.w + 8}px`, height: `${f.h + 6}px` })
  const rule = el('div', 'lift-rule', layer)
  Object.assign(rule.style, { left: `${lift.rule.x}px`, top: `${lift.rule.y}px`, width: `${lift.rule.w}px`, height: `${lift.rule.h}px`, background: lift.rule.color })
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
    rule.style.transform = `scaleX(${mech(span(u, 0.02, 0.6))})`
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
 * The word diff on Compare, set line by line into an empty panel. When Word diff
 * is pressed the panel is empty; then each line rises in, a beat after the one
 * above, with the words both versions share and the words v1 dropped. A moment
 * later the changes are marked along the line, left to right: a dropped word
 * turns red as its strike is drawn, and an added word is printed into its green
 * mark as the mark is laid. Rises use `snap`; marks and strikes use `mech`.
 * `diff` is the view as the app drew it, one piece per line of each run of
 * text. Returns render(u).
 */
function diffUp(diff, parent, { on, start, step, rise, mark, across, ground = '#181a1a', bottom = 750 }) {
  const layer = el('div', 'lift', parent)
  const b = diff.box
  const patch = el('div', 'lift-ground', layer)
  // The diff sits on the panel's fill, as the footage shows it, not the page's,
  // and stops where the panel's scroll does, above the vote bar.
  Object.assign(patch.style, { left: `${b.x - 6}px`, top: `${b.y}px`, width: `${b.w + 12}px`, height: `${Math.min(b.h, bottom - b.y)}px`, background: ground })
  layer.style.clipPath = `inset(0 0 ${750 - bottom}px 0)`
  const plain = diff.pieces.find((p) => p.kind === 'same')?.color ?? 'var(--paper)'
  // Pieces a few px apart (struck and plain runs) share a line.
  const tops = []
  for (const y of [...new Set(diff.pieces.map((p) => Math.round(p.y)))].sort((a, c) => a - c))
    if (!tops.length || y - tops.at(-1) > 6) tops.push(y)
  const lineOf = (y) => tops.findLastIndex((top) => Math.round(y) >= top)
  const lines = tops.map((y, i) => {
    const row = diff.pieces.filter((p) => lineOf(p.y) === i)
    const x0 = Math.min(...row.map((p) => p.x))
    const x1 = Math.max(...row.map((p) => p.x + p.w))
    return { y, x0, x1, at: start + i * step, box: el('div', 'diff-line', layer) }
  })
  const type = (node, p, color) => {
    node.textContent = p.text.replace(/\n$/, '')
    Object.assign(node.style, { font: `${p.weight} ${p.size}px/${p.h}px ${p.mono ? 'var(--mono)' : 'var(--sans)'}`, color })
  }
  const pieces = diff.pieces.map((p) => {
    const line = lines[lineOf(p.y)]
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
