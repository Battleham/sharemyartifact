import { describe, it, expect } from 'vitest';
import { extractTitle } from '@/lib/extract-title';
import { slugify, generateTimestampSlug } from '@/lib/slugify';
import { scanContent } from '@/lib/content-scanner';

describe('Upload flow integration', () => {
  const sampleHtml = `<!DOCTYPE html>
<html>
<head><title>Q1 Sales Dashboard</title></head>
<body>
  <h1>Q1 Sales Dashboard</h1>
  <script>
    fetch('https://api.example.com/sales')
      .then(r => r.json())
      .then(data => console.log(data));
  </script>
</body>
</html>`;

  it('processes a valid HTML artifact end-to-end', () => {
    const scan = scanContent(sampleHtml);
    expect(scan.safe).toBe(true);

    const title = extractTitle(sampleHtml);
    expect(title).toBe('Q1 Sales Dashboard');

    const slug = slugify(title!);
    expect(slug).toBe('q1-sales-dashboard');
  });

  it('rejects malicious content at the pipeline level', () => {
    const malicious = '<script src="https://coinhive.com/lib/coinhive.min.js"></script>';
    const scan = scanContent(malicious);
    expect(scan.safe).toBe(false);
    expect(scan.flags).toContain('crypto_miner');
  });

  it('handles HTML with no title gracefully', () => {
    const noTitle = '<html><body><p>Hello world</p></body></html>';
    const title = extractTitle(noTitle);
    expect(title).toBeNull();

    const slug = slugify('') || generateTimestampSlug();
    expect(slug).toMatch(/^artifact-\d+$/);
  });

  it('allows fetch and XHR in artifacts (no false positives)', () => {
    const fetchHtml = `<script>
      fetch('https://api.example.com/data').then(r => r.json());
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://api.example.com/other');
    </script>`;
    const scan = scanContent(fetchHtml);
    expect(scan.safe).toBe(true);
  });

  it('extracts title from h1 when no title tag', () => {
    const html = '<html><body><h1>My Dashboard</h1></body></html>';
    const title = extractTitle(html);
    expect(title).toBe('My Dashboard');
    expect(slugify(title!)).toBe('my-dashboard');
  });
});
