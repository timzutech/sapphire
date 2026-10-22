import { requireAdmin } from '@/server/auth';

/** Every /admin route is gated server-side; the database enforces the same rules via RLS. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
