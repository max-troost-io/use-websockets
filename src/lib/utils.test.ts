import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wait } from './utils';

describe('wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified delay', async () => {
    const promise = wait(100);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not resolve before the delay', async () => {
    let resolved = false;
    const promise = wait(100).then(() => {
      resolved = true;
    });
    vi.advanceTimersByTime(99);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });
});
