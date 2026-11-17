/**
 * The editor's AI features, on the mock home's social-post skill. The writer
 * has added two rules since v1 and not yet fixed them; the film adds a third.
 * One session, hard cuts between scenes:
 *   1. Writing checks: rule 09 typed, its hedge and filler underlined as they land.
 *   2. Suggest changes: three rewrites; Split up makes rule 09 three rules.
 *   3. Auto refine: rule 07's amber number, a checked revision, replaced.
 *   4. Help me improve: rule 08's reason, which only the writer knows, asked and drafted.
 * At the end the file's rules are skills/social-post/SKILL.md's, word for word.
 *
 *   node kit/film.mjs editor-ai stills 2,9.5
 *   node kit/film.mjs editor-ai video editor-ai/out/editor-ai-34s.mp4
 */
import { readFileSync, writeFileSync } from 'node:fs'

export const VIEW = { width: 1200, height: 800 }
export const DSF = 2.4 // 2880 x 1920, 3:2
export const STUB_CALLS = 3
/** Which answer each stand-in call must have taken, in order (kit/answers.json). */
export const STUB_EXPECT = ['rewrites\ttry to add alt text', 'refine\treasonably friendly', 'improve\tfenced code block']

const RULE_07 = '- Keep the tone of every post reasonably friendly.'
const RULE_08 = '- Put the version number in the image.'
const TYPED = 'For a launch post, try to add alt text, the link, the hashtags and the brand mark in order to help people find it.'
const REASON = 'Readers check the version before they update. Without it they think the change already shipped.'

/** The two unfixed rules, under rule 06. */
export function prepare({ file }) {
  const anchor = /^- Use only the colors.*\n/m
  const text = readFileSync(file, 'utf8')
  if (!anchor.test(text)) throw new Error('The mock skill changed: rule 06 is not where the film expects it.')
  writeFileSync(file, text.replace(anchor, (line) => `${line}${RULE_07}\n${RULE_08}\n`))
}

/** Before the clock stops: the editor, scrolled so rule 09 lands low, with the caret on its new bullet. */
export async function open(app) {
  await app.openEditor()
  await app.scrollEditor('Put the version number', 520)
  const line = app.page.locator('.cm-line', { hasText: 'Put the version number' }).first()
  const box = await line.boundingBox()
  await app.page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
  await app.page.keyboard.press('End')
  await app.page.keyboard.press('Enter')
  await app.page.mouse.move(VIEW.width + 60, VIEW.height + 60)
}

const q = JSON.stringify
const ruleNum = (n) => `[...document.querySelectorAll('.cm-md-rulenum')].find((s) => s.textContent.trim() === ${q(n)})`
const POP = `[...document.querySelectorAll('[data-slot="popover-content"]')].at(-1)`
const popButton = (label) => `[...(${POP}?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim().startsWith(${q(label)}))`
/** The "Replace n" cue on the nth rewrite card: the whole card is the button. */
const replaceCue = (n) => `[...(${POP}?.querySelectorAll('button') ?? [])].filter((b) => b.querySelector('kbd'))[${n}]?.querySelector('kbd').parentElement`
const button = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${q(label)} && b.getBoundingClientRect().width > 0)`
const line = (t) => `[...document.querySelectorAll('.cm-line')].find((l) => l.textContent.includes(${q(t)}))`
/** The rule being typed: the line under rule 08. */
const TYPING = `${line('Put the version number')}?.nextElementSibling`
/** The side panel Help me improve opens in. */
const PANEL = `(() => { let e = document.querySelector('button[aria-label="Close the assistant"]'); while (e && !(e.getBoundingClientRect().height > 500)) e = e.parentElement; return e })()`
/** Around the composer: its box with the rule chip and the model. */
const COMPOSER_BOX = `(() => { let e = document.querySelector('textarea[aria-label="Message about this rule"]'); while (e && !(e.getBoundingClientRect().height > 90)) e = e.parentElement; return e })()`
/** The message sent, and the draft under it with its Apply. */
const SENT = `[...document.querySelectorAll('p, div')].filter((e) => e.children.length === 0 && e.textContent.trim().startsWith('Readers check the version')).at(-1)`
const DRAFT = `(() => { let e = [...document.querySelectorAll('button')].find((b) => /^Appl(y|ied)/.test(b.textContent.trim())); while (e && !(e.getBoundingClientRect().height > 80)) e = e.parentElement; return e })()`
const COMPOSER = `document.querySelector('textarea[aria-label="Message about this rule"]')`

export const SCENES = [
  {
    name: 'checks',
    async setup(f) {
      f.park('right')
      await f.unseen(0.4)
    },
    async film(f) {
      // The app as it is, then in on the rule being written.
      await f.wait(1.0)
      f.focus([TYPING], { zoom: 1.7 })
      await f.wait(0.5)
      await f.type(TYPED, 40)
      await f.wait(0.35)
      // Its amber number selects the rule: the checks open over it.
      await f.glideTo(ruleNum('09'), 0.67, { dx: 0.55, dy: 0.7, bow: 0.08 })
      await f.wait(0.15)
      await f.click()
      await f.until(`${POP}?.textContent.includes('Writing checks')`, 'checks popout')
      f.focus([TYPING, POP])
      await f.wait(2.2)
    },
  },
  {
    name: 'rewrites',
    async film(f) {
      await f.glideTo(popButton('Suggest changes'), 0.55, { dx: 0.62, dy: 0.7, bow: 0.06 })
      await f.wait(0.15)
      f.app.open('rewrites')
      await f.click()
      await f.wait(0.7)
      await f.until(`${POP}?.textContent.includes('3 rules') && ${POP}.textContent.includes('Try again')`, 'rewrites')
      await f.wait(2.4)
      await f.glideTo(replaceCue(2), 0.55, { dx: 0.45, dy: 0.75, bow: 0.06 })
      await f.wait(0.15)
      await f.click()
      f.focus([line('write alt text'), line('End the text'), line('Put the Skill Studio mark')])
      await f.wait(0.5)
      await f.glide(f.offstage('right'), 0.6, 0.06)
      await f.wait(1.0)
    },
  },
  {
    name: 'refine',
    async setup(f) {
      f.focus([line('reasonably friendly')], { zoom: 1.7 })
      await f.unseen(0.3)
      await f.settleLens()
      f.park('bottom')
    },
    async film(f) {
      await f.wait(0.4)
      await f.glideTo(ruleNum('07'), 0.67, { dx: 0.55, dy: 0.7, bow: 0.1 })
      await f.wait(0.15)
      await f.click()
      await f.until(`${POP}?.textContent.includes('Auto refine')`, 'rule 07 popout')
      f.focus([line('reasonably friendly'), POP])
      await f.wait(0.9)
      await f.glideTo(popButton('Auto refine'), 0.5, { dx: 0.6, dy: 0.7, bow: 0.06 })
      await f.wait(0.15)
      f.app.open('refine')
      await f.click()
      await f.wait(0.6)
      await f.until(`${popButton('Replace')} && !${popButton('Replace')}.disabled`, 'revision')
      await f.wait(2.0)
      await f.glideTo(popButton('Replace'), 0.5, { dx: 0.4, dy: 0.7, bow: 0.06 })
      await f.wait(0.15)
      await f.click()
      f.focus([line('Write as one colleague')])
      await f.wait(0.4)
      await f.glide(f.offstage('right'), 0.6, 0.06)
      await f.wait(1.0)
    },
  },
  {
    name: 'improve',
    async setup(f) {
      f.focus([line('Put the version number')], { zoom: 1.7 })
      await f.unseen(0.3)
      await f.settleLens()
      f.park('bottom')
    },
    async film(f) {
      await f.wait(0.4)
      await f.glideTo(ruleNum('08'), 0.67, { dx: 0.55, dy: 0.7, bow: 0.1 })
      await f.wait(0.15)
      await f.click()
      await f.until(`${POP}?.textContent.includes('Help me improve')`, 'rule 08 popout')
      f.focus([line('Put the version number'), POP])
      await f.wait(0.8)
      await f.glideTo(popButton('Help me improve'), 0.5, { dx: 0.6, dy: 0.7, bow: 0.06 })
      await f.wait(0.15)
      await f.click()
      await f.until(COMPOSER, 'improve panel')
      f.focus([PANEL], { zoom: 1.5 })
      await f.wait(0.8)
      f.focus([COMPOSER_BOX], { zoom: 1.9 })
      await f.glideTo(COMPOSER, 0.55, { dx: 0.5, dy: 0.5, bow: 0.08 })
      await f.click()
      await f.wait(0.2)
      await f.type(REASON, 44)
      await f.wait(0.3)
      f.app.open('improve')
      await f.key('Enter')
      await f.wait(0.6)
      await f.until(button('Apply'), 'draft')
      f.focus([SENT, DRAFT], { zoom: 1.9 })
      await f.wait(2.0)
      await f.glideTo(button('Apply'), 0.55, { dx: 0.5, dy: 0.6, bow: 0.06 })
      await f.wait(0.15)
      await f.click()
      await f.wait(0.7)
      // Close the panel: rule 08 stands in the editor with its reason, and no rule is marked.
      await f.glideTo(`document.querySelector('button[aria-label="Close the assistant"]')`, 0.5, { dx: 0.45, dy: 0.6, bow: 0.06 })
      await f.wait(0.15)
      await f.click()
      // Out to the whole app again: the finished rules, at full fidelity.
      f.unfocus()
      await f.wait(0.3)
      await f.glide(f.offstage('right'), 0.6, 0.06)
      await f.wait(1.6)
    },
  },
]
