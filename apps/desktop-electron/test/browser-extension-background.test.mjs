import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const backgroundScript = fs.readFileSync(
  path.resolve("../browser-extension/background.js"),
  "utf8"
);

test("background imports a captured source with the dedicated token and deduplicates it", async () => {
  const requests = [];
  const harness = createBackgroundHarness(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, statusText: "OK" };
  });
  harness.storage.ojReviewImportToken = "extension-token";

  const first = await harness.send(sourceMessage());
  const second = await harness.send(sourceMessage());

  assert.equal(first.ok, true);
  assert.equal(second.status, "already-imported");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:38473/api/import/submission-source");
  assert.equal(requests[0].options.headers.Authorization, "Bearer extension-token");
  assert.equal(harness.storage.ojReviewPendingImports.length, 0);
});

test("background keeps a bounded retry item when the local service is unreachable", async () => {
  const harness = createBackgroundHarness(async () => {
    throw new TypeError("Failed to fetch");
  });
  harness.storage.ojReviewImportToken = "extension-token";

  const result = await harness.send(sourceMessage());

  assert.equal(result.ok, false);
  assert.equal(harness.storage.ojReviewPendingImports.length, 1);
  assert.equal(harness.storage.ojReviewPendingImports[0].attempts, 1);
  assert.ok(harness.storage.ojReviewPendingImports[0].nextRetryAt > Date.now());
  assert.match(harness.storage.ojReviewLastImportError.message, /not reachable/);
});

test("background rejects capture messages from unsupported tabs", async () => {
  const harness = createBackgroundHarness(async () => ({ ok: true, status: 200 }));
  harness.storage.ojReviewImportToken = "extension-token";

  const result = await harness.send(sourceMessage(), {
    id: "test-extension-id",
    tab: { url: "https://example.invalid/submission/1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "Invalid source capture.");
});

function createBackgroundHarness(fetchImplementation) {
  const storage = {};
  const runtimeOnMessage = createChromeEvent();
  const context = {
    chrome: {
      runtime: {
        id: "test-extension-id",
        onInstalled: createChromeEvent(),
        onStartup: createChromeEvent(),
        onMessage: runtimeOnMessage,
      },
      alarms: {
        onAlarm: createChromeEvent(),
        async get() { return null; },
        async create() {},
      },
      storage: {
        local: {
          async get(keys) {
            const selected = {};
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              if (Object.hasOwn(storage, key)) selected[key] = storage[key];
            }
            return selected;
          },
          async set(values) { Object.assign(storage, values); },
          async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
          },
          async setAccessLevel() {},
        },
      },
    },
    crypto: webcrypto,
    TextEncoder,
    URL,
    Date,
    Error,
    TypeError,
    Array,
    Number,
    String,
    JSON,
    Math,
    fetch: fetchImplementation,
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(backgroundScript, context, { filename: "background.js" });

  return {
    storage,
    async send(message, sender = {
      id: "test-extension-id",
      tab: { url: "https://codeforces.com/contest/1900/submission/123" },
    }) {
      assert.equal(runtimeOnMessage.listeners.length, 1);
      return await new Promise((resolve) => {
        const keepAlive = runtimeOnMessage.listeners[0](message, sender, resolve);
        assert.equal(keepAlive, true);
      });
    },
  };
}

function createChromeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
  };
}

function sourceMessage() {
  return {
    type: "OJ_REVIEW_SOURCE_CAPTURED",
    artifact: {
      kind: "submission-source",
      payload: {
        platform: "CODEFORCES",
        externalSubmissionId: "123",
        externalProblemId: "1900/A",
        sourceContestId: "1900",
        sourceCode: "int main() {}",
        language: "GNU C++23",
        url: "https://codeforces.com/contest/1900/submission/123",
      },
    },
  };
}
