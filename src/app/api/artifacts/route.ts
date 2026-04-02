import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getApiKeyUser, hashPassword } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTitle } from '@/lib/extract-title';
import { slugify, generateTimestampSlug } from '@/lib/slugify';
import { scanContent } from '@/lib/content-scanner';
import type { UploadArtifactRequest, UploadArtifactResponse } from '@/types/api';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL ?? 'https://smya.pub';

// POST /api/artifacts — upload artifact
export const POST = async (request: NextRequest) => {
  const auth = await getAuthenticatedUser() ?? await getApiKeyUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UploadArtifactRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.html || typeof body.html !== 'string') {
    return NextResponse.json({ error: 'html field is required' }, { status: 400 });
  }

  // Content scanning
  const scan = scanContent(body.html);
  if (!scan.safe) {
    return NextResponse.json(
      { error: 'Content blocked', details: `Flagged: ${scan.flags.join(', ')}` },
      { status: 422 }
    );
  }

  // Auto-extract title
  const title = body.title || extractTitle(body.html) || 'Untitled Artifact';

  // Generate slug
  let slug = body.slug ? slugify(body.slug) : slugify(title);
  if (!slug) slug = generateTimestampSlug();

  const admin = createAdminClient();

  // Check for slug conflict
  const { data: existing } = await admin
    .from('artifacts')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('slug', slug)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'Slug already exists', details: `An artifact with slug "${slug}" already exists. Choose a different slug or update the existing artifact.` },
      { status: 409 }
    );
  }

  // Upload to storage
  const artifactId = crypto.randomUUID();
  const storagePath = `${auth.userId}/${artifactId}.html`;

  const { error: uploadError } = await admin.storage
    .from('artifacts')
    .upload(storagePath, body.html, {
      contentType: 'text/html',
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload file', details: uploadError.message }, { status: 500 });
  }

  // Hash password if provided
  let passwordHash: string | null = null;
  const visibility = body.visibility ?? 'unlisted';
  if (body.password && visibility === 'password_protected') {
    passwordHash = await hashPassword(body.password);
  }

  // Insert artifact record
  const { data: artifact, error: insertError } = await admin
    .from('artifacts')
    .insert({
      id: artifactId,
      user_id: auth.userId,
      slug,
      title,
      visibility,
      password_hash: passwordHash,
      storage_path: storagePath,
      file_size: new Blob([body.html]).size,
    })
    .select()
    .single();

  if (insertError) {
    // Clean up uploaded file
    await admin.storage.from('artifacts').remove([storagePath]);
    return NextResponse.json({ error: 'Failed to create artifact', details: insertError.message }, { status: 500 });
  }

  const url = `${ARTIFACT_URL}/${auth.user.username}/${slug}.html`;
  const response: UploadArtifactResponse = { artifact, url };
  return NextResponse.json(response, { status: 201 });
};

// GET /api/artifacts — list user's artifacts
export const GET = async (request: NextRequest) => {
  const auth = await getAuthenticatedUser() ?? await getApiKeyUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: artifacts, error } = await admin
    .from('artifacts')
    .select('id, slug, title, visibility, view_count, short_code, created_at, updated_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch artifacts' }, { status: 500 });
  }

  const items = artifacts.map(({ short_code, ...a }) => ({
    ...a,
    url: `${ARTIFACT_URL}/${auth.user.username}/${a.slug}.html`,
    short_url: short_code ? `${ARTIFACT_URL}/${short_code}` : undefined,
  }));

  return NextResponse.json({ artifacts: items });
};
