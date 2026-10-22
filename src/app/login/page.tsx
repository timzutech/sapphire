import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/');
  const { next } = await searchParams;
  const demo = process.env.SHOW_DEMO_LOGINS === 'true';
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5 text-lg font-semibold">
          <img src="/icon.svg" alt="" className="size-8" /> OfficeHub
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-tight">Run your office on real numbers.</h1>
          <p className="mt-4 max-w-md text-brand-100">Attendance, prospecting, tasks, goals, challenges and finances — with clear accountability for every member and every naira.</p>
        </div>
        <p className="text-sm text-brand-200">Who is active? What is each member doing? Are we meeting our goals? Where is the money going?</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold lg:hidden">
            <img src="/icon.svg" alt="" className="size-8" /> OfficeHub
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use the account your office administrator created for you.</p>
          <div className="mt-6"><LoginForm next={next} /></div>
          <p className="mt-6 text-xs text-slate-500">Forgot your password? Ask your office administrator to issue a temporary password.</p>
          {demo ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">Demo environment (sample data)</p>
              <p className="mt-1">Admin: admin@demo.officehub.test · Member: ada@demo.officehub.test · Password: Password123!</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
