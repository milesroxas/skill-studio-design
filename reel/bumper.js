// A bumper: one feature and why it matters, set on a split-flap board. The
// lime wipe (wipes.html) cuts to it and away from it; the bumper itself only
// flaps its words in and holds them for reading. The rows and seed come from
// the build, which times the sound by the same flaps. Every picture depends only on t.
import { mount, plan } from './flap.js'
import { fonts } from './kit.js'

export function bumper({ duration, rows, seed }) {
  const root = document.querySelector('.bump')
  const render = mount(root.querySelector('.board'), rows, plan(rows, seed))
  return { duration, ready: fonts(), frame: (t) => render(t) }
}
