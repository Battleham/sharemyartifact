import { describe, it, expect } from 'vitest';
import {
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  generateClientId,
  hashToken,
  verifyPkceChallenge,
} from '../oauth';

describe('OAuth utilities', () => {
  it('generates unique authorization codes', () => {
    const code1 = generateAuthorizationCode();
    const code2 = generateAuthorizationCode();
    expect(code1).not.toBe(code2);
    expect(code1.length).toBeGreaterThanOrEqual(48);
  });

  it('generates unique access tokens', () => {
    const t1 = generateAccessToken();
    const t2 = generateAccessToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(64);
  });

  it('generates unique refresh tokens', () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).not.toBe(t2);
  });

  it('generates unique client IDs', () => {
    const id1 = generateClientId();
    const id2 = generateClientId();
    expect(id1).not.toBe(id2);
  });

  it('hashes tokens deterministically', async () => {
    const token = 'test-token-123';
    const hash1 = await hashToken(token);
    const hash2 = await hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
  });

  it('produces different hashes for different tokens', async () => {
    const hash1 = await hashToken('token-a');
    const hash2 = await hashToken('token-b');
    expect(hash1).not.toBe(hash2);
  });

  describe('PKCE S256 verification', () => {
    it('verifies a valid code_verifier against its challenge', async () => {
      // Generate a code_verifier and compute its S256 challenge
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      // S256: base64url(sha256(verifier))
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      const digest = await crypto.subtle.digest('SHA-256', data);
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      expect(await verifyPkceChallenge(verifier, challenge)).toBe(true);
    });

    it('rejects an invalid code_verifier', async () => {
      expect(await verifyPkceChallenge('wrong-verifier', 'some-challenge')).toBe(false);
    });
  });
});
