import test from "node:test";
import assert from "node:assert/strict";

import { createAppStateRepository } from "../src/repository.js";

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

test("repository persists and reloads versioned workflow state", () => {
  const storage = createMemoryStorage();
  const repository = createAppStateRepository(storage);
  const state = {
    version: 2,
    donations: [{ id: "don_1", status: "pending_review" }],
    recipientRequests: [{ id: "req_1", status: "open" }],
  };

  repository.save(state);

  assert.deepEqual(repository.load(), state);
});

test("repository migrates legacy donation-only storage", () => {
  const storage = createMemoryStorage({
    "foodDonationCentre.donations.v1": JSON.stringify([{ id: "don_legacy" }]),
  });
  const repository = createAppStateRepository(storage);

  assert.deepEqual(repository.load(), {
    version: 2,
    donations: [{ id: "don_legacy" }],
    recipientRequests: [],
  });
});
