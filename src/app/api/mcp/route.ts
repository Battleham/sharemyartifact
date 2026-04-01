import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyUser, hashPassword } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MCP_TOOLS } from '@/lib/mcp-tools';
import { extractTitle } from '@/lib/extract-title';
import { slugify, generateTimestampSlug } from '@/lib/slugify';
import { scanContent } from '@/lib/content-scanner';
import type { User } from '@/types/database';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL ?? 'https://smya.pub';

export const POST = async (request: NextRequest) => {
  const body = await request.json();
  const { method, params, id } = body;

  // Handle MCP protocol methods
  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'sharemyartifact',
          version: '1.0.0',
        },
      },
    });
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  if (method === 'tools/call') {
    // Authenticate via API key
    const auth = await getApiKeyUser(request);
    if (!auth) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: 'Missing or invalid API key in Authorization header' },
      });
    }

    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      const result = await handleToolCall(auth.userId, auth.user, toolName, args);
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      });
    } catch (err) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        },
      });
    }
  }

  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  });
};

const handleToolCall = async (
  userId: string,
  user: User,
  toolName: string,
  args: Record<string, unknown>
) => {
  const admin = createAdminClient();

  switch (toolName) {
    case 'upload_artifact': {
      const html = args.html as string;
      if (!html) throw new Error('html is required');

      // Content scanning
      const scan = scanContent(html);
      if (!scan.safe) {
        throw new Error(`Content flagged: ${scan.flags.join(', ')}`);
      }

      // Auto-extract title
      const title = (args.title as string) || extractTitle(html) || 'Untitled Artifact';

      // Generate slug
      let slug = args.slug ? slugify(args.slug as string) : slugify(title);
      if (!slug) slug = generateTimestampSlug();

      // Check for slug conflict
      const { data: existing } = await admin
        .from('artifacts')
        .select('id')
        .eq('user_id', userId)
        .eq('slug', slug)
        .single();

      if (existing) {
        throw new Error(`An artifact with slug "${slug}" already exists. Use update_artifact to replace it, or provide a different slug.`);
      }

      // Upload to storage
      const artifactId = crypto.randomUUID();
      const storagePath = `${userId}/${artifactId}.html`;

      const { error: storageError } = await admin.storage
        .from('artifacts')
        .upload(storagePath, html, { contentType: 'text/html', upsert: false });

      if (storageError) throw new Error(`Storage error: ${storageError.message}`);

      // Hash password if provided
      let passwordHash: string | null = null;
      const visibility = (args.visibility as string) || (args.password ? 'password_protected' : 'unlisted');
      if (args.password && visibility === 'password_protected') {
        passwordHash = await hashPassword(args.password as string);
      }

      const { data: artifact, error: dbError } = await admin
        .from('artifacts')
        .insert({
          id: artifactId,
          user_id: userId,
          slug,
          title,
          visibility,
          password_hash: passwordHash,
          storage_path: storagePath,
          file_size: new Blob([html]).size,
        })
        .select()
        .single();

      if (dbError) {
        await admin.storage.from('artifacts').remove([storagePath]);
        throw new Error(`Database error: ${dbError.message}`);
      }

      const url = `${ARTIFACT_URL}/${user.username}/${slug}.html`;
      return { artifact, url, message: `Artifact uploaded successfully! View at: ${url}` };
    }

    case 'list_artifacts': {
      const { data: artifacts } = await admin
        .from('artifacts')
        .select('slug, title, visibility, view_count, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      return (artifacts || []).map(a => ({
        ...a,
        url: `${ARTIFACT_URL}/${user.username}/${a.slug}.html`,
      }));
    }

    case 'update_artifact': {
      const slug = args.slug as string;
      if (!slug) throw new Error('slug is required');

      const { data: existing } = await admin
        .from('artifacts')
        .select('*')
        .eq('user_id', userId)
        .eq('slug', slug)
        .single();

      if (!existing) throw new Error(`Artifact "${slug}" not found`);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (args.html) {
        const scan = scanContent(args.html as string);
        if (!scan.safe) {
          throw new Error(`Content flagged: ${scan.flags.join(', ')}`);
        }
        await admin.storage
          .from('artifacts')
          .update(existing.storage_path, args.html as string, { contentType: 'text/html' });
        updates.file_size = new Blob([args.html as string]).size;
      }

      if (args.title) updates.title = args.title;
      if (args.visibility) updates.visibility = args.visibility;
      if (args.new_slug) updates.slug = args.new_slug;

      if (args.password) {
        updates.password_hash = await hashPassword(args.password as string);
        if (!args.visibility) updates.visibility = 'password_protected';
      }

      const { data: updated } = await admin
        .from('artifacts')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();

      const finalSlug = (args.new_slug as string) || slug;
      const url = `${ARTIFACT_URL}/${user.username}/${finalSlug}.html`;
      return { artifact: updated, url, message: `Artifact updated! View at: ${url}` };
    }

    case 'delete_artifact': {
      const slug = args.slug as string;
      if (!slug) throw new Error('slug is required');

      const { data: artifact } = await admin
        .from('artifacts')
        .select('id, storage_path')
        .eq('user_id', userId)
        .eq('slug', slug)
        .single();

      if (!artifact) throw new Error(`Artifact "${slug}" not found`);

      await admin.storage.from('artifacts').remove([artifact.storage_path]);
      await admin.from('artifacts').delete().eq('id', artifact.id);

      return { message: `Artifact "${slug}" deleted successfully.` };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
