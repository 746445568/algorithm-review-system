import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const extensionDir = path.resolve("../browser-extension");
const contentScript = fs.readFileSync(path.join(extensionDir, "content.js"), "utf8");
const fixtureDir = path.resolve("tests/e2e/fixtures");

test("Codeforces problem statement can be extracted manually", async () => {
  const html = fs.readFileSync(path.join(fixtureDir, "codeforces-problem.html"), "utf8");
  const harness = createContentHarness(html, "https://codeforces.com/contest/1900/problem/A");

  const response = await extractCurrentPage(harness);

  assert.equal(response.ok, true);
  assert.equal(response.artifact.kind, "problem-statement");
  assert.equal(response.artifact.payload.externalProblemId, "1900/A");
  assert.match(response.artifact.payload.statementText, /Covering Points/);
  harness.dom.window.close();
});

test("AtCoder problem statement can be extracted manually", async () => {
  const html = fs.readFileSync(path.join(fixtureDir, "atcoder-task.html"), "utf8");
  const harness = createContentHarness(html, "https://atcoder.jp/contests/abc300/tasks/abc300_a");

  const response = await extractCurrentPage(harness);

  assert.equal(response.ok, true);
  assert.equal(response.artifact.kind, "problem-statement");
  assert.equal(response.artifact.payload.externalProblemId, "abc300_a");
  assert.match(response.artifact.payload.statementText, /total score/);
  harness.dom.window.close();
});

test("unsupported pages return a controlled extraction error", async () => {
  const harness = createContentHarness("<p>blog</p>", "https://codeforces.com/blog/entry/1");

  const response = await extractCurrentPage(harness);

  assert.equal(response.ok, false);
  assert.match(response.error, /not a supported problem statement or submission page/);
  harness.dom.window.close();
});

test("supported pages with missing DOM return a controlled extraction error", async () => {
  const harness = createContentHarness(
    "<p>missing statement</p>",
    "https://atcoder.jp/contests/abc300/tasks/abc300_a"
  );

  const response = await extractCurrentPage(harness);

  assert.equal(response.ok, false);
  assert.match(response.error, /No visible AtCoder problem statement/);
  harness.dom.window.close();
});

test("Codeforces submission detail source is captured automatically", async () => {
  const html = fs.readFileSync(path.join(fixtureDir, "codeforces-submission.html"), "utf8");
  const harness = createContentHarness(html, "https://codeforces.com/contest/1900/submission/12345678");

  await waitForCapture();

  const artifact = latestSourceArtifact(harness.messages);
  assert.equal(artifact.payload.externalSubmissionId, "12345678");
  assert.equal(artifact.payload.externalProblemId, "1900/A");
  assert.match(artifact.payload.sourceCode, /#include/);
  assert.equal(artifact.payload.language, "GNU C++17");
  harness.dom.window.close();
});

test("Codeforces status-page dialog uses the clicked submission identity", async () => {
  const harness = createContentHarness(`
    <table><tr>
      <td><a id="submission" href="/contest/1900/submission/87654321">87654321</a></td>
      <td><a href="/contest/1900/problem/B">B</a></td>
    </tr></table>
  `, "https://codeforces.com/contest/1900/status");

  harness.dom.window.document.getElementById("submission").addEventListener("click", (event) => event.preventDefault());
  harness.dom.window.document.getElementById("submission").dispatchEvent(
    new harness.dom.window.MouseEvent("click", { bubbles: true, cancelable: true })
  );
  const dialog = harness.dom.window.document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.innerHTML = `
    <a href="/contest/1900/problem/B">B</a>
    <table><tr><th>Language</th><td>GNU C++23</td></tr></table>
    <pre id="program-source-text"></pre>
  `;
  const originalSource = "\n  int main() { return 0; }\n";
  dialog.querySelector("#program-source-text").textContent = originalSource;
  harness.dom.window.document.body.append(dialog);

  await waitForCapture();

  const artifact = latestSourceArtifact(harness.messages);
  assert.equal(artifact.payload.externalSubmissionId, "87654321");
  assert.equal(artifact.payload.externalProblemId, "1900/B");
  assert.equal(artifact.payload.language, "GNU C++23");
  assert.equal(artifact.payload.url, "https://codeforces.com/contest/1900/submission/87654321");
  assert.equal(artifact.payload.sourceCode, originalSource);
  harness.dom.window.close();
});

test("AtCoder visible submission source is captured automatically", async () => {
  const html = fs.readFileSync(path.join(fixtureDir, "atcoder-submission.html"), "utf8");
  const harness = createContentHarness(html, "https://atcoder.jp/contests/abc300/submissions/99999");

  await waitForCapture();

  const artifact = latestSourceArtifact(harness.messages);
  assert.equal(artifact.payload.externalSubmissionId, "99999");
  assert.equal(artifact.payload.externalProblemId, "abc300_a");
  assert.match(artifact.payload.sourceCode, /input\(\)/);
  assert.equal(artifact.payload.language, "Python (CPython 3.x)");
  harness.dom.window.close();
});

function createContentHarness(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  const messages = [];
  let messageListener = null;
  dom.window.chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        },
      },
      async sendMessage(message) {
        messages.push(message);
        return { ok: true };
      },
    },
  };
  dom.window.eval(contentScript);
  return { dom, messages, get messageListener() { return messageListener; } };
}

function latestSourceArtifact(messages) {
  const message = messages.findLast((item) => item.type === "OJ_REVIEW_SOURCE_CAPTURED");
  assert.ok(message, "expected an automatic source capture message");
  return message.artifact;
}

function extractCurrentPage(harness) {
  assert.equal(typeof harness.messageListener, "function");
  return new Promise((resolve) => {
    harness.messageListener({ type: "OJ_REVIEW_EXTRACT" }, {}, resolve);
  });
}

function waitForCapture() {
  return new Promise((resolve) => setTimeout(resolve, 350));
}
