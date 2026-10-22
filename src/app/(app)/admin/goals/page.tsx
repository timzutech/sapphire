import { Plus, RefreshCw, Target } from 'lucide-react';
import { GoalFields } from '@/components/forms/goal-forms';
import { GoalSummary } from '@/components/goal-card';
import { ActionButton } from '@/components/ui/action-button';
import { Card, CardBody } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect } from '@/components/ui/filters';
import { Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState, MetricNote, PageHeader } from '@/components/ui/misc';
import { str } from '@/components/ui/nav';
import { endOfMonth, startOfMonth } from '@/lib/dates';
import { recordGoalProgressAction, saveGoalAction, setGoalStatusAction, syncGoalsAction } from '@/server/actions/goals';
import { adminPage, type SearchParams } from '@/server/page';
import { memberOptions, officeNow, teamOptions } from '@/server/queries/common';
import { listGoals } from '@/server/queries/goals';

export const metadata = { title: 'Goals' };

export default async function AdminGoals({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const goals = await listGoals(tx, session.officeId, { scope: str(sp, 'scope'), status: str(sp, 'status') ?? 'active' });
    const members = (await memberOptions(tx, session.officeId)).map((m) => ({ value: m.value, label: m.label }));
    const teams = await teamOptions(tx, session.officeId);
    const levels = (await tx`select id, name, rank from levels where office_id = ${session.officeId} order by rank`).map((l) => ({ value: l.id as string, label: `${l.name} (rank ${l.rank})` }));
    const challenges = (await tx`select id, name from challenges where office_id = ${session.officeId} order by start_date desc`).map((c) => ({ value: c.id as string, label: c.name as string }));
    return { today, goals, members, teams, levels, challenges };
  });
  const opts = { members: d.members, teams: d.teams, levels: d.levels, challenges: d.challenges, start: startOfMonth(d.today), end: endOfMonth(d.today) };
  return (
    <>
      <PageHeader title="Office goals & targets" description="Monthly, quarterly or annual goals for the office, teams and individuals. Progress can be manual or calculated from records."
        actions={<>
          <ActionButton action={syncGoalsAction} fields={{}} size="md"><RefreshCw className="size-4" />Recalculate & snapshot</ActionButton>
          <FormDialog action={saveGoalAction} title="New goal" trigger={<><Plus className="size-4" />New goal</>} size="lg" submitLabel="Create goal"><GoalFields {...opts} /></FormDialog>
        </>} />
      <FilterBar className="mb-4">
        <FilterSelect name="scope" label="Scope" defaultValue={str(sp, 'scope')} options={[{ value: 'office', label: 'Office' }, { value: 'team', label: 'Team' }, { value: 'individual', label: 'Individual' }]} />
        <FilterSelect name="status" label="Status" defaultValue={str(sp, 'status') ?? 'active'} allLabel="" options={[{ value: 'active', label: 'Active' }, { value: 'achieved', label: 'Achieved' }, { value: 'missed', label: 'Missed' }, { value: 'cancelled', label: 'Cancelled' }]} />
      </FilterBar>
      {d.goals.length === 0 ? <Card><EmptyState icon={Target} title="No goals match" description="Create a goal to start tracking progress." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.goals.map((g) => (
            <GoalSummary key={g.id} g={g} today={d.today} fmt={fmt}>
              <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
                {g.progressMode === 'manual' ? (
                  <FormDialog action={recordGoalProgressAction} title={`Update progress — ${g.title}`} trigger="Update progress" triggerVariant="secondary" triggerSize="sm" hidden={{ goalId: g.id }} size="sm">
                    <Input name="value" label={`Current value (${g.unit})`} required inputMode="decimal" defaultValue={g.current} />
                    <Textarea name="note" label="Note" rows={2} />
                  </FormDialog>
                ) : null}
                <FormDialog action={saveGoalAction} title="Edit goal" trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="lg">
                  <GoalFields {...opts} defaults={{ goalId: g.id, scope: g.scope, userId: g.userId, teamId: g.teamId, title: g.title, description: g.description, category: g.category, unit: g.unit, targetValue: g.target, startDate: g.startDate, endDate: g.endDate, responsibleUserId: g.responsibleId, progressMode: g.progressMode, metric: g.metric, metricParam: g.metricParam }} />
                </FormDialog>
                <FormDialog action={setGoalStatusAction} title="Change goal status" trigger="Status" triggerVariant="ghost" triggerSize="sm" hidden={{ goalId: g.id }} size="sm">
                  <Select name="status" label="Status" defaultValue={g.status} options={[{ value: 'active', label: 'Active' }, { value: 'achieved', label: 'Achieved' }, { value: 'missed', label: 'Missed' }, { value: 'cancelled', label: 'Cancelled' }]} />
                </FormDialog>
              </div>
            </GoalSummary>
          ))}
        </div>
      )}
      <Card className="mt-6"><CardBody>
        <MetricNote>Progress % = current ÷ target × 100 when the target is positive (a zero target counts as met; over-achievement is shown above 100%). Changing a target never deletes history: a snapshot is stored against the new target. “Recalculate & snapshot” stores a history point for every automatic goal whose value changed.</MetricNote>
      </CardBody></Card>
    </>
  );
}
