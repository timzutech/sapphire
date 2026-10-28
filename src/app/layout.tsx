import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'OfficeHub', template: '%s · OfficeHub' },
  description: 'Office management, attendance, prospecting, goals and finances in one place.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#256abf' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
