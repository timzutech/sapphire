import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { withCtx } from '@/server/db';

/** Serves a stored receipt. RLS limits access to the uploader and office administrators. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const file = await withCtx({ userId: session.userId, officeId: session.officeId }, async (tx) => {
    const [a] = await tx`select filename, mime_type, data from attachments where id = ${id}`;
    return a;
  });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': `inline; filename="${String(file.filename).replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, no-store',
    },
  });
}
