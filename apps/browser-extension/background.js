const LOCAL_SERVICE_BASE = "http://127.0.0.1:38473";
const IMPORT_TOKEN_KEY = "ojReviewImportToken";
const PENDING_IMPORTS_KEY = "ojReviewPendingImports";
const IMPORTED_FINGERPRINTS_KEY = "ojReviewImportedFingerprints";
const LAST_IMPORT_ERROR_KEY = "ojReviewLastImportError";
const RETRY_ALARM = "oj-review-import-retry";
const MAX_PENDING_IMPORTS = 20;
const MAX_IMPORTED_FINGERPRINTS = 100;

chrome.runtime.onInstalled.addListener(() => {
  void initializeBackground();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeBackground();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) {
    void flushPendingImports();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OJ_REVIEW_SOURCE_CAPTURED") {
    if (!isSupportedSender(sender) || !isSubmissionArtifact(message.artifact)) {
      sendResponse({ ok: false, error: "Invalid source capture." });
      return;
    }
    enqueueAndFlush(message.artifact).then(sendResponse);
    return true;
  }

  if (message?.type === "OJ_REVIEW_IMPORT_ARTIFACT") {
    if (!isSupportedSender(sender) || !isArtifact(message.artifact)) {
      sendResponse({ ok: false, error: "Invalid import artifact." });
      return;
    }
    enqueueAndFlush(message.artifact).then(sendResponse);
    return true;
  }

  if (message?.type === "OJ_REVIEW_PAIRING_UPDATED" || message?.type === "OJ_REVIEW_FLUSH_QUEUE") {
    flushPendingImports().then(sendResponse);
    return true;
  }
});

async function initializeBackground() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await ensureRetryAlarm();
  await flushPendingImports();
}

async function ensureRetryAlarm() {
  const existing = await chrome.alarms.get(RETRY_ALARM);
  if (!existing) {
    await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  }
}

async function enqueueAndFlush(artifact) {
  try {
    await ensureRetryAlarm();
    const fingerprint = await artifactFingerprint(artifact);
    const stored = await chrome.storage.local.get([
      PENDING_IMPORTS_KEY,
      IMPORTED_FINGERPRINTS_KEY,
    ]);
    const imported = Array.isArray(stored[IMPORTED_FINGERPRINTS_KEY])
      ? stored[IMPORTED_FINGERPRINTS_KEY]
      : [];
    if (imported.includes(fingerprint)) {
      return { ok: true, status: "already-imported" };
    }

    const pending = Array.isArray(stored[PENDING_IMPORTS_KEY])
      ? stored[PENDING_IMPORTS_KEY]
      : [];
    if (!pending.some((item) => item.fingerprint === fingerprint)) {
      pending.push({
        fingerprint,
        artifact,
        attempts: 0,
        nextRetryAt: 0,
        capturedAt: new Date().toISOString(),
      });
      await chrome.storage.local.set({
        [PENDING_IMPORTS_KEY]: pending.slice(-MAX_PENDING_IMPORTS),
      });
    }
    return await flushPendingImports();
  } catch (error) {
    await saveLastImportError(error);
    return { ok: false, error: error.message || String(error) };
  }
}

async function flushPendingImports() {
  const stored = await chrome.storage.local.get([
    IMPORT_TOKEN_KEY,
    PENDING_IMPORTS_KEY,
    IMPORTED_FINGERPRINTS_KEY,
  ]);
  const token = stored[IMPORT_TOKEN_KEY];
  const pending = Array.isArray(stored[PENDING_IMPORTS_KEY])
    ? [...stored[PENDING_IMPORTS_KEY]]
    : [];
  const imported = Array.isArray(stored[IMPORTED_FINGERPRINTS_KEY])
    ? [...stored[IMPORTED_FINGERPRINTS_KEY]]
    : [];
  if (!token) {
    return { ok: false, status: "pairing-required", pending: pending.length };
  }

  const now = Date.now();
  let importedCount = 0;
  let lastError = null;
  for (let index = 0; index < pending.length;) {
    const item = pending[index];
    if (Number(item.nextRetryAt || 0) > now) {
      index += 1;
      continue;
    }

    try {
      await postArtifact(item.artifact, token);
      pending.splice(index, 1);
      imported.push(item.fingerprint);
      importedCount += 1;
      continue;
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 403) {
        await chrome.storage.local.remove(IMPORT_TOKEN_KEY);
        break;
      }
      if (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
        pending.splice(index, 1);
        continue;
      }
      item.attempts = Number(item.attempts || 0) + 1;
      item.nextRetryAt = now + retryDelayMilliseconds(item.attempts);
      index += 1;
    }
  }

  await chrome.storage.local.set({
    [PENDING_IMPORTS_KEY]: pending,
    [IMPORTED_FINGERPRINTS_KEY]: imported.slice(-MAX_IMPORTED_FINGERPRINTS),
  });
  if (lastError) {
    await saveLastImportError(lastError);
    return {
      ok: false,
      error: lastError.message || String(lastError),
      pending: pending.length,
      imported: importedCount,
    };
  }
  await chrome.storage.local.remove(LAST_IMPORT_ERROR_KEY);
  return { ok: true, pending: pending.length, imported: importedCount };
}

async function postArtifact(artifact, token) {
  let response;
  try {
    response = await fetch(`${LOCAL_SERVICE_BASE}${endpointFor(artifact.kind)}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(artifact.payload),
    });
  } catch (error) {
    throw new Error(
      "Local OJ Review service is not reachable at 127.0.0.1:38473. " +
      (error.message || String(error))
    );
  }

  if (response.ok) {
    return;
  }
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = await response.json();
    message = body.error || message;
  } catch {
    // Keep the HTTP status message.
  }
  const error = new Error(message);
  error.status = response.status;
  throw error;
}

function endpointFor(kind) {
  if (kind === "problem-statement") return "/api/import/problem-statement";
  if (kind === "submission-source") return "/api/import/submission-source";
  throw new Error(`Unsupported artifact type: ${kind}`);
}

function isSupportedSender(sender) {
  if (sender.id !== chrome.runtime.id) return false;
  if (!sender.tab?.url) return true;
  try {
    const hostname = new URL(sender.tab.url).hostname;
    return hostname === "codeforces.com" || hostname === "mirror.codeforces.com" || hostname === "atcoder.jp";
  } catch {
    return false;
  }
}

function isArtifact(artifact) {
  return artifact &&
    (artifact.kind === "problem-statement" || artifact.kind === "submission-source") &&
    artifact.payload && typeof artifact.payload === "object";
}

function isSubmissionArtifact(artifact) {
  return isArtifact(artifact) &&
    artifact.kind === "submission-source" &&
    typeof artifact.payload.sourceCode === "string" &&
    artifact.payload.sourceCode.trim() !== "";
}

async function artifactFingerprint(artifact) {
  const payload = artifact.payload || {};
  const identity = artifact.kind === "submission-source"
    ? `${payload.platform}:${payload.externalSubmissionId}:${payload.sourceCode}`
    : `${payload.platform}:${payload.externalProblemId}:${payload.statementText}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function retryDelayMilliseconds(attempts) {
  const minutes = [1, 3, 10, 30, 120][Math.min(Math.max(attempts - 1, 0), 4)];
  return minutes * 60 * 1000;
}

async function saveLastImportError(error) {
  await chrome.storage.local.set({
    [LAST_IMPORT_ERROR_KEY]: {
      message: error.message || String(error),
      at: new Date().toISOString(),
    },
  });
}
