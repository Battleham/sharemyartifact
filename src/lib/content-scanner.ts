const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const CRYPTO_MINER_PATTERNS = [
  /coinhive/i,
  /cryptoloot/i,
  /coin-hive/i,
  /jsecoin/i,
  /cryptonight/i,
  /minero\.cc/i,
  /webminepool/i,
];

const PHISHING_PATTERNS = [
  /<form[^>]*action\s*=\s*["'][^"']*(?:steal|phish|harvest|capture)/i,
  /password.*(?:google|facebook|apple|microsoft|amazon|paypal).*(?:login|sign.?in)/is,
];

interface ScanResult {
  safe: boolean;
  flags: string[];
}

export const scanContent = (html: string, fileSize?: number): ScanResult => {
  const flags: string[] = [];
  const size = fileSize ?? new Blob([html]).size;

  if (size > MAX_FILE_SIZE) {
    flags.push('file_too_large');
  }

  for (const pattern of CRYPTO_MINER_PATTERNS) {
    if (pattern.test(html)) {
      flags.push('crypto_miner');
      break;
    }
  }

  for (const pattern of PHISHING_PATTERNS) {
    if (pattern.test(html)) {
      flags.push('phishing_pattern');
      break;
    }
  }

  // Large base64 blobs (>100KB) may indicate obfuscated payloads
  const base64Matches = html.match(/base64,[A-Za-z0-9+/=]{100000,}/g);
  if (base64Matches) {
    flags.push('suspicious_base64');
  }

  return {
    safe: flags.length === 0,
    flags,
  };
};
