import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getApiKeyUser, hashPassword } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/slugify';
import { scanContent } from '@/lib/content-scanner';
import type { UpdateArtifactRequest } from '@/types/api';

const ARTIFACT_URL = process.env.NEXT_PUBLIC_ARTIFACT_URL ?? 'https://smya.pub';

// GET /api/artifacts/:slug — get artifact metadata
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const { slug } = await params;
  const auth = await getAuthenticatedUser() ?? await getApiKeyUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: artifact, error } = await admin
    .from('artifacts')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('slug', slug)
    .single();

  if (error || !artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  return NextResponse.json({
    ...artifact,
    url: `${ARTIFACT_URL}/${auth.user.username}/${artifact.slug}.html`,
  });
};

// PUT /api/artifacts/:slug — update artifact
export const PUT = async (
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const { slug } = await params;
  const auth = await getAuthenticatedUser() ?? await getApiKeyUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UpdateArtifactRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: artifact, error: fetchError } = await admin
    .from('artifacts')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('slug', slug)
    .single();

  if (fetchError || !artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  // Update HTML if provided
  if (body.html) {
    const scan = scanContent(body.html);
    if (!scan.safe) {
      return NextResponse.json(
        { error: 'Content blocked', details: `Flagged: ${scan.flags.join(', ')}` },
        { status: 422 }
      );
    }

    const { error: uploadError } = await admin.storage
      .from('artifacts')
      .update(artifact.storage_path, body.html, {
        contentType: 'text/html',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
    }
  }

  // Build update object
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.title) updates.title = body.title;
  if (body.visibility) updates.visibility = body.visibility;
  if (body.html) updates.file_size = new Blob([body.html]).size;

  if (body.slug) {
    const newSlug = slugify(body.slug);
    if (newSlug && newSlug !== slug) {
      // Check for conflict
      const { data: conflict } = await admin
        .from('artifacts')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('slug', newSlug)
        .single();

      if (conflict) {
        return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
      }
      updates.slug = newSlug;
    }
  }

  if (body.password !== undefined) {
    if (body.password === null) {
      updates.password_hash = null;
      if (!body.visibility) updates.visibility = 'unlisted';
    } else {
      updates.password_hash = await hashPassword(body.password);
      if (!body.visibility) updates.visibility = 'password_protected';
    }
  }

  const { data: updated, error: updateError } = await admin
    .from('artifacts')
    .update(updates)
    .eq('id', artifact.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update artifact' }, { status: 500 });
  }

  const finalSlug = (updates.slug as string) ?? slug;
  return NextResponse.json({
    ...updated,
    url: `${ARTIFACT_URL}/${auth.user.username}/${finalSlug}.html`,
  });
};

// DELETE /api/artifacts/:slug — delete artifact
export const DELETE = async (
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const { slug } = await params;
  const auth = await getAuthenticatedUser() ?? await getApiKeyUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: artifact } = await admin
    .from('artifacts')
    .select('id, storage_path')
    .eq('user_id', auth.userId)
    .eq('slug', slug)
    .single();

  if (!artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  // Delete from storage
  await admin.storage.from('artifacts').remove([artifact.storage_path]);

  // Delete from database
  const { error } = await admin
    .from('artifacts')
    .delete()
    .eq('id', artifact.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to delete artifact' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
};
