import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const GET = async (request: NextRequest) => {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch expired artifacts (batch of 100)
  const { data: expired, error } = await admin
    .from('artifacts')
    .select('id, storage_path')
    .not('expires_at', 'is', null)
    .lt('expires_at', new Date().toISOString())
    .limit(100);

  if (error || !expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  // Delete storage files
  const storagePaths = expired.map(a => a.storage_path);
  await admin.storage.from('artifacts').remove(storagePaths);

  // Delete DB rows
  const ids = expired.map(a => a.id);
  await admin
    .from('artifacts')
    .delete()
    .in('id', ids);

  // Also clean up any expired pending uploads while we're at it
  await admin
    .from('pending_uploads')
    .delete()
    .lt('expires_at', new Date().toISOString());

  return NextResponse.json({ deleted: expired.length });
};
