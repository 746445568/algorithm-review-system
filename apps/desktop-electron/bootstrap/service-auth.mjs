import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadOrCreateServiceToken(appDir) {
  const envToken = process.env.OJREVIEW_SERVICE_TOKEN?.trim();
  if (envToken) return envToken;

  const secureDir = path.join(appDir, "secure");
  const tokenPath = path.join(secureDir, "service-auth.token");
  await mkdir(secureDir, { recursive: true, mode: 0o700 });
  try {
    const existing = (await readFile(tokenPath, "utf8")).trim();
    if (existing) return existing;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const token = randomBytes(32).toString("base64url");
  await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}
