# New Dawn — Cylinder Explorer

A first-person browser game inside an O’Neill-inspired cylinder. Start at **Endcap A**, take a radial lift to a low-gravity maintenance hub, and ride a **1720 m axial service trolley** to repair part of the habitat’s artificial sunline. Isolating SL-02 dims **Greenway Commons** to emergency lighting; restore it to bring daylight back and hear the market merchant’s response. Explore **Meridian Civic District**, its 42 m Skyroom, public Skywalk, and enclosed service level 8 m beneath the living surface. Nine residents walk the neighborhoods; discoveries, three jobs, and mute preference save locally. Built with vanilla JavaScript, Three.js, and Vite; no account, API keys, or external art downloads.

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
| G / Map button                 | Open or close the layered habitat map                |
| M / Sound button               | Mute or unmute all audio                             |
| Escape                         | Close the map if open; otherwise pause and release mouse |
| Arrow keys                     | Look without mouse capture                           |
| Left-click + drag on the scene | Look if mouse capture is unavailable                 |
| Wheel / Page Up / Page Down    | Scroll the job cards, including while mouse-captured |

Choose **Enter Endcap A** for the new maintenance route, **Or visit Meridian** for the city entrance, or **Or start in Greenway Commons** for the original landing. In Greenway, follow the promenade into **Market square**, take the east lane to **Glasshouse 01**, and follow the ORCHARD sign west to the stepped **Orchard overlook**. The Habitat Walk records **11 stops**: six neighborhood landmarks, two utility rooms, both endcap hubs, and the sunline service station. Discoveries require the correct floor and physical proximity.

The pause menu offers Endcap A and both neighborhood entrances without erasing discoveries or a carried seed crate. Switching away pauses gameplay, residents, world animation, and sound. Local at-rest gravity is shown in the HUD; negative height is labeled **DOWN** relative to the living surface.

## Habitat map and waypoints

Press **G** (without Ctrl/Meta modifiers) or click **Map** in the top bar once the scene finishes booting to open an unrolled 2D habitat map. Opening the map from gameplay pauses simulation, releases mouse capture, hides the HUD waypoint and carried crate view, and suppresses the pause menu; opening it from the intro or pause screen keeps you in that menu when you close it. **Escape** or the close button returns to your previous mode (re-entering mouse-captured play only when you close explicitly from gameplay while the tab is visible). While the map is open, world **E** interactions, jumping, and job-card scrolling are blocked, **Tab** navigates within the modal dialog, and **M** retains paused mute behavior.

The map separates the cylinder into **three elevation layers**:

- **Surface & elevated**: Ground-level neighborhoods (`0 m`), **Orchard overlook** (`+2.16 m` collider floor), and **Meridian** elevated decks (**Skywalk · 9 m** and **Skyroom · 42 m**, shown with elevation badges).
- **Underground service**: Meridian’s enclosed utility corridor and machinery rooms (`−8 m`).
- **Axial maintenance**: Endcaps A & B hubs, the **1720 m** rail corridor, and the SL-02 service station (`+350 m`).

The unrolled projection wraps circumference `theta` across `[−π/2, 3π/2]` with north / Endcap B at the top so neither the `θ = 0` neighborhoods nor the `θ = π` axial spine touches the seam. It displays district bounds, your current player position, visited vs. unvisited landmark status, vertical lift and axial trolley links, and keyboard-accessible destination/job lists alongside the SVG map so small or overlapping pins stay usable on desktop and compact **375 × 600** screens without horizontal overflow.

Select any destination (all 11 landmarks plus lift, rim, and dock access points) or track one of the three active jobs (**Seed Delivery**, **Civic Maintenance**, or **Sunline Engineering**), or clear tracking at any time. Waypoints use **authored access guidance rather than a generic GPS pathfinder**:

- Targets on your current layer point directly to the destination (with Orchard overlook using its stepped west-lane approach).
- Cross-floor targets direct you to the appropriate transfer first: the **Service Access** pavilion lift for `−8 m`, the **Civic tower lobby** or **Skywalk** street lift for `+42 m` or `+9 m`, the nearer **Endcap rim** lift to reach `+350 m`, the endcap **trolley dock** when heading from an axial hub toward SL-02, or the nearest hub **return lift** when descending from the axis.
- Tracking a job automatically follows its current phase and target, and clears once the job is complete.

During active play, a lightweight on-screen (or viewport-edge-clamped when off-screen or behind you) waypoint indicator shows the guided target or access point name, wrapped 3D distance, and elevation cue without blocking core controls or viewport clicks. Active waypoint selection is **ephemeral runtime state**: it is not saved to `localStorage` and requires no save migration.

## Endcaps and sunline maintenance

At **Endcap A rim access**, approach the marked pad and press **E**. The radial lift arrives in an enclosed maintenance hub **350 m above the living surface**, only **10 m from the spin axis**. Its at-rest gravity is **0.028 g** (`10/360 g`). Magnetic boots secure your feet: WASD walks slowly, with no sprinting or jumping. The return pad brings you back to the **1.000 g** rim.

The **Sunline Engineering** card tracks a three-step job:

1. Approach either hub’s isolation console and press **E** to isolate **SL-02**.
2. Board at the marked gate with **E**. **W** drives toward the opposite endcap; **S** reverses. Stop at the SL-02 service station and press **E** to install the spare emitter carried aboard.
3. Reach either endcap, press **E** at the dock to disembark, and use its console to restore power.

The trolley travels the full **1720 m** between Endcaps A and B (`y ∈ [−860, +860]`). Looking does not steer; strafe, sprint, and jump do not detach you from the rail. Disembarking is possible only at the end docks. Secured hub bounds, corridor walls, and a continuous overhead roof keep the route on the habitable side of the axis. Transfers use the existing short fade rather than animated lift cabins.

The artificial axial luminaire has **nine visual sections** spanning **1792 m** (`LENGTH − 8`). Only the assigned SL-02 section goes dark while isolated or awaiting restoration; its casing remains visible, the other eight sections stay lit, and the spare/installed emitter props follow the job. Both endcap console faces and the Sunline Engineering card report **Greenway Commons · DAYLIGHT ONLINE** or **EMERGENCY LIGHTING**. Other machinery labels remain scenery.

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

At a fixed spin rate, apparent gravity is proportional to radius. With cylinder radius `R = 360 m` and inward height `h` measured from the living surface, the controller applies **`g(h) = 9.81 × (360 − h) / 360` m/s²**. The living surface (`h = 0`) is **1.000 g**, the −8 m service floor is **368/360 g (`1.022 g`)**, the +9 m Skywalk is **351/360 g (`0.975 g`)**, the +42 m Skyroom is **318/360 g (`0.883 g`)**, and the +350 m axial floor is **10/360 g (`0.028 g`)**. Ordinary jump acceleration changes accordingly: the same launch is shorter below ground and higher upstairs. The HUD reports gravity at rest at the character’s feet, not the total force during motion. Magnetic boots and the trolley impose mechanical movement constraints. Coriolis forces and free-flight angular-momentum effects remain deferred.

## Mara and Skywalk ventilation

Find **Mara Voss**, the civic caretaker in a dark uniform, cap, and gold badge on the west side of Meridian plaza. Approach on foot and press **E** to speak with her and accept the job. The conversation closes when you walk away, pause, or after 14 seconds of game time; **E** nearby gives a reminder.

Take the street lift to the **9 m Skywalk**, follow its east branch north past the planter, and approach the ventilation unit using the clear west-side passage. Press **E** when prompted to reset its breaker. The intake fan starts spinning and its red status lamp turns green. Return to Mara and press **E** to report completion. The Civic Maintenance card tracks acceptance, repair, and reporting.

Inspecting the unit before accepting does not repair it. Interactions require a grounded player within 2.8 m and within 0.4 m of the correct floor; you cannot service it from the street underneath or while jumping. Repair and completion survive reloads, including the running fan and green indicator. Residents remain non-solid: a citizen circles the plaza, a delegate enters/exits the tower lobby through its doorway, and visitors pause at the Skywalk and Skyroom views.

## A small favor

Find the amber-marked collection table just east of the square’s south approach. Walk close and press **E** to collect the heritage seed crate. You will see it in your hands and in the inventory indicator. Follow the east lane into **Glasshouse 01**; the receiving desk is on the right, between the planter beds. Approach it and press **E** again to deliver.

The Neighborhood Job card shows the seed destination, distance, and progress. Delivery requires being grounded within 3.2 m, with feet no more than half a metre above the living surface. Completion is one-time per saved game. The 11-stop Habitat Walk stays active alongside all three jobs. Narrow windows stack the cards; wheel and Page Up/Page Down scroll them even with the mouse captured.

## Local saves

Discoveries use stable landmark IDs. Seed delivery saves its available/carrying/complete phase; civic maintenance saves acceptance, repair, and reporting; sunline maintenance saves available/isolated/replaced/complete. Mute preference is restored before entering without starting audio. A carried crate reappears when you enter, including aboard the trolley, not over the intro or pause screen. Progress/preferences save immediately when they change; leaving an untouched older tab does not rewrite newer progress.

Progress belongs to this browser and URL origin, using the existing **`new-dawn.save.v1`** localStorage record. Older saves without `sunlinePhase` start the new job without losing discoveries, cargo, civic maintenance, or mute preference. Active map/waypoint tracking selection is ephemeral and is not persisted in the save record (no save migration required). Different browsers, devices, ports, and development/preview URLs do not share saves. Player position and resident route positions are not saved: choose an endcap or neighborhood entrance when returning. Saved progress stays in the browser, not in the source repository.

Use one active gameplay tab per origin: simultaneous progress changes in separate tabs are not merged. An idle stale tab can safely close, but an actual change in either active game writes that game’s current snapshot.

**Start a new game** in the pause menu asks for confirmation, clears discoveries and all three jobs, and keeps your mute preference. Invalid/incompatible save data is normalized or reset with a **Save recovered** notice. If storage access or writing fails, **Saving unavailable** is shown; the current game remains playable but changes may not survive reload.

## Lighting and sound

Both districts normally have warm habitat daylight, soft static building shadows, curved contact shading, and cooler distance haze. Greenway’s SL-02 repair selectively attenuates directional sunlight and ambient/hemisphere fill, not the local point lamps or emissive surfaces. One 2048 × 2048 sunlight shadow map covers both neighborhoods and remains cached across power changes; residents and animated machinery are excluded from that bake to avoid ghost shadows. Residents use moving soft contact footprints. Four Greenway lights and two tower interior lights add warmth above ground. The service level uses its own cool/amber fixtures and four local lights, without another shadow map. The repair consequence adds no lights or shadow maps, and pausing freezes its fade.

Procedural Web Audio supplies quiet ventilation wind, irrigation water near the canal, pump hum near the utility yard and underground water plant, and footsteps while moving on foot. Wind is damped inside enclosed areas; the axial route adds a mechanical ambience using the existing graph. Trolley motion does not trigger walking footsteps. No audio files, microphone access, or external services are used.

Sound starts only after entering. Press **M** or use **Sound** to mute; the saved preference also applies on the intro screen. Pause/blur suspends the audio clock, with short gain fades on ordinary mute/pause. Unmuting while paused does not start playback. Browsers without the optional gain-hold API use supported cancellation/fade operations. If playback is blocked, **Enable Sound** retries from your gesture; unavailable or terminally failed audio is shown as **Sound N/A** without stopping gameplay.

## Build and test

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run preview
```

The Chromium install is a one-time development setup, not needed to play. Playwright is development-only; Three.js remains the only runtime dependency. Browser checks start an isolated Vite server on **127.0.0.1:4176**, use fresh browser contexts, and stop the test server afterward. Keep that port free; your normal demo server on 5173 is left alone.

The production files are in `dist/`. Serve that folder with an ordinary static web server. Development and preview servers bind only to the local machine. The retained `checks/` fixtures are not part of the default production build.

## Where to iterate

- `src/habitat.js`: cylinder radius (`360 m`), length (`1800 m`), spawn point, eye height, gravity, `VIEW_DISTANCE`, and district placements (`GREENWAY_PLACEMENT`, `MERIDIAN_PLACEMENT`).
- `src/district-placement.js`: pure Y-axis placement helper translating authored local district coordinates to world space.
- `src/cylinder-math.js`: allocation-free wrapped angles and explicit horizontal/height-aware physical distances.
- `src/world.js`: background landscape, beacons, and district integration. Clears procedural scenery from both hand-built neighborhoods and combines solid collision footprints.
- `src/village.js`: neighborhood buildings, market square, orchard, steps, overlook, and furniture.
- `src/farm.js`: greenhouse interior and instanced structural frame, crop rows, irrigation crossings, utility yard, animated rotor and pump.
- `src/city-streets.js`: seven civic blocks, streets/plaza, instanced avenue furniture and trees, and wayfinding.
- `src/city-tower.js`: accessible lobby/Skyroom, landmark silhouette, elevated viewing terraces, and lift structures.
- `src/city-layout.js` and `src/city-transit.js`: fixed city bounds/landmarks (including explicit floor `height`), and canonical exported `CITY_LIFT_STOPS` height/range-gated lift destinations.
- `src/service-layout.js` and `src/service-level.js`: signed-depth bounds, stable discoveries with explicit `SERVICE_FLOOR` `height`, service pavilion, enclosed utility rooms, machinery, physical obstacles, and isolated underground lighting.
- `src/sunline-layout.js` and `src/sunline-transit.js`: axial dimensions, relative-angle bounds, stable discoveries, and canonical exported `SUNLINE_TRANSFERS` endcap/dock transfers.
- `src/sunline.js` and `src/sunline-state.js`: endcap hubs, sectional luminaire, rail corridor, trolley, two phase-repainted console textures, emitter props, and three-step maintenance state.
- `src/civic-primitives.js`: shared curved radial solids, matching visual/collision construction, and procedural facade textures.
- `src/atmosphere.js`: static sunlight/shadow cache configuration, local lights, fog, and procedural contact shading.
- `src/district-lighting.js`: world-space regional daylight attenuation, per-world material/uniform ownership, and pause-safe power transitions; existing point lamps and emissive surfaces stay lit.
- `src/soundscape.js`: lazy audio graph, location-aware ambience, footsteps, and serialized pause/mute lifecycle.
- `src/residents.js`: nine walking routes, shared character models, altitude-aware gait, viewpoint dwells, stationary caretaker Mara, and Nia’s phase-aware conversation with a live moving anchor.
- `src/delivery.js` and `src/delivery-layout.js`: delivery state, station coordinates, prompts, and pickup/carried/received crate props.
- `src/maintenance-state.js`, `src/maintenance.js`, and `src/maintenance-layout.js`: caretaker conversations, maintenance progression/guards, unit location, fan and indicator visuals.
- `src/navigation.js`: pure 3-layer map metadata, unrolled cylindrical projection, `NAV_TARGETS`, `NAV_CONNECTIONS`, authored cross-floor access guidance, and ephemeral waypoint tracking.
- `src/habitat-map.js` and `src/waypoint.js`: native accessible 2D map dialog (`<dialog>`) with 3D-free redraws and reusable-vector HUD waypoint projection/edge clamping.
- `src/save-game.js`: versioned local progress, discovery filtering, and explicit storage failure/recovery status.
- `src/surface.js`: curved paving, surface-aligned boxes, instancing transforms, shared oriented panels, and fitted canvas-texture signs.
- `src/district-layout.js` and `src/landmarks.js`: district bounds, discovery metadata with explicit floor `height`, and the single combined catalog used by the world and save filtering.
- `src/player.js`: cylindrical movement, radius-dependent gravity, camera/input, stepping, signed floor/wall/ceiling collision, and atomic pose/constraint changes. Secured and trolley modes retain collision-safe bounds without free flight. `groundHeight` selects the outermost support floor; `getState(target)` fills a reusable snapshot including local gravity and traversal mode.
- `src/main.js`: lifecycle/input, `VIEW_DISTANCE` camera far plane, length-derived endcap HUD area bands, map/waypoint lifecycle integration, change-driven HUD content, discovery/interactions, and active rendering with one-off paused/resize redraws.
- `src/style.css` and `index.html`: interface, map modal, and waypoint marker styling/markup.
- `tests/habitat.test.js`: expanded cylinder dimensions, surface `1.000 g`, district placement separation, and world bounds.
- `tests/navigation.test.js`: unrolled projection seam wrapping, layer classification, authored cross-floor guidance, live job target tracking, and floor-aware arrival checks.
- `tests/residents.test.js`: nonzero articulated gait through route wraps, raised-floor placement, viewpoint stops/resume, and live conversation anchors.
- `tests/player.test.js`: deck fall capture, overhead clearance, constant physical collision size, underpass/step behavior, negative-floor support, radial jump differences, secured bounds, rail direction/input constraints, invalid transfers, and low-gravity fallback landing.
- `tests/maintenance.test.js`, `tests/sunline.test.js`, and `tests/save-game.test.js`: maintenance transitions, physical range/floor/mode/airborne guards, angular wrapping, saved continuation, legacy migration, and corrupt/unavailable storage handling.
- `checks/browser.spec.js`, `checks/navigation.spec.js`, `checks/world.html`, and `playwright.config.js`: retained real-browser lifecycle, audio, authored-world, map/waypoint, compact layout, and WebGL regressions.

Coordinates use the Y axis along the cylinder. At angle `theta` and inward height `h` relative to the living surface (negative below it):

```text
position = ((radius - h) * sin(theta), y, -(radius - h) * cos(theta))
up       = (-sin(theta), 0, cos(theta))
```

The habitat measures **720 m living-surface diameter (`R = 360 m`) × 1800 m long** (doubled from the original 360 m diameter × 900 m length) so curvature remains clearly visible while giving the neighborhoods room to breathe. Doubling **both** linear dimensions (`2R` and `2L`) multiplies the living surface area (`2πRL`) by **4×** and the interior volume (`πR²L`) by **8×** (not 2× volume), while surface **1.000 g** (`9.81 m/s²`) is maintained by a slower implied spin rate (`ω = √(g / R)`). **Greenway Commons** (anchored at `y = −450 m`) and **Meridian Civic District** (anchored at `y = +450 m`) have **900 m anchor separation** along the cylinder axis while keeping an **unchanged human scale** for buildings, streets, rooms, doorways, props, actors, walking speeds, and eye height (`1.7 m`). This is a game environment, not an accurate rotating-frame simulation: radius-dependent outward acceleration, mechanically secured axial travel, stationary scenery, approximate regional lighting, and cached static shadows. There are no Coriolis forces, free-flight angular-momentum effects, orbital mechanics, or crop-growth/economic simulation. Residents are non-solid figures on scripted routes; Mara and Nia have scripted conversations, not dialogue AI. Fans and pumps animate but do not simulate fluid flow or electricity. Glasshouse 01, the tower’s lobby/Skyroom, the service rooms, and the axial maintenance route are accessible; other buildings are exterior-only. Collision uses arc-coordinate prisms, not triangle-level physics. Foliage, beacon supports, and water remain non-solid; city trunks, major equipment, and public railings are solid. Keyboard/mouse only; no touch controls.

## Verification

| Check | Reproducible coverage |
| --- | --- |
| `npm test` | Controller support/ceilings/steps, radial gravity, secured/trolley controls, independent strafe, articulated gait, quest guards/transitions, height-aware navigation, map projection and cross-floor guidance, expanded cylinder/district placements, save migration and storage errors |
| `npm run test:browser` | Stale-tab exit/reset, native audio with the optional gain-hold API removed, terminal audio failure without lost gameplay, intro/pause/resize/resume rendering, paused lift travel, authored transfers/controller support, real-page service-layer switching, regional WebGL lighting and sign bounds, layered map open/close lifecycle, focus trapping, waypoint selection and live job tracking, and compact 375 × 600 layout |
| `npm run build` | Production bundling; this does not replace browser rendering checks |

The browser suite runs Chromium with real canvas/WebGL/audio, not fake rendering APIs. Its controlled world fixture exercises production geometry, controller, and transfer selectors independently of main-page input; lifecycle cases drive the real application. Missing-API coverage simulates the compatibility condition in Chromium, not a full Firefox or Safari run.

Before a release, also walk the demo: repair SL-02 and revisit Nia; carry a seed crate through city and service lifts; check lighting and audio after pause/resume; and inspect job scrolling/conversation layout at 375 × 600. These visual/manual checks remain separate from the automated suite. Historical milestone reports live in the feature pull requests rather than an accumulating test-count diary.

The existing bundle-size warning is non-blocking. The frame uses instancing, console textures are repainted rather than retaining phase alternatives, and frozen intro/pause scenes do not continuously redraw. Performance still varies by device and viewpoint.

