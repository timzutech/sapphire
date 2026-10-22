import 'server-only';
import { requireAdmin, requireSession, type Session } from './auth';
import { withCtx, type Tx } from './db';

export interface PageCtx {
  session: Session;
  fmt: { currency: string; locale: string; timezone: string };
  load: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

function build(session: Session): PageCtx {
  return {
    session,
    fmt: { currency: session.office.currency, locale: session.office.locale, timezone: session.office.timezone },
    load: (fn) => withCtx({ userId: session.userId, officeId: session.officeId }, fn),
  };
}

export async function memberPage(): Promise<PageCtx> {
  return build(await requireSession());
}

export async function adminPage(): Promise<PageCtx> {
  return build(await requireAdmin());
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
