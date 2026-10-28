'use client';

import { Loader2 } from 'lucide-react';
import {
  createContext, useActionState, useContext, useEffect, useId, useRef, useTransition,
  type ComponentProps, type FormEvent, type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import type { ActionState } from '@/server/action';
import { buttonClass, type ButtonVariant } from './button';
import { useToast } from './toast';

export type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface FormCtxValue { errors?: Record<string, string>; pending: boolean }
const FormCtx = createContext<FormCtxValue>({ pending: false });
export const useFormCtx = () => useContext(FormCtx);

/**
 * Submits to a server action without React's automatic form reset (so input survives validation errors),
 * shows field errors inline and toasts the result.
 */
export function ActionForm({
  action, children, className, hidden, onSuccess, resetOnSuccess = true, toastSuccess = true, id,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  hidden?: Record<string, string | number | undefined | null>;
  onSuccess?: (s: NonNullable<ActionState>) => void;
  resetOnSuccess?: boolean;
  toastSuccess?: boolean;
  id?: string;
}) {
  const [state, dispatch, actionPending] = useActionState(action, null);
  const [transitionPending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const pending = actionPending || transitionPending;

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (toastSuccess) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    } else if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.at]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <FormCtx value={{ errors, pending }}>
      <form ref={ref} id={id} onSubmit={onSubmit} className={className} noValidate>
        {hidden ? Object.entries(hidden).map(([k, v]) => (v === undefined || v === null ? null : <input key={k} type="hidden" name={k} value={String(v)} />)) : null}
        {state && !state.ok && errors && Object.keys(errors).length > 0 ? (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errors._form ?? state.error}
          </div>
        ) : null}
        {children}
      </form>
    </FormCtx>
  );
}

function FieldShell({ label, name, hint, required, children, className, error: errorOverride, id }: {
  label?: ReactNode; name: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string; error?: string; id: string;
}) {
  const { errors } = useFormCtx();
  const error = errorOverride ?? errors?.[name.replace(/\[\]$/, '')];
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={id} className="text-xs font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p id={`${id}-error`} className="text-xs text-red-600">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const controlClass = (invalid: boolean) =>
  cn('w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2',
    invalid ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100');

type InputProps = Omit<ComponentProps<'input'>, 'name'> & { name: string; label?: ReactNode; hint?: ReactNode; wrapperClassName?: string };

export function Input({ label, name, hint, required, wrapperClassName, className, id: idProp, ...props }: InputProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const { errors } = useFormCtx();
  const invalid = !!errors?.[name];
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} className={wrapperClassName} id={id}>
      <input id={id} name={name} required={required} aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(controlClass(invalid), 'h-9', className)} {...props} />
    </FieldShell>
  );
}

export function MoneyInput(props: InputProps & { currency?: string }) {
  const { currency, ...rest } = props;
  return <Input inputMode="decimal" autoComplete="off" placeholder={currency ? `0.00 ${currency}` : '0.00'} {...rest} />;
}

type SelectProps = Omit<ComponentProps<'select'>, 'name'> & {
  name: string; label?: ReactNode; hint?: ReactNode; options: { value: string; label: string }[]; placeholder?: string; wrapperClassName?: string;
};

export function Select({ label, name, hint, required, options, placeholder, wrapperClassName, className, id: idProp, ...props }: SelectProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const { errors } = useFormCtx();
  const invalid = !!errors?.[name];
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} className={wrapperClassName} id={id}>
      <select id={id} name={name} required={required} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
        className={cn(controlClass(invalid), 'h-9 pr-8', className)} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
}

type TextareaProps = Omit<ComponentProps<'textarea'>, 'name'> & { name: string; label?: ReactNode; hint?: ReactNode; wrapperClassName?: string };

export function Textarea({ label, name, hint, required, wrapperClassName, className, rows = 3, id: idProp, ...props }: TextareaProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const { errors } = useFormCtx();
  const invalid = !!errors?.[name];
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} className={wrapperClassName} id={id}>
      <textarea id={id} name={name} rows={rows} required={required} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
        className={cn(controlClass(invalid), 'py-2', className)} {...props} />
    </FieldShell>
  );
}

export function Checkbox({ label, name, hint, defaultChecked, value, className }: { label: ReactNode; name: string; hint?: ReactNode; defaultChecked?: boolean; value?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-slate-300 accent-brand-600" />
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </label>
    </div>
  );
}

/** Multi-select rendered as a scrollable checkbox list (keyboard accessible, mobile friendly). */
export function CheckboxList({ label, name, options, defaultValues = [], hint, required }: {
  label: ReactNode; name: string; options: { value: string; label: string; meta?: string }[]; defaultValues?: string[]; hint?: ReactNode; required?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell label={label} name={name} hint={hint} required={required} id={id}>
      <div id={id} role="group" className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
        {options.length === 0 ? <p className="p-2 text-xs text-slate-500">No options available.</p> : null}
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
            <input type="checkbox" name={`${name}[]`} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="size-4 rounded border-slate-300 accent-brand-600" />
            <span className="flex-1 text-slate-800">{o.label}</span>
            {o.meta ? <span className="text-xs text-slate-500">{o.meta}</span> : null}
          </label>
        ))}
      </div>
    </FieldShell>
  );
}

export function SubmitButton({ children, variant = 'primary', size, className, name, value }: { children: ReactNode; variant?: ButtonVariant; size?: 'sm' | 'md'; className?: string; name?: string; value?: string }) {
  const { pending } = useFormCtx();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cn('grid grid-cols-1 gap-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>{children}</div>;
}
