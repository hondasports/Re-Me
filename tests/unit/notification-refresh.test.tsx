import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { INBOX_NOTIFICATION_REFRESHED } from '../../src/features/settings/model/push'
import { useNotificationRefresh } from '../../src/features/settings/model/useNotificationRefresh'
import { api } from '../../src/shared/api/react'
import type { ApiLetterMetadata } from '../../src/shared/api/types'

let serviceWorker: EventTarget
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

beforeEach(() => {
  serviceWorker = new EventTarget()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    get: () => serviceWorker,
  })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})

afterEach(() => {
  onlineManager.setOnline(true)
  vi.restoreAllMocks()
  if (originalServiceWorker)
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
  else Reflect.deleteProperty(navigator, 'serviceWorker')
})

type Arrival = Pick<ApiLetterMetadata, 'letterId' | 'deliveredAt' | 'sealed' | 'openedAt'>

function renderInbox(
  queryFnImpl: (delivered: Arrival[]) => Promise<Arrival[]> = async (delivered) => delivered,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  let delivered: Arrival[] = []
  const queryFn = vi.fn(() => queryFnImpl(delivered))
  const draftKey = [api.letters.getDraft.key, { letterId: 'draft' }]
  client.setQueryData(draftKey, { body: '書きかけの本文' })
  const hook = renderHook(
    () => {
      useNotificationRefresh(client)
      return useQuery({
        queryKey: [api.letters.listDeliveredLetters.key, null],
        queryFn,
      }).data?.map((letter) => letter.letterId)
    },
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  )
  return {
    ...hook,
    client,
    draftKey,
    queryFn,
    deliver: () => {
      delivered = [{ letterId: 'new-letter', deliveredAt: 2, sealed: true, openedAt: null }]
    },
  }
}

function notificationMessage(
  data: unknown = { type: 're-me:notification-click' },
  origin = window.location.origin,
) {
  serviceWorker.dispatchEvent(new MessageEvent('message', { data, origin }))
}

describe('notification arrival refresh', () => {
  it.each(['notification', 'focus', 'pageshow'] as const)(
    'updates an already mounted inbox on %s without changing a draft',
    async (event) => {
      const inbox = renderInbox()
      await waitFor(() => expect(inbox.result.current).toEqual([]))
      inbox.deliver()
      act(() => {
        if (event === 'notification') notificationMessage()
        else if (event === 'focus') window.dispatchEvent(new Event('focus'))
        else window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      })
      await waitFor(() => expect(inbox.result.current).toEqual(['new-letter']))
      expect(inbox.client.getQueryData(inbox.draftKey)).toEqual({ body: '書きかけの本文' })
      expect(inbox.client.getQueryState(inbox.draftKey)?.isInvalidated).toBe(false)
    },
  )

  it.each([
    [true, 'unopened'],
    [false, 'opened'],
  ] as const)(
    'waits for a paused notification refresh to succeed after reconnecting (sealed=%s)',
    async (sealed, tab) => {
      const inbox = renderInbox()
      await waitFor(() => expect(inbox.result.current).toEqual([]))
      inbox.client.setQueryData(
        [api.letters.listDeliveredLetters.key, null],
        [{ letterId: 'old-letter', deliveredAt: 1, sealed: !sealed, openedAt: null }],
      )
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      inbox.queryFn.mockResolvedValueOnce([
        { letterId: 'new-letter', deliveredAt: 2, sealed, openedAt: null },
      ])
      onlineManager.setOnline(false)
      await act(async () => notificationMessage())
      expect(
        inbox.client.getQueryState([api.letters.listDeliveredLetters.key, null])?.fetchStatus,
      ).toBe('paused')
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED }),
      )
      act(() => onlineManager.setOnline(true))
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith(
          expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED, detail: tab }),
        ),
      )
      await waitFor(() => expect(inbox.result.current).toEqual(['new-letter']))
    },
  )

  it('ignores an older notification result when a newer notification is still refreshing', async () => {
    const inbox = renderInbox()
    await waitFor(() => expect(inbox.result.current).toEqual([]))
    let resolveFirst!: (letters: Arrival[]) => void
    let resolveSecond!: (letters: Arrival[]) => void
    inbox.queryFn
      .mockImplementationOnce(
        () =>
          new Promise<Arrival[]>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Arrival[]>((resolve) => {
            resolveSecond = resolve
          }),
      )
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    act(() => {
      notificationMessage()
      notificationMessage()
    })
    expect(inbox.queryFn).toHaveBeenCalledTimes(3)
    act(() =>
      resolveFirst([{ letterId: 'stale-letter', deliveredAt: 2, sealed: false, openedAt: 2 }]),
    )
    act(() =>
      resolveSecond([{ letterId: 'new-letter', deliveredAt: 3, sealed: true, openedAt: null }]),
    )
    await waitFor(() => expect(inbox.result.current).toEqual(['new-letter']))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED, detail: 'unopened' }),
    )
  })

  it('starts a fresh notification fetch while the initial inbox fetch is still pending', async () => {
    let resolveInitial!: (letters: Arrival[]) => void
    let resolveFirst!: (letters: Arrival[]) => void
    let resolveSecond!: (letters: Arrival[]) => void
    let call = 0
    const inbox = renderInbox(() => {
      call += 1
      if (call === 1)
        return new Promise<Arrival[]>((resolve) => {
          resolveInitial = resolve
        })
      if (call === 2)
        return new Promise<Arrival[]>((resolve) => {
          resolveFirst = resolve
        })
      return new Promise<Arrival[]>((resolve) => {
        resolveSecond = resolve
      })
    })
    await waitFor(() => expect(inbox.queryFn).toHaveBeenCalledTimes(1))
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    act(() => {
      notificationMessage()
      notificationMessage()
    })
    await waitFor(() => expect(inbox.queryFn).toHaveBeenCalledTimes(3))
    act(() => {
      resolveInitial([{ letterId: 'initial-letter', deliveredAt: 1, sealed: false, openedAt: 1 }])
      resolveFirst([{ letterId: 'stale-letter', deliveredAt: 2, sealed: false, openedAt: 2 }])
      resolveSecond([{ letterId: 'new-letter', deliveredAt: 3, sealed: true, openedAt: null }])
    })
    await waitFor(() => expect(inbox.result.current).toEqual(['new-letter']))
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED, detail: 'unopened' }),
    )
  })

  it('does not let another delivered-list query release the notification refresh', async () => {
    const inbox = renderInbox()
    await waitFor(() => expect(inbox.result.current).toEqual([]))
    const otherQuery = renderHook(
      () =>
        useQuery({
          queryKey: [api.letters.listDeliveredLetters.key, { cursor: 'other' }],
          queryFn: async () => {
            throw new Error('other cursor failed')
          },
        }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={inbox.client}>{children}</QueryClientProvider>
        ),
      },
    )
    inbox.deliver()
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    act(() => notificationMessage())
    await waitFor(() => expect(inbox.result.current).toEqual(['new-letter']))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED, detail: 'unopened' }),
    )
    otherQuery.unmount()
  })

  it.each([
    [true, 'unopened'],
    [false, 'opened'],
  ] as const)(
    'selects the latest arrival tab after notification refresh, even when resume events overlap (sealed=%s)',
    async (sealed, tab) => {
      const inbox = renderInbox()
      await waitFor(() => expect(inbox.result.current).toEqual([]))
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      let complete!: (letters: Arrival[]) => void
      inbox.queryFn.mockImplementationOnce(
        () =>
          new Promise<Arrival[]>((resolve) => {
            complete = resolve
          }),
      )
      act(() => {
        notificationMessage()
        window.dispatchEvent(new Event('focus'))
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      })
      expect(inbox.queryFn).toHaveBeenCalledTimes(2)
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED }),
      )
      act(() =>
        complete([
          { letterId: 'old-letter', deliveredAt: 1, sealed: !sealed, openedAt: null },
          { letterId: 'new-letter', deliveredAt: 2, sealed, openedAt: null },
        ]),
      )
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith(
          expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED, detail: tab }),
        ),
      )
      expect(inbox.queryFn).toHaveBeenCalledTimes(2)
    },
  )

  it('ignores unrelated messages, other origins, hidden focus and normal initial pageshow', async () => {
    const inbox = renderInbox()
    await waitFor(() => expect(inbox.result.current).toEqual([]))
    inbox.deliver()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      notificationMessage(null)
      notificationMessage({ type: 'other' })
      notificationMessage({ type: 're-me:notification-click' }, 'https://another.example')
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    })
    expect(inbox.queryFn).toHaveBeenCalledOnce()
    expect(inbox.result.current).toEqual([])
  })

  it.each([false, true])(
    'does not fetch disabled sealed content and retries a failed refresh on the next notification (initially offline=%s)',
    async (offline) => {
      const inbox = renderInbox()
      const content = vi.fn(async () => 'private content')
      const sealed = renderHook(
        () =>
          useQuery({
            queryKey: [api.letters.getReadableContent.key, { letterId: 'sealed' }],
            queryFn: content,
            enabled: false,
          }),
        {
          wrapper: ({ children }) => (
            <QueryClientProvider client={inbox.client}>{children}</QueryClientProvider>
          ),
        },
      )
      await waitFor(() => expect(inbox.result.current).toEqual([]))
      inbox.deliver()
      const dispatch = vi.spyOn(window, 'dispatchEvent')
      inbox.queryFn.mockRejectedValueOnce(new Error('offline'))
      if (offline) onlineManager.setOnline(false)
      await act(async () => notificationMessage())
      if (offline) act(() => onlineManager.setOnline(true))
      await waitFor(() => expect(inbox.queryFn).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(inbox.client.isFetching()).toBe(0))
      expect(inbox.result.current).toEqual([])
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED }),
      )
      act(() => notificationMessage())
      await waitFor(() => expect(inbox.result.current).toEqual(['new-letter']))
      expect(content).not.toHaveBeenCalled()
      sealed.unmount()
    },
  )

  it('removes its listeners when the provider unmounts', async () => {
    const inbox = renderInbox()
    await waitFor(() => expect(inbox.result.current).toEqual([]))
    let complete!: (letters: Arrival[]) => void
    inbox.queryFn.mockImplementationOnce(
      () =>
        new Promise<Arrival[]>((resolve) => {
          complete = resolve
        }),
    )
    act(() => notificationMessage())
    inbox.unmount()
    const invalidate = vi.spyOn(inbox.client, 'invalidateQueries')
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    notificationMessage()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(invalidate).not.toHaveBeenCalled()
    await act(async () => {
      complete([{ letterId: 'new-letter', deliveredAt: 2, sealed: true, openedAt: null }])
    })
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: INBOX_NOTIFICATION_REFRESHED }),
    )
  })
})
