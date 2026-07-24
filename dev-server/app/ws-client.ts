import { WebsocketClient, ReadyState } from '@maxtroost/use-websocket'
import { pushLog, setReadyState, setReconnectAttempts } from './store'

export const WS_URL = 'ws://localhost:3001'

// Module-level singleton — created once on the client
let _client: WebsocketClient | null = null

export function getWsClient(): WebsocketClient {
  if (!_client) {
    _client = new WebsocketClient({
      heartbeat: {
        enabled: true,
        pongTimeoutMs: 10_000,
        pingIntervalMs: 5_000, // fast interval for dev testing
      },
      connectionEvent: (event) => {
        switch (event.type) {
          case 'open':
            setReadyState(ReadyState.OPEN)
            setReconnectAttempts(0)
            pushLog('OPEN', 'state')
            break
          case 'connect':
            setReadyState(ReadyState.CONNECTING)
            pushLog('CONNECTING…', 'connecting')
            break
          case 'close':
            setReadyState(ReadyState.CLOSED)
            pushLog(`CLOSED (code ${event.closeEvent?.code ?? '?'})`, 'closed')
            break
          case 'reconnecting':
            setReconnectAttempts(event.retries ?? 0)
            pushLog(
              `↻ reconnecting attempt ${event.retries ?? '?'}`,
              'attempt',
            )
            break
          case 'max-retries-exceeded':
            pushLog('✗ max retries exceeded — stopped', 'closed')
            break
          case 'pong-timeout':
            pushLog('✗ pong timeout — connection stale', 'miss')
            break
        }
      },
    })
  }
  return _client
}
