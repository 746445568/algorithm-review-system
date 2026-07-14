(function () {
  if (window.__ojReviewCompanionContentLoaded) {
    return;
  }
  window.__ojReviewCompanionContentLoaded = true;

  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").trim();
  }

  function sourceText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
  }

  function textFromElement(selector) {
    const element = document.querySelector(selector);
    return element ? cleanText(element.textContent) : "";
  }

  function normalizeLabel(value) {
    return cleanText(value).replace(/:$/, "").toLowerCase();
  }

  function tableField(label, root = document) {
    const wanted = normalizeLabel(label);
    const rows = [
      ...(root.matches?.("tr") ? [root] : []),
      ...root.querySelectorAll("table tr"),
    ];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("th, td"));
      if (cells.length >= 2 && normalizeLabel(cells[0].textContent) === wanted) {
        return cleanText(cells[1].textContent);
      }
    }
    return "";
  }

  function parseCodeforcesProblem(pathname) {
    const problemset = pathname.match(/^\/problemset\/problem\/(\d+)\/([^/]+)/);
    if (problemset) {
      return { contestId: problemset[1], index: problemset[2], externalProblemId: `${problemset[1]}/${problemset[2]}` };
    }
    const contest = pathname.match(/^\/contest\/(\d+)\/problem\/([^/]+)/);
    if (contest) {
      return { contestId: contest[1], index: contest[2], externalProblemId: `${contest[1]}/${contest[2]}` };
    }
    return null;
  }

  function parseCodeforcesSubmission(pathname) {
    const match = pathname.match(/^\/(contest|gym)\/(\d+)\/submission\/(\d+)/);
    if (!match) return null;
    return { contestType: match[1], contestId: match[2], submissionId: match[3] };
  }

  function parseAtCoderTask(pathname) {
    const match = pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/]+)/);
    if (!match) return null;
    return { contestId: match[1], externalProblemId: match[2] };
  }

  function parseAtCoderSubmission(pathname) {
    const match = pathname.match(/^\/contests\/([^/]+)\/submissions\/(\d+)/);
    if (!match) return null;
    return { contestId: match[1], submissionId: match[2] };
  }

  /**
   * On a submission detail page, find the link to the task/problem.
   * Works for both AtCoder (/contests/{id}/tasks/{problem}) and
   * Codeforces (/contest/{id}/problem/{index}).
   */
  function problemIdFromLink(contestId, root = document) {
    const link = Array.from(root.querySelectorAll("a[href]")).find((item) =>
      item.getAttribute("href").includes(`/contests/${contestId}/tasks/`) ||
      item.getAttribute("href").includes(`/contest/${contestId}/problem/`) ||
      item.getAttribute("href").includes(`/gym/${contestId}/problem/`)
    );
    if (!link) return "";
    const href = link.getAttribute("href");
    const atcoder = href.match(/\/contests\/[^/]+\/tasks\/([^/?#]+)/);
    if (atcoder) return atcoder[1];
    const codeforces = href.match(/\/(?:contest|gym)\/(\d+)\/problem\/([^/?#]+)/);
    if (codeforces) return `${codeforces[1]}/${codeforces[2]}`;
    return "";
  }

  /**
   * Extract source code text from an AtCoder submission page.
   *
   * AtCoder renders source code in a CodeMirror editor. The visible text
   * is split across many `.CodeMirror-line` elements. We collect them all
   * and join with newlines to reconstruct the original source.
   *
   * Selector priority:
   *   1. `.CodeMirror-lines .CodeMirror-line`  – standard CodeMirror DOM
   *   2. `#submission-code`                    – legacy fallback (pre-2024)
   *   3. `pre.linenums`                        – older highlight.js layout
   */
  function extractAtCoderSourceCode() {
    // Primary: CodeMirror line elements
    const cmLines = document.querySelectorAll(".CodeMirror-lines .CodeMirror-line");
    if (cmLines.length > 0) {
      return Array.from(cmLines)
        .map((line) => {
          // Each line may contain multiple spans; use textContent for the whole line.
          // Replace the zero-width no-break space CodeMirror uses for empty lines.
          return line.textContent.replace(/\u200b/g, "");
        })
        .join("\n");
    }

    // Fallback 1: legacy #submission-code block (pre-CodeMirror era)
    const legacyBlock = document.querySelector("#submission-code");
    if (legacyBlock) {
      return sourceText(legacyBlock.textContent);
    }

    // Fallback 2: older highlight.js layout
    const preBlock = document.querySelector("pre.linenums");
    if (preBlock) {
      return sourceText(preBlock.textContent);
    }

    return null;
  }

  let codeforcesSubmissionHint = null;

  function captureCodeforcesSubmissionHint(link) {
    const parsed = parseCodeforcesSubmission(new URL(link.href, window.location.href).pathname);
    if (!parsed) return;
    const row = link.closest("tr") || document;
    codeforcesSubmissionHint = {
      ...parsed,
      externalProblemId: problemIdFromLink(parsed.contestId, row),
      language: tableField("Language", row),
      url: new URL(link.href, window.location.href).href,
    };
  }

  function codeforcesSubmissionArtifact() {
    const sourceElement = document.querySelector("#program-source-text");
    const submission = parseCodeforcesSubmission(window.location.pathname) || codeforcesSubmissionHint;
    if (!sourceElement || !submission) return null;
    const sourceRoot = sourceElement.closest("[role='dialog'], .ui-dialog, .source-popup") || document;
    return {
      kind: "submission-source",
      payload: {
        platform: "CODEFORCES",
        externalSubmissionId: submission.submissionId,
        externalProblemId:
          problemIdFromLink(submission.contestId, sourceRoot) ||
          submission.externalProblemId ||
          problemIdFromLink(submission.contestId),
        sourceContestId: submission.contestId,
        sourceCode: sourceText(sourceElement.textContent),
        language:
          tableField("Language", sourceRoot) ||
          submission.language ||
          textFromElement(".submission-info td:nth-child(3)"),
        url: submission.url || window.location.href,
      },
    };
  }

  // ── Codeforces extractor ─────────────────────────────────────────────────

  function extractCodeforces() {
    const pathname = window.location.pathname;
    const visibleSubmission = codeforcesSubmissionArtifact();
    if (visibleSubmission) return visibleSubmission;
    const submission = parseCodeforcesSubmission(pathname);
    if (submission) {
      const artifact = codeforcesSubmissionArtifact();
      if (!artifact) {
        throw new Error("No visible Codeforces source block found on this page.");
      }
      return artifact;
    }

    const problem = parseCodeforcesProblem(pathname);
    if (problem) {
      const titleEl =
        document.querySelector(".problem-statement .title") ||
        document.querySelector(".title");
      const statementEl = document.querySelector(".problem-statement");
      if (!statementEl) {
        throw new Error("No visible Codeforces problem statement found on this page.");
      }
      return {
        kind: "problem-statement",
        payload: {
          platform: "CODEFORCES",
          externalProblemId: problem.externalProblemId,
          externalContestId: problem.contestId,
          title: titleEl ? cleanText(titleEl.textContent) : document.title,
          statementText: statementEl.innerHTML,
          url: window.location.href,
        },
      };
    }

    return null;
  }

  // ── AtCoder extractor ────────────────────────────────────────────────────

  function extractAtCoder() {
    const pathname = window.location.pathname;

    // ── Case 1: Submission detail page ──────────────────────────────────────
    //   URL: /contests/{contestId}/submissions/{submissionId}
    const submission = parseAtCoderSubmission(pathname);
    if (submission) {
      const sourceCode = extractAtCoderSourceCode();
      if (sourceCode === null) {
        throw new Error(
          "No visible source code block found on this AtCoder submission page. " +
          "Make sure you are on a submission detail page with source code displayed."
        );
      }

      // Resolve the problem ID from the Task link in the Submission Info table.
      const externalProblemId =
        problemIdFromLink(submission.contestId) ||
        // Fallback: parse from the Task cell text link href directly
        (() => {
          const taskLink = document.querySelector("table a[href*='/tasks/']");
          if (!taskLink) return "";
          const m = taskLink.getAttribute("href").match(/\/tasks\/([^/?#]+)/);
          return m ? m[1] : "";
        })();

      const language = tableField("Language");

      return {
        kind: "submission-source",
        payload: {
          platform: "ATCODER",
          externalSubmissionId: submission.submissionId,
          externalProblemId,
          sourceContestId: submission.contestId,
          sourceCode,
          language,
          url: window.location.href,
        },
      };
    }

    // ── Case 2: Task/problem page ────────────────────────────────────────────
    //   URL: /contests/{contestId}/tasks/{problemId}
    const task = parseAtCoderTask(pathname);
    if (task) {
      const statementEl =
        document.querySelector("#task-statement") ||
        document.querySelector(".lang-en") ||
        document.querySelector(".problem-statement");
      if (!statementEl) {
        throw new Error(
          "No visible AtCoder problem statement found on this page."
        );
      }
      const titleEl =
        document.querySelector(".h2") ||
        document.querySelector("h2");
      return {
        kind: "problem-statement",
        payload: {
          platform: "ATCODER",
          externalProblemId: task.externalProblemId,
          externalContestId: task.contestId,
          title: titleEl ? cleanText(titleEl.textContent) : document.title,
          statementText: statementEl.innerHTML,
          url: window.location.href,
        },
      };
    }

    return null;
  }

  function detectVisibleSubmissionSource() {
    const hostname = window.location.hostname;
    try {
      if (hostname === "codeforces.com" || hostname === "mirror.codeforces.com") {
        return codeforcesSubmissionArtifact();
      }
      if (hostname === "atcoder.jp" && parseAtCoderSubmission(window.location.pathname)) {
        return extractAtCoder();
      }
    } catch {
      return null;
    }
    return null;
  }

  let captureTimer = null;
  function scheduleVisibleSourceCapture() {
    if (captureTimer !== null) window.clearTimeout(captureTimer);
    captureTimer = window.setTimeout(() => {
      captureTimer = null;
      const artifact = detectVisibleSubmissionSource();
      if (artifact?.kind === "submission-source" && artifact.payload.sourceCode) {
        chrome.runtime.sendMessage({
          type: "OJ_REVIEW_SOURCE_CAPTURED",
          artifact,
        }).catch(() => {
          // The background queue retries after the extension wakes again.
        });
      }
    }, 150);
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.('a[href*="/submission/"]');
    if (!link) return;
    captureCodeforcesSubmissionHint(link);
    scheduleVisibleSourceCapture();
  }, true);

  const sourceObserver = new MutationObserver(scheduleVisibleSourceCapture);
  sourceObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  scheduleVisibleSourceCapture();

  // ── Message handler ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "OJ_REVIEW_EXTRACT") return;

    try {
      const hostname = window.location.hostname;
      let artifact = null;

      if (hostname === "codeforces.com" || hostname === "mirror.codeforces.com") {
        artifact = extractCodeforces();
      } else if (hostname === "atcoder.jp") {
        artifact = extractAtCoder();
      }

      if (!artifact) {
        sendResponse({
          ok: false,
          error:
            "This page is not a supported problem statement or submission page. " +
            "Navigate to a problem or submission detail page and try again.",
        });
        return;
      }

      sendResponse({ ok: true, artifact });
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  });
})();
