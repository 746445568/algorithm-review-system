const LOCAL_SERVICE_BASE = "http://127.0.0.1:38473";
const IMPORT_TOKEN_KEY = "ojReviewImportToken";
const PENDING_IMPORTS_KEY = "ojReviewPendingImports";
const LAST_IMPORT_ERROR_KEY = "ojReviewLastImportError";

const summaryEl = document.getElementById("summary");
const pairForm = document.getElementById("pairForm");
const pairingCodeInput = document.getElementById("pairingCode");
const pairButton = document.getElementById("pairButton");
const pairedActions = document.getElementById("pairedActions");
const importButton = document.getElementById("importButton");
const retryButton = document.getElementById("retryButton");
const showPairFormButton = document.getElementById("showPairFormButton");
const queueStatusEl = document.getElementById("queueStatus");
const statusEl = document.getElementById("status");

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  if (tone) statusEl.dataset.tone = tone;
  else delete statusEl.dataset.tone;
}

async function refreshState() {
  const stored = await chrome.storage.local.get([
    IMPORT_TOKEN_KEY,
    PENDING_IMPORTS_KEY,
    LAST_IMPORT_ERROR_KEY,
  ]);
  const paired = Boolean(stored[IMPORT_TOKEN_KEY]);
  const pending = Array.isArray(stored[PENDING_IMPORTS_KEY])
    ? stored[PENDING_IMPORTS_KEY].length
    : 0;
  summaryEl.textContent = paired
    ? "Paired. Visible submission source is imported automatically."
    : "Pair with OJ Review Desktop before importing source code.";
  pairForm.hidden = paired;
  pairedActions.hidden = !paired;
  queueStatusEl.textContent = pending > 0 ? `${pending} import(s) waiting to retry.` : "";
  if (stored[LAST_IMPORT_ERROR_KEY]?.message) {
    setStatus(stored[LAST_IMPORT_ERROR_KEY].message, "error");
  }
}

async function pairExtension(event) {
  event.preventDefault();
  const code = pairingCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus("Enter the six-digit code shown in OJ Review Desktop.", "error");
    return;
  }

  pairButton.disabled = true;
  setStatus("Pairing...");
  try {
    const response = await fetch(`${LOCAL_SERVICE_BASE}/api/extension/pairing/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `${response.status} ${response.statusText}`);
    }
    const body = await response.json();
    if (!body?.token) throw new Error("Pairing response did not include an import token.");
    await chrome.storage.local.set({ [IMPORT_TOKEN_KEY]: body.token });
    pairingCodeInput.value = "";
    await chrome.runtime.sendMessage({ type: "OJ_REVIEW_PAIRING_UPDATED" });
    setStatus("Paired successfully.", "ok");
    await refreshState();
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    pairButton.disabled = false;
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !tabs[0].id) throw new Error("No active tab found.");
  return tabs[0];
}

async function extractFromTab(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    throw new Error("Open a supported Codeforces or AtCoder page and try again.");
  }
  const response = await chrome.tabs.sendMessage(tabId, { type: "OJ_REVIEW_EXTRACT" });
  if (!response?.ok) throw new Error(response?.error || "Could not extract this page.");
  return response.artifact;
}

async function handleImport() {
  importButton.disabled = true;
  setStatus("Importing...");
  try {
    const tab = await getActiveTab();
    const artifact = await extractFromTab(tab.id);
    const result = await chrome.runtime.sendMessage({
      type: "OJ_REVIEW_IMPORT_ARTIFACT",
      artifact,
    });
    if (!result?.ok) throw new Error(result?.error || "Import was queued for retry.");
    setStatus(result.status === "already-imported" ? "Already imported." : "Imported.", "ok");
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    importButton.disabled = false;
    await refreshState();
  }
}

async function retryPendingImports() {
  retryButton.disabled = true;
  setStatus("Retrying...");
  try {
    const result = await chrome.runtime.sendMessage({ type: "OJ_REVIEW_FLUSH_QUEUE" });
    if (!result?.ok) throw new Error(result?.error || "Pending imports could not be sent.");
    setStatus("Pending imports checked.", "ok");
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    retryButton.disabled = false;
    await refreshState();
  }
}

function friendlyError(error) {
  const message = error?.message || String(error);
  if (error instanceof TypeError || message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "OJ Review Desktop is not reachable at 127.0.0.1:38473.";
  }
  return message;
}

pairForm.addEventListener("submit", (event) => void pairExtension(event));
importButton.addEventListener("click", () => void handleImport());
retryButton.addEventListener("click", () => void retryPendingImports());
showPairFormButton.addEventListener("click", () => {
  pairForm.hidden = false;
  pairingCodeInput.focus();
});

void refreshState();
