// What every page of the reel shares: easing, and the shot player. A shot draws
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
const WINDOW = { x: 252, y: 97, w: 1416 }
const K = WINDOW.w / 1200
/** Where a lifted part comes to rest, and the most room it takes. */
const HERO = { x: 960, y: 540, w: 1560, h: 880, most: 2.1 }

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
 * One shot. `data` is the shot's file under shots/: how long it lasts, the
 * screen it shows, how film time maps to footage time (remap), the part of the
 * app it lifts and when that part changes (focus, in the app's 1200 × 750), and
 * where the pointer went. A bumper's wipe reveals the shot: `lead` seconds come
 * before its zero, and `tail` after its end, under the next page's wipe.
 */
export function shot({ data, video: src, lead = 0, tail = 0 }) {
  const stage = document.querySelector('.stage')
  const frame = el('div', 'window', stage)
  const card = el('div', 'card', stage)

  // The plan: the screen as it was traced, with the current sidebar item still named.
  const plan = el('div', 'plan', frame)
  blocks(data.plan.blocks, plan)
  const a = data.plan.active
  const name = a ? el('div', 'nav-name', plan) : null
  if (a) {
    name.textContent = a.name
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(a.font)?.[1] ?? 13)
    Object.assign(name.style, { left: `${a.x}px`, top: `${a.y}px`, height: `${a.h}px`, fontSize: `${size}px`, lineHeight: `${a.h}px`, fontWeight: /^(\d{3})/.exec(a.font)?.[1] ?? 500 })
  }

  // The lifted part: the footage, cut to the part in focus.
  const content = el('div', 'content', card)
  const video = el('video', '', content)
  Object.assign(video, { src, muted: true, playsInline: true, preload: 'auto' })
  for (const ring of document.querySelectorAll('.ring')) content.append(ring)
  const build = data.lift
    ? liftUp(data.lift, content, data.liftUntil ?? Infinity)
    : data.diff
      ? diffUp(data.diff, content, data.diffAt)
      : data.swap
        ? swapUp(data.swap, content, data.swapAt)
        : null

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

  /**
   * Where a part of the app is in the plan (`home`, as the window stands after
   * `settle`), and where it comes to rest lifted off it: near the middle, drawn a
   * little toward where it came from (`pull`; 0 rests it dead centre), `most`
   * times the app's size, taking `big` room.
   */
  const restOf = (part, settle = 0) => {
    const home = {
      x: WINDOW.x + 708 + (part.x + part.w / 2 - 600) * K * (1 + settle * 0.05),
      y: WINDOW.y + 442 + (part.y + part.h / 2 - 375) * K * (1 + settle * 0.05),
    }
    const most = Math.min(HERO.w / part.w, HERO.h / part.h, HERO.most)
    const pull = data.pull ?? 0.18
    const big = { w: part.w * most, h: part.h * most }
    const rest = {
      x: clamp(lerp(HERO.x, home.x, pull), 80 + big.w / 2, 1840 - big.w / 2),
      y: clamp(lerp(HERO.y, home.y, pull), 70 + big.h / 2, 1010 - big.h / 2),
    }
    return { home, most, big, rest }
  }
  /** Whether any part comes to rest over the sidebar's name; known once the fonts are in. */
  let covers = null

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
    duration: lead + data.length + tail,
    ready: Promise.all([loaded, fonts()]),
    async frame(t) {
      const u = t - lead
      const tau = along(data.remap, clamp(u, 0, data.length))
      await seek(tau)

      // The window settles as the wipe passes; the plan dims as the part lifts off it.
      const part = focus(u)
      const lift = mech(span(u, -0.05, 0.5))
      const settle = 1 - mech(span(t, 0, 0.55))
      frame.style.transform = `scale(${1 + settle * 0.05})`
      plan.style.opacity = lerp(1, 0.42, lift)

      const { home, most, rest } = restOf(part, settle)
      const scale = Math.exp(lerp(Math.log(K), Math.log(most), lift))
      const w = part.w * scale
      const h = part.h * scale
      // The sidebar's name goes as a part comes to rest over it, so no edge of the part cuts a word.
      if (name) {
        covers ??= data.focus.some((f) => {
          const r = restOf(f)
          const x = WINDOW.x + a.x * K
          const y = WINDOW.y + a.y * K
          return x < r.rest.x + r.big.w / 2 && x + name.offsetWidth * K > r.rest.x - r.big.w / 2 && y < r.rest.y + r.big.h / 2 && y + a.h * K > r.rest.y - r.big.h / 2
        })
        name.style.opacity = covers ? 1 - lift : 1
      }
      const left = lerp(home.x, rest.x, lift) - w / 2
      const top = lerp(home.y, rest.y, lift) - h / 2
      Object.assign(card.style, {
        transform: `translate(${left}px, ${top}px)`,
        width: `${w}px`,
        height: `${h}px`,
        opacity: span(u, -0.1, 0.08),
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
      // Off the part, the pointer is on the dimmed plan: it dims with it. Once its
      // work is done it can leave, so it never stands over what the shot ends on.
      // With nothing to do yet it can wait off screen (`cursorIn`).
      const come = data.cursorIn ? span(u, data.cursorIn[0], data.cursorIn[1]) : span(u, 0.1, 0.4)
      const gone = data.cursorOut ? 1 - span(u, data.cursorOut[0], data.cursorOut[1]) : 1
      cursor.style.opacity = come * lerp(0.2, 1, near) * gone

      // Notes and rings come and go on their own times, anchored in the app.
      for (const pill of pills) {
        const d = pill.dataset
        const inK = snap(span(u, +d.in, +d.in + 0.2))
        const outK = mech(span(u, +d.out - 0.14, +d.out))
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
        ring.style.opacity = u >= +d.in && u < +d.out ? 1 : 0
      }
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
