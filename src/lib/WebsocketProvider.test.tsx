import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WebsocketClient } from './WebsocketClient';
import { WebsocketClientProvider, useWebsocketClient } from './WebsocketProvider';

describe('WebsocketProvider', () => {
  const mockClient = new WebsocketClient({});

  describe('useWebsocketClient', () => {
    it('should throw when used outside WebsocketClientProvider', () => {
      const ConsoleSpy = () => {
        useWebsocketClient();
        return null;
      };

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<ConsoleSpy />)).toThrow(
        'useWebsocketClient must be used within a WebsocketClientProvider'
      );
      consoleError.mockRestore();
    });

    it('should return client when used inside WebsocketClientProvider', () => {
      const Consumer = () => {
        const client = useWebsocketClient();
        return <span data-testid="client">{client ? 'has-client' : 'no-client'}</span>;
      };

      render(
        <WebsocketClientProvider client={mockClient}>
          <Consumer />
        </WebsocketClientProvider>
      );

      expect(screen.getByTestId('client')).toHaveTextContent('has-client');
    });

    it('should return the same client instance that was provided', () => {
      let receivedClient: WebsocketClient | null = null;

      const Consumer = () => {
        receivedClient = useWebsocketClient();
        return null;
      };

      render(
        <WebsocketClientProvider client={mockClient}>
          <Consumer />
        </WebsocketClientProvider>
      );

      expect(receivedClient).toBe(mockClient);
    });
  });

  describe('WebsocketClientProvider', () => {
    it('should render children', () => {
      render(
        <WebsocketClientProvider client={mockClient}>
          <span data-testid="child">Child content</span>
        </WebsocketClientProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Child content');
    });

    it('should provide client to nested consumers', () => {
      const InnerConsumer = () => {
        const client = useWebsocketClient();
        return <span data-testid="inner">{client ? 'ok' : 'missing'}</span>;
      };

      render(
        <WebsocketClientProvider client={mockClient}>
          <div>
            <InnerConsumer />
          </div>
        </WebsocketClientProvider>
      );

      expect(screen.getByTestId('inner')).toHaveTextContent('ok');
    });
  });
});
