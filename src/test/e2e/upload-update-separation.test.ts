import { describe, it, expect } from 'vitest';
import { MCP_TOOLS } from '@/lib/mcp-tools';
import { disambiguateSlug } from '@/lib/slugify';

describe('Upload/Update tool separation', () => {
  describe('MCP tool definitions', () => {
    it('request_upload does not have existing_slug parameter', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_upload');
      expect(tool).toBeDefined();
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).not.toHaveProperty('existing_slug');
    });

    it('request_upload description says it always creates new artifacts', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_upload');
      expect(tool!.description).toContain('always creates a new artifact');
      expect(tool!.description).toContain('never overwrites');
    });

    it('request_content_update exists with required slug', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_content_update');
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.required).toContain('slug');
    });

    it('request_content_update description emphasizes explicit user intent', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_content_update');
      expect(tool!.description).toContain('ONLY use this when the user has explicitly asked');
    });

    it('request_content_update does not accept visibility or password', () => {
      const tool = MCP_TOOLS.find(t => t.name === 'request_content_update');
      const props = tool!.inputSchema.properties as Record<string, unknown>;
      expect(props).not.toHaveProperty('visibility');
      expect(props).not.toHaveProperty('password');
    });
  });

  describe('Slug disambiguation in upload flow', () => {
    it('creates unique slugs when base slug is taken', async () => {
      const existingSlugs = new Set(['my-dashboard']);
      const check = async (slug: string) => existingSlugs.has(slug);
      const slug = await disambiguateSlug('my-dashboard', check);
      expect(slug).toBe('my-dashboard-2');
    });

    it('uses base slug when no conflict', async () => {
      const check = async (_slug: string) => false;
      const slug = await disambiguateSlug('my-dashboard', check);
      expect(slug).toBe('my-dashboard');
    });
  });
});
