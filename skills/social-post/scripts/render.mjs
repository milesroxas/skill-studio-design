#!/usr/bin/env node
/**
 * Renders a post's image from assets/card.html with headless Chrome, at 2x.
 *   node scripts/render.mjs path/to/post.json
 * Fields of post.json are in references/brand.md. Needs Google Chrome; set
 * CHROME_PATH for another build. No packages to install.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SIZES = { x: [1200, 675], linkedin: [1200, 627], square: [1080, 1080] }
const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url))
const CHROMES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/render.mjs post.json')
  process.exit(2)
}
const here = dirname(resolve(file))
const post = JSON.parse(readFileSync(file, 'utf8'))
if (!post.headline) throw new Error('post.json needs a headline.')
const size = SIZES[post.size ?? 'x']
if (!size) throw new Error(`size is one of ${Object.keys(SIZES).join(', ')}.`)
if (post.shot) {
  const shot = resolve(here, post.shot)
  if (!existsSync(shot)) throw new Error(`No screenshot at ${shot}.`)
  post.shot = pathToFileURL(shot).href
}
const chrome = CHROMES.find((path) => existsSync(path))
if (!chrome) throw new Error('Google Chrome was not found. Set CHROME_PATH.')

const mark = readFileSync(join(ASSETS, 'mark.svg'), 'utf8').replace(/<title>.*?<\/title>/, '')
const html = readFileSync(join(ASSETS, 'card.html'), 'utf8')
  .replace('__BASE__', pathToFileURL(ASSETS).href)
  .replace('__POST__', JSON.stringify(post))
  .replace('__MARK__', JSON.stringify(mark))
const work = mkdtempSync(join(tmpdir(), 'social-post-'))
const page = join(work, 'card.html')
writeFileSync(page, html)
const out = resolve(here, post.out ?? 'post.png')
const run = spawnSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--force-color-profile=srgb',
  '--force-device-scale-factor=2',
  `--window-size=${size[0]},${size[1]}`,
  '--virtual-time-budget=4000',
  `--screenshot=${out}`,
  pathToFileURL(page).href,
], { encoding: 'utf8' })
rmSync(work, { recursive: true, force: true })
if (run.status !== 0 || !existsSync(out)) throw new Error(`Chrome could not render the image:\n${run.stderr}`)
console.log(out)
