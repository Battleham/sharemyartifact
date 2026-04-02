export const TTL_OPTIONS = ['10m', '1h', '12h', '1d', '2d', '365d', 'indefinite'] as const;
export type TtlValue = typeof TTL_OPTIONS[number];

const TTL_MS: Record<string, number | null> = {
  '10m': 10 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '2d': 2 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
  'indefinite': null,
};

export const parseTtl = (ttl: string): number | null => {
  if (!(ttl in TTL_MS)) {
    throw new Error(`Invalid TTL: "${ttl}". Valid values: ${TTL_OPTIONS.join(', ')}`);
  }
  return TTL_MS[ttl];
};

export const computeExpiresAt = (ttl: string): string | null => {
  const ms = parseTtl(ttl);
  if (ms === null) return null;
  return new Date(Date.now() + ms).toISOString();
};

export const formatTimeRemaining = (expiresAt: string | null): string => {
  if (expiresAt === null) return 'No expiration';

  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const minutes = Math.max(1, Math.floor(diff / (60 * 1000)));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days >= 1) return `Expires in ${days}d`;
  if (hours >= 1) return `Expires in ${hours}h`;
  return `Expires in ${minutes}m`;
};

export const TTL_LABELS: Record<TtlValue, string> = {
  '10m': '10 minutes',
  '1h': '1 hour',
  '12h': '12 hours',
  '1d': '1 day',
  '2d': '2 days',
  '365d': '365 days',
  'indefinite': 'Indefinite',
};
