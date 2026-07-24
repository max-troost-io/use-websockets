import { createStore } from '@tanstack/store'
import { ReadyState } from '@maxtroost/use-websocket'

export interface LogEntry {
  id: number
  time: string
  message: string
  cls: 'state' | 'closed' | 'connecting' | 'attempt' | 'ping' | 'pong' | 'miss' | 'muted' | ''
}

export interface DevStore {
  readyState: ReadyState
  reconnectAttempts: number
  log: LogEntry[]
}

let _logId = 0

export const devStore = createStore<DevStore>({
  readyState: ReadyState.UNINSTANTIATED,
  reconnectAttempts: 0,
  log: [],
})

export function pushLog(
  message: string,
  cls: LogEntry['cls'] = '',
) {
  const time = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  devStore.setState((prev) => ({
    ...prev,
    log: [...prev.log, { id: ++_logId, time, message, cls }].slice(-200),
  }))
}

export function setReadyState(rs: ReadyState) {
  devStore.setState((prev) => ({ ...prev, readyState: rs }))
}

export function setReconnectAttempts(n: number) {
  devStore.setState((prev) => ({ ...prev, reconnectAttempts: n }))
}
