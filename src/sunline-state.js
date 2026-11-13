import { horizontalDistance, spatialDistance } from "./cylinder-math.js";
import { SUNLINE_PHASES, ENDCAP_HUBS, SUNLINE_PANEL } from "./sunline-layout.js";
import { DISTRICT_NAME } from "./district-layout.js";

const DISTRICT_ONLINE_STATUS = Object.freeze({
  name: DISTRICT_NAME,
  online: true,
  status: "DAYLIGHT ONLINE",
});

const DISTRICT_EMERGENCY_STATUS = Object.freeze({
  name: DISTRICT_NAME,
  online: false,
  status: "EMERGENCY LIGHTING",
});


/**
 * Computes 3D distance including vertical separation for HUD and destination view:
 * Math.hypot(wrappedAngle * (RADIUS - target.height), deltaY, state.height - target.height)
 */
function calcViewDistance(playerState, target) {
  if (!playerState) return Infinity;
  return spatialDistance(
    playerState.theta,
    playerState.y,
    playerState.height,
    target.theta,
    target.y,
    target.height,
  );
}

/**
 * Target eligibility safeguard:
 * - Must be grounded (not airborne)
 * - Feet height within 0.35m of target elevation (|height - target.height| <= 0.35)
 * - Traversal mode must match required mode exactly (console: 'secured', module: 'trolley')
 * - Physical wrapped horizontal distance at target radius <= target.range
 */
function isTargetEligible(playerState, target, expectedMode) {
  return !!playerState?.grounded &&
    playerState.traversalMode === expectedMode &&
    Math.abs(playerState.height - target.height) <= 0.35 &&
    horizontalDistance(
      playerState.theta,
      playerState.y,
      target.theta,
      target.y,
      target.height,
    ) <= target.range;
}

function getNearestHubControl(playerState) {
  if (!playerState) {
    return ENDCAP_HUBS[0].control;
  }
  const distA = calcViewDistance(playerState, ENDCAP_HUBS[0].control);
  const distB = calcViewDistance(playerState, ENDCAP_HUBS[1].control);
  return distB < distA ? ENDCAP_HUBS[1].control : ENDCAP_HUBS[0].control;
}

/**
 * Creates and manages the pure logic sunline emitter maintenance state machine.
 * Phases: available -> isolated -> replaced -> complete.
 *
 * @param {'available' | 'isolated' | 'replaced' | 'complete'} [initialPhase='available']
 */
export function createSunlineState(initialPhase = "available") {
  let phase = SUNLINE_PHASES.includes(initialPhase) ? initialPhase : "available";

  // Reusable object for getView to avoid per-frame allocations
  const viewResult = {
    phase: "available",
    title: "Sunline module SL-02",
    objective: "",
    prompt: null,
    target: null,
    distance: 0,
    progress: "0 / 3",
    status: "",
    districtStatus: DISTRICT_ONLINE_STATUS,
  };

  function getPhase() {
    return phase;
  }

  function getDistrictStatus() {
    return phase === "available" || phase === "complete"
      ? DISTRICT_ONLINE_STATUS
      : DISTRICT_EMERGENCY_STATUS;
  }

  function getView(playerState = null) {
    viewResult.phase = phase;
    viewResult.title = "Sunline module SL-02";
    viewResult.districtStatus = getDistrictStatus();
    const eligibleConsoleA = isTargetEligible(
      playerState,
      ENDCAP_HUBS[0].control,
      "secured",
    );
    const eligibleConsoleB = isTargetEligible(
      playerState,
      ENDCAP_HUBS[1].control,
      "secured",
    );
    const eligibleConsole = eligibleConsoleA || eligibleConsoleB;
    const eligibleModule = isTargetEligible(
      playerState,
      SUNLINE_PANEL,
      "trolley",
    );

    if (phase === "available") {
      const target = getNearestHubControl(playerState);
      viewResult.objective =
        "Visit an endcap isolation console to service SL-02 (feeds Greenway Commons).";
      viewResult.target = target;
      viewResult.distance = playerState
        ? calcViewDistance(playerState, target)
        : 0;
      viewResult.progress = "0 / 3";
      viewResult.status = "SCHEDULED MAINTENANCE";

      if (eligibleConsole) {
        viewResult.prompt = "Isolate module SL-02";
      } else if (eligibleModule) {
        viewResult.prompt = "Inspect module SL-02";
      } else {
        viewResult.prompt = null;
      }
    } else if (phase === "isolated") {
      viewResult.objective =
        "Greenway Commons is on emergency lighting. Board the trolley (W/S) to replace SL-02's emitter.";
      viewResult.target = SUNLINE_PANEL;
      viewResult.distance = playerState
        ? calcViewDistance(playerState, SUNLINE_PANEL)
        : 0;
      viewResult.progress = "1 / 3";
      viewResult.status = "MODULE SL-02 ISOLATED";

      if (eligibleModule) {
        viewResult.prompt = "Replace emitter unit";
      } else if (eligibleConsole) {
        viewResult.prompt = "Inspect isolation console";
      } else {
        viewResult.prompt = null;
      }
    } else if (phase === "replaced") {
      const target = getNearestHubControl(playerState);
      viewResult.objective =
        "Return to an endcap isolation console to restore SL-02 power and Greenway Commons daylight.";
      viewResult.target = target;
      viewResult.distance = playerState
        ? calcViewDistance(playerState, target)
        : 0;
      viewResult.progress = "2 / 3";
      viewResult.status = "MODULE SL-02 REPLACED";

      if (eligibleConsole) {
        viewResult.prompt = "Restore module SL-02";
      } else if (eligibleModule) {
        viewResult.prompt = "Inspect module SL-02";
      } else {
        viewResult.prompt = null;
      }
    } else {
      // complete
      viewResult.objective =
        "Sunline module SL-02 serviced and online. Greenway Commons daylight is nominal.";
      viewResult.target = null;
      viewResult.distance = 0;
      viewResult.progress = "3 / 3";
      viewResult.status = "MAINTENANCE COMPLETE";

      if (eligibleConsole) {
        viewResult.prompt = "Inspect isolation console";
      } else if (eligibleModule) {
        viewResult.prompt = "Inspect module SL-02";
      } else {
        viewResult.prompt = null;
      }
    }

    return viewResult;
  }

  function interact(playerState) {
    const eligibleConsoleA = isTargetEligible(
      playerState,
      ENDCAP_HUBS[0].control,
      "secured",
    );
    const eligibleConsoleB = isTargetEligible(
      playerState,
      ENDCAP_HUBS[1].control,
      "secured",
    );
    const eligibleConsole = eligibleConsoleA || eligibleConsoleB;
    const eligibleModule = isTargetEligible(
      playerState,
      SUNLINE_PANEL,
      "trolley",
    );

    if (!eligibleConsole && !eligibleModule) {
      return null;
    }

    if (eligibleConsole) {
      if (phase === "available") {
        phase = "isolated";
        return {
          message:
            "Module SL-02 isolated. Greenway Commons switched to emergency lighting; board the trolley to replace the emitter.",
          changed: true,
        };
      }
      if (phase === "isolated") {
        return {
          message:
            "Module SL-02 is isolated; Greenway Commons is on emergency lighting. Board the trolley and travel to SL-02 to replace the emitter.",
          changed: false,
        };
      }
      if (phase === "replaced") {
        phase = "complete";
        return {
          message:
            "Power coupling restored to module SL-02. Greenway Commons daylight online; sunline emitter array nominal!",
          changed: true,
        };
      }
      if (phase === "complete") {
        return {
          message:
            "Sunline telemetry nominal. Greenway Commons daylight online; all emitter modules synchronized.",
          changed: false,
        };
      }
    }

    if (eligibleModule) {
      if (phase === "available") {
        return {
          message:
            "Module SL-02 is energized and feeds Greenway Commons. Isolate from an endcap console before servicing.",
          changed: false,
        };
      }
      if (phase === "isolated") {
        phase = "replaced";
        return {
          message:
            "Depleted emitter replaced. Return to an endcap console to restore power coupling and Greenway Commons daylight.",
          changed: true,
        };
      }
      if (phase === "replaced") {
        return {
          message:
            "Replacement emitter installed. Return to an endcap console to restore power coupling and Greenway Commons daylight.",
          changed: false,
        };
      }
      if (phase === "complete") {
        return {
          message:
            "Module SL-02 emitter array operating at peak output; Greenway Commons daylight online.",
          changed: false,
        };
      }
    }

    return null;
  }

  return {
    getPhase,
    getDistrictStatus,
    getView,
    interact,
  };
}
