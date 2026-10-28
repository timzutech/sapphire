import { Users } from 'lucide-react';
import Link from 'next/link';
import { InteractionFields, ProspectFields } from '@/components/forms/prospect-forms';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/badge';
import { FormDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDate, formatMoney } from '@/lib/format';
import { STAGE_LABELS } from '@/lib/validation/prospects';
import { addInteractionAction, archiveProspectAction, saveProspectAction } from '@/server/actions/prospects';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function ProspectTable({ rows, today, fmt, userId, isAdmin, showOwner, members, selectable, basePath }: {
  rows: Row[]; today: string; fmt: { currency: string; locale: string }; userId: string; isAdmin: boolean; showOwner?: boolean;
  members?: { value: string; label: string }[]; selectable?: string; basePath: string;
}) {
  if (rows.length === 0) return <EmptyState icon={Users} title="No prospects match" description="Try a different view or filter, or add a new prospect." />;
  return (
    <Table>
      <THead>
        <tr>
          {selectable ? <Th><span className="sr-only">Select</span></Th> : null}
          <Th>Prospect</Th>{showOwner ? <Th>Owner</Th> : null}<Th>Stage</Th><Th>Next follow-up</Th><Th>Last contact</Th><Th align="right">Est. value</Th><Th align="right"><span className="sr-only">Actions</span></Th>
        </tr>
      </THead>
      <TBody>
        {rows.map((p) => {
          const canEdit = isAdmin || p.owner_id === userId;
          const overdue = p.nf && p.nf < today && !['converted', 'not_interested'].includes(p.stage);
          return (
            <Tr key={p.id}>
              {selectable ? <Td><input type="checkbox" name="prospectIds[]" value={p.id} form={selectable} aria-label={`Select ${p.name}`} className="size-4 accent-brand-600" /></Td> : null}
              <Td>
                <Link href={`${basePath}/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{p.name}</Link>
                <div className="text-xs text-slate-500">{[p.phone, p.email, p.source].filter(Boolean).join(' · ') || '—'}</div>
              </Td>
              {showOwner ? <Td className="text-xs">{p.owner_name ?? <span className="text-slate-400">Shared pool</span>}</Td> : null}
              <Td><StatusBadge status={p.stage} label={STAGE_LABELS[p.stage as keyof typeof STAGE_LABELS]} /></Td>
              <Td className={overdue ? 'font-medium text-red-700' : ''}>{p.nf ? formatDate(p.nf, fmt.locale, 'short') : '—'}{overdue ? ' · overdue' : ''}{p.next_action ? <div className="text-xs font-normal text-slate-500">{p.next_action}</div> : null}</Td>
              <Td className="text-xs">{p.lc ? formatDate(p.lc, fmt.locale, 'short') : 'Never'}</Td>
              <Td align="right">{p.estimated_value ? formatMoney(p.estimated_value, fmt, { compact: true }) : '—'}</Td>
              <Td align="right">
                {canEdit ? (
                  <div className="flex justify-end gap-1">
                    {!p.archived_at ? (
                      <FormDialog action={addInteractionAction} title={`Log activity — ${p.name}`} trigger="Log" triggerVariant="ghost" triggerSize="sm" hidden={{ prospectId: p.id }} submitLabel="Save activity">
                        <InteractionFields />
                      </FormDialog>
                    ) : null}
                    <FormDialog action={saveProspectAction} title="Edit prospect" trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="lg">
                      <ProspectFields currency={fmt.currency} isAdmin={isAdmin} members={members} defaults={{
                        id: p.id, name: p.name, phone: p.phone, email: p.email, source: p.source, stage: p.stage, estimatedValue: p.estimated_value,
                        lastContactOn: p.lc, nextFollowUp: p.nf, nextAction: p.next_action, notes: p.notes, visibility: p.visibility, ownerId: p.owner_id,
                      }} />
                    </FormDialog>
                    <ActionButton action={archiveProspectAction} fields={{ prospectId: p.id, archive: p.archived_at ? '0' : '1' }} variant="ghost">{p.archived_at ? 'Restore' : 'Archive'}</ActionButton>
                  </div>
                ) : <span className="text-xs text-slate-400">View only</span>}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
