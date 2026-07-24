import { useStore } from '@tanstack/react-store'
import { ReadyState } from '@maxtroost/use-websocket'
import { devStore } from '../store'

const BADGE_CLS: Record<ReadyState, string> = {
  [ReadyState.OPEN]: 'badge-open',
  [ReadyState.CONNECTING]: 'badge-connecting',
  [ReadyState.CLOSED]: 'badge-closed',
  [ReadyState.CLOSING]: 'badge-closed',
  [ReadyState.UNINSTANTIATED]: 'badge-closed',
}

const BADGE_LABEL: Record<ReadyState, string> = {
  [ReadyState.OPEN]: 'Open',
  [ReadyState.CONNECTING]: 'Connecting',
  [ReadyState.CLOSED]: 'Closed',
  [ReadyState.CLOSING]: 'Closing',
  [ReadyState.UNINSTANTIATED]: '—',
}

/**
 * Renders the current WebSocket ReadyState as a coloured badge.
 *
 * suppressHydrationWarning is intentional: the server always renders
 * UNINSTANTIATED (—/badge-closed) because no WS connection exists during SSR,
 * while the client shows the live state. React would otherwise throw a
 * hydration mismatch error on every hard-navigate.
 */
export function ReadyStateBadge() {
  const { readyState } = useStore(devStore)
  return (
    // eslint-disable-next-line react/no-danger-with-children
    <span
      className={`badge ${BADGE_CLS[readyState]}`}
      suppressHydrationWarning
    >
      <span className="badge-dot" suppressHydrationWarning />
      <span suppressHydrationWarning>{BADGE_LABEL[readyState]}</span>
    </span>
  )
}

export { BADGE_CLS, BADGE_LABEL }
