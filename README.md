# Skill Studio Design

Design and marketing source for [Skill Studio](https://github.com/milesroxas/skill-studio), the desktop app for writing and testing agent skills.

This repo holds no app code. It is kept separate so its work never runs the app's build or release pipeline.

## Contents

| Folder | What it is |
| --- | --- |
| `reel/` | The 55 s demo reel, an [OpenFilm](https://www.npmjs.com/package/openfilm) project. |
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

# 2. Film the five shots into recorder/out
node recorder/record.ts

# 3. Build the pages, sound and music, and copy the clips into reel/assets
node recorder/build.mjs all

# 4. Preview, then render the MP4
cd reel && npx openfilm open
npx openfilm render
```

The recorder runs the app on a scratch home with sample data. A stand-in `claude` CLI in `recorder/bin` answers the run shot, so filming makes no model calls.

## License

[MIT](LICENSE)
