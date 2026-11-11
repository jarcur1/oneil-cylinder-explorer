import * as THREE from "three";
import "./style.css";
import { RADIUS, LENGTH } from "./habitat.js";
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
    [...DISTRICT_STOPS, ...CITY_STOPS].map((stop) => stop.id),
  );
  const world = createWorld(scene, camera, saved);
  const { delivery, maintenance } = world;
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
      "Discoveries, both jobs, and sound preferences are saved on this browser.";
  }

  function saveProgress() {
    saveWritten = saveStore.save({
      discoveries: [...found],
      deliveryPhase: delivery.getPhase(),
      maintenancePhase: maintenance.getPhase(),
      muted: soundscape.getState().muted,
    });
    updateSaveStatus();
  }

  function closeDialogue() {
    activeDialogue = null;
    $("dialogue").hidden = true;
    $("app").classList.remove("has-dialogue");
  }

  function showDialogue(dialogue) {
    activeDialogue = dialogue;
    dialogueUntil = elapsed + 14;
    $("dialogue-name").textContent = dialogue.speaker;
    $("dialogue-text").textContent = dialogue.text;
    $("dialogue").hidden = false;
    $("app").classList.add("has-dialogue");
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
    onLockChange(locked) {
      if (locked && !playing) {
        document.exitPointerLock();
        return;
      }
      if (locked) everLocked = true;
      else if (everLocked && playing) pause();
    },
  });
  player.teleport(CITY_ARRIVAL);

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
    void soundscape.setActive(true).then(updateSoundControl);
    $("intro").hidden = true;
    $("pause-panel").hidden = true;
    $("pause").hidden = false;
    $("crosshair").hidden = false;
    $("mission").hidden = false;
    $("maintenance").hidden = false;
    $("telemetry").hidden = false;
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
    $("motion").textContent = !state.grounded
      ? "AIRBORNE"
      : state.speed > 9
        ? "SPRINTING"
        : state.speed > 0.2
          ? "WALKING"
          : "ON FOOT";
    $("height").textContent = `${state.height.toFixed(1)} m UP`;
    $("track-position").style.left =
      `${THREE.MathUtils.clamp(((state.y + LENGTH / 2) / LENGTH) * 100, 0, 100)}%`;
    const arc =
      Math.atan2(Math.sin(state.theta), Math.cos(state.theta)) * RADIUS;
    $("area").textContent = inCity(arc, state.y)
      ? CITY_NAME.toUpperCase()
      : inDistrict(arc, state.y)
        ? DISTRICT_NAME.toUpperCase()
        : "OUTER PROMENADE";
    let nearest = null;
    let nearestDistance = Infinity;
    let discovered = false;
    world.stops.forEach((landmark, index) => {
      const angle = Math.atan2(
        Math.sin(landmark.theta - state.theta),
        Math.cos(landmark.theta - state.theta),
      );
      const planarDistance = Math.hypot(angle * RADIUS, landmark.y - state.y);
      const distance = Math.hypot(
        planarDistance,
        state.height - landmark.minHeight,
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
        "Habitat walk complete. Explore the skywalk, fields, and side streets.";
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
    if (activeDialogue) {
      const angle = Math.atan2(
        Math.sin(state.theta - CARETAKER.s / RADIUS),
        Math.cos(state.theta - CARETAKER.s / RADIUS),
      );
      if (
        elapsed >= dialogueUntil ||
        Math.abs(state.height - CARETAKER.height) > 0.8 ||
        Math.hypot(angle * (RADIUS - state.height), state.y - CARETAKER.y) > 4.5
      )
        closeDialogue();
    }
    const lift = currentLift ? null : getCityLift(state);
    const prompt = civicJob.prompt || job.prompt || lift?.prompt;
    $("interaction").hidden =
      !playing || !prompt || !!currentLift || !!activeDialogue;
    if (prompt && $("interaction-label").textContent !== prompt)
      $("interaction-label").textContent = prompt;
    $("inventory").hidden = !playing || !job.inventory || !!activeDialogue;
    $("inventory-label").textContent = job.inventory;
    if (elapsed >= toastUntil) $("toast").hidden = true;
  }

  startButton.addEventListener("click", visitCity);
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
        "Start a new game? This clears discoveries and both jobs. Your sound preference is kept.",
      )
    )
      return;
    if (
      saveStore.save({
        discoveries: [],
        deliveryPhase: "available",
        maintenancePhase: "available",
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
    const civicResult = maintenance.interact(state);
    if (civicResult) {
      if (civicResult.changed) saveProgress();
      if (civicResult.dialogue) showDialogue(civicResult.dialogue);
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
      const lift = getCityLift(playerState);
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
  world.update(0, elapsed);
  renderer.render(scene, camera);
  startButton.disabled = false;
  $("start-greenway").disabled = false;
  $("loading").textContent =
    "Habitat ready. Your boots are the right way down.";
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (playing) {
      elapsed += dt;
      world.update(dt, elapsed);
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
    if (playing) soundscape.update(dt, player.getState(playerState));
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
