import * as THREE from "three";
import "./style.css";
import { RADIUS, LENGTH, GRAVITY } from "./habitat.js";
import { createWorld } from "./world.js";
import { createPlayer } from "./player.js";
import {
  DISTRICT_NAME,
  DISTRICT_STOPS,
  inDistrict,
} from "./district-layout.js";
import { createSoundscape } from "./soundscape.js";
import { CITY_NAME, CITY_ARRIVAL, CITY_STOPS, inCity } from "./city-layout.js";
import { getCityLift } from "./city-transit.js";
import { CARETAKER } from "./maintenance-layout.js";
import { createSaveStore } from "./save-game.js";
import { SERVICE_STOPS, SERVICE_NAME, inServiceLevel } from "./service-layout.js";
import { AXIAL_HEIGHT, ENDCAP_ARRIVAL, SUNLINE_STOPS, getAxialHub } from "./sunline-layout.js";
import { getSunlineTransfer } from "./sunline-transit.js";

const $ = (id) => document.getElementById(id);
const startButton = $("start");
startButton.disabled = true;

function showError(error) {
  $("error").hidden = false;
  $("error-message").textContent = error.message || String(error);
  $("loading").textContent = "Habitat unavailable.";
  console.error(error);
}

try {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Static district shadows are baked once; moving figures use contact shading.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  $("viewport").appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.08,
    1800,
  );
  scene.add(camera);
  const saveStore = createSaveStore();
  const saved = saveStore.load(
    [...DISTRICT_STOPS, ...CITY_STOPS, ...SERVICE_STOPS, ...SUNLINE_STOPS].map((stop) => stop.id),
  );
  const world = createWorld(scene, camera, saved);
  const { delivery, maintenance, sunline, residents } = world;
  // Cargo remains visible under either lighting set; other world meshes do not.
  for (const child of camera.children)
    child.traverse((node) => node.layers.enable(1));
  const soundscape = createSoundscape({ muted: saved.muted });
  let playing = false;
  let everLocked = false;
  let lockRequest = 0;
  let player;
  const playerState = {};
  const found = new Set(saved.discoveries);
  let toastUntil = 0;
  const clock = new THREE.Clock();
  let elapsed = 0;
  let hudTime = 0;
  let currentLift = null;
  let travelAt = 0;
  let travelEnd = 0;
  let travelMoved = false;
  let activeDialogue = null;
  let dialogueUntil = 0;
  let saveWritten = false;
  let startingNewGame = false;
  const jobStack = document.querySelector(".job-stack");
  const hudCards = document.querySelector(".hud-cards");
  const compactHUD = window.matchMedia("(max-width: 520px)");

  function getJobScroller() {
    return compactHUD.matches ? hudCards : jobStack;
  }

  function updateSaveStatus() {
    const status = saveStore.getStatus();
    $("save-status").textContent = !status.available
      ? "SAVING UNAVAILABLE"
      : status.recovered
        ? "SAVE RECOVERED"
        : saveWritten
          ? "PROGRESS SAVED"
          : "LOCAL AUTOSAVE";
    $("save-status").title =
      status.error ||
      "Discoveries, all three jobs, and sound preferences are saved on this browser.";
  }

  function saveProgress() {
    saveWritten = saveStore.save({
      discoveries: [...found],
      deliveryPhase: delivery.getPhase(),
      maintenancePhase: maintenance.getPhase(),
      sunlinePhase: sunline.getPhase(),
      muted: soundscape.getState().muted,
    });
    updateSaveStatus();
  }

  function closeDialogue() {
    activeDialogue = null;
    $("dialogue").hidden = true;
    $("app").classList.remove("has-dialogue");
  }

  function fitDialogueHUD() {
    if (!activeDialogue || !compactHUD.matches) return;
    const room = $("dialogue").getBoundingClientRect().top -
      hudCards.getBoundingClientRect().top - 12;
    hudCards.style.setProperty("--dialogue-room", `${Math.max(0, Math.floor(room))}px`);
  }

  function showDialogue(dialogue, target) {
    activeDialogue = { target };
    dialogueUntil = elapsed + 14;
    $("dialogue-name").textContent = dialogue.speaker;
    $("dialogue-text").textContent = dialogue.text;
    $("dialogue").hidden = false;
    $("app").classList.add("has-dialogue");
    fitDialogueHUD();
  }

  function showToast(message, duration = 4) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastUntil = elapsed + duration;
  }

  function updateSoundControl() {
    const { muted, status, error } = soundscape.getState();
    const button = $("sound");
    button.dataset.status = status;
    button.disabled = status === "unavailable";
    button.textContent =
      status === "unavailable"
        ? "SOUND N/A"
        : status === "blocked"
          ? "ENABLE SOUND"
          : muted
            ? "SOUND OFF"
            : "SOUND ON";
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute(
      "aria-label",
      status === "unavailable"
        ? "Sound unavailable"
        : status === "blocked"
          ? "Enable sound"
          : muted
            ? "Unmute sound"
            : "Mute sound",
    );
    button.title =
      error ||
      "M toggles mute. Sound starts after entering and pauses with the game.";
  }

  function toggleSound() {
    const { muted, status } = soundscape.getState();
    if (status === "unavailable") return;
    const operation =
      status === "blocked"
        ? soundscape.setActive(playing)
        : soundscape.setMuted(!muted);
    updateSoundControl();
    if (status !== "blocked") saveProgress();
    void operation.then(updateSoundControl);
  }

  function pause() {
    if (!playing) return;
    lockRequest++;
    playing = false;
    player.setEnabled(false);
    delivery.setActive(false);
    sunline.setActive(false);
    closeDialogue();
    void soundscape.setActive(false).then(updateSoundControl);
    $("interaction").hidden = true;
    $("inventory").hidden = true;
    $("pause-panel").hidden = false;
    $("pause").hidden = true;
    $("crosshair").hidden = true;
    if (document.pointerLockElement === renderer.domElement)
      document.exitPointerLock();
    $("resume").focus();
  }

  player = createPlayer(camera, renderer.domElement, {
    obstacles: world.obstacles,
    groundHeight: world.groundHeight,
    onLockChange(locked) {
      if (locked && !playing) {
        document.exitPointerLock();
        return;
      }
      if (locked) everLocked = true;
      else if (everLocked && playing) pause();
    },
  });
  player.teleport(ENDCAP_ARRIVAL);

  function visitEndcap() {
    currentLift = null;
    $("viewport").classList.remove("lift-travel");
    closeDialogue();
    player.teleport(ENDCAP_ARRIVAL);
    enter();
  }

  function visitCity() {
    currentLift = null;
    $("viewport").classList.remove("lift-travel");
    closeDialogue();
    player.teleport(CITY_ARRIVAL);
    enter();
  }

  function enter() {
    const request = ++lockRequest;
    playing = true;
    everLocked = false;
    player.setEnabled(true);
    delivery.setActive(true);
    sunline.setActive(true);
    void soundscape.setActive(true).then(updateSoundControl);
    $("intro").hidden = true;
    $("pause-panel").hidden = true;
    $("pause").hidden = false;
    $("crosshair").hidden = false;
    $("mission").hidden = false;
    $("maintenance").hidden = false;
    $("sunline-job").hidden = false;
    $("telemetry").hidden = false;
    $("compact-physics").hidden = false;
    $("job").hidden = false;
    $("job-scroll-hint").hidden = false;
    updateHUD();
    document.activeElement?.blur();
    player.requestLock().then((locked) => {
      if (!playing || request !== lockRequest) return;
      $("footer-right").textContent = locked
        ? "E TO INTERACT · ESC TO PAUSE"
        : "DRAG / ARROWS TO LOOK · E TO INTERACT";
    });
  }

  const rows = world.stops.map((landmark) => {
    const row = document.createElement("li");
    row.style.setProperty(
      "--beacon",
      `#${landmark.color.toString(16).padStart(6, "0")}`,
    );
    const label = document.createElement("span");
    label.textContent = landmark.name;
    const distance = document.createElement("span");
    row.classList.toggle("found", found.has(landmark.id));
    distance.className = "distance";
    row.append(label, distance);
    $("landmarks").appendChild(row);
    return { row, distance };
  });

  function updateHUD() {
    const state = player.getState(playerState);
    updateSoundControl();
    const degrees = ((((state.theta * 180) / Math.PI) % 360) + 360) % 360;
    $("position").textContent =
      `${degrees.toFixed(0).padStart(3, "0")}° / ${Math.round(
        state.y + LENGTH / 2,
      )
        .toString()
        .padStart(3, "0")} m`;
    $("motion").textContent = state.traversalMode === "trolley"
      ? "TROLLEY · ON RAIL"
      : state.traversalMode === "secured"
        ? "MAG BOOTS SECURED"
        : !state.grounded
          ? "AIRBORNE"
          : state.speed > 9
            ? "SPRINTING"
            : state.speed > 0.2
              ? "WALKING"
              : "ON FOOT";
    const heightLabel =
      `${Math.abs(state.height).toFixed(1)} m ${state.height < -0.05 ? "DOWN" : "UP"}`;
    const gravityLabel = `${(state.gravity / GRAVITY).toFixed(3)} G`;
    $("height").textContent = heightLabel;
    $("gravity").title = state.height >= AXIAL_HEIGHT - 1
      ? "At-rest apparent gravity. Magnetic boots or the rail supply mechanical support; Coriolis is deferred."
      : "Apparent gravity at your feet, scaled with radius.";
    $("gravity").textContent = gravityLabel;
    $("compact-physics").textContent = `${gravityLabel} · ${heightLabel}`;
    $("track-position").style.left =
      `${THREE.MathUtils.clamp(((state.y + LENGTH / 2) / LENGTH) * 100, 0, 100)}%`;
    const arc =
      Math.atan2(Math.sin(state.theta), Math.cos(state.theta)) * RADIUS;
    const axialHub = getAxialHub(state);
    $("area").textContent = axialHub
      ? `${axialHub.label.toUpperCase()} · MAINTENANCE HUB`
      : state.traversalMode === "trolley"
        ? "SUNLINE SERVICE SPINE"
        : inServiceLevel(arc, state.y, state.height)
          ? SERVICE_NAME.toUpperCase()
          : inCity(arc, state.y)
            ? CITY_NAME.toUpperCase()
            : inDistrict(arc, state.y)
              ? DISTRICT_NAME.toUpperCase()
              : state.height < 2 && state.y < -400
                ? "ENDCAP A · RIM ACCESS"
                : state.height < 2 && state.y > 400
                  ? "ENDCAP B · RIM ACCESS"
                  : "OUTER PROMENADE";
    $("footer-right").textContent = state.traversalMode === "trolley"
      ? "W/S · DRIVE / REVERSE · LOOK FREELY · E · DOCK / SERVICE"
      : state.traversalMode === "secured"
        ? "MAG BOOTS · WASD · E · CONTROL / BOARD / LIFT"
        : state.locked
          ? "E TO INTERACT · ESC TO PAUSE"
          : "DRAG / ARROWS TO LOOK · E TO INTERACT";
    let nearest = null;
    let nearestDistance = Infinity;
    let discovered = false;
    world.stops.forEach((landmark, index) => {
      const angle = Math.atan2(
        Math.sin(landmark.theta - state.theta),
        Math.cos(landmark.theta - state.theta),
      );
      const targetHeight = landmark.height ?? landmark.minHeight;
      const planarDistance = Math.hypot(
        angle * (RADIUS - targetHeight), landmark.y - state.y,
      );
      const distance = Math.hypot(
        planarDistance,
        state.height - targetHeight,
      );
      if (
        playing &&
        distance < landmark.radius &&
        state.height >= landmark.minHeight &&
        state.height <= (landmark.maxHeight ?? Infinity) &&
        !found.has(landmark.id)
      ) {
        found.add(landmark.id);
        discovered = true;
        rows[index].row.classList.add("found");
        showToast(`Discovered · ${landmark.name}`);
      }
      rows[index].distance.textContent = found.has(landmark.id)
        ? "VISITED"
        : planarDistance < landmark.radius && state.height < landmark.minHeight
          ? "UPSTAIRS"
          : planarDistance < landmark.radius &&
              state.height > (landmark.maxHeight ?? Infinity)
            ? "BELOW"
            : `${Math.round(distance)} m`;
      if (!found.has(landmark.id) && distance < nearestDistance) {
        nearest = landmark;
        nearestDistance = distance;
      }
    });
    if (discovered) saveProgress();
    $("progress").textContent = `${found.size} / ${world.stops.length}`;
    if (nearest)
      $("objective").textContent =
        `${nearest.name} · ${Math.round(nearestDistance)} m. ${nearest.hint}`;
    else {
      $("mission").querySelector("h2").textContent = "A place to call home.";
      $("objective").textContent =
        "Habitat walk complete. Explore the endcaps, service spine, utility rooms, and neighborhoods.";
    }
    const job = delivery.getView(state);
    $("job").dataset.phase = job.phase;
    $("job").classList.toggle("complete", job.phase === "complete");
    $("job-title").textContent = job.title;
    $("job-objective").textContent = job.objective;
    $("job-progress").textContent =
      job.phase === "available"
        ? "0 / 2"
        : job.phase === "carrying"
          ? "1 / 2"
          : "2 / 2";
    $("job-status").textContent =
      job.phase === "available"
        ? "READY FOR PICKUP"
        : job.phase === "carrying"
          ? "DELIVER TO GLASSHOUSE 01"
          : "DELIVERY COMPLETE";
    $("job-distance").textContent = job.target
      ? `${Math.round(job.distance)} m`
      : "THANK YOU";
    $("job").querySelector(".job-help").hidden = job.phase === "complete";
    const civicJob = maintenance.getView(state);
    $("maintenance").dataset.phase = civicJob.phase;
    $("maintenance").classList.toggle(
      "complete",
      civicJob.phase === "complete",
    );
    $("maintenance-title").textContent = civicJob.title;
    $("maintenance-objective").textContent = civicJob.objective;
    $("maintenance-progress").textContent = civicJob.progress;
    $("maintenance-status").textContent = civicJob.status;
    $("maintenance-distance").textContent = civicJob.target
      ? `${Math.round(civicJob.distance)} m`
      : "THANK YOU";
    const lightJob = sunline.getView(state);
    $("sunline-job").dataset.phase = lightJob.phase;
    $("sunline-job").classList.toggle("complete", lightJob.phase === "complete");
    $("sunline-title").textContent = lightJob.title;
    $("sunline-objective").textContent = lightJob.objective;
    $("sunline-progress").textContent = lightJob.progress;
    $("sunline-status").textContent = lightJob.status;
    $("sunline-distance").textContent = lightJob.target
      ? `${Math.round(lightJob.distance)} m`
      : "ONLINE";
    const districtStatus = lightJob.districtStatus;
    $("sunline-district").textContent = `${districtStatus.name} · ${districtStatus.status}`;
    $("sunline-district").dataset.online = String(districtStatus.online);
    const reaction = residents.getReaction(state, lightJob.phase);
    if (activeDialogue) {
      const angle = Math.atan2(
        Math.sin(state.theta - activeDialogue.target.s / RADIUS),
        Math.cos(state.theta - activeDialogue.target.s / RADIUS),
      );
      if (
        elapsed >= dialogueUntil ||
        Math.abs(state.height - activeDialogue.target.height) > 0.8 ||
        Math.hypot(angle * (RADIUS - activeDialogue.target.height), state.y - activeDialogue.target.y) > 4.5
      )
        closeDialogue();
    }
    const lift = currentLift ? null : getSunlineTransfer(state) || getCityLift(state);
    const prompt = lightJob.prompt || civicJob.prompt || job.prompt || reaction?.prompt || lift?.prompt;
    $("interaction").hidden =
      !playing || !prompt || !!currentLift || !!activeDialogue;
    if (prompt && $("interaction-label").textContent !== prompt)
      $("interaction-label").textContent = prompt;
    $("inventory").hidden = !playing || !job.inventory || !!activeDialogue;
    $("inventory-label").textContent = job.inventory;
    if (elapsed >= toastUntil) $("toast").hidden = true;
  }

  startButton.addEventListener("click", visitEndcap);
  $("start-city").addEventListener("click", visitCity);
  $("visit-endcap").addEventListener("click", visitEndcap);
  $("start-greenway").addEventListener("click", () => {
    player.reset();
    enter();
  });
  $("visit-city").addEventListener("click", visitCity);
  $("resume").addEventListener("click", enter);
  $("pause").addEventListener("click", pause);
  $("sound").addEventListener("click", toggleSound);
  $("reset").addEventListener("click", () => {
    currentLift = null;
    $("viewport").classList.remove("lift-travel");
    closeDialogue();
    player.reset();
    enter();
  });
  $("new-game").addEventListener("click", () => {
    if (
      !window.confirm(
        "Start a new game? This clears discoveries and all three jobs. Your sound preference is kept.",
      )
    )
      return;
    if (
      saveStore.save({
        discoveries: [],
        deliveryPhase: "available",
        maintenancePhase: "available",
        sunlinePhase: "available",
        muted: soundscape.getState().muted,
      })
    ) {
      startingNewGame = true;
      window.location.reload();
    } else {
      updateSaveStatus();
      showToast("Could not reset progress: browser storage is unavailable.", 6);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape") pause();
    if (event.code === "KeyM" && !event.repeat) {
      event.preventDefault();
      toggleSound();
      return;
    }
    if (playing && (event.code === "PageUp" || event.code === "PageDown")) {
      event.preventDefault();
      const scroller = getJobScroller();
      scroller.scrollBy(
        0,
        (event.code === "PageUp" ? -1 : 1) * scroller.clientHeight * 0.8,
      );
      return;
    }
    if (!playing || currentLift || event.repeat || event.code !== "KeyE")
      return;
    event.preventDefault();
    const state = player.getState(playerState);
    const lightResult = sunline.interact(state);
    if (lightResult) {
      closeDialogue();
      if (lightResult.changed) saveProgress();
      showToast(lightResult.message, 6);
      updateHUD();
      return;
    }
    const civicResult = maintenance.interact(state);
    if (civicResult) {
      if (civicResult.changed) saveProgress();
      if (civicResult.dialogue) showDialogue(civicResult.dialogue, CARETAKER);
      else {
        closeDialogue();
        showToast(civicResult.message, 6);
      }
      updateHUD();
      return;
    }
    const result = delivery.interact(state);
    if (result) {
      closeDialogue();
      saveProgress();
      showToast(result.message, 5);
      updateHUD();
    } else {
      const reaction = residents.getReaction(state, sunline.getPhase());
      if (reaction) {
        showDialogue(reaction.dialogue, reaction.target);
        updateHUD();
        return;
      }
      const lift = getSunlineTransfer(playerState) || getCityLift(playerState);
      if (lift) {
        closeDialogue();
        currentLift = lift;
        travelMoved = false;
        travelAt = elapsed + 0.16;
        travelEnd = elapsed + 0.34;
        $("viewport").classList.add("lift-travel");
        updateHUD();
      }
    }
  });
  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (!playing || document.pointerLockElement !== renderer.domElement)
        return;
      const scroller = getJobScroller();
      const scale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? scroller.clientHeight
            : 1;
      scroller.scrollBy(0, event.deltaY * scale);
      event.preventDefault();
    },
    { passive: false },
  );
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("pagehide", (event) => {
    if (!startingNewGame) saveProgress();
    pause();
    if (!event.persisted) void soundscape.dispose();
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitDialogueHUD();
  });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    pause();
    renderer.setAnimationLoop(null);
    showError(
      new Error("The graphics context was lost. Reload the page to restart."),
    );
  });

  player.update(0);
  updateHUD();
  updateSaveStatus();
  world.update(0, elapsed, playerState);
  renderer.render(scene, camera);
  startButton.disabled = false;
  $("start-city").disabled = false;
  $("start-greenway").disabled = false;
  $("loading").textContent =
    "Habitat ready. Your boots are the right way down.";
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (playing) {
      elapsed += dt;
      if (currentLift && !travelMoved && elapsed >= travelAt) {
        player.teleport(currentLift.destination);
        travelMoved = true;
        $("viewport").classList.remove("lift-travel");
        updateHUD();
        showToast(currentLift.message);
      }
      if (currentLift && elapsed >= travelEnd) currentLift = null;
    }
    player.update(currentLift ? 0 : dt);
    player.getState(playerState);
    if (playing) world.update(dt, elapsed, playerState);
    if (playing) soundscape.update(dt, playerState);
    camera.layers.set(playerState.height < -1 ? 1 : 0);
    hudTime += dt;
    if (hudTime >= 0.1) {
      updateHUD();
      hudTime = 0;
    }
    renderer.render(scene, camera);
  });
} catch (error) {
  showError(error);
}
