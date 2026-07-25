import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { useWebsocketSubscription } from '@maxtroost/use-websocket'
import { WS_URL } from '../ws-client'
import { triggerNewSession } from '../server/fns'
import { ReadyStateBadge } from '../components/ReadyStateBadge'
import { EventLog } from '../components/EventLog'
import { useSelector } from '@tanstack/react-store'

// ── Types ──────────────────────────────────────────────
interface SessionMessage {
  sessionId: string
}

interface DetailsMessage {
  sessionId: string
  items: string[]
  fetchedAt: string
}

// ── Sub-status pill ────────────────────────────────────
interface SubStatusProps {
  label: string
  connected: boolean
  subscribed: boolean
  pending: boolean
  dimmed?: boolean
}

function SubStatus({ label, connected, subscribed, pending, dimmed }: SubStatusProps) {
  const cls = dimmed
    ? 'badge badge-closed'
    : pending
      ? 'badge badge-connecting'
      : subscribed && connected
        ? 'badge badge-open'
        : 'badge badge-closed'

  const text = dimmed
    ? 'waiting for A'
    : pending
      ? 'pending…'
      : subscribed && connected
        ? 'subscribed'
        : 'not subscribed'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <span className={cls} suppressHydrationWarning>
        <span className="badge-dot" suppressHydrationWarning />
        <span suppressHydrationWarning>{text}</span>
      </span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────
function DependentSubscriptionsPage() {
  const [pending, setPending] = useState(false)

  // ── Subscription A — starts on mount ─────────────────
  const sessionApi = useWebsocketSubscription<SessionMessage>({
    key: 'dep-sub-session',
    url: WS_URL,
    uri: '/session',
  })

  const sessionStore = useSelector(sessionApi.store)
  const sessionMsg     = sessionStore.message
  const sessionConn    = sessionStore.connected
  const sessionSub     = sessionStore.subscribed
  const sessionPending = sessionStore.pendingSubscription

  // ── Subscription B — enabled when A has a message ────
  // body is updated automatically when sessionMsg changes → library re-subscribes
  const detailsApi = useWebsocketSubscription<DetailsMessage, SessionMessage>({
    key: 'dep-sub-details',
    url: WS_URL,
    uri: '/details',
    enabled: sessionMsg !== undefined,
    body: sessionMsg,
  })

  const detailsStore = useSelector(detailsApi.store)
  const detailsMsg     = detailsStore.message
  const detailsConn    = detailsStore.connected
  const detailsSub     = detailsStore.subscribed
  const detailsPending = detailsStore.pendingSubscription

  const handleNewSession = useCallback(async () => {
    setPending(true)
    try {
      await triggerNewSession()
    } finally {
      setPending(false)
    }
  }, [])

  return (
    <>
      <div className="main-header">
        <h2>⛓ Dependent Subscriptions</h2>
        <ReadyStateBadge />
      </div>

      <div className="main-body">

        {/* Subscription cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Subscription A */}
          <div className="card">
            <SubStatus
              label="Subscription A — /session"
              connected={sessionConn}
              subscribed={sessionSub}
              pending={sessionPending}
            />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="stat">
                <span className="stat-label">Session ID</span>
                <span
                  className="stat-value"
                  style={{ fontFamily: 'monospace', fontSize: 18, color: sessionMsg ? 'var(--pong)' : 'var(--muted)' }}
                  suppressHydrationWarning
                >
                  {sessionMsg?.sessionId ?? '—'}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginTop: 4 }}>
                Starts on component mount. Server responds with a session token after
                a short delay. The token is passed as <code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>body</code> to subscription B.
              </p>
            </div>
          </div>

          {/* Subscription B */}
          <div className="card" style={{ opacity: sessionMsg ? 1 : 0.5, transition: 'opacity 0.3s' }}>
            <SubStatus
              label="Subscription B — /details"
              connected={detailsConn}
              subscribed={detailsSub}
              pending={detailsPending}
              dimmed={sessionMsg === undefined}
            />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="stat">
                <span className="stat-label">Items received</span>
                <span
                  className="stat-value"
                  style={{ color: detailsMsg ? 'var(--open)' : 'var(--muted)' }}
                  suppressHydrationWarning
                >
                  {detailsMsg ? detailsMsg.items.length : '—'}
                </span>
              </div>
              {detailsMsg && (
                <div
                  style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text)', lineHeight: 1.7 }}
                  suppressHydrationWarning
                >
                  {detailsMsg.items.map((item) => (
                    <div key={item} style={{ color: 'var(--pong)' }}>{item}</div>
                  ))}
                  <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                    fetched {new Date(detailsMsg.fetchedAt).toLocaleTimeString()}
                  </div>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginTop: 4 }}>
                Only enabled when A has a message (<code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>enabled={'{'}sessionMsg !== undefined{'}'}</code>).
                Re-subscribes automatically when the session ID changes.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="card">
          <div className="card-label">Controls</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={handleNewSession}
              disabled={pending}
            >
              New Session
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Server pushes a fresh session token → A updates → B re-subscribes with new token
            </span>
          </div>
        </div>

        {/* Log */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-label">Event log</div>
          <EventLog />
        </div>

      </div>
    </>
  )
}

export const Route = createFileRoute('/dependent-subscriptions')({
  component: DependentSubscriptionsPage,
})
