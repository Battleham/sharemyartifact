import { describe, it, expect } from 'vitest';
import { extractTitle } from '../extract-title';

describe('extractTitle', () => {
  it('extracts title from <title> tag', () => {
    const html = '<html><head><title>My Dashboard</title></head><body></body></html>';
    expect(extractTitle(html)).toBe('My Dashboard');
  });

  it('falls back to first <h1> when no title tag', () => {
    const html = '<html><body><h1>Dashboard Overview</h1></body></html>';
    expect(extractTitle(html)).toBe('Dashboard Overview');
  });

  it('falls back to first <h1> when title is empty', () => {
    const html = '<html><head><title></title></head><body><h1>Fallback</h1></body></html>';
    expect(extractTitle(html)).toBe('Fallback');
  });

  it('returns null when no title or h1', () => {
    const html = '<html><body><p>Just a paragraph</p></body></html>';
    expect(extractTitle(html)).toBeNull();
  });

  it('trims whitespace from extracted title', () => {
    const html = '<html><head><title>  Spaced Out  </title></head></html>';
    expect(extractTitle(html)).toBe('Spaced Out');
  });

  it('handles multiline title tags', () => {
    const html = '<html><head><title>\n  Multi\n  Line\n</title></head></html>';
    expect(extractTitle(html)).toBe('Multi Line');
  });
});
