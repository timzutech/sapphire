import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { withCtx } from '@/server/db';

/** Scheduled reminder generation for all offices. Call with `Authorization: Bearer $CRON_SECRET` (e.g. Vercel Cron). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const created = await withCtx(null, async (tx) => (await tx`select app.generate_reminders_all() as n`)[0].n as number);
  return NextResponse.json({ ok: true, notificationsCreated: created });
}
