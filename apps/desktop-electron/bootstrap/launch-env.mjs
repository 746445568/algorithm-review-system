const ELECTRON_POISON_ENV_KEYS = ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_PATH"];

export function createElectronProcessEnv(extraEnv = {}) {
  const env = { ...process.env };
  const strippedEntries = [];

  for (const key of ELECTRON_POISON_ENV_KEYS) {
    if (!(key in env)) {
      continue;
    }

    strippedEntries.push(`${key}=${env[key]}`);
    delete env[key];
  }

  return {
    env: {
      ...env,
      ...extraEnv,
    },
    strippedEntries,
  };
}

export function formatElectronEnvSanitization(strippedEntries) {
  if (!strippedEntries?.length) {
    return null;
  }

  return `Sanitized inherited Electron env: ${strippedEntries.join(", ")}`;
}
