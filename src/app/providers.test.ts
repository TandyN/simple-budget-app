import { describe, expect, test, vi } from 'vitest';
import {
  createControllableClock,
  createCryptoIdGenerator,
  createFixedClock,
  createSequentialIdGenerator,
  createSystemClock,
} from './providers';

describe('application clock and id providers', () => {
  test('ids work without a secure context', () => {
    const randomUuidSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID is unavailable in an insecure HTTP LAN context');
    });

    try {
      const idGenerator = createCryptoIdGenerator();
      const firstId = idGenerator.nextId();
      const secondId = idGenerator.nextId();

      expect(randomUuidSpy).not.toHaveBeenCalled();
      expect(firstId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(secondId).not.toBe(firstId);
    } finally {
      randomUuidSpy.mockRestore();
    }
  });

  test('the clock reports today in the device local calendar and supports deterministic test travel', () => {
    const systemClock = createSystemClock(() => new Date(2026, 10, 5, 23, 45, 0));
    expect(systemClock.today()).toBe('2026-11-05');

    const fixedClock = createFixedClock('2026-11-05');
    expect(fixedClock.today()).toBe('2026-11-05');
    expect(fixedClock.now()).toBe('2026-11-05T09:00:00.000Z');

    const controllableClock = createControllableClock('2026-11-05');
    controllableClock.advanceTo('2026-12-01');
    expect(controllableClock.today()).toBe('2026-12-01');

    const sequentialIds = createSequentialIdGenerator('entry');
    expect(sequentialIds.nextId()).toBe('entry-1');
    expect(sequentialIds.nextId()).toBe('entry-2');
  });
});
