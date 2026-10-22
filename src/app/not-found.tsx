import { FileQuestion } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <EmptyState icon={FileQuestion} title="Page not found" description="The page you are looking for does not exist or you do not have access to it." action={<LinkButton href="/">Go to my dashboard</LinkButton>} />
    </main>
  );
}
