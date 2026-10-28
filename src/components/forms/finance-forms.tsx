'use client';

import { useState } from 'react';
import { Checkbox, FormGrid, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';

type Opt = { value: string; label: string; kind?: string };

export interface TxnDefaults {
  txnId?: string; type?: string; accountId?: string; toAccountId?: string | null; amount?: string; categoryId?: string | null;
  txnDate?: string; description?: string; notes?: string | null; status?: string;
}

/** Personal transaction fields; category list and destination account follow the chosen type. */
export function PersonalTxnFields({ accounts, categories, today, currency, defaults = {}, token }: {
  accounts: Opt[]; categories: Opt[]; today: string; currency: string; defaults?: TxnDefaults; token: string;
}) {
  const [type, setType] = useState(defaults.type ?? 'income');
  return (
    <>
      <input type="hidden" name="clientToken" value={token} />
      {defaults.txnId ? <input type="hidden" name="txnId" value={defaults.txnId} /> : null}
      <FormGrid>
        <Select name="type" label="Type" required value={type} onChange={(e) => setType(e.target.value)}
          options={[{ value: 'income', label: 'Income earned' }, { value: 'expense', label: 'Expense incurred' }, { value: 'transfer', label: 'Transfer / move to savings' }]} />
        <MoneyInput name="amount" label="Amount" required currency={currency} defaultValue={defaults.amount} />
        <Select name="accountId" label={type === 'transfer' ? 'From account' : 'Account'} required options={accounts} defaultValue={defaults.accountId} />
        {type === 'transfer' ? (
          <Select name="toAccountId" label="To account" required options={accounts} defaultValue={defaults.toAccountId ?? accounts.find((a) => a.label.toLowerCase().includes('saving'))?.value} />
        ) : (
          <Select name="categoryId" label="Category" options={categories.filter((c) => c.kind === type)} placeholder="Uncategorised" defaultValue={defaults.categoryId ?? ''} />
        )}
        <Input name="txnDate" type="date" label="Date" required defaultValue={defaults.txnDate ?? today} max={today} />
        <Input name="description" label="Description" required maxLength={200} defaultValue={defaults.description} placeholder={type === 'income' ? 'e.g. Commission from Bola’s order' : type === 'expense' ? 'e.g. Transport to client' : 'e.g. Weekly savings'} />
      </FormGrid>
      <Textarea name="notes" label="Notes" rows={2} defaultValue={defaults.notes ?? ''} />
      {type !== 'transfer' ? (
        <Checkbox name="submit" label="Submit for verification" defaultChecked={defaults.status === 'pending'}
          hint="An administrator verifies the record. Verified income counts towards challenges that require verification. Verified records are locked." />
      ) : <p className="text-xs text-slate-500">Transfers move money between your own accounts. They are not counted as income or expenses.</p>}
    </>
  );
}

export function OfficeTxnFields({ accounts, categories, today, currency }: { accounts: Opt[]; categories: Opt[]; today: string; currency: string }) {
  const [type, setType] = useState('income');
  return (
    <>
      <FormGrid>
        <Select name="type" label="Type" required value={type} onChange={(e) => setType(e.target.value)}
          options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'transfer', label: 'Transfer between accounts' }, { value: 'adjustment', label: 'Reconciliation adjustment' }]} />
        <MoneyInput name="amount" label="Amount" required currency={currency} />
        <Select name="accountId" label={type === 'transfer' ? 'From account' : 'Account'} required options={accounts} />
        {type === 'transfer' ? <Select name="toAccountId" label="To account" required options={accounts} /> : null}
        {type === 'income' || type === 'expense' ? <Select name="categoryId" label="Category" required options={categories.filter((c) => c.kind === type)} placeholder="Choose…" /> : null}
        {type === 'adjustment' ? <Select name="direction" label="Direction" options={[{ value: '1', label: 'Increase balance' }, { value: '-1', label: 'Decrease balance' }]} /> : null}
        <Input name="txnDate" type="date" label="Date" required defaultValue={today} max={today} />
        <Input name="reference" label="Reference" placeholder="Receipt / transfer ref" maxLength={80} />
        <Input name="counterparty" label={type === 'income' ? 'Received from' : 'Paid to'} maxLength={120} />
        <Input name="description" label="Description" required maxLength={200} wrapperClassName="sm:col-span-2" />
      </FormGrid>
      <Textarea name="notes" label="Notes" rows={2} />
      {type === 'adjustment' ? <p className="text-xs text-slate-500">Use adjustments only to reconcile the recorded balance with a counted/bank balance. They are not counted as income or expenses.</p> : null}
    </>
  );
}

export function ExpenseFields({ categories, members, today, currency, defaults = {}, showResponsible = true }: {
  categories: Opt[]; members?: Opt[]; today: string; currency: string; showResponsible?: boolean;
  defaults?: { expenseId?: string; title?: string; categoryId?: string; amount?: string; expenseDate?: string; paymentMethod?: string | null; responsibleUserId?: string | null; vendor?: string | null; description?: string | null };
}) {
  return (
    <>
      {defaults.expenseId ? <input type="hidden" name="expenseId" value={defaults.expenseId} /> : null}
      <FormGrid>
        <Input name="title" label="Title" required maxLength={160} defaultValue={defaults.title} wrapperClassName="sm:col-span-2" />
        <Select name="categoryId" label="Category" required options={categories} placeholder="Choose…" defaultValue={defaults.categoryId ?? ''} />
        <MoneyInput name="amount" label="Amount" required currency={currency} defaultValue={defaults.amount} />
        <Input name="expenseDate" type="date" label="Date" required defaultValue={defaults.expenseDate ?? today} max={today} />
        <Select name="paymentMethod" label="Payment method" placeholder="—" defaultValue={defaults.paymentMethod ?? ''}
          options={['Cash', 'Transfer', 'POS / card', 'Mobile money', 'Other'].map((v) => ({ value: v, label: v }))} />
        <Input name="vendor" label="Vendor / recipient" maxLength={120} defaultValue={defaults.vendor ?? ''} />
        {showResponsible && members ? <Select name="responsibleUserId" label="Person responsible" options={members} placeholder="—" defaultValue={defaults.responsibleUserId ?? ''} /> : null}
      </FormGrid>
      <Textarea name="description" label="Description" rows={2} defaultValue={defaults.description ?? ''} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="receipt" className="text-xs font-medium text-slate-700">Receipt (PDF, PNG, JPEG or WebP, max 5 MB)</label>
        <input id="receipt" type="file" name="receipt" accept="application/pdf,image/png,image/jpeg,image/webp"
          className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200" />
      </div>
      <Checkbox name="submit" label="Submit for approval now" defaultChecked hint="Leave unticked to save as a draft you can edit later." />
    </>
  );
}
