import { useSelector } from '@tanstack/react-store'
import { useEffect, useState } from 'react'
import { devStore } from '../store'

/**
 * Renders the shared devStore event log.
 *
 * Defers rendering entries until after mount (useEffect) so SSR produces an empty
 * log container — preventing React hydration mismatches when log entries have
 * accumulated from a previous WS session.
 */
export function EventLog() {
  const { log } = useSelector(devStore)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="log">
      {mounted
        ? log.map((entry) => (
            <div className="log-entry" key={entry.id}>
              <span className="log-time">{entry.time}</span>
              <span className={`log-msg ${entry.cls}`}>{entry.message}</span>
            </div>
          ))
        : null}
    </div>
  )
}
