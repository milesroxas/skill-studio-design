# Mock kit

A mock Skill Studio to film or screenshot for marketing: the real app, built from a release, on a made-up home whose sample skill is [`skills/social-post`](../skills/social-post). Nothing it shows calls a model: a stand-in `claude` answers every AI action from a file, and the runs and Jev's grades are written by hand and scored by the app's own code. Jev itself is real when the app checkout's `.env` holds `TYPESAFE_API_KEY`: the editor's checks and rewrites ask it.

## What the home holds

- **social-post** in the project `skill-studio-site`: v0 (four rules) and v1 (six rules), three cases (posts for Split up, tables in Formatted and the file tree, each with its screenshot), and three runs whose outputs are real `post.md` and `post.png` files, rendered by the skill's own script. v0 scores 85 and v1 100.
- Three more skills for the Library: `unit-tests`, `pr-review` and `landing-pages`, from the app's templates.

## Requirements

- A built skill-studio checkout with no uncommitted changes in `src`, in `SKILL_STUDIO` (default `/Users/milesroxas/SITES/tools/skill-studio-video-src`). Film a release: `git worktree add <path> origin/main && cd <path> && pnpm install && pnpm build`.
- Google Chrome, ffmpeg, Node 24.
- `npm install` in this folder (playwright-core only).

## Use it

```sh
# Screenshots the cases and outputs use. Retake after a release changes those screens.
node kit/shots.mjs

# Film one: stills to check the look, then the video.
node kit/film.mjs editor-ai stills 2,10,19,31
node kit/film.mjs editor-ai video editor-ai/out/editor-ai-34s.mp4
```

Each run starts from a fresh home in `kit/.work` and serves the app on port 4471 (`PORT=`). It refuses to start when that port is taken, or when `claude` on its PATH is not the stand-in, so a real model never runs on your account.

## A new film

Make a folder beside `editor-ai` with a `scenes.mjs`:

| Export | What it is |
| --- | --- |
| `SCENES` | `[{ name, setup?(f), film(f) }]`, filmed in order with hard cuts. `setup` runs unseen. |
| `VIEW` | the window, CSS px. Default 1200 x 800 (3:2). |
| `DSF` | the scale the frame is taken at. Default 2.4, so 2880 x 1920. |
| `CROP` | `{ x, y, width, height }` of the window to keep. Default the whole window, so no popover is cut. |
| `prepare({ dir, file, home })` | edit the home before the app starts, such as rules to fix on camera |
| `open(app)` | get to the first frame before the clock stops. Default: the social-post editor. |
| `ANSWERS` | the stand-in's answers. Default `kit/answers.json`. |
| `STUB_CALLS`, `STUB_EXPECT` | how many AI calls the film makes, and which answer each must take. The film fails otherwise. |

`f` in a scene: `focus(jsExprs, { zoom, margin, pad })` (the camera moves in on those elements while everything else fades to skeleton bars in the app's greys and dims), `unfocus()` (back to the whole app at full fidelity), `settleLens()` (the lens and camera at their targets at once, for a scene's first frame after a cut), `wait(s)`, `glide(point, s, bow)`, `glideTo(jsExpr, s, { dx, dy, bow })`, `click()`, `type(text, cps)`, `key(name)`, `until(jsExpr, label)` (catches the app up unseen when Jev or the stand-in is slower than the film), `unseen(s)`, `park('right' | 'bottom')`, `offstage(side)`, `app.open(kind)` (lets the stand-in's reply of that kind go), and `page`.

The film steps the page's clock 1/60 s a frame and seeks every CSS animation to it, so a frame looks the same however long it takes to capture. It fails when a popover crosses the frame's edge. The lens is drawn over the page from the page's own rects: the app's DOM is never changed, so React and the editor behave as they do for a user.

## The stand-in's answers

`answers.json` maps each kind of AI call (`rewrites`, `refine`, `improve`, `chat`) to a list of answers. The first whose `when` is in the editor's selection answers (`"in": "prompt"` or `"system"` to match elsewhere). `rewrites` and `refine` replies are the JSON the app's schema asks for (`practice`, `direct`, `shorter` or `split`; `revision`); the others are text. An improve draft is text with the new rule in a fenced block.
