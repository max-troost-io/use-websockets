/**
 * React context provider for WebSocket client.
 *
 * @module WebsocketProvider
 */

import { createContext, FunctionComponent, PropsWithChildren, useContext } from 'react';
import { WebsocketClient } from './WebsocketClient';

const WebsocketClientContext = createContext<WebsocketClient | undefined>(undefined);

/**
 * Returns the {@link WebsocketClient} from the nearest {@link WebsocketClientProvider}.
 *
 * Must be used within a `WebsocketClientProvider`; throws otherwise.
 *
 * @returns The WebsocketClient instance
 * @throws Error if used outside WebsocketClientProvider
 *
 * @example
 * ```typescript
 * const client = useWebsocketClient();
 * const api = useWebsocketSubscription({ key: 'my-sub', url: '...', uri: '...' });
 * ```
 */
export const useWebsocketClient = (): WebsocketClient => {
  const client = useContext(WebsocketClientContext);
  if (!client) {
    throw new Error('useWebsocketClient must be used within a WebsocketClientProvider');
  }
  return client;
};

/** Props for {@link WebsocketClientProvider}. */
interface WebsocketClientProviderProps {
  /** The WebsocketClient instance to provide to descendants. */
  client: WebsocketClient;
}

/**
 * Provides a {@link WebsocketClient} to the component tree.
 *
 * Wrap your app (or the part that uses WebSocket hooks) with this provider.
 * Create the client once (e.g. at app startup) and pass it here.
 *
 * @example
 * ```typescript
 * const client = new WebsocketClient({ maxRetryAttempts: 10 });
 * <WebsocketClientProvider client={client}>
 *   <App />
 * </WebsocketClientProvider>
 * ```
 */
export const WebsocketClientProvider: FunctionComponent<PropsWithChildren<WebsocketClientProviderProps>> = ({ children, client }) => {
  return <WebsocketClientContext.Provider value={client}>{children}</WebsocketClientContext.Provider>;
};
