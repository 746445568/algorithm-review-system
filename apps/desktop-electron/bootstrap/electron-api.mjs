function isInspectableObject(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function inspectValue(value) {
  if (value === null) {
    return { type: "null", keys: [] };
  }

  const type = Array.isArray(value) ? "array" : typeof value;
  if (!isInspectableObject(value)) {
    return { type, keys: [] };
  }

  let keys = [];
  try {
    keys = Object.keys(value).slice(0, 20);
  } catch {
    keys = [];
  }

  return { type, keys };
}

function getCandidates(imported) {
  const candidates = [
    { label: "module namespace", value: imported },
  ];

  if (isInspectableObject(imported) && "default" in imported) {
    candidates.push({ label: "default export", value: imported.default });

    if (isInspectableObject(imported.default) && "default" in imported.default) {
      candidates.push({ label: "nested default export", value: imported.default.default });
    }
  }

  return candidates;
}

const REQUIRED_KEY_VALIDATORS = {
  app: (value) =>
    isInspectableObject(value) &&
    typeof value.whenReady === "function" &&
    typeof value.getPath === "function" &&
    typeof value.quit === "function",
  BrowserWindow: (value) =>
    typeof value === "function" && typeof value.getAllWindows === "function",
  ipcMain: (value) => isInspectableObject(value) && typeof value.handle === "function",
  shell: (value) => isInspectableObject(value) && typeof value.openExternal === "function",
  contextBridge: (value) =>
    isInspectableObject(value) && typeof value.exposeInMainWorld === "function",
  ipcRenderer: (value) =>
    isInspectableObject(value) &&
    typeof value.invoke === "function" &&
    typeof value.on === "function",
};

function hasRequiredKeys(value, requiredKeys) {
  if (!isInspectableObject(value)) {
    return false;
  }

  return requiredKeys.every((key) => {
    const candidate = value[key];
    if (candidate === undefined || candidate === null) {
      return false;
    }

    const validator = REQUIRED_KEY_VALIDATORS[key];
    if (!validator) {
      return true;
    }

    return validator(candidate);
  });
}

export async function resolveElectronApi({ role, specifiers, requiredKeys }) {
  const attempts = [];

  for (const specifier of specifiers) {
    try {
      const imported = await import(specifier);
      const candidates = getCandidates(imported);

      const attempt = {
        specifier,
        status: "loaded",
        importShape: inspectValue(imported),
        candidates: candidates.map((candidate) => ({
          label: candidate.label,
          ...inspectValue(candidate.value),
        })),
      };
      attempts.push(attempt);

      const match = candidates.find((candidate) => hasRequiredKeys(candidate.value, requiredKeys));
      if (match) {
        return {
          api: match.value,
          diagnostics: {
            role,
            specifier,
            candidate: match.label,
            requiredKeys,
            attempts,
          },
        };
      }
    } catch (error) {
      attempts.push({
        specifier,
        status: "error",
        message: error?.message ?? String(error),
      });
    }
  }

  const failure = new Error(`failed to resolve Electron ${role} API`);
  failure.name = "ElectronBootstrapError";
  failure.diagnostics = {
    role,
    requiredKeys,
    attempts,
  };
  throw failure;
}

export function formatElectronBootstrapFailure(error) {
  if (!error || error.name !== "ElectronBootstrapError") {
    return `[ojreview-bootstrap] ${error?.stack ?? String(error)}`;
  }

  const diagnostics = error.diagnostics ?? {};
  const lines = [
    `[ojreview-bootstrap] failed to resolve Electron ${diagnostics.role ?? "unknown"} API`,
    `[ojreview-bootstrap] required keys: ${(diagnostics.requiredKeys ?? []).join(", ")}`,
  ];

  for (const attempt of diagnostics.attempts ?? []) {
    if (attempt.status === "error") {
      lines.push(`[ojreview-bootstrap] ${attempt.specifier}: import failed: ${attempt.message}`);
      continue;
    }

    const importKeys = attempt.importShape?.keys?.join(", ") || "(none)";
    lines.push(
      `[ojreview-bootstrap] ${attempt.specifier}: imported ${attempt.importShape?.type ?? "unknown"} with keys ${importKeys}`
    );

    for (const candidate of attempt.candidates ?? []) {
      const candidateKeys = candidate.keys?.join(", ") || "(none)";
      lines.push(
        `[ojreview-bootstrap]   ${candidate.label}: ${candidate.type ?? "unknown"} with keys ${candidateKeys}`
      );
    }
  }

  return lines.join("\n");
}

export function getElectronBootstrapProbePayload(result) {
  return JSON.stringify({
    ok: true,
    role: result?.diagnostics?.role ?? "unknown",
    specifier: result?.diagnostics?.specifier ?? "unknown",
    candidate: result?.diagnostics?.candidate ?? "unknown",
    requiredKeys: result?.diagnostics?.requiredKeys ?? [],
  });
}
