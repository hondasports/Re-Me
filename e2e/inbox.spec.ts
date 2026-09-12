import { expect, test, type Page } from '@playwright/test'

import { hasAuth0E2eCredentials } from './fixtures/auth'

test.describe('inbox letters', () => {
  test.skip(
    !hasAuth0E2eCredentials(),
    'Authenticated E2E needs the Auth0 test identity in E2E_AUTH0_EMAIL / E2E_AUTH0_PASSWORD',
  )

  test('opens a sealed delivered letter without showing the body first', async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openAuthenticatedInbox(page)
    const body = `封をした届いた手紙 ${Date.now()}`
    const letterId = await sendTravelingLetter(page, { body, sealed: true })

    await page.goto(`/traveling/${letterId}`)
    await expect(page.getByRole('heading', { name: '封をしている' })).toBeVisible({
      timeout: 20_000,
    })
    await clickForceDeliver(page)

    await expect(page).toHaveURL(new RegExp(`/letters/${letterId}$`), { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: '開封する' })).toBeVisible()
    await expect(page.getByText(body)).toHaveCount(0)

    await page.getByRole('link', { name: 'あとで開封する' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: '受信箱' })).toBeVisible()
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toContainText('未開封')
    await expect(page.getByText(body)).toHaveCount(0)

    await page.getByRole('tab', { name: '開封済み' }).click()
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toHaveCount(0)
    await page.getByRole('tab', { name: '未開封' }).click()
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toContainText('未開封')

    await page.locator(`a[href="/letters/${letterId}"]`).click()
    await expect(page.getByRole('heading', { name: '開封する' })).toBeVisible()
    await page.getByRole('button', { name: '開封する' }).click()
    await expect(page.getByText(body)).toBeVisible()
    await expect(page.getByRole('textbox', { name: '本文' })).toHaveCount(0)

    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflowing).toBe(false)

    await page.getByRole('link', { name: '届いた手紙へ戻る' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toHaveCount(0)
    await page.getByRole('tab', { name: '開封済み' }).click()
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toContainText('開封済み')
  })

  test('lets the owner read an unsealed delivered letter without opening it', async ({ page }) => {
    test.setTimeout(90_000)
    await openAuthenticatedInbox(page)
    const body = `封をしない届いた手紙 ${Date.now()}`
    const letterId = await sendTravelingLetter(page, { body, sealed: false })

    await page.goto(`/traveling/${letterId}`)
    await expect(page.getByRole('heading', { name: '読み返せる' })).toBeVisible({
      timeout: 20_000,
    })
    await clickForceDeliver(page)

    await expect(page).toHaveURL(new RegExp(`/letters/${letterId}$`), { timeout: 20_000 })
    await expect(page.getByRole('heading', { name: '開封する' })).toHaveCount(0)
    await expect(page.getByText(body)).toBeVisible()
    await expect(page.getByRole('textbox', { name: '本文' })).toHaveCount(0)

    await page.getByRole('link', { name: '届いた手紙へ戻る' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(body)).toHaveCount(0)
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toHaveCount(0)
    await page.getByRole('tab', { name: '開封済み' }).click()
    await expect(page.locator(`a[href="/letters/${letterId}"]`)).toContainText('開封済み')
  })
})

async function clickForceDeliver(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'E2E: 今すぐ届ける' })
  await expect(button).toBeVisible()
  await button.scrollIntoViewIfNeeded()
  await button.click()
}

async function sendTravelingLetter(
  page: Page,
  options: { body: string; sealed: boolean },
): Promise<string> {
  await page.getByRole('link', { name: '書く' }).click()
  await expect(page).toHaveURL(/\/write\/[^/]+$/, { timeout: 20_000 })

  const editor = page.getByRole('textbox', { name: '本文' })
  await expect(editor).toBeVisible({ timeout: 20_000 })
  await editor.fill(options.body)
  await page.getByRole('button', { name: '次へ' }).click()

  await expect(page).toHaveURL(/\/write\/[^/]+\/send$/, { timeout: 20_000 })
  await page.getByRole('radio', { name: '数週間後くらい' }).check()
  await page.getByRole('radio', { name: options.sealed ? /封をする/ : /封をしない/ }).check()

  const letterId = page.url().match(/\/write\/([^/]+)\/send/)?.[1]
  expect(letterId).toBeTruthy()

  await page.getByRole('button', { name: '未来へ送る' }).click()
  await expect(page).toHaveURL(/\/traveling$/, { timeout: 20_000 })
  return letterId as string
}

async function openAuthenticatedInbox(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('api-session')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000,
  })
  await expect(page.getByRole('heading', { name: '受信箱' })).toBeVisible()
}
