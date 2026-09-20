import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync('public/sw.js', 'utf8')

function serviceWorker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const opened = { postMessage: vi.fn(), focus: vi.fn(async () => undefined) }
  const clients = { openWindow: vi.fn(async (): Promise<typeof opened | null> => opened) }
  runInNewContext(source, {
    self: {
      clients,
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        handlers.set(type, handler)
      },
    },
  })

  async function click() {
    const close = vi.fn()
    let work: Promise<unknown> | undefined
    handlers.get('notificationclick')?.({
      notification: { close, data: { url: 'https://untrusted.example/' } },
      waitUntil: (promise: Promise<unknown>) => {
        work = promise
      },
    })
    expect(close).toHaveBeenCalledOnce()
    await work
  }

  return { clients, opened, click }
}

describe('service worker notification click', () => {
  it('opens the fixed inbox URL and refreshes the client returned by the browser, including a reused page', async () => {
    const worker = serviceWorker()
    await worker.click()
    expect(worker.clients.openWindow).toHaveBeenCalledWith('/')
    expect(worker.opened.postMessage).toHaveBeenCalledWith({ type: 're-me:notification-click' })
    expect(worker.opened.focus).toHaveBeenCalledOnce()
  })

  it('does not assume that openWindow returns a client', async () => {
    const worker = serviceWorker()
    worker.clients.openWindow.mockResolvedValueOnce(null)
    await expect(worker.click()).resolves.toBeUndefined()
    expect(worker.opened.postMessage).not.toHaveBeenCalled()
  })

  it('still sends the refresh signal when focusing the opened window fails', async () => {
    const worker = serviceWorker()
    worker.opened.focus.mockRejectedValueOnce(new Error('window closed'))
    await expect(worker.click()).resolves.toBeUndefined()
    expect(worker.opened.postMessage).toHaveBeenCalledWith({ type: 're-me:notification-click' })
    expect(worker.clients.openWindow).toHaveBeenCalledOnce()
  })

  it('keeps an openWindow failure attached to the notification event lifetime', async () => {
    const worker = serviceWorker()
    worker.clients.openWindow.mockRejectedValueOnce(new Error('open failed'))
    await expect(worker.click()).rejects.toThrow('open failed')
  })
})
