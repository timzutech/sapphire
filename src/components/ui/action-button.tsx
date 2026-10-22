'use client';

import type { ReactNode } from 'react';
import type { ButtonSize, ButtonVariant } from './button';
import { FormDialog } from './dialog';
import { ActionForm, SubmitButton, Textarea, type ServerAction } from './form';

/**
 * One-click server action with hidden fields. With `confirm`, opens a confirmation dialog first;
 * with `reasonName`, the dialog collects a required reason (used for audited actions).
 */
export function ActionButton({
  action, fields, children, variant = 'secondary', size = 'sm', confirm, confirmTitle, confirmLabel, reasonName, reasonLabel = 'Reason', label, className,
}: {
  action: ServerAction;
  fields: Record<string, string | number | undefined | null>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: ReactNode;
  confirmTitle?: string;
  confirmLabel?: string;
  reasonName?: string;
  reasonLabel?: string;
  label?: string;
  className?: string;
}) {
  if (confirm || reasonName) {
    return (
      <FormDialog action={action} hidden={fields} title={confirmTitle ?? 'Are you sure?'} trigger={children} triggerVariant={variant} triggerSize={size}
        triggerLabel={label} triggerClassName={className} submitLabel={confirmLabel ?? 'Confirm'} submitVariant={variant === 'danger' ? 'danger' : 'primary'} size="sm">
        {confirm ? <div className="text-sm text-slate-600">{confirm}</div> : null}
        {reasonName ? <Textarea name={reasonName} label={reasonLabel} required rows={3} /> : null}
      </FormDialog>
    );
  }
  return (
    <ActionForm action={action} hidden={fields} className="inline-flex">
      <SubmitButton variant={variant} size={size} className={className}>
        {label ? <span className="sr-only">{label}</span> : null}
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
