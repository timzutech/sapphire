import { ProspectDetail } from '@/components/prospect-detail';
import { memberPage } from '@/server/page';

export const metadata = { title: 'Prospect' };

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProspectDetail id={id} ctx={await memberPage()} back="/prospects" />;
}
