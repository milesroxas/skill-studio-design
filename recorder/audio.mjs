// The reel's sound, made in code: a drone and a deep sub pulse with a few
// accents, and the mechanical sounds of the board, the keys and the mouse.
import { writeFileSync } from 'node:fs'

const SR = 48000
const TAU = Math.PI * 2

/** A seeded random, so a rebuild gives the same file. */
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

const buffer = (seconds) => ({ l: new Float32Array(Math.ceil(seconds * SR)), r: new Float32Array(Math.ceil(seconds * SR)) })
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** Add a mono voice into a stereo buffer at `at` seconds, panned -1 to 1. */
function place(out, voice, at, gain = 1, pan = 0) {
  const start = Math.round(at * SR)
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < voice.length; i += 1) {
    const k = start + i
    if (k < 0 || k >= out.l.length) continue
    out.l[k] += voice[i] * gl
    out.r[k] += voice[i] * gr
  }
}

/** A state-variable low-pass, its cutoff a number or a function of time. */
function lowpass(voice, cutoff, q = 0.7) {
  let low = 0
  let band = 0
  const out = new Float32Array(voice.length)
  for (let i = 0; i < voice.length; i += 1) {
    const f = 2 * Math.sin((Math.PI * Math.max(20, Math.min(typeof cutoff === 'function' ? cutoff(i / SR) : cutoff, SR / 6.5))) / SR)
    low += f * band
    const high = voice[i] - low - band / q
    band += f * high
    out[i] = low
  }
  return out
}
function bandpass(voice, centre, q = 2) {
  let low = 0
  let band = 0
  const out = new Float32Array(voice.length)
  for (let i = 0; i < voice.length; i += 1) {
    const f = 2 * Math.sin((Math.PI * Math.max(20, Math.min(typeof centre === 'function' ? centre(i / SR) : centre, SR / 6.5))) / SR)
    low += f * band
    const high = voice[i] - low - band / q
    band += f * high
    out[i] = band
  }
  return out
}
function highpass(voice, cutoff) {
  const low = lowpass(voice, cutoff)
  return voice.map((v, i) => v - low[i])
}

const noise = (seconds, rand) => Float32Array.from({ length: Math.ceil(seconds * SR) }, () => rand() * 2 - 1)
const shape = (voice, env) => voice.map((v, i) => v * env(i / SR))
/** A sine whose frequency may move: the phase is summed, so a glide stays smooth. */
function sine(seconds, freq) {
  const n = Math.ceil(seconds * SR)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i += 1) {
    phase += (TAU * (typeof freq === 'function' ? freq(i / SR) : freq)) / SR
    out[i] = Math.sin(phase)
  }
  return out
}

/** A saw, a little detuned against itself. */
function saws(freq, seconds, voices, spread, rand) {
  const n = Math.ceil(seconds * SR)
  const out = new Float32Array(n)
  for (let v = 0; v < voices; v += 1) {
    const f = freq * (1 + (v - (voices - 1) / 2) * spread)
    let phase = rand()
    for (let i = 0; i < n; i += 1) {
      phase += f / SR
      phase -= Math.floor(phase)
      out[i] += (phase * 2 - 1) / voices
    }
  }
  return out
}

/** A plain reverb: six combs and two all-passes a side. */
function reverb(buf, wet = 0.3, size = 1) {
  const run = (x, shift) => {
    const out = new Float32Array(x.length)
    for (const [delay, fb] of [[1557, 0.84], [1617, 0.83], [1491, 0.85], [1422, 0.82], [1277, 0.81], [1356, 0.83]]) {
      const d = Math.round((delay + shift) * size * (SR / 44100))
      const line = new Float32Array(d)
      let damp = 0
      for (let i = 0; i < x.length; i += 1) {
        const y = line[i % d]
        damp = y * 0.62 + damp * 0.38
        line[i % d] = x[i] + damp * fb
        out[i] += y / 6
      }
    }
    let y = out
    for (const delay of [225, 556]) {
      const d = Math.round((delay + shift) * (SR / 44100))
      const line = new Float32Array(d)
      const next = new Float32Array(y.length)
      for (let i = 0; i < y.length; i += 1) {
        const z = line[i % d]
        next[i] = z - y[i] * 0.5
        line[i % d] = y[i] + z * 0.5
      }
      y = next
    }
    return y
  }
  const l = run(buf.l, 0)
  const r = run(buf.r, 23)
  for (let i = 0; i < buf.l.length; i += 1) {
    buf.l[i] = buf.l[i] * (1 - wet * 0.2) + l[i] * wet
    buf.r[i] = buf.r[i] * (1 - wet * 0.2) + r[i] * wet
  }
}
const mix = (into, from, gain = 1) => {
  for (let i = 0; i < into.l.length; i += 1) {
    into.l[i] += from.l[i] * gain
    into.r[i] += from.r[i] * gain
  }
}

function finish(buf, peak) {
  let top = 0
  for (let i = 0; i < buf.l.length; i += 1) {
    buf.l[i] = Math.tanh(buf.l[i] * 1.1)
    buf.r[i] = Math.tanh(buf.r[i] * 1.1)
    top = Math.max(top, Math.abs(buf.l[i]), Math.abs(buf.r[i]))
  }
  const gain = top ? peak / top : 1
  for (let i = 0; i < buf.l.length; i += 1) {
    buf.l[i] *= gain
    buf.r[i] *= gain
  }
  return buf
}

export function writeWav(path, buf) {
  const n = buf.l.length
  const data = Buffer.alloc(44 + n * 4)
  data.write('RIFF', 0)
  data.writeUInt32LE(36 + n * 4, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(2, 22)
  data.writeUInt32LE(SR, 24)
  data.writeUInt32LE(SR * 4, 28)
  data.writeUInt16LE(4, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(n * 4, 40)
  for (let i = 0; i < n; i += 1) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf.l[i])) * 32767), 44 + i * 4)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf.r[i])) * 32767), 46 + i * 4)
  }
  writeFileSync(path, data)
}


/** A decaying sine, its pitch falling from `f0` to `f1`. */
const ping = (seconds, f0, f1, decay, attack = 0.0006) =>
  sine(seconds, (t) => f1 + (f0 - f1) * Math.exp(-t / (decay * 0.6))).map((v, i) => v * Math.min(1, i / SR / attack) * Math.exp(-(i / SR) / decay))
/** A burst of noise through a band, decaying. */
const burst = (seconds, centre, q, decay, rand) => shape(bandpass(noise(seconds, rand), centre, q), (t) => Math.exp(-t / decay))

/**
 * The interface's sounds. `hits` is [{ t, kind, pan?, size?, last? }]:
 * flap (one flap of a split-flap module), keydown (a mechanical key, with its
 * return), press and release (a mouse's microswitch).
 */
export function sfx(hits, seconds, seed) {
  const rand = rng(1000 + seed * 77)
  const out = buffer(seconds)
  const room = buffer(seconds)
  for (const hit of hits) {
    if (hit.t < 0 || hit.t >= seconds) continue
    const t0 = hit.t
    if (hit.kind === 'flap') {
      // A thin plastic flap slapping the one below it, the big modules with a little body.
      const big = hit.size === 'l' || hit.size === 'm'
      const slap = burst(0.02, 2200 + rand() * 1400, 2.2, 0.0024 + rand() * 0.0012, rand)
      const pan = Math.max(-0.85, Math.min(0.85, hit.pan ?? 0))
      const gain = (big ? 0.16 : 0.1) * (0.7 + rand() * 0.5) * (hit.last ? 1.3 : 1)
      place(out, slap, t0, gain, pan)
      if (big) place(out, ping(0.03, 420 + rand() * 120, 300, 0.005), t0, gain * 0.6, pan)
      place(room, slap, t0, gain * 0.25, -pan * 0.5)
    } else if (hit.kind === 'keydown') {
      // One key of a heavy, well-lubed board, the same each time: a short, dry
      // contact tick and a low, rounded thock from the case. No upstroke: at this
      // pace it lands on the next key and smears the rhythm. The space and the
      // return are the long keys: a little deeper and fuller.
      const long = hit.ch === ' ' || hit.ch === '\n'
      const pitch = (long ? 0.82 : 1) * (0.985 + rand() * 0.03)
      const gain = (long ? 1.12 : 1) * (0.96 + rand() * 0.08)
      place(out, burst(0.008, 3600 * pitch, 1.6, 0.0007, rand), t0, 0.09 * gain, 0)
      place(out, ping(0.05, 300 * pitch, 205 * pitch, 0.0085, 0.0008), t0 + 0.0012, 0.42 * gain, 0)
      place(out, burst(0.03, 1050 * pitch, 3.4, 0.0032, rand), t0 + 0.0012, 0.16 * gain, 0)
      place(room, ping(0.05, 300 * pitch, 205 * pitch, 0.0085, 0.0008), t0, 0.05 * gain)
    } else if (hit.kind === 'tick') {
      // A letter of the address locking in, like a tooth of a gear passing a pawl:
      // a low, dry knock from the body, a short metallic ring from the tooth, and
      // the pawl dropping back a moment after. Nothing above 3 kHz.
      const pan = hit.pan ?? 0
      const pitch = 0.97 + rand() * 0.06
      place(out, ping(0.03, 190 * pitch, 150 * pitch, 0.006, 0.0006), t0, 0.34, pan)
      place(out, burst(0.02, 1450 * pitch, 7, 0.0045, rand), t0, 0.15, pan)
      place(out, burst(0.012, 2400 * pitch, 3, 0.0012, rand), t0, 0.06, pan)
      place(out, burst(0.012, 1150 * pitch, 5, 0.0022, rand), t0 + 0.011, 0.08, pan)
      place(out, ping(0.02, 240 * pitch, 200 * pitch, 0.004, 0.0006), t0 + 0.011, 0.12, pan)
    } else if (hit.kind === 'press' || hit.kind === 'release') {
      // A mouse's microswitch: a hard, high snap and a little body from the shell; the release higher and lighter.
      const down = hit.kind === 'press'
      place(out, burst(0.01, down ? 4300 : 5200, 2.4, 0.0008, rand), t0, down ? 0.3 : 0.18, 0.1)
      place(out, ping(0.025, down ? 2100 : 2500, down ? 1700 : 2100, 0.0028, 0.0004), t0, down ? 0.1 : 0.06, 0.1)
      place(out, burst(0.03, down ? 650 : 800, 3, 0.006, rand), t0 + 0.0008, down ? 0.16 : 0.08, 0.1)
    }
  }
  reverb(room, 1, 0.55)
  mix(out, room)
  // A short fade at the end: a stem is cut where the next one starts.
  const fade = Math.round(0.03 * SR)
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade
    out.l[out.l.length - 1 - i] *= k
    out.r[out.r.length - 1 - i] *= k
  }
  for (let i = 0; i < out.l.length; i += 1) {
    out.l[i] = Math.tanh(out.l[i] * 1.2)
    out.r[i] = Math.tanh(out.r[i] * 1.2)
  }
  return out
}

/** The pulse: a deep sine that drops into the sub, rounded at both ends so it never clicks. */
function pulse(seconds = 0.46, f0 = 62, f1 = 41) {
  return sine(seconds, (t) => f1 + (f0 - f1) * Math.exp(-t / 0.05)).map((v, i) => {
    const t = i / SR
    return Math.tanh(v * 1.25) * Math.min(1, t / 0.009) * Math.exp(-t / 0.2) * Math.min(1, (seconds - t) / 0.03)
  })
}

/**
 * The track: a drone on A for the whole length, and from the first block a
 * deep sub pulse on every beat. From the third block a softer sub answers on
 * the off-beat. The accents are few: a low tone where each feature starts.
 * At `end` the pulse stops and the drone rings out.
 */
export function music({ total, blocks, end }) {
  const rand = rng(1200)
  const BEAT = 0.5
  const [b1, , b3] = blocks
  const drone = buffer(total)
  const subs = buffer(total)
  const accents = buffer(total)
  const ducks = []

  // The drone: A, its fifth and octave, the filter breathing slowly and opening a little over the film.
  const open = (t) => Math.min(1, Math.max(0, (t - b1) / (end - b1)))
  for (const [m, g, pan] of [[33, 0.3, 0], [45, 0.3, -0.3], [52, 0.2, 0.3], [57, 0.12, -0.15], [64, 0.05, 0.4]]) {
    const raw = saws(hz(m), total, 5, 0.0035, rand)
    place(drone, lowpass(raw, (t) => 170 + 110 * Math.sin(t * 0.37 + m) + 380 * open(t), 0.9), 0, g, pan)
  }
  place(drone, sine(total, 55).map((v) => v * 0.12), 0, 1)

  for (let beat = 0; ; beat += 1) {
    const t = b1 + beat * BEAT
    if (t >= end - 1e-6) break
    place(subs, pulse(), t, 0.95)
    ducks.push(t)
    if (t >= b3 - 1e-6) place(subs, pulse(0.22, 70, 55), t + BEAT / 2, 0.32)
  }
  place(subs, pulse(1.4, 60, 36), end, 1)
  ducks.push(end)

  // The accents: one low, clean tone at the start of each feature, left to ring.
  for (const [i, b] of blocks.entries()) {
    const tone = ping(2.4, hz([69, 72, 76, 74, 71][i]), hz([69, 72, 76, 74, 71][i]), 0.7, 0.004)
    place(accents, tone, b, 0.05, i % 2 ? 0.3 : -0.3)
    place(accents, ping(2.4, hz(57), hz(57), 0.9, 0.004), b, 0.035)
  }
  place(accents, ping(3.5, hz(69), hz(69), 1.1, 0.004), end, 0.06)
  reverb(accents, 1, 1.3)

  // The drone gives way a little to each pulse.
  const duck = new Float32Array(drone.l.length).fill(1)
  for (const hit of ducks) {
    const start = Math.round(hit * SR)
    for (let i = 0; i < 0.45 * SR && start + i < duck.length; i += 1)
      duck[start + i] = Math.min(duck[start + i], 1 - 0.38 * Math.exp(-(i / SR) / 0.15))
  }
  const out = buffer(total)
  for (let i = 0; i < out.l.length; i += 1) {
    const t = i / SR
    const fade = Math.min(1, t / 1.6) * Math.min(1, (total - t) / 2.5) ** 1.3
    out.l[i] = (drone.l[i] * duck[i] + subs.l[i] + accents.l[i]) * fade
    out.r[i] = (drone.r[i] * duck[i] + subs.r[i] + accents.r[i]) * fade
  }
  return finish(out, 0.86)
}
