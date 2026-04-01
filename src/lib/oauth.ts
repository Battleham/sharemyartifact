const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

const toBase64Url = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const generateAuthorizationCode = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
};

export const generateAccessToken = (): string => {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return `sma_at_${toHex(bytes)}`;
};

export const generateRefreshToken = (): string => {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return `sma_rt_${toHex(bytes)}`;
};

export const generateClientId = (): string => {
  return crypto.randomUUID();
};

export const hashToken = async (token: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(hashBuffer));
};

export const verifyPkceChallenge = async (
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const computed = toBase64Url(digest);
  return computed === codeChallenge;
};
