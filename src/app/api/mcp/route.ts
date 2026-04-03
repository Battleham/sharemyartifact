import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyUser, getOAuthUser, hashPassword } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MCP_TOOLS } from '@/lib/mcp-tools';
import { extractTitle } from '@/lib/extract-title';
import { slugify, generateTimestampSlug } from '@/lib/slugify';
import { scanContent } from '@/lib/content-scanner';
import { computeExpiresAt } from '@/lib/ttl';
import type { User } from '@/types/database';

const ARTIFACT_URL = (process.env.NEXT_PUBLIC_ARTIFACT_URL ?? 'https://smya.pub').replace(/\/+$/, '');
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://sharemyartifact.com').replace(/\/+$/, '');
const PROTOCOL_VERSION = '2025-06-18';

const unauthorizedResponse = (id: unknown) => {
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: 'Authentication required' },
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer realm="${APP_URL}/api/mcp", resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`,
      },
    }
  );
};

const authenticateRequest = async (request: NextRequest) => {
  // Try OAuth token first, then API key
  return await getOAuthUser(request) ?? await getApiKeyUser(request);
};

// Generate a session ID (stateless — just a random identifier for protocol compliance)
const generateSessionId = (): string => {
  return crypto.randomUUID();
};

export const POST = async (request: NextRequest) => {
  console.log('[mcp] POST received');
  console.log('[mcp] Authorization header present:', !!request.headers.get('authorization'));

  const body = await request.json();
  const { method, params, id } = body;
  console.log('[mcp] method:', method);

  // Require auth for ALL requests — server requires OAuth
  const auth = await authenticateRequest(request);
  console.log('[mcp] Auth result:', auth ? `authenticated as ${auth.userId}` : 'not authenticated');

  if (!auth) {
    return unauthorizedResponse(id);
  }

  if (method === 'initialize') {
    const sessionId = generateSessionId();
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: 'sharemyartifact',
            version: '1.0.0',
          },
        },
      },
      {
        headers: {
          'Mcp-Session-Id': sessionId,
        },
      }
    );
  }

  if (method === 'notifications/initialized') {
    return new NextResponse(null, { status: 202 });
  }

  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOLS },
    });
  }

  if (method === 'tools/call') {
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

// GET — SSE stream for server-to-client messages (Streamable HTTP transport)
export const GET = async (request: NextRequest) => {
  console.log('[mcp] GET received');
  console.log('[mcp] Authorization header present:', !!request.headers.get('authorization'));
  const auth = await authenticateRequest(request);
  console.log('[mcp] GET auth result:', auth ? 'authenticated' : 'failed');
  if (!auth) {
    return new NextResponse(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Authentication required' },
    }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="${APP_URL}/api/mcp", resource_metadata="${APP_URL}/.well-known/oauth-protected-resource"`,
      },
    });
  }

  const sessionId = request.headers.get('mcp-session-id') || generateSessionId();

  // Return an SSE stream that stays open for server-initiated messages
  const stream = new ReadableStream({
    start(controller) {
      // Send an initial comment to establish the connection
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));
    },
    cancel() {
      // Client disconnected
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Mcp-Session-Id': sessionId,
    },
  });
};

// HEAD — return protocol version for discovery
export const HEAD = () => {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Mcp-Protocol-Version': PROTOCOL_VERSION,
    },
  });
};

// DELETE — session termination
export const DELETE = () => {
  return new NextResponse(null, { status: 200 });
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const generateShortCode = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
};

const uploadHtml = async (
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  user: User,
  html: string,
  args: Record<string, unknown>
) => {
  const fileSize = new Blob([html]).size;
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(fileSize / (1024 * 1024)).toFixed(2)}MB). Maximum is 5MB.`);
  }

  const scan = scanContent(html);
  if (!scan.safe) {
    throw new Error(`Content flagged: ${scan.flags.join(', ')}`);
  }

  const title = (args.title as string) || extractTitle(html) || 'Untitled Artifact';

  let slug = args.slug ? slugify(args.slug as string) : slugify(title);
  if (!slug) slug = generateTimestampSlug();

  const { data: existing } = await admin
    .from('artifacts')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .single();

  if (existing) {
    throw new Error(`An artifact with slug "${slug}" already exists. Use update_artifact to replace it, or provide a different slug.`);
  }

  const artifactId = crypto.randomUUID();
  const storagePath = `${userId}/${artifactId}.html`;

  const { error: storageError } = await admin.storage
    .from('artifacts')
    .upload(storagePath, html, { contentType: 'text/html', upsert: false });

  if (storageError) throw new Error(`Storage error: ${storageError.message}`);

  let passwordHash: string | null = null;
  const visibility = (args.visibility as string) || (args.password ? 'password_protected' : 'unlisted');
  if (args.password && visibility === 'password_protected') {
    passwordHash = await hashPassword(args.password as string);
  }

  const shortCode = generateShortCode();
  const expiresAt = computeExpiresAt((args.ttl as string) ?? '1d');

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
      file_size: fileSize,
      short_code: shortCode,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (dbError) {
    await admin.storage.from('artifacts').remove([storagePath]);
    throw new Error(`Database error: ${dbError.message}`);
  }

  const url = `${ARTIFACT_URL}/${user.username}/${slug}.html`;
  const shortUrl = `${ARTIFACT_URL}/${shortCode}`;
  const expiresLabel = expiresAt ? `expires: ${expiresAt}` : 'no expiration';
  return { artifact, url, short_url: shortUrl, message: `Artifact uploaded! View at: ${url} (short: ${shortUrl}) (${expiresLabel})` };
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
      return uploadHtml(admin, userId, user, html, args);
    }

    case 'upload_artifact_from_url': {
      const url = args.url as string;
      if (!url) throw new Error('url is required');

      const response = await fetch(url, {
        headers: { 'Accept': 'text/html, */*' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL (${response.status}): ${response.statusText}`);
      }

      const html = await response.text();
      if (!html.trim()) {
        throw new Error('Fetched URL returned empty content');
      }

      const sizeMB = (new Blob([html]).size / (1024 * 1024)).toFixed(2);
      const result = await uploadHtml(admin, userId, user, html, args);
      return { ...result, message: `${result.message} (fetched ${sizeMB}MB from URL)` };
    }

    case 'request_upload': {
      const existingSlug = args.existing_slug as string | undefined;

      // If updating an existing artifact, look it up and reuse its storage path
      let existingArtifact: { id: string; storage_path: string; slug: string } | null = null;
      if (existingSlug) {
        const { data } = await admin
          .from('artifacts')
          .select('id, storage_path, slug')
          .eq('user_id', userId)
          .eq('slug', existingSlug)
          .single();

        if (!data) throw new Error(`Artifact "${existingSlug}" not found. Cannot update.`);
        existingArtifact = data;
      }

      const artifactId = existingArtifact?.id ?? crypto.randomUUID();
      const storagePath = existingArtifact?.storage_path ?? `${userId}/${artifactId}.html`;

      // For new uploads, generate slug/title and validate uniqueness
      let slug: string;
      let title: string;
      if (existingArtifact) {
        slug = existingArtifact.slug;
        title = (args.title as string) || '';
      } else {
        title = (args.title as string) || (args.filename as string)?.replace(/\.html?$/i, '') || 'Untitled Artifact';
        slug = args.slug ? slugify(args.slug as string) : slugify(title);
        if (!slug) slug = generateTimestampSlug();

        const { data: slugConflict } = await admin
          .from('artifacts')
          .select('id')
          .eq('user_id', userId)
          .eq('slug', slug)
          .single();

        if (slugConflict) {
          throw new Error(`An artifact with slug "${slug}" already exists. Provide a different slug.`);
        }
      }

      // Create presigned upload URL (upsert for updates)
      const { data: signedData, error: signError } = existingArtifact
        ? await admin.storage.from('artifacts').createSignedUploadUrl(storagePath, { upsert: true })
        : await admin.storage.from('artifacts').createSignedUploadUrl(storagePath);

      if (signError || !signedData) {
        throw new Error(`Failed to create upload URL: ${signError?.message ?? 'unknown error'}`);
      }

      // Hash password if needed (only for new uploads)
      let passwordHash: string | null = null;
      const visibility = (args.visibility as string) || (args.password ? 'password_protected' : 'unlisted');
      if (!existingArtifact && args.password && visibility === 'password_protected') {
        passwordHash = await hashPassword(args.password as string);
      }

      // Store pending upload metadata
      const { error: pendingError } = await admin
        .from('pending_uploads')
        .insert({
          id: artifactId,
          user_id: userId,
          storage_path: storagePath,
          title: title || 'Untitled Artifact',
          slug,
          visibility,
          password_hash: passwordHash,
          ttl: (args.ttl as string) ?? '1d',
          is_update: !!existingArtifact,
        });

      if (pendingError) {
        throw new Error(`Failed to create pending upload: ${pendingError.message}`);
      }

      const mode = existingArtifact ? 'update' : 'new';
      return {
        upload_id: artifactId,
        upload_url: signedData.signedUrl,
        storage_path: storagePath,
        slug,
        mode,
        expires_in: '2 hours',
        instructions: `Upload your HTML file to the upload_url using: curl -X PUT "${signedData.signedUrl}" -H "Content-Type: text/html" --data-binary @yourfile.html — then call complete_upload with upload_id "${artifactId}"`,
      };
    }

    case 'complete_upload': {
      const uploadId = args.upload_id as string;
      if (!uploadId) throw new Error('upload_id is required');

      // Look up pending upload
      const { data: pending } = await admin
        .from('pending_uploads')
        .select('*')
        .eq('id', uploadId)
        .eq('user_id', userId)
        .single();

      if (!pending) {
        throw new Error('Upload not found or expired. Call request_upload to get a new URL.');
      }

      // Check expiration
      if (new Date(pending.expires_at) < new Date()) {
        await admin.from('pending_uploads').delete().eq('id', uploadId);
        throw new Error('Upload URL has expired. Call request_upload to get a new URL.');
      }

      // Verify the file was actually uploaded to storage
      const { data: fileData, error: downloadError } = await admin.storage
        .from('artifacts')
        .download(pending.storage_path);

      if (downloadError || !fileData) {
        throw new Error('File not found at upload URL. Make sure you uploaded the file before calling complete_upload.');
      }

      const html = await fileData.text();
      const fileSize = new Blob([html]).size;

      if (fileSize > MAX_FILE_SIZE) {
        await admin.storage.from('artifacts').remove([pending.storage_path]);
        await admin.from('pending_uploads').delete().eq('id', uploadId);
        throw new Error(`File too large (${(fileSize / (1024 * 1024)).toFixed(2)}MB). Maximum is 5MB.`);
      }

      // Content scanning
      const scan = scanContent(html);
      if (!scan.safe) {
        await admin.storage.from('artifacts').remove([pending.storage_path]);
        await admin.from('pending_uploads').delete().eq('id', uploadId);
        throw new Error(`Content flagged: ${scan.flags.join(', ')}`);
      }

      // Auto-extract title if the pending one is generic
      const finalTitle = (pending.title === 'Untitled Artifact')
        ? (extractTitle(html) || pending.title)
        : pending.title;

      if (pending.is_update) {
        // Update existing artifact's metadata
        const updates: Record<string, unknown> = {
          file_size: fileSize,
          updated_at: new Date().toISOString(),
        };
        if (finalTitle && finalTitle !== 'Untitled Artifact') updates.title = finalTitle;

        const { data: artifact, error: dbError } = await admin
          .from('artifacts')
          .update(updates)
          .eq('id', uploadId)
          .eq('user_id', userId)
          .select('*, short_code')
          .single();

        if (dbError) {
          throw new Error(`Database error: ${dbError.message}`);
        }

        // Clean up pending record
        await admin.from('pending_uploads').delete().eq('id', uploadId);

        const url = `${ARTIFACT_URL}/${user.username}/${pending.slug}.html`;
        const shortUrl = artifact.short_code ? `${ARTIFACT_URL}/${artifact.short_code}` : undefined;
        return {
          artifact,
          url,
          short_url: shortUrl,
          message: `Artifact content updated! View at: ${url}`,
        };
      }

      // Create new artifact record
      const shortCode = generateShortCode();
      const expiresAt = computeExpiresAt(pending.ttl ?? '1d');
      const { data: artifact, error: dbError } = await admin
        .from('artifacts')
        .insert({
          id: uploadId,
          user_id: userId,
          slug: pending.slug,
          title: finalTitle,
          visibility: pending.visibility,
          password_hash: pending.password_hash,
          storage_path: pending.storage_path,
          file_size: fileSize,
          short_code: shortCode,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Clean up pending record
      await admin.from('pending_uploads').delete().eq('id', uploadId);

      const url = `${ARTIFACT_URL}/${user.username}/${pending.slug}.html`;
      const shortUrl = `${ARTIFACT_URL}/${shortCode}`;
      const expiresLabel = expiresAt ? `expires: ${expiresAt}` : 'no expiration';
      return {
        artifact,
        url,
        short_url: shortUrl,
        message: `Artifact uploaded! View at: ${url} (short: ${shortUrl}) (${expiresLabel})`,
      };
    }

    case 'list_artifacts': {
      const { data: artifacts } = await admin
        .from('artifacts')
        .select('slug, title, visibility, view_count, short_code, expires_at, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      return (artifacts || []).map(a => ({
        ...a,
        url: `${ARTIFACT_URL}/${user.username}/${a.slug}.html`,
        short_url: a.short_code ? `${ARTIFACT_URL}/${a.short_code}` : undefined,
        expires_at: a.expires_at ?? null,
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

      if (args.title) updates.title = args.title;
      if (args.visibility) updates.visibility = args.visibility;
      if (args.new_slug) updates.slug = args.new_slug;

      if (args.ttl !== undefined) {
        updates.expires_at = computeExpiresAt((args.ttl as string) === 'indefinite' ? 'indefinite' : (args.ttl as string) ?? '1d');
      }

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
