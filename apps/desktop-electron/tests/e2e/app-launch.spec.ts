import { test, expect } from './fixtures/test.js'

test.describe('OJReview desktop security and core flow', () => {
  test('launches the review-first v2 shell without a white screen', async ({ appPage }) => {
    await expect(appPage.locator('.top-nav')).toBeVisible()
    await expect(appPage.locator('.dash-hero')).toBeVisible()
    await expect(appPage.locator('.sidebar')).toHaveCount(0)
    await expect(appPage.getByRole('button', { name: /同步|重试同步/ })).toHaveCount(0)
  })

  test('injects local API authentication without exposing Node to renderer', async ({ appPage }) => {
    const rawResponse = await fetch('http://127.0.0.1:38473/api/me')
    expect(rawResponse.status).toBe(401)
    const response = await appPage.evaluate(async () => {
      const result = await fetch('http://127.0.0.1:38473/api/me')
      return { status: result.status, body: await result.json() }
    })
    expect(response.status).toBe(200)
    expect(response.body.owner).toBeTruthy()
    expect(await appPage.evaluate(() => typeof globalThis.process)).toBe('undefined')
  })

  test('enforces the renderer CSP and supports navigation to settings', async ({ appPage }) => {
    const csp = await appPage.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toContain('fonts.googleapis.com')

    await appPage.getByRole('button', { name: /^(设置|Settings)$/ }).click()
    await expect(appPage.locator('.settings-page-root')).toBeVisible()
  })
})
