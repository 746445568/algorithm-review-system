import { test, expect } from '../fixtures/test.js'

test.describe('OJ Review Desktop E2E', () => {
  test('app should launch without white screen', async ({ dashboardPage }) => {
    // Verify the app loads without white screen
    const isLoaded = await dashboardPage.isLoaded()
    expect(isLoaded).toBe(true)

    // Take a screenshot to verify the UI is rendered
    await dashboardPage.page.screenshot({ path: 'artifacts/dashboard-loaded.png' })

    // Verify key UI elements are present
    await expect(dashboardPage.heroSection).toBeVisible()
    await expect(dashboardPage.serviceStatusPill).toBeVisible()
  })

  test('dashboard should show service status', async ({ dashboardPage }) => {
    await expect(dashboardPage.serviceStatusPill).toBeVisible()

    // Service status should be either healthy or starting
    const statusText = await dashboardPage.serviceStatusPill.textContent()
    expect(statusText).toMatch(/在线 | 离线 | 服务状态/)
  })

  test('navigation should work between pages', async ({ dashboardPage, navigationPage }) => {
    // Start on dashboard
    await expect(dashboardPage.heroSection).toBeVisible()

    // Navigate to Analysis page
    await navigationPage.clickAnalysis()
    const analysisTitle = await navigationPage.getCurrentPageTitle()
    expect(analysisTitle).toContain('AI 分析')

    // Take screenshot of Analysis page
    await navigationPage.page.screenshot({ path: 'artifacts/analysis-page.png' })

    // Navigate back to Dashboard
    await navigationPage.clickDashboard()
    await expect(dashboardPage.heroSection).toBeVisible()

    // Navigate to Settings page
    await navigationPage.clickSettings()
    const settingsTitle = await navigationPage.getCurrentPageTitle()
    expect(settingsTitle).toContain('设置')

    // Take screenshot of Settings page
    await navigationPage.page.screenshot({ path: 'artifacts/settings-page.png' })

    // Navigate back to Dashboard
    await navigationPage.clickDashboard()
    await expect(dashboardPage.heroSection).toBeVisible()
  })

  test('should display sync button and respond to clicks', async ({ dashboardPage }) => {
    await expect(dashboardPage.syncButton).toBeVisible()

    const syncButton = dashboardPage.syncButton
    const isDisabled = await syncButton.isDisabled()

    // If not disabled, we can try to click it
    if (!isDisabled) {
      await syncButton.click()
      // Should trigger a sync request
      await dashboardPage.page.waitForLoadState('networkidle')
    }
  })
})
