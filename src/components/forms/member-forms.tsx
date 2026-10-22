'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormGrid, Input, Select } from '@/components/ui/form';

/** Generates a readable temporary password that satisfies the password policy. */
function tempPassword() {
  const words = ['Lagos', 'Sunrise', 'Falcon', 'Harbor', 'Summit', 'Maple', 'Orbit', 'Cedar'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}-${Math.random().toString(36).slice(2, 6)}`;
}

export function TempPasswordInput({ label = 'Temporary password' }: { label?: string }) {
  const [v, setV] = useState('');
  return (
    <div className="flex items-end gap-2">
      <Input name="tempPassword" label={label} required value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" wrapperClassName="flex-1"
        hint="Share it privately. The member must change it at first sign-in." />
      <Button variant="secondary" onClick={() => setV(tempPassword())} className="mb-[22px]">Generate</Button>
    </div>
  );
}

export function MemberFields({ teams, defaults = {}, create, today }: {
  teams: { value: string; label: string }[]; create?: boolean; today: string;
  defaults?: { membershipId?: string; fullName?: string; email?: string; phone?: string | null; role?: string; teamId?: string | null; title?: string | null; joinedOn?: string };
}) {
  return (
    <>
      {defaults.membershipId ? <input type="hidden" name="membershipId" value={defaults.membershipId} /> : null}
      <FormGrid>
        <Input name="fullName" label="Full name" required defaultValue={defaults.fullName} />
        <Input name="email" type="email" label="Email (sign-in)" required defaultValue={defaults.email} autoComplete="off" />
        <Input name="phone" type="tel" label="Phone" defaultValue={defaults.phone ?? ''} />
        <Input name="title" label="Job title" defaultValue={defaults.title ?? ''} maxLength={80} />
        <Select name="role" label="Role" options={[{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Office administrator' }]} defaultValue={defaults.role ?? 'member'} />
        <Select name="teamId" label="Team" options={teams} placeholder="No team" defaultValue={defaults.teamId ?? ''} />
        <Input name="joinedOn" type="date" label="Joining date" required={!create} defaultValue={defaults.joinedOn ?? today} />
      </FormGrid>
      {create ? <TempPasswordInput /> : null}
    </>
  );
}
