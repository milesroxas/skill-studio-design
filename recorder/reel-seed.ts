/**
 * The reel's sample: the guide's seed (skill-studio scripts/guide-shots/seed.ts),
 * and two runs of landing-pages on its pricing-page case, so the results scene
 * can set two designs side by side. v0 is the design template as it ships; v1
 * adds one rule (RULE). Each run's page is written by hand below, and Jev's
 * answers are made up and scored by the real scoring code: no agent runs and
 * nothing is sent to Jev. Import it with SKILL_STUDIO_HOME set, from the
 * skill-studio checkout's tsx, so the aliases resolve.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { runName, sampleDir } from '@domain/run-name.ts'
import type { ReportResult, RunMeta, SampleMeta } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import { loadBench, loadCases } from '@infrastructure/cases.ts'
import { writeJson } from '@infrastructure/fs.ts'
import { touchRecent } from '@infrastructure/library.ts'
import { runDir, versionsOf } from '@infrastructure/runs.ts'
import { skillFiles, skillHash, snapshotSkill, snapshotSkillFiles } from '@infrastructure/skill.ts'
import { saveVersion } from '@infrastructure/versions.ts'
import { scorers } from '@judges/scorers.ts'

const ROOT = process.env.SKILL_STUDIO ?? new URL('../../skill-studio', import.meta.url).pathname
const guide = await import(join(ROOT, 'scripts/guide-shots/seed.ts'))
export const sample = guide.sample

const HOME = process.env.SKILL_STUDIO_HOME as string
const dir = join(HOME, 'work/acme-app/.agents/skills/landing-pages')
const CASE = 'pricing-page'

/** The one change between the two versions, added to the end of the rules. */
export const RULE =
  '- Recommend one tier: give it the strongest colour and the only filled button. A reader picks faster from a recommendation.'

const TIERS = [
  { name: 'Free', price: '$0', per: 'forever', features: ['3 boards', '2 members', 'Comments'], cta: 'Start free' },
  { name: 'Team', price: '$12', per: 'per seat / month', features: ['Unlimited boards', 'Guest access', 'Priority support'], cta: 'Start a trial' },
  { name: 'Business', price: '$30', per: 'per seat / month', features: ['Everything in Team', 'SSO and audit log', 'A named manager'], cta: 'Talk to sales' },
]

/** v0: valid and accessible, but three equal bordered boxes with nothing to choose between them. */
const V0_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pricing</title>
<style>
  :root { --bg: #ffffff; --fg: #222; --muted: #666; --line: #bbb; }
  @media (prefers-color-scheme: dark) { :root { --bg: #ffffff; --fg: #222; --muted: #666; --line: #bbb; } }
  html { scrollbar-width: none; }
  body { margin: 0; font: 15px/1.5 Arial, sans-serif; background: var(--bg); color: var(--fg); }
  main { max-width: 960px; margin: 0 auto; padding: 22px 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: var(--muted); }
  .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  section { border: 1px solid var(--line); padding: 16px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  .price { font-size: 16px; margin: 0 0 8px; color: var(--fg); }
  ul { padding-left: 18px; margin: 0 0 16px; }
  a { display: block; text-align: center; padding: 8px; border: 1px solid var(--line); color: var(--fg); text-decoration: none; }
  @media (max-width: 520px) { .tiers { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>Pricing</h1>
  <p>Choose a plan.</p>
  <div class="tiers">
${TIERS.map((t) => `    <section>
      <h2>${t.name}</h2>
      <p class="price">${t.price} ${t.per}</p>
      <ul>${t.features.map((f) => `<li>${f}</li>`).join('')}</ul>
      <a href="#">${t.cta}</a>
    </section>`).join('\n')}
  </div>
</main>
</body>
</html>
`

/** v1: the same page with one tier recommended, a clear price scale and real dark mode. */
const V1_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pricing · Fieldnote</title>
<style>
  :root {
    --bg: #f6f4ee; --card: #ffffff; --fg: #17181a; --muted: #6b6a66; --accent: #1f4dff; --on-accent: #ffffff;
    --soft: #e9e6dd; --shadow: 0 1px 2px rgb(0 0 0 / .06), 0 8px 24px rgb(0 0 0 / .08); --r: 16px; --pad: 18px;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #111214; --card: #1a1b1e; --fg: #f2f1ec; --muted: #9c9b96; --accent: #6f8cff; --soft: #26272b; --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 10px 30px rgb(0 0 0 / .35); }
  }
  * { box-sizing: border-box; }
  html { scrollbar-width: none; }
  body { margin: 0; font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased; }
  main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 20px; }
  header { text-align: center; margin-bottom: 24px; }
  .eyebrow { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin: 0 0 6px; }
  h1 { font-size: clamp(24px, 4.4vw, 40px); line-height: 1.08; letter-spacing: -.02em; margin: 0 0 8px; text-wrap: balance; }
  header p { color: var(--muted); margin: 0 auto; max-width: 440px; }
  .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: stretch; }
  section { position: relative; background: var(--card); border-radius: var(--r); padding: var(--pad); box-shadow: var(--shadow); display: flex; flex-direction: column; }
  section.pick { outline: 2px solid var(--accent); transform: translateY(-8px); }
  .badge { position: absolute; top: -10px; left: var(--pad); background: var(--accent); color: var(--on-accent); font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
  h2 { font-size: 14px; font-weight: 600; margin: 0 0 8px; color: var(--muted); }
  .price { margin: 0 0 14px; display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; }
  .price b { font-size: 34px; line-height: 1; letter-spacing: -.03em; }
  .price span { color: var(--muted); font-size: 12px; }
  ul { list-style: none; padding: 0; margin: 0 0 14px; display: grid; gap: 6px; flex: 1; font-size: 13px; align-content: start; }
  li { display: flex; gap: 8px; align-items: center; }
  li::before { content: ""; width: 16px; height: 16px; border-radius: 50%; background: var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.2l2.2 2.2 4.8-4.8' fill='none' stroke='%231f4dff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 16px no-repeat; flex: none; }
  a { display: block; text-align: center; padding: 9px; font-size: 14px; border-radius: calc(var(--r) - 8px); font-weight: 600; text-decoration: none; color: var(--fg); background: var(--soft); transition: transform .2s ease-out, opacity .2s ease-out; }
  .pick a { background: var(--accent); color: var(--on-accent); }
  a:hover { opacity: .9; }
  @media (max-width: 520px) { .tiers { grid-template-columns: 1fr; } section.pick { transform: none; } }
</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Pricing</p>
    <h1>Plan together, for less than lunch.</h1>
    <p>Every plan has shared boards and comments. Team is what most teams pick.</p>
  </header>
  <div class="tiers">
${TIERS.map((t) => `    <section${t.name === 'Team' ? ' class="pick"' : ''}>
${t.name === 'Team' ? '      <span class="badge">Most teams pick it</span>\n' : ''}      <h2>${t.name}</h2>
      <p class="price"><b>${t.price}</b><span>${t.per}</span></p>
      <ul>${t.features.map((f) => `<li>${f}</li>`).join('')}</ul>
      <a href="#">${t.cta}</a>
    </section>`).join('\n')}
  </div>
</main>
</body>
</html>
`

const config = () => mergeConfig(loadBench(dir), scorers)

interface Reading {
  /** Jev's made-up probability that each rule was kept, by a word in the rule. */
  rules: Array<[RegExp, number]>
  /** The same for the case's checks, in order. */
  checks: number[]
  hierarchy: number
  markup: Array<[string, boolean, string]>
}

const READINGS: Record<'v0' | 'v1', Reading> = {
  v0: {
    rules: [[/dark/i, 0.08], [/shadow/i, 0.12], [/Recommend/i, 0.1], [/radius/i, 0.4]],
    checks: [0.97, 0.95, 0.14, 0.9],
    hierarchy: 0.22,
    markup: [['doctype', true, 'doctype'], ['lang', true, 'lang on <html>'], ['viewport', true, 'viewport meta'], ['main', true, 'one <main>'], ['headings', true, 'heading levels']],
  },
  v1: {
    rules: [[/dark/i, 0.95], [/shadow/i, 0.93], [/Recommend/i, 0.96], [/radius/i, 0.9]],
    checks: [0.98, 0.96, 0.95, 0.93],
    hierarchy: 0.94,
    markup: [['doctype', true, 'doctype'], ['lang', true, 'lang on <html>'], ['viewport', true, 'viewport meta'], ['main', true, 'one <main>'], ['headings', true, 'heading levels']],
  },
}

function writeRun(o: { version: string; versionName: string; note: string; date: string; time: string; page: string; reading: Reading }): string {
  const name = runName({ date: o.date, skillVersion: o.version, engine: 'claude', model: 'sonnet', effort: null, configuration: 'with_skill' })
  const root = runDir(dir, name)
  snapshotSkillFiles(dir, join(root, '_skill'))
  const rules = rulesFromSkill(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
  const found = loadCases(dir).find((c) => c.id === CASE)
  if (!found) throw new Error(`landing-pages has no case ${CASE}`)
  const started = new Date(`${o.date}T${o.time}:00Z`).getTime()
  const sample = sampleDir(CASE, 1)
  const path = join(root, sample)
  const seconds = 48
  const costUsd = 0.0581
  const tokens = { input: 96400, output: 4120 }
  mkdirSync(join(path, 'outputs'), { recursive: true })
  writeFileSync(join(path, 'prompt.md'), `${found.prompt}\n`)
  writeFileSync(join(path, 'outputs', 'index.html'), o.page)
  snapshotSkill(dir, join(path, '.agents', 'skills', 'landing-pages'))
  const events = [
    { kind: 'system', text: 'claude claude-sonnet-5-5' },
    { kind: 'tool', tool: 'Read', args: join(path, '.agents/skills/landing-pages/SKILL.md') },
    { kind: 'result', tool: 'Read', result: '1 --- 2 name: landing-pages…', durationMs: 28 },
    { kind: 'tool', tool: 'Write', args: join(path, 'outputs/index.html') },
    { kind: 'result', tool: 'Write', result: 'File created', durationMs: 11 },
    { kind: 'text', text: 'Wrote the pricing page to `outputs/index.html`.' },
  ]
  const stepMs = Math.floor((seconds * 1000) / (events.length + 1))
  writeFileSync(join(path, 'transcript.jsonl'), `${events.map((e, k) => JSON.stringify({ step: k + 1, at: 240 + k * stepMs, ...e })).join('\n')}\n`)
  writeJson(join(path, 'timing.json'), {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(started + seconds * 1000).toISOString(),
    durationMs: seconds * 1000,
    costUsd,
    tokens,
    model: 'claude-sonnet-5-5',
  })
  writeJson(join(path, 'agent.json'), { ok: true, error: null, finalText: 'Wrote the pricing page to `outputs/index.html`.' })
  const meta: SampleMeta = { dir: sample, case: CASE, index: 1, ok: true, seconds, costUsd, tokens, model: 'claude-sonnet-5-5', error: null, steps: events.length, toolCalls: 2 }
  const primary = { file: 'outputs/index.html', kind: 'html' as const }
  const r = o.reading
  const base: Omit<ReportResult, 'scores' | 'flags' | 'confidence'> = {
    sample,
    case: CASE,
    label: null,
    tests: [],
    artifacts: [primary],
    primary,
    words: null,
    range: null,
    packs: {
      generic: {
        adherence: { rules: rules.map((rule) => ({ ...rule, noul: r.rules.find(([test]) => test.test(rule.text))?.[1] ?? 0.93 })) },
        rubric: {
          statements: found.graders.map((g, k) => ({ id: g.id, text: g.statement, weight: g.weight, noul: r.checks[k] ?? 0.9, units: null, best: null })),
        },
      },
      design: {
        markup: r.markup.map(([id, ok, note]) => ({ id, ok, note })),
        jev: { hierarchy: r.hierarchy, finished: null, phone: null, statements: [] },
      },
    },
  } as Omit<ReportResult, 'scores' | 'flags' | 'confidence'>
  const cfg = config()
  const result = { ...base, ...scoreResult(base, cfg, scorers) }
  const run: RunMeta = {
    name,
    skillPath: dir,
    skillVersion: o.version,
    skillName: o.versionName,
    skillHash: skillHash(skillFiles(dir)),
    note: o.note,
    writer: { engine: 'claude', model: 'sonnet', effort: 'default', harness: 'agent' },
    configuration: 'with_skill',
    baselineDir: null,
    cases: [CASE],
    samplesPerCase: 1,
    createdAt: new Date(started).toISOString(),
    finishedAt: new Date(started + seconds * 1000 + 30_000).toISOString(),
    samples: [meta],
  }
  writeJson(join(root, 'run.json'), run)
  writeJson(join(root, 'report.json'), {
    createdAt: new Date(started + seconds * 1000 + 45_000).toISOString(),
    model: 'jev-1.14.0',
    inputTokens: 5200,
    seconds: 0.4,
    config: cfg,
    packs: cfg.packs,
    results: [result],
  })
  return name
}

function saveAs(name: string, note: string, date: string): string {
  const saved = saveVersion(dir, versionsOf(dir).current, name, note)
  const file = join(dir, 'evals/versions', saved.version, 'version.json')
  writeJson(file, { ...JSON.parse(readFileSync(file, 'utf8')), createdAt: `${date}T15:00:00.000Z` })
  return saved.version
}

const V0 = readFileSync(join(dir, 'SKILL.md'), 'utf8')
const v0 = saveAs('From the template', 'The design template as it ships.', '2026-11-04')
const r0 = writeRun({ version: v0, versionName: 'From the template', note: 'Pricing page, template rules', date: '2026-11-04', time: '14:20', page: V0_PAGE, reading: READINGS.v0 })
writeFileSync(join(dir, 'SKILL.md'), `${V0.trimEnd()}\n${RULE}\n`)
const v1 = saveAs('Recommend a tier', 'Added one rule: recommend one tier.', '2026-11-05')
const r1 = writeRun({ version: v1, versionName: 'Recommend a tier', note: 'Pricing page after the new rule', date: '2026-11-05', time: '10:40', page: V1_PAGE, reading: READINGS.v1 })
touchRecent(dir)
// release-notes stays the most recent, so the library opens on it.
touchRecent(join(HOME, 'work/acme-app/.agents/skills/release-notes'))

/** What the design beat looks for: the two pricing pages, v0 then v1. */
export const design = { skill: 'landing-pages', case: CASE, a: `${r0}/${sampleDir(CASE, 1)}`, b: `${r1}/${sampleDir(CASE, 1)}` }
