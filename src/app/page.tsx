import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth';

export default async function Home() {
  const s = await getSession();
  redirect(!s ? '/login' : s.role === 'admin' ? '/admin' : '/dashboard');
}
