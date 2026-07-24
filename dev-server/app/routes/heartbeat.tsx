import { createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReadyState } from '@maxtroost/use-websocket'
import { devStore, pushLog } from '../store'
import { setIgnoreHeartbeats } from '../server/fns'
import { ReadyStateBadge } from '../components/ReadyStateBadge'
import { EventLog } from '../components/EventLog'

const PING_INTERVAL = 5  // seconds — matches ws-client.ts pingIntervalMs: 5000
const PONG_TIMEOUT = 10  // seconds — matches pongTimeoutMs: 10000

type PipePhase = 'idle' | 'await' | 'pong' | 'stale'

function HeartbeatPage() {
  const { readyState } = useSelector(devStore)
  const [isIgnoring, setIsIgnoring] = useState(false)
  const [pending, setPending] = useState(false)
  const [pipePhase, setPipePhase] = useState<PipePhase>('idle')
  const [idleRemain, setIdleRemain] = useState(PING_INTERVAL)
  const [awaitRemain, setAwaitRemain] = useState(PONG_TIMEOUT)
  const [pings, setPings] = useState(0)
  const [pongs, setPongs] = useState(0)
  const [misses, setMisses] = useState(0)
  const [progWidth, setProgWidth] = useState('0%')
  const [progCls, setProgCls] = useState('prog-interval')

  const phaseRef = useRef<PipePhase>('idle')
  const ignoringRef = useRef(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Sync ignoringRef with state
  useEffect(() => { ignoringRef.current = isIgnoring }, [isIgnoring])

  const startCycle = useCallback(() => {
    phaseRef.current = 'idle'
    setPipePhase('idle')
    setProgWidth('0%')
    setProgCls('prog-interval')
    let remain = PING_INTERVAL
    setIdleRemain(remain)

    if (tickRef.current) clearInterval(tickRef.current)

    tickRef.current = setInterval(() => {
      if (phaseRef.current === 'idle') {
        remain--
        setIdleRemain(Math.max(0, remain))
        setProgWidth(`${((PING_INTERVAL - remain) / PING_INTERVAL) * 100}%`)
        if (remain <= 0) firePing()
      } else if (phaseRef.current === 'await') {
        remain--
        setAwaitRemain(Math.max(0, remain))
        setProgWidth(`${((PONG_TIMEOUT - remain) / PONG_TIMEOUT) * 100}%`)
        if (remain <= 0) missPong()
      }
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const firePing = useCallback(() => {
    phaseRef.current = 'await'
    setPipePhase('await')
    setProgCls('prog-timeout')
    setProgWidth('0%')
    let remain = PONG_TIMEOUT
    setAwaitRemain(remain)
    setPings((n) => { pushLog(`→ ping #${n + 1}`, 'ping'); return n + 1 })

    if (!ignoringRef.current) {
      setTimeout(() => receivePong(), 300)
    }
  }, [])

  const receivePong = useCallback(() => {
    if (phaseRef.current !== 'await') return
    phaseRef.current = 'pong'
    setPipePhase('pong')
    setProgWidth('100%')
    setPongs((n) => { pushLog('← pong', 'pong'); return n + 1 })
    setTimeout(() => startCycle(), 1500)
  }, [startCycle])

  const missPong = useCallback(() => {
    if (phaseRef.current !== 'await') return
    phaseRef.current = 'stale'
    setPipePhase('stale')
    setMisses((n) => { pushLog('✗ pong timeout — stale', 'miss'); return n + 1 })
  }, [])

  useEffect(() => {
    // Only run the visual simulator while connected;
    // the actual library handles its own heartbeat via the real WS connection.
    // This UI tracks its own visual state for the pipeline display.
    startCycle()
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [startCycle])

  // Restart cycle when connection opens
  const prevReadyState = useRef(readyState)
  useEffect(() => {
    if (prevReadyState.current !== ReadyState.OPEN && readyState === ReadyState.OPEN) {
      if (tickRef.current) clearInterval(tickRef.current)
      setIsIgnoring(false)
      ignoringRef.current = false
      setPings(0)
      setPongs(0)
      setMisses(0)
      startCycle()
    }
    prevReadyState.current = readyState
  }, [readyState, startCycle])

  const handleToggle = useCallback(async () => {
    const next = !isIgnoring
    setPending(true)
    try {
      await setIgnoreHeartbeats({ data: { ignore: next } })
      setIsIgnoring(next)
      pushLog(next ? 'Server: ignoring pings' : 'Server: pings resumed', next ? 'miss' : 'pong')
    } finally {
      setPending(false)
    }
  }, [isIgnoring])

  const pipeSegCls = (seg: 'idle' | 'await' | 'result') => {
    if (seg === 'idle') return pipePhase === 'idle' ? ' pipe-active' : ''
    if (seg === 'await') return pipePhase === 'await' ? ' pipe-active' : ''
    if (seg === 'result') {
      if (pipePhase === 'pong') return ' pipe-done'
      if (pipePhase === 'stale') return ' pipe-warn'
    }
    return ''
  }

  return (
    <>
      <div className="main-header">
        <h2>♡ Heartbeat</h2>
        <ReadyStateBadge />
      </div>

      <div className="main-body">
        {/* Pipeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="card-label" style={{ marginBottom: 0 }}>Heartbeat cycle</div>
          <div className="pipeline">
            <div className={`pipe-seg${pipeSegCls('idle')}`}>
              <span className="pipe-label">Next ping in</span>
              <span className="pipe-value">
                {pipePhase === 'idle' ? `${idleRemain}s` : '—'}
              </span>
            </div>
            <div className={`pipe-seg${pipeSegCls('await')}`}>
              <span className="pipe-label">Awaiting pong</span>
              <span className="pipe-value">
                {pipePhase === 'await' ? `${awaitRemain}s` : '—'}
              </span>
            </div>
            <div className={`pipe-seg${pipeSegCls('result')}`}>
              <span className="pipe-label">
                {pipePhase === 'pong' ? '✓ Pong' : pipePhase === 'stale' ? '✗ Stale' : '—'}
              </span>
              <span className="pipe-value">
                {pipePhase === 'pong' ? 'received' : pipePhase === 'stale' ? 'closing' : '—'}
              </span>
            </div>
          </div>
          <div className="prog-wrap">
            <div className={`prog-fill ${progCls}`} style={{ width: progWidth }} />
          </div>
        </div>

        {/* Stats + control */}
        <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="stat">
            <span className="stat-label">Pings sent</span>
            <span className="stat-value">{pings}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Pongs received</span>
            <span className="stat-value" style={{ color: pongs > 0 ? 'var(--pong)' : undefined }}>{pongs}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Missed pongs</span>
            <span className="stat-value" style={{ color: misses > 0 ? 'var(--stale)' : 'var(--muted)' }}>{misses}</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <label className="toggle-row" onClick={handleToggle}>
              <div className={`toggle-track${isIgnoring ? ' on' : ''}`}>
                <div className="toggle-knob" />
              </div>
              <span style={{ color: isIgnoring ? 'var(--stale)' : undefined }}>
                {isIgnoring ? '⚠️ Ignoring pings' : 'Ignore heartbeat pings'}
              </span>
              {pending && <span style={{ fontSize: 11, color: 'var(--muted)' }}>…</span>}
            </label>
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

export const Route = createFileRoute('/heartbeat')({
  component: HeartbeatPage,
})
