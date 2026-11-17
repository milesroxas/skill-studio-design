---
name: social-post
description: Write a social post and make its image for a Skill Studio release or feature, in Skill Studio's brand. Use when asked for a launch post, a feature announcement, an X or LinkedIn post, or a social image for Skill Studio.
---

# Social post

Write for someone who writes agent skills and has never opened Skill Studio. Read [references/brand.md](references/brand.md) before you make the image.

## Rules

- Open with what the reader can now do, in 12 words or fewer. The timeline gives a post one line to earn a stop.
- Name one feature per post. Two features split the reader's attention and neither lands.
- Keep the text under 240 characters, the link not counted. X hides longer text behind "Show more".
- Never use "excited", "game-changing" or "revolutionary". Hype makes the reader doubt the claim beside it.
- Show the screen the post is about, cropped to the part that changed. A reader believes what they can see.
- Use only the colors in references/brand.md. A color off the palette reads as someone else's post.
- Write as one colleague writes to another: plain words, no exclamation marks. A post that reads like an ad gets skipped.
- Put the version number in the image. A reader checks it before updating, and without it assumes the change already shipped.
- For a launch post, write alt text that says what the image shows. A reader using a screen reader gets the post from it.
- End the text with the link and the hashtags. A tag in the middle of a sentence breaks it.
- Put the Skill Studio mark in a corner of the image. A screenshot shared without the post still says whose it is.

## Process

1. Read the request and name the one feature the post is about.
2. Find a screenshot of that feature. If the request gives none, ask for one: never draw the app.
3. Write `post.md`: the text, then the alt text under `Alt text:`.
4. Write `post.json` (fields in [references/brand.md](references/brand.md#the-image)) and run `node scripts/render.mjs post.json`. It writes `post.png`.
5. Open `post.png` and check it against every rule above.
