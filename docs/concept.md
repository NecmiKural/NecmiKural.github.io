# 3D mode: design sheet

A dated record of the 3D scenes on necmikural.github.io and of the "who is this?" checks. Every change to a scene's look gets a date and a reason here.

## Rules for every scene

- Procedural only: no model files, image files or web fonts. Geometry and canvas drawing are made in code; text is drawn on canvases in the site's own 5x7 bitmap font (`src/engine/font.ts`).
- Sound: original motifs of at most 4 notes from Web Audio oscillators and noise, off until the visitor turns it on.
- No recognisable product, character or franchise: no logos, brand label designs, faces or the button layout of a known device. The copy check bans the generic words that point that way; names to avoid live only in the `PRIVATE_TERMS` secret, never in this repo.
- Every project is reachable from the rail of DOM buttons by keyboard, and the panel is a copy of the page's own article, so 3D mode shows exactly what the HTML page shows.
- Budgets: 3D mode with one scene loads at most 200 KB of gzipped JavaScript (target 180 KB). A scene draws no frames while idle, unless it has an ambient animation (`Stage.ambient`, the Lab's): then at most about 12 frames a second, none in a hidden tab or with low power, and none at all with reduced motion.

## Engine (26 October 2026)

`src/main.ts` is the only script on page load. "Open in 3D" checks for WebGL 2 and loads `src/engine/boot.ts`, which owns everything the scenes share. 3D mode opened on its own on desktops and tablets for part of 26 October 2026; visitors found landing in a scene without knowing where they were confusing, so it is on request again, and the HTML page gained a project list beside the content instead. The engine owns:

- the full-screen dialog with the toolbar (scene switcher with `aria-pressed`, Sound, Low power, Power off) and the rail;
- the project panel, a nested `<dialog>` whose heading takes focus;
- rendering on demand (`src/engine/loop.ts`), with an optional slow ambient tick that the engine pauses in a hidden tab and with low power, and that never runs with reduced motion; reduced motion (every tween snaps), low power (pixel ratio 1, no outlines, no antialiasing at the next power on, no ambient animation);
- the sound engine (`src/engine/sound.ts`), the WebGL and context-loss fallbacks, and teardown.

A scene implements `Scene` in `src/engine/types.ts` (`build`, `layout`, `focus`, `insert`, `eject`, `dispose`), lives in `src/scenes/<id>.ts` and is listed in `SCENES` in `boot.ts`. Each scene is its own chunk; the choice is kept in `localStorage` as `nk.scene`. Helpers the scenes share (toon materials, outlines, atlas planes, the camera fit, group colours) are in `src/engine/kit.ts`. The 3D tests run once for every file in `src/scenes`, and `check-size` budgets each scene.

Order: Replay Deck (the first default), then Switchboard, Glovebox and Signal Box, and the Lab, which became the default (all 26 October 2026), each on its own branch and merged only when every test passes. A scene can set `pixels` to render at least that many pixels across and down, in the canvas's shape (`pixelGrid` in `kit.ts`), scaled up without smoothing (the Lab uses 320 x 200).

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

## Switchboard (26 October 2026)

**Idea.** An MCP server works like a switchboard: it connects a model to one tool at a time, and a person decides which calls go through. Each project is a socket on a jack field. Choosing one plugs a cord into it, the line lamp lights, the key throws and a ticket prints with the project's tag or commit and the date.

**Scene.** A plain wooden cabinet on a desk with a black face: the jack field, one row per group (flagships on top), each row centred. Every socket has a brass rim, a lamp above it and a paper designation strip below with a band in the group colour. In front, a key shelf with two plugs in their seats, three lever keys (LINE, RING, TICKET) and a small ticket printer. The camera never moves; the whole panel is taller than wide, so it fills portrait screens, and wide screens frame the same panel.

**Ticket.** The line number, the title, where the page's numbers are quoted from (the tag, or a short commit) and the date the ticket printed, which is the visitor's date, not a release date.

| Element | Colour |
|---|---|
| Cabinet (dark wood) | #4A3426 |
| Face, plugs, keys, printer (bakelite) | #1B1B1B |
| Socket rims, key bases (brass) | #C9A227 |
| Line lamps | #FFB000 |
| Ticket and designation strips (paper) | #F3EEDF |
| Focus ring | #F3EEDF |

Kept away from: a cabinet in the shape of a known maker's board, logos or nameplates, a headset, a dial or a handset. The panel is a plain box with no crest or ornament.

**Motion.** Focus puts a ring round the socket. Plugging in takes about 1 s: the plug rises from its seat and travels along a curve into the socket (560 ms) while the cord is rebuilt along its path every frame, then the lamp lights, the key throws (100 ms) and the ticket feeds out (380 ms). Eject reverses it in about 0.4 s. A second Enter skips to the end; with reduced motion every step is a cut. Low power draws the cord with fewer segments and no cabinet outline.

**Sound.** Off by default; at most 4 tones per motif.

| Event | Voices |
|---|---|
| Plug in | noise 20 ms at 4 kHz; square 2 kHz, 20 ms |
| Line buzz | square 120 Hz, 120 ms |
| Key | noise 50 ms at 500 Hz; triangle 110 Hz, 80 ms |
| Ring | triangle 523 Hz, then 659 Hz: two short notes, not a ringing tone |
| Printer | four noise ticks at 3 kHz, 80 ms apart |
| Unplug | triangle 400 to 200 Hz, 100 ms; noise 30 ms |

## Glovebox (26 October 2026)

**Idea.** In a chemistry lab the glovebox is the sandbox: a sealed box, gloves and an airlock. It ties a chemistry degree to the code-mode sandbox, where model-written code runs sealed off and the host checks every call. Each project is a sample canister. Choosing one sends it through the airlock: the outer door shuts, the chamber purges, the gloves set the canister under the gauge, and the gauge accepts the reading.

**Scene.** A dark bench with a steel shelf unit of canisters (one shelf per group, flagships on top) and a steel glovebox: a glass front and top drawn as edges with two glints, three glove ports in a row (gloves in two, the third capped), a round airlock on the right with a yellow band and two round doors, and inside, a pressure gauge, a dot-matrix status panel and a small stage under the gauge. The camera never moves. When the view is clearly wider than tall the shelf and the glovebox stand side by side; otherwise the glovebox sits on the shelf unit, off centre.

**Canisters.** A steel body, a cap in the group colour, and a paper label with a band in the group colour, the title, where the page's numbers are quoted from (the tag or a short commit) and the canister's own mark. A chosen canister's cap lights and it slides forward.

| Element | Colour |
|---|---|
| Steel | #C9CED1 |
| Frame, shelves, doors | #8F979B |
| Glass edges | #7FA7B5 |
| Safety yellow (gauge rim, airlock band, door wheel) | #F2C230 |
| Ink, gloves | #1C2326 |
| Lit cap | #FFF3C4 |

Kept away from: a face. An early draft had two ports with the gauge above them, which read as a pair of eyes when the box sat on the shelf in portrait; it now has three ports in a row, the gauge and stage off centre, and the box off centre on the shelf. No logos or maker plates, and no warning symbols copied from real labels.

**Motion.** Loading takes about 1.6 s: into the airlock (420 ms), the outer door shuts, the needle drops while the chamber purges (300 ms), the canister slides through the inner door, the gloves reach for it and carry it to the stage (380 ms), and the needle swings into the green band. Eject goes the same way back, shortened, in about 1 s. A second Enter skips to the end; with reduced motion every step is a cut. Low power builds the arms with fewer segments.

**Sound.** Off by default; at most 4 tones per motif.

| Event | Voices |
|---|---|
| Door | noise 60 ms at 400 Hz; square 70 Hz, 120 ms |
| Purge | noise 320 ms, lowpass 6 kHz to 800 Hz |
| Glove | square 880 to 1100 Hz with a wobble, 80 ms |
| Gauge tick | square 2.4 kHz, 10 ms |
| Accepted | triangle 659, 831, 988 Hz |
| Slide | noise 200 ms, lowpass 1.5 kHz to 600 Hz |

## Signal Box (26 October 2026)

**Idea.** A model-railway signal box. Each project is a lever. Pulling one sets a route: the interlocking checks it lamp by lamp, the signal arm drops and a short train runs to that project's platform. The interlocking checks the route before anything moves, as code checks a proposal before it is accepted; the train is a nod to streams of data, and to Hamilton as a rail junction.

**Scene.** In front, a wooden lever frame with one lever per project, a numbered plate under each, and a shelf with a block display and five route lamps. Behind it, a small yard on farmland under a warm sky: a main line that fans into one siding per group (flagships nearest), a signal where each siding leaves the fan, and a platform with a board (number, name, tag or commit) for every project. Low-poly trees stand round the yard. The camera never moves. When the view is clearly wider than tall the tracks run across the view; otherwise the yard turns so they run away from the frame, sidings side by side, and the boards turn to face the frame.

**Levers.** The usual lever colour code by group: flagship red, software black, coursework yellow, open source blue. A chosen lever's handle lights.

| Element | Colour |
|---|---|
| Ballast | #6B6660 |
| Rails | #3A3A3A |
| Grass | #7FA65A, varied per vertex |
| Sky | #F6C28B to #7AA6C2 |
| Lever frame | #5A4330 |
| Levers | #B33A2E, #1E1F1C, #E0B32E, #2F6DB5 |
| Locomotive and wagons | #3D5560 with #E9E2CF; #B0743A; #7D8288 |

Kept away from: any railway's livery or logos, a locomotive with a face, and the colour scheme of any well-known toy train. The locomotive is a plain two-tone shunter with two open wagons. The window of a real signal box was left out: the frame in the foreground does that job.

**Motion.** Pulling a lever takes about 1.6 s to the panel: the lever (150 ms), the five route lamps (275 ms), the signal arm (160 ms), and the train's run along the route's spline to the platform (1 s). Eject backs the train out to the shared stretch of line (700 ms) and returns the signal, lamps and lever. A second Enter skips to the end; with reduced motion every step is a cut. Low power hides the trees and sleepers.

**Sound.** Off by default; at most 4 tones per motif.

| Event | Voices |
|---|---|
| Lever | noise 60 ms at 600 Hz; triangle 90 Hz, 120 ms |
| Interlocking | square 1 kHz, 8 ms, once per lamp |
| Points | noise 50 ms at 300 Hz; square 60 Hz, 80 ms |
| Horn | square 392 and 466 Hz together, 250 ms |
| Running | eight noise chuffs that come closer together |
| Arrived | triangle 784 Hz, then 659 Hz |

## Lab (26 October 2026), the default

**Idea.** A chemistry lab, for a chemistry background. Each project is a sample flask on the shelves, one shelf per group. Choosing one takes it to the distillation rig on the bench: its liquid runs through the glass tubing into the boiling flask over a Bunsen burner, through the condenser coil, and drips into the receiver; then the CRT prints the assay and the panel opens. A distillation ends in a measured product, the way the projects' numbers come from runs that can be replayed.

**Version 2 (26 October 2026).** The first Lab was a few 3D boxes and read as plain and empty. Version 2 is a dense, lived-in lab at night, drawn as an 80s pixel-art game.

**Look.** A 2D canvas drawn in code (`src/scenes/lab/art.ts`) at at least 320 x 200 pixels in the canvas's shape, shown 1:1 on a plane facing an orthographic camera and scaled up by the browser without smoothing; invisible planes over the flasks carry the project ids for pointer picking. In the room:

- a brick wall at night, with magenta and teal neon tubes whose light spills down it;
- pipes along the top and down one side, with joints and a valve, and cables hanging between them;
- a generic periodic-table poster (coloured cells by block, no text), a DANGER sign and the biohazard symbol;
- shelves of project flasks with books and spare glassware beside them, barrels and a crate below;
- an oscilloscope with a moving trace, a CRT with a scrolling waveform and bars (or the assay), a test-tube rack;
- the rig: boiling flask on a ring over a flickering burner, a slanting condenser with a coil inside, tubing and the receiver;
- steam rising, bubbles in the flasks, now and then sparks from a cable joint;
- a tiled floor, and over everything faint scanlines and a vignette;
- on a tall grid, glass-fronted wall cabinets and a vent above; on a wide one, lockers and gas cylinders at the sides.

It matches the profile README's banner: the flagship samples take the banner's accent for the visitor's colour scheme (#C2410C light, #FB923C dark); the room is dark in both, so lettering, the HUD's corner brackets and the selection take #FB923C. All text is the banner's 5x7 glyphs.

**HUD.** A framed game UI with real data only: the lab's name, "13 PROJECTS" with a flask icon, "3 FLAGSHIPS" with a gem, "LAB OPEN", and for the sample on the rig (else the one pointed at) its title, group, release tag or commit, and ASSAY RUNNING then ASSAY DONE. No score, lives or level. The HUD's text is on the canvas as `data-caption`, for the tests.

**Interaction.** The flask under the pointer or keyboard focus glows, with selection corners that pulse. Every project is also a rail button, as in every scene.

| Element | Colour |
|---|---|
| Banner accent: flagship samples in the light and dark scheme | #C2410C, #FB923C |
| Banner accent, lighter: lettering, HUD brackets, selection | #FB923C |
| Neon tubes | #FF3FD0 magenta, #2FF5E0 teal |
| Other samples: software, coursework, open source | #4AA8FF, #57E389, #C08CFF |
| CRT green, dim green, amber | #39FF6A, #145C2A, #FFB000 |
| Wall, mortar | #151A2C, #0F1220 |
| Wood, glass, terminal housing | #6B4A33, #B9E4EF, #C9B98F |

Kept away from: a face and any character. There is no character (decided with Necmi). The biohazard symbol is drawn with thin strokes, because filled blobs read as two eyes over a mouth at this size. The CRT's power light and the oscilloscope's knobs sit off to one side. No game's sprites, fonts or sounds, and no traced references.

**Motion.** About 1.6 s: the flask flies to the rig in an arc (450 ms), the liquid runs through the tubing and condenser (500 ms), three drops fall (330 ms), the CRT types the assay (300 ms). Putting it back takes 400 ms. A second Enter skips to the end; with reduced motion every step is a cut. The room's ambient animation runs at 12 frames a second (neon flicker, flame, traces, bubbles, steam, sparks, the selection's pulse), rests in a hidden tab and with low power, and with reduced motion the room is a still picture.

**Sound.** Off by default; at most 4 tones per motif.

| Event | Voices |
|---|---|
| Lift | square 330 to 660 Hz, 60 ms |
| Pour | noise through a 1800 Hz lowpass, 180 ms |
| Drip | triangle 1320 to 990 Hz, 40 ms, once per drop |
| Assay | square 587, 740, 659, 880 Hz |
| Put back | square 660 to 330 Hz, 80 ms |

## "Who is this?" test

Show 5 people the scene and the open panel (the `<scene>-light.png`, `<scene>-dark.png` and `<scene>-panel-*.png` screenshots in the CI `reports` artifact) and ask: "Does this remind you of any product, character or game?" If anyone names one, change the silhouette or the palette and test again. Write the answers here in general terms; if someone names something, write "named a product" or "named a character" and keep the name out of this file.

| Date | Scene | Asked | Answers | Change |
|---|---|---|---|---|
| 26 October 2026 | Replay Deck | 0 of 5 | Pending: asked Necmi to run the test | None yet |
| 26 October 2026 | Switchboard | 0 of 5 | Pending: asked Necmi to run the test | None yet |
| 26 October 2026 | Glovebox | 0 of 5 | Pending: asked Necmi to run the test | None yet |
| 26 October 2026 | Signal Box | 0 of 5 | Pending: asked Necmi to run the test | None yet |
| 26 October 2026 | Lab | 0 of 5 | Pending: asked Necmi to run the test | None yet |

A scene is not final until 5 people have answered with no recognitions.
