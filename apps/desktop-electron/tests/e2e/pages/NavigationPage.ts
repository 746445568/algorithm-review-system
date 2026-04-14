import { Page, Locator } from '@playwright/test'

export class NavigationPage {
  readonly page: Page
  readonly navItems: Locator
  readonly dashboardNav: Locator
  readonly reviewNav: Locator
  readonly analysisNav: Locator
  readonly settingsNav: Locator
  readonly pageTitle: Locator

  constructor(page: Page) {
    this.page = page
    this.navItems = page.locator('.nav-item')
    this.dashboardNav = page.locator('[data-testid="nav-dashboard"]')
    this.reviewNav = page.locator('[data-testid="nav-review"]')
    this.analysisNav = page.locator('[data-testid="nav-analysis"]')
    this.settingsNav = page.locator('[data-testid="nav-settings"]')
    this.pageTitle = page.locator('.workspace-header h2')
  }

  async clickDashboard() {
    await this.dashboardNav.click()
    await this.page.waitForLoadState('networkidle')
  }

  async clickReview() {
    await this.reviewNav.click()
    await this.page.waitForLoadState('networkidle')
  }

  async clickAnalysis() {
    await this.analysisNav.click()
    await this.page.waitForLoadState('networkidle')
  }

  async clickSettings() {
    await this.settingsNav.click()
    await this.page.waitForLoadState('networkidle')
  }

  async getCurrentPageTitle(): Promise<string> {
    return await this.pageTitle.textContent() || ''
  }
}
