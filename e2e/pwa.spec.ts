import { expect, test } from '@playwright/test'

import type { ApiLetterMetadata } from '../src/shared/api/types'
import { hasAuth0E2eCredentials } from './fixtures/auth'

test.describe('pwa and quiet notifications', () => {
  test.skip(
    !hasAuth0E2eCredentials(),
    'Authenticated E2E needs the Auth0 test identity in E2E_AUTH0_EMAIL / E2E_AUTH0_PASSWORD',
  )

  for (const [trigger, openedTab, sealed] of [
    ['notification message', false, true],
    ['notification message', true, true],
    ['notification message', false, false],
    ['notification message', true, false],
    ['offline notification', true, true],
    ['offline notification', false, false],
    ['focus', false, true],
    ['focus', true, true],
    ['pageshow', false, true],
    ['pageshow', true, true],
  ] as const) {
    test(`an already open inbox refreshes on ${trigger} from ${openedTab ? 'the opened tab' : 'an empty inbox'} for a ${sealed ? 'sealed' : 'unsealed'} arrival without a reload or content request`, async ({
      page,
      context,
    }) => {
      let delivered: ApiLetterMetadata[] = openedTab ? [deliveredLetter('old-letter', false)] : []
      let contentRequests = 0
      await page.route('**/api/letters?status=delivered', (route) =>
        route.fulfill({ json: delivered }),
      )
      page.on('request', (request) => {
        if (/\/api\/letters\/[^/]+\/content$/.test(request.url())) contentRequests += 1
      })
      await page.goto('/')
      await expect(page.getByTestId('api-session')).toHaveAttribute('data-state', 'ready', {
        timeout: 20_000,
      })
      if (openedTab) {
        await page.getByRole('tab', { name: '開封済み' }).click()
        await expect(page.locator('a[href="/letters/old-letter"]')).toBeVisible()
      } else {
        await expect(
          page.getByText(
            'まだ、あなた宛ての手紙は届いていません。今の気持ちを書いて、未来の自分へ届けよう。',
          ),
        ).toBeVisible()
      }
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
      const timeOrigin = await page.evaluate(() => performance.timeOrigin)
      delivered = [...delivered, deliveredLetter('notification-arrival', sealed)]
      expect(await page.evaluate(() => document.visibilityState)).toBe('visible')

      if (trigger === 'offline notification') {
        await context.setOffline(true)
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
      }

      if (trigger === 'notification message' || trigger === 'offline notification') {
        const worker = context
          .serviceWorkers()
          .find((entry) => new URL(entry.url()).pathname === '/sw.js')
        expect(worker).toBeDefined()
        // OS通知クリックの処理は単体テストで実行し、ここでは実際のSW→画面の境界を検証する。
        const recipients = await worker!.evaluate(async () => {
          const scope = globalThis as unknown as {
            clients: {
              matchAll(options: {
                type: string
                includeUncontrolled: boolean
              }): Promise<Array<{ url: string; postMessage(message: unknown): void }>>
            }
          }
          const clients = await scope.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          })
          const inboxes = clients.filter((client) => new URL(client.url).pathname === '/')
          for (const inbox of inboxes) inbox.postMessage({ type: 're-me:notification-click' })
          return inboxes.length
        })
        expect(recipients).toBe(1)
        if (trigger === 'offline notification') {
          await expect(page.locator('a[href="/letters/notification-arrival"]')).toHaveCount(0)
          await context.setOffline(false)
        }
      } else {
        await page.evaluate((event) => {
          window.dispatchEvent(
            event === 'focus'
              ? new Event('focus')
              : new PageTransitionEvent('pageshow', { persisted: true }),
          )
        }, trigger)
      }

      if (openedTab && (trigger === 'focus' || trigger === 'pageshow')) {
        await expect(page.getByRole('tab', { name: '開封済み' })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await page.getByRole('tab', { name: '未開封' }).click()
      }
      await expect(page.locator('a[href="/letters/notification-arrival"]')).toContainText(
        sealed ? '未開封' : '開封済み',
      )
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin)
      expect(contentRequests).toBe(0)
      expect(context.pages()).toHaveLength(1)
    })
  }

  test('installable manifest and settings explain notifications without prompting on inbox', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, '__reMeNotificationPermissionCalls', {
        configurable: true,
        writable: true,
        value: 0,
      })
      const NotificationApi = window.Notification
      if (!NotificationApi?.requestPermission) {
        return
      }
      const original = NotificationApi.requestPermission.bind(NotificationApi)
      NotificationApi.requestPermission = ((...args: Parameters<typeof original>) => {
        const current = window as Window & { __reMeNotificationPermissionCalls?: number }
        current.__reMeNotificationPermissionCalls =
          (current.__reMeNotificationPermissionCalls ?? 0) + 1
        return original(...args)
      }) as typeof NotificationApi.requestPermission
    })

    await page.goto('/')
    await expect(page.getByTestId('api-session')).toHaveAttribute('data-state', 'ready', {
      timeout: 20_000,
    })
    await expect(page.getByRole('heading', { name: '受信箱' })).toBeVisible()

    expect(
      await page.evaluate(
        () =>
          (window as Window & { __reMeNotificationPermissionCalls?: number })
            .__reMeNotificationPermissionCalls ?? 0,
      ),
    ).toBe(0)

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifestHref).toBe('/manifest.webmanifest')
    const manifest = await page.request.get('/manifest.webmanifest')
    expect(manifest.ok()).toBe(true)
    const body = await manifest.json()
    expect(body.theme_color).toBe('#f4f8fc')
    expect(body.display).toBe('standalone')

    const sw = await page.request.get('/sw.js')
    expect(sw.ok()).toBe(true)
    const icon192 = await page.request.get('/icons/icon-192.png')
    const icon512 = await page.request.get('/icons/icon-512.png')
    expect(icon192.ok()).toBe(true)
    expect(icon512.ok()).toBe(true)

    await page.getByRole('link', { name: '設定' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { level: 1, name: '設定' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      page.getByText(
        '届いた手紙を忘れないよう、静かな通知だけ送ります。本文や写真は通知に出しません。',
      ),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: '受信箱' })).toHaveCount(0)
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __reMeNotificationPermissionCalls?: number })
            .__reMeNotificationPermissionCalls ?? 0,
      ),
    ).toBe(0)
  })
})

function deliveredLetter(letterId: string, sealed: boolean): ApiLetterMetadata {
  const now = Date.now()
  return {
    letterId,
    threadId: `${letterId}-thread`,
    parentLetterId: null,
    nextLetterId: null,
    status: 'delivered',
    sealed,
    deliveryMode: 'few_days',
    deliveryWindowStart: now,
    deliveryWindowEnd: now,
    sentAt: now - 7 * 86_400_000,
    deliveredAt: now,
    openedAt: sealed ? null : now,
    repliedAt: null,
    createdAt: now - 7 * 86_400_000,
    updatedAt: now,
  }
}
