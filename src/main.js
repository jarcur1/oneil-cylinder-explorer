import * as THREE from "three";
import "./style.css";
import { RADIUS, LENGTH, GRAVITY, VIEW_DISTANCE } from "./habitat.js";
import { createWorld } from "./world.js";
import { createPlayer } from "./player.js";
import { DISTRICT_NAME, inDistrict } from "./district-layout.js";
import { createSoundscape } from "./soundscape.js";
import { CITY_NAME, CITY_ARRIVAL, inCity } from "./city-layout.js";
import { RESERVOIR_NAME, RESERVOIR_ARRIVAL, inReservoir } from "./reservoir-layout.js";
import { getCityLift } from "./city-transit.js";
import { CARETAKER } from "./maintenance-layout.js";
import { createSaveStore } from "./save-game.js";
import { SERVICE_NAME, inServiceLevel } from "./service-layout.js";
import { AXIAL_HEIGHT, ENDCAP_ARRIVAL, getAxialHub } from "./sunline-layout.js";
import { getSunlineTransfer } from "./sunline-transit.js";
import { LANDMARKS } from "./landmarks.js";
import { createNavigation } from "./navigation.js";
import { createHabitatMap } from "./habitat-map.js";
import { createWaypoint } from "./waypoint.js";
import {
  wrappedDeltaTheta,
  horizontalDistance,
  spatialDistance,
} from "./cylinder-math.js";
const $ = (id) => document.getElementById(id);
const ENDCAP_AREA_Y = LENGTH / 2 - 50;
const startButton = $("start");
const mapButton = $("map-toggle");
startButton.disabled = true;
if (mapButton) mapButton.disabled = true;
let fatalError = false;

function showError(error) {
  fatalError = true;
  for (const id of ["start", "start-city", "start-greenway", "start-reservoir"]) {
    const button = $(id);
    if (button) button.disabled = true;
  }
  if (mapButton) {
    mapButton.disabled = true;
    mapButton.setAttribute("aria-expanded", "false");
  }
  const pausePanel = $("pause-panel");
  if (pausePanel) pausePanel.hidden = true;
  $("error").hidden = false;
  $("error-message").textContent = error?.message || String(error);
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
  const ui = {
    app: $("app"),
    viewport: $("viewport"),
    intro: $("intro"),
    pausePanel: $("pause-panel"),
    pauseBtn: $("pause"),
    mapBtn: mapButton,
    resumeBtn: $("resume"),
    resetBtn: $("reset"),
    visitEndcapBtn: $("visit-endcap"),
    visitCityBtn: $("visit-city"),
    startCityBtn: $("start-city"),
    startGreenwayBtn: $("start-greenway"),
    startReservoirBtn: $("start-reservoir"),
    teleportReservoirBtn: $("teleport-reservoir"),
    newGameBtn: $("new-game"),
    soundBtn: $("sound"),
    loading: $("loading"),
    crosshair: $("crosshair"),
    compactPhysics: $("compact-physics"),
    telemetry: $("telemetry"),
    position: $("position"),
    motion: $("motion"),
    height: $("height"),
    gravity: $("gravity"),
    trackPosition: $("track-position"),
    area: $("area"),
    footerRight: $("footer-right"),
    saveStatus: $("save-status"),
    mission: $("mission"),
    missionHeading: $("mission").querySelector("h2"),
    progress: $("progress"),
    landmarks: $("landmarks"),
    objective: $("objective"),
    discoveryToggle: $("discovery-toggle"),
    discoveryDetails: $("discovery-details"),
    discoverySummary: $("discovery-summary"),
    jobsToggle: $("jobs-toggle"),
    jobsDetails: $("jobs-details"),
    jobsSummary: $("jobs-summary"),
    jobScrollHint: $("job-scroll-hint"),
    job: $("job"),
    jobHelp: $("job").querySelector(".job-help"),
    jobTitle: $("job-title"),
    jobObjective: $("job-objective"),
    jobProgress: $("job-progress"),
    jobStatus: $("job-status"),
    jobDistance: $("job-distance"),
    maintenance: $("maintenance"),
    maintenanceTitle: $("maintenance-title"),
    maintenanceObjective: $("maintenance-objective"),
    maintenanceProgress: $("maintenance-progress"),
    maintenanceStatus: $("maintenance-status"),
    maintenanceDistance: $("maintenance-distance"),
    sunlineJob: $("sunline-job"),
    sunlineTitle: $("sunline-title"),
    sunlineObjective: $("sunline-objective"),
    sunlineProgress: $("sunline-progress"),
    sunlineStatus: $("sunline-status"),
    sunlineDistance: $("sunline-distance"),
    sunlineDistrict: $("sunline-district"),
    interaction: $("interaction"),
    interactionLabel: $("interaction-label"),
    inventory: $("inventory"),
    inventoryLabel: $("inventory-label"),
    toast: $("toast"),
    dialogue: $("dialogue"),
    dialogueName: $("dialogue-name"),
    dialogueText: $("dialogue-text"),
    waypoint: $("waypoint"),
    jobStack: document.querySelector(".job-stack"),
    hudCards: document.querySelector(".hud-cards"),
  };
  ui.viewport.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.08,
    VIEW_DISTANCE,
  );
  scene.add(camera);
  const saveStore = createSaveStore();
  const saved = saveStore.load(LANDMARKS.map((stop) => stop.id));
  const world = createWorld(scene, camera, saved);
  const { delivery, maintenance, sunline, residents, trams } = world;
  const tramByLineId = new Map(trams.map((tram) => [tram.lineId, tram]));
  const tramStops = new Map(
    trams.map((tram) => [tram.lineId, new Map(tram.line.stops.map((stop) => [stop.id, stop]))]),
  );
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
  let pendingTransfer = null;
  let travelAt = 0;
  let travelEnd = 0;
  let travelMoved = false;
  let activeDialogue = null;
  let dialogueUntil = 0;
  let saveWritten = false;
  const navigation = createNavigation();
  const waypointMarker = createWaypoint(camera, ui.waypoint);
  const waypointResult = {};
  const tramMapSnapshots = trams.map((tram) => ({ lineId: tram.lineId, state: {} }));
  const tramHudSnapshot = {};
  const tramStopSnapshot = {};
  const tramInteraction = { tram: null, action: null };
  function getTramInteraction(state) {
    tramInteraction.tram = null;
    tramInteraction.action = null;
    if (state.traversalMode === "tram") {
      const tram = tramByLineId.get(state.rideLineId);
      if (tram) {
        tramInteraction.tram = tram;
        tramInteraction.action = tram.getInteraction(state);
      }
      return tramInteraction;
    }
    for (const tram of trams) {
      const action = tram.getInteraction(state);
      if (action?.kind === "board") {
        tramInteraction.tram = tram;
        tramInteraction.action = action;
        break;
      }
      if (action?.kind === "inspect" && !tramInteraction.action) {
        tramInteraction.tram = tram;
        tramInteraction.action = action;
      }
    }
    return tramInteraction;
  }
  const jobViews = {
    delivery: null,
    maintenance: null,
    sunline: null,
  };
  let mapOpen = false;
  let mapReturnMode = null;
  let mapReturnFocus = null;
  const compactHUD = window.matchMedia("(max-width: 520px)");
  function setText(el, value) {
    const text = value ?? "";
    if (el.textContent !== text) el.textContent = text;
  }

  function setHidden(el, hidden) {
    const next = Boolean(hidden);
    if (el.hidden !== next) el.hidden = next;
  }

  function setAttr(el, name, value) {
    const next = String(value);
    if (el.getAttribute(name) !== next) el.setAttribute(name, next);
  }

  function setData(el, key, value) {
    const next = String(value);
    if (el.dataset[key] !== next) el.dataset[key] = next;
  }

  function setClass(el, name, enabled) {
    const next = Boolean(enabled);
    if (el.classList.contains(name) !== next) el.classList.toggle(name, next);
  }

  function getJobScroller() {
    return compactHUD.matches ? ui.hudCards : ui.jobStack;
  }

  function setHudExpanded(button, details, summary, expanded) {
    setAttr(button, "aria-expanded", expanded);
    setHidden(details, !expanded);
    setHidden(summary, expanded);
  }

  function openJobs() {
    setHudExpanded(ui.jobsToggle, ui.jobsDetails, ui.jobsSummary, true);
  }

  for (const [button, details, summary] of [
    [ui.discoveryToggle, ui.discoveryDetails, ui.discoverySummary],
    [ui.jobsToggle, ui.jobsDetails, ui.jobsSummary],
  ]) {
    button.addEventListener("click", () => {
      if (fatalError || mapOpen) return;
      setHudExpanded(button, details, summary, button.getAttribute("aria-expanded") !== "true");
    });
    button.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.code === "Enter") event.stopPropagation();
    });
  }

  function updateSaveStatus() {
    const status = saveStore.getStatus();
    const text = !status.available
      ? "SAVING UNAVAILABLE"
      : status.recovered
        ? "SAVE RECOVERED"
        : saveWritten
          ? "PROGRESS SAVED"
          : "LOCAL AUTOSAVE";
    const title =
      status.error ||
      "Discoveries, all three jobs, and sound preferences are saved on this browser.";
    setText(ui.saveStatus, text);
    setAttr(ui.saveStatus, "title", title);
  }

  function saveProgress() {
    saveWritten = saveStore.save({
      discoveries: [...found],
      deliveryPhase: delivery.getPhase(),
      supplyPhase: delivery.getSupplyPhase(),
      plantingPhase: delivery.getPlantingPhase(),
      maintenancePhase: maintenance.getPhase(),
      sunlinePhase: sunline.getPhase(),
      muted: soundscape.getState().muted,
    });
    updateSaveStatus();
  }

  function closeDialogue() {
    activeDialogue = null;
    setHidden(ui.dialogue, true);
    ui.app.classList.remove("has-dialogue");
  }

  function fitDialogueHUD() {
    if (!activeDialogue || !compactHUD.matches) return;
    const room =
      ui.dialogue.getBoundingClientRect().top -
      ui.hudCards.getBoundingClientRect().top -
      12;
    ui.hudCards.style.setProperty(
      "--dialogue-room",
      `${Math.max(0, Math.floor(room))}px`,
    );
  }

  function showDialogue(dialogue, target) {
    activeDialogue = { target };
    dialogueUntil = elapsed + 14;
    setText(ui.dialogueName, dialogue.speaker);
    setText(ui.dialogueText, dialogue.text);
    setHidden(ui.dialogue, false);
    ui.app.classList.add("has-dialogue");
    fitDialogueHUD();
  }

  function showToast(message, duration = 4) {
    setText(ui.toast, message);
    setHidden(ui.toast, false);
    toastUntil = elapsed + duration;
  }

  function updateSoundControl() {
    const { muted, status, error } = soundscape.getState();
    const button = ui.soundBtn;
    const disabled = status === "unavailable";
    const text = disabled
      ? "SOUND N/A"
      : status === "blocked"
        ? "ENABLE SOUND"
        : muted
          ? "SOUND OFF"
          : "SOUND ON";
    const label = disabled
      ? "Sound unavailable"
      : status === "blocked"
        ? "Enable sound"
        : muted
          ? "Unmute sound"
          : "Mute sound";
    const title =
      error ||
      "M toggles mute. Sound starts after entering and pauses with the game.";
    setData(button, "status", status);
    if (button.disabled !== disabled) button.disabled = disabled;
    setText(button, text);
    setAttr(button, "aria-pressed", muted);
    setAttr(button, "aria-label", label);
    setAttr(button, "title", title);
  }

  function syncAudio(fn) {
    try {
      Promise.resolve(fn()).then(updateSoundControl, (err) => {
        console.error(err);
        updateSoundControl();
      });
    } catch (err) {
      console.error(err);
      updateSoundControl();
    }
  }

  function toggleSound() {
    const { muted, status } = soundscape.getState();
    if (status === "unavailable") {
      updateSoundControl();
      return;
    }
    syncAudio(() =>
      status === "blocked"
        ? soundscape.setActive(playing)
        : soundscape.setMuted(!muted),
    );
    updateSoundControl();
    if (status !== "blocked") saveProgress();
  }

  function cancelPendingTransfer() {
    pendingTransfer = null;
    travelMoved = false;
    travelAt = 0;
    travelEnd = 0;
    ui.viewport.classList.remove("lift-travel");
  }

  function pause(options) {
    if (fatalError) {
      mapReturnMode = null;
      mapReturnFocus = null;
      mapOpen = false;
      setAttr(ui.mapBtn, "aria-expanded", false);
      ui.mapBtn.disabled = true;
      if (habitatMap.isOpen()) habitatMap.close();
      setHidden(ui.pausePanel, true);
      setHidden(ui.mission, true);
      setHidden(ui.jobStack, true);
    }
    if (!playing) return;
    const showPanel =
      !fatalError &&
      (options && typeof options.showPanel === "boolean"
        ? options.showPanel
        : !mapOpen);
    lockRequest++;
    playing = false;
    renderer.setAnimationLoop(null);
    player.setEnabled(false);
    delivery.setActive(false);
    sunline.setActive(false);
    closeDialogue();
    waypointMarker.hide();
    setHidden(ui.interaction, true);
    setHidden(ui.inventory, true);
    setHidden(ui.pausePanel, !showPanel);
    setHidden(ui.pauseBtn, true);
    setHidden(ui.crosshair, true);
    if (document.pointerLockElement === renderer.domElement)
      document.exitPointerLock();
    if (showPanel) ui.resumeBtn.focus();
    if (!fatalError) renderScene();
    syncAudio(() => soundscape.setActive(false));
  }

  function handleFatalError(error) {
    fatalError = true;
    cancelPendingTransfer();
    pause({ showPanel: false });
    renderer.setAnimationLoop(null);
    showError(error);
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
    if (fatalError || mapOpen || habitatMap.isOpen()) return;
    cancelPendingTransfer();
    closeDialogue();
    player.teleport(ENDCAP_ARRIVAL);
    enter();
  }

  function visitCity() {
    if (fatalError || mapOpen || habitatMap.isOpen()) return;
    cancelPendingTransfer();
    closeDialogue();
    player.teleport(CITY_ARRIVAL);
    enter();
  }

  function visitReservoir() {
    if (fatalError || mapOpen || habitatMap.isOpen()) return;
    cancelPendingTransfer();
    closeDialogue();
    player.teleport(RESERVOIR_ARRIVAL);
    enter();
  }

  function renderScene() {
    if (fatalError) return;
    player.getState(playerState);
    camera.layers.set(playerState.height < -1 ? 1 : 0);
    renderer.render(scene, camera);
  }

  function updateFooter(state, locked = state.locked) {
    const footerText =
      state.traversalMode === "tram"
        ? "TRAM PASSENGER · LOOK FREELY · E AT STOPS"
        : state.traversalMode === "trolley"
          ? "W/S · DRIVE / REVERSE · LOOK FREELY · E · DOCK / SERVICE"
          : state.traversalMode === "secured"
            ? "MAG BOOTS · WASD · E · CONTROL / BOARD / LIFT"
            : locked
              ? "E TO INTERACT · ESC TO PAUSE"
              : "DRAG / ARROWS TO LOOK · E TO INTERACT";
    setText(ui.footerRight, footerText);
  }

  function enter() {
    if (fatalError || mapOpen || habitatMap.isOpen()) return;
    try {
      const request = ++lockRequest;
      playing = true;
      everLocked = false;
      player.setEnabled(true);
      delivery.setActive(true);
      sunline.setActive(true);
      setHidden(ui.intro, true);
      setHidden(ui.pausePanel, true);
      setHidden(ui.pauseBtn, false);
      setHidden(ui.crosshair, false);
      setHidden(ui.mission, false);
      setHidden(ui.jobStack, false);
      setHidden(ui.maintenance, false);
      setHidden(ui.sunlineJob, false);
      setHidden(ui.telemetry, false);
      setHidden(ui.compactPhysics, false);
      setHidden(ui.job, false);
      setHidden(ui.jobScrollHint, false);
      updateHUD();
      hudTime = 0;
      clock.getDelta();
      renderer.setAnimationLoop(animate);
      document.activeElement?.blur();
      player.requestLock().then((locked) => {
        if (!playing || fatalError || request !== lockRequest) return;
        updateFooter(player.getState(playerState), locked);
      });
      syncAudio(() => soundscape.setActive(true));
    } catch (error) {
      handleFatalError(error);
    }
  }
  function getJobViews(state) {
    jobViews.delivery = delivery.getView(state);
    jobViews.maintenance = maintenance.getView(state);
    jobViews.sunline = sunline.getView(state);
    return jobViews;
  }

  function buildMapSnapshot() {
    const state = player.getState(playerState);
    const jobs = getJobViews(state);
    const selection = navigation.getSelection();
    const waypoint = navigation.getWaypoint(state, jobs, waypointResult);
    for (let i = 0; i < trams.length; i++) {
      trams[i].getState(tramMapSnapshots[i].state);
    }
    return {
      player: state,
      found,
      jobs,
      selection,
      waypoint,
      trams: tramMapSnapshots,
    };
  }

  function handleMapSelect(selection) {
    if (fatalError) return;
    try {
      navigation.select(selection);
      const snapshot = buildMapSnapshot();
      if (habitatMap.isOpen()) {
        habitatMap.render(snapshot);
      }
      if (playing && !mapOpen && snapshot.waypoint) {
        waypointMarker.update(snapshot.player, snapshot.waypoint);
      } else {
        waypointMarker.hide();
      }
    } catch (error) {
      handleFatalError(error);
    }
  }

  function handleMapClose() {
    closeMap();
  }

  const habitatMap = createHabitatMap({
    onSelect: handleMapSelect,
    onClose: handleMapClose,
  });

  function openMap() {
    if (fatalError || mapOpen || habitatMap.isOpen() || ui.mapBtn.disabled)
      return;
    try {
      mapReturnFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (playing) {
        mapReturnMode = "playing";
        mapOpen = true;
        pause({ showPanel: false });
      } else if (!ui.intro.hidden) {
        mapReturnMode = "intro";
        mapOpen = true;
      } else {
        mapReturnMode = "pause";
        mapOpen = true;
        setHidden(ui.pausePanel, true);
      }
      waypointMarker.hide();
      setAttr(ui.mapBtn, "aria-expanded", true);
      habitatMap.open(buildMapSnapshot());
    } catch (error) {
      handleFatalError(error);
    }
  }

  function restoreAfterMap(returnMode) {
    if (fatalError) {
      setHidden(ui.pausePanel, true);
      return;
    }
    if (returnMode === "playing") {
      if (!document.hidden) {
        enter();
        return;
      }
      setHidden(ui.pausePanel, false);
      setHidden(ui.pauseBtn, true);
      ui.resumeBtn.focus();
      return;
    }
    if (returnMode === "pause") {
      setHidden(ui.pausePanel, false);
      if (
        mapReturnFocus &&
        mapReturnFocus.isConnected &&
        !mapReturnFocus.disabled &&
        !mapReturnFocus.closest("[hidden]")
      ) {
        mapReturnFocus.focus();
      } else {
        ui.resumeBtn.focus();
      }
      return;
    }
    if (returnMode === "intro") {
      if (
        mapReturnFocus &&
        mapReturnFocus.isConnected &&
        !mapReturnFocus.disabled &&
        !mapReturnFocus.closest("[hidden]")
      ) {
        mapReturnFocus.focus();
      } else {
        startButton.focus();
      }
    }
  }

  function closeMap() {
    if (!mapOpen && !habitatMap.isOpen()) return;
    const returnMode = mapReturnMode;
    mapOpen = false;
    mapReturnMode = null;
    setAttr(ui.mapBtn, "aria-expanded", false);
    if (habitatMap.isOpen()) {
      habitatMap.close();
    }
    restoreAfterMap(returnMode);
    mapReturnFocus = null;
  }

  function toggleMap() {
    if (fatalError || ui.mapBtn.disabled) return;
    if (mapOpen || habitatMap.isOpen()) closeMap();
    else openMap();
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
    ui.landmarks.appendChild(row);
    return { row, distance };
  });

  function updateHUD() {
    const state = player.getState(playerState);
    const degrees = ((((state.theta * 180) / Math.PI) % 360) + 360) % 360;
    setText(
      ui.position,
      `${degrees.toFixed(0).padStart(3, "0")}° / ${Math.round(state.y + LENGTH / 2)
        .toString()
        .padStart(3, "0")} m`,
    );
    const motionText =
      state.traversalMode === "tram"
        ? `TRAM PASSENGER · ${state.speed.toFixed(1)} m/s`
        : state.traversalMode === "trolley"
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
    setText(ui.motion, motionText);
    const heightLabel = `${Math.abs(state.height).toFixed(1)} m ${state.height < -0.05 ? "DOWN" : "UP"}`;
    const gravityLabel = `${(state.gravity / GRAVITY).toFixed(3)} G`;
    setText(ui.height, heightLabel);
    const gravityTitle =
      state.traversalMode === "tram"
        ? "Apparent gravity at tram floor height (13 m), scaled with radius. Mechanical support; Coriolis is deferred."
        : state.height >= AXIAL_HEIGHT - 1
          ? "At-rest apparent gravity. Magnetic boots or the rail supply mechanical support; Coriolis is deferred."
          : "Apparent gravity at your feet, scaled with radius.";
    setAttr(ui.gravity, "title", gravityTitle);
    setText(ui.gravity, gravityLabel);
    setText(ui.compactPhysics, `${gravityLabel} · ${heightLabel}`);
    const trackLeft = `${THREE.MathUtils.clamp(((state.y + LENGTH / 2) / LENGTH) * 100, 0, 100)}%`;
    if (ui.trackPosition.style.left !== trackLeft)
      ui.trackPosition.style.left = trackLeft;
    const arc = wrappedDeltaTheta(state.theta, 0) * RADIUS;
    const axialHub = getAxialHub(state);
    let areaText;
    if (state.traversalMode === "tram") {
      const tram = tramByLineId.get(state.rideLineId);
      const tramState = tram?.getState(tramHudSnapshot);
      const stopId = tramState && (tramState.stationId || tramState.nextStationId);
      const stop = stopId ? tramStops.get(tram.lineId).get(stopId) : null;
      const name = tram?.line.axis === "theta" ? "STILLWATER TRAM" : "CIVILIAN TRAM";
      if (tramState?.stationId && stop) {
        areaText = `${name} · ${stop.name.toUpperCase()}`;
      } else if (stop) {
        areaText = `${name} · TO ${stop.name.toUpperCase()}`;
      } else {
        areaText = `${name} · ELEVATED GUIDEWAY`;
      }
    } else if (axialHub) {
      areaText = `${axialHub.label.toUpperCase()} · MAINTENANCE HUB`;
    } else if (state.traversalMode === "trolley") {
      areaText = "SUNLINE SERVICE SPINE";
    } else if (inServiceLevel(arc, state.y, state.height)) {
      areaText = SERVICE_NAME.toUpperCase();
    } else if (inCity(arc, state.y)) {
      areaText = CITY_NAME.toUpperCase();
    } else if (inDistrict(arc, state.y)) {
      areaText = DISTRICT_NAME.toUpperCase();
    } else if (state.height >= -1 && state.height < 8 && inReservoir(arc, state.y)) {
      areaText = RESERVOIR_NAME.toUpperCase();
    } else if (state.height < 2 && state.y < -ENDCAP_AREA_Y) {
      areaText = "ENDCAP A · RIM ACCESS";
    } else if (state.height < 2 && state.y > ENDCAP_AREA_Y) {
      areaText = "ENDCAP B · RIM ACCESS";
    } else {
      areaText = "OUTER PROMENADE";
    }
    setText(ui.area, areaText);
    updateFooter(state);
    let nearest = null;
    let nearestDistance = Infinity;
    let discovered = false;
    world.stops.forEach((landmark, index) => {
      const targetHeight = landmark.height ?? landmark.minHeight;
      const planarDistance = horizontalDistance(
        state.theta,
        state.y,
        landmark.theta,
        landmark.y,
        targetHeight,
      );
      const distance = spatialDistance(
        state.theta,
        state.y,
        state.height,
        landmark.theta,
        landmark.y,
        targetHeight,
      );
      if (
        playing &&
        state.traversalMode !== "tram" &&
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
      const distText = found.has(landmark.id)
        ? "VISITED"
        : planarDistance < landmark.radius && state.height < landmark.minHeight
          ? "UPSTAIRS"
          : planarDistance < landmark.radius &&
              state.height > (landmark.maxHeight ?? Infinity)
            ? "BELOW"
            : `${Math.round(distance)} m`;
      setText(rows[index].distance, distText);
      if (!found.has(landmark.id) && distance < nearestDistance) {
        nearest = landmark;
        nearestDistance = distance;
      }
    });
    if (discovered) saveProgress();
    setText(ui.progress, `${found.size} / ${world.stops.length}`);
    setText(
      ui.missionHeading,
      nearest ? "A world that works." : "A place to call home.",
    );
    setText(
      ui.objective,
      nearest
        ? `${nearest.name} · ${Math.round(nearestDistance)} m. ${nearest.hint}`
        : "Habitat walk complete. Explore the endcaps, service spine, utility rooms, and neighborhoods.",
    );
    setText(
      ui.discoverySummary,
      nearest ? `${nearest.name} · ${Math.round(nearestDistance)} m` : "All landmarks discovered.",
    );
    const jobs = getJobViews(state);
    const job = jobs.delivery;
    if (ui.job.dataset.phase !== job.phase || ui.job.dataset.run !== job.id) {
      ui.job.dataset.phase = job.phase;
      ui.job.dataset.run = job.id;
      setClass(ui.job, "complete", job.phase === "complete");
      setText(ui.jobTitle, job.title);
      setText(ui.jobObjective, job.objective);
      setText(ui.jobProgress, job.progress);
      setText(ui.jobStatus, job.status);
      setHidden(ui.jobHelp, job.phase === "complete");
    }
    setText(
      ui.jobDistance,
      job.target ? `${Math.round(job.distance)} m` : "THANK YOU",
    );
    const civicJob = jobs.maintenance;
    if (ui.maintenance.dataset.phase !== civicJob.phase) {
      ui.maintenance.dataset.phase = civicJob.phase;
      setClass(ui.maintenance, "complete", civicJob.phase === "complete");
      setText(ui.maintenanceTitle, civicJob.title);
      setText(ui.maintenanceObjective, civicJob.objective);
      setText(ui.maintenanceProgress, civicJob.progress);
      setText(ui.maintenanceStatus, civicJob.status);
    }
    setText(
      ui.maintenanceDistance,
      civicJob.target ? `${Math.round(civicJob.distance)} m` : "THANK YOU",
    );
    const lightJob = jobs.sunline;
    if (ui.sunlineJob.dataset.phase !== lightJob.phase) {
      ui.sunlineJob.dataset.phase = lightJob.phase;
      setClass(ui.sunlineJob, "complete", lightJob.phase === "complete");
      setText(ui.sunlineTitle, lightJob.title);
      setText(ui.sunlineObjective, lightJob.objective);
      setText(ui.sunlineProgress, lightJob.progress);
      setText(ui.sunlineStatus, lightJob.status);
    }
    setText(
      ui.sunlineDistance,
      lightJob.target ? `${Math.round(lightJob.distance)} m` : "ONLINE",
    );
    const districtStatus = lightJob.districtStatus;
    setText(
      ui.sunlineDistrict,
      `${districtStatus.name} · ${districtStatus.status}`,
    );
    const tracking = navigation.getSelection();
    const trackedJob = tracking?.kind === "job" ? jobs[tracking.id] : null;
    const summaryJob = trackedJob || job;
    setText(
      ui.jobsSummary,
      `${summaryJob.title} · ${summaryJob.status}${summaryJob.target ? ` · ${Math.round(summaryJob.distance)} m` : ""}`,
    );
    setData(ui.sunlineDistrict, "online", districtStatus.online);
    const reaction = residents.getReaction(state, lightJob.phase);
    if (activeDialogue) {
      const target = activeDialogue.target;
      if (
        elapsed >= dialogueUntil ||
        Math.abs(state.height - target.height) > 0.8 ||
        horizontalDistance(
          state.theta,
          state.y,
          target.s / RADIUS,
          target.y,
          target.height,
        ) > 4.5
      )
        closeDialogue();
    }
    const tramAction = pendingTransfer ? null : getTramInteraction(state).action;
    const lift =
      pendingTransfer || state.traversalMode === "tram"
        ? null
        : getSunlineTransfer(state) || getCityLift(state);
    let prompt = null;
    if (!pendingTransfer) {
      if (state.traversalMode === "tram") {
        prompt = tramAction?.kind === "exit" ? tramAction.prompt : null;
      } else if (tramAction?.kind === "board") {
        prompt = tramAction.prompt;
      } else {
        prompt =
          lightJob.prompt ||
          civicJob.prompt ||
          job.prompt ||
          reaction?.prompt ||
          lift?.prompt ||
          (tramAction?.kind === "inspect" ? tramAction.prompt : null);
      }
    }
    const hideInteraction =
      !playing || !prompt || !!pendingTransfer || !!activeDialogue;
    setHidden(ui.interaction, hideInteraction);
    if (prompt) setText(ui.interactionLabel, prompt);
    setHidden(ui.inventory, !playing || !job.inventory || !!activeDialogue);
    setText(ui.inventoryLabel, job.inventory);
    if (elapsed >= toastUntil) setHidden(ui.toast, true);
    const waypoint = navigation.getWaypoint(state, jobs, waypointResult);
    if (playing && !mapOpen && waypoint) {
      waypointMarker.update(state, waypoint);
    } else {
      waypointMarker.hide();
    }
  }

  startButton.addEventListener("click", visitEndcap);
  ui.startCityBtn.addEventListener("click", visitCity);
  ui.startReservoirBtn.addEventListener("click", visitReservoir);
  ui.teleportReservoirBtn.addEventListener("click", visitReservoir);
  ui.visitEndcapBtn.addEventListener("click", visitEndcap);
  ui.startGreenwayBtn.addEventListener("click", () => {
    if (fatalError || mapOpen || habitatMap.isOpen()) return;
    cancelPendingTransfer();
    closeDialogue();
    player.reset();
    enter();
  });
  ui.visitCityBtn.addEventListener("click", visitCity);
  ui.resumeBtn.addEventListener("click", enter);
  ui.pauseBtn.addEventListener("click", pause);
  ui.mapBtn.addEventListener("click", toggleMap);
  ui.soundBtn.addEventListener("click", toggleSound);
  ui.resetBtn.addEventListener("click", () => {
    if (fatalError || mapOpen || habitatMap.isOpen()) return;
    cancelPendingTransfer();
    closeDialogue();
    player.reset();
    enter();
  });
  ui.newGameBtn.addEventListener("click", () => {
    if (
      !window.confirm(
        "Start a new game? This clears discoveries and all three jobs. Your sound preference is kept.",
      )
    )
      return;
    cancelPendingTransfer();
    if (
      saveStore.save({
        discoveries: [],
        deliveryPhase: "available",
        supplyPhase: "available",
        plantingPhase: "available",
        maintenancePhase: "available",
        sunlinePhase: "available",
        muted: soundscape.getState().muted,
      })
    ) {
      window.location.reload();
    } else {
      updateSaveStatus();
      updateHUD();
      showToast("Could not reset progress: browser storage is unavailable.", 6);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      if (mapOpen || habitatMap.isOpen()) {
        event.preventDefault();
        closeMap();
        return;
      }
      pause();
      return;
    }
    if (
      event.code === "KeyG" &&
      !event.repeat &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (fatalError || ui.mapBtn.disabled) return;
      event.preventDefault();
      toggleMap();
      return;
    }
    if (event.code === "KeyM" && !event.repeat) {
      event.preventDefault();
      toggleSound();
      return;
    }
    if (mapOpen || habitatMap.isOpen()) return;
    if (
      playing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey &&
      (event.code === "KeyH" || event.code === "KeyJ") &&
      !event.target?.closest?.("input, textarea, select, [contenteditable='true']")
    ) {
      event.preventDefault();
      const discovery = event.code === "KeyH";
      const button = discovery ? ui.discoveryToggle : ui.jobsToggle;
      setHudExpanded(
        button,
        discovery ? ui.discoveryDetails : ui.jobsDetails,
        discovery ? ui.discoverySummary : ui.jobsSummary,
        button.getAttribute("aria-expanded") !== "true",
      );
      return;
    }
    if (playing && (event.code === "PageUp" || event.code === "PageDown")) {
      event.preventDefault();
      openJobs();
      const scroller = getJobScroller();
      scroller.scrollBy(
        0,
        (event.code === "PageUp" ? -1 : 1) * scroller.clientHeight * 0.8,
      );
      return;
    }
    if (!playing || pendingTransfer || event.repeat || event.code !== "KeyE")
      return;
    event.preventDefault();
    try {
      const state = player.getState(playerState);
      const { tram, action: tramAction } = getTramInteraction(state);
      if (state.traversalMode === "tram") {
        if (tramAction?.kind === "exit") {
          closeDialogue();
          pendingTransfer = {
            kind: "exit",
            tram,
            stationId: tramAction.stationId,
            message: tramAction.message,
          };
          travelMoved = false;
          travelAt = elapsed + 0.16;
          travelEnd = elapsed + 0.34;
          ui.viewport.classList.add("lift-travel");
          updateHUD();
        }
        return;
      }
      if (tramAction?.kind === "board") {
        closeDialogue();
        pendingTransfer = {
          kind: "board",
          tram,
          stationId: tramAction.stationId,
          message: tramAction.message,
        };
        travelMoved = false;
        travelAt = elapsed + 0.16;
        travelEnd = elapsed + 0.34;
        ui.viewport.classList.add("lift-travel");
        updateHUD();
        return;
      }
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
        const tracking = navigation.getSelection();
        if (delivery.getPlantingPhase() === "complete" &&
            tracking?.kind === "job" && tracking.id === "delivery") {
          navigation.select(null);
        }
        saveProgress();
        showToast(result.message, 5);
        updateHUD();
        return;
      }
      const reaction = residents.getReaction(state, sunline.getPhase());
      if (reaction) {
        showDialogue(reaction.dialogue, reaction.target);
        updateHUD();
        return;
      }
      const lift = getSunlineTransfer(state) || getCityLift(state);
      if (lift) {
        closeDialogue();
        pendingTransfer = {
          kind: "lift",
          destination: lift.destination,
          message: lift.message,
        };
        travelMoved = false;
        travelAt = elapsed + 0.16;
        travelEnd = elapsed + 0.34;
        ui.viewport.classList.add("lift-travel");
        updateHUD();
        return;
      }
      if (tramAction?.kind === "inspect") {
        closeDialogue();
        const status = tram.getStopStatus(tramAction.stationId, tramStopSnapshot);
        if (!status) throw new Error(`Unknown tram station: ${tramAction.stationId}`);
        const stops = tramStops.get(tram.lineId);
        const stop = stops.get(status.stationId);
        const destination = stops.get(status.destinationStationId);
        const service = !status.docked
          ? `Arrives in ${Math.ceil(status.arrivalIn)} s`
          : status.boardingOpen
            ? `Boarding · departs in ${Math.ceil(status.departureIn)} s`
            : "Doors closing · wait for the next service";
        showToast(`${stop.name} · ${service} · To ${destination.name}`, 8);
        updateHUD();
      }
    } catch (error) {
      handleFatalError(error);
    }
  });
  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (
        !playing ||
        mapOpen ||
        document.pointerLockElement !== renderer.domElement
      )
        return;
      openJobs();
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
    pause();
    if (!event.persisted) {
      try {
        Promise.resolve(soundscape.dispose()).catch((err) => {
          console.error(err);
        });
      } catch (err) {
        console.error(err);
      }
    }
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitDialogueHUD();
    try {
      if (!playing && !fatalError) renderScene();
      if (!fatalError && mapOpen && habitatMap.isOpen()) {
        habitatMap.render(buildMapSnapshot());
      }
    } catch (error) {
      handleFatalError(error);
    }
  });
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    fatalError = true;
    mapReturnMode = null;
    mapReturnFocus = null;
    mapOpen = false;
    setAttr(ui.mapBtn, "aria-expanded", false);
    ui.mapBtn.disabled = true;
    if (habitatMap.isOpen()) habitatMap.close();
    pause({ showPanel: false });
    renderer.setAnimationLoop(null);
    showError(
      new Error("The graphics context was lost. Reload the page to restart."),
    );
  });

  function animate() {
    if (!playing || fatalError) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    try {
      for (const tram of trams) tram.update(dt);
      if (pendingTransfer && !travelMoved && elapsed >= travelAt) {
        player.getState(playerState);
        if (pendingTransfer.kind === "board") {
          if (
            pendingTransfer.tram.canCommitTransfer(
              "board",
              pendingTransfer.stationId,
              playerState,
            )
          ) {
            player.attachRide(pendingTransfer.tram);
            travelMoved = true;
            ui.viewport.classList.remove("lift-travel");
            updateHUD();
            if (pendingTransfer.message) showToast(pendingTransfer.message);
          } else {
            cancelPendingTransfer();
            updateHUD();
          }
        } else if (pendingTransfer.kind === "exit") {
          if (
            pendingTransfer.tram.canCommitTransfer(
              "exit",
              pendingTransfer.stationId,
              playerState,
            )
          ) {
            const stop = tramStops.get(pendingTransfer.tram.lineId).get(pendingTransfer.stationId);
            if (!stop) {
              throw new Error(
                `Unknown tram stop: ${pendingTransfer.stationId}`,
              );
            }
            player.teleport(stop);
            travelMoved = true;
            ui.viewport.classList.remove("lift-travel");
            updateHUD();
            if (pendingTransfer.message) showToast(pendingTransfer.message);
          } else {
            cancelPendingTransfer();
            updateHUD();
          }
        } else {
          player.teleport(pendingTransfer.destination);
          travelMoved = true;
          ui.viewport.classList.remove("lift-travel");
          updateHUD();
          if (pendingTransfer.message) showToast(pendingTransfer.message);
        }
      }
      if (pendingTransfer && elapsed >= travelEnd) {
        cancelPendingTransfer();
        updateHUD();
      }
      player.update(pendingTransfer ? 0 : dt);
      player.getState(playerState);
      world.update(dt, elapsed, playerState);
      try {
        soundscape.update(dt, playerState);
      } catch (err) {
        console.error(err);
      }
      camera.layers.set(playerState.height < -1 ? 1 : 0);
      hudTime += dt;
      if (hudTime >= 0.1) {
        updateHUD();
        updateSoundControl();
        hudTime = 0;
      }
    } catch (error) {
      handleFatalError(error);
      return;
    }
    if (!fatalError) renderer.render(scene, camera);
  }

  for (const tram of trams) tram.update(0);
  player.update(0);
  player.getState(playerState);
  updateSoundControl();
  updateHUD();
  updateSaveStatus();
  world.update(0, elapsed, playerState);
  renderScene();
  startButton.disabled = false;
  ui.startCityBtn.disabled = false;
  ui.startGreenwayBtn.disabled = false;
  ui.startReservoirBtn.disabled = false;
  setAttr(ui.mapBtn, "aria-expanded", false);
  ui.mapBtn.disabled = false;
  ui.loading.textContent =
    "Habitat ready. Your boots are the right way down.";
} catch (error) {
  showError(error);
}
