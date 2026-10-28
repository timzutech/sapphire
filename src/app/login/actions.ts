'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { email, issuesToFieldErrors, formToObject } from '@/lib/validation/common';
import type { ActionState } from '@/server/action';
import { login } from '@/server/auth';

const schema = z.object({ email: email(), password: z.string().min(1, 'Password is required'), next: z.string().optional() });

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: 'Please correct the highlighted fields.', fieldErrors: issuesToFieldErrors(parsed.error.issues), at: Date.now() };
  const r = await login(parsed.data.email, parsed.data.password);
  if (!r.ok) return { ok: false, error: r.error, at: Date.now() };
  const next = parsed.data.next && /^\/[a-z]/.test(parsed.data.next) && !parsed.data.next.startsWith('//') ? parsed.data.next : '/';
  redirect(next);
}
