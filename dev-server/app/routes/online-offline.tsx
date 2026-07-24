import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { useCallback, useState } from 'react'
import { ReadyState } from '@maxtroost/use-websocket'
import { devStore, pushLog } from '../store'
import { ReadyStateBadge } from '../components/ReadyStateBadge'
import { EventLog } from '../components/EventLog'

const RS_LABEL: Record<ReadyState, string> = {
  [ReadyState.OPEN]: 'OPEN',
  [ReadyState.CONNECTING]: 'CONNECTING',
  [ReadyState.CLOSED]: 'CLOSED',
  [ReadyState.CLOSING]: 'CLOSING',
  [ReadyState.UNINSTANTIATED]: '—',
}

function OnlineOfflinePage() {
  const { readyState } = useSelector(devStore)
  const [isOffline, setIsOffline] = useState(false)

  const handleToggle = useCallback(() => {
    const next = !isOffline
    setIsOffline(next)
    if (next) {
      pushLog('offline event → handleOffline()', 'closed')
      window.dispatchEvent(new Event('offline'))
    } else {
      pushLog('online event → connect()', 'state')
      window.dispatchEvent(new Event('online'))
    }
  }, [isOffline])

  return (
    <>
      <div className="main-header">
        <h2>⚡ Online / Offline</h2>
        <ReadyStateBadge />
      </div>

      <div className={`main-body${isOffline ? ' offline-pane' : ''}`}>
        {/* Offline banner */}
        {isOffline && (
          <div className="offline-banner">
            <div className="offline-banner-dot" />
            Browser is offline — library has torn down the socket and is waiting for the online event
          </div>
        )}

        {/* Stats */}
        <div className="card">
          <div className="stats-row">
            <div className="stat">
              <span className="stat-label">navigator.onLine</span>
              <span
                className="stat-value"
                style={{ color: isOffline ? 'var(--closed)' : 'var(--open)' }}
              >
                {isOffline ? 'false' : 'true'}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">ReadyState</span>
              <span
                className="stat-value"
                style={{
                  color: readyState === ReadyState.OPEN
                    ? 'var(--open)'
                    : readyState === ReadyState.CONNECTING
                      ? 'var(--connecting)'
                      : 'var(--closed)',
                }}
                suppressHydrationWarning
              >
                {RS_LABEL[readyState]}
              </span>
            </div>
          </div>
        </div>

        {/* Control */}
        <div className="card">
          <div className="card-label">Controls</div>
          <label className="toggle-row" onClick={handleToggle}>
            <div className={`toggle-track${isOffline ? ' on-danger' : ''}`}>
              <div className="toggle-knob" />
            </div>
            <span style={{ color: isOffline ? 'var(--closed)' : undefined }}>
              {isOffline ? 'Simulating offline' : 'Simulate offline'}
            </span>
          </label>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
            Dispatches a synthetic{' '}
            <code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>
              offline
            </code>{' '}
            /{' '}
            <code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>
              online
            </code>{' '}
            browser event. The library's{' '}
            <code style={{ background: 'var(--surface2)', padding: '1px 4px', borderRadius: 3 }}>
              handleOffline
            </code>{' '}
            handler tears down the socket automatically — no server action needed.
          </p>
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

export const Route = createFileRoute('/online-offline')({
  component: OnlineOfflinePage,
})
