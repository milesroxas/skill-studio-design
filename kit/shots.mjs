/**
 * The screenshots the mock home's cases and outputs use, taken from the mock
 * home itself at 2x in the dark theme, into kit/shots:
 *   split-up.png   Suggest changes on a rule that asks for several things
 *   tables.png     references/brand.md's color table in Formatted
 *   file-tree.png  the Skill screen's files, by folder
 * Run it once after a release changes those screens, then rebuild any film:
 *   node kit/shots.mjs
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { KIT, start } from './app.mjs'

const OUT = join(KIT, 'shots')
mkdirSync(OUT, { recursive: true })
const RULE = 'For a launch post, try to add alt text, the link, the hashtags and the brand mark in order to help people find it.'

const app = await start({ width: 1200, height: 800, scale: 2, runs: false })
const { page } = app
for (const kind of ['rewrites', 'refine', 'improve', 'chat']) app.open(kind)
const shot = async (name) => {
  await page.mouse.move(1, 1)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, name) })
  console.log(`kit/shots/${name}`)
}
try {
  await app.openEditor()
  await page.waitForTimeout(800)
  // Split up: the rule typed under rule 06, its number clicked, Suggest changes.
  await app.scrollEditor('Use only the colors', 560)
  const last = page.locator('.cm-line', { hasText: 'Use only the colors' }).first()
  const box = await last.boundingBox()
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 6)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type(RULE)
  await page.mouse.move(1, 1)
  await page.waitForTimeout(600)
  await page.locator('.cm-md-rulenum', { hasText: '07' }).click()
  await page.getByRole('button', { name: 'Suggest changes' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="popover-content"]')].at(-1)?.textContent.includes('Try again'), null, { timeout: 120000 })
  await shot('split-up.png')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Discard' }).click()
  const confirm = page.getByRole('alertdialog').getByRole('button').last()
  if (await confirm.count()) await confirm.click()
  await page.waitForTimeout(500)

  // Tables: the brand reference in Formatted.
  await page.getByText('brand.md', { exact: true }).first().click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.cm-line, table, [class*="table"]')].find((e) => e.textContent.includes('Porcelain'))
    t?.scrollIntoView({ block: 'center' })
  })
  await shot('tables.png')

  // The file tree: the Skill screen with every folder open.
  await page.getByText('SKILL.md', { exact: true }).first().click()
  await page.waitForTimeout(800)
  await shot('file-tree.png')
  app.assertStub(1)
} finally {
  await app.close()
}
