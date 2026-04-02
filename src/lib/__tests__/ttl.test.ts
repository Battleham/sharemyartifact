import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseTtl, computeExpiresAt, formatTimeRemaining, TTL_OPTIONS } from '../ttl';

describe('TTL_OPTIONS', () => {
  it('contains all valid TTL values', () => {
    expect(TTL_OPTIONS).toEqual(['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite']);
  });
});

describe('parseTtl', () => {
  it('parses 10m to 600000ms', () => {
    expect(parseTtl('10m')).toBe(10 * 60 * 1000);
  });

  it('parses 1h to 3600000ms', () => {
    expect(parseTtl('1h')).toBe(60 * 60 * 1000);
  });

  it('parses 12h to 43200000ms', () => {
    expect(parseTtl('12h')).toBe(12 * 60 * 60 * 1000);
  });

  it('parses 1d to 86400000ms', () => {
    expect(parseTtl('1d')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses 2d to 172800000ms', () => {
    expect(parseTtl('2d')).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('parses 365d to 31536000000ms', () => {
    expect(parseTtl('365d')).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('returns null for indefinite', () => {
    expect(parseTtl('indefinite')).toBeNull();
  });

  it('throws on invalid value', () => {
    expect(() => parseTtl('5m')).toThrow('Invalid TTL');
    expect(() => parseTtl('forever')).toThrow('Invalid TTL');
    expect(() => parseTtl('')).toThrow('Invalid TTL');
  });
});

describe('computeExpiresAt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ISO string for valid TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    const result = computeExpiresAt('1d');
    expect(result).toBe('2026-04-03T12:00:00.000Z');
  });

  it('returns null for indefinite', () => {
    expect(computeExpiresAt('indefinite')).toBeNull();
  });

  it('computes 10m correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(computeExpiresAt('10m')).toBe('2026-04-02T12:10:00.000Z');
  });
});

describe('formatTimeRemaining', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "No expiration" for null', () => {
    expect(formatTimeRemaining(null)).toBe('No expiration');
  });

  it('returns "Expired" for past date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-02T11:00:00.000Z')).toBe('Expired');
  });

  it('returns minutes when under 1 hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-02T12:45:00.000Z')).toBe('Expires in 45m');
  });

  it('returns hours when under 1 day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-03T10:00:00.000Z')).toBe('Expires in 22h');
  });

  it('returns days when 1 day or more', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-05T12:00:00.000Z')).toBe('Expires in 3d');
  });

  it('shows 1m for very short remaining time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    expect(formatTimeRemaining('2026-04-02T12:00:30.000Z')).toBe('Expires in 1m');
  });
});
