import {
  RADIUS,
  GREENWAY_PLACEMENT,
  MERIDIAN_PLACEMENT,
} from "./habitat.js";
import { wrappedDeltaTheta } from "./cylinder-math.js";
import { inServiceLevel } from "./service-layout.js";

const CANAL_THETA = 109.5 / RADIUS;
const PUMP_THETA = 43.5 / RADIUS;
const GREENHOUSE_THETA = 64.0 / RADIUS;

const MASTER_GAIN = 0.65;
const WIND_BASE_GAIN = 0.12;
const WIND_DAMPED_GAIN = 0.025;
const WATER_MAX_GAIN = 0.18;
const PUMP_MAX_GAIN = 0.15;

function cancelAndHoldParam(param, time) {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
    return;
  }
  const heldValue = param.value;
  param.cancelScheduledValues(time);
  param.setValueAtTime(heldValue, time);
}

function formatError(err) {
  if (err && err.message) return err.message;
  if (err !== undefined && err !== null) return String(err);
  return "Web Audio operation failed";
}
function createPinkNoiseBuffer(audioCtx, seconds = 4.0) {
  const length = Math.floor(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const out = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
    b6 = white * 0.115926;
  }
  return buffer;
}

function createWhiteNoiseBuffer(audioCtx, seconds = 2.0) {
  const length = Math.floor(audioCtx.sampleRate * seconds);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    out[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createSoundscape({ muted = false } = {}) {
  const hasWebAudio =
    typeof window !== "undefined" &&
    Boolean(window.AudioContext || window.webkitAudioContext);

  let status = hasWebAudio ? "idle" : "unavailable";
  let error = hasWebAudio
    ? null
    : "Web Audio API is not supported in this browser";
  let isMuted = Boolean(muted);
  let isActive = false;
  let isDisposed = false;
  let stateVersion = 0;
  let syncPromise = null;
  let silenceDeadline = 0;

  let ctx = null;
  let masterGain = null;

  // Noise buffers (generated once on context creation)
  let pinkNoiseBuffer = null;
  let whiteNoiseBuffer = null;
  let waterNoiseBuffer = null;

  // Wind nodes
  let windSource = null;
  let windFilter = null;
  let windLfo = null;
  let windLfoGain = null;
  let windGain = null;

  // Water nodes
  let waterSource = null;
  let waterFilter = null;
  let waterLfo = null;
  let waterLfoGain = null;
  let waterGain = null;

  // Pump nodes
  let pumpOsc = null;
  let pumpSubOsc = null;
  let pumpSubGain = null;
  let pumpFilter = null;
  let pumpLfo = null;
  let pumpLfoGain = null;
  let pumpModGain = null;
  let pumpGain = null;

  // Track active per-step gain nodes for clean silence/cleanup
  const activeStepGains = new Set();

  // Spatial throttling and environment state
  let spatialTimer = 0;
  let isInsideGreenhouse = false;
  let firstUpdate = true;

  // Footstep cadence & landing accumulation
  let stepTimer = 0;
  let wasGrounded = true;
  let airborneTime = 0;

  function getState() {
    return {
      muted: isMuted,
      status,
      error,
    };
  }

  function applyMuteState() {
    if (!masterGain || !ctx) return;
    try {
      const now = ctx.currentTime;
      cancelAndHoldParam(masterGain.gain, now);
      if (isMuted || !isActive || status !== "running") {
        masterGain.gain.setTargetAtTime(0, now, 0.02);
      } else {
        masterGain.gain.setTargetAtTime(MASTER_GAIN, now, 0.04);
      }
    } catch (err) {
      void failUnavailable(err);
    }
  }

  function silenceActiveSteps() {
    if (!ctx) {
      activeStepGains.clear();
      return;
    }
    let now = 0;
    try {
      now = ctx.currentTime;
    } catch {}
    for (const g of activeStepGains) {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(0, now);
        g.disconnect();
      } catch {}
    }
    activeStepGains.clear();
  }

  function teardownAudio() {
    stepTimer = 0;
    airborneTime = 0;
    wasGrounded = true;
    silenceDeadline = 0;

    silenceActiveSteps();

    if (masterGain && ctx) {
      try {
        const now = ctx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(0, now);
      } catch {}
    }

    // Stop ambient sources
    try {
      if (windSource) windSource.stop();
    } catch {}
    try {
      if (windLfo) windLfo.stop();
    } catch {}
    try {
      if (waterSource) waterSource.stop();
    } catch {}
    try {
      if (waterLfo) waterLfo.stop();
    } catch {}
    try {
      if (pumpOsc) pumpOsc.stop();
    } catch {}
    try {
      if (pumpSubOsc) pumpSubOsc.stop();
    } catch {}
    try {
      if (pumpLfo) pumpLfo.stop();
    } catch {}

    // Disconnect nodes
    try {
      if (windSource) windSource.disconnect();
    } catch {}
    try {
      if (windLfo) windLfo.disconnect();
    } catch {}
    try {
      if (windLfoGain) windLfoGain.disconnect();
    } catch {}
    try {
      if (windGain) windGain.disconnect();
    } catch {}
    try {
      if (windFilter) windFilter.disconnect();
    } catch {}
    try {
      if (waterSource) waterSource.disconnect();
    } catch {}
    try {
      if (waterLfo) waterLfo.disconnect();
    } catch {}
    try {
      if (waterLfoGain) waterLfoGain.disconnect();
    } catch {}
    try {
      if (waterGain) waterGain.disconnect();
    } catch {}
    try {
      if (waterFilter) waterFilter.disconnect();
    } catch {}
    try {
      if (pumpOsc) pumpOsc.disconnect();
    } catch {}
    try {
      if (pumpSubOsc) pumpSubOsc.disconnect();
    } catch {}
    try {
      if (pumpSubGain) pumpSubGain.disconnect();
    } catch {}
    try {
      if (pumpFilter) pumpFilter.disconnect();
    } catch {}
    try {
      if (pumpLfo) pumpLfo.disconnect();
    } catch {}
    try {
      if (pumpLfoGain) pumpLfoGain.disconnect();
    } catch {}
    try {
      if (pumpGain) pumpGain.disconnect();
    } catch {}
    try {
      if (pumpModGain) pumpModGain.disconnect();
    } catch {}
    try {
      if (masterGain) masterGain.disconnect();
    } catch {}

    const closingCtx = ctx;
    ctx = null;
    masterGain = null;
    windSource = null;
    windFilter = null;
    windLfo = null;
    windLfoGain = null;
    windGain = null;
    waterSource = null;
    waterFilter = null;
    waterLfo = null;
    waterLfoGain = null;
    waterGain = null;
    pumpOsc = null;
    pumpSubOsc = null;
    pumpSubGain = null;
    pumpFilter = null;
    pumpLfo = null;
    pumpLfoGain = null;
    pumpModGain = null;
    pumpGain = null;
    pinkNoiseBuffer = null;
    whiteNoiseBuffer = null;
    waterNoiseBuffer = null;

    if (!closingCtx) return Promise.resolve();
    try {
      if (closingCtx.state === "closed") return Promise.resolve();
      return Promise.resolve(closingCtx.close()).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  function failUnavailable(err) {
    status = "unavailable";
    error = formatError(err);
    return teardownAudio();
  }
  function initGraph(audioCtx) {
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    // Buffers generated once
    pinkNoiseBuffer = createPinkNoiseBuffer(audioCtx, 4.0);
    whiteNoiseBuffer = createWhiteNoiseBuffer(audioCtx, 2.0);
    waterNoiseBuffer = createWhiteNoiseBuffer(audioCtx, 3.0);

    // 1. Wind (filtered looping pink noise with subtle LFO modulation)
    windSource = audioCtx.createBufferSource();
    windSource.buffer = pinkNoiseBuffer;
    windSource.loop = true;

    windFilter = audioCtx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 450;
    windFilter.Q.value = 1.0;

    windLfo = audioCtx.createOscillator();
    windLfo.type = "sine";
    windLfo.frequency.value = 0.18;

    windLfoGain = audioCtx.createGain();
    windLfoGain.gain.value = 120;

    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);

    windGain = audioCtx.createGain();
    windGain.gain.value = WIND_BASE_GAIN;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);

    windSource.start(0);
    windLfo.start(0);

    // 2. Water (bandpass filtered looping noise with gentle modulation)
    waterSource = audioCtx.createBufferSource();
    waterSource.buffer = waterNoiseBuffer;
    waterSource.loop = true;

    waterFilter = audioCtx.createBiquadFilter();
    waterFilter.type = "bandpass";
    waterFilter.frequency.value = 950;
    waterFilter.Q.value = 1.4;

    waterLfo = audioCtx.createOscillator();
    waterLfo.type = "sine";
    waterLfo.frequency.value = 0.35;

    waterLfoGain = audioCtx.createGain();
    waterLfoGain.gain.value = 200;

    waterLfo.connect(waterLfoGain);
    waterLfoGain.connect(waterFilter.frequency);

    waterGain = audioCtx.createGain();
    waterGain.gain.value = 0;

    waterSource.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(masterGain);

    waterSource.start(0);
    waterLfo.start(0);

    // 3. Pump (low mechanical hum, 65Hz saw + sub-oscillator, 4.2Hz impeller flutter)
    pumpOsc = audioCtx.createOscillator();
    pumpOsc.type = "sawtooth";
    pumpOsc.frequency.value = 65;

    pumpFilter = audioCtx.createBiquadFilter();
    pumpFilter.type = "lowpass";
    pumpFilter.frequency.value = 220;
    pumpFilter.Q.value = 2.0;

    pumpSubOsc = audioCtx.createOscillator();
    pumpSubOsc.type = "sine";
    pumpSubOsc.frequency.value = 130;

    pumpSubGain = audioCtx.createGain();
    pumpSubGain.gain.value = 0.35;

    pumpLfo = audioCtx.createOscillator();
    pumpLfo.type = "sine";
    pumpLfo.frequency.value = 4.2;

    pumpLfoGain = audioCtx.createGain();
    pumpLfoGain.gain.value = 0.2;

    pumpModGain = audioCtx.createGain();
    pumpModGain.gain.value = 0.8;

    pumpLfo.connect(pumpLfoGain);
    pumpLfoGain.connect(pumpModGain.gain);

    pumpGain = audioCtx.createGain();
    pumpGain.gain.value = 0;

    pumpOsc.connect(pumpFilter);
    pumpFilter.connect(pumpModGain);
    pumpSubOsc.connect(pumpSubGain);
    pumpSubGain.connect(pumpModGain);
    pumpModGain.connect(pumpGain);
    pumpGain.connect(masterGain);

    pumpOsc.start(0);
    pumpSubOsc.start(0);
    pumpLfo.start(0);
  }

  function playFootstep(isSprint, isInside) {
    if (!ctx || !masterGain || isMuted || !isActive || status !== "running") {
      return;
    }

    const now = ctx.currentTime;
    const baseVol = isSprint ? 0.13 : 0.085;
    const vol = baseVol * (0.92 + Math.random() * 0.16);

    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoiseBuffer;
    noise.playbackRate.value = 0.95 + Math.random() * 0.1;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = isInside ? 1050 : 750;
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + (isSprint ? 0.065 : 0.085),
    );

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(isSprint ? 115 : 90, now);
    thud.frequency.exponentialRampToValueAtTime(32, now + 0.05);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(vol * 0.55, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    thud.connect(thudGain);
    thudGain.connect(masterGain);

    noise.start(now);
    noise.stop(now + 0.09);
    thud.start(now);
    thud.stop(now + 0.055);

    activeStepGains.add(gain);
    activeStepGains.add(thudGain);

    noise.onended = () => {
      activeStepGains.delete(gain);
      activeStepGains.delete(thudGain);
      try {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
        thud.disconnect();
        thudGain.disconnect();
      } catch {}
    };
  }

  function playLandingStep(isInside) {
    if (!ctx || !masterGain || isMuted || !isActive || status !== "running") {
      return;
    }

    const now = ctx.currentTime;
    const vol = 0.12;

    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = isInside ? 800 : 550;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(125, now);
    thud.frequency.exponentialRampToValueAtTime(28, now + 0.08);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(vol * 0.75, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    thud.connect(thudGain);
    thudGain.connect(masterGain);

    noise.start(now);
    noise.stop(now + 0.12);
    thud.start(now);
    thud.stop(now + 0.085);

    activeStepGains.add(gain);
    activeStepGains.add(thudGain);

    noise.onended = () => {
      activeStepGains.delete(gain);
      activeStepGains.delete(thudGain);
      try {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
        thud.disconnect();
        thudGain.disconnect();
      } catch {}
    };
  }

  function updateSpatial(playerTheta, playerY, playerHeight, traversalMode) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const inAxial = traversalMode === "secured" || traversalMode === "trolley";
    const inService = inServiceLevel(
      Math.atan2(Math.sin(playerTheta), Math.cos(playerTheta)) * RADIUS,
      playerY,
      playerHeight,
    );
    const greenwayY = GREENWAY_PLACEMENT.toLocalY(playerY);
    const meridianY = MERIDIAN_PLACEMENT.toLocalY(playerY);
    const servicePumpDistance = inService
      ? Math.hypot(
          wrappedDeltaTheta(playerTheta, -27 / RADIUS) * (RADIUS - playerHeight),
          meridianY - 6,
        )
      : Infinity;

    // 1. Canal distance (s = 109.5, local y in [-274, -145])
    const dArcCanal =
      Math.abs(wrappedDeltaTheta(playerTheta, CANAL_THETA)) * RADIUS;
    let dYCanal = 0;
    if (greenwayY < -274.0) {
      dYCanal = -274.0 - greenwayY;
    } else if (greenwayY > -145.0) {
      dYCanal = greenwayY - -145.0;
    }
    const distCanal = Math.hypot(dArcCanal, dYCanal);
    const maxWaterDist = 36.0;
    const waterFactor =
      distCanal < maxWaterDist ? Math.max(0, 1 - distCanal / maxWaterDist) : 0;
    const targetWaterGain = inService
      ? Math.max(0, 1 - servicePumpDistance / 19) ** 2 * WATER_MAX_GAIN
      : waterFactor * waterFactor * WATER_MAX_GAIN;

    if (waterGain) {
      waterGain.gain.setTargetAtTime(targetWaterGain, now, 0.09);
    }

    // 2. Pump distance (s = 43.5, local y = -146.0)
    const dArcPump =
      Math.abs(wrappedDeltaTheta(playerTheta, PUMP_THETA)) * RADIUS;
    const dYPump = greenwayY - -146.0;
    const distPump = Math.hypot(dArcPump, dYPump);
    const maxPumpDist = 26.0;
    const pumpFactor =
      distPump < maxPumpDist ? Math.max(0, 1 - distPump / maxPumpDist) : 0;
    const targetPumpGain = inAxial
      ? traversalMode === "trolley" ? 0.035 : 0.015
      : inService
        ? Math.max(0, 1 - servicePumpDistance / 24) ** 2 * PUMP_MAX_GAIN
        : pumpFactor * pumpFactor * PUMP_MAX_GAIN;

    if (pumpGain) {
      pumpGain.gain.setTargetAtTime(targetPumpGain, now, 0.09);
    }

    // 3. Greenhouse dampening (s in [53, 75], local y in [-232, -196])
    const dArcGH =
      Math.abs(wrappedDeltaTheta(playerTheta, GREENHOUSE_THETA)) * RADIUS;
    isInsideGreenhouse =
      dArcGH <= 11.0 && greenwayY >= -232.0 && greenwayY <= -196.0;

    const damped =
      isInsideGreenhouse ||
      inService ||
      inAxial ||
      traversalMode === "tram";
    const targetWindGain = damped ? WIND_DAMPED_GAIN : WIND_BASE_GAIN;
    const targetWindCutoff = damped ? 220 : 450;

    if (windGain) {
      windGain.gain.setTargetAtTime(targetWindGain, now, 0.12);
    }
    if (windFilter) {
      windFilter.frequency.setTargetAtTime(targetWindCutoff, now, 0.12);
    }
  }

  function requestSilence() {
    stepTimer = 0;
    airborneTime = 0;
    wasGrounded = true;
    if (!masterGain || !ctx) return;
    try {
      const now = ctx.currentTime;
      cancelAndHoldParam(masterGain.gain, now);
      if (ctx.state === "running") {
        silenceDeadline = now + 0.03;
        masterGain.gain.linearRampToValueAtTime(0, silenceDeadline);
      } else {
        silenceDeadline = now;
        masterGain.gain.setValueAtTime(0, now);
        silenceActiveSteps();
      }
    } catch (err) {
      void failUnavailable(err);
    }
  }

  function isStaleRequest(audioContext, version) {
    return (
      isDisposed ||
      status === "unavailable" ||
      ctx !== audioContext ||
      version !== stateVersion
    );
  }

  async function applyRequestedState(version) {
    if (isDisposed || !hasWebAudio || status === "unavailable") return;
    const shouldRun = isActive && !isMuted;
    if (!ctx && shouldRun) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        ctx = new AudioCtx();
        initGraph(ctx);
      } catch (err) {
        await failUnavailable(err);
        return;
      }
    }
    if (!ctx) {
      status = "idle";
      return;
    }

    const audioContext = ctx;
    try {
      // Let the short output fade finish before freezing the audio clock.
      if (!shouldRun && audioContext.state === "running") {
        const delay = Math.max(
          0,
          (silenceDeadline - audioContext.currentTime) * 1000,
        );
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay + 4));
        if (isStaleRequest(audioContext, version)) return;
      }
      if (shouldRun) await audioContext.resume();
      else {
        silenceActiveSteps();
        await audioContext.suspend();
      }
    } catch (err) {
      if (isStaleRequest(audioContext, version)) return;
      if (
        !shouldRun ||
        audioContext.state === "closed" ||
        err?.name === "InvalidStateError"
      ) {
        await failUnavailable(err);
        return;
      }
      status = "blocked";
      error = formatError(err);
      return;
    }
    if (isStaleRequest(audioContext, version)) return;
    if (audioContext.state === "closed") {
      await failUnavailable(new Error("AudioContext is closed"));
      return;
    }
    if (shouldRun && audioContext.state !== "running") {
      status = "blocked";
      error = "Audio is suspended. Click Enable Sound to retry.";
      return;
    }
    status = shouldRun ? "running" : "paused";
    error = null;
    if (shouldRun) {
      spatialTimer = 0;
      firstUpdate = true;
      stepTimer = 0;
      applyMuteState();
    }
  }

  function synchronize() {
    if (syncPromise) return syncPromise;
    const task = (async () => {
      let version;
      do {
        version = stateVersion;
        await applyRequestedState(version);
      } while (
        !isDisposed &&
        status !== "unavailable" &&
        version !== stateVersion
      );
      return getState();
    })();
    syncPromise = task.then(
      (state) => {
        syncPromise = null;
        return state;
      },
      (err) => {
        syncPromise = null;
        if (!isDisposed) {
          void failUnavailable(err);
        }
        return getState();
      },
    );
    return syncPromise;
  }

  function setActive(active) {
    if (isDisposed) return Promise.resolve(getState());
    if (!hasWebAudio || status === "unavailable") {
      return syncPromise || Promise.resolve(getState());
    }
    isActive = Boolean(active);
    stateVersion++;
    if (!isActive || isMuted) requestSilence();
    return synchronize();
  }

  function setMuted(muted) {
    if (isDisposed) return Promise.resolve(getState());
    if (!hasWebAudio || status === "unavailable") {
      return syncPromise || Promise.resolve(getState());
    }
    isMuted = Boolean(muted);
    stateVersion++;
    if (isMuted || !isActive) requestSilence();
    return synchronize();
  }

  function update(dt, playerState) {
    if (
      isDisposed ||
      !ctx ||
      !isActive ||
      status !== "running" ||
      !playerState
    ) {
      return;
    }
    if (ctx.state === "closed") {
      void failUnavailable(new Error("AudioContext is closed"));
      return;
    }

    const clampedDt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    const { theta, y, height, speed, grounded, traversalMode } = playerState;

    try {
      // Spatial updates throttled at 10Hz (allocation free)
      spatialTimer += clampedDt;
      if (spatialTimer >= 0.1 || firstUpdate) {
        spatialTimer = 0;
        firstUpdate = false;
        updateSpatial(theta, y, height, traversalMode);
      }

      if (traversalMode === "tram") {
        stepTimer = 0;
        airborneTime = 0;
        wasGrounded = true;
      } else {
        // Landing detection
        if (!grounded) {
          airborneTime += clampedDt;
        } else {
          if (!wasGrounded && airborneTime > 0.22) {
            playLandingStep(isInsideGreenhouse);
            stepTimer = 0;
          }
          airborneTime = 0;
        }
        wasGrounded = grounded;

        // Footstep cadence
        if (grounded && speed > 0.5 && traversalMode !== "trolley") {
          let interval;
          if (speed <= 7.0) {
            const f = (speed - 0.5) / 6.5;
            interval = 0.5 - f * 0.08; // 0.50s down to 0.42s
          } else {
            const f = Math.min(1.0, (speed - 7.0) / 11.0);
            interval = 0.42 - f * 0.16; // 0.42s down to 0.26s
          }

          stepTimer += clampedDt;
          if (stepTimer >= interval) {
            stepTimer = 0;
            playFootstep(speed > 10.0, isInsideGreenhouse);
          }
        } else {
          // Standing or blocked: prime stepTimer so moving triggers step naturally without burst
          stepTimer = 0.3;
        }
      }
    } catch (err) {
      void failUnavailable(err);
    }
  }

  async function dispose() {
    if (isDisposed) return;
    isDisposed = true;
    stateVersion++;
    isActive = false;
    status = "idle";
    error = null;
    return teardownAudio();
  }

  return {
    setActive,
    setMuted,
    update,
    getState,
    dispose,
  };
}
