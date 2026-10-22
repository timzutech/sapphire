import 'server-only';
import type { Tx } from '../db';

export interface ProspectFilters {
  officeId: string;
  ownerId?: string | null; // undefined = any, null = unassigned pool
  view?: string; // active | followups | converted | archived | shared | neglected
  stage?: string;
  q?: string;
  sort?: string;
  today: string;
  limit: number;
  offset: number;
  mineOnlyFor?: string; // member view: owner = me
}

export async function listProspects(tx: Tx, f: ProspectFilters) {
  const q = f.q ? `%${f.q.replace(/[%_]/g, '')}%` : null;
  const where = tx`p.office_id = ${f.officeId}
    ${f.mineOnlyFor && f.view !== 'shared' ? tx`and p.owner_id = ${f.mineOnlyFor}` : tx``}
    ${f.view === 'shared' ? tx`and p.visibility = 'office' and p.archived_at is null` : tx``}
    ${f.ownerId === null ? tx`and p.owner_id is null` : f.ownerId ? tx`and p.owner_id = ${f.ownerId}` : tx``}
    ${f.view === 'archived' ? tx`and p.archived_at is not null` : tx`and p.archived_at is null`}
    ${f.view === 'followups' ? tx`and p.next_follow_up <= ${f.today} and p.stage not in ('converted','not_interested')` : tx``}
    ${f.view === 'converted' ? tx`and p.stage = 'converted'` : tx``}
    ${f.view === 'neglected' ? tx`and p.stage not in ('converted','not_interested') and (p.next_follow_up < ${f.today} or coalesce(p.last_contact_on, (p.created_at)::date) < ${f.today}::date - 14)` : tx``}
    ${f.view === 'active' || !f.view ? tx`and p.stage not in ('converted','not_interested')` : tx``}
    ${f.stage ? tx`and p.stage = ${f.stage}` : tx``}
    ${q ? tx`and (p.name ilike ${q} or p.phone ilike ${q} or p.email ilike ${q} or p.source ilike ${q})` : tx``}`;
  const order = {
    followup: tx`p.next_follow_up asc nulls last, p.name`,
    recent: tx`p.created_at desc`,
    contact: tx`p.last_contact_on desc nulls last`,
    value: tx`p.estimated_value desc nulls last`,
    name: tx`p.name`,
  }[f.sort ?? 'followup'] ?? tx`p.next_follow_up asc nulls last, p.name`;
  const [{ total }] = await tx`select count(*)::int as total from prospects p where ${where}`;
  const rows = await tx`select p.*, p.next_follow_up::text as nf, p.last_contact_on::text as lc, u.full_name as owner_name,
      (select count(*)::int from prospect_interactions i where i.prospect_id = p.id) as interactions
    from prospects p left join users u on u.id = p.owner_id where ${where} order by ${order} limit ${f.limit} offset ${f.offset}`;
  return { total: total as number, rows };
}

export async function prospectSummary(tx: Tx, officeId: string, today: string, ownerId?: string) {
  const [r] = await tx`select
      count(*) filter (where archived_at is null and stage not in ('converted','not_interested'))::int as active,
      count(*) filter (where archived_at is null and next_follow_up <= ${today} and stage not in ('converted','not_interested'))::int as due,
      count(*) filter (where stage = 'converted')::int as converted,
      count(*) filter (where archived_at is null or stage = 'converted')::int as total,
      coalesce(sum(estimated_value) filter (where archived_at is null and stage not in ('converted','not_interested')), 0) as pipeline
    from prospects where office_id = ${officeId} ${ownerId ? tx`and owner_id = ${ownerId}` : tx``}`;
  return { ...r, conversionRate: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : null } as {
    active: number; due: number; converted: number; total: number; pipeline: string; conversionRate: number | null;
  };
}

export async function stageCounts(tx: Tx, officeId: string, ownerId?: string) {
  return tx`select stage, count(*)::int as n from prospects where office_id = ${officeId} and archived_at is null
    ${ownerId ? tx`and owner_id = ${ownerId}` : tx``} group by stage`;
}
