# New Dawn — Cylinder Explorer

A first-person browser game inside an O’Neill-inspired cylinder. Start at **Endcap A**, take a radial lift to a low-gravity maintenance hub, and ride an **820 m axial service trolley** to repair part of the habitat’s artificial sunline. Isolating SL-02 dims **Greenway Commons** to emergency lighting; restore it to bring daylight back and hear the market merchant’s response. Explore **Meridian Civic District**, its 42 m Skyroom, public Skywalk, and enclosed service level 8 m beneath the living surface. Nine residents walk the neighborhoods; discoveries, three jobs, and mute preference save locally. Built with vanilla JavaScript, Three.js, and Vite; no account, API keys, or external art downloads.

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
| WASD                           | Walk; W/S drive/reverse while aboard the trolley      |
| Mouse                          | Look, after clicking Enter / Resume                  |
| Shift                          | Sprint outside secured axial areas                   |
| Space                          | Jump outside secured axial areas                     |
| E                              | Talk / service / cargo / lifts / board or dock        |
| M / Sound button               | Mute or unmute all audio                             |
| Escape                         | Pause and release the mouse                          |
| Arrow keys                     | Look without mouse capture                           |
| Left-click + drag on the scene | Look if mouse capture is unavailable                 |
| Wheel / Page Up / Page Down    | Scroll the job cards, including while mouse-captured |

Choose **Enter Endcap A** for the new maintenance route, **Or visit Meridian** for the city entrance, or **Or start in Greenway Commons** for the original landing. In Greenway, follow the promenade into **Market square**, take the east lane to **Glasshouse 01**, and follow the ORCHARD sign west to the stepped **Orchard overlook**. The Habitat Walk records **11 stops**: six neighborhood landmarks, two utility rooms, both endcap hubs, and the sunline service station. Discoveries require the correct floor and physical proximity.

The pause menu offers Endcap A and both neighborhood entrances without erasing discoveries or a carried seed crate. Switching away pauses gameplay, residents, world animation, and sound. Local at-rest gravity is shown in the HUD; negative height is labeled **DOWN** relative to the living surface.

## Endcaps and sunline maintenance

At **Endcap A rim access**, approach the marked pad and press **E**. The radial lift arrives in an enclosed maintenance hub **170 m above the living surface**, only **10 m from the spin axis**. Its at-rest gravity is **0.056 g**. Magnetic boots secure your feet: WASD walks slowly, with no sprinting or jumping. The return pad brings you back to the **1.000 g** rim.

The **Sunline Engineering** card tracks a three-step job:

1. Approach either hub’s isolation console and press **E** to isolate **SL-02**.
2. Board at the marked gate with **E**. **W** drives toward the opposite endcap; **S** reverses. Stop at the SL-02 service station and press **E** to install the spare emitter carried aboard.
3. Reach either endcap, press **E** at the dock to disembark, and use its console to restore power.

The trolley travels the full **820 m** between Endcaps A and B. Looking does not steer; strafe, sprint, and jump do not detach you from the rail. Disembarking is possible only at the end docks. Secured hub bounds, corridor walls, and a continuous overhead roof keep the route on the habitable side of the axis. Transfers use the existing short fade rather than animated lift cabins.

The artificial axial luminaire has **nine visual sections** spanning 892 m. Only the assigned SL-02 section goes dark while isolated or awaiting restoration; its casing remains visible, the other eight sections stay lit, and the spare/installed emitter props follow the job. Both endcap console faces and the Sunline Engineering card report **Greenway Commons · DAYLIGHT ONLINE** or **EMERGENCY LIGHTING**. Other machinery labels remain scenery.

### Greenway feels the repair

SL-02 is the logical daylight feed for **Greenway Commons**. Isolation fades its surface daylight down over **1.2 seconds**, leaving the existing warm lamps, glowing signs, and windows visible. Installing the emitter alone does not restore daylight; the endcap console completes the circuit. Restoration fades daylight back in. The effect follows world-space district bounds, including terrain, instanced scenery, moving residents, and carried cargo, with a soft boundary. Meridian, the opposite circumference, underground service lighting, and axial hubs are not blacked out. This is an authored lighting consequence, not accurate light transport or electrical simulation.

Find **Nia Sen**, the straw-hatted market merchant in a terracotta shirt, walking around **Market square**. Approach within **3 m** on the living surface and press **E**. She comments on scheduled work, emergency lighting, a replacement awaiting power, and restored daylight. She keeps walking; the conversation follows her current location and closes when you move away, pause, or after 14 seconds. Her response comes from the existing repair phase, with no extra job or save field.

Reloading an isolated or replaced job starts with emergency lighting already applied; completed repairs start in daylight. Existing completed saves remain completed. To demonstrate the whole outage again, use **Start a new game** and confirm the reset of discoveries and all three jobs.

## Meridian Civic District

Continue north along the promenade from Greenway to Meridian, or choose its entrance in the intro/pause menu. Seven authored surrounding buildings frame a plaza, side streets, planted avenues, and the taller civic tower. Other buildings are exterior-only; their marked entrances do not unlock or require collecting passes.

From **Meridian plaza**, take the east street, then turn north through the tower's open south doorway. Approach the illuminated lift pad and press **E** to reach the **Skyroom**, 42 m above the living surface. Walk around its glazed observation lounge; return to the pad and press **E** for the ground lobby.

The separate street lift is on the north cross-street, east of the promenade. **E** takes you to the **9 m Skywalk**, a railed viewing terrace with two connected deck segments. Return to its pad and press **E** to descend. Ground pedestrians can pass underneath.

Lifts deliberately use instantaneous travel behind a short fade, not moving cabins. They require a grounded player within 2.8 m of the correct landing and cannot activate from the air, another floor, or while paused. Discovery and carried cargo survive travel. Raised slabs have underside/ceiling collision; falling onto a deck cannot skip through it, and the player's physical collision radius stays constant upstairs. Curved tower and bridge geometry matches their arc-coordinate footprints.

## Beneath Meridian

Find the **Meridian Service Access** pavilion west of the promenade, just southwest of the plaza. Enter its open south doorway and press **E** at the marked lift pad. The lift lands **8 m below** the living surface, facing north along the enclosed utility corridor. Follow the cyan line north and turn west into the **water plant**, or follow the amber line north and turn east into the **power room**. Return south to the marked pad and press **E** to reach the pavilion again, facing its exit.

The water plant has recirculation tanks, sight glasses, pump skids, and spinning impellers. The power room has transformers, busbars, a battery cabinet, and spinning cooling fans. Pipes, a cable tray, structural ribs, ceiling fixtures, and interior signs make the route legible. Exterior walls, ceilings, overhead beams, and major equipment are solid. The marked north bulkhead is closed, not another usable exit. These rooms add two discoveries, not an additional job; machinery labels are scenery rather than live engineering telemetry.

The underground camera uses a separate lighting layer with four non-shadow-casting lights. Surface daylight and the service lighting are never active together. Carried cargo is visible under either lighting set, and pausing holds an in-progress lift trip. The lift uses the same short fade and grounded/range/height guards as the city lifts.

At a fixed spin rate, apparent gravity is proportional to radius. With inward height `h` measured from the living surface, the controller applies **`g(h) = 9.81 × (180 − h) / 180` m/s²**. The surface is **1.000 g**, the −8 m service floor **1.044 g**, the +42 m Skyroom **0.767 g**, and the +170 m axial floor **0.056 g**. Ordinary jump acceleration changes accordingly: the same launch is shorter below ground and higher upstairs. The HUD reports gravity at rest at the character’s feet, not the total force during motion. Magnetic boots and the trolley impose mechanical movement constraints. Coriolis forces and free-flight angular-momentum effects remain deferred.

## Mara and Skywalk ventilation

Find **Mara Voss**, the high-visibility caretaker on the west side of Meridian plaza. Approach on foot and press **E** to speak with her and accept the job. The conversation closes when you walk away, pause, or after 14 seconds of game time; **E** nearby gives a reminder.

Take the street lift to the **9 m Skywalk**, follow its east branch north past the planter, and approach the ventilation unit using the clear west-side passage. Press **E** when prompted to reset its breaker. The intake fan starts spinning and its red status lamp turns green. Return to Mara and press **E** to report completion. The Civic Maintenance card tracks acceptance, repair, and reporting.

Inspecting the unit before accepting does not repair it. Interactions require a grounded player within 2.8 m and within 0.4 m of the correct floor; you cannot service it from the street underneath or while jumping. Repair and completion survive reloads, including the running fan and green indicator. Residents remain non-solid: a citizen circles the plaza, a delegate enters/exits the tower lobby through its doorway, and visitors pause at the Skywalk and Skyroom views.

## A small favor

Find the amber-marked collection table just east of the square’s south approach. Walk close and press **E** to collect the heritage seed crate. You will see it in your hands and in the inventory indicator. Follow the east lane into **Glasshouse 01**; the receiving desk is on the right, between the planter beds. Approach it and press **E** again to deliver.

The Neighborhood Job card shows the seed destination, distance, and progress. Delivery requires being grounded within 3.2 m, with feet no more than half a metre above the living surface. Completion is one-time per saved game. The 11-stop Habitat Walk stays active alongside all three jobs. Narrow windows stack the cards; wheel and Page Up/Page Down scroll them even with the mouse captured.

## Local saves

Discoveries use stable landmark IDs. Seed delivery saves its available/carrying/complete phase; civic maintenance saves acceptance, repair, and reporting; sunline maintenance saves available/isolated/replaced/complete. Mute preference is restored before entering without starting audio. A carried crate reappears when you enter, including aboard the trolley, not over the intro or pause screen. Saving happens on actual progress/preference changes and page exit, not every frame.

Progress belongs to this browser and URL origin, using the existing **`new-dawn.save.v1`** localStorage record. Older saves without `sunlinePhase` start the new job without losing discoveries, cargo, civic maintenance, or mute preference. Different browsers, devices, ports, and development/preview URLs do not share saves. Player position and resident route positions are not saved: choose an endcap or neighborhood entrance when returning. Saved progress stays in the browser, not in the source repository.

**Start a new game** in the pause menu asks for confirmation, clears discoveries and all three jobs, and keeps your mute preference. Invalid/incompatible save data is normalized or reset with a **Save recovered** notice. If storage access or writing fails, **Saving unavailable** is shown; the current game remains playable but changes may not survive reload.

## Lighting and sound

Both districts normally have warm habitat daylight, soft static building shadows, curved contact shading, and cooler distance haze. Greenway’s SL-02 repair selectively attenuates directional sunlight and ambient/hemisphere fill, not the local point lamps or emissive surfaces. One 2048 × 2048 sunlight shadow map covers both neighborhoods and remains cached across power changes; residents and animated machinery are excluded from that bake to avoid ghost shadows. Residents use moving soft contact footprints. Four Greenway lights and two tower interior lights add warmth above ground. The service level uses its own cool/amber fixtures and four local lights, without another shadow map. The repair consequence adds no lights or shadow maps, and pausing freezes its fade.

Procedural Web Audio supplies quiet ventilation wind, irrigation water near the canal, pump hum near the utility yard and underground water plant, and footsteps while moving on foot. Wind is damped inside enclosed areas; the axial route adds a mechanical ambience using the existing graph. Trolley motion does not trigger walking footsteps. No audio files, microphone access, or external services are used.

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
- `src/service-layout.js` and `src/service-level.js`: signed-depth bounds, stable discoveries, service pavilion, enclosed utility rooms, machinery, physical obstacles, and isolated underground lighting.
- `src/sunline-layout.js` and `src/sunline-transit.js`: axial dimensions, relative-angle bounds, stable discoveries, and guarded endcap/dock transfers.
- `src/sunline.js` and `src/sunline-state.js`: endcap hubs, sectional luminaire, rail corridor, trolley, emitter props, and three-step maintenance state.
- `src/civic-primitives.js`: shared curved radial solids and procedural facade textures.
- `src/atmosphere.js`: static sunlight/shadow cache configuration, local lights, fog, and procedural contact shading.
- `src/district-lighting.js`: world-space regional daylight attenuation, per-world material/uniform ownership, and pause-safe power transitions; existing point lamps and emissive surfaces stay lit.
- `src/soundscape.js`: lazy audio graph, location-aware ambience, footsteps, and serialized pause/mute lifecycle.
- `src/residents.js`: nine walking routes, shared character models, altitude-aware gait, viewpoint dwells, stationary caretaker Mara, and Nia’s phase-aware conversation with a live moving anchor.
- `src/delivery.js` and `src/delivery-layout.js`: delivery state, station coordinates, prompts, and pickup/carried/received crate props.
- `src/maintenance-state.js`, `src/maintenance.js`, and `src/maintenance-layout.js`: caretaker conversations, maintenance progression/guards, unit location, fan and indicator visuals.
- `src/save-game.js`: versioned local progress, discovery filtering, and explicit storage failure/recovery status.
- `src/surface.js`: shared curved paving, surface-aligned boxes, instancing transforms, and canvas-texture signs.
- `src/district-layout.js`: reserved district bounds, walking-route destinations, discovery radii, and hints.
- `src/player.js`: cylindrical movement, radius-dependent gravity, camera/input, stepping, signed floor/wall/ceiling collision, and atomic pose/constraint changes. Secured and trolley modes retain collision-safe bounds without free flight. `groundHeight` selects the outermost support floor; `getState(target)` fills a reusable snapshot including local gravity and traversal mode.
- `src/main.js`: game loop, pause state, district discovery, interaction input, HUD, and renderer.
- `src/style.css` and `index.html`: interface.
- `tests/residents.test.js`: visible gait continuity, raised-floor placement, viewpoint stops/resume, and caretaker position.
- `tests/player.test.js`: deck fall capture, overhead clearance, constant physical collision size, underpass/step behavior, negative-floor support, radial jump differences, secured bounds, rail direction/input constraints, invalid transfers, and low-gravity fallback landing.
- `tests/maintenance.test.js`, `tests/sunline.test.js`, and `tests/save-game.test.js`: maintenance transitions, physical range/floor/mode/airborne guards, angular wrapping, saved continuation, legacy migration, and corrupt/unavailable storage handling.

Coordinates use the Y axis along the cylinder. At angle `theta` and inward height `h` relative to the living surface (negative below it):

```text
position = ((radius - h) * sin(theta), y, -(radius - h) * cos(theta))
up       = (-sin(theta), 0, cos(theta))
```

The habitat is deliberately compact: **360 m living-surface diameter × 900 m long**, so curvature is immediately visible. This is a game environment, not an accurate rotating-frame simulation: radius-dependent outward acceleration, mechanically secured axial travel, stationary scenery, approximate regional lighting, and cached static shadows. There are no Coriolis forces, free-flight angular-momentum effects, orbital mechanics, or crop-growth/economic simulation. Residents are non-solid figures on scripted routes; Mara and Nia have scripted conversations, not dialogue AI. Fans and pumps animate but do not simulate fluid flow or electricity. Glasshouse 01, the tower’s lobby/Skyroom, the service rooms, and the axial maintenance route are accessible; other buildings are exterior-only. Collision uses arc-coordinate prisms, not triangle-level physics. Foliage, beacon supports, and water remain non-solid; city trunks, major equipment, and public railings are solid. Keyboard/mouse only; no touch controls.

## Verification

The district’s complete three-stop route was walked with real Chromium keyboard input, including entering the glasshouse and climbing the overlook. A temporary scenario exercised the actual world collision data: both glasshouse doorways, side-wall blocking, canal bridge support (0.12 m), overlook stair ascent/descent (2.16 m), and deck railing blocking. Ray casts confirmed that paving remains above the faceted hull and the overlook benches sit above the deck (seat top 2.73 m). A separate scenario verified walking and sprinting up 0.18 m steps without changing the controller. Verification helpers are removed before delivery.

The seed job was exercised in Chromium with real input: far-away and paused E presses did nothing; pickup showed the carried crate; pause hid it; returning to the landing point preserved cargo; delivery completed once and removed it from your hands. A temporary scenario checked state transitions, range and height/grounded guards, angular wrapping, and two minutes of resident route clearance against actual world solids. The corrected receiving sign and deposited crate were inspected in the rendered scene, and compact HUD cards were measured and viewed at 375 × 600 without overlap.

The atmosphere pass was checked with actual WebGL rendering: one 2048-pixel shadow map, four local lights, cached later frames, and no dynamic meshes casting into the static bake. Native audio-output instrumentation verified nonzero, unclipped signals, indoor wind damping, no context before entering, no idle/airborne footsteps, muted movement silence, and a stopped clock while paused. A temporary scenario delayed real native resume/suspend completions to exercise rapid pause/mute/resume changes and disposal; latest requested state won. Unsupported audio and narrow controls were also exercised. Temporary verification pages are removed before delivery.

The city update was walked in the production build with real Chromium keyboard input: plaza, tower lobby, 42 m Skyroom, both skywalk branches, street lift, and ground underpass. Exploration reached 6/6 and seed delivery 2/2 without browser errors. Carried cargo persisted across entrance shortcuts and tower lift trips; pausing mid-trip held the floor and suspended audio, then resumed successfully. A temporary actual-world scenario checked finished-floor ray hits, raised-deck support and rail blocking, residential-canopy head clearance, solid city trunks, lift height/range/airborne guards, and the one-shadow-light/six-local-light budget. That page was removed. At 375 × 600, header controls and HUD cards did not overlap, and the intro's loading notice remained reachable by scrolling.

The inhabited-city update passes **26 Node tests** and a production Chromium playthrough. Maintenance reached 3/3, delivery 2/2, and discovery 6/6; all restored after reload, as did mute and an in-progress carried crate. Native Web Audio instrumentation observed no context before entry, real activation after unmuting, and a stopped clock while paused. New Game cancellation preserved progress; confirmation cleared both jobs/discoveries without the outgoing page overwriting the reset, and kept mute. Storage-denied and corrupt-save startup paths stayed playable with explicit notices. No browser errors were observed.

A temporary scenario advanced all ten characters against the actual world collision data for 7,200 frames, verified lobby entry/exit and viewpoint stops, ray-checked visible fan blades, and checked the unchanged six-local-light/one-shadow-light budget with no resident or equipment ghost casters. The page was removed. At 600 × 600, actual pointer-locked wheel and Page Up/Page Down scrolling reached the lower job card; Page Down also reached it at 375 × 600, with conversation and cards separated.

The service-level update passes **31 Node tests** and a production Chromium walk through both utility rooms and the return lift. The actual controller/world scenario verifies surface support, signed lift landings, room doorways, all four outer boundaries, underground jump/landing, lighter Skyroom gravity, and airborne/wrong-floor/physical-distance lift guards. It also verifies legacy six-discovery saves alongside both jobs and new eight-discovery records. Targeted rays verify visible lift markings and interior-facing signs; actual rotor transforms and ray hits verify spinning machinery aligned in front of its casings. The scenario also checks the real pavilion lintel prevents head penetration and the one-shadow-map budget remains unchanged.

Production browser checks also verify a carried seed crate remains visible after descent under the service lighting, pause/resume holds the underground floor and an in-progress lift, and returning restores surface daylight. The Skyroom HUD reads **0.767 g** with cargo intact. Both new discoveries, the carried crate, accepted maintenance job, and mute preference survive reload. At **375 × 600**, the compact **1.044 G · 8.0 m DOWN** readout remains visible above the scrollable HUD. No browser errors were observed. Temporary verification pages are removed before delivery.

The sunline expansion was exercised in the production build with real Chromium input: Endcap A lift, console isolation, boarding, SL-02 replacement, full-length travel to Endcap B, dismounting, restoration, and return to the rim. The HUD read **0.056 G** axially and **1.000 G** on return. Holding drive while pausing stopped the trolley; resuming without a new key press did not restart it. Native audio-source instrumentation recorded no footsteps during rail travel and resumed footsteps while walking in the hub. Compact controls and gravity were viewed at **375 × 600**.

A genuine older browser save restored six discoveries, a carried seed crate, an accepted civic job, and mute preference without a recovery notice. Isolation survived reload; completion later restored at **3/3**, with all three new discoveries and the old cargo/job intact. New Game cancellation preserved progress; confirmation cleared all three jobs and discoveries while retaining mute. No browser errors were observed.

A temporary actual-world scenario verified both secured hubs, relative-angle seam bounds, both boarding directions, the full rail, continuous floor/roof protection, maintenance ordering and repeat guards, nine-section visibility, approach-sign ray hits, trolley/gate clearance, cargo preservation, and the unchanged one-shadow-light budget. The Node suite and focused low-gravity landing, clamped-teleport, and saved-replacement regressions were exercised; the low-gravity fixture now waits for landing rather than assuming surface-gravity timing. Temporary verification pages are removed before delivery.

The district-power consequence update passes **51 Node tests** and a production Chromium playthrough. Native input exercised Greenway before and during the outage, SL-02 replacement and return travel, restored daylight, Nia’s emergency and thank-you conversations, seed pickup/carrying, and Mara’s existing job acceptance. Isolated, replaced, and completed states restored correctly across reloads; cargo, discoveries, civic progress, and mute remained intact. At **375 × 600**, the conversation and scrolling HUD retain a measured gap of more than 12 pixels rather than assuming a fixed dialogue height. No application browser errors were observed.

An actual-world WebGL scenario checked separate online/offline worlds on one renderer, regional surface dimming, preserved point-lamp illumination, unchanged Meridian/opposite-side/underground pixels, both console approach rays, replacement remaining dark, gradual restoration, zero-delta pause, cached shadows, camera-attached cargo attenuation, and continued irrigation-indicator animation after material installation. The budget remains one shadow light, six surface point lights, and four isolated service lights. Temporary verification pages are removed before delivery.

`npm run build` succeeds with the existing non-blocking bundle-size warning: **669.43 kB** minified JavaScript, **184.18 kB** gzipped. Performance varies by device and viewpoint.
