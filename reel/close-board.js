// The close's address, settling out of noise left to right. Shared by the page
// and the build, which puts a soft tick where each letter lands.
export const ADDRESS = {
  text: 'github.com/milesroxas/skill-studio',
  start: 1.15, // when the first letter shows noise
  lead: 0.22, // how long a letter shows noise before it settles
  step: 0.028, // the gap between letters
  rate: 0.05, // how often the noise changes
}
const NOISE = 'abcdefghijklmnopqrstuvwxyz0123456789/.-_'
const hash = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 15
  return (h >>> 0) % NOISE.length
}

/** When letter i settles. */
export const settles = (i) => ADDRESS.start + ADDRESS.lead + i * ADDRESS.step

/** What letter i shows at t: a blank, noise, or itself. */
export function glyph(i, t) {
  const ch = ADDRESS.text[i]
  const from = ADDRESS.start + i * ADDRESS.step
  if (t < from) return { ch: ' ', settled: false }
  if (t >= settles(i)) return { ch, settled: true }
  return { ch: NOISE[hash(i, Math.floor(t / ADDRESS.rate))], settled: false }
}
