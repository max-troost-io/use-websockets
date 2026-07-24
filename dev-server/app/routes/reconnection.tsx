import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReadyState } from '@maxtroost/use-websocket'
import { devStore } from '../store'
import { dropAndBlock, releaseBlock } from '../server/fns'
import { ReadyStateBadge } from '../components/ReadyStateBadge'
import { EventLog } from '../components/EventLog'

const PHASE_THRESHOLDS = { first: 5, second: 10 }
const PHASE_DELAYS = { firstPhase: 4, secondPhase: 30, thirdPhase: 90 }
const DURATIONS = [
  { label: 'No block', ms: 0 },
  { label: '10s', ms: 10_000 },
  { label: '60s', ms: 60_000 },
  { label: '120s', ms: 120_000 },
  { label: 'Hold', ms: null },
] as const

type Duration = (typeof DURATIONS)[number]

function getPhase(attempts: number) {
  if (attempts < PHASE_THRESHOLDS.first)
    return { n: 1, label: `Phase 1 · ${PHASE_DELAYS.firstPhase}s ×5` }
  if (attempts < PHASE_THRESHOLDS.second)
    return { n: 2, label: `Phase 2 · ${PHASE_DELAYS.secondPhase}s ×5` }
  return { n: 3, label: `Phase 3 · ${PHASE_DELAYS.thirdPhase}s ×10` }
}

const RS_LABEL: Record<ReadyState, string> = {
  [ReadyState.OPEN]: 'OPEN',
  [ReadyState.CONNECTING]: 'CONNECTING',
  [ReadyState.CLOSED]: 'CLOSED',
  [ReadyState.CLOSING]: 'CLOSING',
  [ReadyState.UNINSTANTIATED]: '—',
}
const RS_COLOR: Record<ReadyState, string> = {
  [ReadyState.OPEN]: 'var(--open)',
  [ReadyState.CONNECTING]: 'var(--connecting)',
  [ReadyState.CLOSED]: 'var(--closed)',
  [ReadyState.CLOSING]: 'var(--closed)',
  [ReadyState.UNINSTANTIATED]: 'var(--muted)',
}

function ReconnectionPage() {
  const { readyState, reconnectAttempts } = useSelector(devStore)
  const [selectedDur, setSelectedDur] = useState<Duration>(DURATIONS[1]!)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockReleaseAt, setBlockReleaseAt] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const ringRef = useRef<SVGCircleElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const phase = getPhase(reconnectAttempts)

  // Countdown ticker
  useEffect(() => {
    if (!isBlocked || blockReleaseAt === null) {
      setCountdown(null)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    const tick = () => {
      const remaining = Math.ceil((blockReleaseAt - Date.now()) / 1000)
      setCountdown(Math.max(0, remaining))
      if (remaining <= 0) {
        setIsBlocked(false)
        setBlockReleaseAt(null)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
    tick()
    intervalRef.current = setInterval(tick, 500)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isBlocked, blockReleaseAt])

  const handleDrop = useCallback(async () => {
    setPending(true)
    try {
      await dropAndBlock({ data: { blockForMs: selectedDur.ms ?? null } })
      if (selectedDur.ms !== 0) {
        setIsBlocked(true)
        setBlockReleaseAt(selectedDur.ms !== null ? Date.now() + selectedDur.ms : null)
      }
    } finally {
      setPending(false)
    }
  }, [selectedDur])

  const handleRelease = useCallback(async () => {
    setPending(true)
    try {
      await releaseBlock()
      setIsBlocked(false)
      setBlockReleaseAt(null)
    } finally {
      setPending(false)
    }
  }, [])

  const totalSecs = selectedDur.ms !== null ? selectedDur.ms / 1000 : null
  const ringOffset =
    countdown !== null && totalSecs !== null
      ? 126 * (countdown / totalSecs)
      : 126

  return (
    <>
      <div className="main-header">
        <h2>↺ Reconnection</h2>
        <ReadyStateBadge />
      </div>

      <div className="main-body">
        {/* Stats */}
        <div className="card">
          <div className="stats-row">
            <div className="stat">
              <span className="stat-label">ReadyState</span>
              <span className="stat-value" style={{ color: RS_COLOR[readyState] }} suppressHydrationWarning>
                {RS_LABEL[readyState]}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Attempts</span>
              <span className="stat-value">{reconnectAttempts}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Phase</span>
              <span className="stat-value" style={{ fontSize: 13 }}>
                {reconnectAttempts > 0 ? phase.label : '—'}
              </span>
            </div>
          </div>

          {/* Phase bar */}
          <div style={{ marginTop: 12 }}>
            <div className="card-label" style={{ marginBottom: 6 }}>Reconnection phase</div>
            <div className="phase-bar">
              {([1, 2, 3] as const).map((n) => (
                <div
                  key={n}
                  className={`phase-seg phase-p${n}${phase.n === n && reconnectAttempts > 0 ? ' active' : phase.n > n ? ' done' : ''}`}
                >
                  {n === 1 ? 'Phase 1 · 4s ×5' : n === 2 ? 'Phase 2 · 30s ×5' : 'Phase 3 · 90s ×10'}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="card">
          <div className="card-label">Controls</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 500 }}>
                Block duration
              </div>
              <div className="duration-picker">
                {DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    className={`dur-opt${selectedDur.label === d.label ? ' selected' : ''}`}
                    onClick={() => setSelectedDur(d)}
                    disabled={isBlocked}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={handleDrop}
                disabled={pending}
              >
                Drop Connection
              </button>
              <button
                className="btn"
                onClick={handleRelease}
                disabled={!isBlocked || pending}
              >
                Release Block
              </button>

              {isBlocked && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="ring-wrap">
                    <svg width="48" height="48" viewBox="0 0 48 48">
                      <circle className="ring-bg" cx="24" cy="24" r="20" />
                      <circle
                        ref={ringRef}
                        className="ring-fg"
                        cx="24" cy="24" r="20"
                        style={{ strokeDashoffset: ringOffset }}
                      />
                    </svg>
                    <div className="ring-label">
                      {countdown !== null ? `${countdown}s` : '∞'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Server blocking<br />reconnects
                  </div>
                </div>
              )}
            </div>
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

export const Route = createFileRoute('/reconnection')({
  component: ReconnectionPage,
})
