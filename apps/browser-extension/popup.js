const LOCAL_SERVICE_BASE = "http://127.0.0.1:38473";
const SECURE_PAIRING_AVAILABLE = false;

const importButton = document.getElementById("importButton");
const statusEl = document.getElementById("status");

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  if (tone) {
    statusEl.dataset.tone = tone;
  } else {
    delete statusEl.dataset.tone;
  }
}

function endpointFor(kind) {
  if (kind === "problem-statement") {
    return "/api/import/problem-statement";
  }
  if (kind === "submission-source") {
    return "/api/import/submission-source";
  }
  throw new Error(`Unsupported artifact type: ${kind}`);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || !tabs[0].id) {
    throw new Error("No active tab found.");
  }
  return tabs[0];
}

async function extractFromTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  const response = await chrome.tabs.sendMessage(tabId, { type: "OJ_REVIEW_EXTRACT" });
  if (!response?.ok) {
    throw new Error(response?.error || "Could not extract an artifact from this page.");
  }
  return response.artifact;
}

async function importArtifact(artifact) {
  const response = await fetch(`${LOCAL_SERVICE_BASE}${endpointFor(artifact.kind)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(artifact.payload),
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Keep the HTTP status message.
    }
    throw new Error(message);
  }
  return response.json();
}

async function handleImport() {
  if (!SECURE_PAIRING_AVAILABLE) {
    setStatus("Secure pairing is required before imports can resume.", "error");
    return;
  }
  importButton.disabled = true;
  setStatus("Importing...");
  try {
    const tab = await getActiveTab();
    const artifact = await extractFromTab(tab.id);
    await importArtifact(artifact);
    const label = artifact.kind === "problem-statement" ? "problem statement" : "source code";
    setStatus(`Imported ${label}.`, "ok");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    importButton.disabled = false;
  }
}

importButton.addEventListener("click", () => {
  void handleImport();
});
