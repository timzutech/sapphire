'use client';

import {
  BarChart3, Bell, Building2, CalendarCheck, CalendarDays, ClipboardList, FileText, Gauge, Gavel, Landmark, LayoutDashboard, LogOut,
  Megaphone, Menu, Receipt, ScrollText, Settings, Target, Trophy, User, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { logoutAction, switchOfficeAction } from '@/server/actions/account';

interface Item { href: string; label: string; icon: LucideIcon; badge?: number; exact?: boolean }
interface Group { label?: string; items: Item[] }

const ICONS = {
  dashboard: LayoutDashboard, attendance: CalendarCheck, money: Wallet, prospects: Users, tasks: ClipboardList, goals: Target, challenges: Trophy,
  fines: Gavel, plan: CalendarDays, notifications: Bell, profile: User, overview: Gauge, members: Users, finances: Landmark, expenses: Receipt,
  analytics: BarChart3, announcements: Megaphone, settings: Settings, audit: ScrollText, platform: Building2, reports: FileText,
};

export interface ShellProps {
  fullName: string;
  email: string;
  role: 'admin' | 'member';
  isSuper: boolean;
  officeName: string;
  officeId: string;
  offices: { id: string; name: string }[];
  unread: number;
  pendingApprovals: number;
  isDemo: boolean;
}

function groupsFor(p: ShellProps): Group[] {
  const member: Item[] = [
    { href: '/dashboard', label: 'My Dashboard', icon: ICONS.dashboard },
    { href: '/attendance', label: 'Attendance', icon: ICONS.attendance },
    { href: '/money', label: 'My Money', icon: ICONS.money },
    { href: '/prospects', label: 'My Prospects', icon: ICONS.prospects },
    { href: '/tasks', label: 'My Tasks', icon: ICONS.tasks },
    { href: '/goals', label: 'My Goals', icon: ICONS.goals },
    { href: '/challenges', label: 'Challenges', icon: ICONS.challenges },
    { href: '/fines', label: 'My Fines', icon: ICONS.fines },
    { href: '/plan', label: 'Office Plan', icon: ICONS.plan },
    { href: '/notifications', label: 'Notifications', icon: ICONS.notifications, badge: p.unread },
    { href: '/profile', label: 'My Profile', icon: ICONS.profile },
  ];
  if (p.role !== 'admin') return [{ items: member }];
  const groups: Group[] = [
    {
      label: 'Management',
      items: [
        { href: '/admin', label: 'Overview', icon: ICONS.overview, exact: true, badge: p.pendingApprovals },
        { href: '/admin/members', label: 'Members', icon: ICONS.members },
        { href: '/admin/prospects', label: 'Prospects', icon: ICONS.prospects },
        { href: '/admin/tasks', label: 'Tasks', icon: ICONS.tasks },
        { href: '/admin/attendance', label: 'Attendance', icon: ICONS.attendance },
        { href: '/admin/plans', label: 'Office Plan', icon: ICONS.plan },
        { href: '/admin/goals', label: 'Goals', icon: ICONS.goals },
        { href: '/admin/challenges', label: 'Challenges', icon: ICONS.challenges },
      ],
    },
    {
      label: 'Money',
      items: [
        { href: '/admin/finances', label: 'Office Finances', icon: ICONS.finances },
        { href: '/admin/expenses', label: 'Expenses', icon: ICONS.expenses },
        { href: '/admin/fines', label: 'Fines', icon: ICONS.fines },
      ],
    },
    {
      label: 'Insights & admin',
      items: [
        { href: '/admin/analytics', label: 'Analytics & Reports', icon: ICONS.analytics },
        { href: '/admin/announcements', label: 'Announcements', icon: ICONS.announcements },
        { href: '/admin/settings', label: 'Settings', icon: ICONS.settings },
        { href: '/admin/audit', label: 'Audit Log', icon: ICONS.audit },
      ],
    },
    { label: 'My workspace', items: member },
  ];
  if (p.isSuper) groups.push({ label: 'Platform', items: [{ href: '/super', label: 'Offices', icon: ICONS.platform }] });
  return groups;
}

function NavList({ groups, onNavigate }: { groups: Group[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {groups.map((g, i) => (
        <div key={i}>
          {g.label ? <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</div> : null}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(`${it.href}/`);
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link href={it.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors',
                      active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                    <Icon className={cn('size-4 shrink-0', active ? 'text-brand-600' : 'text-slate-400')} aria-hidden />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge ? <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{it.badge > 99 ? '99+' : it.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function OfficeBlock(p: ShellProps) {
  return (
    <div className="px-3 pb-3">
      {p.offices.length > 1 ? (
        <form action={switchOfficeAction}>
          <label htmlFor="office-switch" className="sr-only">Switch office</label>
          <select id="office-switch" name="officeId" defaultValue={p.officeId} onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800">
            {p.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </form>
      ) : (
        <div className="truncate rounded-lg bg-slate-50 px-2.5 py-2 text-sm font-medium text-slate-700" title={p.officeName}>{p.officeName}</div>
      )}
      {p.isDemo ? <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">Demo office · sample data</p> : null}
    </div>
  );
}

function UserBlock(p: ShellProps) {
  return (
    <div className="flex items-center gap-2.5 border-t border-slate-200 p-3">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials(p.fullName)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{p.fullName}</div>
        <div className="truncate text-xs text-slate-500">{p.role === 'admin' ? 'Administrator' : 'Member'}</div>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-5 py-4 text-base font-semibold text-slate-900">
      <img src="/icon.svg" alt="" className="size-7" /> OfficeHub
    </Link>
  );
}

export function Sidebar(p: ShellProps) {
  const groups = groupsFor(p);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <Brand />
        <OfficeBlock {...p} />
        <NavList groups={groups} />
        <UserBlock {...p} />
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
        <Link href="/" className="flex items-center gap-2 font-semibold"><img src="/icon.svg" alt="" className="size-6" />OfficeHub</Link>
        <Link href="/notifications" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications${p.unread ? `, ${p.unread} unread` : ''}`}>
          <Bell className="size-5" />
          {p.unread ? <span className="absolute right-1 top-1 size-2 rounded-full bg-red-500" /> : null}
        </Link>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close menu"><X className="size-5" /></button>
            </div>
            <OfficeBlock {...p} />
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
            <UserBlock {...p} />
          </div>
        </div>
      ) : null}
    </>
  );
}
