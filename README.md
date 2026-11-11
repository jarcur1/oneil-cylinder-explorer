# New Dawn — Cylinder Explorer

A first-person browser game inside an O’Neill-inspired cylinder. Explore **Meridian Civic District**, with taller streets, a civic plaza, a public skywalk, and a 60 m tower with an accessible lobby and 42 m observation room. The promenade leads to **Greenway Commons**, with shops, a market, greenhouse, farms, and an orchard overlook. Nine residents walk the neighborhoods and viewpoints; caretaker **Mara Voss** offers a ventilation maintenance job alongside the original seed delivery. Discoveries, both jobs, and mute preference save locally. Built with vanilla JavaScript, Three.js, and Vite; no account, API keys, or external art downloads.

## Run

Requires Node.js **22.12+** and a desktop browser supporting WebGL 2, such as current Chrome, Edge, or Firefox. Internet access is needed for the first dependency installation, not for gameplay.

**Windows:** double-click `start-demo.cmd`. It installs missing dependencies and opens the browser. Keep the terminal open; press Ctrl+C there to stop the server.

**Any platform:** from this folder:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). Do not open `index.html` directly. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## Controls

| Input                          | Action                                               |
| ------------------------------ | ---------------------------------------------------- |
| WASD                           | Walk                                                 |
| Mouse                          | Look, after clicking Enter / Resume                  |
| Shift                          | Sprint                                               |
| Space                          | Jump                                                 |
| E                              | Talk / service / collect / deliver / ride lifts      |
| M / Sound button               | Mute or unmute all audio                             |
| Escape                         | Pause and release the mouse                          |
| Arrow keys                     | Look without mouse capture                           |
| Left-click + drag on the scene | Look if mouse capture is unavailable                 |
| Wheel / Page Up / Page Down    | Scroll the job cards, including while mouse-captured |

Choose **Enter Meridian** to start at the city entrance, or **Or start in Greenway Commons** for the original landing. In Greenway, follow the promenade into **Market square**, take the east lane to **Glasshouse 01**, and follow the ORCHARD sign west to the stepped **Orchard overlook**. The Habitat Walk records three stops in each neighborhood, with height checks for the raised viewpoints. Its hints point to the nearest unvisited destination.

The pause menu offers both neighborhood entrances without erasing discoveries or a carried seed crate. Switching away pauses gameplay, residents, world animation, and sound. Gravity remains constant.

## Meridian Civic District

Continue north along the promenade from Greenway to Meridian, or choose its entrance in the intro/pause menu. Seven authored surrounding buildings frame a plaza, side streets, planted avenues, and the taller civic tower. Other buildings are exterior-only; their marked entrances do not unlock or require collecting passes.

From **Meridian plaza**, take the east street, then turn north through the tower's open south doorway. Approach the illuminated lift pad and press **E** to reach the **Skyroom**, 42 m above the hull. Walk around its glazed observation lounge; return to the pad and press **E** for the ground lobby.

The separate street lift is on the north cross-street, east of the promenade. **E** takes you to the **9 m Skywalk**, a railed viewing terrace with two connected deck segments. Return to its pad and press **E** to descend. Ground pedestrians can pass underneath.

Lifts deliberately use instantaneous travel behind a short fade, not moving cabins. They require a grounded player within 2.8 m of the correct landing and cannot activate from the air, another floor, or while paused. Discovery and carried cargo survive travel. Raised slabs have underside/ceiling collision; falling onto a deck cannot skip through it, and the player's physical collision radius stays constant upstairs. Curved tower and bridge geometry matches their arc-coordinate footprints.

## Mara and Skywalk ventilation

Find **Mara Voss**, the high-visibility caretaker on the west side of Meridian plaza. Approach on foot and press **E** to speak with her and accept the job. The conversation closes when you walk away, pause, or after 14 seconds of game time; **E** nearby gives a reminder.

Take the street lift to the **9 m Skywalk**, follow its east branch north past the planter, and approach the ventilation unit using the clear west-side passage. Press **E** when prompted to reset its breaker. The intake fan starts spinning and its red status lamp turns green. Return to Mara and press **E** to report completion. The Civic Maintenance card tracks acceptance, repair, and reporting.

Inspecting the unit before accepting does not repair it. Interactions require a grounded player within 2.8 m and within 0.4 m of the correct floor; you cannot service it from the street underneath or while jumping. Repair and completion survive reloads, including the running fan and green indicator. Residents remain non-solid: a citizen circles the plaza, a delegate enters/exits the tower lobby through its doorway, and visitors pause at the Skywalk and Skyroom views.

## A small favor

Find the amber-marked collection table just east of the square’s south approach. Walk close and press **E** to collect the heritage seed crate. You will see it in your hands and in the inventory indicator. Follow the east lane into **Glasshouse 01**; the receiving desk is on the right, between the planter beds. Approach it and press **E** again to deliver.

The Neighborhood Job card shows the seed destination, distance, and progress. Delivery requires being grounded within 3.2 m, with feet no more than half a metre above the hull. Completion is one-time per saved game. The six-stop Habitat Walk stays active alongside both jobs. Narrow windows stack the cards; wheel and Page Up/Page Down scroll them even with the mouse captured.

## Local saves

Discoveries use stable landmark IDs. Seed delivery saves its available/carrying/complete phase; maintenance saves acceptance, repair, and reporting; mute preference is restored before entering without starting audio. A carried crate reappears when you enter, not over the intro or pause screen. Saving happens on actual progress/preference changes and page exit, not every frame.

Progress belongs to this browser and URL origin, using the versioned `new-dawn.save.v1` localStorage record. Different browsers, devices, ports, and development/preview URLs do not share saves. Player position and resident route positions are not saved: choose either neighborhood entrance when returning. Saved progress stays in the browser, not in the source repository.

**Start a new game** in the pause menu asks for confirmation, clears discoveries and both jobs, and keeps your mute preference. Invalid/incompatible save data is normalized or reset with a **Save recovered** notice. If storage access or writing fails, **Saving unavailable** is shown; the current game remains playable but changes may not survive reload.

## Lighting and sound

Both districts have fixed warm habitat daylight, soft static building shadows, curved contact shading, and cooler distance haze. One 2048 × 2048 sunlight shadow map covers both neighborhoods and is cached after the first frame; residents and animated machinery are excluded from that bake to avoid ghost shadows. Residents use moving soft contact footprints. Four Greenway lights and two tower interior lights add warmth without additional shadow maps or full-screen post-processing.

Procedural Web Audio supplies quiet ventilation wind, irrigation water near the canal, pump hum near the utility yard, and footsteps while moving on the ground. Wind is damped inside the glasshouse. No audio files, microphone access, or external services are used.

Sound starts only after entering. Press **M** or use **Sound** to mute; the saved preference also applies on the intro screen. Pause/blur suspends the audio clock, with short gain fades on ordinary mute/pause. Unmuting while paused does not start playback. If playback is blocked, **Enable Sound** retries from your gesture; unsupported Web Audio is shown as **Sound N/A** while the game remains playable.

## Build and test

```sh
npm test
npm run build
npm run preview
```

The production files are in `dist/`. Serve that folder with an ordinary static web server. The development and preview servers bind only to the local machine.

## Where to iterate

- `src/habitat.js`: cylinder radius, length, spawn point, eye height, gravity.
- `src/world.js`: background landscape, beacons, and district integration. Clears procedural scenery from both hand-built neighborhoods and combines solid collision footprints.
- `src/village.js`: neighborhood buildings, market square, orchard, steps, overlook, and furniture.
- `src/farm.js`: greenhouse interior, crop rows, irrigation crossings, utility yard, animated rotor and pump.
- `src/city-streets.js`: seven civic blocks, streets/plaza, instanced avenue furniture and trees, and wayfinding.
- `src/city-tower.js`: accessible lobby/Skyroom, landmark silhouette, elevated viewing terraces, and lift structures.
- `src/city-layout.js` and `src/city-transit.js`: fixed city bounds/landmarks and height/range-gated lift destinations.
- `src/civic-primitives.js`: shared curved radial solids and procedural facade textures.
- `src/atmosphere.js`: static sunlight/shadow cache configuration, local lights, fog, and procedural contact shading.
- `src/soundscape.js`: lazy audio graph, location-aware ambience, footsteps, and serialized pause/mute lifecycle.
- `src/residents.js`: nine walking routes, shared character models, altitude-aware gait and viewpoint dwells, and stationary caretaker Mara.
- `src/delivery.js` and `src/delivery-layout.js`: delivery state, station coordinates, prompts, and pickup/carried/received crate props.
- `src/maintenance-state.js`, `src/maintenance.js`, and `src/maintenance-layout.js`: caretaker conversations, maintenance progression/guards, unit location, fan and indicator visuals.
- `src/save-game.js`: versioned local progress, discovery filtering, and explicit storage failure/recovery status.
- `src/surface.js`: shared curved paving, surface-aligned boxes, instancing transforms, and canvas-texture signs.
- `src/district-layout.js`: reserved district bounds, walking-route destinations, discovery radii, and hints.
- `src/player.js`: cylindrical movement, camera/input, stepping, elevated floor/wall/ceiling collision, and pose changes for lifts. `getState(target)` fills a reusable caller-owned snapshot.
- `src/main.js`: game loop, pause state, district discovery, interaction input, HUD, and renderer.
- `src/style.css` and `index.html`: interface.
- `tests/residents.test.js`: visible gait continuity, raised-floor placement, viewpoint stops/resume, and caretaker position.
- `tests/player.test.js`: raised-deck fall capture, overhead clearance, constant physical collision size upstairs, underpass traversal, and existing step behavior.
- `tests/maintenance.test.js` and `tests/save-game.test.js`: maintenance transitions, range/floor/airborne guards, fan/indicator behavior, saved progress/completion, and corrupt/unavailable storage handling.

Coordinates use the Y axis along the cylinder. At angle `theta` and height `h` above the hull:

```text
position = ((radius - h) * sin(theta), y, -(radius - h) * cos(theta))
up       = (-sin(theta), 0, cos(theta))
```

The habitat is deliberately compact: **360 m diameter × 900 m long**, so curvature is immediately visible. This is a game environment, not an accurate rotating-frame simulation: constant 1 g outward gravity, stationary scenery, fixed approximate daylight, and cached static shadows. There are no Coriolis forces, orbital mechanics, or crop-growth/economic simulation. Residents are non-solid figures on scripted routes with authored stops; Mara has a small scripted conversation, not dialogue AI. The running fan is a visible maintenance outcome, not a fluid simulation. Glasshouse 01 and the civic tower's lobby/Skyroom are accessible; other buildings are exterior-only. Collision uses arc-coordinate prisms with elevated undersides, not triangle-level physics. Foliage, beacon supports, and water remain non-solid; city trunks, equipment, and public railings are solid. Keyboard/mouse only; no touch controls.

## Verification

The district’s complete three-stop route was walked with real Chromium keyboard input, including entering the glasshouse and climbing the overlook. A temporary scenario exercised the actual world collision data: both glasshouse doorways, side-wall blocking, canal bridge support (0.12 m), overlook stair ascent/descent (2.16 m), and deck railing blocking. Ray casts confirmed that paving remains above the faceted hull and the overlook benches sit above the deck (seat top 2.73 m). A separate scenario verified walking and sprinting up 0.18 m steps without changing the controller. Verification helpers are removed before delivery.

The seed job was exercised in Chromium with real input: far-away and paused E presses did nothing; pickup showed the carried crate; pause hid it; returning to the landing point preserved cargo; delivery completed once and removed it from your hands. A temporary scenario checked state transitions, range and height/grounded guards, angular wrapping, and two minutes of resident route clearance against actual world solids. The corrected receiving sign and deposited crate were inspected in the rendered scene, and compact HUD cards were measured and viewed at 375 × 600 without overlap.

The atmosphere pass was checked with actual WebGL rendering: one 2048-pixel shadow map, four local lights, cached later frames, and no dynamic meshes casting into the static bake. Native audio-output instrumentation verified nonzero, unclipped signals, indoor wind damping, no context before entering, no idle/airborne footsteps, muted movement silence, and a stopped clock while paused. A temporary scenario delayed real native resume/suspend completions to exercise rapid pause/mute/resume changes and disposal; latest requested state won. Unsupported audio and narrow controls were also exercised. Temporary verification pages are removed before delivery.

The city update was walked in the production build with real Chromium keyboard input: plaza, tower lobby, 42 m Skyroom, both skywalk branches, street lift, and ground underpass. Exploration reached 6/6 and seed delivery 2/2 without browser errors. Carried cargo persisted across entrance shortcuts and tower lift trips; pausing mid-trip held the floor and suspended audio, then resumed successfully. A temporary actual-world scenario checked finished-floor ray hits, raised-deck support and rail blocking, residential-canopy head clearance, solid city trunks, lift height/range/airborne guards, and the one-shadow-light/six-local-light budget. That page was removed. At 375 × 600, header controls and HUD cards did not overlap, and the intro's loading notice remained reachable by scrolling.

The inhabited-city update passes **26 Node tests** and a production Chromium playthrough. Maintenance reached 3/3, delivery 2/2, and discovery 6/6; all restored after reload, as did mute and an in-progress carried crate. Native Web Audio instrumentation observed no context before entry, real activation after unmuting, and a stopped clock while paused. New Game cancellation preserved progress; confirmation cleared both jobs/discoveries without the outgoing page overwriting the reset, and kept mute. Storage-denied and corrupt-save startup paths stayed playable with explicit notices. No browser errors were observed.

A temporary scenario advanced all ten characters against the actual world collision data for 7,200 frames, verified lobby entry/exit and viewpoint stops, ray-checked visible fan blades, and checked the unchanged six-local-light/one-shadow-light budget with no resident or equipment ghost casters. The page was removed. At 600 × 600, actual pointer-locked wheel and Page Up/Page Down scrolling reached the lower job card; Page Down also reached it at 375 × 600, with conversation and cards separated.

`npm run build` succeeds with the existing non-blocking bundle-size warning: 624.97 kB minified JavaScript, 169.90 kB gzipped. The checked 1440 × 900 production Skywalk view measured 60 FPS on this machine; performance varies by device and viewpoint.
