import path from "node:path";

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "codeforces.com",
  "www.codeforces.com",
  "atcoder.jp",
  "www.atcoder.jp",
]);

export function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    return ["http:", "https:"].includes(parsed.protocol)
      && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isPathWithinAllowedRoots(candidate, roots) {
  return roots.some((root) => {
    const relative = path.relative(path.resolve(root), path.resolve(String(candidate)));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}
