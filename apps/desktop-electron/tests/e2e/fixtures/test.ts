import { test as base } from '@playwright/test'
import { DashboardPage } from '../pages/DashboardPage.js'
import { NavigationPage } from '../pages/NavigationPage.js'

type Fixtures = {
  dashboardPage: DashboardPage
  navigationPage: NavigationPage
}

export const test = base.extend<Fixtures>({
  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page)
    await dashboardPage.goto()
    await use(dashboardPage)
  },
  navigationPage: async ({ page }, use) => {
    const navigationPage = new NavigationPage(page)
    await use(navigationPage)
  },
})

export { expect } from '@playwright/test'
