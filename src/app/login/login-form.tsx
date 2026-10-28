'use client';

import { ActionForm, Input, SubmitButton } from '@/components/ui/form';
import { loginAction } from './actions';

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={loginAction} hidden={{ next }} resetOnSuccess={false} toastSuccess={false} className="space-y-4">
      <Input name="email" type="email" label="Email" autoComplete="email" required autoFocus />
      <Input name="password" type="password" label="Password" autoComplete="current-password" required />
      <SubmitButton className="w-full">Sign in</SubmitButton>
    </ActionForm>
  );
}
