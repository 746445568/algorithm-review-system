import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type Fixtures = {
  electronApp: ElectronApplication
  appPage: Page
}

export const test = base.extend<Fixtures>({
  // Playwright requires an object destructuring pattern for fixture dependencies.
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const occupied = await fetch('http://127.0.0.1:38473/health').then(() => true).catch(() => false)
    if (occupied) throw new Error('port 38473 is already occupied; E2E requires an isolated service')
    const appRoot = process.cwd()
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'ojreview-e2e-'))
    const binary = path.join(appRoot, 'bin', process.platform === 'win32' ? 'ojreviewd.exe' : 'ojreviewd')
    const app = await electron.launch({
      args: [appRoot],
      env: {
        ...process.env,
        OJREVIEW_APP_DIR: runtimeDir,
        OJREVIEW_SERVICE_PATH: binary,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    })
    await use(app)
    await app.close()
    await rm(runtimeDir, { recursive: true, force: true })
  },
  appPage: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(async () => {
      try {
        return (await fetch('http://127.0.0.1:38473/health')).ok
      } catch {
        return false
      }
    })
    if (await page.getByRole('button', { name: /开始配置|Get started/i }).count()) {
      await page.evaluate(async () => {
        const response = await fetch('http://127.0.0.1:38473/api/settings/ai', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'openai', model: 'e2e-model', apiKey: 'e2e-key' }),
        })
        if (!response.ok) throw new Error(`failed to seed E2E settings: ${response.status}`)
      })
      await page.reload()
    }
    await use(page)
  },
})

export { expect } from '@playwright/test'
