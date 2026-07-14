import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isAllowedExternalUrl, isPathWithinAllowedRoots } from "../bootstrap/security-policy.mjs";

test("external navigation only allows Codeforces and AtCoder HTTP(S)", () => {
  assert.equal(isAllowedExternalUrl("https://codeforces.com/problemset/problem/1/A"), true);
  assert.equal(isAllowedExternalUrl("https://atcoder.jp/contests/abc001"), true);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("https://codeforces.com.example.invalid"), false);
});

test("path opening stays inside allowed application roots", () => {
  const root = path.resolve("C:/safe/app");
  assert.equal(isPathWithinAllowedRoots(path.join(root, "exports", "report.json"), [root]), true);
  assert.equal(isPathWithinAllowedRoots(path.resolve(root, "..", "secret.txt"), [root]), false);
});
