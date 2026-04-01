import { describe, it, expect } from 'vitest';
import {
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  generateClientId,
  hashToken,
  verifyPkceChallenge,
} from '@/lib/oauth';

describe('OAuth flow integration', () => {
  it('generates tokens with correct prefixes', () => {
    const accessToken = generateAccessToken();
    expect(accessToken.startsWith('sma_at_')).toBe(true);

    const refreshToken = generateRefreshToken();
    expect(refreshToken.startsWith('sma_rt_')).toBe(true);
  });

  it('hashes are consistent and unique per token', async () => {
    const token1 = generateAccessToken();
    const token2 = generateAccessToken();

    const hash1a = await hashToken(token1);
    const hash1b = await hashToken(token1);
    const hash2 = await hashToken(token2);

    expect(hash1a).toBe(hash1b); // deterministic
    expect(hash1a).not.toBe(hash2); // unique
  });

  it('PKCE S256 flow works end-to-end', async () => {
    // Simulate what Claude.ai does:
    // 1. Generate a code_verifier (random string)
    const verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);
    const codeVerifier = Array.from(verifierBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // 2. Compute code_challenge = base64url(sha256(code_verifier))
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 3. Server verifies: sha256(code_verifier) === code_challenge
    expect(await verifyPkceChallenge(codeVerifier, codeChallenge)).toBe(true);

    // 4. Wrong verifier fails
    expect(await verifyPkceChallenge('wrong-verifier', codeChallenge)).toBe(false);
  });

  it('client IDs are valid UUIDs', () => {
    const clientId = generateClientId();
    expect(clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('authorization codes are 64 hex characters', () => {
    const code = generateAuthorizationCode();
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });

  it('full token lifecycle simulation', async () => {
    // 1. DCR → client_id
    const clientId = generateClientId();
    expect(clientId).toBeTruthy();

    // 2. Authorization → code
    const code = generateAuthorizationCode();
    const codeHash = await hashToken(code);
    expect(codeHash).not.toBe(code);

    // 3. Token exchange → access_token + refresh_token
    const accessToken = generateAccessToken();
    const refreshToken = generateRefreshToken();
    const atHash = await hashToken(accessToken);
    const rtHash = await hashToken(refreshToken);

    // Hashes are what get stored in DB
    expect(atHash).not.toBe(accessToken);
    expect(rtHash).not.toBe(refreshToken);

    // 4. Refresh → new tokens
    const newAccessToken = generateAccessToken();
    const newRefreshToken = generateRefreshToken();
    expect(newAccessToken).not.toBe(accessToken);
    expect(newRefreshToken).not.toBe(refreshToken);
  });
});
