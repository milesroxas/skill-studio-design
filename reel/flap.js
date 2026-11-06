// A split-flap board, as a departures board has. Each character is a module
// with its own drum of flaps: to change, it falls through the characters
// before its target, one flap at a time, at its own rate. `plan` works out
// every flap from the rows and a seed, and touches no page, so the build times
// the sound by the same flaps; `mount` draws the board and returns a renderer
// whose picture depends only on t.

export const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,'?/-"

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const at = (ch) => {
  const i = DRUM.indexOf(ch)
  if (i < 0) throw new Error(`The drum has no flap for "${ch}".`)
  return i
}

/** The tone of column c in an event: [from, to, tone] ranges, else the event's own. */
const toneOf = (ev, c) => (ev.tones ?? []).find(([a, b]) => c >= a && c < b)?.[2] ?? ev.tone ?? ''

/**
 * rows: [{ cols, size, events: [{ at, text, tone?, tones?, stagger?, jitter?, spin? }] }].
 * An event sets the whole row (text padded with blanks); a module flips only if
 * its character changes. Returns, per row, per module, its flaps:
 * { t, d, from, to, fromTone, toTone, last } in time order.
 */
export function plan(rows, seed = 1) {
  const rand = mulberry32(seed)
  return rows.map((row) =>
    Array.from({ length: row.cols }, (_, c) => {
      // Each module runs at its own rate, as worn drums do.
      const rate = 0.024 + rand() * 0.018
      let ch = ' '
      let tone = ''
      let free = -Infinity
      const flaps = []
      for (const ev of row.events) {
        const target = (ev.text[c] ?? ' ').toUpperCase()
        const toTone = toneOf(ev, c)
        const start = ev.at + c * (ev.stagger ?? 0.03) + rand() * (ev.jitter ?? 0.03)
        if (target === ch) {
          tone = toTone
          continue
        }
        // The characters it falls through: a few before the target on the drum,
        // or, going blank, a few after the one it shows.
        const n = target === ' ' ? 1 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * (ev.spin ?? 7))
        const seq = []
        for (let k = n - 1; k >= 1; k -= 1)
          seq.push(target === ' ' ? DRUM[(at(ch) + n - k) % DRUM.length] : DRUM[(at(target) - k + DRUM.length) % DRUM.length])
        seq.push(target)
        let t = Math.max(start, free)
        let from = ch
        let fromTone = tone
        for (const [k, to] of seq.entries()) {
          flaps.push({ t, d: rate, from, to, fromTone, toTone, last: k === seq.length - 1 })
          from = to
          fromTone = toTone
          t += rate
        }
        free = t
        ch = target
        tone = toTone
      }
      return flaps
    }),
  )
}

/** Every flap as a sound cue: when, where across the board (-1 to 1), and how big the module is. */
export function cues(rows, planned, left = 0, width = 1920) {
  const out = []
  planned.forEach((tiles, r) => {
    const { w, gap } = SIZES[rows[r].size]
    tiles.forEach((flaps, c) => {
      const x = (rows[r].x ?? left) + c * (w + gap) + w / 2
      for (const f of flaps) out.push({ t: f.t, kind: 'flap', pan: (x / width) * 2 - 1, size: rows[r].size, last: f.last })
    })
  })
  return out.sort((a, b) => a.t - b.t)
}

/** Module sizes: width, height, type size and the gap between modules, in px. */
export const SIZES = {
  l: { w: 80, h: 128, fs: 100, gap: 5 },
  m: { w: 58, h: 92, fs: 72, gap: 4 },
  s: { w: 30, h: 48, fs: 34, gap: 3 },
}

const easeIn = (k) => k * k
const settle = (k, last) => {
  // The landing flap swings a little past and comes back: the detent.
  if (!last) return 1 - (1 - k) * (1 - k)
  const s = 2.4
  return 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2
}

/** Draw the rows inside `root` and return render(t). */
export function mount(root, rows, planned) {
  const tiles = []
  rows.forEach((row, r) => {
    const { w, h, fs, gap } = SIZES[row.size]
    const line = document.createElement('div')
    line.className = 'fl-row'
    Object.assign(line.style, { gap: `${gap}px`, marginTop: `${row.space ?? 0}px` })
    if (row.x !== undefined) line.style.marginLeft = `${row.x}px`
    root.append(line)
    planned[r].forEach((flaps) => {
      const tile = document.createElement('div')
      tile.className = 'ft'
      tile.style.setProperty('--w', `${w}px`)
      tile.style.setProperty('--h', `${h}px`)
      tile.style.setProperty('--fs', `${fs}px`)
      tile.innerHTML = '<div class="h t"><span></span></div><div class="h b"><span></span></div><div class="lf t"><span></span></div><div class="lf b"><span></span></div>'
      line.append(tile)
      const [, , leafTop, leafBot] = tile.children
      tiles.push({ flaps, leafTop, leafBot, spans: [...tile.querySelectorAll('span')] })
    })
  })
  const show = (span, ch, tone) => {
    span.textContent = ch === ' ' ? ' ' : ch
    span.className = tone
  }
  return (t) => {
    for (const tile of tiles) {
      const { flaps, leafTop, leafBot, spans } = tile
      const now = flaps.find((f) => t >= f.t && t < f.t + f.d)
      if (!now) {
        const done = flaps.filter((f) => t >= f.t + f.d).at(-1)
        const ch = done ? done.to : flaps.length && t < flaps[0].t ? flaps[0].from : ' '
        const tone = done ? done.toTone : ''
        show(spans[0], ch, tone)
        show(spans[1], ch, tone)
        leafTop.style.visibility = 'hidden'
        leafBot.style.visibility = 'hidden'
        continue
      }
      const p = (t - now.t) / now.d
      // Behind the falling flap: the new top half, and the old bottom half until the flap lands on it.
      show(spans[0], now.to, now.toTone)
      show(spans[1], now.from, now.fromTone)
      if (p < 0.5) {
        const k = easeIn(p * 2)
        show(spans[2], now.from, now.fromTone)
        leafTop.style.visibility = 'visible'
        leafTop.style.transform = `rotateX(${-90 * k}deg)`
        leafTop.style.filter = `brightness(${1 - 0.55 * k})`
        leafBot.style.visibility = 'hidden'
      } else {
        const k = settle((p - 0.5) * 2, now.last)
        show(spans[3], now.to, now.toTone)
        leafTop.style.visibility = 'hidden'
        leafBot.style.visibility = 'visible'
        leafBot.style.transform = `rotateX(${90 * (1 - k)}deg)`
        leafBot.style.filter = `brightness(${0.45 + 0.55 * Math.min(1, k)})`
      }
    }
  }
}
