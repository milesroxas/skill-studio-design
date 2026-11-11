/**
 * The teaser's sample: a brand voice skill for a made-up product, Fieldnote,
 * tested on three briefs. A copy of skill-studio's guide seed
 * (scripts/guide-shots/seed.ts) with its own skill, cases and drafts.
 *
 * The sample skills the guide's screenshots show. Importing this file writes
 * them into the folder SKILL_STUDIO_HOME names, through the app's own
 * infrastructure, so the files are the shape the app writes itself. The judge
 * answers are made up by hand and scored by the real scoring code: no agent
 * runs and nothing is sent to Jev.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import { DEFAULT_PREFERENCES } from '@domain/preferences.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import { runName, sampleDir } from '@domain/run-name.ts'
import type { Configuration, ReportResult, RunMeta, SampleMeta } from '@domain/schemas.ts'
import { scoreResult } from '@domain/scoring.ts'
import { copyOf, words } from '@domain/text.ts'
import { loadBench, loadCases, saveCase } from '@infrastructure/cases.ts'
import { writeJson } from '@infrastructure/fs.ts'
import { createSkill, touchRecent } from '@infrastructure/library.ts'
import { writePreferences } from '@infrastructure/preferences.ts'
import { runDir, versionsOf } from '@infrastructure/runs.ts'
import { skillFiles, skillHash, snapshotSkill, snapshotSkillFiles } from '@infrastructure/skill.ts'
import { saveVersion } from '@infrastructure/versions.ts'
import { scorers } from '@judges/scorers.ts'

const HOME = process.env.SKILL_STUDIO_HOME
if (!HOME) throw new Error('Set SKILL_STUDIO_HOME to a scratch folder before importing the seed.')

// A workspace with one project, so the library has a project place beside User.
const project = join(HOME, 'work', 'acme-app')
mkdirSync(join(project, '.agents', 'skills'), { recursive: true })
writeJson(join(HOME, '.skill-studio', 'library.json'), {
  workspaces: [join(HOME, 'work')],
  others: [],
  recent: [],
})
// The pictures show the screens as they are in daily use: past the welcome, with no first-visit hints.
writePreferences({ ...DEFAULT_PREFERENCES, welcomed: true, hints: 'hide' })

createSkill({
  scope: 'user',
  name: 'unit-tests',
  description: '',
  agents: ['claude', 'cursor'],
  template: 'code',
  samples: true,
})
createSkill({
  scope: 'user',
  name: 'pr-review',
  description: '',
  agents: ['claude'],
  template: 'workflow',
  samples: false,
})
createSkill({
  scope: project,
  name: 'landing-pages',
  description: '',
  agents: ['cursor'],
  template: 'design',
  samples: true,
})
const dir = createSkill({
  scope: project,
  name: 'brand-voice',
  description:
    'Write in the Fieldnote voice: plain, warm and specific. Use for marketing posts and client emails.',
  agents: ['claude', 'cursor'],
  template: 'blank',
  samples: false,
})

const FRONT = `---
name: brand-voice
description: Write in the Fieldnote voice, plain, warm and specific. Use for marketing posts and client emails.
---
`
const V0 = `${FRONT}
# Fieldnote voice

Write like a colleague who knows the product, not like a brochure.

## Rules

- Lead with what the reader can do now, not with what we built. Readers decide in the first line.
- Use everyday words. Fieldnote talks to people, not to a market.
- Never use "excited", "thrilled" or "revolutionary". Hype makes the reader doubt the facts beside it.
- Name one concrete detail: a date, a number, a name. Specifics are what make copy believable.
- End with one clear next step. A reader without one does nothing.
`
/** The one change the teaser films: v1 is v0 with this rule added at the end. */
export const RULE = '- Write short, casual sentences. Readers skim.'
const V1 = `${V0}${RULE}\n`

const CASES = [
  {
    id: 'launch-post',
    title: 'Marketing brief: Shared Boards launch post',
    prompt:
      'Write a short LinkedIn post announcing Shared Boards: teams can now plan together on one board and comment on any card. It is free on every Fieldnote plan from today.',
    expectedOutcome:
      'A post that leads with what teams can do now, in plain words, and ends with one next step.',
    checks: [
      ['The post says teams can plan together on one board.', 2],
      ['The post says Shared Boards is free on every plan.', 1],
      ['The post ends with one next step.', 1],
    ],
  },
  {
    id: 'client-email',
    title: 'Client email brief: the launch date moves',
    prompt:
      'Write an email to Ana at Halden Studio: their site launch moves from 14 May to 21 May, because the payment provider needs one more week to approve the account. Everything else stays on plan.',
    expectedOutcome: 'A direct, warm email: the new date first, the reason once, and what stays the same.',
    checks: [
      ['The email gives the new date, 21 May.', 2],
      ['The email gives the reason in plain words.', 1],
    ],
  },
] as const

type CaseId = (typeof CASES)[number]['id']
type Variant = 'good' | 'ok' | 'hype'

/** ok: what v0 writes. good: what v1 writes, a sharper post and an email gone too casual. hype: no skill. */
const OUTPUTS: Record<CaseId, Record<Variant, string>> = {
  'launch-post': {
    ok: `Shared Boards is now available to every team on Fieldnote. Teams can plan together on a single board and leave comments on any card, so updates stay in one place.

It is free on every plan starting today. Open a board to get started.
`,
    good: `Your team can now plan on one board.

Comment on any card. See who is on what. Stop chasing updates in chat.

Free on every Fieldnote plan, from today. Open a board and invite your team.
`,
    hype: `We're thrilled to announce Shared Boards, a revolutionary new way to collaborate.

Our team has worked tirelessly to reimagine teamwork from the ground up, and we can't wait for you to experience the future of planning.
`,
  },
  'client-email': {
    ok: `Hi Ana,

Your launch moves from 14 May to 21 May. The payment provider needs one more week to approve your account, and the site cannot take payments until they do.

Everything else stays on plan: design, content and testing finish as scheduled.

Best,
Sam
`,
    good: `Hey Ana!

Quick heads up: launch slides to 21 May. Payments still need sign-off.

Everything else is on track.

Cheers,
Sam
`,
    hype: `Hi Ana,

I hope this email finds you well! We're excited to share a quick update on your launch. Due to unforeseen circumstances, we will need to adjust the timeline slightly.

Best regards,
Sam
`,
  },
}

/** The judge's made-up probability per rule, by what the rule is about. */
const RULE_NOULS: Record<Variant, Record<string, number>> = {
  good: { title: 0.95, order: 0.92, under: 0.99, never: 0.99, where: 0.93, only: 0.88 },
  ok: { title: 0.9, order: 0.84, under: 0.99, never: 0.98, where: 0.34, only: 0.81 },
  hype: { title: 0.21, order: 0.38, under: 0.97, never: 0.02, where: 0.08, only: 0.27 },
}
const RULE_KEYS: Array<[RegExp, string]> = [
  [/^Lead with/, 'title'],
  [/^Write short/, 'order'],
  [/^Use everyday/, 'under'],
  [/^Never use/, 'never'],
  [/^End with/, 'where'],
  [/^Name one/, 'only'],
]
const CHECK_NOULS: Record<CaseId, Record<Variant, number[]>> = {
  'launch-post': { good: [0.97, 0.95, 0.94], ok: [0.96, 0.93, 0.88], hype: [0.12, 0.04, 0.06] },
  'client-email': { good: [0.97, 0.62], ok: [0.98, 0.96], hype: [0.03, 0.05] },
}

interface Trouble {
  errors?: number
  retries?: number
  outside?: string[]
  followed?: number
}
interface SampleSpec {
  case: CaseId
  variant: Variant
  trouble?: Trouble
}
interface RunSpec {
  date: string
  time: string
  version: string
  versionName: string
  note: string
  model: string
  modelId: string
  configuration: Configuration
  samples: SampleSpec[]
}

const config = () => mergeConfig(loadBench(dir), scorers)

function writeRun(spec: RunSpec): string {
  const name = runName({
    date: spec.date,
    skillVersion: spec.version,
    engine: 'claude',
    model: spec.model,
    effort: null,
    configuration: spec.configuration,
  })
  const root = runDir(dir, name)
  const withSkill = spec.configuration !== 'without_skill'
  snapshotSkillFiles(dir, join(root, '_skill'))
  const rules = rulesFromSkill(readFileSync(join(dir, 'SKILL.md'), 'utf8'))
  const cases = loadCases(dir)
  const started = new Date(`${spec.date}T${spec.time}:00Z`).getTime()
  const counts = new Map<string, number>()
  const metas: SampleMeta[] = []
  const results: ReportResult[] = []
  const cfg = config()

  spec.samples.forEach((s, i) => {
    const index = (counts.get(s.case) ?? 0) + 1
    counts.set(s.case, index)
    const sample = sampleDir(s.case, index)
    const path = join(root, sample)
    const found = cases.find((c) => c.id === s.case)
    if (!found) throw new Error(`No case ${s.case}`)
    const text = OUTPUTS[s.case][s.variant]
    const trouble = s.trouble ?? {}
    const seconds = 14 + ((i * 7 + spec.model.length * 3) % 19)
    const toolCalls = 3 + (trouble.errors ?? 0) + (trouble.retries ?? 0) + (i % 2)
    const tokens = { input: 81200 + i * 913, output: 1180 + i * 61 }
    const costUsd = spec.model === 'haiku' ? 0.0031 + i * 0.0002 : 0.0412 + i * 0.0017
    mkdirSync(join(path, 'outputs'), { recursive: true })
    writeFileSync(join(path, 'prompt.md'), `${found.prompt}\n`)
    writeFileSync(join(path, 'outputs', 'output.md'), text)
    writeFileSync(
      join(path, 'notes.md'),
      '# Notes\n\n- Kept to the facts in the request.\n- Every fact is from the brief; nothing was added.\n',
    )
    if (withSkill) snapshotSkill(dir, join(path, '.agents', 'skills', 'brand-voice'))
    const skillPath = join(path, '.agents/skills/brand-voice/SKILL.md')
    const events = [
      { kind: 'system', text: `claude ${spec.modelId}` },
      ...(withSkill
        ? [
            { kind: 'tool', tool: 'Read', args: skillPath },
            {
              kind: 'result',
              tool: 'Read',
              result: '1 --- 2 name: brand-voice 3 description: Write in the Fieldnote voice…',
              durationMs: 31,
            },
          ]
        : []),
      { kind: 'tool', tool: 'Read', args: join(path, 'prompt.md') },
      { kind: 'result', tool: 'Read', result: `1 ${found.prompt.slice(0, 70)}…`, durationMs: 12 },
      ...(trouble.errors
        ? [
            { kind: 'tool', tool: 'Bash', args: 'wc -w outputs/output.md' },
            {
              kind: 'error',
              tool: 'Bash',
              text: 'wc: outputs/output.md: No such file or directory',
              error: true,
            },
          ]
        : []),
      { kind: 'tool', tool: 'Write', args: join(path, 'outputs/output.md') },
      { kind: 'result', tool: 'Write', result: 'File created', durationMs: 9 },
      { kind: 'tool', tool: 'Write', args: join(path, 'notes.md') },
      { kind: 'result', tool: 'Write', result: 'File created', durationMs: 7 },
      {
        kind: 'text',
        text: 'Wrote the draft to `outputs/output.md` and my notes to `notes.md`.',
      },
    ]
    const stepMs = Math.floor((seconds * 1000) / (events.length + 1))
    writeFileSync(
      join(path, 'transcript.jsonl'),
      `${events.map((e, k) => JSON.stringify({ step: k + 1, at: 240 + k * stepMs, ...e })).join('\n')}\n`,
    )
    const at = new Date(started + i * 21_000)
    writeJson(join(path, 'timing.json'), {
      startedAt: at.toISOString(),
      finishedAt: new Date(at.getTime() + seconds * 1000).toISOString(),
      durationMs: seconds * 1000,
      costUsd,
      tokens,
      model: spec.modelId,
    })
    writeJson(join(path, 'agent.json'), {
      ok: true,
      error: null,
      finalText: 'Wrote the draft to `outputs/output.md` and my notes to `notes.md`.',
    })
    metas.push({
      dir: sample,
      case: s.case,
      index,
      ok: true,
      seconds,
      costUsd,
      tokens,
      model: spec.modelId,
      error: null,
      steps: events.length,
      toolCalls,
    })

    const primary = { file: 'outputs/output.md', kind: 'markdown' as const }
    const firstWrite = events.findIndex((e) => 'tool' in e && e.tool === 'Write') + 1
    const base: Omit<ReportResult, 'scores' | 'flags' | 'confidence'> = {
      sample,
      case: s.case,
      label: null,
      tests: [],
      artifacts: [primary],
      primary,
      words: words(copyOf(text)).length,
      range: found.bench.words ?? null,
      packs: {
        generic: {
          adherence: {
            rules: rules.map((r) => ({
              ...r,
              noul:
                RULE_NOULS[s.variant][RULE_KEYS.find(([test]) => test.test(r.text))?.[1] ?? ''] ??
                0.9,
            })),
          },
          rubric: {
            statements: found.graders.map((g, k) => ({
              id: g.id,
              text: g.statement,
              weight: g.weight,
              noul: CHECK_NOULS[s.case][s.variant][k] ?? 0.9,
              units: null,
              best: null,
            })),
          },
        },
        workflow: {
          metrics: {
            steps: events.length,
            toolCalls,
            errors: trouble.errors ?? 0,
            retries: trouble.retries ?? 0,
            seconds,
            costUsd,
            outside: trouble.outside ?? [],
            skillReadAt: withSkill ? 2 : null,
            firstWriteAt: firstWrite,
            skillPresent: withSkill,
            wroteOutput: true,
            maxTurns: null,
            timeoutSeconds: 300,
          },
          jev: {
            followedTask: trouble.followed ?? (s.variant === 'hype' ? 0.58 : 0.91),
            recovered: trouble.errors ? 0.83 : null,
          },
        },
      },
    }
    const scored = scoreResult(base, cfg, scorers)
    results.push({ ...base, ...scored })
  })

  const meta: RunMeta = {
    name,
    skillPath: dir,
    skillVersion: spec.version,
    skillName: spec.versionName,
    skillHash: skillHash(skillFiles(dir)),
    note: spec.note,
    writer: { engine: 'claude', model: spec.model, effort: 'default', harness: 'agent' },
    configuration: spec.configuration,
    baselineDir: null,
    cases: [...new Set(spec.samples.map((s) => s.case))],
    samplesPerCase: Math.max(...counts.values()),
    createdAt: new Date(started).toISOString(),
    finishedAt: new Date(started + spec.samples.length * 21_000 + 30_000).toISOString(),
    samples: metas,
  }
  writeJson(join(root, 'run.json'), meta)
  writeJson(join(root, 'report.json'), {
    createdAt: new Date(started + spec.samples.length * 21_000 + 45_000).toISOString(),
    model: 'jev-1.14.0',
    inputTokens: 2400 * spec.samples.length + 371,
    seconds: 0.4,
    config: cfg,
    packs: cfg.packs,
    results,
  })
  return name
}

function saveAs(name: string, note: string, date: string): string {
  const saved = saveVersion(dir, versionsOf(dir).current, name, note)
  const file = join(dir, 'evals/versions', saved.version, 'version.json')
  const json = JSON.parse(readFileSync(file, 'utf8'))
  writeJson(file, { ...json, createdAt: `${date}T15:00:00.000Z` })
  return saved.version
}

// The skill's bench, cases and first version.
writeJson(join(dir, 'evals/bench.json'), { packs: ['generic', 'workflow'] })
for (const c of CASES)
  saveCase(
    dir,
    {
      id: c.id,
      title: c.title,
      prompt: c.prompt,
      expectedOutcome: c.expectedOutcome,
      words: [30, 120],
      images: [],
      graders: c.checks.map(([statement, weight]) => ({
        id: null,
        statement,
        weight,
        image: null,
      })),
    },
    true,
  )

writeFileSync(join(dir, 'SKILL.md'), V0)
const v0 = saveAs('First draft', 'Five rules, each with its why.', '2026-11-02')
const twice = (
  variants: Record<CaseId, [Variant, Variant]>,
  trouble: Record<string, Trouble> = {},
) =>
  CASES.flatMap((c) =>
    variants[c.id].map((variant, k) => ({
      case: c.id,
      variant,
      trouble: trouble[`${c.id}-s${k + 1}`],
    })),
  )

const r0 = writeRun({
  date: '2026-11-02',
  time: '15:12',
  version: v0,
  versionName: 'First draft',
  note: 'Both briefs, first draft',
  model: 'sonnet',
  modelId: 'claude-sonnet-5-5',
  configuration: 'with_skill',
  samples: twice({ 'launch-post': ['ok', 'ok'], 'client-email': ['ok', 'ok'] }),
})
writeRun({
  date: '2026-11-02',
  time: '15:31',
  version: v0,
  versionName: 'First draft',
  note: 'Baseline: no skill installed',
  model: 'sonnet',
  modelId: 'claude-sonnet-5-5',
  configuration: 'without_skill',
  samples: [
    { case: 'launch-post', variant: 'hype' },
    { case: 'client-email', variant: 'hype' },
  ],
})

writeFileSync(join(dir, 'SKILL.md'), V1)
const v1 = saveAs('Short sentences', 'Added one rule: short, casual sentences.', '2026-11-03')
const r1 = writeRun({
  date: '2026-11-03',
  time: '10:04',
  version: v1,
  versionName: 'Short sentences',
  note: 'Same briefs after the new rule',
  model: 'sonnet',
  modelId: 'claude-sonnet-5-5',
  configuration: 'with_skill',
  samples: twice({ 'launch-post': ['good', 'good'], 'client-email': ['good', 'good'] }),
})

// The skill file is back at v0, so the editor shows it before the rule is typed.
writeFileSync(join(dir, 'SKILL.md'), V0)

touchRecent(dir)

/** What the capture script looks for on screen. */
export const sample = {
  skill: 'brand-voice',
  /** The same two briefs, written by v0 and then by v1: the post gets sharper, the email too casual. */
  compare: [
    { a: `${r0}/launch-post-s1`, b: `${r1}/launch-post-s1` },
    { a: `${r0}/client-email-s1`, b: `${r1}/client-email-s1` },
  ],
}
