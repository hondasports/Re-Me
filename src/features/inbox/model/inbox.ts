export type InboxLetterMetadata = {
  letterId: string
  threadId?: string
  nextLetterId?: string | null
  repliedAt?: number | null
  sealed: boolean
  sentAt: number | null
  deliveredAt: number | null
  openedAt: number | null
  status: 'draft' | 'traveling' | 'delivered'
}

export type InboxOpenState = 'unopened' | 'opened'

export function calendarDateInTimeZone(
  ms: number,
  timeZone: string,
): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const lookup = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  )

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  }
}

export function calendarDaysBetween(fromMs: number, toMs: number, timeZone: string): number {
  const from = calendarDateInTimeZone(fromMs, timeZone)
  const to = calendarDateInTimeZone(toMs, timeZone)
  const fromUtc = Date.UTC(from.year, from.month - 1, from.day)
  const toUtc = Date.UTC(to.year, to.month - 1, to.day)

  return Math.round((toUtc - fromUtc) / 86_400_000)
}

function isSameCalendarDay(
  left: { day: number; month: number; year: number },
  right: { day: number; month: number; year: number },
): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
}

export function msUntilNextCalendarDay(now: number, timeZone: string): number {
  const today = calendarDateInTimeZone(now, timeZone)
  let lo = now
  let hi = now + 36 * 60 * 60 * 1000

  while (hi - lo > 250) {
    const mid = Math.floor((lo + hi) / 2)
    if (isSameCalendarDay(calendarDateInTimeZone(mid, timeZone), today)) {
      lo = mid
    } else {
      hi = mid
    }
  }

  return Math.max(hi - now, 1)
}

export function fromYouLabel(sentAt: number | null, now: number, timeZone: string): string {
  if (sentAt === null) {
    return 'あなたから'
  }

  const days = calendarDaysBetween(sentAt, now, timeZone)

  if (days <= 0) {
    return '今日のあなたから'
  }

  return `${days}日前のあなたから`
}

export function arrivedTodayLabel(
  deliveredAt: number | null,
  now: number,
  timeZone: string,
): string | null {
  if (deliveredAt === null) {
    return null
  }

  return calendarDaysBetween(deliveredAt, now, timeZone) === 0 ? '今日届きました' : null
}

export function inboxOpenState(sealed: boolean, openedAt: number | null): InboxOpenState {
  return sealed && openedAt === null ? 'unopened' : 'opened'
}

export function inboxOpenLabel(sealed: boolean, openedAt: number | null): string {
  return inboxOpenState(sealed, openedAt) === 'unopened' ? '未開封' : '開封済み'
}

export type InboxListTab = 'unopened' | 'opened'

export function filterInboxLettersByTab(
  letters: InboxLetterMetadata[],
  tab: InboxListTab,
): InboxLetterMetadata[] {
  return letters.filter((letter) => inboxOpenState(letter.sealed, letter.openedAt) === tab)
}

export function inboxTabEmptyLabel(tab: InboxListTab): string {
  return tab === 'unopened' ? '未開封の手紙はありません。' : 'まだ開封した手紙はありません。'
}

export function inboxListItemLabel(
  letter: InboxLetterMetadata,
  now: number,
  timeZone: string,
): string {
  return [
    inboxOpenLabel(letter.sealed, letter.openedAt),
    fromYouLabel(letter.sentAt, now, timeZone),
    arrivedTodayLabel(letter.deliveredAt, now, timeZone),
  ]
    .filter((part): part is string => part !== null)
    .join('、')
}

export function inboxListPhase(
  letters: InboxLetterMetadata[] | undefined,
): 'loading' | 'empty' | 'list' {
  if (letters === undefined) {
    return 'loading'
  }

  return letters.length === 0 ? 'empty' : 'list'
}

export function canFetchInboxContent(
  metadata:
    | {
        openedAt: number | null
        sealed: boolean
        status: string
      }
    | null
    | undefined,
): boolean {
  if (metadata == null || metadata.status !== 'delivered') {
    return false
  }

  if (!metadata.sealed) {
    return true
  }

  return metadata.openedAt !== null
}

export function inboxContentQueryArgs<T extends string>(
  letterId: T | undefined,
  metadata:
    | {
        openedAt: number | null
        sealed: boolean
        status: string
      }
    | null
    | undefined,
): { letterId: T } | 'skip' {
  if (!letterId || !canFetchInboxContent(metadata)) {
    return 'skip'
  }

  return { letterId }
}

export function canReplyFromInbox(
  metadata:
    | {
        openedAt: number | null
        repliedAt?: number | null
        sealed: boolean
        status: string
      }
    | null
    | undefined,
): boolean {
  return (
    metadata != null &&
    metadata.status === 'delivered' &&
    !needsOpenRitual(metadata) &&
    metadata.repliedAt == null
  )
}

export function needsOpenRitual(
  metadata:
    | {
        openedAt: number | null
        sealed: boolean
        status: string
      }
    | null
    | undefined,
): boolean {
  return (
    metadata != null &&
    metadata.status === 'delivered' &&
    inboxOpenState(metadata.sealed, metadata.openedAt) === 'unopened'
  )
}
