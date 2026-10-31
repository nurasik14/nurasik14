import { describe, expect, test } from 'bun:test';
import { isLoopbackHost } from '../../src/planner/store.js';

describe('isLoopbackHost', () => {
  test('probes the API only on loopback hosts', () => {
    for (const h of ['localhost', '127.0.0.1', '::1', '[::1]']) expect(isLoopbackHost(h)).toBe(true);
  });

  test('goes straight to the snapshot elsewhere', () => {
    for (const h of ['nurasik14.github.io', '192.168.1.20', 'example.localhost', '']) expect(isLoopbackHost(h)).toBe(false);
  });
});
