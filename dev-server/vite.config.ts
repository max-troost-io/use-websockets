import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { WebSocketServer } from 'ws'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── WebSocket dev server plugin ──────────────────────────────────────────────
// Starts a ws:// server on port 3001 when Vite starts.
// Uses globalThis to survive HMR module reloads.
function wsServerPlugin(): Plugin {
  return {
    name: 'dev-ws-server',
    configureServer() {
      const g = globalThis as Record<string, unknown>
      if (g['__wss']) return // HMR: already running

      g['__wsState'] = {
        isBlockingReconnects: false,
        blockUntil: null as number | null,
        isIgnoringPings: false,
      }

      const wss = new WebSocketServer({ port: 3001 })
      g['__wss'] = wss

      console.log('\n  [ws-server] ▸ ws://localhost:3001\n')

      wss.on('connection', (ws) => {
        const state = g['__wsState'] as {
          isBlockingReconnects: boolean
          blockUntil: number | null
          isIgnoringPings: boolean
        }

        // Refuse connection if blocking window is active
        if (state.isBlockingReconnects) {
          const stillBlocking =
            state.blockUntil === null || Date.now() < state.blockUntil
          if (stillBlocking) {
            ws.close(1013, 'Try Again Later')
            return
          }
          // Block expired — clear and accept
          state.isBlockingReconnects = false
          state.blockUntil = null
        }

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString()) as {
              method?: string
              uri?: string
              body?: unknown
            }
            // Heartbeat ping — echo back as pong unless ignoring
            if (msg.uri === 'ping') {
              if (!state.isIgnoringPings) {
                ws.send(JSON.stringify({ uri: 'ping', body: msg.body }))
              }
              return
            }

            // Dependent-subscriptions scenario
            if (msg.method === 'subscribe' && msg.uri === '/session') {
              const sessionId = Math.random().toString(36).slice(2, 10).toUpperCase()
              setTimeout(() => {
                if (ws.readyState === 1)
                  ws.send(JSON.stringify({ uri: '/session', body: { sessionId } }))
              }, 150)
              return
            }
            if (msg.method === 'subscribe' && msg.uri === '/details') {
              const { sessionId } = (msg.body ?? {}) as { sessionId?: string }
              setTimeout(() => {
                if (ws.readyState === 1)
                  ws.send(JSON.stringify({
                    uri: '/details',
                    body: {
                      sessionId: sessionId ?? '—',
                      items: [`Alpha-${sessionId}`, `Beta-${sessionId}`, `Gamma-${sessionId}`],
                      fetchedAt: new Date().toISOString(),
                    },
                  }))
              }, 250)
              return
            }
          } catch {
            // ignore malformed messages
          }
        })

        ws.on('error', () => {})
      })

      wss.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
          console.error('[ws-server] error:', err)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: './app',
      router: {
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
      },
    }),
    react(),
    wsServerPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@maxtroost/use-websocket': path.resolve(__dirname, '../src/index.ts'),
    },
  },
})
