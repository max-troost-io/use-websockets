'use server'
import type { WebSocketServer, WebSocket } from 'ws'

const g = globalThis as Record<string, unknown>

interface WsState {
  isBlockingReconnects: boolean
  blockUntil: number | null
  isIgnoringPings: boolean
}

export function getState(): WsState {
  if (!g['__wsState']) {
    g['__wsState'] = { isBlockingReconnects: false, blockUntil: null, isIgnoringPings: false }
  }
  return g['__wsState'] as WsState
}

export function getWss(): WebSocketServer | null {
  return (g['__wss'] as WebSocketServer | undefined) ?? null
}

export function dropAllClients() {
  const wss = getWss()
  wss?.clients.forEach((ws: WebSocket) => {
    ws.close(1001, 'Going Away')
  })
}

export function activateBlock(blockForMs: number | null) {
  const state = getState()
  state.isBlockingReconnects = true
  state.blockUntil = blockForMs !== null ? Date.now() + blockForMs : null
  if (blockForMs !== null) {
    setTimeout(() => {
      state.isBlockingReconnects = false
      state.blockUntil = null
    }, blockForMs)
  }
}

export function deactivateBlock() {
  const state = getState()
  state.isBlockingReconnects = false
  state.blockUntil = null
}

export function setIgnorePings(ignore: boolean) {
  getState().isIgnoringPings = ignore
}

/** Push a fresh session token to all connected clients (dependent-subscriptions scenario). */
export function pushNewSession() {
  const wss = getWss()
  if (!wss) return
  const sessionId = Math.random().toString(36).slice(2, 10).toUpperCase()
  wss.clients.forEach((ws: WebSocket) => {
    if (ws.readyState === 1)
      ws.send(JSON.stringify({ uri: '/session', body: { sessionId } }))
  })
}
