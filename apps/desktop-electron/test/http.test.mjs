import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUrl,
  normalizeBaseUrl,
} from "../renderer/src/lib/http.js";

test("normalizeBaseUrl preserves empty string for Vite proxy mode", () => {
  assert.equal(normalizeBaseUrl(""), "");
});

test("buildUrl uses browser origin when baseUrl is empty", () => {
  globalThis.window = {
    location: { origin: "http://preview.local:5180" },
  };

  assert.equal(
    buildUrl("", "/api/problems", { limit: 10 }),
    "http://preview.local:5180/api/problems?limit=10"
  );
});
