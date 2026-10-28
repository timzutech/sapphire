import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InteractionFields, ProspectFields } from '@/components/forms/prospect-forms';
import { StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { DefinitionList, EmptyState, PageHeader } from '@/components/ui/misc';
import { formatDate, formatDateTime, formatMoney, humanize } from '@/lib/format';
import { STAGE_LABELS } from '@/lib/validation/prospects';
import { addInteractionAction, saveProspectAction } from '@/server/actions/prospects';
import type { PageCtx } from '@/server/page';
import { memberOptions } from '@/server/queries/common';

export async function ProspectDetail({ id, ctx, back }: { id: string; ctx: PageCtx; back: string }) {
  const { session, fmt, load } = ctx;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await load(async (tx) => {
    const [p] = await tx`select p.*, p.next_follow_up::text as nf, p.last_contact_on::text as lc, u.full_name as owner_name, c.full_name as creator
      from prospects p left join users u on u.id = p.owner_id join users c on c.id = p.created_by where p.id = ${id}`;
    if (!p) return null;
    const history = await tx`select i.*, u.full_name from prospect_interactions i join users u on u.id = i.user_id where i.prospect_id = ${id} order by i.occurred_at desc`;
    const members = session.role === 'admin' ? await memberOptions(tx, session.officeId) : [];
    return { p, history, members };
  });
  if (!d) notFound();
  const { p } = d;
  const canEdit = session.role === 'admin' || p.owner_id === session.userId;
  return (
    <>
      <PageHeader eyebrow={<Link href={back} className="hover:underline">← Prospects</Link>} title={p.name}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={p.stage} label={STAGE_LABELS[p.stage as keyof typeof STAGE_LABELS]} />{p.archived_at ? <StatusBadge status="cancelled" label="Archived" /> : null}</span>}
        actions={canEdit ? (
          <>
            <FormDialog action={addInteractionAction} title="Log activity" trigger="Log activity" hidden={{ prospectId: p.id }} submitLabel="Save activity"><InteractionFields /></FormDialog>
            <FormDialog action={saveProspectAction} title="Edit prospect" trigger="Edit" triggerVariant="secondary" size="lg">
              <ProspectFields currency={fmt.currency} isAdmin={session.role === 'admin'} members={d.members} defaults={{
                id: p.id, name: p.name, phone: p.phone, email: p.email, source: p.source, stage: p.stage, estimatedValue: p.estimated_value,
                lastContactOn: p.lc, nextFollowUp: p.nf, nextAction: p.next_action, notes: p.notes, visibility: p.visibility, ownerId: p.owner_id,
              }} />
            </FormDialog>
          </>
        ) : <LinkButton href={back} variant="secondary">Back</LinkButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DefinitionList items={[
              { label: 'Phone', value: p.phone ?? '—' }, { label: 'Email', value: p.email ?? '—' }, { label: 'Source', value: p.source ?? '—' },
              { label: 'Owner', value: p.owner_name ?? 'Shared office pool' }, { label: 'Visibility', value: p.visibility === 'office' ? 'Shared with office' : 'Private' },
              { label: 'Estimated value', value: p.estimated_value ? formatMoney(p.estimated_value, fmt) : '—' },
              { label: 'Last contact', value: p.lc ? formatDate(p.lc, fmt.locale) : 'Never' }, { label: 'Next follow-up', value: p.nf ? formatDate(p.nf, fmt.locale) : '—' },
              { label: 'Next action', value: p.next_action ?? '—' }, { label: 'Added', value: `${formatDateTime(p.created_at, fmt)} by ${p.creator}` },
            ]} />
            {p.notes ? <p className="mt-4 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{p.notes}</p> : null}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Interaction history" />
          <CardBody>
            {d.history.length === 0 ? <EmptyState compact title="No activity yet" /> : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {d.history.map((h) => (
                  <li key={h.id}>
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-brand-400" />
                    <p className="text-sm text-slate-900"><span className="font-medium">{humanize(h.kind)}</span> — {h.summary}</p>
                    <p className="text-xs text-slate-500">{h.full_name} · {formatDateTime(h.occurred_at, fmt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
