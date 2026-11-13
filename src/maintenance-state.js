import { RADIUS } from "./habitat.js";
import { horizontalDistance, spatialDistance } from "./cylinder-math.js";
import { CARETAKER, VENTILATION_UNIT } from "./maintenance-layout.js";

const VALID_PHASES = Object.freeze([
  "available",
  "assigned",
  "repaired",
  "complete",
]);

const TARGET_CARETAKER = Object.freeze({
  s: CARETAKER.s,
  y: CARETAKER.y,
  height: CARETAKER.height,
});

const TARGET_UNIT = Object.freeze({
  s: VENTILATION_UNIT.s,
  y: VENTILATION_UNIT.y,
  height: VENTILATION_UNIT.height,
});

/**
 * Computes 3D distance including vertical separation for HUD and destination view.
 */
function calcViewDistance(playerState, target) {
  if (!playerState) return Infinity;
  return spatialDistance(
    playerState.theta,
    playerState.y,
    playerState.height,
    target.s / RADIUS,
    target.y,
    target.height,
  );
}

/**
 * Eligibility safeguard:
 * - Must be grounded (not airborne)
 * - Feet height within 0.4m of target floor
 * - Wrapped physical distance at target elevation <= target.range (2.8m)
 */
function isTargetEligible(playerState, target) {
  if (!playerState || !playerState.grounded) return false;
  if (Math.abs(playerState.height - target.height) > 0.4) return false;
  const dist = horizontalDistance(
    playerState.theta,
    playerState.y,
    target.s / RADIUS,
    target.y,
    target.height,
  );
  return dist <= target.range;
}

/**
 * Creates and manages the pure logic maintenance state machine.
 * Phases: available -> assigned -> repaired -> complete.
 *
 * @param {'available' | 'assigned' | 'repaired' | 'complete'} [initialPhase='available']
 */
export function createMaintenanceState(initialPhase = "available") {
  let phase = VALID_PHASES.includes(initialPhase) ? initialPhase : "available";

  // Reusable object for getView to avoid per-frame allocations
  const viewResult = {
    phase: "available",
    title: "Skywalk ventilation",
    objective: "",
    prompt: null,
    target: null,
    distance: 0,
    fanRunning: false,
    progress: "0 / 3",
    status: "",
  };

  function getPhase() {
    return phase;
  }

  function getView(playerState = null) {
    const isFanRunning = phase === "repaired" || phase === "complete";
    viewResult.phase = phase;
    viewResult.title = "Skywalk ventilation";
    viewResult.fanRunning = isFanRunning;

    const eligibleMara = isTargetEligible(playerState, CARETAKER);
    const eligibleUnit = isTargetEligible(playerState, VENTILATION_UNIT);

    if (phase === "available") {
      viewResult.objective =
        "Speak with Mara Voss in Meridian Plaza about civic maintenance.";
      viewResult.target = TARGET_CARETAKER;
      viewResult.distance = playerState
        ? calcViewDistance(playerState, TARGET_CARETAKER)
        : 0;
      viewResult.progress = "0 / 3";
      viewResult.status = "AVAILABLE";

      if (eligibleMara) {
        viewResult.prompt = "Speak with Mara Voss";
      } else if (eligibleUnit) {
        viewResult.prompt = "Inspect ventilation unit";
      } else {
        viewResult.prompt = null;
      }
    } else if (phase === "assigned") {
      viewResult.objective =
        "Restart the ventilation unit at the north end of the Skywalk terrace.";
      viewResult.target = TARGET_UNIT;
      viewResult.distance = playerState
        ? calcViewDistance(playerState, TARGET_UNIT)
        : 0;
      viewResult.progress = "1 / 3";
      viewResult.status = "VENTILATION UNIT OFFLINE";

      if (eligibleUnit) {
        viewResult.prompt = "Restart ventilation unit";
      } else if (eligibleMara) {
        viewResult.prompt = "Speak with Mara Voss";
      } else {
        viewResult.prompt = null;
      }
    } else if (phase === "repaired") {
      viewResult.objective = "Report back to Mara Voss in Meridian Plaza.";
      viewResult.target = TARGET_CARETAKER;
      viewResult.distance = playerState
        ? calcViewDistance(playerState, TARGET_CARETAKER)
        : 0;
      viewResult.progress = "2 / 3";
      viewResult.status = "REPORT TO CARETAKER";

      if (eligibleMara) {
        viewResult.prompt = "Report to Mara Voss";
      } else if (eligibleUnit) {
        viewResult.prompt = "Inspect ventilation unit";
      } else {
        viewResult.prompt = null;
      }
    } else {
      // complete
      viewResult.objective =
        "Skywalk ventilation restored. Air circulation is nominal.";
      viewResult.target = null;
      viewResult.distance = 0;
      viewResult.progress = "3 / 3";
      viewResult.status = "MAINTENANCE COMPLETE";

      if (eligibleMara) {
        viewResult.prompt = "Speak with Mara Voss";
      } else if (eligibleUnit) {
        viewResult.prompt = "Inspect ventilation unit";
      } else {
        viewResult.prompt = null;
      }
    }

    return viewResult;
  }

  function interact(playerState) {
    const eligibleMara = isTargetEligible(playerState, CARETAKER);
    const eligibleUnit = isTargetEligible(playerState, VENTILATION_UNIT);

    if (!eligibleMara && !eligibleUnit) {
      return null;
    }

    if (eligibleMara) {
      if (phase === "available") {
        phase = "assigned";
        return {
          message:
            "Mara Voss assigned the Skywalk ventilation maintenance job.",
          changed: true,
          dialogue: {
            speaker: CARETAKER.name,
            text: "The ventilation unit at the north end of the Skywalk terrace has stalled. Could you head up there and restart it? We need to keep the terrace airflow moving.",
          },
        };
      }

      if (phase === "assigned") {
        return {
          message:
            "Mara Voss reminded you to restart the Skywalk ventilation unit.",
          changed: false,
          dialogue: {
            speaker: CARETAKER.name,
            text: "The ventilation unit is at the far north end of the Skywalk terrace. Take the street lift up and follow the walkway past the planter to restart it.",
          },
        };
      }

      if (phase === "repaired") {
        phase = "complete";
        return {
          message:
            "Reported to Mara Voss. Skywalk ventilation maintenance complete!",
          changed: true,
          dialogue: {
            speaker: CARETAKER.name,
            text: "You got the turbine spinning again? Wonderful work! The air circulation telemetry is already stabilizing. Thank you for looking after Meridian's infrastructure.",
          },
        };
      }

      if (phase === "complete") {
        return {
          message:
            "Mara Voss thanked you for maintaining the Skywalk ventilation.",
          changed: false,
          dialogue: {
            speaker: CARETAKER.name,
            text: "Thanks again for fixing that ventilation unit. The Skywalk terrace has fresh air circulating smoothly.",
          },
        };
      }
    }

    if (eligibleUnit) {
      if (phase === "available") {
        return {
          message:
            "Skywalk ventilation unit is offline. Speak with Mara Voss in Meridian Plaza.",
          changed: false,
        };
      }

      if (phase === "assigned") {
        phase = "repaired";
        return {
          message:
            "Ventilation unit breaker reset. Intake turbine restarted and running.",
          changed: true,
        };
      }

      if (phase === "repaired") {
        return {
          message:
            "Ventilation unit is operating normally. Report back to Mara Voss in Meridian Plaza.",
          changed: false,
        };
      }

      if (phase === "complete") {
        return {
          message:
            "Ventilation unit is operating normally. Air circulation nominal.",
          changed: false,
        };
      }
    }

    return null;
  }

  return {
    getPhase,
    getView,
    interact,
  };
}
