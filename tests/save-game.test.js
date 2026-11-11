import test from "node:test";
import assert from "node:assert/strict";
import { SAVE_KEY, createSaveStore } from "../src/save-game.js";

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
    maintenancePhase: "repaired",
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
    maintenancePhase: "available",
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
    maintenancePhase: "available",
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
    maintenancePhase: "available",
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
      muted: "true-as-string",
    }),
  });
  const store = createSaveStore(() => mockStorage);

  const loaded = store.load();
  assert.deepEqual(loaded, {
    discoveries: [],
    deliveryPhase: "available",
    maintenancePhase: "available",
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
    maintenancePhase: "available",
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
    maintenancePhase: "available",
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
