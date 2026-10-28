import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { withCtx } from './db';

export const SESSION_COOKIE = 'oh_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = 'admin' | 'member';

export interface Session {
  userId: string;
  officeId: string;
  email: string;
  fullName: string;
  role: Role;
  isSuper: boolean;
  mustChangePassword: boolean;
  office: { id: string; name: string; timezone: string; currency: string; locale: string; isDemo: boolean };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieSecure(): boolean {
  if (process.env.SESSION_COOKIE_SECURE) return process.env.SESSION_COOKIE_SECURE !== 'false';
  return process.env.NODE_ENV === 'production';
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'local').trim();
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const ip = await clientIp();
  const ua = (await headers()).get('user-agent') ?? '';
  const emailKey = `login:email:${email.trim().toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;
  const token = randomBytes(32).toString('base64url');
  const result = await withCtx(null, async (tx) => {
    const [{ ip_ok }] = await tx`select app.auth_rate_check(${ipKey}, 30, 900) as ip_ok`;
    const [{ email_ok }] = await tx`select app.auth_rate_check(${emailKey}, 8, 900) as email_ok`;
    if (!ip_ok || !email_ok) return 'rate_limited' as const;
    const [{ user_id }] = await tx`select app.auth_login(${email}, ${password}, ${hashToken(token)}, ${SESSION_TTL_SECONDS}, ${ua}) as user_id`;
    if (!user_id) return 'invalid' as const;
    await tx`select app.auth_clear_attempts(${emailKey})`;
    return 'ok' as const;
  });
  if (result === 'rate_limited') return { ok: false, error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' };
  if (result === 'invalid') return { ok: false, error: 'Incorrect email or password, or the account is inactive.' };
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await withCtx(null, (tx) => tx`select app.auth_logout(${hashToken(token)})`);
  jar.delete(SESSION_COOKIE);
}

export async function currentTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Validates the session cookie against the database. Cached for the duration of one request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const tokenHash = await currentTokenHash();
  if (!tokenHash) return null;
  return withCtx(null, async (tx) => {
    const [s] = await tx`select * from app.auth_session(${tokenHash})`;
    if (!s || !s.office_id || !s.role) return null;
    // Office metadata is read under the user's own RLS context.
    await tx`select set_config('app.user_id', ${s.user_id}, true), set_config('app.office_id', ${s.office_id}, true)`;
    const [o] = await tx`select id, name, timezone, currency, locale, is_demo from offices where id = ${s.office_id}`;
    if (!o) return null;
    return {
      userId: s.user_id,
      officeId: s.office_id,
      email: s.email,
      fullName: s.full_name,
      role: s.role as Role,
      isSuper: s.is_super_admin,
      mustChangePassword: s.must_change_password,
      office: { id: o.id, name: o.name, timezone: o.timezone, currency: o.currency, locale: o.locale, isDemo: o.is_demo },
    };
  });
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== 'admin') redirect('/dashboard?denied=1');
  return s;
}

export async function requireSuper(): Promise<Session> {
  const s = await requireSession();
  if (!s.isSuper) redirect('/dashboard?denied=1');
  return s;
}

export function ctxOf(s: Session) {
  return { userId: s.userId, officeId: s.officeId };
}
