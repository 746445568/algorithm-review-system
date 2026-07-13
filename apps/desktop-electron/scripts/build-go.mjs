import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const serverRoot = path.resolve(appRoot, "..", "server");
const outDir = path.resolve(appRoot, "bin");
const desktopPackage = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
const commitResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" });
if (commitResult.status !== 0) throw new Error("unable to resolve Git commit for service build");

const version = desktopPackage.version;
const commit = commitResult.stdout.trim();
const apiVersion = "1";
const goos = process.env.GOOS || "";
const goarch = process.env.GOARCH || "";
const ext = goos === "windows" || (!goos && process.platform === "win32") ? ".exe" : "";
const outPath = path.resolve(outDir, `ojreviewd${ext}`);
const packagePath = "ojreviewdesktop/internal/buildinfo";
const ldflags = [
  `-X ${packagePath}.Version=${version}`,
  `-X ${packagePath}.Commit=${commit}`,
  `-X ${packagePath}.APIVersion=${apiVersion}`,
].join(" ");

mkdirSync(outDir, { recursive: true });
const env = { ...process.env };
if (goos) env.GOOS = goos;
if (goarch) env.GOARCH = goarch;
const build = spawnSync("go", ["build", "-trimpath", "-ldflags", ldflags, "-o", outPath, "./cmd/ojreviewd"], {
  cwd: serverRoot,
  stdio: "inherit",
  shell: false,
  env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const probe = spawnSync(outPath, ["--version-json"], { encoding: "utf8", shell: false });
if (probe.status !== 0) throw new Error("built service did not return version metadata");
const metadata = JSON.parse(probe.stdout.trim());
if (metadata.version !== version || metadata.commit !== commit || metadata.apiVersion !== apiVersion) {
  throw new Error(`built service metadata mismatch: ${probe.stdout.trim()}`);
}
console.log(`[build-go] ${outPath}: ${version} ${commit} apiVersion=${apiVersion}`);
