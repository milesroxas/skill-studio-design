/** Recorder: starts the built app on a seeded scratch home and films it through DevTools. */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The Skill Studio checkout to film: a sibling folder by default, or SKILL_STUDIO. */
export const ROOT = process.env.SKILL_STUDIO ?? fileURLToPath(new URL('../../skill-studio', import.meta.url))
export const W = 1200
export const H = 750
export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

type Json = Record<string, unknown>

export async function connect(port: number) {
  let pageUrl = ''
  for (let tries = 0; tries < 80 && !pageUrl; tries += 1) {
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{
      type: string
      url: string
      webSocketDebuggerUrl: string
    }>
    pageUrl =
      targets.find((t) => t.type === 'page' && t.url.startsWith('studio://'))
        ?.webSocketDebuggerUrl ?? ''
    if (!pageUrl) await sleep(200)
  }
  if (!pageUrl) throw new Error('The app opened no window.')
  const socket = new WebSocket(pageUrl)
  await new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = () => fail(new Error('Could not reach the app window.'))
  })
  let lastId = 0
  const waiting = new Map<number, { done: (v: Json) => void; fail: (e: Error) => void }>()
  const listeners = new Map<string, (params: Json) => void>()
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      method?: string
      params?: Json
      result?: Json
      error?: { message: string }
    }
    if (message.method) {
      listeners.get(message.method)?.(message.params ?? {})
      return
    }
    const waiter = message.id === undefined ? undefined : waiting.get(message.id)
    if (!waiter || message.id === undefined) return
    waiting.delete(message.id)
    if (message.error) waiter.fail(new Error(message.error.message))
    else waiter.done(message.result ?? {})
  }
  const send = (method: string, params: Json = {}) =>
    new Promise<Json>((done, fail) => {
      lastId += 1
      waiting.set(lastId, { done, fail })
      socket.send(JSON.stringify({ id: lastId, method, params }))
    })
  const run = async (expression: string): Promise<unknown> => {
    const reply = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (reply.exceptionDetails)
      throw new Error(`The page threw on: ${expression}\n${JSON.stringify(reply.exceptionDetails)}`)
    return (reply.result as { value?: unknown }).value
  }
  const on = (method: string, fn: (params: Json) => void) => listeners.set(method, fn)
  return { send, run, on, close: () => socket.close() }
}
export type Page = Awaited<ReturnType<typeof connect>>

export function launch(
  home: string,
  profile: string,
  env: Record<string, string> = {},
): Promise<{ app: ChildProcess; port: number }> {
  const electron: string = createRequire(join(ROOT, 'package.json'))('electron')
  const app = spawn(electron, [ROOT, `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling', '--disable-features=CalculateNativeWinOcclusion,MacWebContentsOcclusion'], {
    // SHELL is a stand-in too: the app puts the login shell's PATH ahead of its own,
    // which would find the real claude before the stand-in in recorder/bin.
    // Jev is real: the app takes TYPESAFE_API_KEY from this environment, or else from
    // the checkout's .env. Without either, the top bar shows "No Jev key".
    env: { ...process.env, SKILL_STUDIO_HOME: home, SHELL: fileURLToPath(new URL('bin/login-shell', import.meta.url)), ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  return new Promise((done, fail) => {
    let log = ''
    app.stderr?.on('data', (chunk: Buffer) => {
      log += chunk.toString()
      const port = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(log)?.[1]
      if (port) done({ app, port: Number(port) })
    })
    app.on('exit', (code) => fail(new Error(`The app quit (${code}).`)))
  })
}

export async function appReady(page: Page): Promise<void> {
  for (let tries = 0; tries < 100; tries += 1) {
    const ready = await page
      .run(`Boolean(document.querySelector('nav[aria-label="App"]'))`)
      .catch(() => false)
    if (ready) return
    await sleep(100)
  }
  throw new Error('The app did not render.')
}

export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'skill-studio-reel-'))
  const home = join(dir, 'home')
  const profile = join(dir, 'profile')
  mkdirSync(home)
  mkdirSync(profile)
  writeFileSync(join(profile, 'window.json'), JSON.stringify({ x: 40, y: 40, width: W, height: H }))
  return { dir, home, profile, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

export interface Event {
  t: number
  kind: 'move' | 'down' | 'up' | 'key' | 'mark' | 'cam' | 'box'
  [more: string]: unknown
  x?: number
  y?: number
  /** For a move: when it ends and where it started. */
  t1?: number
  x0?: number
  y0?: number
  name?: string
}

/** Smooth start and stop. */
const ease = (u: number) => u * u * u * (u * (u * 6 - 15) + 10)

export function director(page: Page, outDir: string) {
  let frames: Array<{ t: number; file: string }> = []
  let events: Event[] = []
  let shot = ''
  let t0 = 0
  let n = 0
  const cursor = { x: W * 0.55, y: H * 0.6 }
  const now = () => (Date.now() - t0) / 1000

  page.on('Page.screencastFrame', (params) => {
    void page.send('Page.screencastFrameAck', { sessionId: params.sessionId })
    if (!shot) return
    n += 1
    const file = join(outDir, shot, `${String(n).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(String(params.data), 'base64'))
    const stamp = Number((params.metadata as { timestamp: number }).timestamp) * 1000
    frames.push({ t: (stamp - t0) / 1000, file })
  })

  const point = (x: number, y: number, type: string, extra: Json = {}) =>
    page.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra })

  return {
    cursor,
    now,
    async begin(name: string) {
      shot = name
      frames = []
      events = []
      n = 0
      rmSync(join(outDir, name), { recursive: true, force: true })
      mkdirSync(join(outDir, name), { recursive: true })
      t0 = Date.now()
      await page.send('Page.startScreencast', { format: 'jpeg', quality: 100, everyNthFrame: 1 })
      events.push({ t: 0, kind: 'mark', name: 'begin', x: cursor.x, y: cursor.y })
    },
    log(e: Json) {
      events.push({ t: now(), ...e } as Event)
    },
    mark(name: string) {
      events.push({ t: now(), kind: 'mark', name })
    },
    /** Where an element is: the middle of the first match of `find`, a JS expression giving an element. */
    async at(find: string, dx = 0.5, dy = 0.5): Promise<{ x: number; y: number }> {
      const box = (await page.run(`(() => {
        const el = ${find}
        if (!el) return null
        el.scrollIntoView({ block: 'nearest' })
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      })()`)) as { x: number; y: number; w: number; h: number } | null
      if (!box) throw new Error(`Nothing matches ${find}`)
      return { x: box.x + box.w * dx, y: box.y + box.h * dy }
    },
    async move(to: { x: number; y: number }, seconds?: number) {
      const from = { ...cursor }
      const far = Math.hypot(to.x - from.x, to.y - from.y)
      const dur = seconds ?? Math.min(0.95, 0.32 + far / 1500)
      const start = now()
      events.push({ t: start, kind: 'move', x0: from.x, y0: from.y, x: to.x, y: to.y, t1: start + dur })
      for (;;) {
        const u = Math.min(1, (now() - start) / dur)
        const k = ease(u)
        cursor.x = from.x + (to.x - from.x) * k
        cursor.y = from.y + (to.y - from.y) * k
        await point(cursor.x, cursor.y, 'mouseMoved')
        if (u >= 1) break
        await sleep(12)
      }
    },
    async click(hold = 70) {
      events.push({ t: now(), kind: 'down', x: cursor.x, y: cursor.y })
      await point(cursor.x, cursor.y, 'mousePressed', { button: 'left', clickCount: 1 })
      await sleep(hold)
      await point(cursor.x, cursor.y, 'mouseReleased', { button: 'left', clickCount: 1 })
      events.push({ t: now(), kind: 'up', x: cursor.x, y: cursor.y })
    },
    /** Type at a steady cadence: one key every `perChar` ms, on a clock, so no key drifts. */
    async type(text: string, perChar = 55) {
      const t0Type = Date.now()
      let i = 0
      for (const ch of text) {
        const due = t0Type + i * perChar
        i += 1
        if (due > Date.now()) await sleep(due - Date.now())
        events.push({ t: now(), kind: 'key', ch })
        if (ch === '\n')
          for (const type of ['keyDown', 'keyUp'])
            await page.send('Input.dispatchKeyEvent', {
              type,
              key: 'Enter',
              code: 'Enter',
              windowsVirtualKeyCode: 13,
              text: type === 'keyDown' ? '\r' : undefined,
            })
        else await page.send('Input.insertText', { text: ch })
      }
    },
    async end(): Promise<{ frames: number; seconds: number; fps: number }> {
      const length = now()
      await page.send('Page.stopScreencast')
      await sleep(150)
      const name = shot
      shot = ''
      events.push({ t: length, kind: 'mark', name: 'end' })
      const list = frames
        .map((f, i) => {
          const next = i + 1 < frames.length ? frames[i + 1].t : length
          return `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`
        })
        .join('\n')
      const last = frames.at(-1)
      writeFileSync(join(outDir, `${name}.txt`), `${list}\n${last ? `file '${last.file}'\n` : ''}`)
      // The first frame's own time is the film's zero for this shot.
      const lead = frames[0]?.t ?? 0
      writeFileSync(
        join(outDir, `${name}.json`),
        JSON.stringify({ w: W, h: H, length: length - lead, lead, events: events.map((e) => ({ ...e, t: e.t - lead, t1: e.t1 === undefined ? undefined : e.t1 - lead })) }, null, 1),
      )
      const made = spawnSync(
        'ffmpeg',
        ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(outDir, `${name}.txt`),
          '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '13', '-preset', 'slow', '-g', '6',
          '-t', (length - lead).toFixed(3), '-movflags', '+faststart', join(outDir, `${name}.mp4`)],
        { encoding: 'utf8' },
      )
      if (made.status !== 0) throw new Error(`ffmpeg failed: ${made.stderr}`)
      return { frames: frames.length, seconds: length, fps: frames.length / length }
    },
  }
}

/** Extra moves a shot needs beyond the pointer: keys, the wheel, the camera, a named box. */
export function extras(page: Page, d: ReturnType<typeof director>, log: (e: Json) => void) {
  return {
    async key(key: string, code: string, vk: number, modifiers = 0) {
      for (const type of ['rawKeyDown', 'keyUp'])
        await page.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers })
    },
    /** Roll the wheel by `dy` px over `seconds`, eased. */
    async scroll(dy: number, seconds = 0.6) {
      const start = Date.now()
      let done = 0
      for (;;) {
        const u = Math.min(1, (Date.now() - start) / (seconds * 1000))
        const k = u * u * (3 - 2 * u)
        const step = dy * k - done
        done += step
        await page.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: d.cursor.x, y: d.cursor.y, deltaX: 0, deltaY: step,
        })
        if (u >= 1) break
        await sleep(14)
      }
    },
    /** Point the camera: the middle of what `find` gives, or the whole window when null. */
    async cam(find: string | null, z = 1, dur = 0.7, dx = 0.5, dy = 0.5) {
      const p = find ? await d.at(find, dx, dy) : { x: W / 2, y: H / 2 }
      log({ kind: 'cam', x: p.x, y: p.y, z, dur })
    },
    async box(name: string, find: string) {
      const r = await page.run(`(() => { const el = ${find}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
      if (!r) throw new Error(`No box for ${name}`)
      log({ kind: 'box', name, ...(r as Json) })
    },
  }
}
