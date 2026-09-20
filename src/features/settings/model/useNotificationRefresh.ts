import type { QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from '../../../shared/api/react'
import type { ApiLetterMetadata } from '../../../shared/api/types'
import { inboxOpenState } from '../../inbox/model/inbox'
import { INBOX_NOTIFICATION_REFRESHED, subscribeToNotificationClicks } from './push'

const arrivalQueryKeys = new Set<string>([
  api.letters.listDeliveredLetters.key,
  api.letters.listTravelingLetters.key,
  api.letters.getLetterMetadata.key,
  api.letters.getReadableContent.key,
  api.attachments.listReadableAttachments.key,
  api.threads.getThread.key,
])
const deliveredLettersQueryKey = [api.letters.listDeliveredLetters.key, null] as const

function isDeliveredLettersQuery(query: { queryKey: readonly unknown[] }): boolean {
  return (
    query.queryKey.length === deliveredLettersQueryKey.length &&
    query.queryKey[0] === deliveredLettersQueryKey[0] &&
    query.queryKey[1] === deliveredLettersQueryKey[1]
  )
}

/** 通知クリックと画面復帰で、到着によって変化するデータを更新する。 */
export function useNotificationRefresh(queryClient: QueryClient): void {
  useEffect(() => {
    let active = true
    let notificationSequence = 0
    let pendingNotificationSequence: number | undefined

    function refresh(): Promise<void> {
      const deliveredLettersQuery = queryClient.getQueryCache().find({
        exact: true,
        queryKey: deliveredLettersQueryKey,
      })
      // Query.fetchはキャッシュが未取得だと既存fetchを再利用するため、通知更新では先に明示的に中断する。
      deliveredLettersQuery?.cancel({ silent: true })
      const deliveredLettersRefresh = deliveredLettersQuery?.fetch(undefined, {
        cancelRefetch: false,
      })
      const otherArrivalRefresh = queryClient.invalidateQueries({
        predicate: (query) =>
          arrivalQueryKeys.has(String(query.queryKey[0])) &&
          (!deliveredLettersQuery || !isDeliveredLettersQuery(query)),
      })
      return Promise.all([otherArrivalRefresh, deliveredLettersRefresh]).then(() => undefined)
    }

    function handleNotification(): void {
      const sequence = ++notificationSequence
      pendingNotificationSequence = sequence
      void refresh()
        .then(() => {
          if (!active || pendingNotificationSequence !== sequence) return
          pendingNotificationSequence = undefined
          const letters = queryClient.getQueryData<ApiLetterMetadata[]>(deliveredLettersQueryKey)
          const latest = letters?.reduce<ApiLetterMetadata | undefined>(
            (newest, letter) =>
              !newest || (letter.deliveredAt ?? 0) > (newest.deliveredAt ?? 0) ? letter : newest,
            undefined,
          )
          if (latest) {
            window.dispatchEvent(
              new CustomEvent(INBOX_NOTIFICATION_REFRESHED, {
                detail: inboxOpenState(latest.sealed, latest.openedAt),
              }),
            )
          }
        })
        .catch(() => {
          if (pendingNotificationSequence === sequence) pendingNotificationSequence = undefined
        })
    }

    function handleFocus(): void {
      if (!pendingNotificationSequence && document.visibilityState === 'visible')
        void refresh().catch(() => undefined)
    }

    function handlePageShow(event: PageTransitionEvent): void {
      if (!pendingNotificationSequence && event.persisted) void refresh().catch(() => undefined)
    }

    const unsubscribe = subscribeToNotificationClicks(handleNotification)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [queryClient])
}
