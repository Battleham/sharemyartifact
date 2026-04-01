import { describe, it, expect } from 'vitest';
import { slugify, generateTimestampSlug } from '../slugify';

describe('slugify', () => {
  it('converts title to URL-safe slug', () => {
    expect(slugify('My Cool Dashboard')).toBe('my-cool-dashboard');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World! (v2)')).toBe('hello-world-v2');
  });

  it('collapses multiple dashes', () => {
    expect(slugify('too---many---dashes')).toBe('too-many-dashes');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('--trimmed--')).toBe('trimmed');
  });

  it('handles unicode by removing it', () => {
    expect(slugify('café dashboard')).toBe('caf-dashboard');
  });

  it('truncates to max length', () => {
    const long = 'a'.repeat(150);
    expect(slugify(long).length).toBeLessThanOrEqual(100);
  });
});

describe('generateTimestampSlug', () => {
  it('generates a slug from timestamp', () => {
    const slug = generateTimestampSlug();
    expect(slug).toMatch(/^artifact-\d+$/);
  });
});
