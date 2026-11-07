import { assertIsoDate, todayIn, type IsoDate } from '../domain/calendar';

export interface Clock {
  now(): string;
  today(): IsoDate;
}

export interface IdGenerator {
  nextId(): string;
}

export function createSystemClock(getDate: () => Date = () => new Date()): Clock {
  return {
    now(): string {
      return getDate().toISOString();
    },
    today(): IsoDate {
      return todayIn(getDate());
    },
  };
}

export function createFixedClock(
  isoDate: IsoDate,
  isoTimestamp = `${isoDate}T09:00:00.000Z`,
): Clock {
  const currentDate = assertIsoDate(isoDate);
  const currentTimestamp = isoTimestamp;

  return {
    now(): string {
      return currentTimestamp;
    },
    today(): IsoDate {
      return currentDate;
    },
  };
}

export interface MutableClock extends Clock {
  advanceTo(isoDate: IsoDate, isoTimestamp?: string): void;
}

export function createControllableClock(
  initialDate: IsoDate,
  initialTimestamp = `${initialDate}T09:00:00.000Z`,
): MutableClock {
  let currentDate = assertIsoDate(initialDate);
  let currentTimestamp = initialTimestamp;

  return {
    now(): string {
      return currentTimestamp;
    },
    today(): IsoDate {
      return currentDate;
    },
    advanceTo(isoDate: IsoDate, isoTimestamp = `${isoDate}T09:00:00.000Z`): void {
      currentDate = assertIsoDate(isoDate);
      currentTimestamp = isoTimestamp;
    },
  };
}

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/**
 * Generates collision-resistant 128-bit RFC 4122 v4 identifiers using `crypto.getRandomValues`
 * instead of `crypto.randomUUID` so IDs work over plain-HTTP LAN dev (`http://192.168.x.x:5173`)
 * where `window.isSecureContext` is false and `crypto.randomUUID` is unavailable.
 */
export function createCryptoIdGenerator(
  fillRandomBytes: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    globalThis.crypto.getRandomValues(bytes),
): IdGenerator {
  return {
    nextId(): string {
      const bytes = fillRandomBytes(new Uint8Array(16));
      bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
      bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

      const hex = Array.from(bytes, byteToHex);
      return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
      ].join('-');
    },
  };
}

export function createSequentialIdGenerator(prefix = 'id'): IdGenerator {
  let counter = 0;
  return {
    nextId(): string {
      counter += 1;
      return `${prefix}-${String(counter)}`;
    },
  };
}
