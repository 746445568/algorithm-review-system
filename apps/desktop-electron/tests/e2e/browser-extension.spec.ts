import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import http, { type Server } from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const EXTENSION_PATH = path.resolve(__dirname, '../../../browser-extension')
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const cfSubmissionHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'codeforces-submission.html'), 'utf-8')
const atcoderSubmissionHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'atcoder-submission.html'), 'utf-8')

type ImportedArtifact = {
  endpoint: string
  authorization: string
  body: Record<string, unknown>
}

test.describe('Browser Extension E2E', () => {
  test.describe.configure({ mode: 'serial' })

  let service: Server
  let imported: ImportedArtifact[]

  test.beforeEach(async () => {
    imported = []
    service = await startPairingService(imported)
  })

  test.afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      service.close((error) => error ? reject(error) : resolve())
    })
  })

  test('pairs securely and auto-imports a visible Codeforces submission', async () => {
    const harness = await launchPairedExtension()
    await harness.page.route('https://codeforces.com/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: cfSubmissionHtml })
      } else {
        await route.abort()
      }
    })

    await harness.page.goto('https://codeforces.com/contest/1900/submission/12345678')
    await expect.poll(() => imported.length).toBe(1)

    expect(imported[0].endpoint).toBe('/api/import/submission-source')
    expect(imported[0].authorization).toBe('Bearer extension-import-token')
    expect(imported[0].body.externalSubmissionId).toBe('12345678')
    expect(imported[0].body.sourceCode).toContain('#include')
    await harness.close()
  })

  test('auto-imports Codeforces source inserted into a status-page dialog', async () => {
    const harness = await launchPairedExtension()
    await harness.page.route('https://codeforces.com/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><table><tr>
            <td><a id="submission" href="/contest/1900/submission/87654321" onclick="return false">87654321</a></td>
            <td><a href="/contest/1900/problem/B">B</a></td>
          </tr></table>`,
        })
      } else {
        await route.abort()
      }
    })

    await harness.page.goto('https://codeforces.com/contest/1900/status')
    await harness.page.click('#submission')
    await harness.page.evaluate(() => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      dialog.innerHTML = `
        <a href="/contest/1900/problem/B">B</a>
        <table><tr><th>Language</th><td>GNU C++23</td></tr></table>
        <pre id="program-source-text">int main() { return 0; }</pre>`
      document.body.append(dialog)
    })
    await expect.poll(() => imported.length).toBe(1)

    expect(imported[0].body.externalSubmissionId).toBe('87654321')
    expect(imported[0].body.externalProblemId).toBe('1900/B')
    expect(imported[0].body.language).toBe('GNU C++23')
    await harness.close()
  })

  test('auto-imports a visible AtCoder submission', async () => {
    const harness = await launchPairedExtension()
    await harness.page.route('https://atcoder.jp/**', async route => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ contentType: 'text/html', body: atcoderSubmissionHtml })
      } else {
        await route.abort()
      }
    })

    await harness.page.goto('https://atcoder.jp/contests/abc300/submissions/99999')
    await expect.poll(() => imported.length).toBe(1)

    expect(imported[0].body.externalSubmissionId).toBe('99999')
    expect(imported[0].body.externalProblemId).toBe('abc300_a')
    expect(imported[0].body.sourceCode).toContain('input()')
    await harness.close()
  })
})

async function launchPairedExtension(): Promise<{
  context: BrowserContext
  page: Page
  close: () => Promise<void>
}> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ojreview-extension-'))
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent('serviceworker')
  const extensionId = new URL(worker.url()).host
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.locator('#pairingCode').fill('123456')
  await popup.locator('#pairButton').click()
  await expect(popup.locator('#status')).toContainText('Paired successfully')
  await popup.close()

  const page = await context.newPage()
  return {
    context,
    page,
    async close() {
      await context.close()
      fs.rmSync(userDataDir, { recursive: true, force: true })
    },
  }
}

function startPairingService(imported: ImportedArtifact[]): Promise<Server> {
  const service = http.createServer(async (request, response) => {
    const origin = request.headers.origin || ''
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }

    const body = await readJSONBody(request)
    if (request.url === '/api/extension/pairing/claim') {
      if (body.code !== '123456' || !origin.startsWith('chrome-extension://')) {
        writeJSON(response, 401, { error: 'pairing code is invalid or expired' })
        return
      }
      writeJSON(response, 200, { token: 'extension-import-token' })
      return
    }

    if (request.url === '/api/import/submission-source') {
      imported.push({
        endpoint: request.url,
        authorization: request.headers.authorization || '',
        body,
      })
      writeJSON(response, 200, { status: 'imported' })
      return
    }

    writeJSON(response, 404, { error: 'not found' })
  })
  return new Promise((resolve, reject) => {
    service.once('error', reject)
    service.listen(38473, '127.0.0.1', () => resolve(service))
  })
}

async function readJSONBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function writeJSON(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}
