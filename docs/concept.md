# 3D mode: design sheet

A dated record of the 3D scenes on necmikural.github.io and of the "who is this?" checks. Every change to a scene's look gets a date and a reason here.

## Rules for every scene

- Procedural geometry only: no model files, image textures or web fonts. Text is drawn on canvases in the site's own 5x7 bitmap font (`src/engine/font.ts`).
- Sound: original motifs of at most 4 notes from Web Audio oscillators and noise, off until the visitor turns it on.
- No recognisable product, character or franchise: no logos, brand label designs, faces or the button layout of a known device. The copy check bans the generic words that point that way; names to avoid live only in the `PRIVATE_TERMS` secret, never in this repo.
- Every project is reachable from the rail of DOM buttons by keyboard, and the panel is a copy of the page's own article, so 3D mode shows exactly what the HTML page shows.
- Budgets: 3D mode with one scene loads at most 200 KB of gzipped JavaScript (target 180 KB), and draws no frames while idle.

## Engine (26 October 2026)

`src/main.ts` is the only script on page load. "Power on 3D mode" checks for WebGL 2 and loads `src/engine/boot.ts`, which owns everything the scenes share:

- the full-screen dialog with the toolbar (scene switcher with `aria-pressed`, Sound, Low power, Power off) and the rail;
- the project panel, a nested `<dialog>` whose heading takes focus;
- rendering on demand (`src/engine/loop.ts`), reduced motion (every tween snaps), low power (pixel ratio 1, no outlines, no antialiasing at the next power on);
- the sound engine (`src/engine/sound.ts`), the WebGL and context-loss fallbacks, and teardown.

A scene implements `Scene` in `src/engine/types.ts` (`build`, `layout`, `focus`, `insert`, `eject`, `dispose`), lives in `src/scenes/<id>.ts` and is listed in `SCENES` in `boot.ts`. Each scene is its own chunk; the choice is kept in `localStorage` as `nk.scene`.

Order: Replay Deck (default, this sheet), then Switchboard, Glovebox and Signal Box, each on its own branch and merged only when every test passes.

## Replay Deck (26 October 2026)

**Idea.** The evals in the flagship projects record model calls to cassettes and replay them in CI with no API key. Here each project is a cassette in a wall rack. Loading one into the deck lights PROPOSED, then VERIFIED: the model proposes, code checks.

**Scene.** A dark bench with a rack (one shelf per group, flagships on top) and a desk deck: a paper-coloured box with a top-loading well under a hinged lid, a dot-matrix display, two reel windows, two lamps and a round EJECT key. The camera never moves. When the view is clearly wider than tall the rack and deck stand side by side; otherwise the deck sits on top of the rack.

**Cassettes.** A dark shell and a paper label with a band in the group colour, the title wrapped at hyphens, the tag (or the group), and a 5x5 mark mirrored from a hash of the project id, so each one has its own. No brand label designs.

| Element | Colour |
|---|---|
| Bench | #2B2D2A |
| Deck body (paper) | #E8E2D3 |
| Ink, outlines | #1E1F1C |
| Display / phosphor | #10140F / #9BE36B |
| Lamps: PROPOSED / VERIFIED | #FFB000 / #4CC38A |
| Label bands: flagship, software, coursework, open source | #E8A33D, #3F7CAC, #5C9E6E, #9A8FBF |
| Highlight outline | #F0B54A |

Colour pairings kept away from because known makers use them: red with white, grey with orange, blue with silver.

**Motion.** Focus pulls a cassette out of the rack (140 ms). Loading takes about 1.1 s: the flight into the well (540 ms), the lid (110 ms), the reels (320 ms), then the lamps. A second Enter skips to the end. Eject takes about 0.5 s. With reduced motion every step is a cut and the panel opens at once.

**Sound.** Off by default; at most 4 tones per motif.

| Event | Voices |
|---|---|
| Power on | noise 80 ms, lowpass 2 kHz to 300 Hz; square 262, 330, 494 Hz, 70 ms each |
| Focus tick | square 1568 Hz, 18 ms, at most one per 60 ms |
| Lift | triangle 220 to 330 Hz, 90 ms |
| Clunk | noise 70 ms at 700 Hz; triangle 98 Hz, 120 ms |
| Motor | square 49 Hz with a 9 Hz wobble, 450 ms |
| Checked | square 587, 740, 880 Hz |
| Eject | triangle 330 to 165 Hz, 120 ms; noise 40 ms |
| Power off | square 523 to 262 Hz, 250 ms |

Review rule: no rising two-note square chime of a fourth or an octave, no melody from any game or show, no motif longer than 4 notes.

## "Who is this?" test

Show 5 people the deck and the open panel (the `deck-*.png` and `panel-*.png` screenshots in the CI `reports` artifact) and ask: "Does this remind you of any product, character or game?" If anyone names one, change the silhouette or the palette and test again. Write the answers here in general terms; if someone names something, write "named a product" or "named a character" and keep the name out of this file.

| Date | Scene | Asked | Answers | Change |
|---|---|---|---|---|
| 26 October 2026 | Replay Deck | 0 of 5 | Pending: asked Necmi to run the test | None yet |

The scene is not final until 5 people have answered with no recognitions.
