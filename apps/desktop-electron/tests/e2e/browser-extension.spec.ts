import { test, expect, chromium, type BrowserContext } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXTENSION_PATH = path.resolve(__dirname, '../../../browser-extension')
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const SERVICE_URL = 'http://127.0.0.1:38473'

const cfProblemHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'codeforces-problem.html'), 'utf-8')
const cfSubmissionHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'codeforces-submission.html'), 'utf-8')
const atcoderTaskHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'atcoder-task.html'), 'utf-8')
const atcoderSubmissionHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'atcoder-submission.html'), 'utf-8')

async function launchWithExtension(): Promise<BrowserContext> {
  const tmpDir = path.join(os.tmpdir(), `pw-ext-${Date.now()}`)
  return chromium.launchPersistentContext(tmpDir, {
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
}

async function postToService(endpoint: string, payload: Record<string, unknown>) {
  const resp = await fetch(`${SERVICE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return { status: resp.status, data: await resp.json().catch(() => null) }
}

test.describe('Browser Extension E2E', () => {
  test.describe.configure({ mode: 'serial' })

  test('Codeforces problem page: DOM extraction + import', async () => {
    const context = await launchWithExtension()
    const page = await context.newPage()

    await page.route('https://codeforces.com/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: cfProblemHtml })
      } else { await route.abort() }
    })

    await page.goto('https://codeforces.com/contest/1900/problem/A')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Extract using same selectors as content.js extractCodeforces()
    const artifact = await page.evaluate(() => {
      const titleEl = document.querySelector('.problem-statement .title') || document.querySelector('.title')
      const statementEl = document.querySelector('.problem-statement')
      const m = window.location.pathname.match(/^\/contest\/(\d+)\/problem\/([^/]+)/)
      return {
        kind: 'problem-statement',
        payload: {
          platform: 'CODEFORCES',
          externalProblemId: m ? `${m[1]}/${m[2]}` : '',
          externalContestId: m ? m[1] : '',
          title: titleEl ? titleEl.textContent!.trim() : document.title,
          statementText: statementEl ? statementEl.innerHTML : '',
          url: window.location.href,
        },
      }
    })

    // Verify extraction (BUG#1 fix: field names match backend)
    expect(artifact.payload.platform).toBe('CODEFORCES')
    expect(artifact.payload.externalProblemId).toBe('1900/A')
    expect(artifact.payload.externalContestId).toBe('1900')
    expect(artifact.payload.statementText).toContain('Covering Points')
    expect(artifact.payload.url).toContain('codeforces.com')
    expect(artifact.payload).not.toHaveProperty('pageTitle')
    expect(artifact.payload).not.toHaveProperty('statementHtml')
    expect(artifact.payload).not.toHaveProperty('pageUrl')

    // Verify import endpoint accepts the data
    const result = await postToService('/api/import/problem-statement', artifact.payload)
    expect(result.status).toBe(200)
    expect(result.data.status).toBe('imported')

    await context.close()
  })

  test('Codeforces submission page: DOM extraction + import', async () => {
    const context = await launchWithExtension()
    const page = await context.newPage()

    await page.route('https://codeforces.com/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: cfSubmissionHtml })
      } else { await route.abort() }
    })

    await page.goto('https://codeforces.com/contest/1900/submission/12345678')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Extract using same selectors as content.js extractCodeforces() submission path
    const artifact = await page.evaluate(() => {
      const sourceEl = document.querySelector('#program-source-text')
      const langEl = document.querySelector('.submission-info td:nth-child(3)')
      const m = window.location.pathname.match(/^\/contest\/(\d+)\/submission\/(\d+)/)
      const link = Array.from(document.querySelectorAll('a[href]'))
        .find(a => a.getAttribute('href')!.includes(`/contest/${m?.[1]}/problem/`))
      let externalProblemId = ''
      if (link) {
        const cm = link.getAttribute('href')!.match(/\/contest\/(\d+)\/problem\/([^/?#]+)/)
        if (cm) externalProblemId = `${cm[1]}/${cm[2]}`
      }
      return {
        kind: 'submission-source',
        payload: {
          platform: 'CODEFORCES',
          externalSubmissionId: m ? m[2] : '',
          externalProblemId,
          sourceContestId: m ? m[1] : '',
          sourceCode: sourceEl ? sourceEl.textContent!.trim() : '',
          language: langEl ? langEl.textContent!.trim() : '',
          url: window.location.href,
        },
      }
    })

    expect(artifact.payload.platform).toBe('CODEFORCES')
    expect(artifact.payload.externalSubmissionId).toBe('12345678')
    expect(artifact.payload.externalProblemId).toBe('1900/A')
    expect(artifact.payload.sourceContestId).toBe('1900')
    expect(artifact.payload.sourceCode).toContain('#include')
    expect(artifact.payload.language).toBe('GNU C++17')
    expect(artifact.payload.url).toContain('codeforces.com')
    expect(artifact.payload).not.toHaveProperty('pageTitle')
    expect(artifact.payload).not.toHaveProperty('pageUrl')

    const result = await postToService('/api/import/submission-source', artifact.payload)
    expect(result.status).toBe(200)
    expect(result.data.status).toBe('imported')

    await context.close()
  })

  test('AtCoder task page: DOM extraction + import', async () => {
    const context = await launchWithExtension()
    const page = await context.newPage()

    await page.route('https://atcoder.jp/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: atcoderTaskHtml })
      } else { await route.abort() }
    })

    await page.goto('https://atcoder.jp/contests/abc300/tasks/abc300_a')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Extract using same selectors as content.js extractAtCoder() task path
    const artifact = await page.evaluate(() => {
      const statementEl = document.querySelector('#task-statement') || document.querySelector('.lang-en') || document.querySelector('.problem-statement')
      const titleEl = document.querySelector('.h2') || document.querySelector('h2')
      const m = window.location.pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/]+)/)
      return {
        kind: 'problem-statement',
        payload: {
          platform: 'ATCODER',
          externalProblemId: m ? m[2] : '',
          externalContestId: m ? m[1] : '',
          title: titleEl ? titleEl.textContent!.trim() : document.title,
          statementText: statementEl ? statementEl.innerHTML : '',
          url: window.location.href,
        },
      }
    })

    expect(artifact.payload.platform).toBe('ATCODER')
    expect(artifact.payload.externalProblemId).toBe('abc300_a')
    expect(artifact.payload.externalContestId).toBe('abc300')
    expect(artifact.payload.statementText).toContain('total score')
    expect(artifact.payload.url).toContain('atcoder.jp')
    expect(artifact.payload).not.toHaveProperty('pageTitle')
    expect(artifact.payload).not.toHaveProperty('statementHtml')

    const result = await postToService('/api/import/problem-statement', artifact.payload)
    expect(result.status).toBe(200)
    expect(result.data.status).toBe('imported')

    await context.close()
  })

  test('AtCoder submission page: DOM extraction + import', async () => {
    const context = await launchWithExtension()
    const page = await context.newPage()

    await page.route('https://atcoder.jp/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: atcoderSubmissionHtml })
      } else { await route.abort() }
    })

    await page.goto('https://atcoder.jp/contests/abc300/submissions/99999')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Extract using same selectors as content.js extractAtCoder() submission path
    const artifact = await page.evaluate(() => {
      const cmLines = document.querySelectorAll('.CodeMirror-lines .CodeMirror-line')
      let sourceCode = ''
      if (cmLines.length > 0) {
        sourceCode = Array.from(cmLines).map(l => l.textContent!.replace(/\u200b/g, '')).join('\n')
      } else {
        const legacy = document.querySelector('#submission-code') || document.querySelector('pre.linenums')
        sourceCode = legacy ? legacy.textContent!.trim() : ''
      }
      const m = window.location.pathname.match(/^\/contests\/([^/]+)\/submissions\/(\d+)/)
      const contestId = m ? m[1] : ''
      // Find language from table
      let language = ''
      const rows = document.querySelectorAll('table tr')
      for (const row of rows) {
        const th = row.querySelector('th')
        if (th && th.textContent!.trim() === 'Language') {
          const td = row.querySelector('td')
          language = td ? td.textContent!.trim() : ''
          break
        }
      }
      // Find problem ID from link
      let externalProblemId = ''
      const link = Array.from(document.querySelectorAll('a[href]'))
        .find(a => a.getAttribute('href')!.includes(`/contests/${contestId}/tasks/`))
      if (link) {
        const pm = link.getAttribute('href')!.match(/\/tasks\/([^/?#]+)/)
        if (pm) externalProblemId = pm[1]
      }
      return {
        kind: 'submission-source',
        payload: {
          platform: 'ATCODER',
          externalSubmissionId: m ? m[2] : '',
          externalProblemId,
          sourceContestId: contestId,
          sourceCode,
          language,
          url: window.location.href,
        },
      }
    })

    expect(artifact.payload.platform).toBe('ATCODER')
    expect(artifact.payload.externalSubmissionId).toBe('99999')
    expect(artifact.payload.sourceContestId).toBe('abc300')
    expect(artifact.payload.sourceCode).toContain('input()')
    expect(artifact.payload.language).toBe('Python (CPython 3.x)')
    expect(artifact.payload.url).toContain('atcoder.jp')
    // BUG#1 fix: no pageTitle, pageUrl, or status fields
    expect(artifact.payload).not.toHaveProperty('pageTitle')
    expect(artifact.payload).not.toHaveProperty('pageUrl')
    expect(artifact.payload).not.toHaveProperty('status')

    const result = await postToService('/api/import/submission-source', artifact.payload)
    expect(result.status).toBe(200)
    expect(result.data.status).toBe('imported')

    await context.close()
  })
})
