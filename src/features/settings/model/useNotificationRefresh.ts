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

/** 通知クリックと画面復帰で、到着によって変化するデータを更新する。 */
export function useNotificationRefresh(queryClient: QueryClient): void {
  useEffect(() => {
    let awaitingArrival = false

    const unsubscribeQueryCache = queryClient.getQueryCache().subscribe((event) => {
      if (
        !awaitingArrival ||
        event.type !== 'updated' ||
        event.query.queryKey[0] !== api.letters.listDeliveredLetters.key
      )
        return
      if (event.action.type === 'error') {
        awaitingArrival = false
        return
      }
      // オフラインで一時停止した取得も、通信再開後の成功を待ってから表示を切り替える。
      if (event.action.type !== 'success' || event.action.manual) return
      awaitingArrival = false
      const letters = queryClient.getQueryData<ApiLetterMetadata[]>([
        api.letters.listDeliveredLetters.key,
        null,
      ])
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

    function refresh(): Promise<void> {
      return queryClient.invalidateQueries({
        predicate: (query) => arrivalQueryKeys.has(String(query.queryKey[0])),
      })
    }

    function handleNotification(): void {
      awaitingArrival = true
      void refresh().catch(() => undefined)
    }

    function handleFocus(): void {
      if (!awaitingArrival && document.visibilityState === 'visible')
        void refresh().catch(() => undefined)
    }

    function handlePageShow(event: PageTransitionEvent): void {
      if (!awaitingArrival && event.persisted) void refresh().catch(() => undefined)
    }

    const unsubscribe = subscribeToNotificationClicks(handleNotification)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      unsubscribe()
      unsubscribeQueryCache()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [queryClient])
}
