# Skill Studio Design

Design and marketing source for [Skill Studio](https://github.com/milesroxas/skill-studio), the desktop app for writing and testing agent skills.

This repo holds no app code. It is kept separate so its work never runs the app's build or release pipeline.

## Contents

| Folder | What it is |
| --- | --- |
| `reel/` | The 57 s demo reel, an [OpenFilm](https://www.npmjs.com/package/openfilm) project. |
| `onboarding/` | The 14.65 s onboarding teaser, an OpenFilm project. |
| `walkthrough/` | The 66 s guided walkthrough reel, an OpenFilm project. |
| `walkthrough-visual/` | The same reel with no words of its own: 64 s, the app alone, larger. |
| `recorder/` | Scripts that film the app and build the reel's pages, cut list and sound. |

Renders, filmed clips and generated audio are not committed. The build below recreates them.

## Requirements

- Node.js 24 or later (runs the TypeScript scripts directly)
- `ffmpeg` on your `PATH`
- A built checkout of [skill-studio](https://github.com/milesroxas/skill-studio) next to this folder, or its path in `SKILL_STUDIO`

## Build the reel

```sh
# 1. Build the app
cd ../skill-studio && pnpm install && pnpm build && cd -

# 2. Film the five shots into recorder/out, with the app's tsx so its import aliases resolve
cd recorder && ../../skill-studio/node_modules/.bin/tsx --tsconfig ../../skill-studio/tsconfig.json record.ts && cd -

# 3. Build the pages, sound and music, and copy the clips into reel/assets
node recorder/build.mjs all

# 4. Preview, then render the MP4
cd reel && npx openfilm open
npx openfilm render
```

The recorder runs the app on a scratch home with sample data. A stand-in `claude` CLI in `recorder/bin` answers the run shot, so filming makes no model calls. The app reads your login shell's `PATH` and puts it first, so the recorder also hands it a stand-in shell (`recorder/bin/login-shell`), and the run shot fails if the stand-in `claude` was not the one called.

The five shots follow the app's loop: pick one of the three rewrites Suggest changes gives for a weak rule and watch it replace the rule in the editor, run the new version, see the version lift, compare two outputs word for word, then mark a verdict Jev got wrong and pick the better output. The stand-in `claude` also answers Suggest changes for that one rule.

The recorder measures every box the film's camera moves to on the screen as it is at that moment, and grows it until no line of text or control crosses its edge, so nothing the film shows is cut. Each shot's pacing is tied to its recorded clicks, so a re-film keeps it.

The recorder refuses a build of the app older than its source or with uncommitted changes in `src`. To film a release while other work sits in the app's checkout, build that release in a separate worktree and point the recorder at it with `SKILL_STUDIO=<path>`.

## Build the onboarding teaser

`onboarding/` is a 14.65 s, 1920 × 1280 (3:2) teaser of the welcome a first launch shows: the cover, the three tour steps and the three setup steps. It is sized for the contained 3:2 Stacked block on the case study.

```sh
# 1. Film the welcome window at 2x into recorder/out/onboarding (no tsx needed)
node recorder/onboarding.ts

# 2. Write the cut and the pointer's moves, and copy the take into onboarding/assets
node recorder/onboarding-build.mjs

# 3. Preview, then render
cd onboarding && npx openfilm open
npx openfilm render
```

It films a first launch on a scratch home with four sample skills, so the first setup step finds them. The stand-in `claude` answers "Connect a model", and the take fails if it was not the one asked. Jev is real: its step shows only where the key comes from, never the key. The cut in `onboarding-build.mjs` keeps every animation near its own speed and squeezes only the waits.

## Build the walkthrough reel

`walkthrough/` is a 66 s, 1920 × 1080 reel of the guided walkthrough a first launch ends on: the Thank-you note skill taken once round the loop, one shot per guide step. Each shot draws the app as quiet shapes and lifts only the part the step is about, with the step's number, title and one line under it. Lime wipes cut between steps, as in the demo reel.

```sh
# 1. Film the seven steps into recorder/out/walkthrough (about three minutes)
node recorder/walkthrough.ts

# 2. Write each step's page, data and the cut list, and copy the takes into walkthrough/assets
node recorder/walkthrough-build.mjs all

# 3. Preview, then render
cd walkthrough && npx openfilm open
npx openfilm render
```

It clicks through the welcome off camera, then films the walkthrough on one session, so each step starts where the last ended. The stand-in `claude` writes the notes: four sentences under the vague length rule, two under the exact one, so v0 scores 83 and v1 100. Jev grades them for real. The take fails if any run did not reach the stand-in. Pacing, notes and captions live in `STEPS` in `walkthrough-build.mjs`.

`node recorder/walkthrough-build.mjs all --visual` builds `walkthrough-visual/` from the same takes: no captions and no notes, the mark alone for the opening and the close, and the window and each lifted part laid out to fill the frame. Render it the same way from its folder.

## License

[MIT](LICENSE)
