import { Button } from '@mantine/core'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { NavIcon } from '../../../app/BottomNav'
import { StatusScreen } from '../../../shared/components/StatusScreen'
import { INBOX_NOTIFICATION_REFRESHED } from '../../settings/model/push'
import {
  arrivedTodayLabel,
  filterInboxLettersByTab,
  fromYouLabel,
  inboxListItemLabel,
  inboxListPhase,
  inboxOpenLabel,
  inboxOpenState,
  inboxTabEmptyLabel,
  type InboxLetterMetadata,
  type InboxListTab,
} from '../model/inbox'

const INBOX_TABS: { value: InboxListTab; label: string }[] = [
  { value: 'unopened', label: '未開封' },
  { value: 'opened', label: '開封済み' },
]

/** Renders the inbox metadata list while keeping letter contents private. */
export function InboxLetterList({
  letters,
  now,
  timeZone,
}: {
  letters: InboxLetterMetadata[] | undefined
  now: number
  timeZone: string
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<InboxListTab>('unopened')
  useEffect(() => {
    function showArrival(event: Event): void {
      const nextTab = (event as CustomEvent<unknown>).detail
      if (nextTab === 'unopened' || nextTab === 'opened') setTab(nextTab)
    }
    window.addEventListener(INBOX_NOTIFICATION_REFRESHED, showArrival)
    return () => window.removeEventListener(INBOX_NOTIFICATION_REFRESHED, showArrival)
  }, [])
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const phase = inboxListPhase(letters)

  if (phase === 'loading' || letters === undefined) {
    return (
      <StatusScreen
        description="あなた宛ての手紙を確認しています。"
        title="届いた手紙"
        tone="content"
        variant="loading"
      />
    )
  }

  if (phase === 'empty') {
    return (
      <StatusScreen
        action={
          <Button
            onClick={() => {
              void navigate('/write')
            }}
            type="button"
            variant="light"
          >
            手紙を書く
          </Button>
        }
        description="まだ、あなた宛ての手紙は届いていません。今の気持ちを書いて、未来の自分へ届けよう。"
        title="届いた手紙"
        tone="content"
        variant="empty"
      />
    )
  }

  const visibleLetters = filterInboxLettersByTab(letters, tab)

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = INBOX_TABS.findIndex((entry) => entry.value === tab)
    let next = current
    if (event.key === 'ArrowRight') {
      next = (current + 1) % INBOX_TABS.length
    } else if (event.key === 'ArrowLeft') {
      next = (current - 1 + INBOX_TABS.length) % INBOX_TABS.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = INBOX_TABS.length - 1
    } else {
      return
    }
    event.preventDefault()
    setTab(INBOX_TABS[next].value)
    tabRefs.current[next]?.focus()
  }

  return (
    <section aria-label="届いた手紙" className="inbox-list">
      <div
        aria-label="開封状態で絞り込む"
        className="inbox-list__tabs"
        onKeyDown={onTabKeyDown}
        role="tablist"
      >
        {INBOX_TABS.map((entry, index) => (
          <button
            aria-controls="inbox-list-panel"
            aria-selected={tab === entry.value}
            className={`inbox-list__tab${tab === entry.value ? ' inbox-list__tab--active' : ''}`}
            id={`inbox-list-tab-${entry.value}`}
            key={entry.value}
            onClick={() => setTab(entry.value)}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            role="tab"
            tabIndex={tab === entry.value ? 0 : -1}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`inbox-list-tab-${tab}`}
        className="inbox-list__panel"
        id="inbox-list-panel"
        role="tabpanel"
      >
        {visibleLetters.length === 0 ? (
          <p className="inbox-list__empty">{inboxTabEmptyLabel(tab)}</p>
        ) : (
          <ul aria-label="届いた手紙" className="inbox-list__items">
            {visibleLetters.map((letter) => {
              const arrived = arrivedTodayLabel(letter.deliveredAt, now, timeZone)
              const label = inboxListItemLabel(letter, now, timeZone)
              return (
                <li key={letter.letterId}>
                  <Link
                    aria-label={label}
                    className="inbox-list__item"
                    to={`/letters/${letter.letterId}`}
                  >
                    <NavIcon className="inbox-list__item-icon" name="inbox" />
                    <span className="inbox-list__item-content">
                      <span className="inbox-list__item-meta">
                        <span className="inbox-list__state">
                          {inboxOpenLabel(letter.sealed, letter.openedAt)}
                        </span>
                        {inboxOpenState(letter.sealed, letter.openedAt) === 'unopened' ? (
                          <span aria-label="未開封" className="inbox-list__unread-dot" />
                        ) : null}
                      </span>
                      <strong>{fromYouLabel(letter.sentAt, now, timeZone)}</strong>
                      {arrived ? <span className="inbox-list__item-arrived">{arrived}</span> : null}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
