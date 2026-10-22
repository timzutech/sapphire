'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button';
import { ActionForm, SubmitButton, type ServerAction } from './form';

export function Dialog({
  trigger, triggerVariant = 'primary', triggerSize = 'md', triggerClassName, triggerLabel, title, description, children, size = 'md', open: openProp, onOpenChange,
}: {
  trigger?: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerLabel?: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  size?: 'sm' | 'md' | 'lg';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = useCallback((o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenState(o)), [onOpenChange]);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <>
      {trigger ? (
        <button type="button" aria-label={triggerLabel} className={buttonClass(triggerVariant, triggerSize, triggerClassName)} onClick={() => setOpen(true)}>
          {trigger}
        </button>
      ) : null}
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className={cn('m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-left shadow-2xl',
          size === 'sm' && 'max-w-md', size === 'md' && 'max-w-xl', size === 'lg' && 'max-w-3xl')}
      >
        {open ? (
          <div className="flex max-h-[92dvh] flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
                {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
              </div>
              <button type="button" onClick={close} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog">
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{typeof children === 'function' ? children(close) : children}</div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/** A dialog containing a server-action form; closes itself after a successful submission. */
export function FormDialog({
  action, title, description, trigger, triggerVariant, triggerSize, triggerClassName, triggerLabel, submitLabel = 'Save', submitVariant = 'primary', hidden, children, size,
}: {
  action: ServerAction;
  title: ReactNode;
  description?: ReactNode;
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerLabel?: string;
  submitLabel?: ReactNode;
  submitVariant?: ButtonVariant;
  hidden?: Record<string, string | number | undefined | null>;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen} title={title} description={description} trigger={trigger} triggerVariant={triggerVariant}
      triggerSize={triggerSize} triggerClassName={triggerClassName} triggerLabel={triggerLabel} size={size}>
      {(close) => (
        <ActionForm action={action} hidden={hidden} onSuccess={close} className="space-y-4">
          {children}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={close} className={buttonClass('secondary')}>Cancel</button>
            <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Dialog>
  );
}
