import 'server-only';
import type { Tx } from './db';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface Actor {
  userId: string;
  officeId: string;
}

/** Appends to the audit log (insert-only for the app role; no update/delete privileges exist). */
export async function audit(tx: Tx, actor: Actor, e: AuditEntry): Promise<void> {
  await tx`
    insert into audit_logs (office_id, actor_id, action, entity_type, entity_id, summary, before, after, reason)
    values (${actor.officeId}, ${actor.userId}, ${e.action}, ${e.entityType}, ${e.entityId ?? null}, ${e.summary},
            ${e.before === undefined ? null : tx.json(e.before as never)}, ${e.after === undefined ? null : tx.json(e.after as never)},
            ${e.reason ?? null})`;
}
