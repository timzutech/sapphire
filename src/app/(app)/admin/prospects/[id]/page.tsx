import { ProspectDetail } from '@/components/prospect-detail';
import { adminPage } from '@/server/page';

export const metadata = { title: 'Prospect' };

export default async function AdminProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProspectDetail id={id} ctx={await adminPage()} back="/admin/prospects" />;
}
