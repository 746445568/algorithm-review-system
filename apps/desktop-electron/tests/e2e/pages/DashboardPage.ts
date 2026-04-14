import { Page, Locator } from '@playwright/test'

export class DashboardPage {
  readonly page: Page
  readonly serviceStatusPill: Locator
  readonly syncButton: Locator
  readonly accountForm: Locator
  readonly platformSelect: Locator
  readonly handleInput: Locator
  readonly submitButton: Locator
  readonly accountList: Locator
  readonly noticeMessage: Locator
  readonly heroSection: Locator
  readonly goalProgress: Locator
  readonly weakTagsList: Locator

  constructor(page: Page) {
    this.page = page
    this.serviceStatusPill = page.locator('[data-testid="service-status"]')
    this.syncButton = page.locator('[data-testid="sync-button"]')
    this.accountForm = page.locator('[data-testid="account-form"]')
    this.platformSelect = page.locator('[data-testid="platform-select"]')
    this.handleInput = page.locator('[data-testid="handle-input"]')
    this.submitButton = page.locator('[data-testid="account-submit"]')
    this.accountList = page.locator('[data-testid="account-list"]')
    this.noticeMessage = page.locator('[data-testid="notice-message"]')
    this.heroSection = page.locator('[data-testid="hero-section"]')
    this.goalProgress = page.locator('[data-testid="goal-progress"]')
    this.weakTagsList = page.locator('[data-testid="weak-tags"]')
  }

  async goto() {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }

  async isLoaded(): Promise<boolean> {
    try {
      await this.heroSection.waitFor({ state: 'visible', timeout: 10000 })
      return true
    } catch {
      return false
    }
  }

  async addAccount(platform: string, handle: string) {
    await this.platformSelect.selectOption(platform)
    await this.handleInput.fill(handle)
    await this.submitButton.click()
    await this.page.waitForResponse(resp => resp.url().includes('/api/accounts'))
    await this.page.waitForLoadState('networkidle')
  }

  async getAccountCount(): Promise<number> {
    const accounts = await this.accountList.locator('[data-testid="account-item"]').count()
    return accounts
  }

  async triggerSync() {
    await this.syncButton.click()
    await this.page.waitForResponse(resp => resp.url().includes('/api/sync'))
    await this.page.waitForLoadState('networkidle')
  }
}
