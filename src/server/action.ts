import 'server-only';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { toUserMessage, UserError } from '@/lib/errors';
import { formToObject, issuesToFieldErrors } from '@/lib/validation/common';
import { getSession, type Session } from './auth';
import { withCtx, type Tx } from './db';

export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Changes on every response so clients can react to repeated identical results. */
  at: number;
  data?: Record<string, string>;
} | null;

interface RunOpts<S extends z.ZodType> {
  formData: FormData;
  schema?: S;
  admin?: boolean;
  revalidate?: string[];
}

/**
 * Standard server-action pipeline: session check → role check → Zod validation → RLS-scoped transaction → error mapping.
 * The database independently enforces the same permissions (RLS, triggers), so this is defence in depth.
 */
export async function runAction<S extends z.ZodType>(
  opts: RunOpts<S>,
  fn: (args: { tx: Tx; session: Session; data: z.infer<S>; formData: FormData }) => Promise<string | { message: string; data?: Record<string, string> } | void>,
): Promise<ActionState> {
  const at = Date.now();
  const session = await getSession();
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.', at };
  if (opts.admin && session.role !== 'admin') return { ok: false, error: 'Administrator access is required.', at };

  let data: z.infer<S> = {} as z.infer<S>;
  if (opts.schema) {
    const parsed = opts.schema.safeParse(formToObject(opts.formData));
    if (!parsed.success) {
      return { ok: false, error: 'Please correct the highlighted fields.', fieldErrors: issuesToFieldErrors(parsed.error.issues), at };
    }
    data = parsed.data;
  }
  try {
    const result = await withCtx({ userId: session.userId, officeId: session.officeId }, (tx) =>
      fn({ tx, session, data, formData: opts.formData }),
    );
    for (const p of opts.revalidate ?? []) revalidatePath(p, 'layout');
    if (typeof result === 'object' && result) return { ok: true, message: result.message, data: result.data, at };
    return { ok: true, message: result || 'Saved', at };
  } catch (err) {
    if (!(err instanceof UserError)) console.error('[action]', err);
    return {
      ok: false,
      error: toUserMessage(err),
      fieldErrors: err instanceof UserError ? err.fieldErrors : undefined,
      at,
    };
  }
}
