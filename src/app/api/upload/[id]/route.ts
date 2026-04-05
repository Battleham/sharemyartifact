import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const PUT = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: uploadId } = await params;

  if (!uploadId) {
    return NextResponse.json({ error: 'Upload ID required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the pending upload
  const { data: pending, error: lookupError } = await admin
    .from('pending_uploads')
    .select('*')
    .eq('id', uploadId)
    .single();

  if (lookupError || !pending) {
    return NextResponse.json(
      { error: 'Upload not found or expired. Call request_upload to get a new URL.' },
      { status: 404 }
    );
  }

  // Check expiration
  if (new Date(pending.expires_at) < new Date()) {
    await admin.from('pending_uploads').delete().eq('id', uploadId);
    return NextResponse.json(
      { error: 'Upload URL has expired. Call request_upload to get a new URL.' },
      { status: 410 }
    );
  }

  // Read the HTML body
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('text/html')) {
    return NextResponse.json(
      { error: 'Content-Type must be text/html' },
      { status: 415 }
    );
  }

  const html = await request.text();
  if (!html.trim()) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const fileSize = new Blob([html]).size;
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large (${(fileSize / (1024 * 1024)).toFixed(2)}MB). Maximum is 5MB.` },
      { status: 413 }
    );
  }

  // Write to Supabase storage
  const { error: storageError } = await admin.storage
    .from('artifacts')
    .upload(pending.storage_path, html, {
      contentType: 'text/html',
      upsert: pending.is_update ?? false,
    });

  if (storageError) {
    console.error('[upload] Storage error:', storageError.message);
    return NextResponse.json(
      { error: `Storage error: ${storageError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, upload_id: uploadId });
};
