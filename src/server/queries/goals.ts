import 'server-only';
import type { Tx } from '../db';

export interface GoalRow {
  id: string; scope: string; title: string; description: string | null; category: string; unit: string; target: number; current: number;
  startDate: string; endDate: string; progressMode: string; metric: string | null; metricParam: string | null; status: string;
  userId: string | null; userName: string | null; teamId: string | null; teamName: string | null; responsibleId: string | null; responsibleName: string | null;
}

/** For automatic goals the live value is computed from records (app.goal_metric_value); manual goals use the stored value. */
export async function listGoals(tx: Tx, officeId: string, opts: { userId?: string; teamId?: string | null; scope?: string; status?: string; visibleTo?: string } = {}): Promise<GoalRow[]> {
  const rows = await tx`
    select g.*, g.start_date::text as sd, g.end_date::text as ed, u.full_name as user_name, t.name as team_name, r.full_name as responsible_name,
      case when g.progress_mode = 'auto' then app.goal_metric_value(g.id) else g.current_value end as live_value
    from goals g left join users u on u.id = g.user_id left join teams t on t.id = g.team_id left join users r on r.id = g.responsible_user_id
    where g.office_id = ${officeId}
      ${opts.scope ? tx`and g.scope = ${opts.scope}` : tx``}
      ${opts.status ? tx`and g.status = ${opts.status}` : tx``}
      ${opts.visibleTo ? tx`and (g.scope = 'office' or g.user_id = ${opts.visibleTo} or (g.scope = 'team' and g.team_id is not distinct from ${opts.teamId ?? null}))` : tx``}
      ${opts.userId ? tx`and g.user_id = ${opts.userId}` : tx``}
    order by g.status = 'active' desc, g.end_date, g.title`;
  return rows.map((g) => ({
    id: g.id, scope: g.scope, title: g.title, description: g.description, category: g.category, unit: g.unit, target: Number(g.target_value),
    current: Number(g.live_value ?? g.current_value), startDate: g.sd, endDate: g.ed, progressMode: g.progress_mode, metric: g.metric, metricParam: g.metric_param,
    status: g.status, userId: g.user_id, userName: g.user_name, teamId: g.team_id, teamName: g.team_name, responsibleId: g.responsible_user_id, responsibleName: g.responsible_name,
  }));
}

export async function goalHistory(tx: Tx, goalIds: string[]) {
  if (!goalIds.length) return new Map<string, { at: Date; value: number; target: number }[]>();
  const rows = await tx`select goal_id, recorded_at, value, target_value from goal_progress where goal_id in ${tx(goalIds)} order by recorded_at`;
  const m = new Map<string, { at: Date; value: number; target: number }[]>();
  for (const r of rows) {
    const l = m.get(r.goal_id) ?? [];
    l.push({ at: r.recorded_at, value: Number(r.value), target: Number(r.target_value) });
    m.set(r.goal_id, l);
  }
  return m;
}
