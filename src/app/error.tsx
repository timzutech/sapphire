'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function ErrorPage({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <main className="grid min-h-[60dvh] place-items-center p-6">
      <EmptyState icon={AlertTriangle} title="Something went wrong" description={`We couldn't load this page. Please try again.${error.digest ? ` (ref ${error.digest})` : ''}`}
        action={<Button onClick={reset}>Try again</Button>} />
    </main>
  );
}
