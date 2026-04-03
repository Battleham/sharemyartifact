import { describe, it, expect } from 'vitest';
import { slugify, generateTimestampSlug, disambiguateSlug } from '../slugify';

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

describe('disambiguateSlug', () => {
  it('returns the base slug when no conflict exists', async () => {
    const check = async (_slug: string) => false; // no conflicts
    const result = await disambiguateSlug('my-dashboard', check);
    expect(result).toBe('my-dashboard');
  });

  it('appends -2 when base slug is taken', async () => {
    const taken = new Set(['my-dashboard']);
    const check = async (slug: string) => taken.has(slug);
    const result = await disambiguateSlug('my-dashboard', check);
    expect(result).toBe('my-dashboard-2');
  });

  it('increments until finding an available slug', async () => {
    const taken = new Set(['report', 'report-2', 'report-3']);
    const check = async (slug: string) => taken.has(slug);
    const result = await disambiguateSlug('report', check);
    expect(result).toBe('report-4');
  });

  it('gives up after 100 attempts and falls back to timestamp slug', async () => {
    const check = async (_slug: string) => true; // everything taken
    const result = await disambiguateSlug('popular', check);
    expect(result).toMatch(/^artifact-\d+$/);
  });
});
