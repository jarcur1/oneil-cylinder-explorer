import { SUNLINE_PHASES } from "./sunline-layout.js";

/**
 * Persistence store for O'Neill cylinder habitat progress.
 * Manages versioned local storage state, normalization, failure recovery,
 * and discovery filtering without per-frame I/O.
 */

export const SAVE_KEY = "new-dawn.save.v1";

const SCHEMA_VERSION = 1;
const VALID_DELIVERY_PHASES = new Set(["available", "carrying", "complete"]);
const VALID_MAINTENANCE_PHASES = new Set([
  "available",
  "assigned",
  "repaired",
  "complete",
]);
const VALID_SUNLINE_PHASES = new Set(SUNLINE_PHASES);
const KNOWN_SCHEMA_KEYS = new Set([
  "version",
  "discoveries",
  "deliveryPhase",
  "supplyPhase",
  "plantingPhase",
  "maintenancePhase",
  "sunlinePhase",
  "muted",
]);

/**
 * Returns a new default game state object with an independent discoveries array.
 *
 * @returns {{
 *   discoveries: string[],
 *   deliveryPhase: "available",
 *   supplyPhase: "available",
 *   plantingPhase: "available",
 *   maintenancePhase: "available",
 *   sunlinePhase: "available",
 *   muted: false,
 * }}
 */
function createDefaultState() {
  return {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    plantingPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  };
}

/**
 * Creates a save store instance backed by the provided storageProvider.
 *
 * @param {() => Storage} [storageProvider=() => window.localStorage]
 * @returns {{
 *   load: (knownDiscoveryIds?: Iterable<string> | null) => {
 *     discoveries: string[],
 *     deliveryPhase: "available" | "carrying" | "complete",
 *     supplyPhase: "available" | "carrying" | "complete",
 *     plantingPhase: "available" | "carrying" | "complete",
 *     maintenancePhase: "available" | "assigned" | "repaired" | "complete",
 *     sunlinePhase: "available" | "isolated" | "replaced" | "complete",
 *     muted: boolean,
 *   },
 *   save: (state: object) => boolean,
 *   getStatus: () => {
 *     available: boolean,
 *     error: string | null,
 *     recovered: boolean,
 *   },
 * }}
 */
export function createSaveStore(storageProvider = () => window.localStorage) {
  let isAvailable = true;
  let lastError = null;
  let recovered = false;

  function getStorage() {
    try {
      if (typeof storageProvider !== "function") {
        isAvailable = false;
        lastError = "Storage provider is not a function";
        return null;
      }
      const storage = storageProvider();
      if (
        !storage ||
        typeof storage.getItem !== "function" ||
        typeof storage.setItem !== "function"
      ) {
        isAvailable = false;
        lastError = "Storage interface unavailable";
        return null;
      }
      return storage;
    } catch (err) {
      isAvailable = false;
      lastError = err?.message || String(err);
      return null;
    }
  }

  /**
   * Loads saved progress and returns a normalized state object.
   * If storage is unreadable, malformed, or corrupt, falls back safely to
   * defaults and marks recovered = true without failing application startup.
   *
   * @param {Iterable<string> | null} [knownDiscoveryIds=null]
   * @returns {{
   *   discoveries: string[],
   *   deliveryPhase: "available" | "carrying" | "complete",
   *   supplyPhase: "available" | "carrying" | "complete",
   *   plantingPhase: "available" | "carrying" | "complete",
 *   maintenancePhase: "available" | "assigned" | "repaired" | "complete",
 *   sunlinePhase: "available" | "isolated" | "replaced" | "complete",
 *   muted: boolean,
   * }}
   */
  function load(knownDiscoveryIds = null) {
    const storage = getStorage();
    if (!storage) {
      return createDefaultState();
    }

    let raw = null;
    try {
      raw = storage.getItem(SAVE_KEY);
      isAvailable = true;
      lastError = null;
    } catch (err) {
      isAvailable = false;
      lastError = err?.message || String(err);
      return createDefaultState();
    }

    if (raw === null || raw === undefined) {
      recovered = false;
      return createDefaultState();
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      recovered = true;
      return createDefaultState();
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      recovered = true;
      return createDefaultState();
    }

    if (parsed.version !== SCHEMA_VERSION) {
      recovered = true;
      return createDefaultState();
    }

    let needsRecovery = false;

    // Build lookup set of known discovery IDs if provided
    let allowedDiscoverySet = null;
    if (knownDiscoveryIds != null) {
      if (knownDiscoveryIds instanceof Set) {
        allowedDiscoverySet = knownDiscoveryIds;
      } else if (
        Array.isArray(knownDiscoveryIds) ||
        typeof knownDiscoveryIds[Symbol.iterator] === "function"
      ) {
        allowedDiscoverySet = new Set(knownDiscoveryIds);
      }
    }

    // Discoveries normalization: filter non-strings, unknown IDs, deduplicate
    const discoveries = [];
    if (Array.isArray(parsed.discoveries)) {
      const seen = new Set();
      for (const id of parsed.discoveries) {
        if (typeof id !== "string") {
          needsRecovery = true;
          continue;
        }
        if (allowedDiscoverySet && !allowedDiscoverySet.has(id)) {
          needsRecovery = true;
          continue;
        }
        if (seen.has(id)) {
          needsRecovery = true;
          continue;
        }
        seen.add(id);
        discoveries.push(id);
      }
    } else {
      needsRecovery = true;
    }

    // Delivery phase normalization
    let deliveryPhase = "available";
    if (VALID_DELIVERY_PHASES.has(parsed.deliveryPhase)) {
      deliveryPhase = parsed.deliveryPhase;
    } else {
      needsRecovery = true;
    }

    // Additive v1 field: old seed-complete saves unlock the new run normally.
    let supplyPhase = "available";
    if (parsed.supplyPhase !== undefined) {
      if (VALID_DELIVERY_PHASES.has(parsed.supplyPhase)) {
        supplyPhase = parsed.supplyPhase;
      } else {
        needsRecovery = true;
      }
    }
    if (deliveryPhase !== "complete" && supplyPhase !== "available") {
      supplyPhase = "available";
      needsRecovery = true;
    }

    // Additive v1 field, unlocked only after the normalized produce run completes.
    let plantingPhase = "available";
    if (parsed.plantingPhase !== undefined) {
      if (VALID_DELIVERY_PHASES.has(parsed.plantingPhase)) {
        plantingPhase = parsed.plantingPhase;
      } else {
        needsRecovery = true;
      }
    }
    if (supplyPhase !== "complete" && plantingPhase !== "available") {
      plantingPhase = "available";
      needsRecovery = true;
    }

    // Maintenance phase normalization
    let maintenancePhase = "available";
    if (VALID_MAINTENANCE_PHASES.has(parsed.maintenancePhase)) {
      maintenancePhase = parsed.maintenancePhase;
    } else {
      needsRecovery = true;
    }

    // Sunline phase normalization:
    // Optional additive sunlinePhase: missing in old v1 defaults to "available" without recovery;
    // invalid present value recovers to "available" with recovered = true.
    let sunlinePhase = "available";
    if (parsed.sunlinePhase === undefined) {
      sunlinePhase = "available";
    } else if (VALID_SUNLINE_PHASES.has(parsed.sunlinePhase)) {
      sunlinePhase = parsed.sunlinePhase;
    } else {
      sunlinePhase = "available";
      needsRecovery = true;
    }
    // Muted normalization
    let muted = false;
    if (typeof parsed.muted === "boolean") {
      muted = parsed.muted;
    } else {
      needsRecovery = true;
    }

    // Check for unexpected extra keys
    for (const key of Object.keys(parsed)) {
      if (!KNOWN_SCHEMA_KEYS.has(key)) {
        needsRecovery = true;
        break;
      }
    }

    recovered = needsRecovery;

    return {
      discoveries,
      deliveryPhase,
      supplyPhase,
      plantingPhase,
      maintenancePhase,
      sunlinePhase,
      muted,
    };
  }

  /**
   * Persists progress fields to storage under SAVE_KEY.
   * Serializes only owned versioned progress fields without per-frame timers.
   *
   * @param {object} state
   * @returns {boolean} Whether the write succeeded
   */
  function save(state) {
    const storage = getStorage();
    if (!storage) {
      return false;
    }

    const discoveries = [];
    if (Array.isArray(state?.discoveries)) {
      const seen = new Set();
      for (const id of state.discoveries) {
        if (typeof id === "string" && !seen.has(id)) {
          seen.add(id);
          discoveries.push(id);
        }
      }
    }

    const deliveryPhase = VALID_DELIVERY_PHASES.has(state?.deliveryPhase)
      ? state.deliveryPhase
      : "available";

    const supplyPhase =
      deliveryPhase === "complete" && VALID_DELIVERY_PHASES.has(state?.supplyPhase)
        ? state.supplyPhase
        : "available";

    const plantingPhase =
      supplyPhase === "complete" && VALID_DELIVERY_PHASES.has(state?.plantingPhase)
        ? state.plantingPhase
        : "available";

    const maintenancePhase = VALID_MAINTENANCE_PHASES.has(
      state?.maintenancePhase,
    )
      ? state.maintenancePhase
      : "available";

    const sunlinePhase = VALID_SUNLINE_PHASES.has(state?.sunlinePhase)
      ? state.sunlinePhase
      : "available";

    const muted = Boolean(state?.muted);

    const record = {
      version: SCHEMA_VERSION,
      discoveries,
      deliveryPhase,
      supplyPhase,
      plantingPhase,
      maintenancePhase,
      sunlinePhase,
      muted,
    };

    let serialized = "";
    try {
      serialized = JSON.stringify(record);
    } catch (err) {
      lastError = err?.message || String(err);
      return false;
    }

    try {
      storage.setItem(SAVE_KEY, serialized);
      isAvailable = true;
      lastError = null;
      return true;
    } catch (err) {
      isAvailable = false;
      lastError = err?.message || String(err);
      return false;
    }
  }

  /**
   * Returns current operational status of the storage backend.
   *
   * @returns {{
   *   available: boolean,
   *   error: string | null,
   *   recovered: boolean,
   * }}
   */
  function getStatus() {
    return {
      available: isAvailable,
      error: lastError,
      recovered,
    };
  }

  return {
    load,
    save,
    getStatus,
  };
}
