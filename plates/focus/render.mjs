// Renders each mockup in mockups.json at 2x to <name>.png (Playwright from the milesroxas-site checkout).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const HERE = fileURLToPath(new URL('.', import.meta.url))
const { chromium } = createRequire(join(process.env.HOME, 'SITES/milesroxas-site/package.json'))('playwright')
const only = process.argv[2]?.split(',')
const browser = await chromium.launch()
for (const m of JSON.parse(readFileSync(join(HERE, 'mockups.json'), 'utf8'))) {
  if (only && !only.includes(m.name)) continue
  const page = await browser.newPage({ viewport: { width: m.w, height: m.h }, deviceScaleFactor: 2 })
  await page.goto(pathToFileURL(join(HERE, `${m.name}.html`)).href)
  await page.waitForLoadState('networkidle')
  await page.locator('.art').screenshot({ path: join(HERE, `${m.name}.png`) })
  await page.close()
  console.log(`${m.name}.png`)
}
await browser.close()
