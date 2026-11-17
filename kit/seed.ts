/**
 * The mock Skill Studio home every marketing asset is filmed on. The sample
 * skill is social-post (skills/social-post in this repo): it writes a post and
 * renders its image in Skill Studio's brand. The home holds it at v0 and v1,
 * three cases with their screenshots, and runs of both versions whose outputs
 * are real renders of the skill's own template. Jev's answers are made up by
 * hand and scored by the app's own scoring code; nothing is sent anywhere.
 *
 *   SKILL_STUDIO_HOME=<dir> tsx --tsconfig <app>/tsconfig.json kit/seed.ts
 *
 * Prints the sample skill's folder last. Without kit/shots (node kit/shots.mjs
 * makes them), the cases have no screenshots and no runs are written.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.SKILL_STUDIO_HOME
if (!HOME) throw new Error('Set SKILL_STUDIO_HOME to a scratch folder.')
const KIT = dirname(fileURLToPath(import.meta.url))
const SKILL_SRC = join(KIT, '../skills/social-post')
const SHOTS = join(KIT, 'shots')
const withRuns = existsSync(join(SHOTS, 'split-up.png')) && !process.env.SEED_NO_RUNS

// The app's own modules, from the checkout tsx runs in (its tsconfig resolves the aliases).
const { mergeConfig } = await import('@domain/config.ts')
const { DEFAULT_PREFERENCES } = await import('@domain/preferences.ts')
const { rulesFromSkill } = await import('@domain/rules.ts')
const { runName, sampleDir } = await import('@domain/run-name.ts')
const { scoreResult } = await import('@domain/scoring.ts')
const { copyOf, words } = await import('@domain/text.ts')
const { loadBench, loadCases, saveCase } = await import('@infrastructure/cases.ts')
const { writeJson } = await import('@infrastructure/fs.ts')
const { createSkill, touchRecent } = await import('@infrastructure/library.ts')
const { writePreferences } = await import('@infrastructure/preferences.ts')
const { runDir, versionsOf } = await import('@infrastructure/runs.ts')
const { skillFiles, skillHash, snapshotSkill } = await import('@infrastructure/skill.ts')
const { saveVersion } = await import('@infrastructure/versions.ts')
const { scorers } = await import('@judges/scorers.ts')

// A workspace with one project, so the Library shows a project beside User.
const project = join(HOME, 'work', 'skill-studio-site')
mkdirSync(join(project, '.agents', 'skills'), { recursive: true })
writeJson(join(HOME, '.skill-studio', 'library.json'), { workspaces: [join(HOME, 'work')], recent: [] })
// Past the welcome, with no first-visit hints: the app as it is in daily use.
writePreferences({ ...DEFAULT_PREFERENCES, welcomed: true, hints: 'hide' })

createSkill({ scope: 'user', name: 'unit-tests', description: '', agents: ['claude', 'cursor'], template: 'code', samples: true })
createSkill({ scope: 'user', name: 'pr-review', description: '', agents: ['claude'], template: 'workflow', samples: false })
createSkill({ scope: project, name: 'landing-pages', description: '', agents: ['cursor'], template: 'design', samples: true })

const NAME = 'social-post'
const DESCRIPTION = readFileSync(join(SKILL_SRC, 'SKILL.md'), 'utf8').match(/^description: (.*)$/m)?.[1] ?? ''
const dir = createSkill({ scope: project, name: NAME, description: DESCRIPTION, agents: ['claude', 'cursor'], template: 'blank', samples: false })
// The skill's own files: its brand reference, the image template and fonts, the render script.
for (const part of ['references', 'assets', 'scripts']) cpSync(join(SKILL_SRC, part), join(dir, part), { recursive: true })

const FRONT = `---
name: ${NAME}
description: ${DESCRIPTION}
---
`
const PROCESS = `## Process

1. Read the request and name the one feature the post is about.
2. Find a screenshot of that feature. If the request gives none, ask for one: never draw the app.
3. Write \`post.md\`: the text, then the alt text under \`Alt text:\`.
4. Write \`post.json\` (fields in [references/brand.md](references/brand.md#the-image)) and run \`node scripts/render.mjs post.json\`. It writes \`post.png\`.
5. Open \`post.png\` and check it against every rule above.
`
const RULE = {
  open: 'Open with what the reader can now do, in 12 words or fewer. The timeline gives a post one line to earn a stop.',
  one: "Name one feature per post. Two features split the reader's attention and neither lands.",
  under: 'Keep the text under 240 characters, the link not counted. X hides longer text behind "Show more".',
  never: 'Never use "excited", "game-changing" or "revolutionary". Hype makes the reader doubt the claim beside it.',
  show: 'Show the screen the post is about, cropped to the part that changed. A reader believes what they can see.',
  colors: 'Use only the colors in references/brand.md. A color off the palette reads as someone else\'s post.',
}
const doc = (keys: Array<keyof typeof RULE>, lead: string) => `${FRONT}
# Social post

${lead}

## Rules

${keys.map((k) => `- ${RULE[k]}`).join('\n')}

${PROCESS}`
const V0 = doc(['open', 'under', 'show', 'colors'], 'Write for someone who writes agent skills and has never opened Skill Studio.')
/** The skill as the film finds it: v1, before the rules the film adds. */
export const V1 = doc(
  ['open', 'one', 'under', 'never', 'show', 'colors'],
  'Write for someone who writes agent skills and has never opened Skill Studio. Read [references/brand.md](references/brand.md) before you make the image.',
)

const CASES = [
  {
    id: 'split-up',
    title: 'Post for Split up',
    shot: 'split-up.png',
    focus: [0.36, 0.4],
    prompt:
      'Write an X post for Split up, new in Suggest changes in Skill Studio 0.17.0. On a rule that asks for several things, it offers one rule for each, each with its reason. The screenshot is files/split-up.png. Link: skillstudio.app/changelog',
    expectedOutcome: 'A short post on Split up alone, with its screenshot, the version in the image and alt text.',
    checks: [
      ['The post names Split up.', 2],
      ['The image shows the version, 0.17.0.', 1],
      ['The post has alt text that says what the image shows.', 1],
    ],
  },
  {
    id: 'tables',
    title: 'Post for tables in Formatted',
    shot: 'tables.png',
    focus: [0.72, 0.45],
    prompt:
      'Write a LinkedIn post for tables in Formatted, new in Skill Studio 0.17.0. A table in a skill now shows as a table, and a click on a cell edits it as text. The screenshot is files/tables.png. Link: skillstudio.app/changelog',
    expectedOutcome: 'A post on tables in Formatted that says a click on a cell edits it.',
    checks: [
      ['The post says a table shows as a table in Formatted.', 2],
      ['The post says a click on a cell edits it as text.', 1],
    ],
  },
  {
    id: 'file-tree',
    title: 'Post for the file tree',
    shot: 'file-tree.png',
    focus: [0.27, 0.32],
    prompt:
      'Write an X post for the file tree in Skill Studio 0.16.0. The Skill screen lists every file of a skill by folder, and Add a file puts one where it goes. The screenshot is files/file-tree.png. Link: skillstudio.app/changelog',
    expectedOutcome: 'A post on the file tree with its screenshot and the version in the image.',
    checks: [
      ['The post says every file of the skill is listed.', 2],
      ['The image shows the version, 0.16.0.', 1],
    ],
  },
] as const
type CaseId = (typeof CASES)[number]['id']
type Variant = 'good' | 'ok' | 'hype'

/** What each answer says, and the image it rendered. */
const OUTPUTS: Record<CaseId, Record<Variant, { text: string; alt: string; post: Record<string, unknown> }>> = {
  'split-up': {
    good: {
      text: 'Split a rule that asks for too much.\n\nIn Skill Studio 0.17.0, **Split up** in Suggest changes turns one crowded rule into one rule for each thing it asks, each with its reason.\n\nskillstudio.app/changelog #agentskills',
      alt: 'The Suggest changes popout in Skill Studio, showing three rewrites of one rule. The third, Split up, makes it three rules.',
      post: { eyebrow: 'Skill Studio 0.17.0', headline: 'Split a rule that asks for too much', slab: 'Split', line: 'Suggest changes offers one rule for each thing it asks.' },
    },
    ok: {
      text: 'Rules that ask for several things are hard to grade.\n\nSkill Studio 0.17.0 adds Split up to Suggest changes: one rule for each thing, each with its reason.\n\nskillstudio.app/changelog',
      alt: 'A screenshot of Skill Studio.',
      post: { eyebrow: 'Skill Studio 0.17.0', headline: 'One rule for each thing it asks', slab: 'One', line: 'Split up, in Suggest changes.' },
    },
    hype: {
      text: "We're excited to announce Skill Studio 0.17.0! 🎉 Split up breaks long rules into smaller ones, plus code blocks are now colored, tables render properly in Formatted, and Shorter got smarter. A game-changing release for anyone writing skills. Try it today!\n\n#AI #agents #skills #devtools #productivity",
      alt: '',
      post: { eyebrow: 'Skill Studio', headline: 'Four big upgrades in one release', slab: 'Four', line: 'Split up, colored code, tables and a smarter Shorter.' },
    },
  },
  tables: {
    good: {
      text: 'Read a table in a skill as a table.\n\nIn Skill Studio 0.17.0, a table shows as a table in **Formatted**. Click a cell to edit it as text.\n\nskillstudio.app/changelog #agentskills',
      alt: "Skill Studio's Formatted view showing a skill's color table as a table, with its Name, Hex and Use columns.",
      post: { eyebrow: 'Skill Studio 0.17.0', headline: 'Read a table as a table', slab: 'table', line: 'Click a cell in Formatted to edit it as text.' },
    },
    ok: {
      text: 'Tables in a skill now show as tables in Formatted, in Skill Studio 0.17.0. A click on a cell edits it as text.\n\nskillstudio.app/changelog',
      alt: 'A table in Skill Studio.',
      post: { eyebrow: 'Skill Studio 0.17.0', headline: 'Tables in Formatted', slab: 'Tables', line: 'Click a cell to edit it.' },
    },
    hype: {
      text: "Big news! Skill Studio's editor just got a revolutionary upgrade: tables, colored code blocks and a brand new file tree. Writing skills has never been this seamless. We can't wait for you to try it!\n\n#AI #agents #devtools",
      alt: '',
      post: { eyebrow: 'Skill Studio', headline: 'A revolutionary editor upgrade', slab: 'editor', line: 'Tables, code and files, all new.' },
    },
  },
  'file-tree': {
    good: {
      text: 'See every file a skill holds.\n\nIn Skill Studio 0.16.0, the Skill screen lists each file by folder. **Add a file** puts a new one where it goes.\n\nskillstudio.app/changelog #agentskills',
      alt: "The Skill screen's file list in Skill Studio: SKILL.md, then the assets, references and scripts folders.",
      post: { eyebrow: 'Skill Studio 0.16.0', headline: 'See every file a skill holds', slab: 'every', line: 'Add a file where it goes, by folder.' },
    },
    ok: {
      text: 'Skill Studio 0.16.0 lists every file of a skill by folder on the Skill screen, and Add a file puts one where it goes.\n\nskillstudio.app/changelog',
      alt: 'Files in Skill Studio.',
      post: { eyebrow: 'Skill Studio 0.16.0', headline: 'Files by folder', slab: 'Files', line: 'Add a file where it goes.' },
    },
    hype: {
      text: "Excited to share the new file tree in Skill Studio! Now you can finally see ALL your files, add folders, right-click to manage things and so much more. Game-changing for power users!\n\n#AI #skills #devtools #productivity",
      alt: '',
      post: { eyebrow: 'Skill Studio', headline: 'The file tree is here', slab: 'here', line: 'And so much more.' },
    },
  },
}

/** Jev's made-up probability per rule, kept clear of 0.3 and 0.7 so every verdict reads met or missed. */
const RULE_NOULS: Record<Variant, Record<string, number>> = {
  good: { open: 0.94, one: 0.96, under: 0.98, never: 0.99, show: 0.93, colors: 0.97 },
  ok: { open: 0.86, one: 0.92, under: 0.97, never: 0.98, show: 0.82, colors: 0.95 },
  hype: { open: 0.22, one: 0.06, under: 0.04, never: 0.03, show: 0.12, colors: 0.9 },
}
const RULE_KEYS = Object.entries(RULE).map(([key, text]) => [text.slice(0, 24), key] as const)
const CHECK_NOULS: Record<CaseId, Record<Variant, number[]>> = {
  'split-up': { good: [0.98, 0.95, 0.94], ok: [0.97, 0.93, 0.21], hype: [0.92, 0.08, 0.02] },
  tables: { good: [0.97, 0.95], ok: [0.95, 0.9], hype: [0.74, 0.04] },
  'file-tree': { good: [0.96, 0.94], ok: [0.93, 0.92], hype: [0.85, 0.06] },
}

const config = () => mergeConfig(loadBench(dir), scorers)

/** Render one answer's image with the skill's own script, into the sample's outputs. */
function renderImage(out: string, c: (typeof CASES)[number], variant: Variant) {
  const post: Record<string, unknown> = { size: c.id === 'tables' ? 'linkedin' : 'x', ...OUTPUTS[c.id][variant].post, out: 'post.png' }
  // The hype answers drew no screenshot: the mark stands in for it.
  if (variant !== 'hype') {
    cpSync(join(SHOTS, c.shot), join(out, c.shot))
    Object.assign(post, { shot: c.shot, focus: c.focus })
  }
  writeJson(join(out, 'post.json'), post)
  const run = spawnSync(process.execPath, [join(SKILL_SRC, 'scripts/render.mjs'), join(out, 'post.json')], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`render failed: ${run.stderr}`)
}

function eventsOf(path: string, prompt: string, modelId: string, withSkill: boolean) {
  const skill = join(path, `.agents/skills/${NAME}`)
  return [
    { kind: 'system', text: `claude ${modelId}` },
    ...(withSkill
      ? [
          { kind: 'tool', tool: 'Read', args: join(skill, 'SKILL.md') },
          { kind: 'result', tool: 'Read', result: `1 --- 2 name: ${NAME} 3 description: Write a social post…`, durationMs: 28 },
          { kind: 'tool', tool: 'Read', args: join(skill, 'references/brand.md') },
          { kind: 'result', tool: 'Read', result: "1 # Skill Studio's brand, for a social post…", durationMs: 14 },
        ]
      : []),
    { kind: 'tool', tool: 'Read', args: join(path, 'prompt.md') },
    { kind: 'result', tool: 'Read', result: `1 ${prompt.slice(0, 70)}…`, durationMs: 11 },
    { kind: 'tool', tool: 'Write', args: join(path, 'outputs/post.md') },
    { kind: 'result', tool: 'Write', result: 'File created', durationMs: 8 },
    { kind: 'tool', tool: 'Write', args: join(path, 'outputs/post.json') },
    { kind: 'result', tool: 'Write', result: 'File created', durationMs: 6 },
    { kind: 'tool', tool: 'Bash', args: `node ${withSkill ? join(skill, 'scripts/render.mjs') : 'render.mjs'} outputs/post.json` },
    { kind: 'result', tool: 'Bash', result: join(path, 'outputs/post.png'), durationMs: 2140 },
    { kind: 'text', text: 'Wrote the post to `outputs/post.md` and its image to `outputs/post.png`.' },
  ]
}

interface RunSpec {
  date: string
  time: string
  version: string
  versionName: string
  note: string
  model: string
  modelId: string
  configuration: 'with_skill' | 'without_skill'
  samples: Array<{ case: CaseId; variant: Variant }>
}

function writeRun(spec: RunSpec): string {
  const name = runName({ date: spec.date, skillVersion: spec.version, engine: 'claude', model: spec.model, effort: null, configuration: spec.configuration })
  const root = runDir(dir, name)
  const withSkill = spec.configuration !== 'without_skill'
  snapshotSkill(dir, join(root, '_skill'))
  const rules = rulesFromSkill(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
  const cases = loadCases(dir)
  const started = new Date(`${spec.date}T${spec.time}:00Z`).getTime()
  const counts = new Map<string, number>()
  const metas: unknown[] = []
  const results: unknown[] = []
  const cfg = config()

  spec.samples.forEach((s, i) => {
    const index = (counts.get(s.case) ?? 0) + 1
    counts.set(s.case, index)
    const sample = sampleDir(s.case, index)
    const path = join(root, sample)
    const c = CASES.find((x) => x.id === s.case)!
    const found = cases.find((x) => x.id === s.case)
    if (!found) throw new Error(`No case ${s.case}`)
    const answer = OUTPUTS[s.case][s.variant]
    const text = `${answer.text}\n${answer.alt ? `\nAlt text: ${answer.alt}\n` : ''}`
    const seconds = 22 + ((i * 7 + spec.model.length * 3) % 17)
    const tokens = { input: 64200 + i * 877, output: 1420 + i * 53 }
    const costUsd = spec.model === 'haiku' ? 0.0034 + i * 0.0002 : 0.0388 + i * 0.0016
    const out = join(path, 'outputs')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(path, 'prompt.md'), `${found.prompt}\n`)
    writeFileSync(join(out, 'post.md'), text)
    renderImage(out, c, s.variant)
    if (withSkill) snapshotSkill(dir, join(path, '.agents', 'skills', NAME))
    const events = eventsOf(path, found.prompt, spec.modelId, withSkill)
    const toolCalls = events.filter((e) => e.kind === 'tool').length
    const stepMs = Math.floor((seconds * 1000) / (events.length + 1))
    writeFileSync(join(path, 'transcript.jsonl'), `${events.map((e, k) => JSON.stringify({ step: k + 1, at: 240 + k * stepMs, ...e })).join('\n')}\n`)
    const at = new Date(started + i * 24_000)
    writeJson(join(path, 'timing.json'), { startedAt: at.toISOString(), finishedAt: new Date(at.getTime() + seconds * 1000).toISOString(), durationMs: seconds * 1000, costUsd, tokens, model: spec.modelId })
    writeJson(join(path, 'agent.json'), { ok: true, error: null, finalText: 'Wrote the post to `outputs/post.md` and its image to `outputs/post.png`.' })
    metas.push({ dir: sample, case: s.case, index, ok: true, seconds, costUsd, tokens, model: spec.modelId, error: null, steps: events.length, toolCalls })

    const primary = { file: 'outputs/post.md', kind: 'markdown' as const }
    const artifacts = [primary, { file: 'outputs/post.png', kind: 'image' as const }]
    const ruleNoul = (t: string) => RULE_NOULS[s.variant][RULE_KEYS.find(([lead]) => t.startsWith(lead))?.[1] ?? ''] ?? 0.9
    const base = {
      sample,
      case: s.case,
      label: null,
      tests: [],
      artifacts,
      primary,
      words: words(copyOf(answer.text)).length,
      range: found.bench.words ?? null,
      packs: {
        generic: {
          adherence: { rules: rules.map((r: { text: string }) => ({ ...r, noul: ruleNoul(r.text) })) },
          rubric: {
            statements: found.graders.map((g: { id: string; statement: string; weight: number }, k: number) => ({
              id: g.id, text: g.statement, weight: g.weight, noul: CHECK_NOULS[s.case][s.variant][k] ?? 0.9, units: null, best: null,
            })),
          },
        },
        workflow: {
          metrics: {
            steps: events.length, toolCalls, errors: 0, retries: 0, seconds, costUsd, outside: [],
            skillReadAt: withSkill ? 2 : null, firstWriteAt: events.findIndex((e) => e.tool === 'Write') + 1,
            skillPresent: withSkill, wroteOutput: true, maxTurns: null, timeoutSeconds: 300,
          },
          jev: { followedTask: s.variant === 'hype' ? 0.76 : 0.92, recovered: null },
        },
      },
    }
    const scored = scoreResult({ ...base, flags: [] } as never, cfg, scorers)
    results.push({ ...base, ...scored })
  })

  writeJson(join(root, 'run.json'), {
    name, skillPath: dir, skillVersion: spec.version, skillName: spec.versionName, skillHash: skillHash(skillFiles(dir)), note: spec.note,
    writer: { engine: 'claude', model: spec.model, effort: 'default', harness: 'agent' },
    configuration: spec.configuration, baselineDir: null, cases: [...new Set(spec.samples.map((s) => s.case))],
    samplesPerCase: Math.max(...counts.values()),
    createdAt: new Date(started).toISOString(),
    finishedAt: new Date(started + spec.samples.length * 24_000 + 30_000).toISOString(),
    samples: metas,
  })
  writeJson(join(root, 'report.json'), {
    createdAt: new Date(started + spec.samples.length * 24_000 + 45_000).toISOString(),
    model: 'jev-1.14.0', inputTokens: 2600 * spec.samples.length + 412, seconds: 0.4, config: cfg, packs: cfg.packs, results,
  })
  return name
}

function saveAs(name: string, note: string, date: string): string {
  const saved = saveVersion(dir, versionsOf(dir).current, name, note)
  const file = join(dir, 'evals/versions', saved.version, 'version.json')
  writeJson(file, { ...JSON.parse(readFileSync(file, 'utf8')), createdAt: `${date}T15:00:00.000Z` })
  return saved.version
}

writeJson(join(dir, 'evals/bench.json'), { packs: ['generic', 'workflow'] })
for (const c of CASES) {
  saveCase(dir, {
    id: c.id, title: c.title, prompt: c.prompt, expectedOutcome: c.expectedOutcome, words: [15, 70], images: [],
    graders: c.checks.map(([statement, weight]) => ({ id: null, statement, weight, image: null })),
  } as never, true)
  if (existsSync(join(SHOTS, c.shot))) {
    const files = join(dir, 'evals/cases', c.id, 'files')
    mkdirSync(files, { recursive: true })
    cpSync(join(SHOTS, c.shot), join(files, c.shot))
  }
}

const twice = (v: Record<CaseId, [Variant, Variant]>) =>
  CASES.flatMap((c) => v[c.id].map((variant) => ({ case: c.id, variant })))

writeFileSync(join(dir, 'SKILL.md'), V0)
const v0 = saveAs('First draft', 'Four rules: the opening line, the length, the screenshot and the palette.', '2026-11-12')
if (withRuns) {
  writeRun({ date: '2026-11-12', time: '16:05', version: v0, versionName: 'First draft', note: 'First run of all three cases', model: 'sonnet', modelId: 'claude-sonnet-5-5', configuration: 'with_skill', samples: twice({ 'split-up': ['ok', 'hype'], tables: ['hype', 'ok'], 'file-tree': ['ok', 'hype'] }) })
  writeRun({ date: '2026-11-12', time: '16:32', version: v0, versionName: 'First draft', note: 'Baseline: no skill installed', model: 'sonnet', modelId: 'claude-sonnet-5-5', configuration: 'without_skill', samples: [{ case: 'split-up', variant: 'hype' }, { case: 'tables', variant: 'hype' }, { case: 'file-tree', variant: 'hype' }] })
}
writeFileSync(join(dir, 'SKILL.md'), V1)
const v1 = saveAs('One feature, no hype', 'v0 posts crammed the whole release into one post and called it game-changing. Added the one-feature rule and the hype words.', '2026-11-14')
if (withRuns)
  writeRun({ date: '2026-11-14', time: '10:12', version: v1, versionName: 'One feature, no hype', note: 'Same cases after the one-feature rule', model: 'sonnet', modelId: 'claude-sonnet-5-5', configuration: 'with_skill', samples: twice({ 'split-up': ['good', 'good'], tables: ['good', 'ok'], 'file-tree': ['good', 'good'] }) })

touchRecent(dir)
console.log(dir)
