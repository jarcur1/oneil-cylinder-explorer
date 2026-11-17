import test from "node:test";
import assert from "node:assert/strict";
import { SAVE_KEY, createSaveStore } from "../src/save-game.js";
import { createSunlineState } from "../src/sunline-state.js";
import { ENDCAP_HUBS, SUNLINE_PANEL } from "../src/sunline-layout.js";

function createMockStorage(initialData = {}) {
  const store = new Map(Object.entries(initialData));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

test("progress and completed jobs survive fresh save-store instances", () => {
  const storage = createMockStorage();
  const progress = {
    discoveries: ["plaza", "skywalk"],
    deliveryPhase: "carrying",
    supplyPhase: "available",
    maintenancePhase: "repaired",
    sunlinePhase: "isolated",
    muted: true,
  };
  assert.equal(createSaveStore(() => storage).save(progress), true);
  const reloaded = createSaveStore(() => storage);
  const restored = reloaded.load(["plaza", "tower", "skywalk"]);
  assert.deepEqual(restored, progress);
  const completed = {
    ...restored,
    deliveryPhase: "complete",
    maintenancePhase: "complete",
    sunlinePhase: "complete",
  };
  assert.equal(reloaded.save(completed), true);
  assert.deepEqual(
    createSaveStore(() => storage).load(["plaza", "tower", "skywalk"]),
    completed,
  );
  assert.equal(reloaded.getStatus().available, true);
});

test("unsupported schema version falls back to defaults with recovered=true", () => {
  const mockStorage = createMockStorage({
    [SAVE_KEY]: JSON.stringify({
      version: 99,
      discoveries: ["plaza"],
      deliveryPhase: "carrying",
      maintenancePhase: "repaired",
      muted: true,
    }),
  });
  const store = createSaveStore(() => mockStorage);

  const loaded = store.load(["plaza"]);
  assert.deepEqual(loaded, {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  });

  const status = store.getStatus();
  assert.equal(status.available, true);
  assert.equal(status.error, null);
  assert.equal(status.recovered, true);
});

test("malformed JSON in storage recovers to defaults without crashing", () => {
  const mockStorage = createMockStorage({
    [SAVE_KEY]: "{corrupt-unclosed-json",
  });
  const store = createSaveStore(() => mockStorage);

  const loaded = store.load();
  assert.deepEqual(loaded, {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  });

  const status = store.getStatus();
  assert.equal(status.available, true);
  assert.equal(status.recovered, true);
});

test("a valid JSON null record recovers without crashing startup", () => {
  const storage = createMockStorage({ [SAVE_KEY]: "null" });
  const store = createSaveStore(() => storage);
  assert.deepEqual(store.load(), {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  });
  assert.equal(store.getStatus().recovered, true);
});

test("invalid phase values and types are normalized with recovered=true", () => {
  const mockStorage = createMockStorage({
    [SAVE_KEY]: JSON.stringify({
      version: 1,
      discoveries: "invalid-not-array",
      deliveryPhase: "teleporting",
      maintenancePhase: 12345,
      sunlinePhase: "superluminal",
      muted: "true-as-string",
    }),
  });
  const store = createSaveStore(() => mockStorage);

  const loaded = store.load();
  assert.deepEqual(loaded, {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  });

  const status = store.getStatus();
  assert.equal(status.recovered, true);
});

test("known discovery IDs filter out unknown IDs, deduplicate, and discard non-strings", () => {
  const mockStorage = createMockStorage({
    [SAVE_KEY]: JSON.stringify({
      version: 1,
      discoveries: [
        "tower",
        "secret-unregistered-id",
        "tower",
        42,
        null,
        "skywalk",
      ],
      deliveryPhase: "available",
      maintenancePhase: "available",
      muted: false,
    }),
  });
  const store = createSaveStore(() => mockStorage);

  const loaded = store.load(["greenway", "tower", "skywalk"]);
  assert.deepEqual(loaded.discoveries, ["tower", "skywalk"]);

  const status = store.getStatus();
  assert.equal(status.recovered, true);
});

test("storage getter failure is caught safely and exposed in getStatus", () => {
  const store = createSaveStore(() => {
    throw new Error("SecurityError: localStorage is disabled");
  });

  const loaded = store.load();
  assert.deepEqual(loaded, {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  });
  const status = store.getStatus();
  assert.equal(status.available, false);
  assert.match(status.error, /SecurityError/);

  const saveResult = store.save({ muted: true });
  assert.equal(saveResult, false);
});

test("storage read exception returns defaults and updates getStatus", () => {
  const mockStorage = {
    getItem() {
      throw new Error("Disk read failure");
    },
    setItem() {},
  };
  const store = createSaveStore(() => mockStorage);

  const loaded = store.load();
  assert.deepEqual(loaded, {
    discoveries: [],
    deliveryPhase: "available",
    supplyPhase: "available",
    maintenancePhase: "available",
    sunlinePhase: "available",
    muted: false,
  });

  const status = store.getStatus();
  assert.equal(status.available, false);
  assert.match(status.error, /Disk read failure/);
});

test("storage write/quota exception returns false and updates getStatus", () => {
  const mockStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("QuotaExceededError: storage full");
    },
  };
  const store = createSaveStore(() => mockStorage);

  const saved = store.save({ muted: true });
  assert.equal(saved, false);

  const status = store.getStatus();
  assert.equal(status.available, false);
  assert.match(status.error, /QuotaExceededError/);
});

test("legacy v1 save without sunlinePhase loads without recovery or data loss", () => {
  const mockStorage = createMockStorage({
    [SAVE_KEY]: JSON.stringify({
      version: 1,
      discoveries: ["plaza", "skywalk"],
      deliveryPhase: "carrying",
      maintenancePhase: "repaired",
      muted: true,
    }),
  });
  const store = createSaveStore(() => mockStorage);
  const loaded = store.load(["plaza", "skywalk"]);
  assert.deepEqual(loaded, {
    discoveries: ["plaza", "skywalk"],
    deliveryPhase: "carrying",
    supplyPhase: "available",
    maintenancePhase: "repaired",
    sunlinePhase: "available",
    muted: true,
  });
  const status = store.getStatus();
  assert.equal(status.available, true);
  assert.equal(status.recovered, false);
});

test("invalid present sunlinePhase normalizes to available with recovered=true", () => {
  const mockStorage = createMockStorage({
    [SAVE_KEY]: JSON.stringify({
      version: 1,
      discoveries: ["plaza"],
      deliveryPhase: "available",
      maintenancePhase: "available",
      sunlinePhase: "not-a-real-phase",
      muted: false,
    }),
  });
  const store = createSaveStore(() => mockStorage);
  const loaded = store.load(["plaza"]);
  assert.equal(loaded.sunlinePhase, "available");
  assert.equal(store.getStatus().recovered, true);
});

test("a saved replacement remains pending restoration rather than restarting the job", () => {
  const storage = createMockStorage();
  const saved = createSaveStore(() => storage);
  assert.equal(saved.save({
    discoveries: ["plaza"], deliveryPhase: "carrying",
    maintenancePhase: "complete", sunlinePhase: "replaced", muted: true,
  }), true);
  const restored = createSaveStore(() => storage).load(["plaza"]);
  const job = createSunlineState(restored.sunlinePhase);
  const module = { ...SUNLINE_PANEL, grounded: true, traversalMode: "trolley" };
  assert.equal(job.interact(module).changed, false);
  assert.equal(job.getPhase(), "replaced");
  const console = { ...ENDCAP_HUBS[1].control, grounded: true, traversalMode: "secured" };
  assert.equal(job.interact(console).changed, true);
  assert.equal(job.getPhase(), "complete");
  assert.equal(restored.deliveryPhase, "carrying");
  assert.equal(restored.maintenancePhase, "complete");
  assert.equal(restored.muted, true);
});

test("legacy seed-complete saves unlock produce without recovery or lost progress", () => {
  const storage = createMockStorage({ [SAVE_KEY]: JSON.stringify({
    version: 1, discoveries: ["plaza"], deliveryPhase: "complete",
    maintenancePhase: "repaired", sunlinePhase: "replaced", muted: true,
  }) });
  const store = createSaveStore(() => storage);
  assert.deepEqual(store.load(["plaza"]), {
    discoveries: ["plaza"], deliveryPhase: "complete", supplyPhase: "available",
    maintenancePhase: "repaired", sunlinePhase: "replaced", muted: true,
  });
  assert.equal(store.getStatus().recovered, false);
});

test("produce carrying and completion survive reload, but cannot precede seed completion", () => {
  for (const supplyPhase of ["carrying", "complete"]) {
    const storage = createMockStorage();
    const store = createSaveStore(() => storage);
    store.save({ deliveryPhase: "complete", supplyPhase, muted: true });
    assert.equal(createSaveStore(() => storage).load().supplyPhase, supplyPhase);
    store.save({ deliveryPhase: "carrying", supplyPhase });
    assert.equal(createSaveStore(() => storage).load().supplyPhase, "available");

    storage.setItem(SAVE_KEY, JSON.stringify({
      version: 1, discoveries: [], deliveryPhase: "available", supplyPhase,
      maintenancePhase: "available", sunlinePhase: "available", muted: false,
    }));
    const contradictory = createSaveStore(() => storage);
    assert.equal(contradictory.load().supplyPhase, "available");
    assert.equal(contradictory.getStatus().recovered, true);
  }
  const invalid = createSaveStore(() => createMockStorage({ [SAVE_KEY]: JSON.stringify({
    version: 1, discoveries: [], deliveryPhase: "complete", supplyPhase: "lost",
    maintenancePhase: "available", sunlinePhase: "available", muted: false,
  }) }));
  assert.equal(invalid.load().supplyPhase, "available");
  assert.equal(invalid.getStatus().recovered, true);
});
