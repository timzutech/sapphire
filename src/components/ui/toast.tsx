'use client';

import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ToastKind = 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi { success: (m?: string) => void; error: (m?: string) => void }

const Ctx = createContext<ToastApi>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind: ToastKind, message?: string) => {
    if (!message) return;
    const id = ++seq;
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
  }, [dismiss]);
  const api = useMemo(() => ({ success: (m?: string) => push('success', m), error: (m?: string) => push('error', m) }), [push]);
  return (
    <Ctx value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-white px-3.5 py-3 text-sm shadow-lg',
              t.kind === 'error' ? 'border-red-200' : 'border-emerald-200')}>
            {t.kind === 'error' ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />}
            <p className="flex-1 text-slate-800">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Dismiss notification">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx>
  );
}
