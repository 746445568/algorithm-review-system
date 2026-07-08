(function () {
  if (window.__ojReviewCompanionContentLoaded) {
    return;
  }
  window.__ojReviewCompanionContentLoaded = true;

  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").trim();
  }

  function textFromElement(selector) {
    const element = document.querySelector(selector);
    return element ? cleanText(element.textContent) : "";
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
    const match = pathname.match(/^\/contest\/(\d+)\/submission\/(\d+)/);
    if (!match) return null;
    return { contestId: match[1], submissionId: match[2] };
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
  function problemIdFromLink(contestId) {
    const link = Array.from(document.querySelectorAll("a[href]")).find((item) =>
      item.getAttribute("href").includes(`/contests/${contestId}/tasks/`) ||
      item.getAttribute("href").includes(`/contest/${contestId}/problem/`)
    );
    if (!link) return "";
    const href = link.getAttribute("href");
    const atcoder = href.match(/\/contests\/[^/]+\/tasks\/([^/?#]+)/);
    if (atcoder) return atcoder[1];
    const codeforces = href.match(/\/contest\/(\d+)\/problem\/([^/?#]+)/);
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
      return cleanText(legacyBlock.textContent);
    }

    // Fallback 2: older highlight.js layout
    const preBlock = document.querySelector("pre.linenums");
    if (preBlock) {
      return cleanText(preBlock.textContent);
    }

    return null;
  }

  /**
   * Extract a metadata field value from the "Submission Info" table by
   * matching the row header text.
   *
   * @param {string} label  e.g. "Language", "Task", "Status"
   * @returns {string}
   */
  function submissionInfoField(label) {
    const rows = document.querySelectorAll("table tr");
    for (const row of rows) {
      const th = row.querySelector("th");
      if (th && cleanText(th.textContent) === label) {
        const td = row.querySelector("td");
        return td ? cleanText(td.textContent) : "";
      }
    }
    return "";
  }

  // ── Codeforces extractor ─────────────────────────────────────────────────

  function extractCodeforces() {
    const pathname = window.location.pathname;
    const submission = parseCodeforcesSubmission(pathname);
    if (submission) {
      const sourceElement = document.querySelector("#program-source-text");
      if (!sourceElement) {
        throw new Error("No visible Codeforces source block found on this page.");
      }
      return {
        kind: "submission-source",
        payload: {
          platform: "CODEFORCES",
          externalSubmissionId: submission.submissionId,
          externalProblemId: problemIdFromLink(submission.contestId),
          sourceContestId: submission.contestId,
          sourceCode: cleanText(sourceElement.textContent),
          language: textFromElement(".submission-info td:nth-child(3)"),
          url: window.location.href,
        },
      };
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

      const language = submissionInfoField("Language");
      const status = submissionInfoField("Status");

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
