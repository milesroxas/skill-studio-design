// Renders chat-panel.html at 2x to chat-panel.png (Playwright from the milesroxas-site checkout).
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const HERE = fileURLToPath(new URL('.', import.meta.url))
const { chromium } = createRequire(join(process.env.HOME, 'SITES/milesroxas-site/package.json'))('playwright')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1280 }, deviceScaleFactor: 2 })
await page.goto(pathToFileURL(join(HERE, 'chat-panel.html')).href)
await page.waitForLoadState('networkidle')
await page.locator('.art').screenshot({ path: join(HERE, 'chat-panel.png') })
await browser.close()
console.log('chat-panel.png')
