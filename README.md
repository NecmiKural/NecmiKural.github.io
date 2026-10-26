# NecmiKural.github.io

Source of https://necmikural.github.io: one static HTML page that works with JavaScript off, mirrored to the Hugging Face Space `necmikural/portfolio`. On desktops and tablets the page opens into a 3D mode with the same projects once the HTML has painted. Phones, visitors who prefer reduced motion or use Save-Data, browsers without WebGL 2, and anyone who powered 3D mode off stay on the HTML page, with an "Open in 3D" button. The page is complete without 3D mode.

## Where the words come from

`content/portfolio.json` and the icons in `public/assets/icons/` are copies of files in [NecmiKural/NecmiKural](https://github.com/NecmiKural/NecmiKural). There, `content/portfolio.toml` is the source, and its CI checks weekly that every quoted number is still word for word in the project's README at the linked tag or commit.

Do not edit the copies. Change the TOML in that repo, run its build, push, then run `npm run sync-content` here and commit. CI compares the copies byte for byte with that repo's `main` on every push and every Monday, and fails if they differ.

The three flagship visuals are fetched at build time from their repos at the pinned tag or commit, and served from this site.

## Commands

Node 24 (`.nvmrc`).

```bash
npm ci
npm run dev            # local server
npm run build          # dist/, fetches the visuals
npm run check          # types and the copy check over the repo and dist/
npm run size           # budgets: index.html under 14 KB gzip, entry JS under 2 KB, 3D mode under 200 KB per scene, og.png 1200x630
npm test               # Playwright: the page in Chromium, Firefox and WebKit; 3D mode in Chromium
npx lhci autorun       # Lighthouse, mobile
npm run og             # redraw public/og.png after the name, headline or flagships change
npm run sync-content   # copy the content file and icons from the profile repo
```

The copy check looks for em and en dashes, generic banned phrases, email and phone patterns, and private terms. Private terms come from the `PRIVATE_TERMS` secret or a gitignored `.private-terms` file, one per line, and are reported by number only.

## 3D mode

`src/main.ts` is the only script the page loads (under 2 KB gzip). It decides whether to open 3D mode on its own (not on phones, which it takes to be narrower than 600 px or a touch screen whose short side is under 600 px; not with reduced motion, Save-Data or a stored `nk.3d=off`), waits for the load event and two frames so the HTML page paints first, skips it if the visitor has already started on the page (arrived at a project's link, scrolled, moved focus, or opened or closed 3D mode), checks for WebGL 2 and loads the engine in `src/engine/` (three.js, the dialogs, sound, rendering on demand), which builds the scene from the page's own articles; the panel shows a copy of the article. Each scene is a chunk of its own in `src/scenes/`: the Replay Deck (the default), the Switchboard, the Glovebox and the Signal Box, chosen in the toolbar. Everything is procedural: no model files, image textures or web fonts.

Design notes, colours, sound motifs and the "who is this?" test log are in [docs/concept.md](docs/concept.md).

## CI (`.github/workflows/site.yml`)

On every push, pull request and weekly:
- the content copies match the profile repo;
- the copy check and the size budgets pass;
- Playwright: with JavaScript off, every project, claim and profile link is on the page; at 320, 768, 1024 and 1440 px in light and dark, nothing overflows, the intro is above the fold and axe finds no WCAG 2.2 AA violations;
- Playwright, 3D mode (Chromium, WebGL in software), for every scene: every project opens from the rail by keyboard and Escape steps back out; the focus order; no model, image or font requests; no frames while idle; reduced motion; sound off by default; no WebGL 2 and a lost context; axe with the deck and a project open;
- Playwright, opening on its own: a desktop opens 3D mode after the page has loaded and painted, and a power-off sticks; phones (portrait and sideways) and a 599 px window stay on the HTML page, a 600 px window opens; reduced motion, Save-Data, no WebGL 2, a failed load (silently), a project's link and an early focus move keep the HTML page; an early open gives one deck, and an early power-off stays off;
- Lighthouse mobile: Performance 95 or more, Accessibility, Best Practices and SEO 100;
- lychee finds no broken links (LinkedIn is skipped because it blocks bots).

On a push to `main`, the `deploy` job publishes `dist/` to GitHub Pages, and the `space` job uploads the same files to the Space. That job skips its steps until `HF_TOKEN` exists in the `hugging-face` environment. To turn it on:
1. Create the static Space `necmikural/portfolio` on Hugging Face.
2. Create a fine-grained token with write access to that Space only.
3. Add it: `gh secret set HF_TOKEN --env hugging-face -R NecmiKural/NecmiKural.github.io`.

## Licence

The code is MIT (`LICENSE`). The portfolio text and images are not covered.
