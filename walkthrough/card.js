// The opening and the close: the mark, a title and one line, risen in on the
// stage and held for reading. `out` fades it to the ground at the end. Every
// picture depends only on t.
import { fonts, mark, mech, snap, span } from './kit.js'

export function card({ duration, out = false }) {
  const root = document.querySelector('.title-card')
  const logo = root.querySelector('.logo')
  logo.append(mark(92))
  const parts = [logo, ...root.querySelectorAll('.t-head, .t-say')]
  return {
    duration,
    ready: fonts(),
    frame(t) {
      parts.forEach((p, i) => {
        const k = snap(span(t, 0.15 + i * 0.12, 0.65 + i * 0.12))
        p.style.opacity = k
        p.style.transform = `translateY(${(1 - k) * 28}px)`
      })
      root.style.opacity = out ? 1 - mech(span(t, duration - 0.6, duration)) : 1
    },
  }
}
