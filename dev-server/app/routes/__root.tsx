import { useWebsocketSubscription, WebsocketClientProvider } from '@maxtroost/use-websocket'
import {
    createRootRoute,
    HeadContent,
    Link,
    Outlet,
    Scripts,
    useRouterState,
} from '@tanstack/react-router'
import { type ComponentType, useMemo } from 'react'
import { ReadyStateBadge } from '../components/ReadyStateBadge'
import '../styles/app.css'
import { getWsClient, WS_URL } from '../ws-client'
import type { WebsocketClient } from '@maxtroost/use-websocket'

// Cast needed: library typed against React 18 FunctionComponent; dev-server runs React 19.
const WsProvider = WebsocketClientProvider as ComponentType<{
  client: WebsocketClient
  children: React.ReactNode
}>

const NAV_ITEMS = [
  { to: '/reconnection', label: '↺ Reconnection' },
  { to: '/heartbeat', label: '♥ Heartbeat' },
  { to: '/online-offline', label: '⚡ Online/Offline' },
  { to: '/dependent-subscriptions', label: '⛓ Dependent Subs' },
] as const

// Inner component that uses hooks — must be inside WebsocketClientProvider
function Shell() {
  // Keep a subscription alive so the connection stays open
  useWebsocketSubscription({
    key: 'dev-server-keepalive',
    url: WS_URL,
    uri: '/dev',
  })

  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-nav">
          <div className="sidebar-section-label">Scenarios</div>
          {NAV_ITEMS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`nav-item${currentPath === to ? ' active' : ''}`}
            >
              <span className="nav-dot" />
              {label}
            </Link>
          ))}
        </div>
        <div className="sidebar-status">
          <div className="sidebar-section-label">Connection</div>
          <ReadyStateBadge />
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginTop: 6, wordBreak: 'break-all' }}>
            {WS_URL}
          </div>
        </div>
      </nav>

      <div className="main">
        <Outlet />
      </div>
    </div>
  )
}

function RootLayout() {
  const client = useMemo(() => getWsClient(), [])

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <WsProvider client={client}>
          <Shell />
        </WsProvider>
        <Scripts />
      </body>
    </html>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
